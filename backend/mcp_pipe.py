"""
DHsystem MCP Pipe — WebSocket ↔ stdio Bridge cho Xiaozhi.me

Kết nối MCP tools của DHsystem đến Xiaozhi.me qua WebSocket.
Dựa trên mẫu tham chiếu: https://github.com/78/mcp-calculator

Cách sử dụng:
    1. Lấy MCP_ENDPOINT (WSS URL) từ xiaozhi.me Console
    2. Set biến môi trường:
        export MCP_ENDPOINT=wss://your-xiaozhi-wss-url
        # Windows PowerShell: $env:MCP_ENDPOINT = "wss://your-xiaozhi-wss-url"
    3. Chạy:
        python mcp_pipe.py                      # Chạy tất cả servers từ mcp_config.json
        python mcp_pipe.py knowledge_server.py   # Chạy 1 server cụ thể

Config:
    Ưu tiên: $MCP_CONFIG → ./mcp_config.json
"""

import asyncio
import websockets
import subprocess
import logging
import os
import signal
import sys
import json
import io
from dotenv import load_dotenv

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Auto-load .env
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("DHsystem.MCP_PIPE")

# Reconnection settings
INITIAL_BACKOFF = 1    # Thời gian chờ ban đầu (giây)
MAX_BACKOFF = 600      # Thời gian chờ tối đa (giây)


# ─── WebSocket ↔ Process Pipe ──────────────────────────────────────────────

async def connect_with_retry(uri: str, target: str):
    """Kết nối WebSocket với cơ chế auto-retry exponential backoff."""
    reconnect_attempt = 0
    backoff = INITIAL_BACKOFF

    while True:  # Vòng lặp kết nối vĩnh viễn
        try:
            if reconnect_attempt > 0:
                logger.info(
                    f"[{target}] Chờ {backoff}s trước lần kết nối lại #{reconnect_attempt}..."
                )
                await asyncio.sleep(backoff)

            await connect_to_server(uri, target)

            # Reset backoff khi kết nối thành công
            backoff = INITIAL_BACKOFF
            reconnect_attempt = 0

        except Exception as e:
            reconnect_attempt += 1
            logger.warning(
                f"[{target}] Kết nối đóng (lần {reconnect_attempt}): {e}"
            )
            # Tăng thời gian chờ theo hàm mũ
            backoff = min(backoff * 2, MAX_BACKOFF)


async def connect_to_server(uri: str, target: str):
    """Kết nối WebSocket và pipe stdio cho server target."""
    process = None
    try:
        logger.info(f"[{target}] Đang kết nối WebSocket: {uri[:60]}...")
        async with websockets.connect(uri) as websocket:
            logger.info(f"[{target}] ✅ Kết nối WebSocket thành công!")

            # Khởi động MCP server process
            cmd, env = build_server_command(target)
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                encoding="utf-8",
                text=True,
                env=env,
            )
            logger.info(f"[{target}] Đã khởi động process: {' '.join(cmd)}")

            # Chạy 3 pipe song song
            await asyncio.gather(
                pipe_websocket_to_process(websocket, process, target),
                pipe_process_to_websocket(process, websocket, target),
                pipe_process_stderr_to_terminal(process, target),
            )

    except websockets.exceptions.ConnectionClosed as e:
        logger.error(f"[{target}] WebSocket đóng: {e}")
        raise
    except Exception as e:
        logger.error(f"[{target}] Lỗi kết nối: {e}")
        raise
    finally:
        if process is not None:
            logger.info(f"[{target}] Đang dừng server process...")
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            logger.info(f"[{target}] Server process đã dừng")


async def pipe_websocket_to_process(websocket, process, target: str):
    """Đọc từ WebSocket → ghi vào process stdin."""
    try:
        while True:
            message = await websocket.recv()
            logger.debug(f"[{target}] << {str(message)[:120]}...")

            if isinstance(message, bytes):
                message = message.decode("utf-8")

            process.stdin.write(message + "\n")
            process.stdin.flush()
    except Exception as e:
        logger.error(f"[{target}] Lỗi WS→Process pipe: {e}")
        raise
    finally:
        if not process.stdin.closed:
            process.stdin.close()


async def pipe_process_to_websocket(process, websocket, target: str):
    """Đọc từ process stdout → gửi ra WebSocket."""
    try:
        while True:
            data = await asyncio.to_thread(process.stdout.readline)
            if not data:
                logger.info(f"[{target}] Process stdout kết thúc")
                break

            logger.debug(f"[{target}] >> {data[:120]}...")
            await websocket.send(data)
    except Exception as e:
        logger.error(f"[{target}] Lỗi Process→WS pipe: {e}")
        raise


async def pipe_process_stderr_to_terminal(process, target: str):
    """Đọc từ process stderr → in ra terminal (debug log)."""
    try:
        while True:
            data = await asyncio.to_thread(process.stderr.readline)
            if not data:
                logger.info(f"[{target}] Process stderr kết thúc")
                break

            sys.stderr.write(data)
            sys.stderr.flush()
    except Exception as e:
        logger.error(f"[{target}] Lỗi stderr pipe: {e}")
        raise


# ─── Config & Command Builder ──────────────────────────────────────────────

