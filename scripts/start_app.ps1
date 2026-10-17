# Inicia la aplicación completa en un solo puerto: http://localhost:3000
$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Iniciando Tap-to-Own: Monad RWA (Puerto Unico)   " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Asegurar que el frontend este compilado
if (-not (Test-Path "frontend/dist/index.html")) {
    Write-Host "`n[1/2] Compilando Frontend de React..." -ForegroundColor Yellow
    npm --prefix frontend run build
}

# 2. Iniciar el servidor integrado
Write-Host "`n[2/2] Lanzando servidor integrado en http://localhost:3000 ..." -ForegroundColor Green
npm --prefix backend run dev
