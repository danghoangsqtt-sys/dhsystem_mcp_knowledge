import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Trash2, X, AlertTriangle, MessageSquare, Files } from 'lucide-react';
import { DocumentFile } from '../types';
import { useToast } from '../components/Toast';
import { docService } from '../lib/api';
import { checkConnection } from '../lib/supabaseClient';
import ChatInterface from '../components/ChatInterface';

const INITIAL_DOCS: DocumentFile[] = [];

const KnowledgeBaseDetail: React.FC = () => {
  const { id } = useParams();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'documents' | 'chat'>('documents');
  
  // Document States
  const [isDragging, setIsDragging] = useState(false);
  const [documents, setDocuments] = useState<DocumentFile[]>(INITIAL_DOCS);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  // Load Data
  const loadDocs = async () => {
     if (!id) return;
     const connected = await checkConnection();
     if (connected) {
       setIsLoading(true);
       try {
         const docs = await docService.getByKbId(id);
         setDocuments(docs);
       } catch (e) {
         console.error(e);
         showToast('Lỗi tải danh sách tài liệu', 'error');
       } finally {
         setIsLoading(false);
       }
     }
  };

  useEffect(() => {
    loadDocs();
  }, [id]);

  const title = id ? `Kho kiến thức #${id.substring(0,6)}` : 'Chi tiết kho';

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!id) return;
    
    // Validate
    if (file.type === "application/pdf") {
      showToast("Phiên bản Demo Web chỉ hỗ trợ file .txt và .md. Vui lòng thử lại.", "error");
      return;
    }
    
    setIsUploading(true);
    setCurrentFile(file.name);
    setUploadProgress(0);

    try {
      await docService.ingestDocument(id, file, (percent) => {
        setUploadProgress(percent);
      });
      
      showToast("Tải lên và xử lý Vector thành công!", "success");
      await loadDocs(); // Refresh list
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Lỗi khi xử lý tài liệu", "error");
    } finally {
      setIsUploading(false);
      setCurrentFile(null);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (docId: string) => {
    if (confirm('Bạn có chắc muốn xóa tài liệu này? Embedding vectors cũng sẽ bị xóa.')) {
      try {
        const connected = await checkConnection();
        if (connected) {
          await docService.delete(docId);
          await loadDocs();
        } else {
          setDocuments(prev => prev.filter(d => d.id !== docId));
        }
        showToast('Đã xóa tài liệu', 'success');
      } catch (e) {
        showToast('Lỗi khi xóa tài liệu', 'error');
      }
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-secondary rounded-full transition-colors group">
            <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-white" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              {title}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-primary/20 text-blue-400 border border-blue-500/20">Vector DB Active</span>
            </h1>
            <p className="text-sm text-muted-foreground">ID: {id} • {documents.length} tài liệu</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-secondary rounded-lg border border-border">
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'documents' ? 'bg-card text-white shadow-sm' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Files className="w-4 h-4" />
            Tài liệu
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'chat' ? 'bg-card text-white shadow-sm' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Hỏi đáp AI
          </button>
        </div>
      </div>

      {activeTab === 'documents' ? (
        <div className="animate-in fade-in duration-300 space-y-6">
          {/* Upload Zone */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 overflow-hidden
              ${isDragging 
                ? 'border-primary bg-primary/10 scale-[1.01]' 
                : 'border-border bg-card/50 hover:bg-card hover:border-slate-500'}
            `}
          >
            {isUploading ? (
              <div className="flex flex-col items-center justify-center py-4 animate-in fade-in duration-300">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                <h3 className="text-lg font-medium text-white mb-1">Đang xử lý {currentFile}...</h3>
                <p className="text-xs text-muted-foreground mb-3">Đọc file • Chunking • Tạo Embedding • Lưu DB</p>
                <div className="w-64 h-2 bg-secondary rounded-full mt-2 overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-150 ease-out" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-primary mt-2">{uploadProgress}%</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-secondary/80 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                  <UploadCloud className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-slate-400'}`} />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">
                  Kéo thả file văn bản vào đây
                </h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                  Hệ thống sẽ tự động chunking, tạo embedding vector với Gemini và lưu vào Supabase. <br/>
                  <span className="text-yellow-500/80 text-xs flex items-center justify-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> Hỗ trợ tốt nhất: .txt, .md
                  </span>
                </p>
                <label className="cursor-pointer inline-block">
                  <input type="file" className="hidden" accept=".txt,.md" onChange={handleFileSelect} />
                  <span className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Chọn file từ máy
                  </span>
                </label>
              </>
            )}
          </div>

          {/* Document List */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-secondary/20">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Files className="w-4 h-4 text-slate-400" />
                Tài liệu đã index <span className="text-slate-500 font-normal">({documents.length})</span>
              </h3>
              <button onClick={loadDocs} className="text-xs text-primary hover:underline font-medium">Làm mới danh sách</button>
            </div>
            
            {isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Chưa có tài liệu nào. Hãy upload file để bắt đầu Chat.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {documents.map((doc) => (
                  <div key={doc.id} className="group p-4 flex items-center justify-between hover:bg-secondary/40 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50">
                        <FileText className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-200 text-sm group-hover:text-primary transition-colors cursor-pointer">{doc.name}</p>
                        <p className="text-xs text-slate-500">{doc.size} • {doc.uploadedAt}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        {doc.status === 'ready' && (
                          <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full font-medium border border-green-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Xóa tài liệu"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in duration-300">
          <ChatInterface kbId={id || ''} />
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseDetail;