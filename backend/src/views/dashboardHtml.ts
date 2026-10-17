export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monad Tap-to-Own | Monitor en Vivo del Backend</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0B0A13;
      --card-bg: rgba(23, 20, 38, 0.75);
      --card-border: rgba(131, 110, 249, 0.25);
      --monad-purple: #836EF9;
      --monad-purple-glow: rgba(131, 110, 249, 0.4);
      --text: #F4F2FB;
      --text-muted: #9E9AA7;
      --success: #00E676;
      --gold: #FFB800;
      --error: #FF5252;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Outfit', sans-serif;
      min-height: 100vh;
      padding: 24px;
      overflow-x: hidden;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(131, 110, 249, 0.18) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(0, 229, 255, 0.12) 0%, transparent 40%);
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
      flex-wrap: wrap;
      gap: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .badge-monad {
      background: linear-gradient(135deg, #836EF9, #A78BFA);
      color: #FFF;
      font-weight: 800;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 1px;
      box-shadow: 0 0 15px var(--monad-purple-glow);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-family: 'JetBrains Mono', monospace;
      background: rgba(0, 0, 0, 0.4);
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid var(--card-border);
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--error);
    }
    .dot.connected {
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    /* Web3 Monad Login Banner */
    .wallet-banner {
      background: linear-gradient(135deg, rgba(131, 110, 249, 0.15), rgba(23, 20, 38, 0.8));
      border: 1px solid var(--monad-purple);
      border-radius: 16px;
      padding: 16px 20px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      box-shadow: 0 4px 20px rgba(131, 110, 249, 0.15);
    }

    .wallet-info {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .wallet-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(131, 110, 249, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      border: 1px solid var(--monad-purple);
    }

    .btn-login-monad {
      background: linear-gradient(135deg, #836EF9, #6D28D9);
      color: #FFF;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 15px;
      padding: 12px 24px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 18px var(--monad-purple-glow);
    }

    .btn-login-monad:hover {
      transform: translateY(-2px);
      filter: brightness(1.15);
      box-shadow: 0 6px 24px var(--monad-purple-glow);
    }

    .badge-verified {
      background: rgba(0, 230, 118, 0.15);
      border: 1px solid var(--success);
      color: var(--success);
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .balance-badge {
      background: rgba(0, 230, 118, 0.12);
      border: 1px solid rgba(0, 230, 118, 0.4);
      color: var(--success);
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    /* Barra de Configuración de Transacción On-Chain */
    .onchain-config-bar {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 12px 18px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
      font-size: 13px;
    }

    .mode-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.05);
      padding: 4px;
      border-radius: 10px;
    }

    .mode-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .mode-btn.active {
      background: var(--monad-purple);
      color: #FFF;
      box-shadow: 0 0 10px var(--monad-purple-glow);
    }

    .contract-addr-input {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: #FFF;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 8px;
      width: 280px;
      outline: none;
    }

    .grid-assets {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 28px;
    }

    .asset-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 20px;
      backdrop-filter: blur(12px);
      transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
      position: relative;
      overflow: hidden;
    }

    .asset-card:hover {
      transform: translateY(-3px);
      border-color: rgba(131, 110, 249, 0.5);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .asset-name {
      font-size: 20px;
      font-weight: 700;
      color: #FFF;
    }

    .asset-origin {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .badge-price {
      background: rgba(131, 110, 249, 0.15);
      border: 1px solid rgba(131, 110, 249, 0.3);
      color: #C4B5FD;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }

    .progress-wrap {
      margin: 16px 0;
    }

    .progress-labels {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    .progress-bar-bg {
      height: 10px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 5px;
      overflow: hidden;
      position: relative;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #836EF9, #00E5FF);
      width: 0%;
      border-radius: 5px;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .patron-box {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 16px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .patron-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--gold);
      font-weight: 700;
    }

    .patron-addr {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #FFF;
    }

    .tap-actions {
      display: flex;
      gap: 8px;
    }

    .btn-tap {
      flex: 1;
      background: linear-gradient(135deg, #836EF9, #6D28D9);
      border: none;
      color: #FFF;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 14px;
      padding: 10px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 4px 15px rgba(131, 110, 249, 0.3);
    }

    .btn-tap:hover {
      transform: scale(1.02);
      filter: brightness(1.15);
    }

    .btn-tap:active {
      transform: scale(0.97);
    }

    .btn-tap-x5 {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--card-border);
      color: #FFF;
      padding: 10px 14px;
      border-radius: 10px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.15s;
    }

    .btn-tap-x5:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .bottom-layout {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 20px;
    }

    @media (max-width: 900px) {
      .bottom-layout {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 20px;
      backdrop-filter: blur(12px);
    }

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .feed-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 280px;
      overflow-y: auto;
    }

    .feed-item {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      border-left: 3px solid var(--monad-purple);
      animation: fadeIn 0.3s ease;
    }

    .feed-item.new-patron {
      border-left-color: var(--gold);
      background: rgba(255, 184, 0, 0.08);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }

    .stat-pill {
      background: rgba(0, 0, 0, 0.3);
      padding: 10px;
      border-radius: 10px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .stat-val {
      font-size: 18px;
      font-weight: 800;
      color: #FFF;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <h1 style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Tap-to-Own <span style="color: var(--monad-purple);">RWA</span></h1>
      <span class="badge-monad">Monad 300ms</span>
    </div>
    <div class="header-actions">
      <div id="walletBalanceBadge" style="display: none;" class="balance-badge">
        <span>💰 Saldo:</span>
        <strong id="walletBalanceText">0.0000 MON</strong>
      </div>
      <div class="connection-status">
        <div id="statusDot" class="dot"></div>
        <span id="statusText">Conectando SSE...</span>
      </div>
    </div>
  </header>

  <!-- BANNER DE LOGUEO NATIVO POR MONAD -->
  <div class="wallet-banner">
    <div class="wallet-info">
      <div class="wallet-icon">☕</div>
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 id="walletTitle" style="font-size: 16px; font-weight: 700;">Acceso a la Plataforma Monad</h3>
          <span id="authBadge" style="display: none;" class="badge-verified">✓ Verificado en Monad</span>
        </div>
        <p id="walletSubtitle" style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">
          Para jugar y comprar micro-acciones, inicia sesión firmando con tu wallet en Monad Testnet (Chain ID 10143).
        </p>
      </div>
    </div>

    <div id="authActionContainer">
      <button id="btnLogin" class="btn-login-monad" onclick="loginWithMonad()">
        <span>🦊 Conectar Wallet Monad</span>
      </button>
    </div>
  </div>

  <!-- BARRA DE CONTROL ON-CHAIN / SIMULACIÓN -->
  <div class="onchain-config-bar">
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-weight: 700;">MODO DE COMPRA:</span>
      <div class="mode-toggle">
        <button id="btnModeOnChain" class="mode-btn active" onclick="setMode('onchain')">⚡ En Cadena Real (Descuenta MON)</button>
        <button id="btnModeSim" class="mode-btn" onclick="setMode('sim')">🧪 Simulación (0 Gas)</button>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 12px; color: var(--text-muted);">Contrato / Tesorería:</span>
      <input type="text" id="contractAddrInput" class="contract-addr-input" placeholder="0x... (Opcional, predeterminado)" />
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-pill">
      <div class="stat-val" id="totalTapsCount">0</div>
      <div class="stat-desc">Taps Realizados</div>
    </div>
    <div class="stat-pill">
      <div class="stat-val" style="color: var(--gold);" id="totalVolumeCount">0.00 MON</div>
      <div class="stat-desc">Volumen Global</div>
    </div>
    <div class="stat-pill">
      <div class="stat-val" style="color: var(--success);" id="totalDividendsCount">0.00 MON</div>
      <div class="stat-desc">Dividendos Repartidos</div>
    </div>
  </div>

  <div class="grid-assets" id="assetsContainer">
    <!-- Rellenado dinámicamente con los 4 activos vía SSE / API -->
  </div>

  <div class="bottom-layout">
    <div class="panel">
      <div class="panel-title">
        <span>🏆 Guerra de Patrones (Leaderboard)</span>
      </div>
      <div id="leaderboardList" class="feed-list">
        <div style="font-size: 13px; color: var(--text-muted);">Cargando ranking...</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">
        <span>⚡ Feed de Taps en Vivo (300ms Blocks)</span>
      </div>
      <div id="feedList" class="feed-list">
        <div style="font-size: 13px; color: var(--text-muted);">Esperando transacciones...</div>
      </div>
    </div>
  </div>

  <script>
    const MONAD_CHAIN_ID_HEX = '0x279f'; // 10143 en hex
    const MONAD_NETWORK_PARAMS = {
      chainId: MONAD_CHAIN_ID_HEX,
      chainName: 'Monad Testnet',
      nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
      rpcUrls: ['https://testnet-rpc.monad.xyz/'],
      blockExplorerUrls: ['https://testnet.monadexplorer.com/'],
    };

    let currentUser = null;
    let sessionToken = localStorage.getItem('monad_session_token') || null;
    let assetsData = [];
    let tapCounter = 0;
    let purchaseMode = 'onchain'; // 'onchain' o 'sim'
    let configuredContractAddress = '';

    function setMode(mode) {
      purchaseMode = mode;
      document.getElementById('btnModeOnChain').className = 'mode-btn ' + (mode === 'onchain' ? 'active' : '');
      document.getElementById('btnModeSim').className = 'mode-btn ' + (mode === 'sim' ? 'active' : '');
    }

    // Consultar el saldo real en MON de la wallet conectada
    async function updateWalletBalance() {
      if (!currentUser || !window.ethereum) return;
      try {
        const balanceHex = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [currentUser, 'latest']
        });
        const balanceWei = BigInt(balanceHex);
        const balanceMon = (Number(balanceWei) / 1e18).toFixed(4);
        document.getElementById('walletBalanceText').innerText = balanceMon + ' MON';
        document.getElementById('walletBalanceBadge').style.display = 'inline-flex';
      } catch (err) {
        console.error('Error obteniendo saldo de Monad:', err);
      }
    }

    // Conectar y autenticar mediante firma criptográfica de Monad (SIWE)
    async function loginWithMonad() {
      const btn = document.getElementById('btnLogin');
      if (!window.ethereum) {
        alert('No se detectó wallet EVM (MetaMask, Rabby o similar). Instala una para continuar.');
        return;
      }

      try {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Conectando...</span>';

        // 1. Solicitar cuentas
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const account = accounts[0];

        // 2. Comprobar / Cambiar a Monad Testnet (Chain ID 10143)
        const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
        if (currentChain !== MONAD_CHAIN_ID_HEX) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: MONAD_CHAIN_ID_HEX }],
            });
          } catch (switchError) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [MONAD_NETWORK_PARAMS],
              });
            } else {
              throw switchError;
            }
          }
        }

        // 3. Solicitar reto criptográfico (Challenge/Nonce) al backend
        btn.innerHTML = '<span>✍️ Firmando reto...</span>';
        const challengeRes = await fetch('/api/auth/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: account })
        });
        const challengeData = await challengeRes.json();

        if (!challengeData.success) {
          throw new Error(challengeData.error || 'Error solicitando reto');
        }

        const { message } = challengeData.data;

        // 4. Solicitar firma personal con la wallet en Monad (0 gas)
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [message, account],
        });

        // 5. Enviar firma al backend para verificarla
        btn.innerHTML = '<span>🛡️ Verificando...</span>';
        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: account, signature })
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          throw new Error(verifyData.error || 'Firma no válida');
        }

        // Guardar sesión
        sessionToken = verifyData.sessionToken;
        currentUser = account;
        localStorage.setItem('monad_session_token', sessionToken);
        localStorage.setItem('monad_user_address', account);

        updateAuthUI(account);
        await updateWalletBalance();
      } catch (err) {
        console.error('Error en autenticación Monad:', err);
        alert('Error autenticando con Monad: ' + (err.message || err));
        btn.disabled = false;
        btn.innerHTML = '<span>🦊 Conectar Wallet Monad</span>';
      }
    }

    function updateAuthUI(address) {
      document.getElementById('walletTitle').innerText = 'Sesión Activa en Monad';
      document.getElementById('authBadge').style.display = 'inline-flex';
      document.getElementById('walletSubtitle').innerHTML = 
        'Wallet: <strong style="color: #FFF; font-family: monospace;">' + address + '</strong> • Red: <strong style="color: #836EF9;">Monad Testnet</strong>';

      document.getElementById('authActionContainer').innerHTML = \`
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: 'JetBrains Mono'; font-size: 13px; color: var(--success); font-weight: 700;">🟢 Conectado</span>
          <button class="btn-tap-x5" onclick="logoutMonad()" style="padding: 6px 12px; font-size: 12px;">Cerrar Sesión</button>
        </div>
      \`;
    }

    function logoutMonad() {
      sessionToken = null;
      currentUser = null;
      localStorage.removeItem('monad_session_token');
      localStorage.removeItem('monad_user_address');
      location.reload();
    }

    async function checkExistingSession() {
      const savedToken = localStorage.getItem('monad_session_token');
      if (savedToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': 'Bearer ' + savedToken }
          });
          const data = await res.json();
          if (data.authenticated) {
            currentUser = data.user.address;
            sessionToken = savedToken;
            updateAuthUI(currentUser);
            await updateWalletBalance();
          } else {
            localStorage.removeItem('monad_session_token');
          }
        } catch (e) {
          console.error('Error restaurando sesión:', e);
        }
      }
    }

    // EJECUTAR COMPRA / TAP (EN CADENA REAL O SIMULADO)
    async function sendTap(assetId, shares = 1) {
      if (!currentUser) {
        const proceed = confirm('Debes conectar tu wallet de Monad para comprar acciones y competir por el lote. ¿Deseas conectarte ahora?');
        if (proceed) {
          await loginWithMonad();
        }
        return;
      }

      const asset = assetsData.find(a => a.id === assetId);
      if (!asset) return;

      // 1. Calcular costo exacto de la compra en MON
      const costMon = (asset.currentPrice * shares).toFixed(6);
      const costWei = BigInt(Math.floor(parseFloat(costMon) * 1e18));
      const costWeiHex = '0x' + costWei.toString(16);

      let txHash = undefined;

      try {
        // 2. Si está en Modo On-Chain: Solicitar transacción real en MetaMask para descontar MON
        if (purchaseMode === 'onchain') {
          const customAddr = document.getElementById('contractAddrInput').value.trim();
          const targetTo = customAddr || configuredContractAddress || currentUser;

          // Si hay contrato configurado, codificamos la llamada buyShares(assetId, shares)
          // Selector: 0xbeebc5da
          let callData = '0x';
          if (customAddr || configuredContractAddress) {
            const paramAssetId = BigInt(assetId).toString(16).padStart(64, '0');
            const paramShares = BigInt(shares).toString(16).padStart(64, '0');
            callData = '0xbeebc5da' + paramAssetId + paramShares;
          }

          // ABRIR METAMASK PARA CONFIRMAR Y DESCONTAR FONDOS REALES
          txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
              from: currentUser,
              to: targetTo,
              value: costWeiHex,
              data: callData,
            }]
          });

          console.log('[+] Transacción enviada en Monad Testnet! TxHash:', txHash);
        }

        // 3. Registrar compra en el backend
        const res = await fetch('/api/tap-to-own/tap', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (sessionToken || '')
          },
          body: JSON.stringify({ 
            assetId, 
            buyerAddress: currentUser, 
            sharesCount: shares,
            txHash
          })
        });

        const data = await res.json();
        if (!data.success) {
          alert('Error en Tap: ' + (data.error || 'Desconocido'));
        }

        // 4. Actualizar el saldo de la wallet de inmediato para reflejar el descuento
        setTimeout(updateWalletBalance, 1200);
      } catch (err) {
        if (err.code === 4001) {
          console.warn('Transacción cancelada por el usuario en su wallet.');
        } else {
          console.error('Error ejecutando compra on-chain:', err);
          alert('Error en Monad: ' + (err.message || err));
        }
      }
    }

    function renderAssets() {
      const container = document.getElementById('assetsContainer');
      let html = '';
      let vol = 0;
      let divPool = 0;

      assetsData.forEach(asset => {
        vol += asset.totalVolume || 0;
        divPool += asset.dividendPool || 0;
        const pct = Math.min(100, ((asset.soldShares / asset.totalShares) * 100)).toFixed(1);

        html += \`
          <div class="asset-card" style="border-top: 3px solid \${asset.color || '#836EF9'}">
            <div class="card-top">
              <div>
                <div class="asset-name">\${asset.name}</div>
                <div class="asset-origin">\${asset.origin} • \${asset.variety}</div>
              </div>
              <div class="badge-price">\${asset.currentPrice} MON</div>
            </div>

            <div class="progress-wrap">
              <div class="progress-labels">
                <span>Acciones: \${asset.soldShares} / \${asset.totalShares}</span>
                <span style="font-weight: 700; color: #FFF;">\${pct}%</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: \${pct}%; background: \${asset.color || '#836EF9'}"></div>
              </div>
            </div>

            <div class="patron-box">
              <div>
                <div class="patron-label">👑 Patrón del Lote</div>
                <div class="patron-addr">\${asset.patron || 'Sin Patrón'}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 11px; color: var(--text-muted);">ACCIONES</div>
                <div style="font-size: 14px; font-weight: 800; color: #FFF;">\${asset.patronShares || 0}</div>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 14px;">
              <span>Pool Dividendos: <strong style="color: var(--success);">\${asset.dividendPool} MON</strong></span>
              <span>Vol: <strong>\${asset.totalVolume} MON</strong></span>
            </div>

            <div class="tap-actions">
              <button class="btn-tap" onclick="sendTap(\${asset.id}, 1)">🔥 TAP (+1)</button>
              <button class="btn-tap-x5" onclick="sendTap(\${asset.id}, 5)">+5</button>
            </div>
          </div>
        \`;
      });

      container.innerHTML = html;
      document.getElementById('totalVolumeCount').innerText = vol.toFixed(3) + ' MON';
      document.getElementById('totalDividendsCount').innerText = divPool.toFixed(4) + ' MON';
    }

    function renderLeaderboard(board) {
      const el = document.getElementById('leaderboardList');
      if (!board || board.length === 0) return;

      let html = '';
      board.slice(0, 6).forEach((user, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1);
        const patronBadges = user.patronOfAssets && user.patronOfAssets.length > 0 
          ? \`<span style="color: var(--gold); font-size: 11px; font-weight: 700;">👑 \${user.patronOfAssets.length} Lote(s)</span>\` 
          : '';

        html += \`
          <div class="feed-item">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">\${medal}</span>
              <span style="font-family: 'JetBrains Mono'; font-weight: 600;">\${user.address}</span>
              \${patronBadges}
            </div>
            <div style="font-family: 'JetBrains Mono'; font-weight: 700; color: #FFF;">
              \${user.totalShares} acciones
            </div>
          </div>
        \`;
      });
      el.innerHTML = html;
    }

    function addFeedEvent(evt) {
      tapCounter++;
      document.getElementById('totalTapsCount').innerText = tapCounter;

      const feed = document.getElementById('feedList');
      const item = document.createElement('div');
      item.className = 'feed-item ' + (evt.isNewPatron ? 'new-patron' : '');

      const timeStr = new Date(evt.timestamp).toLocaleTimeString();
      const badge = evt.isNewPatron 
        ? '<strong style="color: var(--gold);">👑 ¡NUEVO PATRÓN!</strong>' 
        : '<span style="color: #836EF9;">TAP</span>';

      const txLink = evt.txHash 
        ? \`<a href="https://testnet.monadexplorer.com/tx/\${evt.txHash}" target="_blank" style="color: #00E5FF; text-decoration: none; margin-left: 6px;">[Tx ↗]</a>\` 
        : '';

      item.innerHTML = \`
        <div>
          \${badge} <strong style="color: #FFF;">\${evt.buyer}</strong> compró <strong>\${evt.shares}</strong> acc. de <em>\${evt.assetName}</em> \${txLink}
        </div>
        <div style="font-family: 'JetBrains Mono'; font-size: 11px; color: var(--text-muted);">
          \${evt.totalCost} MON • \${timeStr}
        </div>
      \`;

      feed.insertBefore(item, feed.firstChild);
      if (feed.children.length > 15) {
        feed.removeChild(feed.lastChild);
      }
    }

    // Inicializar Conexión SSE en vivo
    function initSSE() {
      const dot = document.getElementById('statusDot');
      const txt = document.getElementById('statusText');

      const evtSource = new EventSource('/api/tap-to-own/stream');

      evtSource.onopen = () => {
        dot.className = 'dot connected';
        txt.innerText = 'Monad Live SSE Conectado (300ms)';
      };

      evtSource.onerror = () => {
        dot.className = 'dot';
        txt.innerText = 'Desconectado (Reintentando...)';
      };

      evtSource.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data);
          if (payload.type === 'INITIAL_STATE') {
            assetsData = payload.assets;
            renderAssets();
            renderLeaderboard(payload.leaderboard);
            if (payload.recentEvents) {
              payload.recentEvents.forEach(e => addFeedEvent(e));
            }
          } else if (payload.type === 'TAP_EXECUTED') {
            if (payload.asset) {
              const idx = assetsData.findIndex(a => a.id === payload.asset.id);
              if (idx !== -1) assetsData[idx] = payload.asset;
              renderAssets();
            }
            if (payload.event) {
              addFeedEvent(payload.event);
            }
            fetch('/api/tap-to-own/leaderboard')
              .then(r => r.json())
              .then(d => { if (d.success) renderLeaderboard(d.data); });
          }
        } catch (e) {
          console.error('Error parseando SSE:', e);
        }
      };
    }

    // Cargar información del contrato desde el backend
    async function loadContractInfo() {
      try {
        const res = await fetch('/api/tap-to-own/contract-info');
        const data = await res.json();
        if (data.contract && data.contract.address && data.contract.address.startsWith('0x')) {
          configuredContractAddress = data.contract.address;
          document.getElementById('contractAddrInput').value = configuredContractAddress;
        }
      } catch (e) {
        console.error('Error cargando contract info:', e);
      }
    }

    window.addEventListener('DOMContentLoaded', () => {
      checkExistingSession();
      loadContractInfo();
      initSSE();
    });
  </script>
</body>
</html>`;
}
