import React, { useState, useEffect } from 'react';
import { Plus, BookOpen, Code, FlaskConical, History, MoreVertical, Search, X, Trash2, Edit, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { KnowledgeBase } from '../types';
import { useToast } from '../components/Toast';
import { kbService } from '../lib/api';
import { checkConnection } from '../lib/supabaseClient';

// Mock Data (Fallback)
const INITIAL_KBS: KnowledgeBase[] = [
  { id: '1', title: 'Lập trình ESP32', description: 'Tài liệu kỹ thuật, sơ đồ chân và code mẫu cho vi điều khiển ESP32.', documentCount: 12, updatedAt: '2 giờ trước', icon: 'code' },
  { id: '2', title: 'Toán học 12', description: 'Công thức giải tích, hình học không gian và đề thi thử.', documentCount: 45, updatedAt: '1 ngày trước', icon: 'math' },
  { id: '3', title: 'Lịch sử Việt Nam', description: 'Các triều đại phong kiến và lịch sử hiện đại.', documentCount: 8, updatedAt: '3 ngày trước', icon: 'history' },
  { id: '4', title: 'React Design Patterns', description: 'Best practices khi xây dựng ứng dụng React quy mô lớn.', documentCount: 5, updatedAt: '1 tuần trước', icon: 'code' },
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(INITIAL_KBS);
  const [isLoading, setIsLoading] = useState(false);
  
  // Modals State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKb, setEditingKb] = useState<KnowledgeBase | null>(null); // Track which KB is being edited
  const [deleteId, setDeleteId] = useState<string | null>(null); 
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null); 

  // Form State
  const [kbTitle, setKbTitle] = useState('');
  const [kbDesc, setKbDesc] = useState('');
  const [kbIcon, setKbIcon] = useState('book');

  // Load Data on Mount
  const loadData = async () => {
    const connected = await checkConnection();
    if (connected) {
      setIsLoading(true);
      try {
        const data = await kbService.getAll();
        // Merge real data with mock data if real data is empty just for demo visual? 
        // No, let's prioritize real data if connected.
        if (data.length > 0) {
          setKnowledgeBases(data);
        }
      } catch (error) {
        console.error(error);
        showToast('Không thể tải dữ liệu từ server', 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getIcon = (type?: string, className = "w-6 h-6") => {
    switch (type) {
      case 'code': return <Code className={`${className} text-blue-400`} />;
      case 'math': return <FlaskConical className={`${className} text-purple-400`} />;
      case 'history': return <History className={`${className} text-amber-400`} />;
      default: return <BookOpen className={`${className} text-slate-400`} />;
    }
  };

  const filteredKBs = knowledgeBases.filter(kb => 
    kb.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    kb.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingKb(null);
    setKbTitle('');
    setKbDesc('');
    setKbIcon('book');
    setIsModalOpen(true);
  };

  const openEditModal = (kb: KnowledgeBase) => {
    setEditingKb(kb);
    setKbTitle(kb.title);
    setKbDesc(kb.description);
    setKbIcon(kb.icon || 'book');
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const connected = await checkConnection();

    try {
      if (editingKb) {
        // --- EDIT MODE ---
        if (connected) {
          await kbService.update(editingKb.id, kbTitle, kbDesc, kbIcon);
        }
        
        // Optimistic UI Update
        setKnowledgeBases(prev => prev.map(item => 
          item.id === editingKb.id 
            ? { ...item, title: kbTitle, description: kbDesc, icon: kbIcon, updatedAt: 'Vừa xong' } 
            : item
        ));
        showToast('Cập nhật thành công', 'success');
      } else {
        // --- CREATE MODE ---
        let newKB: KnowledgeBase;
        if (connected) {
          const result = await kbService.create(kbTitle, kbDesc, kbIcon);
          if (!result) throw new Error("Create failed");
          newKB = result;
        } else {
          newKB = {
            id: Date.now().toString(),
            title: kbTitle,
            description: kbDesc,
            documentCount: 0,
            updatedAt: 'Vừa xong',
            icon: kbIcon
          };
        }
        setKnowledgeBases([newKB, ...knowledgeBases]);
        showToast('Tạo kho kiến thức thành công!', 'success');
      }

      setIsModalOpen(false);
      setKbTitle('');
      setKbDesc('');
      setKbIcon('book');
    } catch (err) {
      showToast('Có lỗi xảy ra', 'error');
    }
  };

  const handleDeleteKB = async () => {
    if (!deleteId) return;

    try {
      const connected = await checkConnection();
      if (connected) {
        await kbService.delete(deleteId);
      }
      
      setKnowledgeBases(prev => prev.filter(kb => kb.id !== deleteId));
      showToast('Đã xóa kho kiến thức', 'success');
    } catch (error) {
      showToast('Không thể xóa kho kiến thức', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-8 relative pb-20" onClick={() => setActiveMenuId(null)}>
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Thư viện kiến thức</h1>
          <p className="text-muted-foreground">Quản lý các nguồn dữ liệu cho AI Assistant của bạn.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-500/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo kho mới</span>
        </button>
      </div>

      {/* Search Filter */}
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <input 
          type="text" 
          placeholder="Tìm kiếm kho kiến thức..." 
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-all placeholder:text-muted-foreground/50"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Create New Card (Visual Shortcut) */}
        <button 
          onClick={openCreateModal}
          className="flex flex-col items-center justify-center gap-4 bg-transparent border-2 border-dashed border-border rounded-xl p-6 hover:border-primary/50 hover:bg-primary/5 transition-all group h-full min-h-[220px]"
        >
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors duration-300">
            <Plus className="w-6 h-6 text-muted-foreground group-hover:text-white" />
          </div>
          <p className="font-medium text-muted-foreground group-hover:text-primary">Thêm chủ đề mới</p>
        </button>

        {isLoading ? (
          // Skeleton Loading
          [1,2,3].map(i => (
             <div key={i} className="bg-card border border-border rounded-xl p-6 h-[220px] animate-pulse">
                <div className="w-12 h-12 bg-secondary rounded-lg mb-4"></div>
                <div className="h-6 bg-secondary rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-secondary rounded w-full mb-4"></div>
             </div>
          ))
        ) : (
          filteredKBs.map((kb) => (
            <div 
              key={kb.id} 
              onClick={() => navigate(`/knowledge/${kb.id}`)}
              className="group relative bg-card hover:bg-slate-800/80 border border-border rounded-xl p-6 transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-black/40 hover:-translate-y-1 flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-secondary rounded-lg group-hover:scale-110 group-hover:bg-secondary/80 transition-all duration-300 shadow-inner">
                  {getIcon(kb.icon)}
                </div>
                
                {/* Context Menu Trigger */}
                <div className="relative">
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setActiveMenuId(activeMenuId === kb.id ? null : kb.id); 
                    }}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {/* Context Menu Dropdown */}
                  {activeMenuId === kb.id && (
                    <div className="absolute right-0 top-full mt-1 w-32 bg-popover border border-border rounded-lg shadow-xl z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          openEditModal(kb);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2"
                      >
                        <Edit className="w-3 h-3" /> Chỉnh sửa
                      </button>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setDeleteId(kb.id); 
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-red-500/10 text-red-400 flex items-center gap-2"
                      >
                        <Trash2 className="w-3 h-3" /> Xóa kho
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-primary transition-colors">{kb.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">{kb.description}</p>
              
              <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-border mt-auto">
                <span className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
                  <DatabaseIcon className="w-3 h-3" />
                  {kb.documentCount} tài liệu
                </span>
                <span>{kb.updatedAt}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-card border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">
                {editingKb ? 'Chỉnh sửa Kho Kiến Thức' : 'Tạo Kho Kiến Thức Mới'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Tên chủ đề</label>
                <input 
                  autoFocus
                  type="text" 
                  required
                  placeholder="Ví dụ: Tài liệu Marketing"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm text-white"
                  value={kbTitle}
                  onChange={e => setKbTitle(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Mô tả ngắn</label>
                <textarea 
                  rows={3}
                  placeholder="Mô tả nội dung của kho kiến thức này..."
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm text-white resize-none"
                  value={kbDesc}
                  onChange={e => setKbDesc(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Biểu tượng</label>
                <div className="flex gap-3">
                  {['book', 'code', 'math', 'history'].map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setKbIcon(icon)}
                      className={`p-3 rounded-lg border transition-all ${
                        kbIcon === icon 
                          ? 'bg-primary/20 border-primary' 
                          : 'bg-secondary border-border hover:border-slate-500'
                      }`}
                    >
                      {getIcon(icon, "w-5 h-5")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-blue-500/20"
                >
                  {editingKb ? 'Lưu thay đổi' : 'Tạo kho mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)}></div>
          <div className="relative bg-card border border-border w-full max-w-sm rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
             <div className="flex items-center justify-center w-12 h-12 bg-red-500/10 rounded-full mb-4 mx-auto">
                <AlertTriangle className="w-6 h-6 text-red-500" />
             </div>
             <h3 className="text-lg font-semibold text-center text-white mb-2">Xác nhận xóa?</h3>
             <p className="text-sm text-muted-foreground text-center mb-6">
               Hành động này sẽ xóa kho kiến thức này và <strong>toàn bộ tài liệu</strong> bên trong. Không thể hoàn tác.
             </p>
             <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteId(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-white text-sm font-medium transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={handleDeleteKB}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                >
                  Xóa vĩnh viễn
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DatabaseIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s 9-1.34 9-3V5" />
  </svg>
);

export default Dashboard;