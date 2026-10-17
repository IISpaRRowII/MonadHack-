import React, { useState } from 'react';
import { CoffeeAsset, TapEvent, LeaderboardEntry, PurchaseMode } from '../types';

interface InvestmentsViewProps {
  assets: CoffeeAsset[];
  events: TapEvent[];
  leaderboard: LeaderboardEntry[];
  account: string;
  purchaseMode: PurchaseMode;
  setPurchaseMode: (mode: PurchaseMode) => void;
  contractAddress: string;
  setContractAddress: (addr: string) => void;
  onTapBuy: (assetId: number, sharesCount: number) => Promise<void>;
  onOpenCustomBuy: (asset: CoffeeAsset) => void;
  onOpenSellModal: (asset: CoffeeAsset) => void;
  onOpenCreateFund: () => void;
  loadingAssetId: number | null;
  userSharesByAsset: Record<number, number>;
}

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({
  assets,
  events,
  leaderboard,
  account,
  purchaseMode,
  setPurchaseMode,
  contractAddress,
  setContractAddress,
  onTapBuy,
  onOpenCustomBuy,
  onOpenSellModal,
  onOpenCreateFund,
  loadingAssetId,
  userSharesByAsset,
}) => {
  const [showConfig, setShowConfig] = useState(false);

  // Totales calculados
  const totalVolume = assets.reduce((acc, a) => acc + (a.totalVolume || 0), 0);
  const totalDividends = assets.reduce((acc, a) => acc + (a.dividendPool || 0), 0);
  const totalSoldShares = assets.reduce((acc, a) => acc + (a.soldShares || 0), 0);
  const totalCapacity = assets.reduce((acc, a) => acc + (a.totalShares || 1000), 0);

  return (
    <div className="investments-container">
      {/* Top Metrics Row */}
      <section className="stats-kpi-bar">
        <div className="kpi-card">
          <span className="kpi-icon">🎯</span>
          <div>
            <div className="kpi-value font-mono">{events.length}</div>
            <div className="kpi-label">Transacciones Recientes</div>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-icon">💰</span>
          <div>
            <div className="kpi-value font-mono text-gold">{totalVolume.toFixed(3)} MON</div>
            <div className="kpi-label">Volumen Acumulado</div>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-icon">🎁</span>
          <div>
            <div className="kpi-value font-mono text-green">{totalDividends.toFixed(4)} MON</div>
            <div className="kpi-label">Pool Dividendos (5%)</div>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-icon">📦</span>
          <div>
            <div className="kpi-value font-mono text-cyan">{totalSoldShares} / {totalCapacity.toLocaleString()}</div>
            <div className="kpi-label">Acciones Adquiridas</div>
          </div>
        </div>
      </section>

      {/* Mode Control & Configuration Bar */}
      <section className="mode-config-card">
        <div className="mode-left">
          <span className="mode-title">MODO DE OPERACIÓN:</span>
          <div className="mode-pill-toggle">
            <button
              className={`mode-pill-btn ${purchaseMode === 'onchain' ? 'active-onchain' : ''}`}
              onClick={() => setPurchaseMode('onchain')}
              id="mode-btn-onchain"
            >
              <span className="pill-dot"></span>
              ⚡ En Cadena Real (MetaMask / Monad Testnet)
            </button>
            <button
              className={`mode-pill-btn ${purchaseMode === 'sim' ? 'active-sim' : ''}`}
              onClick={() => setPurchaseMode('sim')}
              id="mode-btn-sim"
            >
              🧪 Simulación Instantánea (0 Gas)
            </button>
          </div>
        </div>

        <div className="mode-right">
          <button
            className="btn-toggle-config font-mono"
            onClick={() => setShowConfig(!showConfig)}
          >
            ⚙️ {showConfig ? 'Ocultar Contrato' : 'Configurar Contrato / Destino'}
          </button>
        </div>

        {showConfig && (
          <div className="config-drawer animate-fade-in">
            <label className="config-label">Dirección de Destino / Contrato en Monad:</label>
            <div className="config-input-group">
              <input
                type="text"
                className="input-contract font-mono"
                placeholder="0x... (Opcional, si está vacío se envía a la wallet del backend o usuario)"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
              />
              <span className="config-hint">Red: Monad Testnet (Chain ID 10143)</span>
            </div>
          </div>
        )}
      </section>

      {/* Grid of 4 Tokenized Coffee Assets */}
      <section className="assets-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Lotes y Fondos de Inversión RWA</h2>
            <p className="section-desc">Micro-acciones tokenizadas respaldadas por cosechas y empresas de café especial colombiano.</p>
          </div>
          <div className="section-header-actions">
            <button
              className="btn-create-fund-section"
              onClick={onOpenCreateFund}
              id="btn-open-create-fund-section"
            >
              🌱 + Crear Nuevo Fondo
            </button>
            <span className="badge-live-curve">Bonding Curve Activa</span>
          </div>
        </div>

        <div className="assets-grid">
          {assets.map((asset) => {
            const pct = Math.min(100, (asset.soldShares / asset.totalShares) * 100).toFixed(1);
            const userShares = userSharesByAsset[asset.id] || 0;
            const isUserPatron = account && asset.patron && asset.patron.toLowerCase() === account.toLowerCase();
            const isLoading = loadingAssetId === asset.id;

            return (
              <div
                key={asset.id}
                className="asset-card"
                style={{ borderTop: `4px solid ${asset.color || '#836EF9'}` }}
              >
                {/* Header with Title & Price */}
                <div className="asset-card-top">
                  <div>
                    <div className="asset-name-row">
                      <h3 className="asset-title">{asset.name}</h3>
                      {asset.company && <span className="badge-company font-mono">{asset.company}</span>}
                      {isUserPatron && <span className="badge-you-patron">👑 Eres Patrón</span>}
                    </div>
                    {asset.products && asset.products !== asset.variety && (
                      <div className="asset-products-tag">
                        📦 <span>{asset.products}</span>
                      </div>
                    )}
                    <div className="asset-origin-text">
                      📍 {asset.origin} • ⛰️ {asset.altitude}
                    </div>
                  </div>

                  <div className="price-tag font-mono">
                    <span className="price-val">{asset.currentPrice.toFixed(4)}</span>
                    <span className="price-unit">MON</span>
                  </div>
                </div>

                {/* Variety & Tasting Notes Chips */}
                <div className="variety-bar">
                  <span className="variety-pill">{asset.variety}</span>
                </div>

                <div className="notes-list">
                  {asset.notes.map((note, idx) => (
                    <span key={idx} className="note-chip">
                      {note}
                    </span>
                  ))}
                </div>

                {/* Bonding Curve Progress */}
                <div className="progress-container">
                  <div className="progress-meta font-mono">
                    <span>Acciones: <strong>{asset.soldShares}</strong> / {asset.totalShares}</span>
                    <span className="progress-percent">{pct}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: asset.color || '#836EF9',
                        boxShadow: `0 0 12px ${asset.color || '#836EF9'}88`,
                      }}
                    />
                  </div>
                  <div className="progress-subtext">
                    Disponibles: {asset.totalShares - asset.soldShares} micro-acciones
                  </div>
                </div>

                {/* Patron of the Lot Highlight */}
                <div className={`patron-box ${isUserPatron ? 'patron-box-self' : ''}`}>
                  <div className="patron-info">
                    <div className="patron-title">👑 Patrón del Lote</div>
                    <div className="patron-address font-mono" title={asset.patron}>
                      {asset.patron ? `${asset.patron.slice(0, 8)}...${asset.patron.slice(-6)}` : 'Sin Patrón'}
                    </div>
                  </div>
                  <div className="patron-shares-col">
                    <span className="patron-shares-label">Acciones</span>
                    <span className="patron-shares-val font-mono">{asset.patronShares || 0}</span>
                  </div>
                </div>

                {/* Pool & Volume Stats */}
                <div className="asset-footer-stats font-mono">
                  <div>
                    <span className="stat-muted">Pool Div.: </span>
                    <span className="text-green font-bold">{asset.dividendPool.toFixed(4)} MON</span>
                  </div>
                  <div>
                    <span className="stat-muted">Vol: </span>
                    <span className="font-bold">{asset.totalVolume.toFixed(3)} MON</span>
                  </div>
                </div>

                {/* User Ownership Status */}
                {userShares > 0 && (
                  <div className="user-holdings-banner font-mono">
                    <span>Posees: <strong>{userShares} acc.</strong> ({( (userShares / asset.totalShares) * 100).toFixed(1)}%)</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="card-actions-wrapper">
                  <div className="actions-buy-row">
                    <button
                      className="btn-tap-primary"
                      onClick={() => onTapBuy(asset.id, 1)}
                      disabled={isLoading}
                      id={`btn-tap-${asset.id}`}
                    >
                      {isLoading ? '⏳ Procesando...' : '🔥 TAP (+1)'}
                    </button>

                    <button
                      className="btn-tap-quick"
                      onClick={() => onTapBuy(asset.id, 5)}
                      disabled={isLoading}
                      title="Comprar 5 acciones de una vez"
                    >
                      +5
                    </button>

                    <button
                      className="btn-tap-custom"
                      onClick={() => onOpenCustomBuy(asset)}
                      disabled={isLoading}
                      title="Elegir cantidad personalizada"
                    >
                      +Más
                    </button>
                  </div>

                  {userShares > 0 && (
                    <button
                      className="btn-sell-secondary"
                      onClick={() => onOpenSellModal(asset)}
                      disabled={isLoading}
                    >
                      🔄 Vender Acciones
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Live Feed & Quick Leaderboard */}
      <section className="live-activity-grid">
        {/* Real-time Taps Feed */}
        <div className="activity-panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <span className="panel-icon">⚡</span>
              <h3 className="panel-title">Feed de Taps en Tiempo Real</h3>
            </div>
            <span className="badge-stream-status font-mono">Monad 300ms Blocks</span>
          </div>

          <div className="feed-scroll-list">
            {events.length === 0 ? (
              <div className="feed-empty">Esperando transacciones en vivo en Monad...</div>
            ) : (
              events.slice(0, 15).map((evt) => {
                const dateStr = new Date(evt.timestamp).toLocaleTimeString();
                return (
                  <div
                    key={evt.id}
                    className={`feed-item-row ${evt.isNewPatron ? 'feed-patron-alert' : ''}`}
                  >
                    <div className="feed-item-main">
                      <div className="feed-badge-row">
                        {evt.isNewPatron ? (
                          <span className="badge-patron-gold">👑 ¡NUEVO PATRÓN!</span>
                        ) : evt.type === 'SELL' ? (
                          <span className="badge-sell font-mono">VENTA</span>
                        ) : (
                          <span className="badge-buy font-mono">COMPRA</span>
                        )}
                        <span className="feed-address font-mono">
                          {evt.buyer.slice(0, 6)}...{evt.buyer.slice(-4)}
                        </span>
                        {evt.txHash && (
                          <a
                            href={`https://testnet.monadexplorer.com/tx/${evt.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="explorer-link"
                            title="Ver en Monad Explorer"
                          >
                            [Tx ↗]
                          </a>
                        )}
                      </div>

                      <div className="feed-detail-text">
                        {evt.type === 'SELL' ? 'Vendió' : 'Adquirió'}{' '}
                        <strong>{evt.shares} acción(es)</strong> de <em>{evt.assetName}</em>
                      </div>
                    </div>

                    <div className="feed-cost-col font-mono">
                      <div className="feed-cost-mon">{evt.totalCost.toFixed(5)} MON</div>
                      <div className="feed-time">{dateStr}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Leaderboard Preview */}
        <div className="activity-panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <span className="panel-icon">🏆</span>
              <h3 className="panel-title">Guerra de Patrones (Top Inversores)</h3>
            </div>
            <span className="badge-leaderboard-sub font-mono">Ranking</span>
          </div>

          <div className="leaderboard-quick-list">
            {leaderboard.length === 0 ? (
              <div className="feed-empty">Cargando inversionistas destacados...</div>
            ) : (
              leaderboard.slice(0, 6).map((item, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                const isCurrent = account && item.address.toLowerCase() === account.toLowerCase();

                return (
                  <div
                    key={item.address}
                    className={`leaderboard-item-row ${isCurrent ? 'leaderboard-item-self' : ''}`}
                  >
                    <div className="lb-left">
                      <span className="lb-rank font-mono">{medal}</span>
                      <div className="lb-user">
                        <span className="lb-address font-mono">
                          {item.address.slice(0, 6)}...{item.address.slice(-4)}
                          {isCurrent && <span className="lb-self-pill">Tú</span>}
                        </span>
                        {item.patronOfAssets && item.patronOfAssets.length > 0 && (
                          <span className="lb-patron-badge">
                            👑 Patrón de {item.patronOfAssets.length} lote(s)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="lb-right font-mono">
                      <div className="lb-shares font-bold">{item.totalShares} acc.</div>
                      <div className="lb-vol">{item.totalInvestedMon.toFixed(3)} MON</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
