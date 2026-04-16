#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DHsystem - Setup Checker (Appwrite + ChromaDB)
Kiem tra tat ca dich vu truoc khi chay server.
"""
import asyncio
import sys
import os
import io

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def section(title):
    print(f"\n{'─'*50}")
    print(f"  {title}")
    print(f"{'─'*50}")


def ok(msg): print(f"  [OK]   {msg}")
def fail(msg): print(f"  [FAIL] {msg}")
def warn(msg): print(f"  [WARN] {msg}")
def tip(msg): print(f"  [TIP]  {msg}")


def check_env():
    section("Kiem tra bien moi truong")
    from dotenv import load_dotenv
    load_dotenv()

    required = {
        "APPWRITE_PROJECT_ID": "Appwrite Project ID",
        "APPWRITE_API_KEY":    "Appwrite API Key",
        "GEMINI_API_KEY":      "Google Gemini API Key",
    }
    all_ok = True
    for var, name in required.items():
        val = os.getenv(var, "")
        if not val or "your-" in val.lower() or val.endswith("..."):
            fail(f"{name} ({var}) chua duoc cau hinh")
            all_ok = False
        else:
            ok(f"{name}: {val[:12]}...")
    return all_ok


def check_appwrite():
    section("Kiem tra Appwrite Cloud")
    try:
        from appwrite.client import Client
        from appwrite.services.databases import Databases
        from config import settings

        client = Client()
        client.set_endpoint(settings.appwrite_endpoint)
        client.set_project(settings.appwrite_project_id)
        client.set_key(settings.appwrite_api_key)

        db = Databases(client)
        # Thu list databases
        result = db.list()
        
        count = getattr(result, 'total', 0)
        if count == 0 and hasattr(result, 'databases') and result.databases:
             count = len(result.databases)
        
        ok(f"Appwrite ket noi thanh cong! Co {count} database(s)")
        return True
    except Exception as e:
        fail(f"Appwrite loi: {e}")
        tip("Kiem tra APPWRITE_PROJECT_ID va APPWRITE_API_KEY")
        tip("Xem huong dan tai: https://cloud.appwrite.io")
        return False


async def check_appwrite_schema():
    section("Kiem tra / Tao Appwrite Schema")
    try:
        from db import ensure_schema
        await ensure_schema()
        ok("Appwrite schema san sang (database + collections)")
        return True
    except Exception as e:
        fail(f"Schema error: {e}")
        return False


def check_chromadb():
    section("Kiem tra ChromaDB (Local Vector Store)")
    try:
        from vector_store import get_chroma_client, get_global_collection, get_collection_stats
        from config import settings

        client = get_chroma_client()
        col = get_global_collection()
        stats = get_collection_stats()

        ok(f"ChromaDB khoi dong tai: {settings.chroma_persist_dir}")
        ok(f"Global collection: {col.count()} chunks")
        ok(f"Tong collections: {stats['total_collections']}")
        return True
    except Exception as e:
        fail(f"ChromaDB loi: {e}")
        tip("Chay: pip install chromadb")
        return False


async def check_gemini():
    section("Kiem tra Gemini API")
    try:
        from google import genai
        from google.genai import types
        from config import settings

        client = genai.Client(api_key=settings.gemini_api_key)
        result = client.models.embed_content(
            model="models/gemini-embedding-001",
            contents="test embedding",
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
        )
        dims = len(result.embeddings[0].values)
        ok(f"Gemini embedding OK - dims: {dims} (can 768)")
        if dims != 768:
            warn(f"Ket qua {dims} dims, hy vong 768")
        return True
    except Exception as e:
        fail(f"Gemini loi: {e}")
        tip("Kiem tra GEMINI_API_KEY tai: https://aistudio.google.com/app/apikey")
        return False


async def test_search():
    section("Test Knowledge Search")
    try:
        from tools.knowledge import search_knowledge_base, list_knowledge_bases

        kbs = await list_knowledge_bases()
        ok(f"Knowledge bases: {kbs['count']}")
        for kb in kbs["knowledge_bases"][:3]:
            print(f"     - {kb['title']}")

        # Search
        result = await search_knowledge_base("test query")
        ok(f"Search chay thanh cong (found={result['found']})")
        return True
    except Exception as e:
        fail(f"Search loi: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    print("=" * 55)
    print("  DHsystem MCP Knowledge Hub - Setup Checker")
    print("  Backend: Appwrite Cloud + ChromaDB + Gemini")
    print("=" * 55)

    results = []

    # Buoc 1: Bien moi truong
    env_ok = check_env()
    results.append(env_ok)

    if not env_ok:
        print("\n  --> Dien thong tin vao backend/.env truoc!")
        print("  --> Copy backend/.env.example sang backend/.env")
        print("\n" + "=" * 55)
        return

    # Buoc 2: Appwrite connection
    aw_ok = check_appwrite()
    results.append(aw_ok)

    # Buoc 3: ChromaDB (khong can appwrite OK)
    chroma_ok = check_chromadb()
    results.append(chroma_ok)

    # Buoc 4: Gemini
    gemini_ok = await check_gemini()
    results.append(gemini_ok)

    # Buoc 5: Schema (can appwrite OK)
    if aw_ok:
        schema_ok = await check_appwrite_schema()
        results.append(schema_ok)

    # Buoc 6: Test search (can tat ca OK)
    if all(results):
        search_ok = await test_search()
        results.append(search_ok)

    # Ket qua
    section("Ket Qua Tong Hop")
    passed = sum(1 for r in results if r)
    total = len(results)

    if all(results):
        ok(f"Tat ca {total}/{total} kiem tra PASSED!")
        print()
        print("  Buoc tiep theo:")
        print("    1. python server.py")
        print("    2. Mo trinh duyet: http://localhost:8000")
        print("    3. Nap tai lieu: python ingest.py --kb-title 'Ten KB' --file 'file.txt'")
        print("    4. Cau hinh ESP32 WebSocket: ws://YOUR_IP:8765/xiaozhi/v1/")
    else:
        fail(f"{total-passed}/{total} kiem tra FAILED - Xem loi o tren")

    print("\n" + "=" * 55)


if __name__ == "__main__":
    asyncio.run(main())
