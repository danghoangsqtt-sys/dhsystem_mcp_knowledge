"""
DHsystem - Xiaozhi WebSocket Protocol + Gemini Live API Bridge

Core server: nhận kết nối WebSocket từ ESP32-S3 (firmware Xiaozhi),
bridge audio sang Gemini Live API, trả về response âm thanh.

Luồng xử lý:
  ESP32-S3 → [Opus audio] → Server → [PCM 16kHz] → Gemini Live API
                                                           ↓ (LLM + tool calls)
  ESP32-S3 ← [Opus audio] ← Server ← [PCM 24kHz] ← Gemini Live API

Audio conversion: Opus ↔ PCM qua ffmpeg/opuslib
"""
import asyncio
import json
import logging
import uuid
import struct
import io
from typing import Optional, AsyncIterator

import websockets
from websockets.server import WebSocketServerProtocol
from google import genai
from google.genai import types

from config import settings
from tools.knowledge import search_knowledge_base, list_knowledge_bases, get_knowledge_base_info

logger = logging.getLogger("dhsystem.bridge")

# ─── Expression Protocol (DeskBuddy-style) ────────────────────────────────────
# Trạng thái cảm xúc gửi về ESP32 để hiển thị trên màn hình
EXPRESSION_IDLE = "idle"           # Mặt bình thường, mắt mở
EXPRESSION_LISTENING = "listening" # Mắt sáng, lắng nghe
EXPRESSION_THINKING = "thinking"   # Mắt quay quay, đang nghĩ
EXPRESSION_SPEAKING = "speaking"   # Miệng cử động
EXPRESSION_HAPPY = "happy"         # Cười
EXPRESSION_ERROR = "error"         # Mặt buồn
EXPRESSION_MUSIC = "music"         # Đang phát nhạc

# Registry: theo dõi thiết bị đang kết nối
active_sessions: dict[str, "XiaozhiGeminiSession"] = {}

# ─── Gemini Live API Config ───────────────────────────────────────────────────

# System Instruction cho Gemini - AI personality
SYSTEM_INSTRUCTION = """Bạn là DHsystem AI Assistant - trợ lý thông minh được tích hợp vào thiết bị ESP32-S3.

Nhiệm vụ chính của bạn:
1. Trả lời câu hỏi dựa trên kho kiến thức cá nhân (sử dụng tool search_knowledge_base khi cần)
2. Hỗ trợ người dùng quản lý thông tin và tài liệu
3. Trò chuyện tự nhiên và thân thiện bằng tiếng Việt

Quy tắc:
- Luôn trả lời bằng tiếng Việt trừ khi người dùng hỏi bằng tiếng khác
- Khi người dùng hỏi về tài liệu hoặc thông tin cụ thể, HÃY dùng tool search_knowledge_base
- Trả lời ngắn gọn và rõ ràng vì người dùng đang nghe qua loa
- Không bịa đặt thông tin không có trong tài liệu
"""

# Tool definitions cho Gemini Live API
GEMINI_TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="search_knowledge_base",
                description="Tìm kiếm thông tin trong kho kiến thức cá nhân. Dùng khi người dùng hỏi về tài liệu đã lưu.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "query": types.Schema(
                            type="STRING",
                            description="Câu hỏi hoặc từ khóa cần tìm kiếm",
                        ),
                        "kb_id": types.Schema(
                            type="STRING",
                            description="ID kho kiến thức cụ thể (tùy chọn)",
                        ),
                    },
                    required=["query"],
                ),
            ),
            types.FunctionDeclaration(
                name="list_knowledge_bases",
                description="Liệt kê tất cả kho kiến thức có sẵn trong hệ thống.",
                parameters=types.Schema(type="OBJECT", properties={}),
            ),
        ]
    )
]

# Gemini Live API config
LIVE_CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],  # Xuất audio trực tiếp (không cần TTS riêng)
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.gemini_voice_name)
        )
    ),
    system_instruction=types.Content(
        parts=[types.Part(text=SYSTEM_INSTRUCTION)]
    ),
    tools=GEMINI_TOOLS,
)


# ─── Audio Conversion Helpers ─────────────────────────────────────────────────

def opus_to_pcm_16k(opus_data: bytes) -> bytes:
    """
    Convert Opus audio (ESP32 format: 16kHz, mono) → PCM 16-bit 16kHz
    Gemini Live API cần PCM raw 16kHz input.
    
    Yêu cầu: pip install opuslib
    Fallback: nếu không có opuslib, dùng ffmpeg subprocess
    """
    try:
        import opuslib
        decoder = opuslib.Decoder(16000, 1)  # 16kHz, mono
        # Opus frames thường 60ms = 960 samples ở 16kHz
        pcm = decoder.decode(opus_data, 960)
        return pcm
    except ImportError:
        # Fallback: ffmpeg
        import subprocess
        result = subprocess.run(
            ["ffmpeg", "-f", "opus", "-i", "pipe:0",
             "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"],
            input=opus_data, capture_output=True, timeout=5
        )
        return result.stdout
    except Exception as e:
        logger.warning(f"Opus decode error: {e}, passing raw bytes")
        return opus_data


