// src/engine/economics.ts

export const DECIMALS = 18n;
export const WAD = 10n ** DECIMALS; // 1.0 unidad monetaria = 10^18
export const MAX_SUPPLY = 1000n;
export const MAJORITY_THRESHOLD = 501n; // > 500 unidades = Mayoría Absoluta

// Comisiones en Basis Points (10000 bps = 100%)
export const TOTAL_FEE_BPS = 300n;      // 3.0% comisión total
export const PROTOCOL_FEE_BPS = 150n;   // 1.5% reserva del protocolo
export const REWARD_FEE_BPS = 150n;     // 1.5% repartido a tenedores del activo
export const BPS_DENOMINATOR = 10000n;

export type AssetId =
  | 'cafe-montana-dorada'
  | 'cafe-volcan-rojo'
  | 'arte-urbano-medellin'
  | 'local-genesis';

export type BotStrategy = 'FREQUENT_BUYER' | 'SELLER' | 'CONSERVATIVE' | 'AGGRESSIVE';

export interface PricePoint {
  tick: number;
  timestamp: string;
  price: number; // Solo para renderizado en Recharts
  supply: number;
}

export interface RedeemOption {
  id: string;
  assetId: AssetId;
  title: string;
  description: string;
  requiredUnits: bigint;
  realWorldItem: string;
  badge: string;
  estimatedDelivery: string;
}

export interface RedemptionRecord {
  id: string; // DEMO-REDEEM-XXXX o 0xREDEEM-XXXX
  timestamp: number;
  participantId: string;
  participantName: string;
  assetId: AssetId;
  assetName: string;
  optionId: string;
  optionTitle: string;
  unitsBurned: bigint;
  realWorldItem: string;
  status: 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED';
  trackingHash: string;
}

export interface AssetState {
  id: AssetId;
  name: string;
  category: string;
  description: string;
  color: string;
  basePrice: bigint; // P0 en WAD
  slope: bigint;     // Incremento lineal m por unidad en WAD
  totalSupply: bigint;
  reserveBalance: bigint;
  volumeTotal: bigint;
  rewardPool: bigint;
  initialPrice: bigint;
  priceHistory: PricePoint[];
  totalBurnedUnits: bigint;        // Histórico de unidades quemadas/redimidas
  businessRevenueInjected: bigint; // Total de MON inyectado por ventas del negocio real
  rwaBacking: string;              // Descripción del respaldo físico
  monthlyYieldTarget: bigint;      // Rendimiento mensual estimado en WAD
  yieldSource: string;             // Fuente del flujo de caja
}

export const REDEEM_OPTIONS: Record<AssetId, RedeemOption> = {
  'cafe-montana-dorada': {
    id: 'redeem-montana-honey',
    assetId: 'cafe-montana-dorada',
    title: 'Bolsa 500g Café Especial Honey',
    description: '1 Bolsa de 500g de Café Especial Honey de exportación con trazabilidad on-chain y despacho a domicilio.',
    requiredUnits: 40n,
    realWorldItem: 'Bolsa 500g Café Especial Honey (Antioquia Export)',
    badge: 'Cosecha Selección 2026',
    estimatedDelivery: '3-5 días hábiles a Colombia / 7-10 días internacional',
  },
  'cafe-volcan-rojo': {
    id: 'redeem-volcan-kit',
    assetId: 'cafe-volcan-rojo',
    title: 'Kit Barista Volcánico + Tueste Experimental',
    description: '1 Kit Barista de Origen Volcánico + Muestra de Tueste Experimental de alta especialidad.',
    requiredUnits: 60n,
    realWorldItem: 'Kit Barista de Origen Volcánico + Muestra Experimental',
    badge: 'Edición Limitada Volcán',
    estimatedDelivery: '3-5 días hábiles con empaque presurizado',
  },
  'arte-urbano-medellin': {
    id: 'redeem-arte-print-tour',
    assetId: 'arte-urbano-medellin',
    title: 'Lámina Seriada + Tour VIP Comuna 13',
    description: '1 Lámina de Colección Seriada y Firmada por el Artista + Tour VIP Guiado por los murales icónicos.',
    requiredUnits: 75n,
    realWorldItem: 'Lámina de Colección Seriada y Firmada + Tour VIP',
    badge: 'Certificado de Autenticidad NFT/Físico',
    estimatedDelivery: 'Certificado digital instantáneo + Despacho de lámina en 5 días',
  },
  'local-genesis': {
    id: 'redeem-local-vip-pass',
    assetId: 'local-genesis',
    title: 'Pase Coworking VIP + Eventos Web3',
    description: '1 Pase Mensual VIP de Coworking / Acceso Preferencial a Eventos Web3 en el Hub Medellín.',
    requiredUnits: 100n,
    realWorldItem: 'Pase Mensual VIP Coworking + Acceso Exclusivo a Eventos Web3',
    badge: 'Membresía Keycard Genesis',
    estimatedDelivery: 'Acceso digital inmediato mediante firma de wallet',
  },
};

export interface Participant {
  id: string;
  name: string;
  isBot: boolean;
  strategy?: BotStrategy;
  balance: bigint;
  holdings: Record<AssetId, bigint>;
  costBasis: Record<AssetId, bigint>;
  realizedPnL: bigint;
  pendingRewards: bigint;
  claimedRewards: bigint;
  tradesCount: number;
  leadershipChangesWon: number;
  badges: string[];
}

export interface TradeQuote {
  type: 'BUY' | 'SELL';
  assetId: AssetId;
  units: bigint;
  baseValue: bigint;
  protocolFee: bigint;
  rewardFee: bigint;
  totalFee: bigint;
  netTotal: bigint; // Costo total en BUY, retorno neto en SELL
  spotPriceBefore: bigint;
  spotPriceAfter: bigint;
  priceImpactBps: bigint;
}

export interface TradeRecord {
  txId: string; // Siempre prefijado con DEMO- en modo simulación
  timestamp: number;
  participantId: string;
  participantName: string;
  isBot: boolean;
  assetId: AssetId;
  type: 'BUY' | 'SELL';
  units: bigint;
  unitPriceAvg: bigint;
  totalValue: bigint;
  feePaid: bigint;
}

/**
 * Precio spot actual en la curva lineal: P(S) = P0 + m * S
 */
export function getSpotPrice(basePrice: bigint, slope: bigint, currentSupply: bigint): bigint {
  return basePrice + slope * currentSupply;
}

/**
 * Costo base exacto de comprar `units` desde `currentSupply`.
 * Fórmula integral discreta exacta:
 * Costo = units * P0 + slope * (currentSupply * units + (units * (units - 1)) / 2)
 */
export function calculateLinearCurveBase(
  basePrice: bigint,
  slope: bigint,
  startSupply: bigint,
  units: bigint
): bigint {
  if (units <= 0n) return 0n;
  const fixedPart = units * basePrice;
  const arithmeticSum = startSupply * units + (units * (units - 1n)) / 2n;
  const linearPart = slope * arithmeticSum;
  return fixedPart + linearPart;
}

/**
 * Cotización de compra con validación de reglas económicas
 */
