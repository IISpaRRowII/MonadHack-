// src/context/SimulationContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type {
  AssetId,
  AssetState,
  Participant,
  TradeRecord,
  RedemptionRecord,
} from '../engine/economics';
import {
  MAX_SUPPLY,
  MAJORITY_THRESHOLD,
  createInitialAssets,
  createInitialParticipants,
  quoteBuy,
  quoteSell,
  burnToRedeem,
  REDEEM_OPTIONS,
  getSpotPrice,
  wadToNumber,
  formatCurrency,
} from '../engine/economics';
import {
  backendApi,
  BackendTapEvent,
  BackendLeaderboardEntry,
  ContractInfo,
} from '../services/backendApi';

export type NetworkMode = 'DEMO' | 'MONAD_TESTNET';

export interface GameNotification {
  id: string;
  type:
    | 'LEADER_CHANGE'
    | 'MAJORITY_CONQUEST'
    | 'TRADE_SUCCESS'
    | 'TRADE_ERROR'
    | 'CAPACITY_ALERT'
    | 'REWARD_CLAIM'
    | 'WALLET_CONNECTED'
    | 'BURN_REDEEM'
    | 'REAL_YIELD_INJECTION';
  title: string;
  message: string;
  assetId?: AssetId;
  timestamp: number;
}

interface SimulationContextType {
  mode: NetworkMode;
  setMode: (mode: NetworkMode) => void;
  walletAddress: string | null;
  connectWallet: () => Promise<void>;
  walletBalanceMon: string;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  speedMs: number;
  setSpeedMs: (ms: number) => void;
  hotAssetId: AssetId | 'ALL';
  setHotAssetId: (id: AssetId | 'ALL') => void;
  tickCount: number;
  assets: Record<AssetId, AssetState>;
  participants: Record<string, Participant>;
  trades: TradeRecord[];
  leaders: Record<AssetId, string | null>;
  notifications: GameNotification[];
  redemptions: RedemptionRecord[];
  majorityCelebration: { assetName: string; winnerName: string; units: number } | null;
  dismissCelebration: () => void;
  executeTrade: (
    participantId: string,
    assetId: AssetId,
    type: 'BUY' | 'SELL',
    units: bigint
  ) => { ok: boolean; error?: string; txId?: string };
  claimHumanRewards: () => void;
  executeBurnRedeem: (
    assetId: AssetId,
    optionId: string
  ) => { ok: boolean; error?: string; redeemId?: string };
  injectBusinessRealYield: (
    assetId: AssetId,
    amountMonWei?: bigint
  ) => { ok: boolean; amountInjected: bigint; affectedHolders: number };
  triggerCompetitiveBattle: (targetAssetId?: AssetId) => void;
  resetSimulation: () => void;
  exportDemoResults: () => void;

  // Integración Backend Monad
  backendOnline: boolean;
  sseConnected: boolean;
  contractInfo: ContractInfo | null;
  authSession: { token: string; address: string } | null;
  authenticateWalletWithMonad: () => Promise<boolean>;
  logoutAuthSession: () => void;
  backendEvents: BackendTapEvent[];
  backendLeaderboard: BackendLeaderboardEntry[];
  refreshBackendData: () => Promise<void>;
}

