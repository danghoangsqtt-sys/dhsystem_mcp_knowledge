import React from 'react';
import { Cpu, Download, Info } from 'lucide-react';

const Flasher: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Trạm Nạp Trực Tiếp (Flasher)</h1>
        <p className="text-muted-foreground">Nạp code Firmware vào linh kiện ESP32 ngay trên trình duyệt mà không cần dùng phần mềm IDE lập trình.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        {/* Hướng dẫn */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Info className="w-5 h-5 text-primary" /> Hướng dẫn thao tác
            </h3>
            <ul className="space-y-4 text-sm text-foreground/80">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">1</span>
                <span>Cắm mạch thiết bị <b>ESP32-S3 WROOM</b> vào máy tính bằng cáp USB (đảm bảo đây là cáp truyền data, không phải cáp sạc trơn).</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">2</span>
                <span>Ở màn hình bên phải, click vào nút màu xanh <b>CONNECT CÁP TỚI MẠCH</b>.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">3</span>
                <span>Một khung lựa chọn Cổng COM sẽ hiện ra bởi trình duyệt Chrome. Chọn cổng (Ví dụ: COM3, /dev/ttyUSB0) tương ứng.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">4</span>
                <span>Bấm nút cài đặt hiển thị trên màn hình. Mất khoảng 1 - 2 phút cho việc ghi dữ liệu. Firmware sẽ tự động cài cấu hình OTA để chạy tới webapp của bạn.</span>
              </li>
            </ul>
          </div>
          
          <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-200">
            <p>💡 <b>Ghi chú:</b> Tính năng Web Serial để nạp trực tiếp chỉ tương thích với Chrome và Microsoft Edge. Không sử dụng trên Firefox hoặc Safari.</p>
          </div>
        </div>

        {/* Nút nạp firmware (Sử dụng Web Components) */}
        <div className="bg-gradient-to-b from-card to-card/50 rounded-xl p-8 border border-border flex flex-col items-center justify-center text-center shadow-lg">
          <Cpu className="w-20 h-20 text-slate-600 mb-6" />
          
          <h2 className="text-2xl font-bold mb-2 text-foreground">Bạn đã sẵn sàng?</h2>
          <p className="text-muted-foreground text-sm mb-10 max-w-sm">
            Board Type được xác định: <b>Xingzhi Cube 0.96 OLED (WiFi)</b>
          </p>

          <div className="p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 w-full">
            {/* 
              Thẻ HTML custom của thư viện esp-web-tools 
              Lưu ý: Manifest path hiện tại phải là URI trỏ tới file .json
            */}
            {/* @ts-ignore */}
            <esp-web-install-button manifest="https://raw.githubusercontent.com/t3hqx/dummy-firmwares/main/manifest.json">
              {/* Fallback button that gets styled un-shadowed */}
              <button 
                slot="activate" 
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transform hover:-translate-y-1"
              >
                <Download className="w-6 h-6" />
                CONNECT CÁP TỚI MẠCH NAY
              </button>
            </esp-web-install-button>
          </div>

          <p className="text-xs text-muted-foreground mt-6 flex items-center gap-1 opacity-70">
            Powered by ESP Web Tools
          </p>
        </div>
      </div>
    </div>
  );
};

export default Flasher;
