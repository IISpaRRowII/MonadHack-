import { Response } from "express";
import { ethers } from "ethers";
import { CoffeeAsset, Shareholder, TapEvent, LeaderboardEntry, RedemptionRecord } from "../types/tapToOwn.js";
import { calculateBuyCost, calculateSellRefund, getNextSharePrice } from "./bondingCurve.js";
import { config } from "../config.js";

class TapToOwnService {
  // 4 Activos RWA Tokenizados en Monad
  private assets: CoffeeAsset[] = [
    {
      id: 0,
      slug: "cafe-montana-dorada",
      name: "Café Montaña Dorada",
      category: "Commodities Agro / Antioquia",
      variety: "Geisha Honey de Exportación",
      origin: "Jardín & Andes, Antioquia",
      altitude: "1,950 msnm",
      notes: ["Jazmín", "Miel de Azahar", "Cítricos"],
      totalShares: 1000,
      soldShares: 145,
      basePrice: 0.001, // en MON
      priceSlope: 0.00005,
      currentPrice: 0.00825,
      patron: "0x71C8A329...a49B",
      patronShares: 42,
      dividendPool: 0.0284,
      totalVolume: 0.568,
      color: "#FFB800", // Oro
      accentColor: "#FFF0B3",
      totalBurnedUnits: 0,
      businessRevenueInjected: 0,
      rwaBacking: "1 Bolsa de 500g Café Especial Honey por cada 40 unidades quemadas",
      monthlyYieldTarget: 150,
      yieldSource: "Liquidación mensual de cosechas de exportación",
    },
    {
      id: 1,
      slug: "cafe-volcan-rojo",
      name: "Café Volcán Rojo",
      category: "Café de Suelo Volcánico / Alta Especialidad",
      variety: "Bourbon Rosado Fermentado Volcánico",
      origin: "Acevedo & Nevado, Huila",
      altitude: "1,800 msnm",
      notes: ["Frutos Rojos", "Caña de Azúcar", "Cacao"],
      totalShares: 1000,
      soldShares: 210,
      basePrice: 0.0015,
      priceSlope: 0.00008,
      currentPrice: 0.0183,
      patron: "0x34BF9120...F921",
      patronShares: 60,
      dividendPool: 0.0415,
      totalVolume: 0.830,
      color: "#FF4D8B", // Rosado / Rubí
      accentColor: "#FFD6E7",
      totalBurnedUnits: 0,
      businessRevenueInjected: 0,
      rwaBacking: "1 Kit Barista de Origen Volcánico por cada 60 unidades quemadas",
      monthlyYieldTarget: 220,
      yieldSource: "Ventas en tiendas aliadas y micro-lotes especiales",
    },
    {
      id: 2,
      slug: "arte-urbano-medellin",
      name: "Arte Urbano Medellín",
      category: "Cultura, Muralismo Comuna 13 & Derechos de Autor",
      variety: "Colección Seriadas & Derechos Murales",
      origin: "Comuna 13, Medellín",
      altitude: "1,550 msnm",
      notes: ["Muralismo", "Street Art", "Regalías"],
      totalShares: 1000,
      soldShares: 90,
      basePrice: 0.0008,
      priceSlope: 0.00004,
      currentPrice: 0.0044,
      patron: "0x89D71C82...71E3",
      patronShares: 25,
      dividendPool: 0.0112,
      totalVolume: 0.224,
      color: "#00E5FF", // Cyan Eléctrico
      accentColor: "#CCF9FF",
      totalBurnedUnits: 0,
      businessRevenueInjected: 0,
      rwaBacking: "1 Lámina Seriada Firmada + Tour VIP por cada 75 unidades quemadas",
      monthlyYieldTarget: 300,
      yieldSource: "Cobro de licencias publicitarias y merchandising de murales",
    },
    {
      id: 3,
      slug: "local-genesis",
      name: "Local Genesis",
      category: "Real Estate Comercial / Hub Web3 Medellín",
      variety: "Inmueble Comercial & Espacios Coworking",
      origin: "El Poblado, Medellín",
      altitude: "1,600 msnm",
      notes: ["Coworking", "Eventos Web3", "Barra Café"],
      totalShares: 1000,
      soldShares: 65,
      basePrice: 0.001,
      priceSlope: 0.00006,
      currentPrice: 0.0049,
      patron: "0x52Ac948B...c904",
      patronShares: 18,
      dividendPool: 0.0078,
      totalVolume: 0.156,
      color: "#00E676", // Verde Esmeralda
      accentColor: "#B9F6CA",
      totalBurnedUnits: 0,
      businessRevenueInjected: 0,
      rwaBacking: "1 Pase Mensual VIP Coworking por cada 100 unidades quemadas",
      monthlyYieldTarget: 450,
      yieldSource: "Arrendamiento comercial y consumo en barra del Hub",
    },
  ];

  // Registro de accionistas por [assetId][address]
  private shareholders: Map<number, Map<string, Shareholder>> = new Map();

  // Historial de Redenciones Físicas RWA
  private redemptions: RedemptionRecord[] = [];

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

