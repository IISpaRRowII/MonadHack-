export interface CoffeeAsset {
  id: number;
  slug: string;
  name: string;
  category: string;
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
  totalBurnedUnits: number;
  businessRevenueInjected: number;
  rwaBacking: string;
  monthlyYieldTarget: number;
  yieldSource: string;
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
  type: 'BUY' | 'SELL' | 'BURN_REDEEM' | 'REAL_YIELD';
  metadata?: Record<string, any>;
}

export interface RedemptionRecord {
  id: string;
  timestamp: number;
  redeemerAddress: string;
  assetId: number;
  assetName: string;
  optionId: string;
  unitsBurned: number;
  realWorldItem: string;
  status: 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED';
  trackingHash: string;
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

export interface BurnRedeemRequest {
  assetId: number;
  redeemerAddress: string;
  unitsToBurn: number;
  optionId: string;
  itemTitle?: string;
}

export interface RealYieldRequest {
  assetId: number;
  amountMon?: number;
}

