#!/usr/bin/env bash
set -e

echo "=================================================="
echo "  1. Compiling Smart Contracts (Solc 0.8.24 / IR)"
echo "=================================================="
forge build

echo ""
echo "=================================================="
echo "  2. Running All Test Suites & 40-Wallet Benchmark"
echo "=================================================="
forge test -vv

echo ""
echo "=================================================="
echo "  3. Local Deployment Simulation (Anvil / Forge VM)"
echo "=================================================="
if [ -z "$PRIVATE_KEY" ]; then
  export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
fi
forge script scripts/DeployTapToOwnArena.s.sol --sig "run()"

echo ""
echo "[+] All steps completed successfully!"
