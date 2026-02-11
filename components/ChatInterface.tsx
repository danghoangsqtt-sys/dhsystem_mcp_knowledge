import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, FileText, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { ChatMessage, ChatSource } from '../types';
import { ragService } from '../lib/api';
import { useToast } from './Toast';

interface ChatInterfaceProps {
  kbId: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ kbId }) => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    const aiMsgId = (Date.now() + 1).toString();
    const aiPlaceholder: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '', // Will stream in
      timestamp: Date.now(),
      isStreaming: true
    };

    setMessages(prev => [...prev, userMsg, aiPlaceholder]);
    setInput('');
    setIsLoading(true);

    try {
      await ragService.chat(kbId, userMsg.content, (text, sources) => {
        setMessages(prev => prev.map(msg => 
          msg.id === aiMsgId 
            ? { ...msg, content: text, sources: sources, isStreaming: true } 
            : msg
        ));
      });

      // Finalize loading state
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId ? { ...msg, isStreaming: false } : msg
      ));

    } catch (error: any) {
      console.error(error);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId 
          ? { ...msg, content: "Xin lỗi, tôi gặp lỗi khi kết nối với AI hoặc Database. Vui lòng kiểm tra lại cấu hình API.", isStreaming: false } 
          : msg
      ));
      showToast(error.message || 'Lỗi hệ thống', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-card border border-border rounded-xl overflow-hidden shadow-inner">
      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 select-none">
            <Sparkles className="w-12 h-12 mb-4 text-primary" />
            <p className="text-lg font-medium">Hỏi bất cứ điều gì về tài liệu của bạn</p>
            <p className="text-sm">Tôi sẽ tìm kiếm câu trả lời chính xác từ Context.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-secondary text-blue-400 border border-border'}
            `}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`
                px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                ${msg.role === 'user' 
                  ? 'bg-primary text-white rounded-tr-none' 
                  : 'bg-secondary/50 text-slate-200 border border-border rounded-tl-none'}
              `}>
                {msg.content || (msg.isStreaming && <span className="animate-pulse">Thinking...</span>)}
              </div>

              {/* Sources Accordion */}
              {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <SourceDisclosure sources={msg.sources} />
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded-full bg-secondary text-blue-400 border border-border flex items-center justify-center shrink-0">
               <Loader2 className="w-4 h-4 animate-spin" />
             </div>
             <div className="text-sm text-muted-foreground pt-2">Đang tìm kiếm và suy nghĩ...</div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-card">
        <form 
          onSubmit={handleSend}
          className="relative flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Đặt câu hỏi về tài liệu..."
            className="w-full bg-secondary/50 border border-border text-foreground rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-1 focus:ring-primary transition-all shadow-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-primary text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-primary transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};

// Helper component for Sources
const SourceDisclosure: React.FC<{ sources: ChatSource[] }> = ({ sources }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-2 w-full max-w-md">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>Đã tham khảo {sources.length} đoạn tài liệu</span>
      </button>
      
      {isOpen && (
        <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {sources.map((src, idx) => (
            <div key={idx} className="bg-secondary/30 border border-border p-2 rounded-md text-xs">
              <div className="flex items-center gap-2 mb-1 text-blue-400 font-medium">
                <FileText className="w-3 h-3" />
                <span>{src.metadata?.source || 'Unknown source'}</span>
                <span className="ml-auto text-slate-500">{Math.round(src.similarity * 100)}% match</span>
              </div>
              <p className="text-slate-400 line-clamp-2 italic">"{src.content.substring(0, 150)}..."</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatInterface;