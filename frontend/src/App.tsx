// src/App.tsx
import React, { useState, useMemo } from 'react';
import {
  SimulationProvider,
  useSimulation,
} from './context/SimulationContext';
import type { AssetId } from './engine/economics';
import {
  MAX_SUPPLY,
  MAJORITY_THRESHOLD,
  getSpotPrice,
  quoteBuy,
  quoteSell,
  formatCurrency,
  REDEEM_OPTIONS,
} from './engine/economics';
import { OwnershipGrid } from './components/OwnershipGrid';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Download,
  Trophy,
  Wallet,
  BarChart3,
  Tv,
  Sparkles,
  ArrowUpRight,
  Flame,
  Crown,
  Users,
  Bot,
  AlertTriangle,
  Maximize2,
  Home,
  LayoutGrid,
  Package,
  Gift,
  Truck,
  CheckCircle2,
  Coins,
  Radio,
  ShieldCheck,
  FileCode,
  ExternalLink,
  Lock,
  Server,
  Activity,
} from 'lucide-react';

type ActiveTab = 'LANDING' | 'ARENA' | 'ASSET_DETAIL' | 'PORTFOLIO' | 'RANKING' | 'PROJECTOR';

const MainDashboard: React.FC = () => {
  const {
    mode,
    setMode,
    walletAddress,
    connectWallet,
    walletBalanceMon,
    isRunning,
    setIsRunning,
    speedMs,
    setSpeedMs,
    hotAssetId,
    setHotAssetId,
    tickCount,
    assets,
    participants,
    trades,
    leaders,
    notifications,
    redemptions,
    majorityCelebration,
    dismissCelebration,
    executeTrade,
    claimHumanRewards,
    executeBurnRedeem,
    injectBusinessRealYield,
    triggerCompetitiveBattle,
    resetSimulation,
    exportDemoResults,

    // Backend integration
    backendOnline,
    sseConnected,
    contractInfo,
    authSession,
    authenticateWalletWithMonad,
    logoutAuthSession,
    backendEvents,
    backendLeaderboard,
    refreshBackendData,
  } = useSimulation();

  const [activeTab, setActiveTab] = useState<ActiveTab>('LANDING');
  const [selectedAssetId, setSelectedAssetId] = useState<AssetId>('cafe-montana-dorada');
  const [tradeQuantity, setTradeQuantity] = useState<Record<AssetId, number>>({
    'cafe-montana-dorada': 10,
    'cafe-volcan-rojo': 10,
    'arte-urbano-medellin': 10,
    'local-genesis': 10,
  });
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [showContractModal, setShowContractModal] = useState<boolean>(false);
  const [leaderboardSource, setLeaderboardSource] = useState<'SIMULATOR' | 'BACKEND'>('SIMULATOR');
  const [isSigningAuth, setIsSigningAuth] = useState<boolean>(false);
  const [contractCopied, setContractCopied] = useState<boolean>(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    assetId: AssetId;
    type: 'BUY' | 'SELL';
    units: bigint;
    quoteSummary: string;
  } | null>(null);
  const [pendingBurnConfirmation, setPendingBurnConfirmation] = useState<{
    assetId: AssetId;
    optionId: string;
    optionTitle: string;
    requiredUnits: bigint;
    realWorldItem: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const human = participants['HUMAN'];
  const assetList = useMemo(() => Object.values(assets), [assets]);
  const selectedAsset = assets[selectedAssetId];

  const handleSignAuth = async () => {
    setIsSigningAuth(true);
    try {
      await authenticateWalletWithMonad();
    } finally {
      setIsSigningAuth(false);
    }
  };

  const copyContractAddress = () => {
    if (contractInfo?.contract.address) {
      navigator.clipboard.writeText(contractInfo.contract.address);
      setContractCopied(true);
      setTimeout(() => setContractCopied(false), 2000);
    }
  };

  const confirmBurnRedeem = () => {
    if (!pendingBurnConfirmation) return;
    executeBurnRedeem(pendingBurnConfirmation.assetId, pendingBurnConfirmation.optionId);
    setPendingBurnConfirmation(null);
  };

  // Clasificación global de participantes (Humano + 40 Bots)
  const leaderboard = useMemo(() => {
    return Object.values(participants)
      .map((p) => {
        let totalUnits = 0n;
        let portfolioLiquidationValue = 0n;
        let assetsLed = 0;

        (Object.keys(assets) as AssetId[]).forEach((aid) => {
          const u = p.holdings[aid];
          totalUnits += u;
          if (u > 0n) {
            try {
              portfolioLiquidationValue += quoteSell(assets[aid], u).netTotal;
            } catch {
              // ignore
            }
          }
          if (leaders[aid] === p.id) {
            assetsLed += 1;
          }
        });

        const netWorth = p.balance + portfolioLiquidationValue + p.pendingRewards;
        return {
          ...p,
          totalUnits,
          portfolioLiquidationValue,
          netWorth,
          assetsLed,
        };
      })
      .sort((a, b) => {
        if (b.totalUnits !== a.totalUnits) return b.totalUnits > a.totalUnits ? 1 : -1;
        return b.netWorth > a.netWorth ? 1 : -1;
      });
  }, [participants, assets, leaders]);

  const handlePlayerTradeRequest = (assetId: AssetId, type: 'BUY' | 'SELL', rawUnits: number) => {
    if (isSubmitting) return;
    const cleanUnits = Math.floor(Number(rawUnits));
    if (!Number.isFinite(cleanUnits) || cleanUnits <= 0) {
      executeTrade('HUMAN', assetId, type, 0n);
      return;
    }

    const unitsBig = BigInt(cleanUnits);
    const asset = assets[assetId];

    // Confirmación preventiva antes de operaciones grandes (>= 50 unidades)
    if (unitsBig >= 50n) {
      try {
        const q = type === 'BUY' ? quoteBuy(asset, unitsBig) : quoteSell(asset, unitsBig);
        setPendingConfirmation({
          assetId,
          type,
          units: unitsBig,
          quoteSummary: `${type === 'BUY' ? 'Comprar' : 'Vender'} ${unitsBig.toString()} unidades de ${
            asset.name
          } por un neto de ${formatCurrency(q.netTotal)} (Comisión: ${formatCurrency(q.totalFee)})`,
        });
        return;
      } catch (err: any) {
        executeTrade('HUMAN', assetId, type, unitsBig);
        return;
      }
    }

    setIsSubmitting(true);
    executeTrade('HUMAN', assetId, type, unitsBig);
    setTimeout(() => setIsSubmitting(false), 180);
  };

  const confirmLargeTrade = () => {
    if (!pendingConfirmation) return;
    executeTrade('HUMAN', pendingConfirmation.assetId, pendingConfirmation.type, pendingConfirmation.units);
    setPendingConfirmation(null);
  };
  //************************ */
  const toggleProjectorFullscreen = () => {
    setActiveTab('PROJECTOR');
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] text-slate-100 flex flex-col selection:bg-violet-500 selection:text-white">
      {/* BARRA SUPERIOR DE NAVEGACIÓN Y MODO DEMO / TESTNET */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#07080d]/90 border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('LANDING')}
              className="flex items-center gap-2.5 text-left group focus:outline-none"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 via-blue-600 to-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-black tracking-tight text-lg bg-gradient-to-r from-white via-violet-200 to-emerald-300 bg-clip-text text-transparent">
                  TAP-TO-OWN
                </span>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                  Arena Competitiva
                </span>
              </div>
            </button>

            <nav className="hidden md:flex items-center gap-1 ml-4 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
              {[
                { id: 'LANDING', label: 'Inicio', icon: Home },
                { id: 'ARENA', label: 'Arena', icon: LayoutGrid },
                { id: 'ASSET_DETAIL', label: 'Detalle & Grid', icon: BarChart3 },
                { id: 'PORTFOLIO', label: 'Portafolio', icon: Wallet },
                { id: 'RANKING', label: 'Ranking', icon: Trophy },
                { id: 'PROJECTOR', label: 'Host 16:9', icon: Tv },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as ActiveTab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* ESTADO BACKEND & SSE STREAM + SELECTOR DE MODO */}
          <div className="flex items-center gap-3">
            {/* Indicadores vivos de Backend y SSE */}
            <div className="hidden xl:flex items-center gap-2">
              <div
                title={backendOnline ? "Servidor Express en puerto 3000 activo" : "Intentando reconectar con servidor"}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition ${
                  backendOnline
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                API {backendOnline ? 'Conectada (:3000)' : 'Desconectada'}
              </div>

              <div
                title="Server-Sent Events activo para actualizaciones en tiempo real a proyectores y celulares"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition ${
                  sseConnected
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400'
                }`}
              >
                <Radio className={`w-3 h-3 ${sseConnected ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                SSE Stream {sseConnected ? '< 300ms' : 'Offline'}
              </div>

              <button
                onClick={() => setShowContractModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-bold cursor-pointer transition shadow-sm"
              >
                <FileCode className="w-3 h-3 text-violet-400" />
                Contrato & APIs
              </button>
            </div>

            {/* Saldo y Wallet */}
            {mode === 'MONAD_TESTNET' ? (
              <div className="flex items-center gap-2">
                {walletAddress ? (
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
                    <div className="text-right">
                      <span className="block text-[10px] uppercase font-mono tracking-wider text-slate-400">
                        {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                      </span>
                      <span className="font-mono text-xs font-bold text-violet-300">
                        {walletBalanceMon} MON
                      </span>
                    </div>

                    {authSession ? (
                      <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          SIWE OK
                        </span>
                        <button
                          onClick={logoutAuthSession}
                          title="Cerrar sesión autenticada"
                          className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleSignAuth}
                        disabled={isSigningAuth}
                        className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                      >
                        <Lock className="w-3 h-3" />
                        {isSigningAuth ? 'Firmando...' : 'Firmar SIWE'}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={connectWallet}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold shadow-md shadow-violet-600/30 cursor-pointer hover:opacity-95"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Conectar Wallet
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
                <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                  Saldo Simulado (Off-Chain Demo)
                </span>
                <span className="font-mono text-sm font-bold text-emerald-400" data-testid="human-balance">
                  {formatCurrency(human.balance)}
                </span>
              </div>
            )}

            {/* Selector DEMO vs MONAD TESTNET */}
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setMode('DEMO')}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  mode === 'DEMO'
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                DEMO MODE
              </button>
              <button
                onClick={() => setMode('MONAD_TESTNET')}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  mode === 'MONAD_TESTNET'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                MONAD TESTNET
              </button>
            </div>
          </div>
        </div>

        {/* Navegación móvil adaptable */}
        <div className="flex md:hidden items-center gap-1 mt-2 overflow-x-auto pb-1">
          {[
            { id: 'LANDING', label: 'Inicio' },
            { id: 'ARENA', label: 'Arena' },
            { id: 'ASSET_DETAIL', label: 'Detalle' },
            { id: 'PORTFOLIO', label: 'Portafolio' },
            { id: 'RANKING', label: 'Ranking' },
            { id: 'PROJECTOR', label: 'Proyector' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as ActiveTab)}
              className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                activeTab === item.id ? 'bg-violet-600 text-white' : 'bg-slate-900 text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* PANEL DE CONTROL DEL MOTOR DE SIMULACIÓN (40 BOTS) */}
      <section
        aria-label="Controles del motor de simulación"
        className="bg-slate-900/95 border-b border-slate-800 px-4 py-2"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-violet-300">
              <Bot className="w-4 h-4 text-violet-400" />
              Motor: 40 Bots Activos
            </span>

            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold cursor-pointer transition ${
                isRunning
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isRunning ? 'Pausar Bots' : 'Reanudar Bots'}
            </button>

            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800">
              <span className="text-slate-400">Velocidad:</span>
              {[
                { label: '0.5x', ms: 2200 },
                { label: '1x', ms: 1200 },
                { label: '2x', ms: 600 },
                { label: '5x', ms: 250 },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSpeedMs(s.ms)}
                  className={`px-1.5 py-0.5 rounded font-mono cursor-pointer ${
                    speedMs === s.ms ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <label htmlFor="hot-asset-select" className="text-slate-400">
                Foco actividad:
              </label>
              <select
                id="hot-asset-select"
                value={hotAssetId}
                onChange={(e) => setHotAssetId(e.target.value as AssetId | 'ALL')}
                className="bg-transparent text-slate-200 font-medium focus:outline-none"
              >
                <option value="ALL" className="bg-slate-900">
                  Todos los activos
                </option>
                {assetList.map((a) => (
                  <option key={a.id} value={a.id} className="bg-slate-900">
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => triggerCompetitiveBattle()}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-gradient-to-r from-orange-500 to-pink-600 text-white font-bold shadow-sm hover:opacity-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              Generar Batalla Competitiva
            </button>

            <button
              onClick={() => setShowStatsModal(true)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
            >
              Estadísticas ({tickCount} ops)
            </button>

            <button
              onClick={exportDemoResults}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar JSON
            </button>

            <button
              onClick={resetSimulation}
              data-testid="reset-button"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800/60 font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar
            </button>
          </div>
        </div>
      </section>

      {/* NOTIFICACIONES Y EVENTOS EN TIEMPO REAL */}
      {notifications.length > 0 && (
        <div className="bg-slate-950/90 border-b border-slate-800/80 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 truncate">
              <span
                className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                  notifications[0].type === 'MAJORITY_CONQUEST'
                    ? 'bg-emerald-500 text-slate-950'
                    : notifications[0].type === 'LEADER_CHANGE'
                    ? 'bg-violet-600 text-white'
                    : notifications[0].type === 'TRADE_ERROR' || notifications[0].type === 'CAPACITY_ALERT'
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {notifications[0].title}
              </span>
              <span className="text-slate-300 truncate">{notifications[0].message}</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              Última Tx: {trades[0]?.txId || 'DEMO-READY'}
            </span>
          </div>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL SEGÚN PÁGINA SELECCIONADA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {/* 1. LANDING PAGE */}
        {activeTab === 'LANDING' && (
          <div className="space-y-10">
            <div className="relative rounded-2xl overflow-hidden border border-violet-500/30 bg-gradient-to-br from-slate-900 via-[#111322] to-slate-950 p-8 md:p-12 shadow-2xl">
              <div className="max-w-3xl space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  Simulación Jugable en Tiempo Real • 40 Bots Autónomos • Bonding Curve Lineal
                </div>
                <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white leading-none">
                  Own the Moment.{' '}
                  <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                    Rule the Asset.
                  </span>
                </h1>
                <p className="text-slate-300 text-base md:text-lg leading-relaxed">
                  Compite en tiempo real por el dominio de cuatro activos emblemáticos con suministro estricto de{' '}
                  <strong className="text-white">1.000 unidades</strong> cada uno. Opera sobre una curva de valoración lineal exacta en{' '}
                  <code className="text-emerald-400">BigInt</code>, recibe dividendos por volumen y conquista la mayoría absoluta (&gt;500 unidades).
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    onClick={() => {
                      setMode('DEMO');
                      setActiveTab('ARENA');
                    }}
                    data-testid="enter-arena-btn"
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold text-sm shadow-[0_0_20px_rgba(139,92,246,0.5)] cursor-pointer transition"
                  >
                    Entrar a la Arena (Demo Mode Instantáneo)
                  </button>
                  <button
                    onClick={toggleProjectorFullscreen}
                    className="px-5 py-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm flex items-center gap-2 cursor-pointer transition"
                  >
                    <Tv className="w-4 h-4 text-emerald-400" />
                    Abrir Modo Proyector (16:9)
                  </button>
                </div>
              </div>
            </div>

            {/* Presentación de los 4 activos en la Landing */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">
                Los 4 Mercados en Disputa (Capacidad: 1.000 Unidades c/u)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {assetList.map((asset) => {
                  const spot = getSpotPrice(asset.basePrice, asset.slope, asset.totalSupply);
                  const leaderId = leaders[asset.id];
                  const leaderName = leaderId ? participants[leaderId]?.name : 'Sin líder';
                  return (
                    <div
                      key={asset.id}
                      className="bg-slate-900/90 border border-slate-800 hover:border-violet-500/50 rounded-xl p-5 flex flex-col justify-between transition"
                    >
                      <div>
                        <span
                          className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2"
                          style={{ backgroundColor: `${asset.color}22`, color: asset.color }}
                        >
                          {asset.category}
                        </span>
                        <h3 className="text-lg font-bold text-white">{asset.name}</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{asset.description}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Precio Spot:</span>
                          <span className="font-mono font-bold text-white">{formatCurrency(spot)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Suministro:</span>
                          <span className="font-mono text-emerald-400">
                            {asset.totalSupply.toString()} / 1.000 u.
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Líder actual:</span>
                          <span className="font-semibold text-violet-300 truncate max-w-[130px]">
                            {leaderName}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedAssetId(asset.id);
                            setActiveTab('ASSET_DETAIL');
                          }}
                          className="w-full mt-2 py-2 rounded-lg bg-slate-800 hover:bg-violet-600 text-white font-semibold transition cursor-pointer"
                        >
                          Inspeccionar Activo
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. ARENA COMPETITIVA */}
        {activeTab === 'ARENA' && (
          <div className="space-y-6">
            {/* Métricas globales distinguiendo Humanos y Bots */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  Participantes Activos
                </span>
                <p className="text-xl font-black text-white mt-1">1 Humano vs 40 Bots</p>
                <span className="text-[11px] text-emerald-400">4 Arquetipos de IA operando</span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Operaciones Ejecutadas</span>
                <p className="text-xl font-black font-mono text-white mt-1">{tickCount} Txs (DEMO-)</p>
                <span className="text-[11px] text-slate-400">
                  Tus operaciones: {human.tradesCount} | Bots: {Math.max(0, tickCount - human.tradesCount)}
                </span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Tus Recompensas Acumuladas</span>
                <p className="text-xl font-black font-mono text-violet-300 mt-1">
                  {formatCurrency(human.pendingRewards)}
                </p>
                <button
                  onClick={claimHumanRewards}
                  disabled={human.pendingRewards <= 0n}
                  className="text-[11px] text-emerald-400 underline disabled:text-slate-600 cursor-pointer"
                >
                  Reclamar al saldo ahora
                </button>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Mercados bajo tu Liderazgo</span>
                <p className="text-xl font-black text-amber-400 mt-1">
                  {Object.values(leaders).filter((id) => id === 'HUMAN').length} de 4 Activos
                </p>
                <span className="text-[11px] text-slate-400">Meta Mayoría: 501+ u.</span>
              </div>
            </div>

            {/* Las 4 tarjetas de activos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {assetList.map((asset) => {
                const spot = getSpotPrice(asset.basePrice, asset.slope, asset.totalSupply);
                const pctChange =
                  asset.initialPrice > 0n
                    ? Number(((spot - asset.initialPrice) * 10000n) / asset.initialPrice) / 100
                    : 0;
                const supplyNum = Number(asset.totalSupply);
                const progressPct = (supplyNum / 1000) * 100;
                const leaderId = leaders[asset.id];
                const leaderPart = leaderId ? participants[leaderId] : null;
                const leaderUnits = leaderPart ? leaderPart.holdings[asset.id] : 0n;
                const hasAbsoluteMajority = leaderUnits >= MAJORITY_THRESHOLD;
                const humanHoldings = human.holdings[asset.id];
                const qty = tradeQuantity[asset.id] || 10;

                let buyPreview = '0.00 MON';
                try {
                  buyPreview = formatCurrency(quoteBuy(asset, BigInt(Math.max(1, qty))).netTotal);
                } catch {
                  buyPreview = 'Capacidad Llena';
                }

                return (
                  <div
                    key={asset.id}
                    data-testid={`asset-card-${asset.id}`}
                    className={`bg-slate-900/95 border rounded-2xl p-5 transition-all shadow-lg ${
                      leaderId === 'HUMAN'
                        ? 'border-emerald-500/70 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ backgroundColor: asset.color }}
                          />
                          <h3 className="text-lg font-extrabold text-white">{asset.name}</h3>
                          {hasAbsoluteMajority && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                              <Crown className="w-3 h-3" /> MAYORÍA ABSOLUTA
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{asset.description}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-semibold">
                            <Package className="w-3 h-3 text-violet-400" />
                            Respaldo RWA: {asset.rwaBacking}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                            <Coins className="w-3 h-3 text-emerald-400" />
                            Yield Real Activo
                          </span>
                          {asset.totalBurnedUnits > 0n && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/15 border border-orange-500/30 text-orange-300 text-[10px] font-bold">
                              <Flame className="w-3 h-3 text-orange-400" />
                              {asset.totalBurnedUnits.toString()} u. Redimidas
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-xl font-black text-white block">
                          {formatCurrency(spot)}
                        </span>
                        <span
                          className={`text-xs font-mono font-bold ${
                            pctChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {pctChange >= 0 ? '+' : ''}
                          {pctChange.toFixed(1)}% desde apertura
                        </span>
                      </div>
                    </div>

                    {/* Barra de progreso de suministro (Límite 1.000 unidades) */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 font-medium">
                          Suministro Circulante:{' '}
                          <strong className="font-mono text-white">{supplyNum} / 1.000 u.</strong>
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            supplyNum >= 900 ? 'text-orange-400' : 'text-slate-400'
                          }`}
                        >
                          {1000 - supplyNum} disponibles
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full transition-all duration-300 rounded-full"
                          style={{
                            width: `${Math.min(100, progressPct)}%`,
                            backgroundColor: supplyNum >= 900 ? '#f97316' : asset.color,
                          }}
                        />
                      </div>
                    </div>

                    {/* Estado de liderazgo y tenencia del jugador */}
                    <div className="mt-4 grid grid-cols-3 gap-2 bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 text-xs">
                      <div>
                        <span className="text-slate-400 block">Líder Actual</span>
                        <span
                          className={`font-bold truncate block mt-0.5 ${
                            leaderId === 'HUMAN' ? 'text-emerald-400' : 'text-violet-300'
                          }`}
                        >
                          {leaderPart ? `${leaderPart.name} (${leaderUnits.toString()} u.)` : 'Vacante'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Tu Posición</span>
                        <span
                          className="font-mono font-bold text-white block mt-0.5"
                          data-testid={`human-units-${asset.id}`}
                        >
                          {humanHoldings.toString()} unidades
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Volumen Acum.</span>
                        <span className="font-mono text-slate-200 block mt-0.5">
                          {formatCurrency(asset.volumeTotal, 0)}
                        </span>
                      </div>
                    </div>

                    {/* Controles de operación rápida en Arena */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <label htmlFor={`qty-${asset.id}`} className="text-xs text-slate-400">
                          Cant:
                        </label>
                        <input
                          id={`qty-${asset.id}`}
                          type="number"
                          min={1}
                          max={1000}
                          value={qty}
                          onChange={(e) =>
                            setTradeQuantity((prev) => ({
                              ...prev,
                              [asset.id]: Math.max(1, parseInt(e.target.value || '1', 10)),
                            }))
                          }
                          className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:border-violet-500 focus:outline-none"
                        />
                        {[5, 25, 100].map((preset) => (
                          <button
                            key={preset}
                            onClick={() =>
                              setTradeQuantity((prev) => ({ ...prev, [asset.id]: preset }))
                            }
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-300 cursor-pointer"
                          >
                            {preset}u
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePlayerTradeRequest(asset.id, 'BUY', qty)}
                          disabled={asset.totalSupply >= MAX_SUPPLY}
                          data-testid={`buy-btn-${asset.id}`}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs cursor-pointer transition"
                        >
                          Comprar ({buyPreview})
                        </button>
                        <button
                          onClick={() => handlePlayerTradeRequest(asset.id, 'SELL', qty)}
                          disabled={humanHoldings <= 0n}
                          data-testid={`sell-btn-${asset.id}`}
                          className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs cursor-pointer transition"
                        >
                          Vender
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAssetId(asset.id);
                            setActiveTab('ASSET_DETAIL');
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-violet-600 text-slate-200 cursor-pointer"
                          title="Ver Detalle y Cuadrícula 20x50"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. DETALLE DEL ACTIVO + CUADRÍCULA 20x50 */}
        {activeTab === 'ASSET_DETAIL' && (
          <div className="space-y-6">
            {/* Selector de activo */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3">
              <div className="flex flex-wrap gap-2">
                {assetList.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAssetId(a.id)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer transition ${
                      selectedAssetId === a.id
                        ? 'bg-violet-600 text-white shadow'
                        : 'bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {a.name} ({a.totalSupply.toString()}/1000)
                  </button>
                ))}
              </div>
              <button
                onClick={() => triggerCompetitiveBattle(selectedAssetId)}
                className="px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-bold cursor-pointer"
              >
                Simular Ataque de Bots en este Activo
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Gráfico histórico de precios (2 columnas) */}
              <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-black text-white">{selectedAsset.name}</h2>
                    <p className="text-xs text-slate-400">
                      Curva Lineal: Precio Base {formatCurrency(selectedAsset.basePrice)} +{' '}
                      {formatCurrency(selectedAsset.slope)} por unidad emitida
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Precio Spot Actual</span>
                    <span className="font-mono text-2xl font-black text-emerald-400">
                      {formatCurrency(
                        getSpotPrice(
                          selectedAsset.basePrice,
                          selectedAsset.slope,
                          selectedAsset.totalSupply
                        )
                      )}
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedAsset.priceHistory}>
                      <defs>
                        <linearGradient id="assetColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={selectedAsset.color} stopOpacity={0.45} />
                          <stop offset="95%" stopColor={selectedAsset.color} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timestamp" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={selectedAsset.color}
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#assetColor)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Calculadora de Cotizaciones y Ejecución */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-violet-300">
                    Terminal de Cotización Exacta (BigInt)
                  </h3>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Unidades a Operar (Máx disp: {(MAX_SUPPLY - selectedAsset.totalSupply).toString()} u.)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={tradeQuantity[selectedAssetId] || 10}
                      onChange={(e) =>
                        setTradeQuantity((prev) => ({
                          ...prev,
                          [selectedAssetId]: Math.max(1, parseInt(e.target.value || '1', 10)),
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white"
                    />
                  </div>

                  {/* Desglose de Cotización de Compra */}
                  {(() => {
                    const qUnits = BigInt(Math.max(1, tradeQuantity[selectedAssetId] || 10));
                    try {
                      const qBuy = quoteBuy(selectedAsset, qUnits);
                      return (
                        <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Valor Base Curva:</span>
                            <span className="font-mono text-slate-200">{formatCurrency(qBuy.baseValue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Comisión Reserva (1.5%):</span>
                            <span className="font-mono text-slate-300">{formatCurrency(qBuy.protocolFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Recompensa Holders (1.5%):</span>
                            <span className="font-mono text-emerald-400">{formatCurrency(qBuy.rewardFee)}</span>
                          </div>
                          <div className="flex justify-between pt-1.5 border-t border-slate-800 font-bold">
                            <span className="text-white">Total Compra:</span>
                            <span className="font-mono text-emerald-400">{formatCurrency(qBuy.netTotal)}</span>
                          </div>
                        </div>
                      );
                    } catch (e: any) {
                      return (
                        <div className="bg-orange-950/40 border border-orange-500/40 rounded-lg p-3 text-xs text-orange-300">
                          {e.message}
                        </div>
                      );
                    }
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={() =>
                      handlePlayerTradeRequest(
                        selectedAssetId,
                        'BUY',
                        tradeQuantity[selectedAssetId] || 10
                      )
                    }
                    className="py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Comprar Unidades
                  </button>
                  <button
                    onClick={() =>
                      handlePlayerTradeRequest(
                        selectedAssetId,
                        'SELL',
                        tradeQuantity[selectedAssetId] || 10
                      )
                    }
                    className="py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Vender ({human.holdings[selectedAssetId].toString()} disp.)
                  </button>
                </div>
              </div>
            </div>

            {/* MÓDULO RWA: REDENCIÓN FÍSICA (BURN-TO-REDEEM) Y RENDIMIENTO REAL (REAL YIELD) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Canjear Activo Físico (Burn-to-Redeem) */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-amber-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Gift className="w-5 h-5 text-amber-400" />
                        <h3 className="text-base font-extrabold text-white">
                          Canjear Activo Físico (Burn-to-Redeem)
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Quema tus participaciones on-chain y recibe el producto o servicio tangible con trazabilidad.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider shrink-0">
                      RWA Físico
                    </span>
                  </div>

                  {(() => {
                    const option = REDEEM_OPTIONS[selectedAssetId];
                    const userUnits = human.holdings[selectedAssetId];
                    const canRedeem = userUnits >= option.requiredUnits;
                    const remainingNeeded = option.requiredUnits - userUnits;

                    return (
                      <div className="mt-5 space-y-4">
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-bold text-amber-300 block">{option.title}</span>
                              <p className="text-xs text-slate-300 mt-0.5">{option.description}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-semibold shrink-0">
                              {option.badge}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">Unidades a Quemar:</span>
                              <span className="font-mono font-bold text-amber-400">
                                {option.requiredUnits.toString()} u.
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">Tu Tenencia Disponible:</span>
                              <span className={`font-mono font-bold ${canRedeem ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {userUnits.toString()} u.
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                            <Truck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>Logística: {option.estimatedDelivery}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div className="text-xs text-slate-400">
                            <span className="block text-[11px]">Total Redimidas (Burned):</span>
                            <span className="font-mono font-bold text-orange-400">
                              {selectedAsset.totalBurnedUnits.toString()} u. fuera de circulación
                            </span>
                          </div>

                          <button
                            onClick={() =>
                              setPendingBurnConfirmation({
                                assetId: selectedAssetId,
                                optionId: option.id,
                                optionTitle: option.title,
                                requiredUnits: option.requiredUnits,
                                realWorldItem: option.realWorldItem,
                              })
                            }
                            disabled={!canRedeem}
                            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                              canRedeem
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-lg shadow-orange-500/20'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <Flame className="w-4 h-4" />
                            {canRedeem
                              ? `Quemar ${option.requiredUnits.toString()} u. y Canjear Físico`
                              : `Te faltan ${remainingNeeded.toString()} u. para canjear`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 2. Rendimiento Real del Negocio (Real Yield / Revenue Sharing) */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-base font-extrabold text-white">
                          Flujo de Caja Real (Real Yield / Revenue Sharing)
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Inyección directa de ventas del negocio físico al Reward Pool, repartida pro-rata a todos los tenedores.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider shrink-0">
                      Yield Orgánico
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs">
                        <span className="text-slate-400 block text-[11px]">Facturación Física Inyectada:</span>
                        <span className="font-mono text-lg font-black text-emerald-400 block mt-0.5">
                          {formatCurrency(selectedAsset.businessRevenueInjected)}
                        </span>
                        <span className="text-[10px] text-slate-500">Total histórico al pool</span>
                      </div>

                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs">
                        <span className="text-slate-400 block text-[11px]">Proyección Mensual:</span>
                        <span className="font-mono text-lg font-black text-white block mt-0.5">
                          +{formatCurrency(selectedAsset.monthlyYieldTarget, 0)}
                        </span>
                        <span className="text-[10px] text-emerald-400">Reparto 100% pro-rata</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                      <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider">
                        Fuente del Flujo Real:
                      </span>
                      <p className="text-slate-300 leading-relaxed">{selectedAsset.yieldSource}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800/80 mt-4">
                  <p className="text-[11px] text-slate-400">
                    Simulación interactiva para el jurado: inyecta el flujo de caja del mes en vivo.
                  </p>
                  <button
                    onClick={() => injectBusinessRealYield(selectedAssetId)}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 shrink-0 cursor-pointer transition"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Simular Liquidación (+MON al Pool)
                  </button>
                </div>
              </div>
            </div>

            {/* CUADRÍCULA OBLIGATORIA DE 20 x 50 CELDAS (1.000 UNIDADES) */}
            <OwnershipGrid
              asset={selectedAsset}
              participants={participants}
              leaderId={leaders[selectedAssetId]}
            />

            {/* Ranking de propietarios del activo e historial de operaciones */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-3">
                  Top Propietarios en {selectedAsset.name}
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {Object.values(participants)
                    .filter((p) => p.holdings[selectedAssetId] > 0n)
                    .sort((a, b) =>
                      b.holdings[selectedAssetId] > a.holdings[selectedAssetId] ? 1 : -1
                    )
                    .slice(0, 10)
                    .map((holder, idx) => {
                      const u = holder.holdings[selectedAssetId];
                      const pct = Number(u) / 10;
                      return (
                        <div
                          key={holder.id}
                          className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-400">#{idx + 1}</span>
                            <span
                              className={`font-bold ${
                                !holder.isBot ? 'text-emerald-400' : 'text-slate-200'
                              }`}
                            >
                              {holder.name}
                            </span>
                            {u >= MAJORITY_THRESHOLD && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                Mayoría Absoluta
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-white">
                            {u.toString()} u. ({pct.toFixed(1)}%)
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-3">
                  Historial de Operaciones Simuladas (Prefijo DEMO-)
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {trades
                    .filter((t) => t.assetId === selectedAssetId)
                    .slice(0, 15)
                    .map((t) => (
                      <div
                        key={t.txId}
                        className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-xs"
                      >
                        <div>
                          <span className="font-mono text-[11px] text-violet-400 font-semibold mr-2">
                            {t.txId}
                          </span>
                          <span
                            className={`font-bold mr-1.5 ${
                              t.type === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {t.type === 'BUY' ? 'COMPRA' : 'VENTA'}
                          </span>
                          <span className="text-slate-300">{t.participantName}</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-white font-bold">{t.units.toString()} u.</span>{' '}
                          <span className="text-slate-400">({formatCurrency(t.totalValue)})</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. PORTAFOLIO DEL JUGADOR */}
        {activeTab === 'PORTFOLIO' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Saldo Disponible (Demo)</span>
                <p className="text-xl font-black font-mono text-emerald-400 mt-1">
                  {formatCurrency(human.balance)}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">PnL Realizado (Cerrado)</span>
                <p
                  className={`text-xl font-black font-mono mt-1 ${
                    human.realizedPnL >= 0n ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatCurrency(human.realizedPnL)}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs text-slate-400">Recompensas Pendientes</span>
                <p className="text-xl font-black font-mono text-violet-300 mt-1">
                  {formatCurrency(human.pendingRewards)}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Recompensas Reclamadas</span>
                  <p className="text-lg font-bold font-mono text-white mt-1">
                    {formatCurrency(human.claimedRewards)}
                  </p>
                </div>
                <button
                  onClick={claimHumanRewards}
                  disabled={human.pendingRewards <= 0n}
                  data-testid="claim-rewards-btn"
                  className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold cursor-pointer"
                >
                  Reclamar
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800">
                <h2 className="text-base font-bold text-white">
                  Desglose de Tenencias, Valor de Salida Estimado y PnL No Realizado
                </h2>
                <p className="text-xs text-slate-400">
                  Las cifras de liquidación descuentan la comisión de salida del 3.0% sobre la curva lineal actual.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 uppercase">
                      <th className="p-3">Activo</th>
                      <th className="p-3">Unidades</th>
                      <th className="p-3">Costo Base Acumulado</th>
                      <th className="p-3">Cotización Salida (Neto)</th>
                      <th className="p-3">Comisión Estimada</th>
                      <th className="p-3">PnL Estimado (No Realizado)</th>
                      <th className="p-3 text-right">Acción Rápida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {assetList.map((asset) => {
                      const units = human.holdings[asset.id];
                      const cost = human.costBasis[asset.id];
                      let exitNet = 0n;
                      let exitFee = 0n;
                      if (units > 0n) {
                        try {
                          const q = quoteSell(asset, units);
                          exitNet = q.netTotal;
                          exitFee = q.totalFee;
                        } catch {
                          // ignore
                        }
                      }
                      const unrealized = exitNet - cost;

                      return (
                        <tr key={asset.id} className="hover:bg-slate-800/40">
                          <td className="p-3 font-bold text-white">{asset.name}</td>
                          <td className="p-3 font-mono">{units.toString()} u.</td>
                          <td className="p-3 font-mono">{formatCurrency(cost)}</td>
                          <td className="p-3 font-mono text-slate-200">{formatCurrency(exitNet)}</td>
                          <td className="p-3 font-mono text-slate-400">{formatCurrency(exitFee)}</td>
                          <td
                            className={`p-3 font-mono font-bold ${
                              unrealized >= 0n ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {units > 0n ? formatCurrency(unrealized) : '0.00 MON'}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handlePlayerTradeRequest(asset.id, 'SELL', Number(units))}
                              disabled={units <= 0n}
                              className="px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold cursor-pointer"
                            >
                              Liquidar Todo
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECCIÓN DE CERTIFICADOS Y DESPACHO FÍSICO RWA (BURN-TO-REDEEM) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-400" />
                    Certificados de Redención Física y Despachos (Burn-to-Redeem)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Registro de micro-acciones quemadas para canjear productos o servicios físicos reales con trazabilidad on-chain.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                  {redemptions.length} Canjes Realizados
                </span>
              </div>

              {redemptions.length === 0 ? (
                <div className="bg-slate-950 rounded-xl p-8 border border-slate-800 text-center space-y-3">
                  <Gift className="w-10 h-10 text-slate-600 mx-auto" />
                  <h4 className="text-sm font-bold text-white">Aún no has canjeado activos físicos</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Acumula participaciones de los 4 mercados en la Arena y quémalas en el Detalle del Activo para canjear bolsas de café especial, kits baristas, láminas de arte o pases VIP de coworking.
                  </p>
                  <button
                    onClick={() => setActiveTab('ARENA')}
                    className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer transition"
                  >
                    Ir a la Arena a Operar
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {redemptions.map((r) => (
                    <div
                      key={r.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                            {r.id}
                          </span>
                          <span className="font-bold text-white text-sm">{r.realWorldItem}</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            {r.status === 'CONFIRMED' ? 'Confirmado On-Chain' : r.status}
                          </span>
                        </div>
                        <p className="text-slate-400">
                          Mercado: <strong className="text-slate-200">{r.assetName}</strong> • Canjeado el{' '}
                          {new Date(r.timestamp).toLocaleString('es-CO')}
                        </p>
                        <p className="font-mono text-slate-500 text-[11px] truncate">
                          Tracking / Delivery Hash: {r.trackingHash}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-right shrink-0">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Unidades Quemadas:</span>
                          <span className="font-mono font-black text-orange-400 text-sm">
                            -{r.unitsBurned.toString()} u.
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400 font-semibold text-[11px]">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Despacho en Preparación
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. RANKING GLOBAL Y LÍDERES */}
        {activeTab === 'RANKING' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    Clasificación General de Jugadores
                  </h2>
                  <p className="text-xs text-slate-400">
                    {leaderboardSource === 'SIMULATOR'
                      ? 'Ranking en memoria del motor local (Humano + 40 Bots Competitivos)'
                      : 'Leaderboard global agregado del Servidor Backend en Monad (API: /api/tap-to-own/leaderboard)'}
                  </p>
                </div>

                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setLeaderboardSource('SIMULATOR')}
                    className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                      leaderboardSource === 'SIMULATOR'
                        ? 'bg-violet-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Simulador Local (40 Bots)
                  </button>
                  <button
                    onClick={() => {
                      setLeaderboardSource('BACKEND');
                      refreshBackendData();
                    }}
                    className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      leaderboardSource === 'BACKEND'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5" />
                    Servidor Backend ({backendLeaderboard.length})
                  </button>
                </div>
              </div>

              {leaderboardSource === 'SIMULATOR' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 uppercase">
                        <th className="p-3">Pos</th>
                        <th className="p-3">Participante</th>
                        <th className="p-3">Perfil / Estrategia</th>
                        <th className="p-3">Unidades Controladas</th>
                        <th className="p-3">Mercados Liderados</th>
                        <th className="p-3">Patrimonio Neto Est.</th>
                        <th className="p-3">Insignias</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {leaderboard.slice(0, 20).map((entry, idx) => (
                        <tr
                          key={entry.id}
                          className={
                            !entry.isBot
                              ? 'bg-emerald-950/30 border-l-4 border-emerald-400'
                              : 'hover:bg-slate-800/40'
                          }
                        >
                          <td className="p-3 font-mono font-bold text-slate-300">#{idx + 1}</td>
                          <td className="p-3 font-bold text-white">{entry.name}</td>
                          <td className="p-3 text-slate-400">
                            {entry.isBot ? entry.strategy : 'HUMANO'}
                          </td>
                          <td className="p-3 font-mono font-bold text-emerald-400">
                            {entry.totalUnits.toString()} u.
                          </td>
                          <td className="p-3 font-mono text-violet-300">{entry.assetsLed}</td>
                          <td className="p-3 font-mono text-white">
                            {formatCurrency(entry.netWorth, 0)}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {entry.badges.length > 0 ? (
                                entry.badges.map((b) => (
                                  <span
                                    key={b}
                                    className="px-2 py-0.5 rounded bg-violet-500/20 border border-violet-500/40 text-violet-200 text-[10px] font-semibold"
                                  >
                                    {b}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 uppercase">
                        <th className="p-3">Pos</th>
                        <th className="p-3">Wallet / Inversionista</th>
                        <th className="p-3">Micro-Acciones Poseídas</th>
                        <th className="p-3">Lotes Bajo Control</th>
                        <th className="p-3">Total Invertido (MON)</th>
                        <th className="p-3">Dividendos Ganados (MON)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {backendLeaderboard.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                            No hay inversores registrados aún en el backend. ¡Conéctate y realiza un Tap para liderar el tablero!
                          </td>
                        </tr>
                      ) : (
                        backendLeaderboard.map((entry, idx) => (
                          <tr key={entry.address} className="hover:bg-slate-800/40">
                            <td className="p-3 font-mono font-bold text-slate-300">#{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-white flex items-center gap-1.5">
                              {entry.address.startsWith('0x')
                                ? `${entry.address.slice(0, 10)}...${entry.address.slice(-6)}`
                                : entry.address}
                              {walletAddress && entry.address.toLowerCase() === walletAddress.toLowerCase() && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                  TÚ
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-400">{entry.totalShares} u.</td>
                            <td className="p-3 text-slate-300">
                              {entry.patronOfAssets && entry.patronOfAssets.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {entry.patronOfAssets.map((name) => (
                                    <span key={name} className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                                      👑 {name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-white">{entry.totalInvestedMon.toFixed(4)} MON</td>
                            <td className="p-3 font-mono text-emerald-400 font-bold">+{entry.totalDividendsEarned.toFixed(4)} MON</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. MODO HOST / PROJECTOR (OPTIMIZADO 16:9 SIN WALLET) */}
        {activeTab === 'PROJECTOR' && (
          <div
            data-testid="projector-view"
            className="bg-slate-950 border-2 border-violet-500/40 rounded-2xl p-6 shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 block">
                  PANTALLA DE GRAN FORMATO 16:9 • EN VIVO SIN WALLET
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-white">
                  TAP-TO-OWN — ARENA LIVE TICKER
                </h2>
              </div>
              <button
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.().catch(() => {});
                  } else {
                    document.exitFullscreen?.().catch(() => {});
                  }
                }}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                Pantalla Completa
              </button>
            </div>

            {/* Banner de Estado SSE Monad */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-violet-950/60 via-slate-900 to-slate-950 border border-violet-500/30 rounded-xl px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  Stream SSE Monad en Vivo:
                </span>
                <span className="text-cyan-300 font-mono">
                  {sseConnected ? 'Conectado • Latencia < 300ms activa' : 'Off-line • Conectando a /api/tap-to-own/stream'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
                <span>Transacciones Simuladas: <strong className="text-white">{tickCount}</strong></span>
                <span>Eventos Backend: <strong className="text-emerald-400">{backendEvents.length}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {assetList.map((a) => {
                const spot = getSpotPrice(a.basePrice, a.slope, a.totalSupply);
                const lid = leaders[a.id];
                const lName = lid ? participants[lid]?.name : 'En disputa';
                const lUnits = lid ? participants[lid]?.holdings[a.id] || 0n : 0n;
                return (
                  <div
                    key={a.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400">{a.category}</span>
                        <span className="font-mono text-xs text-emerald-400">
                          {a.totalSupply.toString()}/1000 u.
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white mt-1">{a.name}</h3>
                      <p className="font-mono text-2xl font-black text-violet-300 mt-2">
                        {formatCurrency(spot)}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800 text-xs">
                      <span className="text-slate-400 block">Dominador del Mercado:</span>
                      <span className="font-bold text-white text-sm">
                        {lName} ({lUnits.toString()} u.)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-bold uppercase text-emerald-400 mb-3">
                  Top 5 Dominadores Globales
                </h3>
                <div className="space-y-2">
                  {leaderboard.slice(0, 5).map((p, i) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg text-xs"
                    >
                      <span className="font-bold text-white">
                        #{i + 1} {p.name}
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {p.totalUnits.toString()} unidades totales
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-bold uppercase text-violet-300 mb-3">
                  Últimos Movimientos en Tiempo Real
                </h3>
                <div className="space-y-2">
                  {trades.slice(0, 5).map((t) => (
                    <div
                      key={t.txId}
                      className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg text-xs"
                    >
                      <span className="font-mono text-violet-400">{t.txId}</span>
                      <span className="text-white font-semibold">
                        {t.participantName} {t.type === 'BUY' ? 'compró' : 'vendió'} {t.units.toString()} u.
                      </span>
                      <span className="font-mono text-emerald-400">{formatCurrency(t.totalValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE CONFIRMACIÓN PARA OPERACIONES GRANDES (>= 50 UNIDADES) */}
      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-violet-500 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Operación de Alto Impacto
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {pendingConfirmation.quoteSummary}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPendingConfirmation(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmLargeTrade}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Confirmar y Ejecutar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN PARA REDENCIÓN FÍSICA (BURN-TO-REDEEM) */}
      {pendingBurnConfirmation && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
              <Flame className="w-5 h-5 text-amber-400" />
              Confirmar Redención Física (Burn-to-Redeem)
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Producto a Canjear:</span>
                <span className="font-bold text-white text-right">{pendingBurnConfirmation.realWorldItem}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Unidades a Quemar:</span>
                <span className="font-mono font-bold text-orange-400">
                  {pendingBurnConfirmation.requiredUnits.toString()} u.
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Impacto en Suministro:</span>
                <span className="text-emerald-400 font-semibold">Reducción permanente de totalSupply</span>
              </div>
            </div>

            <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 leading-relaxed">
              ⚠️ <strong>Esta acción es irreversible:</strong> Las {pendingBurnConfirmation.requiredUnits.toString()} unidades se retirarán permanentemente de la circulación on-chain (Burn) y se emitirá tu certificado de canje con código de despacho físico.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPendingBurnConfirmation(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmBurnRedeem}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 text-xs font-black cursor-pointer shadow-md shadow-orange-500/30 hover:opacity-95"
              >
                Confirmar Quema y Canje
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CELEBRACIÓN ESPECIAL DE MAYORÍA ABSOLUTA (> 500 DE 1.000 UNIDADES) */}
      {majorityCelebration && (
        <div
          data-testid="majority-celebration"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-400 rounded-2xl max-w-lg w-full p-8 text-center space-y-4 shadow-[0_0_50px_rgba(245,158,11,0.4)]">
            <Crown className="w-14 h-14 text-amber-400 mx-auto animate-bounce" />
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black uppercase tracking-widest">
              ¡Hito de Dominio Total!
            </span>
            <h3 className="text-2xl font-black text-white">
              ¡Mayoría Absoluta en {majorityCelebration.assetName}!
            </h3>
            <p className="text-sm text-slate-300">
              <strong className="text-emerald-400">{majorityCelebration.winnerName}</strong> ha superado la barrera de las 500 unidades ({majorityCelebration.units}/1.000) y obtiene la insignia de control mayoritario.
            </p>
            <button
              onClick={dismissCelebration}
              className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs cursor-pointer"
            >
              Continuar en la Arena
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE ESTADÍSTICAS DE LA PARTIDA */}
      {showStatsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Estadísticas de la Partida (Demo)</h3>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-300">
              <p>Total Transacciones Simuladas: <strong className="text-white">{tickCount}</strong></p>
              <p>Operaciones del Jugador Humano: <strong className="text-emerald-400">{human.tradesCount}</strong></p>
              <p>Bots Operativos: <strong className="text-violet-300">40 Bots independientes</strong></p>
              <p>Prefijo de Auditoría: <code className="text-emerald-400">DEMO-*</code> (Separado de saldos on-chain)</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE INFORMACIÓN DEL CONTRATO Y CONEXIÓN BACKEND / MONAD TESTNET */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-violet-300">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    TapToOwnArena • Contrato Inteligente & API Backend
                  </h3>
                  <p className="text-xs text-slate-400">
                    Infraestructura integrada en Monad Testnet (Puerto 3000)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowContractModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Red & Conexión */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase font-mono text-[10px] block">Red Blockchain</span>
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  {contractInfo?.network.name || 'Monad Testnet'}
                </p>
                <p className="text-slate-400 font-mono text-[11px]">Chain ID: {contractInfo?.network.chainId || 10143} (0x279f)</p>
                <p className="text-slate-400 font-mono text-[11px] truncate">RPC: {contractInfo?.network.rpcUrl || 'https://testnet-rpc.monad.xyz/'}</p>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase font-mono text-[10px] block">Servidor Express (Puerto 3000)</span>
                <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  {backendOnline ? 'Servidor Backend Activo & Saludable' : 'Conectando con Backend...'}
                </p>
                <p className="text-slate-400 text-[11px]">Server-Sent Events: {sseConnected ? 'Transmitiendo (< 300ms)' : 'Reconectando...'}</p>
                <p className="text-slate-400 text-[11px]">Sesión SIWE: {authSession ? `Autenticada (${authSession.address.slice(0, 8)}...)` : 'Sin autenticar'}</p>
              </div>
            </div>

            {/* Dirección de Contrato */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-semibold">Dirección del Contrato TapToOwnArena:</span>
                <button
                  onClick={copyContractAddress}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer transition flex items-center gap-1"
                >
                  {contractCopied ? '¡Copiado!' : 'Copiar Dirección'}
                </button>
              </div>
              <code className="block bg-slate-900 px-3 py-2 rounded-lg font-mono text-xs text-violet-300 break-all select-all">
                {contractInfo?.contract.address || '0x71C8A329F64eB57f12C8519B91A088aE4601A49B'}
              </code>
            </div>

            {/* Enlaces Rápidos del Sistema */}
            <div className="space-y-1.5">
              <span className="text-slate-400 text-xs font-semibold block">Herramientas & Endpoints en Vivo:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <a
                  href="/monitor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-950 hover:bg-violet-950/40 border border-slate-800 hover:border-violet-500/40 text-violet-300 text-xs font-bold transition"
                >
                  <Server className="w-3.5 h-3.5" />
                  Dev Monitor
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
                <a
                  href="/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-950 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-500/40 text-emerald-400 text-xs font-bold transition"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Health Check
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
                <a
                  href="/api/tap-to-own/assets"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-950 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-500/40 text-blue-300 text-xs font-bold transition"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  API Activos
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
                <a
                  href="https://testnet.monadexplorer.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-950 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/40 text-cyan-300 text-xs font-bold transition"
                >
                  <Radio className="w-3.5 h-3.5" />
                  Monad Explorer
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowContractModal(false)}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs cursor-pointer transition shadow"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <SimulationProvider>
      <MainDashboard />
    </SimulationProvider>
  );
}