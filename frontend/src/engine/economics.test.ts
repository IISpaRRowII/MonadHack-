// src/engine/economics.test.ts
import { describe, it, expect } from 'vitest';
import {
  createInitialAssets,
  quoteBuy,
  quoteSell,
} from './economics';

describe('Motor Económico BigInt — Tap-to-Own', () => {
  it('incrementa el precio según la bonding curve lineal y calcula comisiones exactas', () => {
    const assets = createInitialAssets();
    const cafe = assets['cafe-montana-dorada'];

    const q1 = quoteBuy(cafe, 10n);
    expect(q1.spotPriceAfter > q1.spotPriceBefore).toBe(true);
    expect(q1.totalFee).toBe(q1.protocolFee + q1.rewardFee);
    expect(q1.netTotal).toBe(q1.baseValue + q1.totalFee);
  });

  it('impide superar la capacidad máxima de 1.000 unidades', () => {
    const assets = createInitialAssets();
    const volcan = assets['cafe-volcan-rojo'];
    volcan.totalSupply = 995n;

    expect(() => quoteBuy(volcan, 6n)).toThrow(/Capacidad superada/);
    expect(quoteBuy(volcan, 5n).units).toBe(5n);
  });

  it('impide vender más unidades de las que existen en circulación', () => {
    const assets = createInitialAssets();
    const arte = assets['arte-urbano-medellin'];
    arte.totalSupply = 20n;

    expect(() => quoteSell(arte, 25n)).toThrow(/No se pueden vender más unidades/);
  });

  it('mantiene paridad matemática entre compra y venta antes de comisiones', () => {
    const assets = createInitialAssets();
    const local = assets['local-genesis'];

    const buyQuote = quoteBuy(local, 40n);
    local.totalSupply = 40n;
    const sellQuote = quoteSell(local, 40n);

    expect(buyQuote.baseValue).toBe(sellQuote.baseValue);
    expect(sellQuote.netTotal < buyQuote.netTotal).toBe(true);
  });
});