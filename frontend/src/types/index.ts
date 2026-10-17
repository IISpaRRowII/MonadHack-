export interface CoffeeAsset {
  id: number;
  name: string;
  company?: string;
  products?: string;
  totalFundValue?: number;
  variety: string;
  origin: string;
  altitude: string;
  notes: string[];
  totalShares: number;
  soldShares: number;
  basePrice: number;
  priceSlope: number;
  currentPrice: number;
  patron: string;
  patronShares: number;
  dividendPool: number;
  totalVolume: number;
  color: string;
  accentColor: string;
  holdersCount?: number;
  topHolders?: Array<{
    address: string;
    shares: number;
    investedMon: number;
  }>;
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
  txHash?: string;
}

export interface LeaderboardEntry {
  address: string;
  totalShares: number;
  patronOfAssets: string[];
  totalInvestedMon: number;
  totalDividendsEarned: number;
  sharesByAsset: Record<number, number>;
}

export interface PortfolioHolding {
  assetId: number;
  assetName: string;
  variety: string;
  shares: number;
  percentageOfLot: number;
  investedMon: number;
  currentValueMon: number;
  pnlMon: number;
  pnlPercent: number;
  unclaimedDividends: number;
  dividendsClaimed: number;
  isPatron: boolean;
  currentPrice: number;
  color: string;
}

export interface UserPortfolio {
  address: string;
  totalShares: number;
  totalInvestedMon: number;
  totalCurrentValueMon: number;
  totalPnlMon: number;
  totalPnlPercent: number;
  totalUnclaimedDividends: number;
  totalClaimedDividends: number;
  holdings: PortfolioHolding[];
}

export interface ContractInfo {
  network: {
    name: string;
    chainId: number;
    rpcUrl: string;
  };
  contract: {
    address: string;
    totalAssets: number;
    sharesPerAsset: number;
    dividendRate: string;
  };
}

export type ActiveScreen = 'investments' | 'statistics';
export type PurchaseMode = 'onchain' | 'sim';
