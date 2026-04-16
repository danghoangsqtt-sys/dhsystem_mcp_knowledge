"""
DHsystem - ChromaDB Vector Store
Lưu trữ và tìm kiếm vector embeddings locally.

ChromaDB chạy hoàn toàn local, không cần config, tự động persist vào disk.
Thư mục: ./chroma_data/ (cấu hình trong .env CHROMA_PERSIST_DIR)
"""
import logging
import chromadb
from chromadb.config import Settings as ChromaSettings
from config import settings

logger = logging.getLogger("dhsystem.vector")

# ─── Singleton ChromaDB Client ────────────────────────────────────────────────
_chroma_client = None


def get_chroma_client() -> chromadb.PersistentClient:
    """Trả về ChromaDB persistent client (singleton)."""
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        logger.info(f"ChromaDB initialized at: {settings.chroma_persist_dir}")
    return _chroma_client


def get_kb_collection(kb_id: str) -> chromadb.Collection:
    """
    Lấy hoặc tạo ChromaDB collection cho một knowledge base.
    Collection name = "kb_{kb_id}" (thay - bằng _)
    """
    client = get_chroma_client()
    collection_name = f"kb_{kb_id.replace('-', '_')}"
    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"kb_id": kb_id, "hnsw:space": "cosine"},
    )
    return collection


def get_global_collection() -> chromadb.Collection:
    """
    Collection tổng hợp tất cả documents (để search không filter KB).
    """
    client = get_chroma_client()
    return client.get_or_create_collection(
        name="all_documents",
        metadata={"hnsw:space": "cosine"},
    )


# ─── Vector Operations ────────────────────────────────────────────────────────

def upsert_chunks(
    kb_id: str,
    doc_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict] = None,
):
    """
    Lưu chunks + embeddings vào ChromaDB.
    Tự động upsert vào cả collection của KB và global collection.
    """
    if not chunks:
        return

    # IDs duy nhất cho mỗi chunk
    ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
    metas = metadatas or [{}] * len(chunks)

    # Thêm kb_id vào metadata
    for m in metas:
        m["kb_id"] = kb_id
        m["doc_id"] = doc_id

    # Upsert vào collection của KB
    kb_collection = get_kb_collection(kb_id)
    kb_collection.upsert(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metas,
    )

    # Upsert vào global collection
    global_collection = get_global_collection()
    global_collection.upsert(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metas,
    )

    logger.info(f"Upserted {len(chunks)} chunks for doc={doc_id} in kb={kb_id}")


def search_vectors(
    query_embedding: list[float],
    kb_id: str = None,
    top_k: int = 5,
    threshold: float = 0.4,
) -> list[dict]:
    """
    Tìm kiếm vector similarity.

    Args:
        query_embedding: Vector embedding của câu query
        kb_id: Lọc theo KB cụ thể (None = tìm tất cả)
        top_k: Số kết quả tối đa
        threshold: Ngưỡng similarity (0=không lọc, 1=giống hệt)

    Returns:
        List of dicts: [{content, similarity, metadata}]
    """
    if kb_id:
        collection = get_kb_collection(kb_id)
    else:
        collection = get_global_collection()

    # Kiểm tra collection có data không
    if collection.count() == 0:
        return []

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            include=["documents", "distances", "metadatas"],
        )
    except Exception as e:
        logger.error(f"ChromaDB query error: {e}")
        return []

    docs = results.get("documents", [[]])[0]
    distances = results.get("distances", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]

    output = []
    for doc, dist, meta in zip(docs, distances, metadatas):
        # ChromaDB cosine: distance = 1 - similarity
        similarity = 1 - dist
        if similarity >= threshold:
            output.append({
                "content": doc,
                "similarity": round(similarity, 3),
                "metadata": meta,
            })

    return output


def delete_doc_chunks(kb_id: str, doc_id: str):
    """Xóa tất cả chunks của một document."""
    try:
        kb_col = get_kb_collection(kb_id)
        kb_col.delete(where={"doc_id": doc_id})
        global_col = get_global_collection()
        global_col.delete(where={"doc_id": doc_id})
        logger.info(f"Deleted chunks for doc={doc_id}")
    except Exception as e:
        logger.error(f"Delete chunks error: {e}")


def get_collection_stats() -> dict:
    """Thống kê toàn bộ vector store."""
    client = get_chroma_client()
    collections = client.list_collections()
    return {
        "total_collections": len(collections),
        "global_count": get_global_collection().count(),
        "collections": [{"name": c.name, "count": c.count()} for c in collections],
    }
