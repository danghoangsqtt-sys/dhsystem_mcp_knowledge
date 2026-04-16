import React, { useState, useEffect } from 'react';
import { Database, UploadCloud, FileText, Loader2, Book } from 'lucide-react';

const KnowledgeHub: React.FC = () => {
  const [kbs, setKbs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [topicName, setTopicName] = useState('');

  const fetchKbs = async () => {
    try {
      const res = await fetch('/api/kb/list');
      if (res.ok) {
        const data = await res.json();
        setKbs(data.knowledge_bases || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKbs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!topicName.trim()) {
      alert('Vui lòng nhập Tên lĩnh vực kiến thức trước khi chọn file!');
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Đang đọc và phân tách file: ${file.name}...`);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kb_title', topicName);

    try {
      setUploadStatus('Đang gọi AI Gemini để Embedding và lưu vào ChromaDB (Mất khoảng 20-30s)...');
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Server error');
      }

      await res.json();
      setUploadStatus('Hoàn tất lưu trữ! Đã sẵn sàng cho AI.');
      setTopicName('');
      setTimeout(() => {
        setIsUploading(false);
        fetchKbs(); // Refresh list
      }, 2000);
    } catch (e: any) {
      alert('Lỗi khi nạp tài liệu: ' + e.message);
      setIsUploading(false);
    }
    
    // Clear input
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20 mt-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-slate-900 border-b border-slate-200 pb-4">
          <Database className="inline-block w-8 h-8 mr-2 text-primary" />
          Máy Trạm Tri Thức (Knowledge Hub)
        </h1>
        <p className="text-slate-600 mt-2">
          Nơi bơm dữ liệu chuyên ngành vào <b>ChromaDB cục bộ</b> để AI (Gemini) tự động truy xuất khi trả lời.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        {/* VÙNG UPLOAD CHÍNH */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm relative overflow-hidden">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <UploadCloud className="w-5 h-5" /> Nạp Dữ Liệu Chuyên Môn
            </h2>

            <div className="space-y-4 relative z-10">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nhập Tên Lĩnh Vực Của Bạn (Ví dụ: "Luật Giao Thông 2024", "Giáo trình Kinh tế học")
                </label>
                <input 
                  type="text" 
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder="Tiêu đề lĩnh vực..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isUploading}
                />
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors mt-6">
                {isUploading ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <h3 className="text-lg font-medium text-slate-800 mb-1">{uploadStatus}</h3>
                    <p className="text-xs text-slate-500">Xin đừng đóng tab làm gián đoạn tiến trình. Hệ thống đang băm nhỏ (chunking) file.</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-2">
                      Chọn file chứa luận văn/sách/tài liệu của bạn
                    </h3>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto mb-6">
                      Hệ thống tự động cắt lớp, nhúng vector bằng Gemini Embedding và lưu thẳng vào máy chủ Local ChromaDB.
                      <br/>Hỗ trợ: .txt, .md, .pdf (vui lòng cài pypdf ở backend).
                    </p>
                    <label className="cursor-pointer inline-block">
                      <input type="file" className="hidden" accept=".txt,.md,.pdf" onChange={handleFileUpload} />
                      <span className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-bold text-sm transition-all flex items-center gap-2 shadow-md">
                        <UploadCloud className="w-5 h-5" />
                        Chọn file để nạp
                      </span>
                    </label>
                  </>
                )}
              </div>
            </div>
            
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-bl-[100px] -z-0"></div>
          </div>
        </div>

        {/* LĨNH VỰC ĐÃ NẠP */}
        <div className="lg:col-span-1">
          <div className="bg-slate-50 rounded-xl border border-slate-200 h-full overflow-hidden flex flex-col">
            <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Book className="w-4 h-4 text-primary" /> 
                Các lĩnh vực đã hiểu ({kbs.length})
              </h3>
              <button onClick={fetchKbs} className="text-xs text-primary hover:underline" disabled={loading}>
                {loading ? 'Đang tải...' : 'Làm mới'}
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : kbs.length === 0 ? (
                <div className="text-center p-8 text-slate-500 text-sm">
                  Chưa có quyển "Sách" nào được nạp cho AI.
                </div>
              ) : (
                <div className="space-y-3">
                  {kbs.map((kb) => (
                    <div key={kb.id} className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow group">
                      <h4 className="font-bold text-slate-800 text-sm">{kb.title}</h4>
                      <p className="text-xs text-slate-500 mt-1 font-mono">ID: {kb.id.substring(0,8)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeHub;