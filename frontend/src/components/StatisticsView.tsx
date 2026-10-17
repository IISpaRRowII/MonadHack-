import React, { useState } from 'react';
import { CoffeeAsset, LeaderboardEntry, UserPortfolio } from '../types';

interface StatisticsViewProps {
  assets: CoffeeAsset[];
  leaderboard: LeaderboardEntry[];
  userPortfolio: UserPortfolio | null;
  account: string;
  onConnectWallet: () => void;
  onClaimDividends: () => Promise<void>;
  claimingDividends: boolean;
  onNavigateToInvestments: () => void;
  onOpenCustomBuy: (asset: CoffeeAsset) => void;
  onOpenSellModal: (asset: CoffeeAsset) => void;
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({
  assets,
  leaderboard,
  userPortfolio,
  account,
  onConnectWallet,
  onClaimDividends,
  claimingDividends,
  onNavigateToInvestments,
  onOpenCustomBuy,
  onOpenSellModal,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'portfolio' | 'leaderboard'>('overview');

  // Totales de plataforma
  const totalVolume = assets.reduce((acc, a) => acc + (a.totalVolume || 0), 0);
  const totalDividends = assets.reduce((acc, a) => acc + (a.dividendPool || 0), 0);
  const totalSoldShares = assets.reduce((acc, a) => acc + (a.soldShares || 0), 0);
  const totalCapacity = assets.reduce((acc, a) => acc + (a.totalShares || 1000), 0);
  const totalInvestors = leaderboard.length;

  return (
    <div className="statistics-container animate-fade-in">
      {/* Statistics Header & Navigation sub-tabs */}
      <div className="stats-header-section">
        <div>
          <h2 className="stats-page-title">Estadísticas & Analíticas de Inversión</h2>
          <p className="stats-page-subtitle">
            Métricas de rendimiento en tiempo real, distribución de activos tokenizados y monitoreo de portafolio en Monad Testnet.
          </p>
        </div>

        {/* Subtabs */}
        <div className="subtabs-bar">
          <button
            className={`subtab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📈 Mercado Global
          </button>
          <button
            className={`subtab-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
            onClick={() => setActiveTab('portfolio')}
          >
            💼 Mi Portafolio
            {userPortfolio && userPortfolio.totalShares > 0 && (
              <span className="subtab-badge font-mono">{userPortfolio.totalShares}</span>
            )}
          </button>
          <button
            className={`subtab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            🏆 Leaderboard
          </button>
        </div>
      </div>

      {/* Global KPI Cards (Shown on all tabs) */}
      <section className="global-kpi-grid">
        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-label">Volumen Global Transaccionado</span>
            <span className="analytics-badge text-gold">MON</span>
          </div>
          <div className="analytics-metric font-mono text-gold">{totalVolume.toFixed(3)} MON</div>
          <div className="analytics-footer text-muted">Total movido en la bonding curve</div>
        </div>

        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-label">Dividendos Distribuidos (5%)</span>
            <span className="analytics-badge text-green">Rendimiento</span>
          </div>
          <div className="analytics-metric font-mono text-green">{totalDividends.toFixed(4)} MON</div>
          <div className="analytics-footer text-muted">Repartidos a inversionistas tempranos</div>
        </div>

        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-label">Micro-Acciones Vendidas</span>
            <span className="analytics-badge text-cyan">{assets.length} Fondos</span>
          </div>
          <div className="analytics-metric font-mono text-cyan">
            {totalSoldShares} <span className="text-sm font-normal text-muted">/ {totalCapacity.toLocaleString()}</span>
          </div>
          <div className="analytics-footer text-muted">
            {totalCapacity > 0 ? ((totalSoldShares / totalCapacity) * 100).toFixed(1) : 0}% de la emisión total colocada
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-label">Velocidad Monad EVM</span>
            <span className="analytics-badge badge-purple">High Perf</span>
          </div>
          <div className="analytics-metric font-mono text-purple">~300 ms</div>
          <div className="analytics-footer text-muted">Finalidad instantánea de bloque</div>
        </div>
      </section>

      {/* TAB 1: OVERVIEW & MARKET ANALYTICS */}
      {activeTab === 'overview' && (
        <div className="stats-tab-content">
          {/* Capital Distribution across 4 Coffee Lots */}
          <section className="card-panel">
            <div className="card-panel-header">
              <div>
                <h3 className="card-panel-title">📊 Distribución de Capital por Lote de Café</h3>
                <p className="card-panel-desc">Participación de volumen y demanda en cada cosecha tokenizada.</p>
              </div>
            </div>

            {/* Visual Multi-bar Distribution */}
            <div className="distribution-bar-wrapper">
              <div className="multi-progress-bar">
                {assets.map((asset) => {
                  const pct = totalVolume > 0 ? ((asset.totalVolume / totalVolume) * 100) : 25;
                  return (
                    <div
                      key={asset.id}
                      className="multi-progress-segment"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: asset.color,
                      }}
                      title={`${asset.name}: ${pct.toFixed(1)}% del volumen`}
                    />
                  );
                })}
              </div>

              {/* Legends */}
              <div className="distribution-legends">
                {assets.map((asset) => {
                  const sharePct = totalVolume > 0 ? ((asset.totalVolume / totalVolume) * 100).toFixed(1) : '25.0';
                  return (
                    <div key={asset.id} className="legend-item">
                      <span className="legend-color-dot" style={{ backgroundColor: asset.color }} />
                      <div className="legend-text">
                        <span className="legend-name">{asset.name}</span>
                        <span className="legend-pct font-mono">{sharePct}% ({asset.totalVolume.toFixed(3)} MON)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Comparative Lots Analytics Cards */}
            <div className="lots-comparison-grid">
              {assets.map((asset) => {
                const soldPct = ((asset.soldShares / asset.totalShares) * 100).toFixed(1);
                const priceIncreasePct = (((asset.currentPrice - asset.basePrice) / asset.basePrice) * 100).toFixed(1);

                return (
                  <div key={asset.id} className="lot-stat-box" style={{ borderLeft: `4px solid ${asset.color}` }}>
                    <div className="lot-stat-header">
                      <div>
                        <h4 className="lot-stat-name">{asset.name}</h4>
                        <span className="lot-stat-variety">{asset.variety}</span>
                      </div>
                      <span className="badge-stat-price font-mono">{asset.currentPrice.toFixed(4)} MON</span>
                    </div>

                    <div className="lot-stat-metrics">
                      <div className="metric-row">
                        <span className="metric-title">Precio Base Inicial:</span>
                        <span className="metric-val font-mono">{asset.basePrice} MON</span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-title">Apreciación Bonding Curve:</span>
                        <span className="metric-val font-mono text-green">+{priceIncreasePct}%</span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-title">Acciones Vendidas:</span>
                        <span className="metric-val font-mono">{asset.soldShares} / {asset.totalShares} ({soldPct}%)</span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-title">Patrón Actual:</span>
                        <span className="metric-val font-mono text-gold" title={asset.patron}>
                          {asset.patron ? `${asset.patron.slice(0, 6)}...${asset.patron.slice(-4)}` : 'Sin Patrón'}
                        </span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-title">Pool de Dividendos:</span>
                        <span className="metric-val font-mono text-cyan">{asset.dividendPool.toFixed(4)} MON</span>
                      </div>
                    </div>

                    <button
                      className="btn-card-quick-buy font-mono"
                      onClick={() => onOpenCustomBuy(asset)}
                    >
                      Invertir en {asset.name.split(' ')[1] || 'Lote'} →
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Bonding Curve Mathematical Mechanics Guide */}
          <section className="card-panel">
            <h3 className="card-panel-title">📐 Modelo Económico y Mecánica Bonding Curve en Monad</h3>
            <p className="card-panel-desc" style={{ marginBottom: '1.25rem' }}>
              Cada lote de café cuenta con una curva de vinculación algorítmica autónoma. A medida que más personas compran micro-acciones, el precio escala de acuerdo a la fórmula cuadrática de costo marginal:
            </p>

            <div className="formula-box font-mono">
              <div className="formula-line">
                <span className="formula-var">P(s)</span> = <span className="formula-base">PrecioBase</span> + (<span className="formula-slope">Pendiente</span> × <span className="formula-supply">AccionesVendidas</span>)
              </div>
              <div className="formula-expl">
                • <strong>5% de cada compra</strong> se transfiere automáticamente al <em>Pool de Dividendos</em> del lote.<br/>
                • Los accionistas previos acumulan dividendos en MON en tiempo real con cada nuevo Tap.<br/>
                • Quien posea la mayor cantidad de acciones de un lote se convierte en <strong>El Patrón del Lote</strong> (👑).
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: USER PERSONAL PORTFOLIO */}
      {activeTab === 'portfolio' && (
        <div className="stats-tab-content">
          {!account ? (
            <div className="empty-portfolio-card">
              <span className="empty-icon">🦊</span>
              <h3>Conecta tu Wallet para ver tu Portafolio Personal</h3>
              <p>
                Visualiza tus micro-acciones de café, valoración actual en MON, ganancias no realizadas (PnL) y reclama tus dividendos acumulados.
              </p>
              <button className="btn-connect-monad" onClick={onConnectWallet}>
                <span>🦊 Conectar Wallet Monad</span>
              </button>
            </div>
          ) : (
            <div>
              {/* User Portfolio KPI Ribbon */}
              <div className="portfolio-kpis-grid">
                <div className="portfolio-stat-card">
                  <span className="port-label">Valoración Total del Portafolio</span>
                  <div className="port-value font-mono text-cyan">
                    {(userPortfolio?.totalCurrentValueMon || 0).toFixed(4)} MON
                  </div>
                  <span className="port-sub font-mono">
                    Invertido: {(userPortfolio?.totalInvestedMon || 0).toFixed(4)} MON
                  </span>
                </div>

                <div className="portfolio-stat-card">
                  <span className="port-label">Ganancia No Realizada (PnL)</span>
                  <div className={`port-value font-mono ${(userPortfolio?.totalPnlMon || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                    {(userPortfolio?.totalPnlMon || 0) >= 0 ? '+' : ''}
                    {(userPortfolio?.totalPnlMon || 0).toFixed(4)} MON
                  </div>
                  <span className={`port-sub font-mono ${(userPortfolio?.totalPnlPercent || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                    {(userPortfolio?.totalPnlPercent || 0) >= 0 ? '▲ +' : '▼ '}
                    {(userPortfolio?.totalPnlPercent || 0).toFixed(2)}% ROI
                  </span>
                </div>

                <div className="portfolio-stat-card">
                  <span className="port-label">Acciones Totales en Monad</span>
                  <div className="port-value font-mono">
                    {userPortfolio?.totalShares || 0}
                  </div>
                  <span className="port-sub font-mono">
                    {userPortfolio?.holdings.filter((h) => h.isPatron).length || 0} lote(s) como Patrón 👑
                  </span>
                </div>

                {/* Claim Dividends Action Box */}
                <div className="portfolio-stat-card claim-box-highlight">
                  <span className="port-label">Dividendos Disponibles</span>
                  <div className="port-value font-mono text-green">
                    {(userPortfolio?.totalUnclaimedDividends || 0).toFixed(5)} MON
                  </div>
                  <button
                    className="btn-claim-dividends"
                    onClick={onClaimDividends}
                    disabled={claimingDividends || (userPortfolio?.totalUnclaimedDividends || 0) <= 0}
                  >
                    {claimingDividends ? 'Reclamando...' : '🎁 Reclamar Dividendos'}
                  </button>
                </div>
              </div>

              {/* Holdings per lot table */}
              <div className="card-panel">
                <div className="card-panel-header">
                  <div>
                    <h3 className="card-panel-title">Desglose de Participaciones por Lote</h3>
                    <p className="card-panel-desc">Detalle de tus activos tokenizados, precio actual y acciones disponibles.</p>
                  </div>
                  <button className="btn-secondary-outline font-mono" onClick={onNavigateToInvestments}>
                    + Comprar Más Acciones
                  </button>
                </div>

                <div className="table-responsive">
                  <table className="custom-table font-mono">
                    <thead>
                      <tr>
                        <th>LOTE DE CAFÉ</th>
                        <th>ACCIONES</th>
                        <th>% DEL LOTE</th>
                        <th>INVERTIDO</th>
                        <th>VALOR ACTUAL</th>
                        <th>PNL / RENDIMIENTO</th>
                        <th>ROL</th>
                        <th>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userPortfolio?.holdings && userPortfolio.holdings.length > 0 ? (
                        userPortfolio.holdings.map((h) => {
                          const asset = assets.find((a) => a.id === h.assetId);
                          return (
                            <tr key={h.assetId}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className="table-color-badge" style={{ backgroundColor: h.color }} />
                                  <div>
                                    <strong style={{ color: '#FFF' }}>{h.assetName}</strong>
                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{h.variety}</div>
                                  </div>
                                </div>
                              </td>
                              <td><strong>{h.shares}</strong></td>
                              <td>{h.percentageOfLot}%</td>
                              <td>{h.investedMon.toFixed(4)} MON</td>
                              <td className="text-cyan">{h.currentValueMon.toFixed(4)} MON</td>
                              <td className={h.pnlMon >= 0 ? 'text-green' : 'text-red'}>
                                {h.pnlMon >= 0 ? '+' : ''}{h.pnlMon.toFixed(4)} MON ({h.pnlPercent}%)
                              </td>
                              <td>
                                {h.isPatron ? (
                                  <span className="badge-patron-gold">👑 Patrón</span>
                                ) : h.shares > 0 ? (
                                  <span className="badge-investor">Accionista</span>
                                ) : (
                                  <span className="badge-neutral">Sin Acciones</span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  {asset && (
                                    <button
                                      className="btn-table-action"
                                      onClick={() => onOpenCustomBuy(asset)}
                                      title="Comprar más"
                                    >
                                      + Comprar
                                    </button>
                                  )}
                                  {h.shares > 0 && asset && (
                                    <button
                                      className="btn-table-action-sell"
                                      onClick={() => onOpenSellModal(asset)}
                                      title="Vender a la curva"
                                    >
                                      Vender
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                            Aún no posees micro-acciones. ¡Explora el Mercado de Inversiones y adquiere tus primeras acciones!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LEADERBOARD & GUERRA DE PATRONES */}
      {activeTab === 'leaderboard' && (
        <div className="stats-tab-content">
          <div className="card-panel">
            <div className="card-panel-header">
              <div>
                <h3 className="card-panel-title">🏆 Clasificación General (Guerra de Patrones)</h3>
                <p className="card-panel-desc">
                  Los mayores accionistas que compiten por el control del lote y recaudan el dividendo proporcional en Monad.
                </p>
              </div>
              <span className="badge-investor font-mono">{totalInvestors} Inversores Registrados</span>
            </div>

            <div className="table-responsive">
              <table className="custom-table font-mono">
                <thead>
                  <tr>
                    <th>RANGO</th>
                    <th>DIRECCIÓN WALLET</th>
                    <th>LOTES COMO PATRÓN</th>
                    <th>TOTAL ACCIONES</th>
                    <th>TOTAL INVERTIDO</th>
                    <th>DIVIDENDOS TOTALES</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((user, idx) => {
                    const medal = idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `#${idx + 1}`;
                    const isSelf = account && user.address.toLowerCase() === account.toLowerCase();

                    return (
                      <tr key={user.address} className={isSelf ? 'table-row-self' : ''}>
                        <td><strong style={{ fontSize: '15px' }}>{medal}</strong></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{user.address}</span>
                            {isSelf && <span className="lb-self-pill">Tú</span>}
                          </div>
                        </td>
                        <td>
                          {user.patronOfAssets && user.patronOfAssets.length > 0 ? (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {user.patronOfAssets.map((name, i) => (
                                <span key={i} className="badge-patron-gold" style={{ fontSize: '10px' }}>
                                  👑 {name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td><strong>{user.totalShares}</strong> acciones</td>
                        <td className="text-gold">{user.totalInvestedMon.toFixed(3)} MON</td>
                        <td className="text-green">{(user.totalDividendsEarned || 0).toFixed(4)} MON</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
