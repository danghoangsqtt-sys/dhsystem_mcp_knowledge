import React, { useState, useEffect } from 'react';
import { Save, Database, Shield, Server, CheckCircle2, XCircle, AlertTriangle, Lock } from 'lucide-react';
import { initSupabase, checkConnection } from '../lib/supabaseClient';

const Settings: React.FC = () => {
  // Check if env vars are loaded (masked for security)
  // Safely access env using optional chaining
  const importMeta = import.meta as any;
  const envSupabase = importMeta.env?.VITE_SUPABASE_URL ? 'Loaded from Environment' : '';
  // Per guidelines, Gemini API Key is strictly managed via process.env.API_KEY and hidden from UI.

  const [config, setConfig] = useState({
    supabaseUrl: localStorage.getItem('VITE_SUPABASE_URL') || '',
    supabaseKey: localStorage.getItem('VITE_SUPABASE_KEY') || ''
  });

  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const meta = import.meta as any;
    // If Env vars exist, try connecting immediately
    if (meta.env?.VITE_SUPABASE_URL && meta.env?.VITE_SUPABASE_KEY) {
       handleTestConnection(false);
    } else if (config.supabaseUrl && config.supabaseKey) {
      // Fallback to local storage init
      initSupabase({ url: config.supabaseUrl, key: config.supabaseKey });
      handleTestConnection(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    localStorage.setItem('VITE_SUPABASE_URL', config.supabaseUrl);
    localStorage.setItem('VITE_SUPABASE_KEY', config.supabaseKey);
    
    // Re-initialize client
    initSupabase({ url: config.supabaseUrl, key: config.supabaseKey });
    handleTestConnection(true);
  };

  const handleTestConnection = async (showSuccessAlert = true) => {
    setStatus('checking');
    const isConnected = await checkConnection();
    
    if (isConnected) {
      setStatus('connected');
      if (showSuccessAlert) setMsg('Kết nối Supabase thành công! Hệ thống đã sẵn sàng.');
    } else {
      setStatus('error');
      setMsg('Không thể kết nối. Vui lòng kiểm tra URL, Key và chắc chắn rằng bạn đã chạy lệnh SQL tạo bảng.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Cài đặt hệ thống</h1>
        <p className="text-muted-foreground">Cấu hình kết nối Backend và AI Service.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Supabase Config */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Database className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Cấu hình Database</h3>
              <p className="text-xs text-muted-foreground">Kết nối đến Supabase PostgreSQL</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex justify-between">
                Supabase Project URL
                {envSupabase && <span className="text-xs text-green-400 flex items-center gap-1"><Lock className="w-3 h-3"/> {envSupabase}</span>}
              </label>
              <input 
                type="text" 
                name="supabaseUrl"
                placeholder={envSupabase ? "Đã được cấu hình qua Env Variables" : "https://xyz.supabase.co"}
                value={config.supabaseUrl}
                onChange={handleChange}
                disabled={!!envSupabase}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border focus:border-primary outline-none text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex justify-between">
                 Supabase Anon Key
                 {envSupabase && <span className="text-xs text-green-400 flex items-center gap-1"><Lock className="w-3 h-3"/> {envSupabase}</span>}
              </label>
              <input 
                type="password" 
                name="supabaseKey"
                placeholder={envSupabase ? "••••••••••••••••" : "eyJhbGciOiJIUzI1NiIsInR..."}
                value={config.supabaseKey}
                onChange={handleChange}
                disabled={!!envSupabase}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border focus:border-primary outline-none text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status === 'checking' && <span className="text-xs text-yellow-500 flex items-center gap-1"><Server className="w-3 h-3 animate-pulse"/> Checking...</span>}
              {status === 'connected' && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Connected</span>}
              {status === 'error' && <span className="text-xs text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3"/> Disconnected</span>}
            </div>
            <button 
              onClick={() => handleTestConnection(true)}
              className="text-xs text-primary hover:underline"
            >
              Test Connection
            </button>
          </div>
        </div>

        {/* AI Config */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Shield className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Cấu hình AI Model</h3>
              <p className="text-xs text-muted-foreground">Google Gemini API & Embeddings</p>
            </div>
          </div>

          <div className="space-y-4">
             <div className="p-4 bg-secondary/50 rounded-lg border border-border text-center">
                <Shield className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-white">API Key Secured</p>
                <p className="text-xs text-muted-foreground mt-1">
                   Gemini API Key đã được cấu hình an toàn qua Environment Variable.
                </p>
             </div>
          </div>
          
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mt-4">
             <div className="flex gap-2">
               <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
               <p className="text-xs text-yellow-200/80">
                 Trạng thái: {envSupabase ? "Production Mode (Đã khóa Env Vars)" : "Development Mode"}
               </p>
             </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        {!envSupabase && (
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-6 py-2.5 rounded-lg transition-all shadow-lg shadow-blue-500/20 active:scale-95"
          >
            <Save className="w-4 h-4" />
            Lưu cấu hình
          </button>
        )}
      </div>
      
      {msg && (
        <div className={`p-4 rounded-lg border ${status === 'connected' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} animate-in slide-in-from-bottom-2`}>
          {msg}
        </div>
      )}
    </div>
  );
};

export default Settings;