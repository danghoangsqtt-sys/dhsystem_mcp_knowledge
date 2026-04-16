"""
DHsystem MCP Knowledge Server — FastMCP stdio transport

Standalone MCP server dành cho kết nối qua mcp_pipe.py → Xiaozhi.me.
Sử dụng FastMCP (high-level API) với stdio transport.

Usage trực tiếp (test):
    python knowledge_server.py

Usage qua pipe (production):
    python mcp_pipe.py                    # chạy tất cả servers trong mcp_config.json
    python mcp_pipe.py knowledge_server.py  # chạy chỉ server này

Lưu ý: Server này KHÔNG chạy HTTP/SSE. Nó giao tiếp qua stdin/stdout
và được mcp_pipe.py bridge ra WebSocket đến Xiaozhi.me.
"""
import sys
import os
import io
import logging
import asyncio

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from fastmcp import FastMCP

logger = logging.getLogger("dhsystem.knowledge_server")

# ─── FastMCP Server ──────────────────────────────────────────────────────────
mcp = FastMCP(
    "DHsystem-Knowledge",
    description="Kho kiến thức cá nhân DHsystem — tìm kiếm thông tin tài liệu bằng AI semantic search",
)


@mcp.tool()
async def search_knowledge_base(
    query: str,
    kb_id: str = "",
    top_k: int = 5,
) -> dict:
    """Tim kiem thong tin trong kho kien thuc ca nhan bang AI semantic search.
    Dung khi nguoi dung hoi ve tai lieu, thong tin da luu, kien thuc noi bo.

    Args:
        query: Cau hoi hoac tu khoa can tim kiem
        kb_id: ID kho kien thuc cu the (de trong = tim tat ca)
        top_k: So ket qua toi da (mac dinh 5)
    """
    from tools.knowledge import search_knowledge_base as _search

    result = await _search(
        query=query,
        kb_id=kb_id if kb_id else None,
        top_k=top_k,
    )

    if result["found"]:
        return {
            "success": True,
            "count": result["count"],
            "context": result["context"],
            "sources": result.get("sources", []),
        }
    else:
        return {
            "success": False,
            "count": 0,
            "message": "Khong tim thay thong tin lien quan trong kho kien thuc.",
        }


@mcp.tool()
async def list_knowledge_bases() -> dict:
    """Liet ke tat ca kho kien thuc hien co trong he thong.
    Tra ve danh sach cac kho kien thuc voi ten, mo ta va so tai lieu.
    """
    from tools.knowledge import list_knowledge_bases as _list_kb

    result = await _list_kb()
    if result["count"] == 0:
        return {"success": True, "count": 0, "message": "Chua co kho kien thuc nao."}

    return {
        "success": True,
        "count": result["count"],
        "knowledge_bases": result["knowledge_bases"],
    }


@mcp.tool()
async def get_knowledge_base_info(kb_id: str) -> dict:
    """Lay thong tin chi tiet ve mot kho kien thuc cu the.

    Args:
        kb_id: UUID cua knowledge base can xem thong tin
    """
    from tools.knowledge import get_knowledge_base_info as _get_kb

    result = await _get_kb(kb_id=kb_id)
    if "error" in result:
        return {"success": False, "error": result["error"]}

    return {
        "success": True,
        "id": result["id"],
        "title": result["title"],
        "description": result.get("description", ""),
        "document_count": result.get("document_count", 0),
        "chunk_count": result.get("chunk_count", 0),
    }


# ─── Entry Point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    mcp.run(transport="stdio")
