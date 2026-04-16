# 🚀 DHsystem Knowledge Hub — Hướng Dẫn Deploy VPS

## Kiến trúc sau khi deploy

```
Xiaozhi.me / ESP32
       │
       ▼ (WSS / WebSocket)
[VPS Hetzner CAX11 - ~80k/tháng]
       │
       ├── Nginx (port 443 HTTPS)
       │       ├── /sse          → MCP Server
       │       ├── /xiaozhi/v1/  → WebSocket ESP32 Bridge
       │       └── /api/*        → REST API
       │
       ├── Docker: dhsystem-server (port 8000 + 8765)
       └── Docker: dhsystem-pipe  (kết nối ra Xiaozhi.me WSS)
```

---

## Bước 1: Thuê VPS Hetzner

1. Vào [hetzner.com/cloud](https://hetzner.com/cloud)
2. Tạo project → Add Server:
   - **Location:** Falkenstein (EU) hoặc Singapore (gần nhất)
   - **OS:** Ubuntu 24.04 ARM64
   - **Type:** `CAX11` (2 ARM vCPU, 4GB RAM) — **€3.29/tháng**
   - **SSH Key:** Upload public key để đăng nhập không cần mật khẩu
3. Ghi lại **IP Public** của VPS

---

## Bước 2: Chuẩn bị trước khi SSH

**Cập nhật repo URL trong file deploy:**

Mở `deploy/setup-vps.sh`, tìm dòng:
```bash
REPO_URL="https://github.com/YOUR_USERNAME/dhsystem-knowledge-hub.git"
```
Thay `YOUR_USERNAME` bằng tên GitHub thật của bạn.

Mở `deploy/nginx.conf`, tìm:
```nginx
server_name YOUR_DOMAIN.com;
```
Thay bằng IP VPS (nếu chưa có domain): `server_name _;` hoặc tên domain thật.

**Push code lên GitHub** (nếu chưa):
```powershell
cd e:\data\MyProject\dhsystem-knowledge-hub
git add .
git commit -m "feat: add VPS deploy configuration"
git push
```

---

## Bước 3: Chạy trên VPS

```bash
# 1. SSH vào VPS
ssh root@<IP_VPS>

# 2. Chạy script setup tự động (1 lệnh duy nhất)
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/dhsystem-knowledge-hub/main/deploy/setup-vps.sh | bash

# HOẶC nếu muốn clone tay:
git clone https://github.com/YOUR_USERNAME/dhsystem-knowledge-hub.git /opt/dhsystem
cd /opt/dhsystem
bash deploy/setup-vps.sh
```

---

## Bước 4: Điền API Keys

```bash
# Trên VPS
nano /opt/dhsystem/backend/.env
```

Điền đủ các key sau:
```env
APPWRITE_PROJECT_ID=xxx
APPWRITE_API_KEY=xxx
GEMINI_API_KEY=xxx
MCP_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=xxx
```

Lưu file → Restart services:
```bash
cd /opt/dhsystem
docker compose restart
```

---

## Bước 5: Cài SSL (nếu có domain)

```bash
# Thay YOUR_DOMAIN.com bằng domain thật
certbot --nginx -d YOUR_DOMAIN.com --non-interactive --agree-tos --email your@email.com
```

---

## Bước 6: Cập nhật Xiaozhi.me

Đăng nhập [xiaozhi.me Console](https://xiaozhi.me) → Agents → MCP Settings:
```
MCP Endpoint: https://YOUR_DOMAIN.com/sse
# Hoặc dùng IP:
MCP Endpoint: http://<IP_VPS>:8000/sse
```

---

## Lệnh quản lý hàng ngày

```bash
cd /opt/dhsystem

# Xem trạng thái
docker compose ps

# Xem logs realtime
docker compose logs -f

# Xem logs 1 service cụ thể
docker compose logs -f dhsystem-pipe

# Restart
docker compose restart

# Update code mới từ GitHub
bash deploy/update.sh

# Stop tất cả
docker compose down

# Nạp tài liệu mới vào KB (từ VPS)
docker compose exec dhsystem-server python ingest.py --kb-title "Tên KB" --file /path/to/file.pdf
```

---

## Troubleshooting

| Vấn đề | Kiểm tra |
|---|---|
| Server không start | `docker compose logs dhsystem-server` |
| Pipe không kết nối Xiaozhi | `docker compose logs dhsystem-pipe` — check MCP_ENDPOINT |
| SSL không hoạt động | `nginx -t` và `certbot renew --dry-run` |
| ChromaDB lỗi | Volume chroma_data: `docker volume ls` |
| Upload tài liệu lỗi | Check `client_max_body_size` trong nginx.conf |
