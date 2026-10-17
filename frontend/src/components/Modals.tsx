import React, { useState } from 'react';
import { CoffeeAsset, PurchaseMode } from '../types';

interface BuyModalProps {
  asset: CoffeeAsset | null;
  onClose: () => void;
  onConfirmBuy: (assetId: number, shares: number) => Promise<void>;
  purchaseMode: PurchaseMode;
  loading: boolean;
}

export const BuyModal: React.FC<BuyModalProps> = ({
  asset,
  onClose,
  onConfirmBuy,
  purchaseMode,
  loading,
}) => {
  const [shares, setShares] = useState<number>(5);

  if (!asset) return null;

  // Approximate cost calculation using bonding curve
  // totalCost = integral of (basePrice + slope * s) ds from soldShares to soldShares + shares
  const currentS = asset.soldShares;
  const targetS = currentS + shares;
  const cost = shares * asset.basePrice + (asset.priceSlope / 2) * (targetS * targetS - currentS * currentS);
  const avgPrice = cost / shares;
  const dividendShare = cost * 0.05;

  const handleBuy = () => {
    onConfirmBuy(asset.id, shares);
  };

  return (
    <div className="modal-backdrop animate-fade-in" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Adquirir Acciones • {asset.name}</h3>
            <span className="modal-subtitle">{asset.variety} — {asset.origin}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="shares-slider-group">
            <div className="slider-label-row">
              <span className="label-text">Cantidad de Micro-Acciones:</span>
              <span className="slider-value-display font-mono">{shares} Acciones</span>
            </div>

            <input
              type="range"
              min="1"
              max={Math.min(50, asset.totalShares - asset.soldShares)}
              value={shares}
              onChange={(e) => setShares(parseInt(e.target.value, 10))}
              className="custom-range-slider"
            />

            <div className="quick-shares-pills">
              {[1, 5, 10, 20, 50].map((qty) => (
                qty <= (asset.totalShares - asset.soldShares) && (
                  <button
                    key={qty}
                    className={`pill-choice ${shares === qty ? 'active' : ''} font-mono`}
                    onClick={() => setShares(qty)}
                  >
                    +{qty}
                  </button>
                )
              ))}
            </div>
          </div>

          <div className="modal-breakdown-box font-mono">
            <div className="breakdown-row">
              <span>Modo de Compra:</span>
              <strong className={purchaseMode === 'onchain' ? 'text-purple' : 'text-cyan'}>
                {purchaseMode === 'onchain' ? '⚡ Monad Testnet (En Cadena)' : '🧪 Simulación (0 Gas)'}
              </strong>
            </div>
            <div className="breakdown-row">
              <span>Precio Promedio / Acción:</span>
              <span>{avgPrice.toFixed(6)} MON</span>
            </div>
            <div className="breakdown-row">
              <span>Aporte al Pool de Dividendos (5%):</span>
              <span className="text-green">+{dividendShare.toFixed(6)} MON</span>
            </div>
            <div className="breakdown-divider" />
            <div className="breakdown-row total-row">
              <span>Costo Total Estimado:</span>
              <span className="total-val text-gold">{cost.toFixed(5)} MON</span>
            </div>
          </div>

          {purchaseMode === 'onchain' && (
            <div className="modal-alert-note">
              ℹ️ Se abrirá MetaMask para autorizar el descuento de <strong>{cost.toFixed(5)} MON</strong> en Monad Testnet.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-modal-cancel" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button className="btn-modal-confirm" onClick={handleBuy} disabled={loading}>
            {loading ? 'Confirmando en Monad...' : `Confirmar Compra (${cost.toFixed(4)} MON)`}
          </button>
        </div>
      </div>
    </div>
  );
};

interface SellModalProps {
  asset: CoffeeAsset | null;
  userOwnedShares: number;
  onClose: () => void;
  onConfirmSell: (assetId: number, shares: number) => Promise<void>;
  loading: boolean;
}

export const SellModal: React.FC<SellModalProps> = ({
  asset,
  userOwnedShares,
  onClose,
  onConfirmSell,
  loading,
}) => {
  const [sharesToSell, setSharesToSell] = useState<number>(Math.min(1, userOwnedShares));

  if (!asset || userOwnedShares <= 0) return null;

  // Approximate refund calculation
  const currentS = asset.soldShares;
  const newS = Math.max(0, currentS - sharesToSell);
  const grossRefund = sharesToSell * asset.basePrice + (asset.priceSlope / 2) * (currentS * currentS - newS * newS);
  const penalty = grossRefund * 0.10; // 10% penalty goes to dividend pool
  const netRefund = grossRefund - penalty;

  const handleSell = () => {
    onConfirmSell(asset.id, sharesToSell);
  };

  return (
    <div className="modal-backdrop animate-fade-in" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Vender Micro-Acciones • {asset.name}</h3>
            <span className="modal-subtitle">Liquidación de vuelta a la bonding curve</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="shares-slider-group">
            <div className="slider-label-row">
              <span className="label-text">Acciones a liquidar:</span>
              <span className="slider-value-display font-mono">{sharesToSell} / {userOwnedShares} Acciones</span>
            </div>

            <input
              type="range"
              min="1"
              max={userOwnedShares}
              value={sharesToSell}
              onChange={(e) => setSharesToSell(parseInt(e.target.value, 10))}
              className="custom-range-slider"
            />

            <div className="quick-shares-pills">
              <button
                className={`pill-choice ${sharesToSell === 1 ? 'active' : ''} font-mono`}
                onClick={() => setSharesToSell(1)}
              >
                1 acción
              </button>
              {userOwnedShares >= 5 && (
                <button
                  className={`pill-choice ${sharesToSell === 5 ? 'active' : ''} font-mono`}
                  onClick={() => setSharesToSell(5)}
                >
                  5 acciones
                </button>
              )}
              <button
                className={`pill-choice ${sharesToSell === userOwnedShares ? 'active' : ''} font-mono`}
                onClick={() => setSharesToSell(userOwnedShares)}
              >
                Vender Todas ({userOwnedShares})
              </button>
            </div>
          </div>

          <div className="modal-breakdown-box font-mono">
            <div className="breakdown-row">
              <span>Reembolso Bruto:</span>
              <span>{grossRefund.toFixed(6)} MON</span>
            </div>
            <div className="breakdown-row">
              <span>Penalización por Retiro (10% al pool):</span>
              <span className="text-red">-{penalty.toFixed(6)} MON</span>
            </div>
            <div className="breakdown-divider" />
            <div className="breakdown-row total-row">
              <span>Reembolso Neto Estimado:</span>
              <span className="total-val text-green">{netRefund.toFixed(5)} MON</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-modal-cancel" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button className="btn-modal-sell" onClick={handleSell} disabled={loading}>
            {loading ? 'Liquidando...' : `Vender y Reclamar ${netRefund.toFixed(4)} MON`}
          </button>
        </div>
      </div>
    </div>
  );
};

interface CreateFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFund: (data: {
    company: string;
    products: string;
    totalFundValue: number;
    origin?: string;
    altitude?: string;
    notes?: string[];
    color?: string;
  }) => Promise<void>;
  loading: boolean;
}

export const CreateFundModal: React.FC<CreateFundModalProps> = ({
  isOpen,
  onClose,
  onCreateFund,
  loading,
}) => {
  const [company, setCompany] = useState('');
  const [products, setProducts] = useState('');
  const [totalFundValue, setTotalFundValue] = useState<string>('1.0');
  const [origin, setOrigin] = useState('Pitalito, Huila');
  const [altitude, setAltitude] = useState('1,900 msnm');
  const [notesStr, setNotesStr] = useState('Frutos Rojos, Miel, Chocolate');
  const [chosenColor, setChosenColor] = useState('#836EF9');

  if (!isOpen) return null;

  const numVal = parseFloat(totalFundValue) || 0;
  const totalShares = 1000;
  const basePricePerShare = numVal > 0 ? numVal / totalShares : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !products.trim() || numVal <= 0) return;

    const notes = notesStr.split(',').map((n) => n.trim()).filter(Boolean);
    onCreateFund({
      company: company.trim(),
      products: products.trim(),
      totalFundValue: numVal,
      origin: origin.trim(),
      altitude: altitude.trim(),
      notes,
      color: chosenColor,
    });
  };

  const colors = ['#836EF9', '#FFB800', '#00E5FF', '#00E676', '#FF4D8B', '#A78BFA', '#F59E0B', '#38BDF8'];

  return (
    <div className="modal-backdrop animate-fade-in" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">🌱 Crear Nuevo Fondo de Inversión RWA</h3>
            <span className="modal-subtitle">Tokenización respaldada en Monad • 1,000 Micro-Acciones</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body create-fund-form">
          <div className="form-group">
            <label className="form-label">
              Empresa / Productor / Finca <span className="text-red">*</span>
            </label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="ej. Hacienda San Alberto / Cooperativa Huila"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              id="input-fund-company"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Productos / Variedad / Cosecha <span className="text-red">*</span>
            </label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="ej. Café Geisha Selección Especial Lavado"
              value={products}
              onChange={(e) => setProducts(e.target.value)}
              id="input-fund-products"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Valor Total del Fondo (en MON) <span className="text-red">*</span>
            </label>
            <div className="input-with-badge font-mono">
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                className="form-input"
                placeholder="ej. 2.5"
                value={totalFundValue}
                onChange={(e) => setTotalFundValue(e.target.value)}
                id="input-fund-total-val"
              />
              <span className="input-currency-badge">MON</span>
            </div>
          </div>

          {/* Cálculo Automático de las 1,000 micro-acciones */}
          <div className="fund-calculation-box font-mono">
            <div className="calc-header">
              <span>⚡ Tokenización Algorítmica (Dividido por 1,000):</span>
            </div>
            <div className="calc-row">
              <span>Total de Micro-Acciones Fijas:</span>
              <strong className="text-cyan">1,000 Acciones</strong>
            </div>
            <div className="calc-row">
              <span>Precio Base por Acción:</span>
              <strong className="text-gold">{basePricePerShare.toFixed(6)} MON</strong>
            </div>
            <div className="calc-note">
              Fórmula: {numVal} MON ÷ 1,000 = {basePricePerShare.toFixed(6)} MON por acción inicial
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Origen / Municipio</label>
              <input
                type="text"
                className="form-input"
                placeholder="ej. Pitalito, Huila"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Altitud</label>
              <input
                type="text"
                className="form-input"
                placeholder="ej. 1,950 msnm"
                value={altitude}
                onChange={(e) => setAltitude(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notas de Cata (separadas por coma)</label>
            <input
              type="text"
              className="form-input"
              placeholder="ej. Jazmín, Melocotón, Panela"
              value={notesStr}
              onChange={(e) => setNotesStr(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Color de Identidad</label>
            <div className="color-picker-row">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-choice-btn ${chosenColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setChosenColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-modal-confirm"
              disabled={loading || !company.trim() || !products.trim() || numVal <= 0}
              id="btn-submit-create-fund"
            >
              {loading ? 'Creando y guardando...' : '💾 Crear Fondo y Guardar en .json'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