const SimulationContext = createContext<SimulationContextType | null>(null);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<NetworkMode>('DEMO');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalanceMon, setWalletBalanceMon] = useState<string>('0.00');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [speedMs, setSpeedMs] = useState<number>(1200);
  const [hotAssetId, setHotAssetId] = useState<AssetId | 'ALL'>('ALL');
  const [tickCount, setTickCount] = useState<number>(0);

  const [assets, setAssets] = useState<Record<AssetId, AssetState>>(() => createInitialAssets());
  const [participants, setParticipants] = useState<Record<string, Participant>>(() =>
    createInitialParticipants()
  );
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [leaders, setLeaders] = useState<Record<AssetId, string | null>>({
    'cafe-montana-dorada': null,
    'cafe-volcan-rojo': null,
    'arte-urbano-medellin': null,
    'local-genesis': null,
  });
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [majorityCelebration, setMajorityCelebration] = useState<{
    assetName: string;
    winnerName: string;
    units: number;
  } | null>(null);

  // Estados de Integración con el Backend Monad
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [authSession, setAuthSession] = useState<{ token: string; address: string } | null>(() => {
    try {
      const stored = localStorage.getItem('monad_auth_session');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [backendEvents, setBackendEvents] = useState<BackendTapEvent[]>([]);
  const [backendLeaderboard, setBackendLeaderboard] = useState<BackendLeaderboardEntry[]>([]);

  const txCounterRef = useRef<number>(1);
  const redemptionsCounterRef = useRef<number>(1);
  const stateRef = useRef({ assets, participants, leaders, hotAssetId, tickCount, mode, walletAddress, authSession });
  useEffect(() => {
    stateRef.current = { assets, participants, leaders, hotAssetId, tickCount, mode, walletAddress, authSession };
  }, [assets, participants, leaders, hotAssetId, tickCount, mode, walletAddress, authSession]);

  const pushNotification = useCallback(
    (notif: Omit<GameNotification, 'id' | 'timestamp'>) => {
      const newNotif: GameNotification = {
        ...notif,
        id: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      };
      setNotifications((prev) => [newNotif, ...prev.slice(0, 14)]);
    },
    []
  );

  // Consultar datos vivos del backend y contrato
  const refreshBackendData = useCallback(async () => {
    try {
      const health = await backendApi.checkHealth();
      if (health && health.status === 'ok') {
        setBackendOnline(true);
      }
      const cInfo = await backendApi.getContractInfo();
      if (cInfo && cInfo.success) {
        setContractInfo(cInfo);
      }
      const lb = await backendApi.getLeaderboard();
      if (lb && lb.success) {
        setBackendLeaderboard(lb.data);
      }
      const evts = await backendApi.getRecentEvents();
      if (evts && evts.success) {
        setBackendEvents(evts.data);
      }
    } catch {
      // Backend desconectado o en inicialización
    }
  }, []);

  // Conectar con el Stream Server-Sent Events (SSE) del Backend (< 300ms)
  useEffect(() => {
    refreshBackendData();

    let sseConn: { close: () => void } | null = null;
    try {
      sseConn = backendApi.connectSSE(
        (data: any) => {
          setSseConnected(true);
          setBackendOnline(true);
          if (data.type === 'INITIAL_STATE') {
            if (data.leaderboard) setBackendLeaderboard(data.leaderboard);
            if (data.recentEvents) setBackendEvents(data.recentEvents);
          } else if (data.type === 'TAP_EXECUTED' && data.event) {
            setBackendEvents((prev) => [data.event, ...prev.slice(0, 49)]);
            if (data.event.isNewPatron) {
              pushNotification({
                type: 'LEADER_CHANGE',
                title: '⚡ Cambio de Patrón (SSE en Vivo)',
                message: `${data.event.buyer.slice(0, 8)}... ahora lidera ${data.event.assetName}!`,
              });
            }
          } else if (data.type === 'REAL_YIELD_INJECTED' && data.event) {
            setBackendEvents((prev) => [data.event, ...prev.slice(0, 49)]);
          } else if (data.type === 'BURN_REDEEM_EXECUTED' && data.event) {
            setBackendEvents((prev) => [data.event, ...prev.slice(0, 49)]);
          }
        },
        () => {
          setSseConnected(false);
        }
      );
    } catch {
      // Error silencioso si no hay stream activo
    }

    const interval = setInterval(() => {
      refreshBackendData();
    }, 15000);

    return () => {
      clearInterval(interval);
      sseConn?.close();
    };
  }, [pushNotification, refreshBackendData]);

  // Autenticación SIWE con Monad Testnet
  const authenticateWalletWithMonad = useCallback(async (): Promise<boolean> => {
    const rawAddr = walletAddress || stateRef.current.walletAddress;
    if (!rawAddr || !rawAddr.startsWith('0x')) {
      alert('Conecta primero tu wallet de Monad Testnet.');
      return false;
    }

    try {
      const challengeRes = await backendApi.requestAuthChallenge(rawAddr);
      if (!challengeRes.success || !challengeRes.data) {
        throw new Error('No se pudo generar el reto de autenticación SIWE.');
      }

      const signature = await (window as any).ethereum.request({
        method: 'personal_sign',
        params: [challengeRes.data.message, rawAddr],
      });

      const verifyRes = await backendApi.verifyAuthSignature(rawAddr, signature);
      if (verifyRes.success && verifyRes.sessionToken) {
        const session = { token: verifyRes.sessionToken, address: rawAddr };
        setAuthSession(session);
        localStorage.setItem('monad_auth_session', JSON.stringify(session));
        pushNotification({
          type: 'WALLET_CONNECTED',
          title: '¡Sesión Monad Testnet Autenticada!',
          message: `Firma SIWE verificada con éxito para ${rawAddr.slice(0, 6)}...${rawAddr.slice(-4)}. Token de sesión backend emitido.`,
        });
        return true;
      } else {
        throw new Error(verifyRes.message || 'Firma no validada.');
      }
    } catch (err: any) {
      console.error(err);
      pushNotification({
        type: 'TRADE_ERROR',
        title: 'Error de Autenticación SIWE',
        message: err?.message || 'Firma cancelada por el usuario.',
      });
      return false;
    }
  }, [walletAddress, pushNotification]);

  const logoutAuthSession = useCallback(() => {
    setAuthSession(null);
    localStorage.removeItem('monad_auth_session');
    pushNotification({
      type: 'WALLET_CONNECTED',
      title: 'Sesión Cerrada',
      message: 'Se ha cerrado la sesión autenticada con el backend de Monad.',
    });
  }, [pushNotification]);

  // Conexión real de Wallet para Monad Testnet (Monad Blitz)
  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      alert('No se detectó ninguna wallet instalada (MetaMask, Rabby, etc.). Instálala para usar Monad Testnet.');
      return;
    }
    try {
      const accounts = await (window as any).ethereum.request({
        method: 'eth_requestAccounts',
      });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setWalletAddress(address);
        setMode('MONAD_TESTNET');

        // Leer balance nativo de MON en Testnet
        const balanceHex = await (window as any).ethereum.request({
          method: 'eth_getBalance',
          params: [address, 'latest'],
        });
        const wei = BigInt(balanceHex);
        const monVal = Number(wei / 10n ** 14n) / 10000;
        setWalletBalanceMon(monVal.toFixed(4));

        pushNotification({
          type: 'WALLET_CONNECTED',
          title: 'Wallet Conectada con Éxito',
          message: `Dirección: ${address.slice(0, 6)}...${address.slice(-4)} | Balance: ${monVal.toFixed(2)} MON`,
        });
      }
    } catch (err: any) {
      console.error(err);
      pushNotification({
        type: 'TRADE_ERROR',
        title: 'Error de Conexión',
        message: err?.message || 'El usuario rechazó la conexión de la wallet.',
      });
    }
  };

  const calculateAssetLeader = (
    assetId: AssetId,
    currentParticipants: Record<string, Participant>,
    previousLeader: string | null
  ): string | null => {
    let maxUnits = 0n;
    let topHolder: string | null = null;

    for (const p of Object.values(currentParticipants)) {
      const u = p.holdings[assetId];
      if (u > maxUnits) {
        maxUnits = u;
        topHolder = p.id;
      } else if (u === maxUnits && u > 0n && p.id === previousLeader) {
        topHolder = previousLeader;
      }
    }
    return maxUnits > 0n ? topHolder : null;
  };

  const executeTrade = useCallback(
    (
      participantId: string,
      assetId: AssetId,
      type: 'BUY' | 'SELL',
      units: bigint
    ): { ok: boolean; error?: string; txId?: string } => {
      const currentAssets = { ...stateRef.current.assets };
      const currentParticipants = { ...stateRef.current.participants };
      const currentLeaders = { ...stateRef.current.leaders };

      const asset = { ...currentAssets[assetId] };
      const trader = {
        ...currentParticipants[participantId],
        holdings: { ...currentParticipants[participantId].holdings },
        costBasis: { ...currentParticipants[participantId].costBasis },
        badges: [...currentParticipants[participantId].badges],
      };

      try {
        const quote = type === 'BUY' ? quoteBuy(asset, units) : quoteSell(asset, units);

        if (type === 'BUY') {
          if (trader.balance < quote.netTotal) {
            throw new Error(
              `Saldo insuficiente en simulador: necesitas ${formatCurrency(quote.netTotal)} y tienes ${formatCurrency(trader.balance)}.`
            );
          }
          trader.balance -= quote.netTotal;
          trader.holdings[assetId] += units;
          trader.costBasis[assetId] += quote.netTotal;
          asset.totalSupply += units;
          asset.reserveBalance += quote.baseValue + quote.protocolFee;
        } else {
          const owned = trader.holdings[assetId];
          if (owned < units) {
            throw new Error(
              `Venta excesiva: intentas vender ${units.toString()} u. pero solo posees ${owned.toString()} u.`
            );
          }
          const avgCostRemoved = (trader.costBasis[assetId] * units) / owned;
          const realizedDelta = quote.netTotal - avgCostRemoved;

          trader.balance += quote.netTotal;
          trader.holdings[assetId] -= units;
          trader.costBasis[assetId] -= avgCostRemoved;
          trader.realizedPnL += realizedDelta;

          asset.totalSupply -= units;
          asset.reserveBalance =
            asset.reserveBalance > quote.baseValue ? asset.reserveBalance - quote.baseValue : 0n;
        }

        asset.volumeTotal += quote.baseValue;
        asset.rewardPool += quote.rewardFee;
        trader.tradesCount += 1;

        currentParticipants[participantId] = trader;
        if (asset.totalSupply > 0n && quote.rewardFee > 0n) {
          for (const pid of Object.keys(currentParticipants)) {
            const holderUnits = currentParticipants[pid].holdings[assetId];
            if (holderUnits > 0n) {
              const share = (quote.rewardFee * holderUnits) / asset.totalSupply;
              if (share > 0n) {
                currentParticipants[pid] = {
                  ...currentParticipants[pid],
                  pendingRewards: currentParticipants[pid].pendingRewards + share,
                };
              }
            }
          }
        }

        const newSpotPrice = getSpotPrice(asset.basePrice, asset.slope, asset.totalSupply);
        const nextTick = stateRef.current.tickCount + 1;
        asset.priceHistory = [
          ...asset.priceHistory.slice(-39),
          {
            tick: nextTick,
            timestamp: new Date().toLocaleTimeString('es-CO', {
              hour12: false,
              minute: '2-digit',
              second: '2-digit',
            }),
            price: wadToNumber(newSpotPrice),
            supply: Number(asset.totalSupply),
          },
        ];

        currentAssets[assetId] = asset;

        const prevLeaderId = currentLeaders[assetId];
        const newLeaderId = calculateAssetLeader(assetId, currentParticipants, prevLeaderId);
        currentLeaders[assetId] = newLeaderId;

        if (newLeaderId && newLeaderId !== prevLeaderId) {
          const leaderObj = { ...currentParticipants[newLeaderId] };
          leaderObj.leadershipChangesWon += 1;
          if (!leaderObj.badges.includes('Líder de Mercado')) {
            leaderObj.badges = [...leaderObj.badges, 'Líder de Mercado'];
          }
          currentParticipants[newLeaderId] = leaderObj;

          pushNotification({
            type: 'LEADER_CHANGE',
            title: `¡Nuevo Líder en ${asset.name}!`,
            message: `${leaderObj.name} tomó el control con ${leaderObj.holdings[assetId].toString()} unidades.`,
            assetId,
          });
        }

        const traderUnitsAfter = currentParticipants[participantId].holdings[assetId];
        if (type === 'BUY' && traderUnitsAfter >= MAJORITY_THRESHOLD && traderUnitsAfter - units < MAJORITY_THRESHOLD) {
          const badgeName = `Mayoría Absoluta: ${asset.name}`;
          if (!currentParticipants[participantId].badges.includes(badgeName)) {
            currentParticipants[participantId].badges = [
              ...currentParticipants[participantId].badges,
              badgeName,
            ];
          }
          setMajorityCelebration({
            assetName: asset.name,
            winnerName: currentParticipants[participantId].name,
            units: Number(traderUnitsAfter),
          });
          pushNotification({
            type: 'MAJORITY_CONQUEST',
            title: `¡MAYORÍA ABSOLUTA CONQUISTADA!`,
            message: `${currentParticipants[participantId].name} superó las 500 unidades en ${asset.name} (${traderUnitsAfter.toString()}/1.000).`,
            assetId,
          });
        }

        if (type === 'BUY' && asset.totalSupply >= 900n && asset.totalSupply - units < 900n) {
          pushNotification({
            type: 'CAPACITY_ALERT',
            title: `¡Capacidad Crítica en ${asset.name}!`,
            message: `Quedan solo ${(MAX_SUPPLY - asset.totalSupply).toString()} unidades disponibles antes del lleno total.`,
            assetId,
          });
        }

        const txSeq = txCounterRef.current++;
        const txId = stateRef.current.walletAddress
          ? `0xMONAD-${txSeq.toString().padStart(4, '0')}`
          : `DEMO-${txSeq.toString().padStart(6, '0')}`;

        const record: TradeRecord = {
          txId,
          timestamp: Date.now(),
          participantId,
          participantName: currentParticipants[participantId].name,
          isBot: currentParticipants[participantId].isBot,
          assetId,
          type,
          units,
          unitPriceAvg: quote.baseValue / units,
          totalValue: quote.netTotal,
          feePaid: quote.totalFee,
        };

        if (!currentParticipants[participantId].isBot) {
          pushNotification({
            type: 'TRADE_SUCCESS',
            title: `${type === 'BUY' ? 'Compra' : 'Venta'} Exitosa (${txId})`,
            message: `${units.toString()} u. de ${asset.name} por ${formatCurrency(quote.netTotal)}.`,
            assetId,
          });

          // Sincronización asíncrona con el backend en puerto 3000
          const assetIndexMap: Record<AssetId, number> = {
            'cafe-montana-dorada': 0,
            'cafe-volcan-rojo': 1,
            'arte-urbano-medellin': 2,
            'local-genesis': 3,
          };
          const buyerAddr = stateRef.current.walletAddress || '0xHUMAN_PLAYER_001';
          if (type === 'BUY') {
            backendApi
              .tapToBuy(
                assetIndexMap[assetId],
                buyerAddr,
                Number(units),
                stateRef.current.authSession?.token
              )
              .catch(() => {});
          } else {
            backendApi
              .tapToSell(assetIndexMap[assetId], buyerAddr, Number(units))
              .catch(() => {});
          }
        }

        stateRef.current.assets = currentAssets;
        stateRef.current.participants = currentParticipants;
        stateRef.current.leaders = currentLeaders;
        stateRef.current.tickCount = nextTick;

        setAssets(currentAssets);
        setParticipants(currentParticipants);
        setLeaders(currentLeaders);
        setTickCount(nextTick);
        setTrades((prev) => [record, ...prev.slice(0, 79)]);

        return { ok: true, txId };
      } catch (err: any) {
        const errorMessage = err?.message || 'Error en la operación económica.';
        if (!currentParticipants[participantId]?.isBot) {
          pushNotification({
            type: 'TRADE_ERROR',
            title: 'Operación Rechazada',
            message: errorMessage,
            assetId,
          });
        }
        return { ok: false, error: errorMessage };
      }
    },
    [pushNotification]
  );

  const runBotStep = useCallback(() => {
    const { assets: currAssets, participants: currParts, leaders: currLeaders, hotAssetId: focus } =
      stateRef.current;
    const botIds = Object.keys(currParts).filter((id) => currParts[id].isBot);
    if (botIds.length === 0) return;

    const randomBotId = botIds[Math.floor(Math.random() * botIds.length)];
    const bot = currParts[randomBotId];
    const assetKeys = Object.keys(currAssets) as AssetId[];
    let targetAssetId: AssetId = focus !== 'ALL' ? focus : assetKeys[Math.floor(Math.random() * assetKeys.length)];

    const asset = currAssets[targetAssetId];
    const botHoldings = bot.holdings[targetAssetId];
    const currentLeaderId = currLeaders[targetAssetId];
    const leaderUnits = currentLeaderId ? currParts[currentLeaderId]?.holdings[targetAssetId] || 0n : 0n;
    const remainingSupply = MAX_SUPPLY - asset.totalSupply;

    let action: 'BUY' | 'SELL' = 'BUY';
    let desiredUnits = 5n;

    switch (bot.strategy) {
      case 'AGGRESSIVE':
        if (remainingSupply > 0n) {
          action = 'BUY';
          desiredUnits = leaderUnits > botHoldings ? leaderUnits - botHoldings + 4n : 12n;
        } else if (botHoldings > 20n) {
          action = 'SELL';
          desiredUnits = 10n;
        }
        break;
      case 'FREQUENT_BUYER':
        if (remainingSupply > 0n && Math.random() < 0.8) {
          action = 'BUY';
          desiredUnits = BigInt(Math.floor(Math.random() * 12) + 3);
        } else if (botHoldings >= 5n) {
          action = 'SELL';
          desiredUnits = 4n;
        }
        break;
      case 'SELLER':
        if (botHoldings >= 6n && (asset.totalSupply > 120n || Math.random() < 0.65)) {
          action = 'SELL';
          desiredUnits = 12n;
        } else if (remainingSupply > 0n) {
          action = 'BUY';
          desiredUnits = 8n;
        }
        break;
      case 'CONSERVATIVE':
        if (asset.totalSupply < 600n && remainingSupply > 0n) {
          action = 'BUY';
          desiredUnits = 4n;
        }
        break;
    }

    if (action === 'BUY' && remainingSupply > 0n) {
      const clamped = desiredUnits > remainingSupply ? remainingSupply : desiredUnits;
      try {
        executeTrade(bot.id, targetAssetId, 'BUY', clamped);
      } catch {}
    } else if (action === 'SELL' && botHoldings > 0n) {
      const clamped = desiredUnits > botHoldings ? botHoldings : desiredUnits;
      executeTrade(bot.id, targetAssetId, 'SELL', clamped);
    }
  }, [executeTrade]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      runBotStep();
    }, speedMs);
    return () => clearInterval(timer);
  }, [isRunning, speedMs, runBotStep]);

  const claimHumanRewards = useCallback(() => {
    setParticipants((prev) => {
      const human = prev['HUMAN'];
      if (!human || human.pendingRewards <= 0n) return prev;
      const amount = human.pendingRewards;
      const updated: Participant = {
        ...human,
        balance: human.balance + amount,
        claimedRewards: human.claimedRewards + amount,
        pendingRewards: 0n,
      };
      pushNotification({
        type: 'REWARD_CLAIM',
        title: 'Recompensas Reclamadas',
        message: `Se acreditaron ${formatCurrency(amount)} a tu saldo.`,
      });
      return { ...prev, HUMAN: updated };
    });
  }, [pushNotification]);

  const triggerCompetitiveBattle = useCallback(
    (targetAssetId?: AssetId) => {
      const assetKeys = Object.keys(stateRef.current.assets) as AssetId[];
      const chosenAsset = targetAssetId || assetKeys[Math.floor(Math.random() * assetKeys.length)];
      const aggressiveBots = Object.values(stateRef.current.participants).filter((p) => p.isBot);

      for (let i = 0; i < 5; i++) {
        const contender = aggressiveBots[Math.floor(Math.random() * aggressiveBots.length)];
        const rem = MAX_SUPPLY - stateRef.current.assets[chosenAsset].totalSupply;
        if (contender && rem > 0n) {
          executeTrade(contender.id, chosenAsset, 'BUY', 12n);
        }
      }
      pushNotification({
        type: 'LEADER_CHANGE',
        title: '¡Batalla Desatada!',
        message: `Múltiples bots atacaron el activo ${stateRef.current.assets[chosenAsset].name}.`,
        assetId: chosenAsset,
      });
    },
    [executeTrade, pushNotification]
  );

  const executeBurnRedeem = useCallback(
    (assetId: AssetId, optionId: string): { ok: boolean; error?: string; redeemId?: string } => {
      const currentAssets = { ...stateRef.current.assets };
      const currentParticipants = { ...stateRef.current.participants };

      const asset = { ...currentAssets[assetId] };
      const trader = {
        ...currentParticipants['HUMAN'],
        holdings: { ...currentParticipants['HUMAN'].holdings },
        costBasis: { ...currentParticipants['HUMAN'].costBasis },
        badges: [...currentParticipants['HUMAN'].badges],
      };

      const option = REDEEM_OPTIONS[assetId];
      if (!option || option.id !== optionId) {
        return { ok: false, error: 'Opción de redención inválida para este activo.' };
      }

      if (trader.holdings[assetId] < option.requiredUnits) {
        const error = `Saldo insuficiente: requieres ${option.requiredUnits.toString()} unidades y posees ${trader.holdings[assetId].toString()} u.`;
        pushNotification({
          type: 'TRADE_ERROR',
          title: 'Redención Rechazada',
          message: error,
          assetId,
        });
        return { ok: false, error };
      }

      try {
        const { updatedAsset, remainingUnits } = burnToRedeem(
          asset,
          trader.holdings[assetId],
          option.requiredUnits
        );

        // Ajustar el costo base proporcional a las unidades restantes
        if (trader.holdings[assetId] > 0n) {
          trader.costBasis[assetId] =
            (trader.costBasis[assetId] * remainingUnits) / trader.holdings[assetId];
        }
        trader.holdings[assetId] = remainingUnits;

        // Añadir insignia RWA si no la tiene
        const rwaBadge = `Redentor RWA: ${asset.name}`;
        if (!trader.badges.includes(rwaBadge)) {
          trader.badges = [...trader.badges, rwaBadge];
        }

        const redeemSeq = redemptionsCounterRef.current++;
        const redeemId = stateRef.current.walletAddress
          ? `0xREDEEM-${redeemSeq.toString().padStart(4, '0')}`
          : `DEMO-REDEEM-${redeemSeq.toString().padStart(4, '0')}`;

        const trackingHash = `0x${Array.from({ length: 16 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join('')}`;

        const record: RedemptionRecord = {
          id: redeemId,
          timestamp: Date.now(),
          participantId: trader.id,
          participantName: trader.name,
          assetId,
          assetName: asset.name,
          optionId: option.id,
          optionTitle: option.title,
          unitsBurned: option.requiredUnits,
          realWorldItem: option.realWorldItem,
          status: 'CONFIRMED',
          trackingHash,
        };

        currentAssets[assetId] = updatedAsset;
        currentParticipants['HUMAN'] = trader;

        stateRef.current.assets = currentAssets;
        stateRef.current.participants = currentParticipants;

        setAssets(currentAssets);
        setParticipants(currentParticipants);
        setRedemptions((prev) => [record, ...prev]);

        pushNotification({
          type: 'BURN_REDEEM',
          title: '¡Redención Física Confirmada!',
          message: `Has quemado ${option.requiredUnits.toString()} u. de ${asset.name} para canjear "${option.realWorldItem}". ID: ${redeemId}`,
          assetId,
        });

        // Sincronización con backend en puerto 3000
        const assetIndexMap: Record<AssetId, number> = {
          'cafe-montana-dorada': 0,
          'cafe-volcan-rojo': 1,
          'arte-urbano-medellin': 2,
          'local-genesis': 3,
        };
        const redeemerAddr = stateRef.current.walletAddress || '0xHUMAN_PLAYER_001';
        backendApi
          .burnToRedeem(
            assetIndexMap[assetId],
            redeemerAddr,
            Number(option.requiredUnits),
            option.id,
            option.realWorldItem,
            stateRef.current.authSession?.token
          )
          .catch(() => {});

        return { ok: true, redeemId };
      } catch (err: any) {
        const error = err?.message || 'Error al procesar la redención.';
        pushNotification({
          type: 'TRADE_ERROR',
          title: 'Error de Redención',
          message: error,
          assetId,
        });
        return { ok: false, error };
      }
    },
    [pushNotification]
  );

  const injectBusinessRealYield = useCallback(
    (assetId: AssetId, amountMonWei?: bigint): { ok: boolean; amountInjected: bigint; affectedHolders: number } => {
      const currentAssets = { ...stateRef.current.assets };
      const currentParticipants = { ...stateRef.current.participants };

      const asset = { ...currentAssets[assetId] };
      const amount = amountMonWei || asset.monthlyYieldTarget;

      if (amount <= 0n) {
        return { ok: false, amountInjected: 0n, affectedHolders: 0 };
      }

      asset.rewardPool += amount;
      asset.businessRevenueInjected += amount;

      let affectedHolders = 0;
      if (asset.totalSupply > 0n) {
        for (const pid of Object.keys(currentParticipants)) {
          const holderUnits = currentParticipants[pid].holdings[assetId];
          if (holderUnits > 0n) {
            const share = (amount * holderUnits) / asset.totalSupply;
            if (share > 0n) {
              currentParticipants[pid] = {
                ...currentParticipants[pid],
                pendingRewards: currentParticipants[pid].pendingRewards + share,
              };
              affectedHolders++;
            }
          }
        }
      }

      currentAssets[assetId] = asset;
      stateRef.current.assets = currentAssets;
      stateRef.current.participants = currentParticipants;

      setAssets(currentAssets);
      setParticipants(currentParticipants);

      pushNotification({
        type: 'REAL_YIELD_INJECTION',
        title: `Flujo Real Inyectado: ${asset.name}`,
        message: `Se inyectaron ${formatCurrency(amount)} de facturación física al Reward Pool repartidos entre ${affectedHolders} accionistas.`,
        assetId,
      });

      // Sincronización con backend en puerto 3000
      const assetIndexMap: Record<AssetId, number> = {
        'cafe-montana-dorada': 0,
        'cafe-volcan-rojo': 1,
        'arte-urbano-medellin': 2,
        'local-genesis': 3,
      };
      const amountMonNum = Number(amount) / 1e18;
      backendApi
        .injectRealYield(assetIndexMap[assetId], amountMonNum > 0 ? amountMonNum : undefined)
        .catch(() => {});

      return { ok: true, amountInjected: amount, affectedHolders };
    },
    [pushNotification]
  );

  const resetSimulation = useCallback(() => {
    txCounterRef.current = 1;
    redemptionsCounterRef.current = 1;
    const freshAssets = createInitialAssets();
    const freshParts = createInitialParticipants();
    const freshLeaders: Record<AssetId, string | null> = {
      'cafe-montana-dorada': null,
      'cafe-volcan-rojo': null,
      'arte-urbano-medellin': null,
      'local-genesis': null,
    };

    setAssets(freshAssets);
    setParticipants(freshParts);
    setLeaders(freshLeaders);
    setTrades([]);
    setRedemptions([]);
    setTickCount(0);
    setMajorityCelebration(null);
  }, []);

  const exportDemoResults = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      wallet: stateRef.current.walletAddress,
      assets: Object.values(stateRef.current.assets).map((a) => ({
        name: a.name,
        totalSupply: a.totalSupply.toString(),
        totalBurnedUnits: a.totalBurnedUnits.toString(),
        businessRevenueInjected: a.businessRevenueInjected.toString(),
      })),
      redemptions: stateRef.current.walletAddress ? redemptions : redemptions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monad-blitz-report-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [redemptions]);

  return (
    <SimulationContext.Provider
      value={{
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
        dismissCelebration: () => setMajorityCelebration(null),
        executeTrade,
        claimHumanRewards,
        executeBurnRedeem,
        injectBusinessRealYield,
        triggerCompetitiveBattle,
        resetSimulation,
        exportDemoResults,

        // Integración Backend
        backendOnline,
        sseConnected,
        contractInfo,
        authSession,
        authenticateWalletWithMonad,
        logoutAuthSession,
        backendEvents,
        backendLeaderboard,
        refreshBackendData,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation debe usarse dentro de SimulationProvider');
  return ctx;
};