import React from 'react';
import { ActiveScreen } from '../types';

interface NavbarProps {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  account: string;
  chainId: number | null;
  balanceMon: string | null;
  isSSEConnected: boolean;
  onConnectWallet: () => void;
  onLogout: () => void;
  onSwitchToMonad: () => void;
  onOpenCreateFund: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeScreen,
  setActiveScreen,
  account,
  chainId,
  balanceMon,
  isSSEConnected,
  onConnectWallet,
  onLogout,
  onSwitchToMonad,
  onOpenCreateFund,
}) => {
  const isMonadChain = chainId === 10143;

  return (
    <header className="navbar-container">
      {/* Brand & Monad Badge */}
      <div className="brand-group">
        <div className="brand-logo">
          <span className="logo-icon">☕</span>
          <span className="monad-glow-ring"></span>
        </div>
        <div className="brand-text">
          <div className="brand-title-row">
            <h1 className="brand-title">Tap-to-Own <span className="text-monad-purple">RWA</span></h1>
            <span className="badge-monad-speed">Monad 300ms</span>
          </div>
          <p className="brand-subtitle">Micro-Acciones de Café Especial Tokenizado en Monad</p>
        </div>
      </div>

      {/* Navigation Switcher (Two screens) */}
      <nav className="nav-tabs-wrapper">
        <button
          className={`nav-tab-btn ${activeScreen === 'investments' ? 'active' : ''}`}
          onClick={() => setActiveScreen('investments')}
          id="nav-tab-investments"
        >
          <span className="tab-icon">☕</span>
          <span className="tab-label">Mercado de Inversiones</span>
          {activeScreen === 'investments' && <span className="tab-indicator" />}
        </button>

        <button
          className={`nav-tab-btn ${activeScreen === 'statistics' ? 'active' : ''}`}
          onClick={() => setActiveScreen('statistics')}
          id="nav-tab-statistics"
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">Estadísticas & Portafolio</span>
          {activeScreen === 'statistics' && <span className="tab-indicator" />}
        </button>
      </nav>

      {/* System Status & Wallet Connection */}
      <div className="header-controls">
        {/* Create Fund Button */}
        <button
          className="btn-create-fund-nav"
          onClick={onOpenCreateFund}
          title="Crear un nuevo fondo de inversión tokenizado (1,000 acciones)"
          id="btn-create-fund-nav"
        >
          <span>🌱 + Crear Fondo</span>
        </button>

        {/* SSE Live Status */}
        <div className="sse-indicator" title={isSSEConnected ? 'Stream en tiempo real conectado' : 'Conectando con Monad...'}>
          <span className={`pulse-dot ${isSSEConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="sse-text font-mono">{isSSEConnected ? '300ms Stream' : 'Conectando...'}</span>
        </div>

        {/* Balance Badge */}
        {account && balanceMon !== null && (
          <div className="balance-pill font-mono" title="Saldo en Monad Testnet">
            <span className="balance-label">MON:</span>
            <span className="balance-amount">{balanceMon}</span>
          </div>
        )}

        {/* Wallet Pill or Connect Button */}
        {account ? (
          <div className="wallet-connected-pill">
            <div className="wallet-details">
              <span className={`network-dot ${isMonadChain ? 'online' : 'warning'}`}></span>
              <span className="account-text font-mono">
                {account.slice(0, 6)}...{account.slice(-4)}
              </span>
            </div>

            {!isMonadChain && (
              <button className="btn-sm btn-warning" onClick={onSwitchToMonad}>
                Cambiar a Monad (10143)
              </button>
            )}

            <button
              className="btn-logout-session"
              onClick={onLogout}
              title="Cerrar sesión en la dApp sin desconectar la wallet en MetaMask"
              id="btn-logout-session"
            >
              <span>🔒 Cerrar Sesión</span>
            </button>
          </div>
        ) : (
          <button className="btn-connect-monad" onClick={onConnectWallet} id="btn-login-session">
            <span className="btn-icon">🦊</span>
            <span>Iniciar Sesión / Conectar</span>
          </button>
        )}
      </div>
    </header>
  );
};
