-- ============================================================
-- DHsystem MCP Knowledge Hub - Database Schema
-- PostgreSQL + pgvector (Supabase)
-- ============================================================
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

-- 0. Enable pgvector extension
create extension if not exists vector;

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Knowledge Bases: Nhóm chủ đề / thư mục tài liệu
create table if not exists public.knowledge_bases (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  icon        text default 'book',
  created_at  timestamp with time zone default timezone('utc', now()) not null
);

-- Documents: Các đoạn text đã được embedding
create table if not exists public.documents (
  id                   uuid primary key default gen_random_uuid(),
  knowledge_base_id    uuid references public.knowledge_bases(id) on delete cascade not null,
  content              text not null,        -- nội dung đoạn văn bản
  metadata             jsonb,                -- {source, size, page, ...}
  embedding            vector(768),          -- Gemini text-embedding-004 = 768 dims
  created_at           timestamp with time zone default timezone('utc', now()) not null
);

-- HNSW index cho vector similarity search nhanh
create index if not exists documents_embedding_idx
  on public.documents using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- 2. RPC FUNCTIONS
-- ============================================================

-- Function 1: Tìm kiếm trong một KB cụ thể (theo kb_id)
create or replace function match_documents (
  query_embedding  vector(768),
  match_threshold  float,
  match_count      int,
  filter_kb_id     uuid
)
returns table (
  id          uuid,
  content     text,
  similarity  float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.knowledge_base_id = filter_kb_id
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Function 2: Tìm kiếm trong TẤT CẢ KB (không filter)
-- Dùng cho MCP tool search_knowledge_base khi kb_id = null
create or replace function match_documents_all (
  query_embedding  vector(768),
  match_threshold  float,
  match_count      int
)
returns table (
  id          uuid,
  content     text,
  similarity  float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Bật RLS để bảo mật dữ liệu
alter table public.knowledge_bases enable row level security;
alter table public.documents enable row level security;

-- Policy: Cho phép đọc tất cả (public read)
-- Thay đổi theo nhu cầu auth của bạn
create policy "Allow public read knowledge_bases"
  on public.knowledge_bases for select using (true);

create policy "Allow public read documents"
  on public.documents for select using (true);

-- Policy: Cho phép ghi từ service role (backend server)
create policy "Allow service insert knowledge_bases"
  on public.knowledge_bases for insert with check (true);

create policy "Allow service insert documents"
  on public.documents for insert with check (true);

create policy "Allow service update knowledge_bases"
  on public.knowledge_bases for update using (true);

create policy "Allow service delete knowledge_bases"
  on public.knowledge_bases for delete using (true);

create policy "Allow service delete documents"
  on public.documents for delete using (true);

-- ============================================================
-- DONE! Chạy file này trong Supabase SQL Editor.
-- ============================================================