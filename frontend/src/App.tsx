import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { InvestmentsView } from './components/InvestmentsView';
import { StatisticsView } from './components/StatisticsView';
import { BuyModal, SellModal, CreateFundModal } from './components/Modals';
import { api } from './services/api';
import {
  ActiveScreen,
  CoffeeAsset,
  TapEvent,
  LeaderboardEntry,
  UserPortfolio,
  PurchaseMode,
} from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const MONAD_NETWORK_PARAMS = {
  chainId: '0x279f', // 10143
  chainName: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: ['https://testnet-rpc.monad.xyz/'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com/'],
};

export default function App() {
  // Navigation
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('investments');

  // Web3 State
  const [account, setAccount] = useState<string>('');
  const [chainId, setChainId] = useState<number | null>(null);
  const [balanceMon, setBalanceMon] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(
    localStorage.getItem('monad_session_token') || null
  );

  // Business State
  const [assets, setAssets] = useState<CoffeeAsset[]>([]);
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userPortfolio, setUserPortfolio] = useState<UserPortfolio | null>(null);
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>('onchain');
  const [contractAddress, setContractAddress] = useState<string>('');

  // Status & Connectivity
  const [isSSEConnected, setIsSSEConnected] = useState<boolean>(false);
  const [loadingAssetId, setLoadingAssetId] = useState<number | null>(null);
  const [claimingDividends, setClaimingDividends] = useState<boolean>(false);
  const [modalBuyAsset, setModalBuyAsset] = useState<CoffeeAsset | null>(null);
  const [modalSellAsset, setModalSellAsset] = useState<CoffeeAsset | null>(null);
  const [isCreateFundOpen, setIsCreateFundOpen] = useState<boolean>(false);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // 1. Consultar saldo en MON de la wallet
  const fetchBalance = useCallback(async (walletAddress: string) => {
    if (!window.ethereum || !walletAddress) return;
    try {
      const balanceHex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
      });
      const balanceWei = BigInt(balanceHex);
      const mon = (Number(balanceWei) / 1e18).toFixed(4);
      setBalanceMon(`${mon} MON`);
    } catch (err) {
      console.warn('No se pudo obtener saldo en Monad:', err);
    }
  }, []);

  // 2. Cargar Portafolio del Usuario
  const loadUserPortfolio = useCallback(async (walletAddress: string) => {
    if (!walletAddress) {
      setUserPortfolio(null);
      return;
    }
    const data = await api.getUserPortfolio(walletAddress);
    if (data) {
      setUserPortfolio(data);
    }
  }, []);

  // 3. Inicializar datos del backend
  const loadInitialData = useCallback(async () => {
    try {
      const [assetsData, lbData, eventsData, contractData] = await Promise.all([
        api.getAssets(),
        api.getLeaderboard(),
        api.getEvents(),
        api.getContractInfo(),
      ]);
      setAssets(assetsData);
      setLeaderboard(lbData);
      setEvents(eventsData);
      if (contractData?.contract?.address && contractData.contract.address.startsWith('0x')) {
        setContractAddress(contractData.contract.address);
      }
    } catch (err) {
      console.error('Error cargando datos iniciales:', err);
    }
  }, []);

  // 4. Conexión en vivo por SSE
  useEffect(() => {
    loadInitialData();

    const sse = api.createSSEConnection({
      onOpen: () => setIsSSEConnected(true),
      onError: () => setIsSSEConnected(false),
      onInitialState: (data) => {
        if (data.assets) setAssets(data.assets);
        if (data.leaderboard) setLeaderboard(data.leaderboard);
        if (data.recentEvents) setEvents(data.recentEvents);
      },
      onTapExecuted: (data) => {
        if (data.asset) {
          setAssets((prev) =>
            prev.map((a) => (a.id === data.asset!.id ? { ...a, ...data.asset } : a))
          );
        }
        if (data.event) {
          setEvents((prev) => [data.event!, ...prev.slice(0, 30)]);
          if (data.event.isNewPatron) {
            showToast(`👑 ¡Nuevo Patrón en ${data.event.assetName}!`, 'info');
          }
        }
        // Refrescar Leaderboard
        api.getLeaderboard().then(setLeaderboard);
      },
    });

    return () => {
      sse.close();
    };
  }, [loadInitialData]);

  // 5. Escuchar cambios de wallet / Ethereum (respetando estado de logout de la dApp)
  useEffect(() => {
    const isLoggedOut = localStorage.getItem('monad_app_logged_out') === 'true';

    if (window.ethereum) {
      if (!isLoggedOut) {
        window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            fetchBalance(accounts[0]);
            loadUserPortfolio(accounts[0]);
          }
        });
      }

      window.ethereum.request({ method: 'eth_chainId' }).then((hexId: string) => {
        setChainId(parseInt(hexId, 16));
      });

      const handleAccountsChanged = (accounts: string[]) => {
        const currentlyLoggedOut = localStorage.getItem('monad_app_logged_out') === 'true';
        if (currentlyLoggedOut) return;

        const nextAccount = accounts[0] || '';
        setAccount(nextAccount);
        if (nextAccount) {
          fetchBalance(nextAccount);
          loadUserPortfolio(nextAccount);
        } else {
          setBalanceMon(null);
          setUserPortfolio(null);
        }
      };

      const handleChainChanged = (hexId: string) => {
        setChainId(parseInt(hexId, 16));
        if (account) fetchBalance(account);
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [account, fetchBalance, loadUserPortfolio]);

  // Refrescar portafolio cuando cambien los eventos o activos
  useEffect(() => {
    if (account) {
      loadUserPortfolio(account);
      fetchBalance(account);
    }
  }, [events, account, loadUserPortfolio, fetchBalance]);

  // 6. Iniciar Sesión / Conectar Wallet (pide confirmación y firma con la wallet)
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('No se detectó billetera Web3 (MetaMask o compatible).');
      return;
    }
    try {
      showToast('Por favor confirma en tu wallet para iniciar sesión...', 'info');

      // 1. Forzar apertura de confirmación de cuenta en MetaMask
      let accounts: string[] = [];
      try {
        const permissions = await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
        const accountsPermission = permissions.find((p: any) => p.parentCapability === 'eth_accounts');
        if (accountsPermission && accountsPermission.caveats) {
          const caveat = accountsPermission.caveats.find((c: any) => c.type === 'filterResponse');
          if (caveat && caveat.value && caveat.value.length > 0) {
            accounts = caveat.value;
          }
        }
      } catch (permErr: any) {
        if (permErr.code === 4001) {
          showToast('Inicio de sesión cancelado en la wallet', 'info');
          return;
        }
      }

      if (!accounts || accounts.length === 0) {
        accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      }

      if (!accounts || accounts.length === 0) {
        showToast('No se seleccionó ninguna cuenta en la wallet', 'error');
        return;
      }

      const addr = accounts[0];

      // 2. Asegurar red Monad Testnet (10143)
      await switchToMonadNetwork();

      // 3. Confirmación criptográfica con la wallet (personal_sign)
      showToast('Firma la solicitud en MetaMask para validar tu acceso...', 'info');
      const challengeMsg = await api.requestAuthChallenge(addr);
      const messageToSign =
        challengeMsg ||
        `Iniciar sesión en Monad Tap-to-Own RWA\nWallet: ${addr}\nTimestamp: ${Date.now()}`;

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [messageToSign, addr],
      });

      // 4. Verificar firma en el backend
      const token = await api.verifyAuthSignature(addr, signature);
      if (token) {
        setSessionToken(token);
        localStorage.setItem('monad_session_token', token);
      }

      // 5. Quitar bandera de logout y establecer sesión activa
      localStorage.removeItem('monad_app_logged_out');
      setAccount(addr);
      await fetchBalance(addr);
      await loadUserPortfolio(addr);

      showToast('¡Sesión confirmada y autenticada con tu wallet!', 'success');
    } catch (err: any) {
      if (err.code === 4001) {
        showToast('Confirmación cancelada en la wallet', 'info');
      } else {
        showToast(`Error de conexión: ${err.message}`, 'error');
      }
    }
  };

  // Cerrar Sesión en la dApp sin desconectar la wallet de MetaMask
  const logoutSession = () => {
    localStorage.setItem('monad_app_logged_out', 'true');
    localStorage.removeItem('monad_session_token');
    setSessionToken(null);
    setAccount('');
    setBalanceMon(null);
    setUserPortfolio(null);
    showToast('Sesión cerrada en la dApp. Tu wallet sigue autorizada en MetaMask.', 'info');
  };

  // 7. Cambiar o Añadir Monad Testnet (10143)
  const switchToMonadNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MONAD_NETWORK_PARAMS.chainId }],
      });
      setChainId(10143);
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [MONAD_NETWORK_PARAMS],
          });
          setChainId(10143);
        } catch (addError: any) {
          showToast(`Error al añadir red Monad: ${addError.message}`, 'error');
        }
      } else {
        showToast(`Error al cambiar a Monad: ${switchError.message}`, 'error');
      }
    }
  };

  // 8. Ejecutar Compra / TAP
  const handleTapBuy = async (assetId: number, sharesCount: number = 1) => {
    let currentAccount = account;
    if (!currentAccount) {
      const confirmConnect = window.confirm(
        'Debes conectar tu wallet para comprar micro-acciones y competir por el lote. ¿Deseas conectarla ahora?'
      );
      if (confirmConnect) {
        await connectWallet();
      }
      return;
    }

    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;

    setLoadingAssetId(assetId);

    try {
      let txHash: string | undefined = undefined;

      // 1. Modo On-Chain: Descontar MON real vía MetaMask en Monad Testnet
      if (purchaseMode === 'onchain') {
        const costMon = (asset.currentPrice * sharesCount).toFixed(6);
        const costWei = BigInt(Math.floor(parseFloat(costMon) * 1e18));
        const costWeiHex = '0x' + costWei.toString(16);

        const targetTo = contractAddress || currentAccount;

        let callData = '0x';
        if (contractAddress) {
          const paramAssetId = BigInt(assetId).toString(16).padStart(64, '0');
          const paramShares = BigInt(sharesCount).toString(16).padStart(64, '0');
          callData = '0xbeebc5da' + paramAssetId + paramShares;
        }

        showToast(`Autorizando transacción de ${costMon} MON en MetaMask...`, 'info');

        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: currentAccount,
              to: targetTo,
              value: costWeiHex,
              data: callData,
            },
          ],
        });

        console.log('[+] Transacción enviada en Monad Testnet! TxHash:', txHash);
      }

      // 2. Registrar en Backend
      const result = await api.sendTap({
        assetId,
        buyerAddress: currentAccount,
        sharesCount,
        txHash,
        sessionToken,
      });

      if (!result.success) {
        throw new Error(result.error || 'Error al ejecutar compra');
      }

      showToast(
        `¡Tap Exitoso! Adquiridas ${sharesCount} acción(es) de ${asset.name}`,
        'success'
      );

      // Actualizar saldo y portafolio
      setTimeout(() => {
        fetchBalance(currentAccount);
        loadUserPortfolio(currentAccount);
      }, 1000);
    } catch (err: any) {
      if (err.code === 4001) {
        showToast('Transacción cancelada en la billetera', 'info');
      } else {
        showToast(`Error en la operación: ${err.message}`, 'error');
      }
    } finally {
      setLoadingAssetId(null);
    }
  };

  // 9. Ejecutar Compra desde Modal Personalizado
  const handleConfirmCustomBuy = async (assetId: number, shares: number) => {
    setModalLoading(true);
    try {
      await handleTapBuy(assetId, shares);
      setModalBuyAsset(null);
    } finally {
      setModalLoading(false);
    }
  };

  // 10. Ejecutar Venta de Acciones
  const handleConfirmSell = async (assetId: number, shares: number) => {
    if (!account) return;
    setModalLoading(true);
    try {
      const res = await api.sellShares({
        assetId,
        sellerAddress: account,
        sharesCount: shares,
      });

      if (!res.success) {
        throw new Error(res.error || 'Error al vender');
      }

      showToast(`¡Venta exitosa! Liquidadas ${shares} acción(es)`, 'success');
      setModalSellAsset(null);

      setTimeout(() => {
        fetchBalance(account);
        loadUserPortfolio(account);
      }, 1000);
    } catch (err: any) {
      showToast(`Error al vender: ${err.message}`, 'error');
    } finally {
      setModalLoading(false);
    }
  };

  // 11. Reclamar Dividendos
  const handleClaimDividends = async () => {
    if (!account) return;
    setClaimingDividends(true);
    try {
      const res = await api.claimDividends(account);
      if (res.success) {
        showToast(res.message || 'Dividendos reclamados con éxito', 'success');
        await loadUserPortfolio(account);
        await fetchBalance(account);
      } else {
        showToast('No fue posible reclamar dividendos', 'error');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setClaimingDividends(false);
    }
  };

  // 12. Crear Nuevo Fondo de Inversión (guardado en .json)
  const handleCreateFund = async (data: {
    company: string;
    products: string;
    totalFundValue: number;
    origin?: string;
    altitude?: string;
    notes?: string[];
    color?: string;
  }) => {
    setModalLoading(true);
    try {
      const res = await api.createFund(data);
      if (!res.success) {
        throw new Error(res.error || 'Error al crear fondo');
      }
      showToast(res.message || '¡Fondo creado exitosamente y guardado en .json!', 'success');
      setIsCreateFundOpen(false);
      // Recargar la lista de activos
      const updated = await api.getAssets();
      setAssets(updated);
    } catch (err: any) {
      showToast(`Error al crear fondo: ${err.message}`, 'error');
    } finally {
      setModalLoading(false);
    }
  };

  // Mapa de acciones poseídas por el usuario para cada lote
  const userSharesByAsset: Record<number, number> = {};
  if (userPortfolio?.holdings) {
    userPortfolio.holdings.forEach((h) => {
      userSharesByAsset[h.assetId] = h.shares;
    });
  }

  return (
    <div className="app-layout">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-banner toast-${toast.type} animate-slide-down`}>
          <span>{toast.message}</span>
          <button className="toast-close-btn" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Main Navbar with Navigation Switcher */}
      <Navbar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        account={account}
        chainId={chainId}
        balanceMon={balanceMon}
        isSSEConnected={isSSEConnected}
        onConnectWallet={connectWallet}
        onLogout={logoutSession}
        onSwitchToMonad={switchToMonadNetwork}
        onOpenCreateFund={() => setIsCreateFundOpen(true)}
      />

      {/* Content depending on Active Screen */}
      <main className="main-content-wrapper">
        {activeScreen === 'investments' ? (
          <InvestmentsView
            assets={assets}
            events={events}
            leaderboard={leaderboard}
            account={account}
            purchaseMode={purchaseMode}
            setPurchaseMode={setPurchaseMode}
            contractAddress={contractAddress}
            setContractAddress={setContractAddress}
            onTapBuy={handleTapBuy}
            onOpenCustomBuy={(asset) => setModalBuyAsset(asset)}
            onOpenSellModal={(asset) => setModalSellAsset(asset)}
            onOpenCreateFund={() => setIsCreateFundOpen(true)}
            loadingAssetId={loadingAssetId}
            userSharesByAsset={userSharesByAsset}
          />
        ) : (
          <StatisticsView
            assets={assets}
            leaderboard={leaderboard}
            userPortfolio={userPortfolio}
            account={account}
            onConnectWallet={connectWallet}
            onClaimDividends={handleClaimDividends}
            claimingDividends={claimingDividends}
            onNavigateToInvestments={() => setActiveScreen('investments')}
            onOpenCustomBuy={(asset) => setModalBuyAsset(asset)}
            onOpenSellModal={(asset) => setModalSellAsset(asset)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-left">
            <span>🟣 Monad Hackathon 2026 • Tap-to-Own RWA</span>
            <span className="footer-dot">•</span>
            <span>10,000 TPS Monad EVM</span>
          </div>
          <div className="footer-right font-mono">
            <a
              href="https://testnet.monadexplorer.com/"
              target="_blank"
              rel="noreferrer"
              className="footer-link"
            >
              Explorador Monad ↗
            </a>
            <span className="footer-dot">•</span>
            <span>Chain ID: 10143</span>
          </div>
        </div>
      </footer>

      {/* Custom Buy Modal */}
      {modalBuyAsset && (
        <BuyModal
          asset={modalBuyAsset}
          onClose={() => setModalBuyAsset(null)}
          onConfirmBuy={handleConfirmCustomBuy}
          purchaseMode={purchaseMode}
          loading={modalLoading}
        />
      )}

      {/* Sell Modal */}
      {modalSellAsset && (
        <SellModal
          asset={modalSellAsset}
          userOwnedShares={userSharesByAsset[modalSellAsset.id] || 0}
          onClose={() => setModalSellAsset(null)}
          onConfirmSell={handleConfirmSell}
          loading={modalLoading}
        />
      )}

      {/* Create New Investment Fund Modal */}
      <CreateFundModal
        isOpen={isCreateFundOpen}
        onClose={() => setIsCreateFundOpen(false)}
        onCreateFund={handleCreateFund}
        loading={modalLoading}
      />
    </div>
  );
}