def pcm_24k_to_opus(pcm_data: bytes) -> bytes:
    """
    Convert PCM 24kHz (Gemini output) → Opus (ESP32 format)
    
    Yêu cầu: opuslib hoặc ffmpeg
    """
    try:
        import opuslib
        encoder = opuslib.Encoder(24000, 1, opuslib.APPLICATION_VOIP)
        # Chia PCM thành frames 60ms (1440 samples ở 24kHz)
        frame_size = 1440 * 2  # 2 bytes per sample (16-bit)
        opus_frames = bytearray()
        for i in range(0, len(pcm_data), frame_size):
            frame = pcm_data[i:i+frame_size]
            if len(frame) < frame_size:
                # Pad cuối frame
                frame = frame + bytes(frame_size - len(frame))
            encoded = encoder.encode(frame, 1440)
            opus_frames.extend(encoded)
        return bytes(opus_frames)
    except ImportError:
        # Fallback: ffmpeg
        import subprocess
        result = subprocess.run(
            ["ffmpeg", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0",
             "-c:a", "libopus", "-b:a", "16k", "-f", "ogg", "pipe:1"],
            input=pcm_data, capture_output=True, timeout=5
        )
        return result.stdout
    except Exception as e:
        logger.warning(f"PCM encode error: {e}")
        return pcm_data


# ─── Tool Dispatcher ─────────────────────────────────────────────────────────

async def dispatch_tool_call(name: str, args: dict) -> str:
    """Execute MCP tool và trả về text result cho Gemini."""
    logger.info(f"Gemini called tool: {name}({args})")
    try:
        if name == "search_knowledge_base":
            result = await search_knowledge_base(
                query=args.get("query", ""),
                kb_id=args.get("kb_id"),
            )
            if result["found"]:
                return f"Tìm thấy {result['count']} kết quả:\n\n{result['context']}"
            return "Không tìm thấy thông tin liên quan trong kho kiến thức."

        elif name == "list_knowledge_bases":
            result = await list_knowledge_bases()
            if result["count"] == 0:
                return "Chưa có kho kiến thức nào."
            lines = [f"Có {result['count']} kho kiến thức:"]
            for kb in result["knowledge_bases"]:
                lines.append(f"- {kb['title']}: {kb.get('description', '')}")
            return "\n".join(lines)

        else:
            return f"Tool '{name}' không tồn tại."

    except Exception as e:
        logger.error(f"Tool error: {e}")
        return f"Lỗi khi gọi tool: {str(e)}"


# ─── Session: Kết nối 1 ESP32 ────────────────────────────────────────────────

