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
}

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
  }> = [
    {
      id: 'cafe-montana-dorada',
      name: 'Café Montaña Dorada',
      category: 'Commodities Agro',
      description: 'Lote especial de altura cultivado en las montañas de Antioquia con tueste dorado.',
      color: '#10b981', // Verde neón
      p0: 12n * WAD,
      slope: (15n * WAD) / 100n, // +0.15 MON por unidad
    },
    {
      id: 'cafe-volcan-rojo',
      name: 'Café Volcán Rojo',
      category: 'Commodities Agro',
      description: 'Variedad exótica de suelo volcánico con alta volatilidad y demanda competitiva.',
      color: '#f97316', // Naranja alerta/energía
      p0: 15n * WAD,
      slope: (22n * WAD) / 100n, // +0.22 MON por unidad
    },
    {
      id: 'arte-urbano-medellin',
      name: 'Arte Urbano Medellín',
      category: 'Cultura & Muralismo',
      description: 'Colección de derechos fraccionados sobre murales icónicos del distrito creativo.',
      color: '#8b5cf6', // Violeta eléctrico
      p0: 18n * WAD,
      slope: (25n * WAD) / 100n, // +0.25 MON por unidad
    },
    {
      id: 'local-genesis',
      name: 'Local Genesis',
      category: 'Real Estate Comercial',
      description: 'Espacio comercial insignia para eventos Web3 y hub tecnológico de la ciudad.',
      color: '#3b82f6', // Azul digital
      p0: 25n * WAD,
      slope: (35n * WAD) / 100n, // +0.35 MON por unidad
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