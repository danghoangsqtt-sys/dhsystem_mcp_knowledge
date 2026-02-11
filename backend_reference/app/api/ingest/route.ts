/* 
  NOTE: This is a backend file reference. 
  In a real Next.js project, place this in app/api/ingest/route.ts 
  Required Dependencies: @google/genai, @supabase/supabase-js, langchain, pdf-parse
*/

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Initialize Supabase (Admin Client for writing)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const knowledgeBaseId = formData.get('knowledgeBaseId') as string;

    if (!file || !knowledgeBaseId) {
      return NextResponse.json({ error: 'Missing file or kb ID' }, { status: 400 });
    }

    // 1. Convert File to Text (Simplified for example)
    // In production, use pdf-parse or a document loader
    const arrayBuffer = await file.arrayBuffer();
    // mocking text extraction for this code snippet since pdf-parse is external
    // Use TextDecoder instead of Buffer for better compatibility with Next.js runtimes
    const text = new TextDecoder('utf-8').decode(arrayBuffer);

    // 2. Chunk the text
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const output = await splitter.createDocuments([text]);

    // 3. Generate Embeddings & Save to DB
    const documentsToInsert = [];

    for (const chunk of output) {
      // Generate embedding using Gemini 004
      const embeddingResp = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: chunk.pageContent
      });

      // Fixed: Access 'embeddings' array property instead of 'embedding'
      const embedding = embeddingResp.embeddings?.[0]?.values;

      documentsToInsert.push({
        knowledge_base_id: knowledgeBaseId,
        content: chunk.pageContent,
        metadata: { source: file.name },
        embedding: embedding
      });
    }

    // Batch insert
    const { error } = await supabase.from('documents').insert(documentsToInsert);

    if (error) throw error;

    return NextResponse.json({ success: true, count: documentsToInsert.length });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}