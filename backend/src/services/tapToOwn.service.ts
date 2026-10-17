import { Response } from "express";
import { ethers } from "ethers";
import { CoffeeAsset, Shareholder, TapEvent, LeaderboardEntry } from "../types/tapToOwn.js";
import { calculateBuyCost, calculateSellRefund, getNextSharePrice } from "./bondingCurve.js";
import { config } from "../config.js";

class TapToOwnService {
  // 4 Activos de Café de Especialidad RWA Tokenizados
  private assets: CoffeeAsset[] = [
    {
      id: 0,
      name: "Lote Geisha Imperial",
      variety: "Geisha de Altura",
      origin: "Pitalito, Huila",
      altitude: "1,950 msnm",
      notes: ["Jazmín", "Melocotón", "Bergamota"],
      totalShares: 1000,
      soldShares: 145,
      basePrice: 0.001, // en MON
      priceSlope: 0.00002,
      currentPrice: 0.0039,
      patron: "0x71C...a49B",
      patronShares: 42,
      dividendPool: 0.0284,
      totalVolume: 0.568,
      color: "#FFB800", // Oro
      accentColor: "#FFF0B3",
    },
    {
      id: 1,
      name: "Lote Bourbon Rosado",
      variety: "Bourbon Rosado Fermentado",
      origin: "Acevedo, Huila",
      altitude: "1,800 msnm",
      notes: ["Frutos Rojos", "Caña de Azúcar", "Cacao"],
      totalShares: 1000,
      soldShares: 210,
      basePrice: 0.0008,
      priceSlope: 0.000015,
      currentPrice: 0.00395,
      patron: "0x34B...F921",
      patronShares: 60,
      dividendPool: 0.0415,
      totalVolume: 0.830,
      color: "#FF4D8B", // Rosado / Rubí
      accentColor: "#FFD6E7",
    },
    {
      id: 2,
      name: "Lote Caturra Miel",
      variety: "Caturra Honey Process",
      origin: "Génova, Quindío",
      altitude: "1,700 msnm",
      notes: ["Miel Silvestre", "Mandarina", "Vainilla"],
      totalShares: 1000,
      soldShares: 90,
      basePrice: 0.0005,
      priceSlope: 0.00001,
      currentPrice: 0.0014,
      patron: "0x89D...71E3",
      patronShares: 25,
      dividendPool: 0.0112,
      totalVolume: 0.224,
      color: "#00E5FF", // Cyan Eléctrico
      accentColor: "#CCF9FF",
    },
    {
      id: 3,
      name: "Lote Castillo Ancestral",
      variety: "Castillo Orgánico",
      origin: "Jerifalte, Nariño",
      altitude: "2,050 msnm",
      notes: ["Panela", "Cítricos Brillantes", "Nuez"],
      totalShares: 1000,
      soldShares: 65,
      basePrice: 0.0004,
      priceSlope: 0.00001,
      currentPrice: 0.00105,
      patron: "0x52A...c904",
      patronShares: 18,
      dividendPool: 0.0078,
      totalVolume: 0.156,
      color: "#00E676", // Verde Esmeralda
      accentColor: "#B9F6CA",
    },
  ];

  // Registro de accionistas por [assetId][address]
  private shareholders: Map<number, Map<string, Shareholder>> = new Map();

  // Historial de Taps recientes
  private recentEvents: TapEvent[] = [];

  // Clientes conectados a Server-Sent Events (SSE) para actualización en tiempo real (Pantalla de proyector y celulares)
  private sseClients: Response[] = [];

  constructor() {
    // Inicializar mapas para cada lote
    for (let i = 0; i < 4; i++) {
      this.shareholders.set(i, new Map());
    }

    // Sembrar accionistas iniciales para los lotes
    this.seedInitialHolders();

    // Actualizar precios iniciales
    this.assets.forEach((asset) => {
      asset.currentPrice = getNextSharePrice(asset.basePrice, asset.priceSlope, asset.soldShares);
    });
  }

  private seedInitialHolders() {
    // Inicializar los patrones con sus acciones
    this.assets.forEach((asset) => {
      if (asset.patron && asset.patronShares > 0) {
        const lotHolders = this.shareholders.get(asset.id)!;
        lotHolders.set(asset.patron, {
          address: asset.patron,
          shares: asset.patronShares,
          investedMon: Number((asset.basePrice * asset.patronShares).toFixed(6)),
          dividendsClaimed: 0,
          unclaimedDividends: Number((asset.dividendPool * 0.6).toFixed(6)),
          lastTapTimestamp: Date.now() - 60000,
        });
      }
    });
  }

  /**
   * Obtener todos los 4 activos con su estado actual
   */
  public getAssets(): CoffeeAsset[] {
    return this.assets;
  }