class XiaozhiGeminiSession:
    """
    Quản lý một phiên kết nối giữa ESP32-S3 và Gemini Live API.
    
    ESP32 ←→ Session ←→ Gemini Live
    """

    def __init__(self, esp_ws: WebSocketServerProtocol, device_id: str, client_id: str):
        self.esp_ws = esp_ws
        self.device_id = device_id
        self.client_id = client_id
        self.session_id = str(uuid.uuid4())[:8]
        self.state = "idle"  # idle / connecting / listening / speaking
        self.expression = EXPRESSION_IDLE
        self.gemini_session = None  # Gemini Live session
        self._audio_queue: asyncio.Queue = asyncio.Queue()
        self._running = True
        # Đăng ký vào registry
        active_sessions[self.session_id] = self

    def to_status_dict(self) -> dict:
        """Trả về trạng thái session dưới dạng dict (cho API status)."""
        return {
            "session_id": self.session_id,
            "device_id": self.device_id,
            "state": self.state,
            "expression": self.expression,
            "gemini_connected": self.gemini_session is not None,
        }

    # ─── Gửi messages về ESP32 ──────────────────────────────────────────────

    async def send_json(self, data: dict):
        """Gửi JSON control message về ESP32."""
        try:
            await self.esp_ws.send(json.dumps(data))
        except Exception as e:
            logger.warning(f"[{self.session_id}] Send JSON error: {e}")

    async def send_binary(self, data: bytes):
        """Gửi binary audio data về ESP32."""
        try:
            await self.esp_ws.send(data)
        except Exception as e:
            logger.warning(f"[{self.session_id}] Send binary error: {e}")

    async def send_hello(self):
        await self.send_json({
            "type": "hello",
            "transport": "websocket",
            "session_id": self.session_id,
            "audio_params": {
                "format": "opus",
                "sample_rate": 16000,
                "channels": 1,
                "frame_duration": 60,
            },
        })

    async def send_expression(self, expression: str):
        """Gửi lệnh biểu cảm DeskBuddy về ESP32 (hiển thị trên màn hình)."""
        self.expression = expression
        await self.send_json({
            "session_id": self.session_id,
            "type": "expression",
            "state": expression,
        })
        logger.debug(f"[{self.session_id}] Expression → {expression}")

    async def send_stt(self, text: str):
        """Gửi kết quả nhận dạng giọng nói về ESP32 (hiển thị trên screen)."""
        await self.send_json({
            "session_id": self.session_id,
            "type": "stt",
            "text": text,
        })

    async def send_tts_start(self):
        await self.send_json({"session_id": self.session_id, "type": "tts", "state": "start"})
        await self.send_expression(EXPRESSION_SPEAKING)

    async def send_tts_stop(self):
        await self.send_json({"session_id": self.session_id, "type": "tts", "state": "stop"})
        await self.send_expression(EXPRESSION_IDLE)

    async def send_llm_emotion(self, emotion: str = "neutral"):
        # Map emotion strings to expression protocol
        expr_map = {
            "thinking": EXPRESSION_THINKING,
            "happy": EXPRESSION_HAPPY,
            "neutral": EXPRESSION_IDLE,
            "error": EXPRESSION_ERROR,
        }
        await self.send_expression(expr_map.get(emotion, EXPRESSION_IDLE))
        await self.send_json({
            "session_id": self.session_id,
            "type": "llm",
            "emotion": emotion,
            "text": "🤔" if emotion == "thinking" else "😊",
        })

    # ─── Gemini Live Connection ──────────────────────────────────────────────

    async def _run_gemini_session(self):
        """
        Main loop: Kết nối Gemini Live API và bridge audio 2 chiều.
        Chạy song song với vòng lặp nhận audio từ ESP32.
        """
        client = genai.Client(api_key=settings.gemini_api_key)

        try:
            async with client.aio.live.connect(
                model="gemini-2.0-flash-live-001",
                config=LIVE_CONFIG,
            ) as gemini:
                self.gemini_session = gemini
                logger.info(f"[{self.session_id}] Gemini Live connected")

                # Task 1: Đọc audio từ queue và gửi lên Gemini
                async def send_audio_to_gemini():
                    while self._running:
                        try:
                            pcm_chunk = await asyncio.wait_for(
                                self._audio_queue.get(), timeout=1.0
                            )
                            await gemini.send(
                                input=types.LiveClientRealtimeInput(
                                    media_chunks=[
                                        types.Blob(data=pcm_chunk, mime_type="audio/pcm;rate=16000")
                                    ]
                                )
                            )
                        except asyncio.TimeoutError:
                            continue
                        except Exception as e:
                            logger.error(f"Send audio error: {e}")
                            break

                # Task 2: Nhận response từ Gemini và gửi về ESP32
                async def receive_from_gemini():
                    tts_started = False
                    async for response in gemini.receive():
                        # Xử lý tool calls
                        if response.tool_call:
                            await self.send_llm_emotion("thinking")
                            for fc in response.tool_call.function_calls:
                                result_text = await dispatch_tool_call(
                                    fc.name, dict(fc.args)
                                )
                                await gemini.send(
                                    input=types.LiveClientToolResponse(
                                        function_responses=[
                                            types.FunctionResponse(
                                                id=fc.id,
                                                name=fc.name,
                                                response={"result": result_text},
                                            )
                                        ]
                                    )
                                )

                        # Xử lý audio output từ Gemini
                        if response.data:
                            if not tts_started:
                                await self.send_llm_emotion("happy")
                                await self.send_tts_start()
                                tts_started = True

                            # Convert PCM 24kHz → Opus → gửi về ESP32
                            opus_data = pcm_24k_to_opus(response.data)
                            await self.send_binary(opus_data)

                        # Xử lý text transcription (nếu có)
                        if response.text:
                            logger.info(f"[{self.session_id}] Gemini text: {response.text[:60]}")

                        # Turn complete
                        if response.server_content and response.server_content.turn_complete:
                            if tts_started:
                                await self.send_tts_stop()
                                tts_started = False
                            self.state = "idle"

                # Chạy 2 tasks song song
                await asyncio.gather(
                    send_audio_to_gemini(),
                    receive_from_gemini(),
                )

        except Exception as e:
            logger.error(f"[{self.session_id}] Gemini session error: {e}", exc_info=True)
        finally:
            self.gemini_session = None
            logger.info(f"[{self.session_id}] Gemini session closed")

    # ─── Nhận messages từ ESP32 ──────────────────────────────────────────────

    async def handle_message(self, message):
        """Xử lý message từ ESP32 (text JSON hoặc binary Opus)."""
        if isinstance(message, bytes):
            # Binary: Opus audio từ microphone ESP32
            if self.state == "listening" and self.gemini_session:
                pcm_data = opus_to_pcm_16k(message)
                await self._audio_queue.put(pcm_data)

        elif isinstance(message, str):
            # Text: JSON control message
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON: {message[:80]}")
                return

            msg_type = data.get("type")

            if msg_type == "hello":
                logger.info(f"[{self.session_id}] Hello from {self.device_id}, MCP: {data.get('features', {}).get('mcp', False)}")
                await self.send_hello()
                await self.send_expression(EXPRESSION_IDLE)

            elif msg_type == "listen":
                state = data.get("state")
                if state == "start":
                    self.state = "listening"
                    await self.send_expression(EXPRESSION_LISTENING)
                    logger.info(f"[{self.session_id}] Listening started (mode={data.get('mode')})")
                    # Gửi signal "start listening" tới Gemini Live
                    if self.gemini_session:
                        await self.gemini_session.send(
                            input=types.LiveClientRealtimeInput(
                                activity_start=types.ActivityStart()
                            )
                        )

                elif state == "stop":
                    self.state = "processing"
                    await self.send_expression(EXPRESSION_THINKING)
                    logger.info(f"[{self.session_id}] Listening stopped, processing...")
                    if self.gemini_session:
                        await self.gemini_session.send(
                            input=types.LiveClientRealtimeInput(
                                activity_end=types.ActivityEnd()
                            )
                        )

                elif state == "detect":
                    # Wake word detected
                    logger.info(f"[{self.session_id}] Wake word: {data.get('text')}")

            elif msg_type == "abort":
                self.state = "idle"
                logger.info(f"[{self.session_id}] Aborted")

            elif msg_type == "mcp":
                # MCP response từ ESP32 (device-side tools)
                logger.info(f"[{self.session_id}] MCP response from device: {data.get('payload', {})}")

    # ─── Run Session ─────────────────────────────────────────────────────────

    async def run(self):
        """Entry point: chạy Gemini session + nhận messages từ ESP32."""
        logger.info(f"[{self.session_id}] Session started for device: {self.device_id}")

        # Khởi động Gemini session trong background
        gemini_task = asyncio.create_task(self._run_gemini_session())

        try:
            async for message in self.esp_ws:
                await self.handle_message(message)
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"[{self.session_id}] ESP32 disconnected")
        except Exception as e:
            logger.error(f"[{self.session_id}] Session error: {e}", exc_info=True)
        finally:
            self._running = False
            gemini_task.cancel()
            try:
                await gemini_task
            except asyncio.CancelledError:
                pass
            # Dọn dẹp registry
            active_sessions.pop(self.session_id, None)
            logger.info(f"[{self.session_id}] Session ended")


