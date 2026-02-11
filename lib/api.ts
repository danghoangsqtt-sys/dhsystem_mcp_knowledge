import { getSupabaseClient } from './supabaseClient';
import { KnowledgeBase, DocumentFile, ChatSource } from '../types';
import { GoogleGenAI } from "@google/genai";

declare const process: any;

// Helper to get Gemini Client safely
// Prioritize Env Var, then LocalStorage
export const getGeminiClient = () => {
  // According to @google/genai coding guidelines, we must use process.env.API_KEY exclusively.
  // We should not rely on local storage or user input for the API Key.
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Simple chunking algorithm (Client-side alternative to LangChain for lightweight usage)
const chunkText = (text: string, chunkSize: number = 1000, overlap: number = 200): string[] => {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
};

/**
 * SYSTEM / GENERAL CHAT SERVICE
 */
export const systemService = {
  chat: async (
    query: string,
    onStream: (text: string) => void
  ): Promise<void> => {
    const ai = getGeminiClient();
    if (!ai) throw new Error("Chưa cấu hình API Key.");

    const systemInstruction = `Bạn là trợ lý ảo thông minh của hệ thống "DHsystem Knowledge Hub".
    
    Thông tin về hệ thống này:
    - Tên: DHsystem Knowledge Hub.
    - Chức năng chính: Quản lý kho kiến thức (Knowledge Base), tải lên tài liệu (.txt, .md), và Chat RAG (Retrieval-Augmented Generation).
    - Công nghệ sử dụng: React (Frontend), Supabase (Vector DB & Auth), Google Gemini 2.0 (AI Models).
    - Hướng dẫn sử dụng: Người dùng cần tạo kho kiến thức, upload file, sau đó vào tab "Hỏi đáp AI" để chat với tài liệu.
    
    Nhiệm vụ của bạn:
    - Trả lời các câu hỏi về cách sử dụng hệ thống.
    - Giải thích các thuật ngữ công nghệ nếu được hỏi (RAG, Vector, Embedding).
    - Luôn vui vẻ, thân thiện (có thể dùng emoji).
    - Nếu người dùng hỏi về nội dung cụ thể trong tài liệu riêng của họ, hãy hướng dẫn họ vào chi tiết Kho kiến thức để chat.
    `;

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        systemInstruction: systemInstruction,
      }
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      const text = chunk.text; // Fixed: use .text property, not .text() method
      if (text) {
        fullText += text;
        onStream(fullText);
      }
    }
  }
}

/**
 * KNOWLEDGE BASE SERVICE
 */
export const kbService = {
  getAll: async (): Promise<KnowledgeBase[]> => {
    const client = getSupabaseClient();
    if (!client) return [];

    // Fetch KBs
    const { data: kbs, error } = await client
      .from('knowledge_bases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch document counts for each KB (Optimization: In a real large app, use a view or trigger)
    const kbsWithCounts = await Promise.all(kbs.map(async (kb: any) => {
       const { count } = await client
         .from('documents')
         .select('*', { count: 'exact', head: true })
         .eq('knowledge_base_id', kb.id);
       
       return {
         id: kb.id,
         title: kb.title,
         description: kb.description,
         documentCount: count || 0,
         updatedAt: new Date(kb.created_at).toLocaleDateString('vi-VN'),
         icon: kb.icon || 'book'
       };
    }));

    return kbsWithCounts;
  },

  create: async (title: string, description: string, icon: string): Promise<KnowledgeBase | null> => {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data, error } = await client
      .from('knowledge_bases')
      .insert([{ title, description, icon }])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      title: data.title,
      description: data.description,
      documentCount: 0,
      updatedAt: 'Vừa xong',
      icon: data.icon
    };
  },

  update: async (id: string, title: string, description: string, icon: string): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('knowledge_bases')
      .update({ title, description, icon })
      .eq('id', id);

    if (error) throw error;
  },

  delete: async (id: string): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client
      .from('knowledge_bases')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

/**
 * DOCUMENTS SERVICE
 */
