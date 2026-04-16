#!/bin/bash
# ================================================================
# DHsystem Knowledge Hub — VPS Setup Script
# Chạy 1 lần duy nhất trên VPS mới
#
# Yêu cầu: Ubuntu 22.04 / 24.04 LTS (ARM64 hoặc AMD64)
# Usage:
#   wget -O setup.sh https://raw.githubusercontent.com/YOUR_USER/dhsystem-knowledge-hub/main/deploy/setup-vps.sh
#   chmod +x setup.sh && bash setup.sh
# ================================================================
set -e

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m' # No Color
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo ""
echo "================================================================"
echo "  DHsystem Knowledge Hub — VPS Setup"
echo "================================================================"
echo ""

# ── 1. Cập nhật hệ thống ────────────────────────────────────────
info "Cập nhật hệ thống..."
apt-get update -qq && apt-get upgrade -y -qq
success "Hệ thống đã cập nhật"

# ── 2. Cài Docker ───────────────────────────────────────────────
if command -v docker &> /dev/null; then
    warn "Docker đã được cài sẵn: $(docker --version)"
else
    info "Cài Docker..."
    curl -fsSL https://get.docker.com | sh
    success "Docker đã cài xong: $(docker --version)"
fi

# Docker Compose v2 (tích hợp trong Docker mới)
if docker compose version &> /dev/null; then
    success "Docker Compose: $(docker compose version)"
else
    error "Docker Compose không tìm thấy. Kiểm tra lại cài đặt Docker."
fi

# ── 3. Cài Nginx + Certbot ──────────────────────────────────────
info "Cài Nginx và Certbot (SSL)..."
apt-get install -y -qq nginx certbot python3-certbot-nginx
success "Nginx và Certbot đã cài xong"

# ── 4. Tạo thư mục app ──────────────────────────────────────────
APP_DIR="/opt/dhsystem"
info "Tạo thư mục app tại $APP_DIR..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# ── 5. Clone hoặc pull repo ─────────────────────────────────────
REPO_URL="https://github.com/YOUR_USERNAME/dhsystem-knowledge-hub.git"

if [ -d ".git" ]; then
    info "Repo đã tồn tại, đang pull cập nhật mới nhất..."
    git pull
else
    info "Clone repository..."
    git clone "$REPO_URL" .
fi
success "Code đã sẵn sàng"

# ── 6. Tạo file .env nếu chưa có ───────────────────────────────
if [ ! -f "backend/.env" ]; then
    warn "File backend/.env chưa có!"
    cp backend/.env.example backend/.env
    echo ""
    echo "================================================================"
    echo "  ⚠️  QUAN TRỌNG: Điền API keys vào file backend/.env"
    echo "  Lệnh: nano $APP_DIR/backend/.env"
    echo ""
    echo "  Các key cần điền:"
    echo "    - APPWRITE_PROJECT_ID"
    echo "    - APPWRITE_API_KEY"
    echo "    - GEMINI_API_KEY"
    echo "    - MCP_ENDPOINT (WSS URL từ xiaozhi.me)"
    echo "================================================================"
    echo ""
else
    success "File .env đã có sẵn"
fi

# ── 7. Tạo thư mục cần thiết ────────────────────────────────────
mkdir -p backend/temp_uploads
success "Thư mục tạm đã tạo"

# ── 8. Cấu hình Nginx ───────────────────────────────────────────
info "Cấu hình Nginx..."
cp deploy/nginx.conf /etc/nginx/sites-available/dhsystem

# Xóa site default nếu có
rm -f /etc/nginx/sites-enabled/default

# Enable site dhsystem
ln -sf /etc/nginx/sites-available/dhsystem /etc/nginx/sites-enabled/dhsystem
nginx -t && systemctl reload nginx
success "Nginx đã cấu hình"

# ── 9. Build và start containers ────────────────────────────────
info "Build Docker images (lần đầu có thể mất 3-5 phút)..."
docker compose build --no-cache
info "Khởi động services..."
docker compose up -d

# ── 10. Kiểm tra trạng thái ─────────────────────────────────────
sleep 5
echo ""
echo "================================================================"
echo "  Trạng thái Services:"
echo "================================================================"
docker compose ps
echo ""

# Test health check
if curl -s -f http://localhost:8000/ > /dev/null; then
    success "✅ MCP Server đang chạy tại http://localhost:8000"
else
    warn "⚠️  Server chưa sẵn sàng, đợi thêm 30 giây..."
fi

echo ""
echo "================================================================"
echo "  ✅ Setup hoàn tất!"
echo ""
echo "  Các lệnh hữu ích:"
echo "    Xem logs:  docker compose logs -f"
echo "    Stop:      docker compose down"
echo "    Restart:   docker compose restart"
echo "    Update:    bash deploy/update.sh"
echo ""
echo "  Bước tiếp theo:"
echo "  1. Điền .env nếu chưa: nano $APP_DIR/backend/.env"
echo "  2. Cài SSL: certbot --nginx -d YOUR_DOMAIN.com"
echo "================================================"
