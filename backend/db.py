"""
DHsystem - Appwrite Client
Quản lý kết nối Appwrite và tự động khởi tạo database/collections.
"""
import logging
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.id import ID
from appwrite.models.attribute_string import AttributeString
from appwrite.exception import AppwriteException

from config import settings

logger = logging.getLogger("dhsystem.db")

# ─── Singleton Client ─────────────────────────────────────────────────────────
_client: Client = None
_databases: Databases = None


def get_appwrite_client() -> Client:
    global _client
    if _client is None:
        _client = Client()
        _client.set_endpoint(settings.appwrite_endpoint)
        _client.set_project(settings.appwrite_project_id)
        _client.set_key(settings.appwrite_api_key)
        logger.info("Appwrite client initialized")
    return _client


def get_databases() -> Databases:
    global _databases
    if _databases is None:
        _databases = Databases(get_appwrite_client())
    return _databases


# ─── Schema Bootstrap ─────────────────────────────────────────────────────────

async def ensure_schema():
    """
    Tự động tạo Database + Collections nếu chưa có.
    Gọi một lần khi server khởi động.
    """
    db = get_databases()
    db_id = settings.appwrite_database_id

    # 1. Tạo Database
    try:
        db.create(database_id=db_id, name="DHsystem Knowledge Hub")
        logger.info(f"Created database: {db_id}")
    except AppwriteException as e:
        if "already exists" in str(e).lower() or e.code == 409:
            logger.info(f"Database '{db_id}' already exists")
        elif "maximum number of databases allowed" in str(e).lower() or e.code == 403:
            logger.warning("Appwrite free tier database limit reached. Trying to fallback to existing database...")
            # Fallback: lay database dau tien co san tren project
            db_list = db.list()
            total = getattr(db_list, 'total', 0) if not isinstance(db_list, dict) else db_list.get('total', 0)
            
            if total > 0:
                databases = getattr(db_list, 'databases', []) if not isinstance(db_list, dict) else db_list.get('databases', [])
                first_db_obj = databases[0]
                first_db_id = getattr(first_db_obj, 'id', '') if not isinstance(first_db_obj, dict) else first_db_obj.get('id', first_db_obj.get('$id', ''))
                
                settings.appwrite_database_id = first_db_id
                db_id = first_db_id
                logger.info(f"Fallback to existing database ID: {db_id}")
            else:
                raise
        else:
            logger.error(f"Database creation error: {e}")
            raise

    # 2. Tạo Collection: knowledge_bases
    kb_coll_id = settings.appwrite_kb_collection_id
    try:
        db.create_collection(
            database_id=db_id,
            collection_id=kb_coll_id,
            name="Knowledge Bases",
            document_security=False,
        )
        logger.info(f"Created collection: {kb_coll_id}")

        # Attributes
        db.create_string_attribute(db_id, kb_coll_id, "title", 255, required=True)
        db.create_string_attribute(db_id, kb_coll_id, "description", 1000, required=False)
        db.create_string_attribute(db_id, kb_coll_id, "icon", 50, required=False, default="book")
        db.create_string_attribute(db_id, kb_coll_id, "chroma_collection_id", 100, required=False)
        logger.info(f"Created attributes for {kb_coll_id}")

    except AppwriteException as e:
        if "already exists" in str(e).lower() or e.code == 409:
            logger.info(f"Collection '{kb_coll_id}' already exists")
        else:
            logger.error(f"Collection creation error: {e}")

    # 3. Tạo Collection: documents (metadata only, vector ở ChromaDB)
    doc_coll_id = settings.appwrite_doc_collection_id
    try:
        db.create_collection(
            database_id=db_id,
            collection_id=doc_coll_id,
            name="Documents",
            document_security=False,
        )
        logger.info(f"Created collection: {doc_coll_id}")

        db.create_string_attribute(db_id, doc_coll_id, "knowledge_base_id", 36, required=True)
        db.create_string_attribute(db_id, doc_coll_id, "filename", 512, required=True)
        db.create_string_attribute(db_id, doc_coll_id, "file_size", 50, required=False)
        db.create_integer_attribute(db_id, doc_coll_id, "chunk_count", required=False, default=0)
        db.create_string_attribute(db_id, doc_coll_id, "status", 20, required=False, default="ready")
        logger.info(f"Created attributes for {doc_coll_id}")

    except AppwriteException as e:
        if "already exists" in str(e).lower() or e.code == 409:
            logger.info(f"Collection '{doc_coll_id}' already exists")
        else:
            logger.error(f"Collection creation error: {e}")

    logger.info("Appwrite schema ready")