  /**
   * Obtener un lote específico y su top de accionistas
   */
  public getAssetById(id: number) {
    const asset = this.assets.find((a) => a.id === id);
    if (!asset) return null;

    const holdersMap = this.shareholders.get(id);
    const topHolders = holdersMap
      ? Array.from(holdersMap.values())
          .sort((a, b) => b.shares - a.shares)
          .slice(0, 10)
      : [];

    return {
      ...asset,
      holdersCount: holdersMap ? holdersMap.size : 0,
      topHolders,
    };
  }

  /**
   * Ejecutar un "Tap": Comprar una o varias micro-acciones de un lote
   */
  public tapToBuy(assetId: number, buyerAddress: string, sharesCount: number = 1): { success: boolean; event?: TapEvent; error?: string } {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) {
      return { success: false, error: "Lote de café no encontrado" };
    }

    if (asset.soldShares + sharesCount > asset.totalShares) {
      return {
        success: false,
        error: `Acciones insuficientes en el lote. Disponibles: ${asset.totalShares - asset.soldShares}`,
      };
    }

    // 1. Calcular costo en la Bonding Curve y distribución de dividendos
    const { totalCost, averagePrice, dividendAmount } = calculateBuyCost(
      asset.basePrice,
      asset.priceSlope,
      asset.soldShares,
      sharesCount
    );

    const oldPatron = asset.patron;
    const oldPatronShares = asset.patronShares;

    // 2. Repartir dividendo (5%) proporcionalmente entre accionistas previos
    const lotHolders = this.shareholders.get(assetId)!;
    if (asset.soldShares > 0 && dividendAmount > 0) {
      for (const holder of lotHolders.values()) {
        const shareRatio = holder.shares / asset.soldShares;
        const holderDividend = Number((dividendAmount * shareRatio).toFixed(6));
        holder.unclaimedDividends = Number((holder.unclaimedDividends + holderDividend).toFixed(6));
      }
    }

    // 3. Actualizar o registrar al comprador
    const existingHolder = lotHolders.get(buyerAddress) || {
      address: buyerAddress,
      shares: 0,
      investedMon: 0,
      dividendsClaimed: 0,
      unclaimedDividends: 0,
      lastTapTimestamp: Date.now(),
    };

    existingHolder.shares += sharesCount;
    existingHolder.investedMon = Number((existingHolder.investedMon + totalCost).toFixed(6));
    existingHolder.lastTapTimestamp = Date.now();
    lotHolders.set(buyerAddress, existingHolder);

    // 4. Actualizar métricas del activo
    asset.soldShares += sharesCount;
    asset.totalVolume = Number((asset.totalVolume + totalCost).toFixed(6));
    asset.dividendPool = Number((asset.dividendPool + dividendAmount).toFixed(6));
    asset.currentPrice = getNextSharePrice(asset.basePrice, asset.priceSlope, asset.soldShares);

    // 5. Verificar si hay cambio de "El Patrón del Lote" (Guerra de Control)
    let isNewPatron = false;
    if (existingHolder.shares > asset.patronShares) {
      if (asset.patron !== buyerAddress) {
        isNewPatron = true;
      }
      asset.patron = buyerAddress;
      asset.patronShares = existingHolder.shares;
    }

    // 6. Generar evento de Tap
    const tapEvent: TapEvent = {
      id: `tap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      assetId,
      assetName: asset.name,
      buyer: buyerAddress,
      shares: sharesCount,
      pricePerShare: averagePrice,
      totalCost,
      dividendDistributed: dividendAmount,
      timestamp: Date.now(),
      isNewPatron,
      previousPatron: isNewPatron ? oldPatron : undefined,
      type: "BUY",
    };

    this.recentEvents.unshift(tapEvent);
    if (this.recentEvents.length > 50) {
      this.recentEvents.pop();
    }

    // 7. Notificar inmediatamente a las pantallas de proyector y celulares en vivo (SSE)
    this.broadcastSSE({
      type: "TAP_EXECUTED",
      event: tapEvent,
      asset: this.getAssetById(assetId),
    });

    return { success: true, event: tapEvent };
  }

  /**
   * Vender micro-acciones de vuelta a la bonding curve
   */
  public tapToSell(assetId: number, sellerAddress: string, sharesCount: number = 1): { success: boolean; event?: TapEvent; error?: string } {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) {
      return { success: false, error: "Lote de café no encontrado" };
    }

    const lotHolders = this.shareholders.get(assetId)!;
    const holder = lotHolders.get(sellerAddress);

    if (!holder || holder.shares < sharesCount) {
      return { success: false, error: "No posees suficientes acciones para vender en este lote" };
    }

    // Calcular reembolso
    const { netRefund, penaltyToPool } = calculateSellRefund(
      asset.basePrice,
      asset.priceSlope,
      asset.soldShares,
      sharesCount
    );

    holder.shares -= sharesCount;
    asset.soldShares -= sharesCount;
    asset.dividendPool = Number((asset.dividendPool + penaltyToPool).toFixed(6));
    asset.currentPrice = getNextSharePrice(asset.basePrice, asset.priceSlope, asset.soldShares);

    // Si vendió todas sus acciones
    if (holder.shares === 0) {
      lotHolders.delete(sellerAddress);
    }

    // Recalcular Patrón si el que vendió era el Patrón actual
    if (asset.patron === sellerAddress) {
      let maxShares = 0;
      let newPatron = "Sin Patrón";
      for (const [addr, h] of lotHolders.entries()) {
        if (h.shares > maxShares) {
          maxShares = h.shares;
          newPatron = addr;
        }
      }
      asset.patron = newPatron;
      asset.patronShares = maxShares;
    }

    const sellEvent: TapEvent = {
      id: `sell-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      assetId,
      assetName: asset.name,
      buyer: sellerAddress,
      shares: sharesCount,
      pricePerShare: Number((netRefund / sharesCount).toFixed(6)),
      totalCost: netRefund,
      dividendDistributed: penaltyToPool,
      timestamp: Date.now(),
      isNewPatron: false,
      type: "SELL",
    };

