# BÀN GIAO DỰ ÁN: DHSystem Hybrid Smart Assistant (Buddy)
**Ngày lưu:** 09/04/2026

Tài liệu này ghi lại toàn bộ cấu trúc hệ thống, tiến độ làm việc, và kế hoạch để khi bạn quay lại có thể tiếp tục ngay lập tức mà không cần nhớ lại logic cũ.

---

## 1. Mục Tiêu Dự Án (Tiến độ: Hoàn thành Core)
Biến mạch ESP32-S3 thành một **Trợ lý Ảo (Buddy)** siêu thông minh, giao tiếp Voice-to-Voice liên tục qua Gemini Live API. Tách rời thiết bị khỏi máy chủ Trung Quốc để làm chủ hoàn toàn trên mạng Local/VPS.

---

## 2. Cấu Trúc Hệ Thống Hiện Tại
Dự án được chia thành 3 phần rõ rệt:
- **Phần Cứng (ESP32-S3):** Đóng vai trò thiết bị đầu cuối bắt âm và phát âm thanh, vẽ biểu cảm OLED.
- **Backend (Python):** 
  - Đóng vai trò "Trung tâm Não bộ".
  - Chạy WebSocket ở port `8765` để lừa ESP32 kết nối vào.
  - Chạy HTTP ở port `8000` làm MCP Server và API upload tài liệu.
  - **Mới:** Cung cấp `mcp_pipe.py` kết hợp FastMCP và cơ chế WebSocket để bridge các MCP Tools trực tiếp ra nền tảng Cloud của Xiaozhi.me.
  - Xử lý RAG: băm file tài liệu (txt, md, pdf), tạo embeddings đẩy vào không gian vector ChromaDB nội bộ. Thư mục database sinh ra là `backend/chroma_data/`. Bảng mục lục metadata nằm ở mây Appwrite.
- **Frontend (Tên gọi mới: Knowledge Hub):** 
  - Môi trường React sáng sủa (Light Mode).
  - Cổng `3001` - kết nối vào Backend port `8000` (qua Endpoint Proxy). Cung cấp UI để nạp Flasher và Upload tài liệu giảng luật/chuyên môn. Đã gỡ bỏ toàn bộ frontend direct Supabase connection.

---

## 3. Các Việc Đã Hoàn Tất Xong Xuôi Thử Nghiệm Tốt
✅ **Loại Bỏ Firebase/Supabase:** Giảm rác, giảm phụ thuộc. All-in-one về Appwrite & ChromaDB cục bộ.
✅ **Xây Dựng Webapp Mới:** Chuyển sang Light theme tươi sáng, tích hợp công cụ nạp Firmware Flash bằng cổng Serial USB.
✅ **Mạng Lưới MCP Chuẩn Bonion/Xiaozhi:** Đã bổ sung kiến trúc `mcp_pipe.py` dùng stdio+websocket bridge. Thiết bị ESP32 (Original Flashed) giờ đây có thể giao tiếp với Knowledge Base cục bộ ngay cả khi gọi lên Cloud của Xiaozhi.me.
✅ **Chế tạo Knowledge Hub API:** Mạch lưu chuyển từ Web tải file (.pdf, .txt) -> API `server.py` -> `ingest.py` băm nhỏ bằng Gemini -> Nạp vào Chroma DB 100% hoạt động tốt, không còn kẹt file hay lỗi cấp phép. Đã chuyển toàn bộ Logic từ Web gọi Supabase RAG sang API Server Backend gọi.
✅ **Thiết Kế Cảm Xúc (OLED Expression Protocol):** Các trạng thái (nghe, suy nghĩ, nạp dữ liệu, nói) đã được định khuôn trong mã Python để truyền JSON về phần cứng.

---

## 4. Cách Dành Cho Bạn Khi Mở Lại Project
Mở Editor lên, bật 2 Tab Terminal:
- **Terminal 1 (Chạy Não):** 
  ```bash
  cd backend
  python server.py
  ```
- **Terminal 2 (Chạy Web):**
  ```bash
  npm run dev
  ```

---

## 5. Những Việc Còn Giang Dở (Kế Hoạch Tiếp Theo)

Khi quay lại, hãy copy đoạn Kế hoạch này nhờ AI (như Antigravity) làm tiếp:
1. **Flash Firmware ESP32-S3:** 
   Bạn sẽ cần dùng bộ gõ ESP-IDF biên dịch C++ source trong thư mục `firmware/` chọn cấu hình board là: **"Xingzhi Cube 0.96 OLED (WiFi)"**. Khi ra được file `firmware.bin`, ta thẩy lên mạng và nhúng link định tuyến vào `pages/Flasher.tsx` để flash nóng từ web.
2. **KẾT NỐI PHẦN CỨNG 🛠️:**
   Kiếm mạch ESP32 đấu 4 cọng dây với màn hình OLED và cắm Loa. Bật Buddy lên để đàm thoại trực tiếp Voice test độ trễ của Gemini Live và xem màn LED nó chớp mắt.
3. **Mở Rộng LLM-Wiki (Tự Thu Thập Kiến Thức):**
   Bạn có thể nhờ AI bổ sung thêm tool chạy cronjob (như kho ý tưởng của Duongvandinh) để Backend tự động lướt web cào dữ liệu thả vào mục `raw`, xong backend tự động biến thành md và nhồi vào ChromaDB.
4. **Tool Chơi Nhạc (Smart Home):**
   Ta đã bàn về việc chèn script kết nối HomeAssistant và phát nhạc Youtube qua Loa. Skeleton API nằm sẵn trong backend thợ chờ kích hoạt.

---
**Tạm biệt. Chúc dự án khác của bạn thành công tốt đẹp! 👋**
