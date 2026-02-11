-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- 1. Create Knowledge Bases Table
-- Stores the metadata for each "subject" or container
create table public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Documents Table
-- Stores the actual content chunks and their vector embeddings
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid references public.knowledge_bases(id) on delete cascade not null,
  content text not null, -- The text chunk
  metadata jsonb, -- Extra info like page number, source filename
  embedding vector(768), -- Dimensions for Google Gemini text-embedding-004
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an HNSW index for faster vector similarity search
create index on public.documents using hnsw (embedding vector_cosine_ops);

-- 3. Match Documents Function
-- This function is called via RPC to find relevant content
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_kb_id uuid -- Filter by specific Knowledge Base ID
)
returns table (
  id uuid,
  content text,
  similarity float
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
  and documents.knowledge_base_id = filter_kb_id
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;