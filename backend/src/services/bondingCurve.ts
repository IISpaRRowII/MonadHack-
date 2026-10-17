/**
 * Bonding Curve & Dividend Mathematics
 * Diseñado para ejecución ultrarrápida y fiel a la lógica que tendrá el contrato en Solidity.
 */

export const DIVIDEND_RATE = 0.05; // 5% de cada compra se reparte entre los dueños actuales
export const SELL_PENALTY = 0.10;  // 10% de penalización al vender (se queda en el dividendPool)

/**
 * Calcula el precio unitario de la siguiente acción en la curva
 * P(s) = basePrice + s * slope
 */
export function getNextSharePrice(basePrice: number, slope: number, currentSupply: number): number {
  return Number((basePrice + currentSupply * slope).toFixed(6));
}

/**
 * Calcula el costo total de comprar 'count' acciones consecutivas
 * Integral discreta: Sum_{i=0}^{count-1} (basePrice + (s + i) * slope)
 */
export function calculateBuyCost(
  basePrice: number,
  slope: number,
  currentSupply: number,
  count: number = 1
): { totalCost: number; averagePrice: number; dividendAmount: number; netCost: number } {
  if (count <= 0) {
    return { totalCost: 0, averagePrice: 0, dividendAmount: 0, netCost: 0 };
  }

  // Costo base por las k acciones
  const baseCost = basePrice * count;
  // Componente de pendiente sumatoria: slope * [ count * s + (count * (count - 1)) / 2 ]
  const slopeSum = count * currentSupply + (count * (count - 1)) / 2;
  const slopeCost = slope * slopeSum;

  const totalCost = Number((baseCost + slopeCost).toFixed(6));
  const averagePrice = Number((totalCost / count).toFixed(6));
  const dividendAmount = Number((totalCost * DIVIDEND_RATE).toFixed(6));
  const netCost = Number((totalCost - dividendAmount).toFixed(6));

  return {
    totalCost,
    averagePrice,
    dividendAmount,
    netCost,
  };
}

/**
 * Calcula el reembolso al vender 'count' acciones de vuelta a la curva
 */
export function calculateSellRefund(
  basePrice: number,
  slope: number,
  currentSupply: number,
  count: number = 1
): { grossRefund: number; penaltyToPool: number; netRefund: number } {
  if (count <= 0 || currentSupply < count) {
    return { grossRefund: 0, penaltyToPool: 0, netRefund: 0 };
  }

  // Sumatoria hacia atrás: Sum_{i=1}^{count} (basePrice + (s - i) * slope)
  const baseRefund = basePrice * count;
  const slopeSum = count * currentSupply - (count * (count + 1)) / 2;
  const slopeRefund = slope * slopeSum;

  const grossRefund = Number((baseRefund + slopeRefund).toFixed(6));
  const penaltyToPool = Number((grossRefund * SELL_PENALTY).toFixed(6));
  const netRefund = Number((grossRefund - penaltyToPool).toFixed(6));

  return {
    grossRefund,
    penaltyToPool,
    netRefund,
  };
}
