# Reproducible script to build, test, and deploy TapToOwnArena locally
$ErrorActionPreference = "Stop"

# Ensure foundry is in PATH
if (!(Get-Command "forge" -ErrorAction SilentlyContinue)) {
    if (Test-Path "$env:USERPROFILE\.foundry\bin") {
        $env:PATH += ";$env:USERPROFILE\.foundry\bin"
    } else {
        Write-Error "Foundry not found in PATH or ~/.foundry/bin. Please install foundry first."
    }
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  1. Compiling Smart Contracts (Solc 0.8.24 / IR)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
forge build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "  2. Running All Test Suites & 40-Wallet Benchmark" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
forge test -vv
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "  3. Local Deployment Simulation (Anvil / Forge VM)" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
# Ephemeral local deployment simulation using standard forge dry-run
if (-not $env:PRIVATE_KEY) {
    $env:PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
}
forge script scripts/DeployTapToOwnArena.s.sol --sig "run()"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n[+] All steps completed successfully!" -ForegroundColor Green
