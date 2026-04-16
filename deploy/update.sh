#!/bin/bash
# ================================================================
# DHsystem — Update Script
# Chạy lệnh này mỗi khi muốn cập nhật code mới lên VPS
#
# Usage: bash deploy/update.sh
# ================================================================
set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }

echo ""
echo "=== DHsystem — Update ==="
echo ""

# Pull code mới nhất
info "Pull code mới từ GitHub..."
git pull
success "Code đã cập nhật"

# Rebuild và restart containers
info "Rebuild Docker images..."
docker compose build --no-cache

info "Restart services..."
docker compose up -d

# Đợi services khởi động
sleep 5
echo ""
echo "=== Trạng thái sau update ==="
docker compose ps
echo ""

# Xem logs gần nhất
info "Logs 30 giây gần nhất:"
docker compose logs --tail=30
success "Update hoàn tất!"
