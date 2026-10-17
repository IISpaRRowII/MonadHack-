#!/usr/bin/env bash
set -e

echo "=================================================="
echo "  Iniciando Tap-to-Own: Monad RWA (Puerto Unico)   "
echo "=================================================="

# 1. Asegurar que el frontend este compilado
if [ ! -f "frontend/dist/index.html" ]; then
    echo ""
    echo "[1/2] Compilando Frontend de React..."
    npm --prefix frontend run build
fi

# 2. Iniciar el servidor integrado
echo ""
echo "[2/2] Lanzando servidor integrado en http://localhost:3000 ..."
npm --prefix backend run dev
