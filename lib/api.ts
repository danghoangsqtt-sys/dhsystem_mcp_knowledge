import { KnowledgeBase, DocumentFile, ChatSource } from '../types';
import { GoogleGenAI } from "@google/genai";

declare const process: any;

// ─── Backend API Base URL ────────────────────────────────────────────────
// In development: Vite proxy forwards /api → http://127.0.0.1:8000
// In production:  Same origin, served by backend
const API_BASE = '/api';

// ─── Gemini Client (for chat/streaming only) ─────────────────────────────
export const getGeminiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// ─── Helper: fetch wrapper ───────────────────────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API Error: ${res.status}`);
  }
  return res.json();
}

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
    - Chức năng chính: Quản lý kho kiến thức (Knowledge Base), tải lên tài liệu (.txt, .md, .pdf), và Chat RAG (Retrieval-Augmented Generation).
    - Công nghệ sử dụng: React (Frontend), Appwrite (Database), ChromaDB (Vector Store), Google Gemini (AI + Embedding).
    - Kết nối Xiaozhi: MCP Server kết nối ESP32-S3 hoặc Xiaozhi.me cloud qua mcp_pipe.py.
    - Hướng dẫn sử dụng: Người dùng cần tạo kho kiến thức, upload file, sau đó vào tab "Hỏi đáp AI" để chat với tài liệu.
    
    Nhiệm vụ của bạn:
    - Trả lời các câu hỏi về cách sử dụng hệ thống.
    - Giải thích các thuật ngữ công nghệ nếu được hỏi (RAG, Vector, Embedding, MCP).
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
      const text = chunk.text;
      if (text) {
        fullText += text;
        onStream(fullText);
      }
    }
  }
}

/**
 * KNOWLEDGE BASE SERVICE
 * Sử dụng Backend API (Appwrite) thay vì Supabase trực tiếp.
 */
export const kbService = {
  getAll: async (): Promise<KnowledgeBase[]> => {
    const data = await apiFetch<{
      knowledge_bases: Array<{
        id: string;
        title: string;
        description: string;
        icon: string;
      }>;
      count: number;
    }>('/kb/list');

    return data.knowledge_bases.map(kb => ({
      id: kb.id,
      title: kb.title,
      description: kb.description || '',
      documentCount: 0, // Backend chưa trả document count inline
      updatedAt: '',
      icon: kb.icon || 'book',
    }));
  },

  create: async (title: string, description: string, icon: string): Promise<KnowledgeBase | null> => {
    // Tạo KB qua upload endpoint (tạm thời dùng search/list rồi check)
    // TODO: Backend cần endpoint POST /api/kb/create
    console.warn('kbService.create: Backend endpoint /api/kb/create chưa có, cần implement');
    return null;
  },

  update: async (id: string, title: string, description: string, icon: string): Promise<void> => {
    // TODO: Backend cần endpoint PUT /api/kb/{id}
    console.warn('kbService.update: Backend endpoint chưa có, cần implement');
  },

  delete: async (id: string): Promise<void> => {
    // TODO: Backend cần endpoint DELETE /api/kb/{id}
    console.warn('kbService.delete: Backend endpoint chưa có, cần implement');
  }
};

/**
 * DOCUMENTS SERVICE
 * Upload file qua Backend API → ingest pipeline (Appwrite + ChromaDB)
 */
export const docService = {
  getByKbId: async (kbId: string): Promise<DocumentFile[]> => {
    // TODO: Backend cần endpoint GET /api/kb/{id}/documents
    console.warn('docService.getByKbId: Endpoint chưa đầy đủ');
    return [];
  },

  delete: async (docId: string): Promise<void> => {
    // TODO: Backend cần endpoint DELETE /api/doc/{id}
    console.warn('docService.delete: Endpoint chưa có');
  },

  /**
   * Upload file qua Backend API endpoint /api/upload
   */
  ingestDocument: async (
    kbId: string, 
    file: File, 
    onProgress: (percent: number) => void
  ): Promise<void> => {
    onProgress(10);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('kb_title', kbId); // Backend dùng kb_title hoặc kb_id

    onProgress(30);

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
      // No Content-Type header — browser sets multipart/form-data automatically
    });

    onProgress(80);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }

    const result = await res.json();
    if (result.error) {
      throw new Error(result.error);
    }

    onProgress(100);
  }
};

/**
 * RAG SERVICE (Chat & Search)
 * Sử dụng Backend MCP tool search_knowledge_base + Gemini streaming
 */
export const ragService = {
  chat: async (
    kbId: string, 
    query: string,
    onStream: (text: string, sources: ChatSource[]) => void
  ): Promise<void> => {
    const ai = getGeminiClient();
    if (!ai) throw new Error("Vui lòng cấu hình API Key trong phần Cài đặt.");

    // 1. Search context via Backend MCP tool
    let contextText = "";
    let formattedSources: ChatSource[] = [];
    
    try {
      const searchResult = await apiFetch<{
        status: string;
        found?: boolean;
        count?: number;
        context?: string;
        sources?: Array<{
          content: string;
          similarity: number;
          kb_id: string;
        }>;
      }>('/search', {
        method: 'POST',
        body: JSON.stringify({ query, kb_id: kbId, top_k: 5 }),
      });

      if (searchResult.found && searchResult.context) {
        contextText = searchResult.context;
        formattedSources = (searchResult.sources || []).map((s, i) => ({
          id: `src-${i}`,
          content: s.content,
          similarity: s.similarity,
          metadata: { source: s.kb_id || 'unknown' },
        }));
      }
    } catch (searchError) {
      // Fallback: nếu search API chưa có, chat không context
      console.warn('Search API chưa sẵn sàng, chat không có context:', searchError);
    }

    // 2. Generate answer via Gemini streaming
    const systemInstruction = `Bạn là trợ lý AI thông minh.
    Nhiệm vụ của bạn là trả lời câu hỏi dựa trên CÁC TÀI LIỆU CUNG CẤP dưới đây.
    Nếu thông tin không có trong tài liệu, hãy nói rõ là "Tôi không tìm thấy thông tin trong tài liệu này".
    Đừng bịa đặt thông tin.
    
    Tài liệu tham khảo:
    ${contextText || "Không tìm thấy tài liệu liên quan."}
    `;

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3,
      }
    });

    let fullText = "";
    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onStream(fullText, formattedSources);
      }
    }
  }
};