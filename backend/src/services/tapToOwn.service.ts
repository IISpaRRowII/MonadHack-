import { Response } from "express";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { CoffeeAsset, Shareholder, TapEvent, LeaderboardEntry } from "../types/tapToOwn.js";
import { calculateBuyCost, calculateSellRefund, getNextSharePrice } from "./bondingCurve.js";
import { config } from "../config.js";

class TapToOwnService {
  private assetsFilePath = path.resolve(process.cwd(), "data", "assets.json");

  // Activos de Café de Especialidad RWA Tokenizados
  private assets: CoffeeAsset[] = [];

  // Registro de accionistas por [assetId][address]
  private shareholders: Map<number, Map<string, Shareholder>> = new Map();

  // Historial de Taps recientes
  private recentEvents: TapEvent[] = [];

  // Clientes conectados a Server-Sent Events (SSE) para actualización en tiempo real (Pantalla de proyector y celulares)
  private sseClients: Response[] = [];

  constructor() {
    this.loadAssetsFromFile();
    this.seedInitialHolders();
  }

  private loadAssetsFromFile(): void {
    try {
      if (fs.existsSync(this.assetsFilePath)) {
        const raw = fs.readFileSync(this.assetsFilePath, "utf-8");
        this.assets = JSON.parse(raw);
      }
    } catch (err) {
      console.error("Error leyendo data/assets.json:", err);
    }

    if (!this.assets || this.assets.length === 0) {
      this.assets = [
        {
          id: 0,
          name: "Lote Geisha Imperial",
          company: "Hacienda Imperial Huila",
          products: "Geisha de Altura Micro-Lote Especial",
          totalFundValue: 1.0,
          variety: "Geisha de Altura",
          origin: "Pitalito, Huila",
          altitude: "1,950 msnm",
          notes: ["Jazmín", "Melocotón", "Bergamota"],
          totalShares: 1000,
          soldShares: 145,
          basePrice: 0.001,
          priceSlope: 0.00002,
          currentPrice: 0.0039,
          patron: "0x71C...a49B",
          patronShares: 42,
          dividendPool: 0.0284,
          totalVolume: 0.568,
          color: "#FFB800",
          accentColor: "#FFF0B3",
        },
        {
          id: 1,
          name: "Lote Bourbon Rosado",
          company: "Finca La Esperanza Acevedo",
          products: "Bourbon Rosado Fermentación Carbónica",
          totalFundValue: 0.8,
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
          totalVolume: 0.83,
          color: "#FF4D8B",
          accentColor: "#FFD6E7",
        },
        {
          id: 2,
          name: "Lote Caturra Miel",
          company: "Cooperativa Génova Quindío",
          products: "Caturra Honey Process Tradición",
          totalFundValue: 0.5,
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
          color: "#00E5FF",
          accentColor: "#CCF9FF",
        },
        {
          id: 3,
          name: "Lote Castillo Ancestral",
          company: "Asociación Nariño Bio-Café",
          products: "Castillo Orgánico Selección Altura",
          totalFundValue: 0.4,
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
          color: "#00E676",
          accentColor: "#B9F6CA",
        },
      ];
      this.saveAssetsToFile();
    }

    // Inicializar mapas de accionistas para cada lote cargado
    this.assets.forEach((asset) => {
      if (!this.shareholders.has(asset.id)) {
        this.shareholders.set(asset.id, new Map());
      }
      asset.currentPrice = getNextSharePrice(asset.basePrice, asset.priceSlope, asset.soldShares);
    });
  }

  public saveAssetsToFile(): void {
    try {
      const dir = path.dirname(this.assetsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.assetsFilePath, JSON.stringify(this.assets, null, 2), "utf-8");
    } catch (err) {
      console.error("Error persistiendo assets en .json:", err);
    }
  }

  /**
   * Crear un nuevo fondo de inversión tokenizado y agregarlo a .json
   * El valor total del fondo se divide entre 1,000 micro-acciones fijas
   */
  public createAsset(data: {
    company: string;
    products: string;
    totalFundValue: number;
    origin?: string;
    altitude?: string;
    notes?: string[];
    color?: string;
  }): CoffeeAsset {
    const totalShares = 1000;
    // Se divide el valor total del fondo entre 1,000 acciones
    const basePrice = Number((data.totalFundValue / totalShares).toFixed(6));
    const priceSlope = Number((basePrice * 0.02).toFixed(7));

    const nextId = this.assets.length > 0 ? Math.max(...this.assets.map((a) => a.id)) + 1 : 0;
    const palette = [
      "#FFB800",
      "#FF4D8B",
      "#00E5FF",
      "#00E676",
      "#A78BFA",
      "#F59E0B",
      "#10B981",
      "#EC4899",
      "#38BDF8",
    ];
    const chosenColor = data.color || palette[nextId % palette.length];

    const newAsset: CoffeeAsset = {
      id: nextId,
      name: `Fondo ${data.company}`,
      company: data.company,
      products: data.products,
      totalFundValue: data.totalFundValue,
      variety: data.products,
      origin: data.origin || "Colombia (Especialidad)",
      altitude: data.altitude || "1,850 msnm",
      notes:
        data.notes && data.notes.length > 0
          ? data.notes
          : ["Cosecha RWA", "Tokenizado en Monad"],
      totalShares: 1000,
      soldShares: 0,
      basePrice,
      priceSlope,
      currentPrice: basePrice,
      patron: "Sin Patrón",
      patronShares: 0,
      dividendPool: 0,
      totalVolume: 0,
      color: chosenColor,
      accentColor: chosenColor + "33",
    };

    this.assets.push(newAsset);
    this.shareholders.set(newAsset.id, new Map());
    this.saveAssetsToFile();

    // Notificar en vivo por SSE a todos los clientes conectados
    this.broadcastSSE({
      type: "INITIAL_STATE",
      assets: this.assets,
      leaderboard: this.getLeaderboard(),
      recentEvents: this.recentEvents.slice(0, 10),
    });

    return newAsset;
  }

  private seedInitialHolders() {
    this.assets.forEach((asset) => {
      if (asset.patron && asset.patronShares > 0 && asset.patron !== "Sin Patrón") {
        const lotHolders = this.shareholders.get(asset.id);
        if (lotHolders && !lotHolders.has(asset.patron)) {
          lotHolders.set(asset.patron, {
            address: asset.patron,
            shares: asset.patronShares,
            investedMon: Number((asset.basePrice * asset.patronShares).toFixed(6)),
            dividendsClaimed: 0,
            unclaimedDividends: Number((asset.dividendPool * 0.6).toFixed(6)),
            lastTapTimestamp: Date.now() - 60000,
          });
        }
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
  public tapToBuy(assetId: number, buyerAddress: string, sharesCount: number = 1, txHash?: string): { success: boolean; event?: TapEvent; error?: string } {
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
      txHash,
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

    this.saveAssetsToFile();
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

    this.saveAssetsToFile();
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
   * Obtener el portafolio y estadísticas personales de un inversor
   */
  public getUserPortfolio(address: string) {
    let totalShares = 0;
    let totalInvestedMon = 0;
    let totalCurrentValueMon = 0;
    let totalUnclaimedDividends = 0;
    let totalClaimedDividends = 0;

    const holdings = this.assets.map((asset) => {
      const lotHolders = this.shareholders.get(asset.id);
      const holder = lotHolders?.get(address);
      const shares = holder?.shares || 0;
      const investedMon = holder?.investedMon || 0;
      const unclaimedDividends = holder?.unclaimedDividends || 0;
      const dividendsClaimed = holder?.dividendsClaimed || 0;
      const currentValue = Number((shares * asset.currentPrice).toFixed(6));
      const isPatron = asset.patron.toLowerCase() === address.toLowerCase();

      totalShares += shares;
      totalInvestedMon += investedMon;
      totalCurrentValueMon += currentValue;
      totalUnclaimedDividends += unclaimedDividends;
      totalClaimedDividends += dividendsClaimed;

      return {
        assetId: asset.id,
        assetName: asset.name,
        variety: asset.variety,
        shares,
        percentageOfLot: Number(((shares / asset.totalShares) * 100).toFixed(2)),
        investedMon,
        currentValueMon: currentValue,
        pnlMon: Number((currentValue - investedMon).toFixed(6)),
        pnlPercent: investedMon > 0 ? Number((((currentValue - investedMon) / investedMon) * 100).toFixed(2)) : 0,
        unclaimedDividends,
        dividendsClaimed,
        isPatron,
        currentPrice: asset.currentPrice,
        color: asset.color,
      };
    });

    return {
      address,
      totalShares,
      totalInvestedMon: Number(totalInvestedMon.toFixed(6)),
      totalCurrentValueMon: Number(totalCurrentValueMon.toFixed(6)),
      totalPnlMon: Number((totalCurrentValueMon - totalInvestedMon).toFixed(6)),
      totalPnlPercent:
        totalInvestedMon > 0
          ? Number((((totalCurrentValueMon - totalInvestedMon) / totalInvestedMon) * 100).toFixed(2))
          : 0,
      totalUnclaimedDividends: Number(totalUnclaimedDividends.toFixed(6)),
      totalClaimedDividends: Number(totalClaimedDividends.toFixed(6)),
      holdings,
    };
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
