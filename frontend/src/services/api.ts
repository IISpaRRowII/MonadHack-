import { CoffeeAsset, TapEvent, LeaderboardEntry, UserPortfolio, ContractInfo } from '../types';

const API_BASE = ''; // Uses Vite proxy to http://localhost:3001

export const api = {
  // 1. Obtener lista de lotes
  async getAssets(): Promise<CoffeeAsset[]> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/assets`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error al obtener activos');
    return json.data;
  },

  // 1b. Crear nuevo fondo de inversión tokenizado
  async createFund(data: {
    company: string;
    products: string;
    totalFundValue: number;
    origin?: string;
    altitude?: string;
    notes?: string[];
    color?: string;
  }): Promise<{ success: boolean; data?: CoffeeAsset; message?: string; error?: string }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  },

  // 2. Detalle de lote específico
  async getAssetById(id: number): Promise<CoffeeAsset> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/assets/${id}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error al obtener lote');
    return json.data;
  },

  // 3. Ejecutar compra de micro-acciones (TAP)
  async sendTap(params: {
    assetId: number;
    buyerAddress: string;
    sharesCount: number;
    txHash?: string;
    sessionToken?: string | null;
  }): Promise<{ success: boolean; event?: TapEvent; error?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (params.sessionToken) {
      headers['Authorization'] = `Bearer ${params.sessionToken}`;
    }

    const res = await fetch(`${API_BASE}/api/tap-to-own/tap`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        assetId: params.assetId,
        buyerAddress: params.buyerAddress,
        sharesCount: params.sharesCount,
        txHash: params.txHash,
      }),
    });
    return await res.json();
  },

  // 4. Vender micro-acciones
  async sellShares(params: {
    assetId: number;
    sellerAddress: string;
    sharesCount: number;
  }): Promise<{ success: boolean; event?: TapEvent; error?: string }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  // 5. Reclamar dividendos
  async claimDividends(address: string): Promise<{ success: boolean; message: string; data?: any }> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/claim-dividends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    return await res.json();
  },

  // 6. Obtener Leaderboard
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/leaderboard`);
    const json = await res.json();
    return json.success ? json.data : [];
  },

  // 7. Obtener eventos recientes
  async getEvents(): Promise<TapEvent[]> {
    const res = await fetch(`${API_BASE}/api/tap-to-own/events`);
    const json = await res.json();
    return json.success ? json.data : [];
  },

  // 8. Portafolio de usuario para estadísticas
  async getUserPortfolio(address: string): Promise<UserPortfolio | null> {
    try {
      const res = await fetch(`${API_BASE}/api/tap-to-own/portfolio/${address}`);
      const json = await res.json();
      return json.success ? json.data : null;
    } catch {
      return null;
    }
  },

  // 9. Info del contrato
  async getContractInfo(): Promise<ContractInfo | null> {
    try {
      const res = await fetch(`${API_BASE}/api/tap-to-own/contract-info`);
      return await res.json();
    } catch {
      return null;
    }
  },

  // 10. Salud del backend
  async checkHealth(): Promise<{ status: string; timestamp: string } | null> {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) return await res.json();
      return null;
    } catch {
      return null;
    }
  },

  // 11. Conexión Server-Sent Events (SSE)
  createSSEConnection(handlers: {
    onOpen?: () => void;
    onInitialState?: (data: { assets: CoffeeAsset[]; leaderboard: LeaderboardEntry[]; recentEvents: TapEvent[] }) => void;
    onTapExecuted?: (data: { asset?: CoffeeAsset; event?: TapEvent }) => void;
    onError?: (error: any) => void;
  }): EventSource {
    const evtSource = new EventSource(`${API_BASE}/api/tap-to-own/stream`);

    evtSource.onopen = () => {
      handlers.onOpen?.();
    };

    evtSource.onerror = (err) => {
      handlers.onError?.(err);
    };

    evtSource.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);
        if (payload.type === 'INITIAL_STATE') {
          handlers.onInitialState?.(payload);
        } else if (payload.type === 'TAP_EXECUTED') {
          handlers.onTapExecuted?.(payload);
        }
      } catch (e) {
        console.error('Error parseando SSE stream:', e);
      }
    };

    return evtSource;
  },

  // 12. Autenticación SIWE (Opcional)
  async requestAuthChallenge(address: string): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      return data.success ? data.data.message : null;
    } catch {
      return null;
    }
  },

  async verifyAuthSignature(address: string, signature: string): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      });
      const data = await res.json();
      return data.success ? data.sessionToken : null;
    } catch {
      return null;
    }
  },
};