  /**
   * Quemar acciones para canjear un producto físico RWA (Burn-to-Redeem)
   */
  public burnToRedeem(
    assetId: number,
    redeemerAddress: string,
    unitsToBurn: number,
    optionId: string,
    realWorldItemTitle?: string
  ): { success: boolean; redemption?: RedemptionRecord; error?: string } {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) {
      return { success: false, error: "Activo RWA no encontrado" };
    }

    if (unitsToBurn <= 0) {
      return { success: false, error: "La cantidad de unidades a quemar debe ser mayor a 0" };
    }

    const lotHolders = this.shareholders.get(assetId)!;
    const holder = lotHolders.get(redeemerAddress);

    if (!holder || holder.shares < unitsToBurn) {
      return {
        success: false,
        error: `Acciones insuficientes para redención. Tienes ${holder ? holder.shares : 0} y requieres ${unitsToBurn}`,
      };
    }

    // 1. Reducir tenencia del usuario
    holder.shares -= unitsToBurn;
    if (holder.shares === 0) {
      lotHolders.delete(redeemerAddress);
    }

    // 2. Reducir suministro circulante y aumentar histórico quemado
    asset.soldShares -= unitsToBurn;
    asset.totalBurnedUnits += unitsToBurn;
    asset.currentPrice = getNextSharePrice(asset.basePrice, asset.priceSlope, asset.soldShares);

    // 3. Recalcular líder (Patrón) si el que quemó era el líder
    if (asset.patron === redeemerAddress) {
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

    // 4. Generar identificador de redención y tracking hash
    const redeemIndex = (this.redemptions.length + 1).toString().padStart(4, "0");
    const isTestnet = redeemerAddress.startsWith("0x");
    const redeemId = isTestnet ? `0xREDEEM-${redeemIndex}` : `DEMO-REDEEM-${redeemIndex}`;
    const trackingHash = "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    const itemDesc = realWorldItemTitle || asset.rwaBacking;

    const record: RedemptionRecord = {
      id: redeemId,
      timestamp: Date.now(),
      redeemerAddress,
      assetId,
      assetName: asset.name,
      optionId,
      unitsBurned: unitsToBurn,
      realWorldItem: itemDesc,
      status: "CONFIRMED",
      trackingHash,
    };

    this.redemptions.unshift(record);

    const burnEvent: TapEvent = {
      id: `burn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      assetId,
      assetName: asset.name,
      buyer: redeemerAddress,
      shares: unitsToBurn,
      pricePerShare: 0,
      totalCost: 0,
      dividendDistributed: 0,
      timestamp: Date.now(),
      isNewPatron: false,
      type: "BURN_REDEEM",
      metadata: {
        redeemId,
        realWorldItem: itemDesc,
        trackingHash,
      },
    };

    this.recentEvents.unshift(burnEvent);
    if (this.recentEvents.length > 50) this.recentEvents.pop();

    this.broadcastSSE({
      type: "BURN_REDEEM_EXECUTED",
      event: burnEvent,
      redemption: record,
      asset: this.getAssetById(assetId),
    });

    return { success: true, redemption: record };
  }

  /**
   * Inyectar flujo de caja real del negocio físico (Real Yield)
   */
  public injectRealYield(
    assetId: number,
    amountMon?: number
  ): { success: boolean; amountInjected: number; affectedHolders: number; error?: string } {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) {
      return { success: false, amountInjected: 0, affectedHolders: 0, error: "Activo RWA no encontrado" };
    }

    const amount = amountMon !== undefined && amountMon > 0 ? amountMon : asset.monthlyYieldTarget;
    asset.dividendPool = Number((asset.dividendPool + amount).toFixed(6));
    asset.businessRevenueInjected = Number((asset.businessRevenueInjected + amount).toFixed(6));

    const lotHolders = this.shareholders.get(assetId)!;
    let affectedHolders = 0;

    if (asset.soldShares > 0) {
      for (const holder of lotHolders.values()) {
        const shareRatio = holder.shares / asset.soldShares;
        const holderShare = Number((amount * shareRatio).toFixed(6));
        holder.unclaimedDividends = Number((holder.unclaimedDividends + holderShare).toFixed(6));
        affectedHolders++;
      }
    }

    const yieldEvent: TapEvent = {
      id: `yield-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      assetId,
      assetName: asset.name,
      buyer: "PHYSICAL_BUSINESS_REVENUE",
      shares: 0,
      pricePerShare: 0,
      totalCost: amount,
      dividendDistributed: amount,
      timestamp: Date.now(),
      isNewPatron: false,
      type: "REAL_YIELD",
      metadata: {
        yieldSource: asset.yieldSource,
        amountInjectedMon: amount,
        affectedHolders,
      },
    };

    this.recentEvents.unshift(yieldEvent);
    if (this.recentEvents.length > 50) this.recentEvents.pop();

    this.broadcastSSE({
      type: "REAL_YIELD_INJECTED",
      event: yieldEvent,
      asset: this.getAssetById(assetId),
      amountInjected: amount,
      affectedHolders,
    });

    return { success: true, amountInjected: amount, affectedHolders };
  }

  /**
   * Obtener lista de redenciones físicas
   */
  public getRedemptions(address?: string): RedemptionRecord[] {
    if (!address) return this.redemptions;
    const lower = address.toLowerCase();
    return this.redemptions.filter((r) => r.redeemerAddress.toLowerCase() === lower);
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
