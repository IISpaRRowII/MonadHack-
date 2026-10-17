export interface CoffeeAsset {
  id: number;
  name: string;
  variety: string;
  origin: string;
  altitude: string;
  notes: string[];
  totalShares: number; // 1,000 micro-acciones fijas
  soldShares: number;
  basePrice: number; // en MON (ej: 0.001)
  priceSlope: number; // pendiente de la bonding curve (ej: 0.00002)
  currentPrice: number; // precio del próximo tap en MON
  patron: string; // address del mayoritario ("El Patrón del Lote")
  patronShares: number;
  dividendPool: number; // total acumulado para repartir en MON
  totalVolume: number; // volumen total comerciado en MON
  color: string; // código de color para UI / Proyector
  accentColor: string;
}

export interface Shareholder {
  address: string;
  shares: number;
  investedMon: number;
  dividendsClaimed: number;
  unclaimedDividends: number;
  lastTapTimestamp: number;
}

export interface TapEvent {
  id: string;
  assetId: number;
  assetName: string;
  buyer: string;
  shares: number;
  pricePerShare: number;
  totalCost: number;
  dividendDistributed: number;
  timestamp: number;
  isNewPatron: boolean;
  previousPatron?: string;
  type: 'BUY' | 'SELL';
}

export interface LeaderboardEntry {
  address: string;
  totalShares: number;
  patronOfAssets: string[]; // Nombres de lotes que controla
  totalInvestedMon: number;
  totalDividendsEarned: number;
  sharesByAsset: Record<number, number>;
}

export interface TapRequest {
  assetId: number;
  buyerAddress: string;
  sharesCount?: number;
}

export interface SellRequest {
  assetId: number;
  sellerAddress: string;
  sharesCount?: number;
}
