"""
DHsystem - MCP Knowledge Tools
Tìm kiếm và quản lý knowledge base qua Appwrite + ChromaDB.
"""
import logging
from typing import Optional

from google import genai
from google.genai import types

from db import get_databases
from vector_store import search_vectors, get_collection_stats
from config import settings

logger = logging.getLogger("dhsystem.tools")

# Gemini client cho embedding
_genai_client = genai.Client(api_key=settings.gemini_api_key)


async def _generate_embedding(text: str) -> list[float]:
    """Tạo embedding vector 768-dim từ Gemini."""
    result = _genai_client.models.embed_content(
        model="models/gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
    )
    return result.embeddings[0].values


# ─── Tool 1: Search Knowledge Base ───────────────────────────────────────────

async def search_knowledge_base(
    query: str,
    kb_id: Optional[str] = None,
    top_k: Optional[int] = None,
    threshold: Optional[float] = None,
) -> dict:
    """
    Tìm kiếm ngữ nghĩa trong knowledge base bằng Gemini embedding + ChromaDB.

    Args:
        query: Câu hỏi hoặc từ khóa
        kb_id: ID knowledge base cụ thể (None = tìm tất cả)
        top_k: Số kết quả (mặc định theo config)
        threshold: Ngưỡng similarity 0-1 (mặc định theo config)
    """
    top_k = top_k or settings.kb_top_k_results
    threshold = threshold or settings.kb_similarity_threshold

    try:
        logger.info(f"Searching: '{query[:60]}' (kb={kb_id or 'all'})")

        # 1. Generate embedding
        query_embedding = await _generate_embedding(query)

        # 2. Vector search via ChromaDB
        results = search_vectors(
            query_embedding=query_embedding,
            kb_id=kb_id,
            top_k=top_k,
            threshold=threshold,
        )

        if not results:
            return {
                "found": False,
                "context": "Khong tim thay thong tin lien quan trong kho kien thuc.",
                "sources": [],
                "count": 0,
            }

        # 3. Format kết quả
        context_parts = []
        sources = []
        for r in results:
            context_parts.append(r["content"])
            sources.append({
                "content": r["content"][:200] + "..." if len(r["content"]) > 200 else r["content"],
                "similarity": r["similarity"],
                "kb_id": r["metadata"].get("kb_id", ""),
            })

        logger.info(f"Found {len(results)} chunks, top similarity: {sources[0]['similarity']}")

        return {
            "found": True,
            "context": "\n\n---\n\n".join(context_parts),
            "sources": sources,
            "count": len(results),
        }

    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        return {
            "found": False,
            "context": f"Loi tim kiem: {str(e)}",
            "sources": [],
            "count": 0,
            "error": str(e),
        }


# ─── Tool 2: List Knowledge Bases ────────────────────────────────────────────

async def list_knowledge_bases() -> dict:
    """Liệt kê tất cả knowledge bases từ Appwrite."""
    try:
        db = get_databases()
        response = db.list_documents(
            database_id=settings.appwrite_database_id,
            collection_id=settings.appwrite_kb_collection_id,
        )

        # Appwrite SDK trả về object, dùng attribute access
        doc_list = getattr(response, 'documents', []) if not isinstance(response, dict) else response.get("documents", [])

        kbs = [
            {
                "id": doc["$id"] if isinstance(doc, dict) else getattr(doc, "$id", str(doc)),
                "title": (doc.get("title", "") if isinstance(doc, dict) else getattr(doc, "title", "")),
                "description": (doc.get("description", "") if isinstance(doc, dict) else getattr(doc, "description", "")),
                "icon": (doc.get("icon", "book") if isinstance(doc, dict) else getattr(doc, "icon", "book")),
            }
            for doc in doc_list
        ]

        return {"knowledge_bases": kbs, "count": len(kbs)}

    except Exception as e:
        logger.error(f"List KB error: {e}", exc_info=True)
        return {"knowledge_bases": [], "count": 0, "error": str(e)}


# ─── Tool 3: Get Knowledge Base Info ─────────────────────────────────────────

async def get_knowledge_base_info(kb_id: str) -> dict:
    """Lấy thông tin chi tiết về một knowledge base."""
    try:
        db = get_databases()

        # Lấy KB metadata từ Appwrite
        kb = db.get_document(
            database_id=settings.appwrite_database_id,
            collection_id=settings.appwrite_kb_collection_id,
            document_id=kb_id,
        )

        # Đếm documents
        docs = db.list_documents(
            database_id=settings.appwrite_database_id,
            collection_id=settings.appwrite_doc_collection_id,
            queries=[f'equal("knowledge_base_id", "{kb_id}")'],
        )

        # Số chunks trong ChromaDB
        from vector_store import get_kb_collection
        try:
            chunk_count = get_kb_collection(kb_id).count()
        except Exception:
            chunk_count = 0

        return {
            "id": kb["$id"],
            "title": kb.get("title", ""),
            "description": kb.get("description", ""),
            "document_count": docs["total"],
            "chunk_count": chunk_count,
            "created_at": kb.get("$createdAt", ""),
        }

    except Exception as e:
        logger.error(f"Get KB info error: {e}", exc_info=True)
        return {"error": str(e)}
