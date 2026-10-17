# Tap-to-Own: Real-World Asset Wars (Monad Hackathon)

**Tap-to-Own** es una arena Web3 competitiva de alta frecuencia desplegada en **Monad**, donde los participantes compiten por adquirir, liquidar y acumular el control mayoritario de micro-acciones virtuales de cuatro activos emblemáticos:

1. ☕ **Café Montaña Dorada** (Lote de café de especialidad)
2. 🌋 **Café Volcán Rojo** (Cosecha de altura volcánica)
3. 🎨 **Arte Urbano Medellín** (Mural emblemático Comuna 13)
4. 🏢 **Local Genesis** (Coffee-Lounge insignia)

Cada mercado opera de forma completamente autónoma con un **límite estricto de 1.000 unidades circulantes**, una **curva de enlace lineal matemática** ($P(s) = B + K \cdot s$), y un motor de **dividendos instantáneos $O(1)$** que recompensa a los tenedores en cada operación.

> [!NOTE]
> **Aviso Legal:** Las micro-acciones son participaciones virtuales gamificadas para demostración tecnológica. No confieren propiedad jurídica, títulos de dominio ni derechos corporativos sobre activos físicos.

---

## 🏛️ Arquitectura del Repositorio

```
MonadHack/
├── contracts/
│   └── TapToOwnArena.sol          # Contrato principal (Hardhat & Foundry)
├── src/
│   ├── TapToOwnArena.sol          # Fuente Solidity ^0.8.20 con OpenZeppelin
│   └── TapToOwn.sol               # Versión base optimizada
├── test/
│   ├── TapToOwnArenaTestPlan.t.sol   # Suite maestra de 22 casos obligatorios
│   ├── TapToOwnArenaInvariants.t.sol # 10 invariantes obligatorios + fuzzing
│   ├── TapToOwnArenaConcurrency.t.sol# Benchmark de concurrencia con 40 wallets
│   └── TapToOwnArena.t.sol           # Pruebas unitarias de trading y quotes
├── scripts/
│   ├── DeployTapToOwnArena.s.sol     # Script de despliegue Foundry a Monad Testnet
│   ├── deploy.js                     # Script de despliegue Hardhat
│   ├── reproduce_local.ps1           # Script reproducible de compilación y test (PowerShell)
│   └── reproduce_local.sh            # Script reproducible de compilación y test (Bash)
├── frontend/                         # dApp React 18 + Vite + TypeScript
│   └── src/abi/TapToOwnArena.json    # ABI generado para el cliente
├── backend/                          # API Node.js + Express + Ethers.js v6
├── python/                           # Pipeline de simulación de alta frecuencia Web3.py
├── hardhat.config.js                 # Configuración Hardhat compatible con Monad Testnet
├── foundry.toml                      # Configuración Foundry (via_ir = true, optimizer)
├── ECONOMIC_MODEL.md                 # Especificación matemática y curvas
└── SECURITY.md                       # Modelo de amenazas, invariantes y auditoría local
```

---

## ⚡ Ventajas de Monad

* **Bloques de 300ms y 10.000 TPS:** Permite que 40+ usuarios compren y cobren dividendos en vivo sin congestión ni subastas de gas.
* **Ejecución en Paralelo:** Los 4 mercados son completamente independientes en almacenamiento, eliminando conflictos de acceso y permitiendo que transacciones en distintos activos se ejecuten simultáneamente.
* **Matemática $O(1)$ sin Oráculos:** Cero dependencias externas. Toda la contabilidad es nativa y autónoma.

---

## 🚀 Inicio Rápido (Script Reproducible Local)

El proyecto incluye un script automatizado que compila, ejecuta las 66 pruebas de Foundry y simula un despliegue local:

### En Windows (PowerShell):
```powershell
.\scripts\reproduce_local.ps1
```

### En Linux / macOS / Git Bash:
```bash
chmod +x ./scripts/reproduce_local.sh
./scripts/reproduce_local.sh
```

---

## 🧪 Ejecución de Pruebas Automatizadas

Asegúrate de que Foundry esté en tu PATH:
```powershell
$env:PATH += ";$env:USERPROFILE\.foundry\bin"
```

### 1. Ejecutar Todas las Pruebas (66 tests)
```powershell
forge test
```

### 2. Ejecutar la Simulación de Concurrencia con 40 Wallets
```powershell
forge test --match-test test_Concurrency -vv
```

### 3. Ejecutar Pruebas con Hardhat
```powershell
npx hardhat compile
```

---

## 📦 Despliegue en Monad Testnet (Chain ID: 10143)

> [!IMPORTANT]
> **No despliegues en Mainnet.** Este contrato está diseñado exclusivamente para la red de pruebas de Monad (Testnet).

### 1. Configurar Variables de Entorno
Crea o edita tu `.env` (el archivo está protegido en `.gitignore`):
```env
MONAD_RPC_URL=https://testnet-rpc.monad.xyz/
MONAD_CHAIN_ID=10143
PRIVATE_KEY=<TU_LLAVE_PRIVADA_CON_FONDOS_DE_TESTNET>
```

### 2. Desplegar con Foundry
```powershell
forge script scripts/DeployTapToOwnArena.s.sol `
  --rpc-url https://testnet-rpc.monad.xyz/ `
  --broadcast
```

### 3. O Desplegar con Hardhat
```powershell
npx hardhat run scripts/deploy.js --network monadTestnet
```

---

## 💻 Ejecución del Frontend y Backend

### Frontend (React + Vite en puerto 5173)
```powershell
cd frontend
npm run dev
```

### Backend (Express en puerto 3001)
```powershell
cd backend
npm run dev
```

### Simulador en Python
```powershell
python python/main.py
```

---

## 📄 Documentación Adicional

* [ECONOMIC_MODEL.md](file:///c:/Monad-Project/MonadHack/ECONOMIC_MODEL.md): Fórmulas de $C_{buy}$, $C_{sell}$, precios marginales, comisiones del 2% y solvencia de reservas.
* [SECURITY.md](file:///c:/Monad-Project/MonadHack/SECURITY.md): Mitigaciones contra reentrancia, slippage, auditoría local y gestión de claves.