export const docService = {
  getByKbId: async (kbId: string): Promise<DocumentFile[]> => {
    const client = getSupabaseClient();
    if (!client) return [];

    // Distinct selection to show files, not chunks (Assuming we group by source metadata)
    const { data, error } = await client
      .from('documents')
      .select('id, metadata, created_at')
      .eq('knowledge_base_id', kbId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Deduplicate based on filename in metadata
    const uniqueFiles = new Map();
    data.forEach((item: any) => {
      const name = item.metadata?.source || 'Untitled';
      if (!uniqueFiles.has(name)) {
        uniqueFiles.set(name, {
          id: item.id,
          name: name,
          size: item.metadata?.size || 'Unknown', 
          uploadedAt: new Date(item.created_at).toLocaleString('vi-VN'),
          status: 'ready'
        });
      }
    });

    return Array.from(uniqueFiles.values());
  },

  delete: async (docId: string): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) return;

    // First get the document to find its source name
    const { data: doc } = await client.from('documents').select('metadata').eq('id', docId).single();
    
    if (doc?.metadata?.source) {
      // Delete ALL chunks belonging to this file source
      const { error } = await client
        .from('documents')
        .delete()
        .eq('metadata->>source', doc.metadata.source);
      if (error) throw error;
    } else {
      // Fallback delete single chunk
      const { error } = await client.from('documents').delete().eq('id', docId);
      if (error) throw error;
    }
  },

  /**
   * REAL CLIENT-SIDE INGESTION
   */
  ingestDocument: async (
    kbId: string, 
    file: File, 
    onProgress: (percent: number) => void
  ): Promise<void> => {
    const client = getSupabaseClient();
    const ai = getGeminiClient();

    if (!client || !ai) throw new Error("Cần cấu hình Supabase và Gemini API Key trong phần Cài đặt.");

    // 1. Read File content
    onProgress(10);
    let text = "";
    if (file.type === "application/pdf") {
       throw new Error("Hiện tại demo chỉ hỗ trợ file .txt và .md trực tiếp. PDF cần Backend processing.");
    } else {
       text = await file.text();
    }

    if (!text) throw new Error("File rỗng.");

    // 2. Chunk Text
    onProgress(20);
    const chunks = chunkText(text);
    const totalChunks = chunks.length;
    
    // 3. Process Chunks & Embed
    const documentsToInsert = [];
    const BATCH_SIZE = 5; 
    
    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (chunkContent) => {
        const embeddingResp = await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: chunkContent
        });
        
        // Corrected access: embedContent returns a single embedding, not an array
        const embedding = embeddingResp.embedding?.values;
        if (!embedding) return null;

        return {
          knowledge_base_id: kbId,
          content: chunkContent,
          metadata: { 
            source: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB'
          },
          embedding: embedding
        };
      });

      const results = await Promise.all(batchPromises);
      const validDocs = results.filter(r => r !== null);
      documentsToInsert.push(...validDocs);

      const currentProgress = 20 + Math.floor(((i + BATCH_SIZE) / totalChunks) * 60);
      onProgress(Math.min(currentProgress, 80));
    }

    // 4. Insert into Supabase
    onProgress(90);
    if (documentsToInsert.length > 0) {
      const { error } = await client.from('documents').insert(documentsToInsert);
      if (error) throw error;
    }
    
    onProgress(100);
  }
};

/**
 * RAG SERVICE (Chat & Search)
 */
export const ragService = {
  chat: async (
    kbId: string, 
    query: string,
    onStream: (text: string, sources: ChatSource[]) => void
  ): Promise<void> => {
    const client = getSupabaseClient();
    const ai = getGeminiClient();

    if (!client || !ai) throw new Error("Vui lòng cấu hình API Key trong phần Cài đặt.");

    // 1. Generate Query Embedding
    const embeddingResp = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: query
    });
    // Corrected access: embedContent returns a single embedding
    const queryEmbedding = embeddingResp.embedding?.values;

    if (!queryEmbedding) throw new Error("Không thể tạo embedding cho câu hỏi.");

    // 2. Search Similar Documents (RPC)
    const { data: sources, error } = await client.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5, // Lowered slightly for better recall
      match_count: 5,
      filter_kb_id: kbId
    });

    if (error) throw error;

    // 3. Construct Context
    const contextText = sources.map((s: any) => `[Source: ${s.metadata?.source || 'Unknown'}]\n${s.content}`).join("\n\n---\n\n");
    
    // Notify UI about sources found immediately
    const formattedSources: ChatSource[] = sources.map((s: any) => ({
      id: s.id,
      content: s.content,
      similarity: s.similarity,
      metadata: s.metadata
    }));
    
    // If no context found, just tell the model to answer generally or say it doesn't know
    const systemInstruction = `Bạn là trợ lý AI thông minh.
    Nhiệm vụ của bạn là trả lời câu hỏi dựa trên CÁC TÀI LIỆU CUNG CẤP dưới đây.
    Nếu thông tin không có trong tài liệu, hãy nói rõ là "Tôi không tìm thấy thông tin trong tài liệu này".
    Đừng bịa đặt thông tin.
    
    Tài liệu tham khảo:
    ${contextText || "Không tìm thấy tài liệu liên quan."}
    `;

    // 4. Generate Answer Stream
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3, // Low temperature for factual consistency
      }
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      // Fixed: use .text property, not .text() method
      const text = chunk.text;
      if (text) {
        fullText += text;
        onStream(fullText, formattedSources);
      }
    }
  }
};