# ─── WebSocket Server ─────────────────────────────────────────────────────────

async def handle_esp32_connection(websocket: WebSocketServerProtocol):
    """
    WebSocket handler - được gọi khi ESP32-S3 kết nối.
    Đây là endpoint ESP32 kết nối tới: ws://YOUR_IP:8765/xiaozhi/v1/
    """
    # Đọc headers từ ESP32
    headers = websocket.request_headers
    device_id = headers.get("Device-Id", "unknown")
    client_id = headers.get("Client-Id", str(uuid.uuid4()))
    auth = headers.get("Authorization", "")

    # TODO: Xác thực token nếu cần
    # if settings.api_secret_token and auth != f"Bearer {settings.api_secret_token}":
    #     await websocket.close(1008, "Unauthorized")
    #     return

    logger.info(f"ESP32 connected: device_id={device_id}, ip={websocket.remote_address}")

    session = XiaozhiGeminiSession(websocket, device_id, client_id)
    await session.run()


async def start_xiaozhi_ws_server(host: str = "0.0.0.0", port: int = 8765):
    """Khởi động WebSocket server cho ESP32."""
    logger.info(f"Starting Xiaozhi WebSocket server on ws://{host}:{port}/xiaozhi/v1/")
    logger.info(f"Configure ESP32 firmware to connect: ws://YOUR_IP:{port}/xiaozhi/v1/")

    async with websockets.serve(
        handle_esp32_connection,
        host,
        port,
        subprotocols=["xiaozhi"],  # optional
        max_size=10 * 1024 * 1024,  # 10MB max message
        ping_interval=20,
        ping_timeout=60,
    ):
        await asyncio.Future()  # Run forever
