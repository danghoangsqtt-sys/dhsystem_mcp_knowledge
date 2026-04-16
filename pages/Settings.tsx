import React, { useState } from 'react';
import { Home, Link as LinkIcon, Smartphone, Save, AlertCircle } from 'lucide-react';

const Settings: React.FC = () => {
  const [haUrl, setHaUrl] = useState('');
  const [haToken, setHaToken] = useState('');
  const [blynkToken, setBlynkToken] = useState('');
  
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate save to backend
    setTimeout(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 500);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Đồng Bộ & Smart Home</h1>
        <p className="text-muted-foreground">Cấu hình kết nối giữa Bot và hệ thống thiết bị trong nhà của bạn.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Home Assistant Settings */}
        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#03A9F4]/20 flex items-center justify-center">
              <Home className="w-6 h-6 text-[#03A9F4]" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Home Assistant</h2>
              <p className="text-xs text-muted-foreground">Qua local API hoặc Nabu Casa</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Địa chỉ Server (URL)</label>
              <input 
                type="text" 
                velue={haUrl}
                onChange={(e) => setHaUrl(e.target.value)}
                placeholder="http://homeassistant.local:8123"
                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Long-Lived Access Token</label>
              <input 
                type="password" 
                value={haToken}
                onChange={(e) => setHaToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX..."
                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button type="submit" className="w-full bg-secondary hover:bg-secondary/80 text-foreground font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> Lưu cấu hình HA
            </button>
          </form>
        </div>

        {/* Blynk Settings */}
        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Blynk IoT</h2>
              <p className="text-xs text-muted-foreground">Điều khiển qua Webhook Blynk Cloud</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Blynk Auth Token</label>
              <input 
                type="text" 
                value={blynkToken}
                onChange={(e) => setBlynkToken(e.target.value)}
                placeholder="Dán token từ ứng dụng Blynk..."
                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button type="submit" className="w-full bg-secondary hover:bg-secondary/80 text-foreground font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4">
              <Save className="w-4 h-4" /> Lưu cấu hình Blynk
            </button>
          </form>

          <div className="mt-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <h4 className="text-sm font-bold text-yellow-600 flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" /> Lưu ý
            </h4>
            <p className="text-xs text-yellow-600/80 leading-relaxed">
              Tính năng Smart Home sẽ cung cấp cho Gemini tự động Tool `control_smart_device`. Sau khi lưu Token, hãy thử nói "Bật đèn phòng khách" qua mạch ESP32.
            </p>
          </div>
        </div>
      </div>

      {saved && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-5">
          <LinkIcon className="w-5 h-5" />
          <span className="font-medium">Đã lưu cấu hình kết nối!</span>
        </div>
      )}
    </div>
  );
};

export default Settings;