def load_config() -> dict:
    """Load JSON config từ $MCP_CONFIG hoặc ./mcp_config.json."""
    path = os.environ.get("MCP_CONFIG") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "mcp_config.json"
    )
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Không load được config {path}: {e}")
        return {}


def build_server_command(target: str = None) -> tuple[list[str], dict]:
    """
    Tạo command + env cho server process.

    Ưu tiên:
    - Nếu target là tên server trong mcp_config.json: dùng config
    - Ngược lại: coi target là đường dẫn Python script
    """
    if target is None:
        assert len(sys.argv) >= 2, "Thiếu tên server hoặc đường dẫn script"
        target = sys.argv[1]

    cfg = load_config()
    servers = cfg.get("mcpServers", {}) if isinstance(cfg, dict) else {}

    if target in servers:
        entry = servers[target] or {}
        if entry.get("disabled"):
            raise RuntimeError(f"Server '{target}' đã bị disabled trong config")

        typ = (entry.get("type") or entry.get("transportType") or "stdio").lower()

        # Environment cho process con
        child_env = os.environ.copy()
        for k, v in (entry.get("env") or {}).items():
            child_env[str(k)] = str(v)

        if typ == "stdio":
            command = entry.get("command")
            args = entry.get("args") or []
            if not command:
                raise RuntimeError(f"Server '{target}' thiếu 'command'")
            return [command, *args], child_env

        if typ in ("sse", "http", "streamablehttp"):
            url = entry.get("url")
            if not url:
                raise RuntimeError(f"Server '{target}' (type {typ}) thiếu 'url'")
            # Dùng mcp-proxy để bridge SSE/HTTP → stdio
            cmd = [sys.executable, "-m", "mcp_proxy"]
            if typ in ("http", "streamablehttp"):
                cmd += ["--transport", "streamablehttp"]
            # Optional headers
            headers = entry.get("headers") or {}
            for hk, hv in headers.items():
                cmd += ["-H", hk, str(hv)]
            cmd.append(url)
            return cmd, child_env

        raise RuntimeError(f"Loại transport không hỗ trợ: {typ}")

    # Fallback: coi target là path script Python
    script_path = target
    if not os.path.isabs(script_path):
        # Resolve relative to this script's directory
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), script_path
        )

    if not os.path.exists(script_path):
        raise RuntimeError(
            f"'{target}' không phải server trong config, cũng không tồn tại như script"
        )
    return [sys.executable, script_path], os.environ.copy()


# ─── Signal Handler ────────────────────────────────────────────────────────

def signal_handler(sig, frame):
    """Xử lý Ctrl+C."""
    logger.info("Nhận tín hiệu dừng, đang tắt...")
    sys.exit(0)


# ─── Entry Point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)

    # Lấy MCP_ENDPOINT
    endpoint_url = os.environ.get("MCP_ENDPOINT")
    if not endpoint_url:
        print()
        print("=" * 60)
        print("  DHsystem MCP Pipe — Kết nối Xiaozhi.me")
        print("=" * 60)
        print()
        print("  ❌ Chưa cấu hình MCP_ENDPOINT!")
        print()
        print("  Hướng dẫn:")
        print("    1. Đăng nhập xiaozhi.me → Console")
        print("    2. Tạo MCP connection, lấy WSS URL")
        print("    3. Set biến môi trường:")
        print()
        print('    Windows:  $env:MCP_ENDPOINT = "wss://your-wss-url"')
        print('    Linux:    export MCP_ENDPOINT="wss://your-wss-url"')
        print("    .env:     MCP_ENDPOINT=wss://your-wss-url")
        print()
        print("  Hoặc thêm vào file backend/.env")
        print("=" * 60)
        sys.exit(1)

    # Xác định target
    target_arg = sys.argv[1] if len(sys.argv) >= 2 else None

    print()
    print("=" * 60)
    print("  DHsystem MCP Pipe — Kết nối Xiaozhi.me")
    print("=" * 60)
    print(f"  Endpoint: {endpoint_url[:50]}...")
    if target_arg:
        print(f"  Target:   {target_arg}")
    else:
        print("  Mode:     Tất cả servers từ mcp_config.json")
    print("=" * 60)
    print()

    async def _main():
        if not target_arg:
            # Chạy tất cả servers từ config
            cfg = load_config()
            servers_cfg = cfg.get("mcpServers") or {}
            all_servers = list(servers_cfg.keys())
            enabled = [
                name
                for name, entry in servers_cfg.items()
                if not (entry or {}).get("disabled")
            ]
            skipped = [name for name in all_servers if name not in enabled]

            if skipped:
                logger.info(f"Bỏ qua servers disabled: {', '.join(skipped)}")
            if not enabled:
                raise RuntimeError(
                    "Không tìm thấy server nào enabled trong mcp_config.json"
                )

            logger.info(f"Khởi động servers: {', '.join(enabled)}")
            tasks = [
                asyncio.create_task(connect_with_retry(endpoint_url, t))
                for t in enabled
            ]
            await asyncio.gather(*tasks)
        else:
            # Chạy 1 server cụ thể
            await connect_with_retry(endpoint_url, target_arg)

    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        logger.info("Dừng bởi người dùng (Ctrl+C)")
    except Exception as e:
        logger.error(f"Lỗi: {e}")
        sys.exit(1)
