"""
DHsystem - Document Ingestion Service

Upload và xử lý tài liệu: đọc text, chunk, tạo embedding, lưu vào Appwrite + ChromaDB.

Hỗ trợ file: .txt, .md, .pdf (cần pip install pypdf)

Usage:
    python ingest.py --kb-id <kb_id> --file <path_to_file>
    python ingest.py --kb-title "Tên KB mới" --file <path>
"""
import asyncio
import argparse
import logging
import sys
import os
import io
from pathlib import Path

# Fix Windows encoding
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from config import settings
from db import get_databases, ensure_schema
from vector_store import upsert_chunks
from google import genai
from google.genai import types
from appwrite.id import ID

logger = logging.getLogger("dhsystem.ingest")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)

# Gemini client
_genai_client = genai.Client(api_key=settings.gemini_api_key)


# ─── Text Extraction ──────────────────────────────────────────────────────────

def extract_text(file_path: Path) -> str:
    """Đọc text từ file (txt, md, pdf)."""
    suffix = file_path.suffix.lower()

    if suffix in [".txt", ".md"]:
        return file_path.read_text(encoding="utf-8", errors="replace")

    elif suffix == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(file_path))
            pages = []
            for page in reader.pages:
                pages.append(page.extract_text() or "")
            return "\n\n".join(pages)
        except ImportError:
            logger.error("Cần cài pypdf: pip install pypdf")
            sys.exit(1)

    else:
        # Thử đọc như text
        try:
            return file_path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            logger.error(f"Không thể đọc file: {e}")
            sys.exit(1)


# ─── Text Chunking ────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """
    Chia text thành các chunks overlapping.
    chunk_size: số ký tự mỗi chunk
    overlap: số ký tự overlap giữa các chunks
    """
    if not text.strip():
        return []

    # Ưu tiên split theo đoạn văn
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current_chunk) + len(para) + 2 <= chunk_size:
            current_chunk += ("\n\n" if current_chunk else "") + para
        else:
            if current_chunk:
                chunks.append(current_chunk)
                # Overlap: giữ lại cuối chunk trước
                overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                current_chunk = overlap_text + "\n\n" + para
            else:
                # Paragraph quá dài, split theo câu
                current_chunk = para

    if current_chunk.strip():
        chunks.append(current_chunk)

    return chunks


# ─── Embedding ────────────────────────────────────────────────────────────────

def generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """
    Tạo embeddings cho nhiều texts (batch).
    Gemini API: max 100 texts/request.
    """
    embeddings = []
    batch_size = 100

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        logger.info(f"Embedding batch {i//batch_size + 1}/{(len(texts)-1)//batch_size + 1} ({len(batch)} texts)")

        result = _genai_client.models.embed_content(
            model="models/gemini-embedding-001",
            contents=batch,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
        )
        for emb in result.embeddings:
            embeddings.append(emb.values)

    return embeddings


# ─── Appwrite KB Management ───────────────────────────────────────────────────

def get_or_create_kb(kb_id: str = None, kb_title: str = None) -> tuple[str, str]:
    """
    Lấy hoặc tạo mới knowledge base. Trả về (kb_id, kb_title).
    """
    db = get_databases()
    db_id = settings.appwrite_database_id
    col_id = settings.appwrite_kb_collection_id

    if kb_id:
        # Lấy KB hiện có
        try:
            kb = db.get_document(db_id, col_id, kb_id)
            return kb["$id"], kb["title"]
        except Exception:
            logger.error(f"Khong tim thay KB voi id: {kb_id}")
            sys.exit(1)

    elif kb_title:
        # Tạo mới
        kb = db.create_document(
            database_id=db_id,
            collection_id=col_id,
            document_id=ID.unique(),
            data={"title": kb_title, "description": "", "icon": "book"},
        )
        logger.info(f"Tao KB moi: {kb_title} (ID: {kb['$id']})")
        return kb["$id"], kb_title

    else:
        logger.error("Can --kb-id hoac --kb-title")
        sys.exit(1)


def create_doc_record(kb_id: str, filename: str, chunk_count: int) -> str:
    """Tạo record document trong Appwrite."""
    db = get_databases()
    doc = db.create_document(
        database_id=settings.appwrite_database_id,
        collection_id=settings.appwrite_doc_collection_id,
        document_id=ID.unique(),
        data={
            "knowledge_base_id": kb_id,
            "filename": filename,
            "chunk_count": chunk_count,
            "status": "ready",
        },
    )
    return doc["$id"]


# ─── Main Ingest Pipeline ─────────────────────────────────────────────────────

async def ingest_file(file_path: str, kb_id: str = None, kb_title: str = None):
    path = Path(file_path)
    if not path.exists():
        logger.error(f"File khong ton tai: {file_path}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  DHsystem - Ingest Document")
    print(f"{'='*60}")
    print(f"  File: {path.name} ({path.stat().st_size // 1024} KB)")

    # 1. Đảm bảo schema tồn tại
    await ensure_schema()

    # 2. Lấy/tạo Knowledge Base
    actual_kb_id, actual_kb_title = get_or_create_kb(kb_id, kb_title)
    print(f"  KB: {actual_kb_title} (ID: {actual_kb_id})")

    # 3. Extract text
    print(f"\n  [1/4] Doc text extraction...")
    text = extract_text(path)
    print(f"        {len(text):,} characters extracted")

    # 4. Chunk
    print(f"  [2/4] Chunking text...")
    chunks = chunk_text(text)
    print(f"        {len(chunks)} chunks created")

    if not chunks:
        logger.error("Khong co chunk nao duoc tao tu file nay")
        sys.exit(1)

    # 5. Generate embeddings
    print(f"  [3/4] Generating embeddings (Gemini text-embedding-004)...")
    embeddings = generate_embeddings_batch(chunks)
    print(f"        {len(embeddings)} embeddings (dim={len(embeddings[0])})")

    # 6. Lưu vào ChromaDB
    print(f"  [4/4] Saving to ChromaDB + Appwrite...")

    # Lưu metadata vào Appwrite
    doc_id = create_doc_record(actual_kb_id, path.name, len(chunks))

    # Lưu vectors vào ChromaDB
    metadatas = [{"chunk_index": i, "source": path.name} for i in range(len(chunks))]
    upsert_chunks(
        kb_id=actual_kb_id,
        doc_id=doc_id,
        chunks=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    print(f"\n{'='*60}")
    print(f"  [OK] Hoan thanh!")
    print(f"       KB: {actual_kb_title}")
    print(f"       Doc ID: {doc_id}")
    print(f"       Chunks: {len(chunks)}")
    print(f"{'='*60}\n")

    return doc_id


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DHsystem Document Ingestor")
    parser.add_argument("--file", "-f", required=True, help="Duong dan den file can nap")
    parser.add_argument("--kb-id", help="ID cua Knowledge Base da co")
    parser.add_argument("--kb-title", help="Tao Knowledge Base moi voi ten nay")
    args = parser.parse_args()

    if not args.kb_id and not args.kb_title:
        parser.error("Can --kb-id hoac --kb-title")

    asyncio.run(ingest_file(
        file_path=args.file,
        kb_id=args.kb_id,
        kb_title=args.kb_title,
    ))
