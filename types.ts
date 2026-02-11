export interface KnowledgeBase {
  id: string;
  title: string;
  description: string;
  documentCount: number;
  updatedAt: string;
  icon?: string;
}

export interface DocumentFile {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  status: 'processing' | 'ready' | 'error';
}

export interface ChatSource {
  id: string;
  content: string;
  similarity: number;
  metadata: {
    source: string;
    size?: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  timestamp: number;
  isStreaming?: boolean;
}

// MCP Related Types (For reference in backend code)
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}