export function quoteBuy(asset: AssetState, units: bigint): TradeQuote {
  if (units <= 0n) {
    throw new Error('La cantidad a comprar debe ser mayor a 0 unidades.');
  }
  if (asset.totalSupply + units > MAX_SUPPLY) {
    throw new Error(
      `Capacidad superada: solo quedan ${(MAX_SUPPLY - asset.totalSupply).toString()} unidades disponibles de 1.000.`
    );
  }

  const spotPriceBefore = getSpotPrice(asset.basePrice, asset.slope, asset.totalSupply);
  const baseValue = calculateLinearCurveBase(asset.basePrice, asset.slope, asset.totalSupply, units);

  const protocolFee = (baseValue * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
  const rewardFee = (baseValue * REWARD_FEE_BPS) / BPS_DENOMINATOR;
  const totalFee = protocolFee + rewardFee;
  const netTotal = baseValue + totalFee;

  const spotPriceAfter = getSpotPrice(asset.basePrice, asset.slope, asset.totalSupply + units);
  const priceImpactBps =
    spotPriceBefore > 0n ? ((spotPriceAfter - spotPriceBefore) * BPS_DENOMINATOR) / spotPriceBefore : 0n;

  return {
    type: 'BUY',
    assetId: asset.id,
    units,
    baseValue,
    protocolFee,
    rewardFee,
    totalFee,
    netTotal,
    spotPriceBefore,
    spotPriceAfter,
    priceImpactBps,
  };
}

/**
 * Cotización de venta con validación de suministro
 */
export function quoteSell(asset: AssetState, units: bigint): TradeQuote {
  if (units <= 0n) {
    throw new Error('La cantidad a vender debe ser mayor a 0 unidades.');
  }
  if (units > asset.totalSupply) {
    throw new Error('No se pueden vender más unidades de las que existen en circulación.');
  }

  const spotPriceBefore = getSpotPrice(asset.basePrice, asset.slope, asset.totalSupply);
  const newSupply = asset.totalSupply - units;
  const baseValue = calculateLinearCurveBase(asset.basePrice, asset.slope, newSupply, units);

  const protocolFee = (baseValue * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
  const rewardFee = (baseValue * REWARD_FEE_BPS) / BPS_DENOMINATOR;
  const totalFee = protocolFee + rewardFee;
  const netTotal = baseValue - totalFee;

  const spotPriceAfter = getSpotPrice(asset.basePrice, asset.slope, newSupply);
  const priceImpactBps =
    spotPriceBefore > 0n ? ((spotPriceBefore - spotPriceAfter) * BPS_DENOMINATOR) / spotPriceBefore : 0n;

  return {
    type: 'SELL',
    assetId: asset.id,
    units,
    baseValue,
    protocolFee,
    rewardFee,
    totalFee,
    netTotal,
    spotPriceBefore,
    spotPriceAfter,
    priceImpactBps,
  };
}

/**
 * Quema de unidades para canje físico (Burn-to-Redeem).
 * Reduce totalSupply del activo y la tenencia del usuario sin perjudicar la reserva líquida.
 */
export function burnToRedeem(
  asset: AssetState,
  participantUnits: bigint,
  unitsToBurn: bigint
): { updatedAsset: AssetState; remainingUnits: bigint } {
  if (unitsToBurn <= 0n) {
    throw new Error('La cantidad de unidades a quemar debe ser mayor a 0.');
  }
  if (participantUnits < unitsToBurn) {
    throw new Error(
      `Saldo insuficiente para redimir: posees ${participantUnits.toString()} u. y requieres ${unitsToBurn.toString()} u.`
    );
  }
  if (asset.totalSupply < unitsToBurn) {
    throw new Error('Error de suministro: el activo no cuenta con suficientes unidades en circulación.');
  }

  const updatedAsset: AssetState = {
    ...asset,
    totalSupply: asset.totalSupply - unitsToBurn,
    totalBurnedUnits: asset.totalBurnedUnits + unitsToBurn,
  };

  return {
    updatedAsset,
    remainingUnits: participantUnits - unitsToBurn,
  };
}

/**
 * Formatea un valor BigInt (WAD 10^18) a string legible sin perder precisión contable
 */
export function formatCurrency(value: bigint, decimals = 2): string {
  const isNegative = value < 0n;
  const absVal = isNegative ? -value : value;
  const integerPart = absVal / WAD;
  const remainder = absVal % WAD;

  const scale = 10n ** BigInt(decimals);
  const fractionalPart = (remainder * scale) / WAD;
  const fracStr = fractionalPart.toString().padStart(decimals, '0');

  const intFormatted = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${isNegative ? '-' : ''}${intFormatted}.${fracStr} MON`;
}

export function wadToNumber(value: bigint): number {
  return Number(value / (10n ** 14n)) / 10000;
}

/**
 * Estado inicial de los 4 activos obligatorios
 */
export function createInitialAssets(): Record<AssetId, AssetState> {
  const configs: Array<{
    id: AssetId;
    name: string;
    category: string;
    description: string;
    color: string;
    p0: bigint;
    slope: bigint;
    rwaBacking: string;
    monthlyYieldTarget: bigint;
    yieldSource: string;
  }> = [
    {
      id: 'cafe-montana-dorada',
      name: 'Café Montaña Dorada',
      category: 'Commodities Agro',
      description: 'Lote especial de altura cultivado en las montañas de Antioquia con tueste dorado.',
      color: '#10b981', // Verde neón
      p0: 12n * WAD,
      slope: (15n * WAD) / 100n, // +0.15 MON por unidad
      rwaBacking: 'Bolsa 500g Café Especial Honey',
      monthlyYieldTarget: 150n * WAD,
      yieldSource: 'Liquidación mensual de cosechas de exportación (+150 MON)',
    },
    {
      id: 'cafe-volcan-rojo',
      name: 'Café Volcán Rojo',
      category: 'Commodities Agro',
      description: 'Variedad exótica de suelo volcánico con alta volatilidad y demanda competitiva.',
      color: '#f97316', // Naranja alerta/energía
      p0: 15n * WAD,
      slope: (22n * WAD) / 100n, // +0.22 MON por unidad
      rwaBacking: 'Kit Barista Origen Volcánico',
      monthlyYieldTarget: 220n * WAD,
      yieldSource: 'Ventas en tiendas aliadas y micro-lotes especiales (+220 MON)',
    },
    {
      id: 'arte-urbano-medellin',
      name: 'Arte Urbano Medellín',
      category: 'Cultura & Muralismo',
      description: 'Colección de derechos fraccionados sobre murales icónicos del distrito creativo.',
      color: '#8b5cf6', // Violeta eléctrico
      p0: 18n * WAD,
      slope: (25n * WAD) / 100n, // +0.25 MON por unidad
      rwaBacking: 'Lámina Seriada + Tour VIP Comuna 13',
      monthlyYieldTarget: 300n * WAD,
      yieldSource: 'Licencias de uso de imagen de murales para publicidad (+300 MON)',
    },
    {
      id: 'local-genesis',
      name: 'Local Genesis',
      category: 'Real Estate Comercial',
      description: 'Espacio comercial insignia para eventos Web3 y hub tecnológico de la ciudad.',
      color: '#3b82f6', // Azul digital
      p0: 25n * WAD,
      slope: (35n * WAD) / 100n, // +0.35 MON por unidad
      rwaBacking: 'Pase Mensual Coworking VIP',
      monthlyYieldTarget: 450n * WAD,
      yieldSource: 'Recaudo mensual de arrendamiento comercial y barra (+450 MON)',
    },
  ];

  const assets = {} as Record<AssetId, AssetState>;
  for (const c of configs) {
    assets[c.id] = {
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
      color: c.color,
      basePrice: c.p0,
      slope: c.slope,
      totalSupply: 0n,
      reserveBalance: 0n,
      volumeTotal: 0n,
      rewardPool: 0n,
      initialPrice: c.p0,
      priceHistory: [{ tick: 0, timestamp: 'Inicio', price: wadToNumber(c.p0), supply: 0 }],
      totalBurnedUnits: 0n,
      businessRevenueInjected: 0n,
      rwaBacking: c.rwaBacking,
      monthlyYieldTarget: c.monthlyYieldTarget,
      yieldSource: c.yieldSource,
    };
  }
  return assets;
}

/**
 * Crea el jugador humano + 40 bots con estrategias diferenciadas
 */
export function createInitialParticipants(): Record<string, Participant> {
  const emptyHoldings = (): Record<AssetId, bigint> => ({
    'cafe-montana-dorada': 0n,
    'cafe-volcan-rojo': 0n,
    'arte-urbano-medellin': 0n,
    'local-genesis': 0n,
  });

  const participants: Record<string, Participant> = {
    HUMAN: {
      id: 'HUMAN',
      name: 'Tú (Jugador)',
      isBot: false,
      balance: 120_000n * WAD, // 120,000 MON simulados iniciales
      holdings: emptyHoldings(),
      costBasis: emptyHoldings(),
      realizedPnL: 0n,
      pendingRewards: 0n,
      claimedRewards: 0n,
      tradesCount: 0,
      leadershipChangesWon: 0,
      badges: ['Pionero Demo'],
    },
  };

  const strategies: BotStrategy[] = ['FREQUENT_BUYER', 'SELLER', 'CONSERVATIVE', 'AGGRESSIVE'];
  const prefixes = ['Alpha', 'Nexus', 'Vortex', 'Krono', 'Paisa', 'Quant', 'Cipher', 'Nova', 'Titan', 'Zenith'];

  for (let i = 1; i <= 40; i++) {
    const id = `BOT-${i.toString().padStart(2, '0')}`;
    const strategy = strategies[(i - 1) % strategies.length];
    const prefix = prefixes[(i - 1) % prefixes.length];
    // Competidores agresivos tienen mayor capital para pelear mayorías
    const initialMon =
      strategy === 'AGGRESSIVE'
        ? 160_000n * WAD
        : strategy === 'FREQUENT_BUYER'
        ? 95_000n * WAD
        : 75_000n * WAD;

    participants[id] = {
      id,
      name: `${prefixBotName(strategy)}_${prefix}${i}`,
      isBot: true,
      strategy,
      balance: initialMon,
      holdings: emptyHoldings(),
      costBasis: emptyHoldings(),
      realizedPnL: 0n,
      pendingRewards: 0n,
      claimedRewards: 0n,
      tradesCount: 0,
      leadershipChangesWon: 0,
      badges: [],
    };
  }

  return participants;
}

function prefixBotName(strategy: BotStrategy): string {
  switch (strategy) {
    case 'AGGRESSIVE':
      return 'Whale';
    case 'FREQUENT_BUYER':
      return 'Accum';
    case 'SELLER':
      return 'Scalp';
    case 'CONSERVATIVE':
      return 'Hodl';
  }
}