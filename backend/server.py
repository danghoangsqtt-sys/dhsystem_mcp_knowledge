"""
DHsystem MCP Knowledge Hub - Unified Server

Chạy đồng thời 2 server:
  1. MCP Server (HTTP+SSE :8000) → xiaozhi.me hoặc bất kỳ MCP client nào
  2. Xiaozhi WebSocket Bridge (:8765) → kết nối trực tiếp từ ESP32-S3 qua Gemini Live

Dùng lệnh: python server.py

Cổng:
  :8000/sse      → MCP endpoint (cho xiaozhi.me hoặc Claude Desktop)
  :8000/         → Health check
  :8765/xiaozhi/v1/ → WebSocket cho ESP32-S3 (thay thế xiaozhi.me)
"""
import asyncio
import logging
import sys
import io
import time
from typing import Any

import uvicorn
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import Tool, TextContent, CallToolResult, ListToolsResult
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route, Mount

from config import settings
from db import ensure_schema
from tools.knowledge import (
    search_knowledge_base,
    list_knowledge_bases,
    get_knowledge_base_info,
)

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ─── Logging setup ───────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("dhsystem")

# ─── MCP Server ──────────────────────────────────────────────────────────────
mcp_server = Server(settings.mcp_server_name)


@mcp_server.list_tools()
async def handle_list_tools() -> ListToolsResult:
    return ListToolsResult(
        tools=[
            Tool(
                name="search_knowledge_base",
                description=(
                    "Tim kiem thong tin trong kho kien thuc ca nhan bang AI semantic search. "
                    "Dung khi nguoi dung hoi ve tai lieu, thong tin da luu, kien thuc noi bo."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Cau hoi hoac tu khoa can tim"},
                        "kb_id": {"type": "string", "description": "ID kho kien thuc (tuy chon)"},
                        "top_k": {"type": "integer", "description": "So ket qua (mac dinh 5)", "default": 5},
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="list_knowledge_bases",
                description="Liet ke tat ca kho kien thuc hien co.",
                inputSchema={"type": "object", "properties": {}, "required": []},
            ),
            Tool(
                name="get_knowledge_base_info",
                description="Lay thong tin chi tiet ve mot kho kien thuc.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "kb_id": {"type": "string", "description": "UUID cua knowledge base"},
                    },
                    "required": ["kb_id"],
                },
            ),
        ]
    )


@mcp_server.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any]) -> CallToolResult:
    logger.info(f"MCP tool call: {name}({list(arguments.keys())})")
    try:
        if name == "search_knowledge_base":
            result = await search_knowledge_base(
                query=arguments["query"],
                kb_id=arguments.get("kb_id"),
                top_k=arguments.get("top_k"),
            )
            text = (
                f"Tim thay {result['count']} ket qua:\n\n{result['context']}"
                if result["found"]
                else "Khong tim thay thong tin lien quan."
            )
            return CallToolResult(content=[TextContent(type="text", text=text)])

        elif name == "list_knowledge_bases":
            result = await list_knowledge_bases()
            if result["count"] == 0:
                text = "Chua co kho kien thuc nao."
            else:
                lines = [f"Co {result['count']} kho kien thuc:"]
                for kb in result["knowledge_bases"]:
                    lines.append(f"- {kb['title']}: {kb.get('description', '')}")
                text = "\n".join(lines)
            return CallToolResult(content=[TextContent(type="text", text=text)])

        elif name == "get_knowledge_base_info":
            result = await get_knowledge_base_info(kb_id=arguments["kb_id"])
            text = (
                f"Error: {result['error']}"
                if "error" in result
                else f"{result['title']} - {result.get('description', '')} ({result['document_count']} tai lieu)"
            )
            return CallToolResult(content=[TextContent(type="text", text=text)])

        else:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Tool '{name}' khong ton tai")],
                isError=True,
            )
    except Exception as e:
        logger.error(f"Tool error: {e}", exc_info=True)
        return CallToolResult(
            content=[TextContent(type="text", text=f"Loi: {str(e)}")],
            isError=True,
        )


# ─── HTTP Routes ──────────────────────────────────────────────────────────────
async def health_check(request: Request) -> JSONResponse:
    kbs = await list_knowledge_bases()
    return JSONResponse({
        "status": "ok",
        "server": settings.mcp_server_name,
        "version": "2.0.0",
        "knowledge_bases": kbs["count"],
        "endpoints": {
            "mcp_sse": f"http://{request.headers.get('host', 'localhost')}/sse",
            "health": f"http://{request.headers.get('host', 'localhost')}/",
            "esp32_ws": f"ws://localhost:{settings.ws_server_port}/xiaozhi/v1/",
        },
        "architecture": {
            "mode": "Hướng C: Gemini Live API + MCP Tools",
            "mcp_server": "HTTP SSE :8000 (cho xiaozhi.me hoac Claude Desktop)",
            "ws_bridge": f"WebSocket :{settings.ws_server_port} (cho ESP32-S3 truc tiep)",
            "llm": "Gemini Live API (STT + LLM + TTS tich hop)",
            "knowledge": "Appwrite + ChromaDB",
        },
    })

async def api_kb_list(request: Request) -> JSONResponse:
    """Lấy danh sách các lĩnh vực kiến thức"""
    kbs = await list_knowledge_bases()
    return JSONResponse(kbs)

