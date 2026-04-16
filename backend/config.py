"""
DHsystem - Config Module
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # ── Appwrite ──────────────────────────────────────────────
    appwrite_endpoint: str = "https://cloud.appwrite.io/v1"
    appwrite_project_id: str
    appwrite_api_key: str
    appwrite_database_id: str = "dhsystem_db"
    appwrite_kb_collection_id: str = "knowledge_bases"
    appwrite_doc_collection_id: str = "documents"

    # ── Gemini AI ─────────────────────────────────────────────
    gemini_api_key: str

    # ── ChromaDB (local vector store) ────────────────────────
    chroma_persist_dir: str = "./chroma_data"

    # ── MCP Server ────────────────────────────────────────────
    mcp_server_host: str = "0.0.0.0"
    mcp_server_port: int = 8000
    mcp_server_name: str = "dhsystem-knowledge-hub"

    # ── WebSocket Bridge ──────────────────────────────────────
    ws_server_port: int = 8765

    # ── Expression Protocol (DeskBuddy) ──────────────────────
    expression_enabled: bool = True

    # ── Gemini Voice ─────────────────────────────────────────
    gemini_voice_name: str = "Aoede"  # Lựa chọn: Puck, Charon, Kore, Fenrir, Aoede

    # ── Security ──────────────────────────────────────────────
    api_secret_token: Optional[str] = None

    # ── Knowledge Base Defaults ───────────────────────────────
    kb_top_k_results: int = 5
    kb_similarity_threshold: float = 0.4

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()
