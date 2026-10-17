// src/services/backendApi.ts
/**
 * Cliente de integración Frontend <-> Backend de Tap-to-Own en Monad
 * Conecta con los endpoints REST y Server-Sent Events (SSE) del servidor Express en puerto 3000.
 */

export interface BackendAsset {
  id: number;
  slug: string;
  name: string;
  category: string;
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
  totalBurnedUnits: number;
  businessRevenueInjected: number;
  rwaBacking: string;
  monthlyYieldTarget: number;
  yieldSource: string;
  holdersCount?: number;
  topHolders?: Array<{
    address: string;
    shares: number;
    investedMon: number;
    dividendsClaimed: number;
    unclaimedDividends: number;
    lastTapTimestamp: number;
  }>;
}

export interface BackendLeaderboardEntry {
  address: string;
  totalShares: number;
  patronOfAssets: string[];
  totalInvestedMon: number;
  totalDividendsEarned: number;
  sharesByAsset: Record<number, number>;
}

export interface BackendTapEvent {
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

export interface BackendRedemptionRecord {
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

export interface ContractInfo {
  network: {
    name: string;
    chainId: number;
    rpcUrl: string;
    blockExplorer?: string;
  };
  contract: {
    address: string;
    totalAssets: number;
    sharesPerAsset: number;
    dividendRate: string;
  };
  sampleAbi: string[];
}

export interface AuthChallengeResponse {
  address: string;
  nonce: string;
  message: string;
  chainId: number;
  network: string;
  networkParams: {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  };
}

export interface AuthVerifyResponse {
  success: boolean;
  message: string;
  sessionToken: string;
  address: string;
  network: string;
  chainId: number;
}

const API_BASE = ''; // Relativo al host actual (ej: http://localhost:3000)

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Error HTTP ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.error) {
        errorMsg = errJson.error;
      }
    } catch {
      // Ignorar si no es JSON
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

export const backendApi = {
  /**
   * Health check del backend
   */
  async checkHealth(): Promise<{ status: string; uptime: number; timestamp: string }> {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse(res);
  },

  /**
   * Obtener todos los activos RWA desde el backend
   */
  async getAssets(): Promise<{ success: boolean; data: BackendAsset[] }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/assets`);
    return handleResponse(res);
  },

  /**
   * Obtener detalle de un activo con lista de tenedores en vivo
   */
  async getAssetById(id: number): Promise<{ success: boolean; data: BackendAsset }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/assets/${id}`);
    return handleResponse(res);
  },

  /**
   * Ejecutar un TAP (Comprar micro-acciones en el backend)
   */
  async tapToBuy(
    assetId: number,
    buyerAddress: string,
    sharesCount: number = 1,
    sessionToken?: string
  ): Promise<{ success: boolean; message: string; buyer: string; event: BackendTapEvent }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const res = await fetch(`${API_BASE}/api/tap-to-own/tap`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        assetId,
        buyerAddress,
        sharesCount,
        sessionToken,
      }),
    });
    return handleResponse(res);
  },

  /**
   * Vender acciones de vuelta a la bonding curve del backend
   */
  async tapToSell(
    assetId: number,
    sellerAddress: string,
    sharesCount: number = 1
  ): Promise<{ success: boolean; message: string; event: BackendTapEvent }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId,
        sellerAddress,
        sharesCount,
      }),
    });
    return handleResponse(res);
  },

  /**
   * Reclamar dividendos en el backend
   */
  async claimDividends(address: string): Promise<{ success: boolean; message: string; data: any }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/claim-dividends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    return handleResponse(res);
  },

  /**
   * Quemar acciones para canjear un producto físico RWA (Burn-to-Redeem)
   */
  async burnToRedeem(
    assetId: number,
    redeemerAddress: string,
    unitsToBurn: number,
    optionId: string,
    itemTitle?: string,
    sessionToken?: string
  ): Promise<{ success: boolean; message: string; redemption: BackendRedemptionRecord }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const res = await fetch(`${API_BASE}/api/tap-to-own/burn-redeem`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        assetId,
        redeemerAddress,
        unitsToBurn,
        optionId,
        itemTitle,
      }),
    });
    return handleResponse(res);
  },

  /**
   * Inyectar flujo de caja real del negocio físico (Real Yield)
   */
  async injectRealYield(
    assetId: number,
    amountMon?: number
  ): Promise<{ success: boolean; message: string; data: { amountInjected: number; affectedHolders: number } }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/inject-real-yield`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId,
        amountMon,
      }),
    });
    return handleResponse(res);
  },

  /**
   * Obtener historial de redenciones físicas
   */
  async getRedemptions(address?: string): Promise<{ success: boolean; data: BackendRedemptionRecord[]; count: number }> {
    const url = address
      ? `${API_BASE}/api/tap-to-own/redemptions?address=${encodeURIComponent(address)}`
      : `${API_BASE}/api/tap-to-own/redemptions`;
    const res = await fetch(url);
    return handleResponse(res);
  },

  /**
   * Obtener Leaderboard del backend
   */
  async getLeaderboard(): Promise<{ success: boolean; data: BackendLeaderboardEntry[] }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/leaderboard`);
    return handleResponse(res);
  },

  /**
   * Obtener eventos recientes de Taps
   */
  async getRecentEvents(): Promise<{ success: boolean; data: BackendTapEvent[] }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/events`);
    return handleResponse(res);
  },

  /**
   * Obtener información y configuración del Contrato Inteligente en Monad Testnet
   */
  async getContractInfo(): Promise<{ success: boolean } & ContractInfo> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/contract-info`);
    return handleResponse(res);
  },

  /**
   * Solicitar reto de autenticación SIWE para firmar con la wallet
   */
  async requestAuthChallenge(address: string): Promise<{ success: boolean; data: AuthChallengeResponse }> {
    const res = await fetch(`${API_BASE}/api/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    return handleResponse(res);
  },

  /**
   * Verificar firma de autenticación con Monad
   */
  async verifyAuthSignature(address: string, signature: string): Promise<AuthVerifyResponse> {
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, signature }),
    });
    return handleResponse(res);
  },

  /**
   * Consultar sesión activa del usuario
   */
  async getAuthMe(token: string): Promise<{ authenticated: boolean; user?: { address: string; createdAt: number; network: string; chainId: number } }> {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse(res);
  },

  /**
   * Conectar a Server-Sent Events (SSE) para actualización en tiempo real (<300ms)
   */
  connectSSE(
    onMessage: (data: any) => void,
    onError?: (error: Event) => void
  ): { close: () => void; eventSource: EventSource } {
    const eventSource = new EventSource(`${API_BASE}/api/tap-to-own/stream`);

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch (err) {
        console.error('Error parseando mensaje SSE:', err);
      }
    };

    if (onError) {
      eventSource.onerror = (err) => {
        onError(err);
      };
    }

    return {
      close: () => eventSource.close(),
      eventSource,
    };
  },
};
