import React, { useEffect, useState } from 'react';
import { Activity, Server, Database, Bot, RefreshCw } from 'lucide-react';

interface DeviceState {
  session_id: string;
  device_id: string;
  state: string;
  expression: string;
  gemini_connected: boolean;
}

interface SystemStatus {
  server: string;
  uptime_info: string;
  devices_online: number;
  devices: DeviceState[];
  knowledge_bases: number;
}

const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch status", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh every 3 seconds
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Hệ Thống Trung Tâm</h1>
          <p className="text-muted-foreground">Theo dõi toàn bộ hoạt động của trợ lý ảo và server cục bộ.</p>
        </div>
        <button 
          onClick={fetchStatus}
          className="p-2 bg-secondary rounded-md text-muted-foreground hover:text-white transition-colors"
          title="Làm mới"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Server AI / MCP</p>
              <h3 className="text-2xl font-bold text-green-500">
                {status ? "Online" : "Offline"}
              </h3>
            </div>
            <div className="p-3 bg-secondary rounded-lg">
              <Server className="w-6 h-6 text-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Cổng 8000 & 8765 (WebSocket)</p>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Thiết bị đang kết nối</p>
              <h3 className="text-2xl font-bold">
                {status?.devices_online || 0} <span className="text-sm font-normal text-muted-foreground">thiết bị</span>
              </h3>
            </div>
            <div className="p-3 bg-secondary rounded-lg">
              <Bot className="w-6 h-6 text-indigo-400" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Nhận qua WebSocket Bridge</p>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Kho Kiến Thức</p>
              <h3 className="text-2xl font-bold">
                {status?.knowledge_bases || 0} <span className="text-sm font-normal text-muted-foreground">tài liệu</span>
              </h3>
            </div>
            <div className="p-3 bg-secondary rounded-lg">
              <Database className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">ChromaDB + Appwrite</p>
        </div>
      </div>

      {/* Device List */}
      <h2 className="text-xl font-bold tracking-tight pt-4 border-t border-border">Thiết Bị Hoạt Động Cục Bộ Realtime</h2>
      
      {!status || status.devices.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-2">Chưa có thiết bị nào kết nối</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Hệ thống đang chờ lệnh nhận từ mạch ESP32. Hãy bật nguồn thiết bị (Buddy) của bạn hoặc qua tab Flasher để nạp firmware.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {status.devices.map(device => (
            <div key={device.session_id} className="bg-gradient-to-br from-card to-card/50 rounded-xl p-5 border border-border shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-bl-full -z-10 group-hover:bg-primary/20 transition-colors"></div>
              
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center border-2 border-primary">
                      <Bot className="w-6 h-6 text-primary" />
                    </div>
                    {device.gemini_connected && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-card rounded-full animate-pulse"></span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">Robot Buddy</h4>
                    <p className="text-xs text-muted-foreground font-mono">ID: {device.device_id.substring(0,8)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mt-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Trạng thái
                  </span>
                  <span className="font-medium capitalize px-2 py-0.5 bg-secondary text-secondary-foreground rounded-md text-xs">
                    {device.state}
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Cảm xúc hiện tại</span>
                  <span className={`font-medium capitalize`}>
                    {device.expression === 'speaking' ? '🗣️ Nói' : 
                     device.expression === 'listening' ? '👂 Nghe' :
                     device.expression === 'thinking' ? '🤔 Nghĩ' : '😊 ' + device.expression}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;