#!/bin/bash
# PortfolioDesk — Başlatma Script'i
# Kullanım: ./start.sh

ROOT=$(cd "$(dirname "$0")" && pwd)
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "🚀 PortfolioDesk başlatılıyor..."
echo ""

# --- Backend ---
echo "▶ Backend başlatılıyor (http://localhost:3001)..."
cd "$BACKEND" && npm run dev &
BACKEND_PID=$!

# --- Frontend ---
echo "▶ Frontend başlatılıyor (http://localhost:3000)..."
cd "$FRONTEND"

# Python varsa kullan, yoksa node http-server dene
if command -v python3 &>/dev/null; then
  python3 -m http.server 3000 &
elif command -v python &>/dev/null; then
  python -m SimpleHTTPServer 3000 &
else
  echo "⚠ Python bulunamadı. Frontend'i manuel açın: frontend/index.html"
fi
FRONTEND_PID=$!

echo ""
echo "✅ Hazır!"
echo "   Backend  → http://localhost:3001/api/health"
echo "   Frontend → http://localhost:3000"
echo ""
echo "Durdurmak için CTRL+C"

# İkisini birlikte kapat
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Durduruldu.'" SIGINT SIGTERM
wait