async def api_upload(request: Request) -> JSONResponse:
    """Xử lý chunking và embedding tài liệu tải lên."""
    from ingest import ingest_file
    import os
    import shutil
    
    try:
        form = await request.form()
        file = form.get("file")
        kb_title = form.get("kb_title")
        
        if not file or not kb_title:
            return JSONResponse({"error": "Missing file or kb_title"}, status_code=400)
            
        # Save temp file
        temp_dir = "temp_uploads"
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        
        file_bytes = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(file_bytes)
            
        doc_id = await ingest_file(file_path=file_path, kb_title=str(kb_title))
        
        if os.path.exists(file_path):
            os.remove(file_path)
            
        return JSONResponse({"status": "success", "doc_id": doc_id, "kb_title": kb_title})
    except SystemExit:
        return JSONResponse({"error": "Lỗi trong quá trình xử lý Ingest"}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def ota_check(request: Request) -> JSONResponse:
    """Giả lập OTA Server của Xiaozhi — trả về WebSocket URL của DHsystem."""
    ip = request.headers.get("host", "192.168.1.xxx")
    ws_url = f"ws://{ip.split(':')[0]}:{settings.ws_server_port}/xiaozhi/v1/"
    now_ms = int(time.time() * 1000)
    return JSONResponse({
        "websocket": {
            "url": ws_url,
            "version": 3
        },
        "server_time": {
            "timestamp": now_ms,
            "timezone_offset": 420  # UTC+7 (Việt Nam)
        }
    })

async def ota_activate(request: Request) -> Response:
    """Bypass activation — trả về 200 OK cho mọi thiết bị."""
    return Response(status_code=200)

async def api_status(request: Request) -> JSONResponse:
    """API trạng thái hệ thống: thiết bị đang kết nối, trạng thái Gemini."""
    from xiaozhi_gemini_bridge import active_sessions
    devices = [s.to_status_dict() for s in active_sessions.values()]
    kbs = await list_knowledge_bases()
    return JSONResponse({
        "server": settings.mcp_server_name,
        "uptime_info": "running",
        "devices_online": len(devices),
        "devices": devices,
        "knowledge_bases": kbs["count"],
    })

async def api_search(request: Request) -> JSONResponse:
    """API Tìm kiếm knowledge base (cho Frontend RAG)."""
    try:
        body = await request.json()
        query = body.get("query", "")
        kb_id = body.get("kb_id")
        top_k = body.get("top_k", 5)
        
        if not query:
            return JSONResponse({"error": "Missing query"}, status_code=400)
        
        result = await search_knowledge_base(
            query=query,
            kb_id=kb_id if kb_id else None,
            top_k=top_k,
        )
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


def create_mcp_app() -> Starlette:
    sse_transport = SseServerTransport("/messages/")

    async def handle_sse(request: Request) -> Response:
        logger.info(f"MCP SSE connection from: {request.client}")
        async with sse_transport.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await mcp_server.run(
                streams[0], streams[1],
                mcp_server.create_initialization_options(),
            )
        return Response()

    return Starlette(routes=[
        Route("/", endpoint=health_check, methods=["GET"]),
        Route("/sse", endpoint=handle_sse, methods=["GET"]),
        Route("/ota/", endpoint=ota_check, methods=["POST", "GET"]),
        Route("/ota/activate", endpoint=ota_activate, methods=["POST"]),
        Route("/api/status", endpoint=api_status, methods=["GET"]),
        Route("/api/kb/list", endpoint=api_kb_list, methods=["GET"]),
        Route("/api/upload", endpoint=api_upload, methods=["POST"]),
        Route("/api/search", endpoint=api_search, methods=["POST"]),
        Mount("/messages/", app=sse_transport.handle_post_message),
    ])


# ─── Entry Point ──────────────────────────────────────────────────────────────
app = create_mcp_app()


async def run_ws_bridge():
    """Chạy WebSocket bridge cho ESP32 (Gemini Live)."""
    try:
        from xiaozhi_gemini_bridge import start_xiaozhi_ws_server
        await start_xiaozhi_ws_server(
            host=settings.mcp_server_host,
            port=settings.ws_server_port,
        )
    except ImportError as e:
        logger.warning(f"WebSocket bridge not available: {e}")
    except Exception as e:
        logger.error(f"WebSocket bridge error: {e}", exc_info=True)


if __name__ == "__main__":
    logger.info("=" * 65)
    logger.info("  DHsystem - Unified MCP + Gemini Live Server")
    logger.info("=" * 65)
    logger.info(f"  MCP SSE:    http://localhost:{settings.mcp_server_port}/sse")
    logger.info(f"  Health:     http://localhost:{settings.mcp_server_port}/")
    logger.info(f"  ESP32 WS:   ws://localhost:{settings.ws_server_port}/xiaozhi/v1/")
    logger.info("=" * 65)
    logger.info("")
    logger.info("  Ket noi ESP32-S3 (firmware custom) vao WebSocket Bridge")
    logger.info("  HOAC dang ky MCP SSE vao xiaozhi.me Console")
    logger.info("=" * 65)

    async def main():
        # Khởi tạo Database Schema Appwrite trước khi chạy server
        await ensure_schema()
        
        # Chạy WebSocket bridge trong background
        ws_task = asyncio.create_task(run_ws_bridge())

        # Chạy MCP HTTP server
        config = uvicorn.Config(
            "server:app",
            host=settings.mcp_server_host,
            port=settings.mcp_server_port,
            reload=False,
            log_level="info",
        )
        server_instance = uvicorn.Server(config)
        await server_instance.serve()

        ws_task.cancel()

    asyncio.run(main())
