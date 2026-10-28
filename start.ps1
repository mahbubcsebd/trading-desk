# TradeDesk: Starts both backend Engine and Next.js Web Dashboard
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Starting TradeDesk Engine & Dashboard... " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Start Engine in background or new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'TradeDesk Engine running on http://127.0.0.1:8000' -ForegroundColor Green; cd engine; uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

# 2. Start Web Frontend in current window
Write-Host "TradeDesk Web Dashboard launching on http://localhost:3000..." -ForegroundColor Green
Set-Location -Path "web"
npm run dev