    this.recentEvents.unshift(sellEvent);
    this.broadcastSSE({
      type: "TAP_EXECUTED",
      event: sellEvent,
      asset: this.getAssetById(assetId),
    });

    return { success: true, event: sellEvent };
  }

  /**
   * Reclamar dividendos acumulados
   */
  public claimDividends(address: string): { claimedTotal: number; details: Record<number, number> } {
    let claimedTotal = 0;
    const details: Record<number, number> = {};

    for (let i = 0; i < 4; i++) {
      const lotHolders = this.shareholders.get(i);
      const holder = lotHolders?.get(address);
      if (holder && holder.unclaimedDividends > 0) {
        const amount = holder.unclaimedDividends;
        holder.dividendsClaimed = Number((holder.dividendsClaimed + amount).toFixed(6));
        holder.unclaimedDividends = 0;
        claimedTotal = Number((claimedTotal + amount).toFixed(6));
        details[i] = amount;
      }
    }

    return { claimedTotal, details };
  }

  /**
   * Obtener Leaderboard global
   */
  public getLeaderboard(): LeaderboardEntry[] {
    const userAggregates = new Map<string, { totalShares: number; invested: number; dividends: number; sharesByAsset: Record<number, number> }>();

    for (let assetId = 0; assetId < 4; assetId++) {
      const lotHolders = this.shareholders.get(assetId)!;
      for (const [addr, h] of lotHolders.entries()) {
        const user = userAggregates.get(addr) || {
          totalShares: 0,
          invested: 0,
          dividends: 0,
          sharesByAsset: {},
        };
        user.totalShares += h.shares;
        user.invested = Number((user.invested + h.investedMon).toFixed(6));
        user.dividends = Number((user.dividends + h.dividendsClaimed + h.unclaimedDividends).toFixed(6));
        user.sharesByAsset[assetId] = (user.sharesByAsset[assetId] || 0) + h.shares;
        userAggregates.set(addr, user);
      }
    }

    const leaderboard: LeaderboardEntry[] = [];
    for (const [address, data] of userAggregates.entries()) {
      const patronOfAssets: string[] = [];
      this.assets.forEach((asset) => {
        if (asset.patron === address) {
          patronOfAssets.push(asset.name);
        }
      });

      leaderboard.push({
        address,
        totalShares: data.totalShares,
        patronOfAssets,
        totalInvestedMon: data.invested,
        totalDividendsEarned: data.dividends,
        sharesByAsset: data.sharesByAsset,
      });
    }

    return leaderboard.sort((a, b) => b.totalShares - a.totalShares);
  }

  /**
   * Eventos recientes de Tap
   */
  public getRecentEvents(): TapEvent[] {
    return this.recentEvents;
  }

  /**
   * Subscribir cliente a Server-Sent Events (SSE) para proyectores y celulares
   */
  public addSSEClient(res: Response) {
    this.sseClients.push(res);

    // Enviar estado inicial
    res.write(`data: ${JSON.stringify({ type: "INITIAL_STATE", assets: this.assets, leaderboard: this.getLeaderboard(), recentEvents: this.recentEvents.slice(0, 10) })}\n\n`);

    res.on("close", () => {
      this.sseClients = this.sseClients.filter((client) => client !== res);
    });
  }

  private broadcastSSE(data: any) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    this.sseClients.forEach((client) => {
      try {
        client.write(payload);
      } catch {
        // Ignorar sockets cerrados
      }
    });
  }
}

export const tapToOwnService = new TapToOwnService();
