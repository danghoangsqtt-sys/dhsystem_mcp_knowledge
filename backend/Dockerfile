# DHsystem Knowledge Hub — Production Dockerfile
# Compatible: ARM64 (Hetzner CAX11) + AMD64
FROM python:3.11-slim

# Metadata
LABEL maintainer="DHsystem" \
      description="DHsystem MCP Knowledge Hub Backend"

# Install system dependencies
# ffmpeg: audio conversion Opus↔PCM cho ESP32 bridge
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Tạo user không phải root (bảo mật)
RUN useradd -m -u 1000 dhsystem

WORKDIR /app

# Cài Python dependencies trước (tận dụng Docker layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY --chown=dhsystem:dhsystem . .

# Tạo thư mục cần thiết
RUN mkdir -p chroma_data temp_uploads && \
    chown -R dhsystem:dhsystem /app

USER dhsystem

# Expose ports
EXPOSE 8000 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

# Default: chạy unified server (MCP + WebSocket bridge)
CMD ["python", "server.py"]
