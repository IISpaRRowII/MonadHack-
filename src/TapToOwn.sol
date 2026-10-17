// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TapToOwn - Guerra de Micro-Acciones de Cafetales en Vivo (RWA Gamificado)
 * @notice Implementado para alta concurrencia y paralelismo en Monad (300ms block time).
 * 4 lotes independientes con Bonding Curve y dividendos automáticos instantáneos.
 */
contract TapToOwn {
    uint256 public constant TOTAL_ASSETS = 4;
    uint256 public constant SHARES_PER_ASSET = 1000;
    uint256 public constant DIVIDEND_BPS = 500; // 5% (500 / 10000)

    struct Asset {
        string name;
        uint256 basePrice;    // en wei
        uint256 priceSlope;   // incremento de precio por acción vendida
        uint256 soldShares;   // acciones en circulación
        address patron;       // accionista mayoritario ("El Patrón del Lote")
        uint256 patronShares; // cantidad de acciones del patrón
        uint256 accDividendPerShare; // acumulador para reparto de dividendos O(1)
        uint256 totalVolume;  // volumen histórico en wei
    }

    struct HolderInfo {
        uint256 shares;
        uint256 rewardDebt;
        uint256 pendingDividends;
    }

    Asset[TOTAL_ASSETS] public assets;
    // assetId => address => HolderInfo
    mapping(uint256 => mapping(address => HolderInfo)) public holders;

    // Eventos optimizados para indexación rápida y Server-Sent Events en backend
    event ShareBought(
        uint256 indexed assetId,
        address indexed buyer,
        uint256 sharesBought,
        uint256 totalCost,
        uint256 currentPrice
    );

    event OwnershipFlipped(
        uint256 indexed assetId,
        address indexed newPatron,
        address indexed oldPatron,
        uint256 newPatronShares
    );

    event DividendClaimed(
        uint256 indexed assetId,
        address indexed holder,
        uint256 amount
    );

    constructor() {
        // Inicializar los 4 lotes de café de especialidad
        assets[0] = Asset("Lote Geisha Imperial", 0.001 ether, 0.00002 ether, 0, address(0), 0, 0, 0);
        assets[1] = Asset("Lote Bourbon Rosado",  0.0008 ether, 0.000015 ether, 0, address(0), 0, 0, 0);
        assets[2] = Asset("Lote Caturra Miel",     0.0005 ether, 0.00001 ether, 0, address(0), 0, 0, 0);
        assets[3] = Asset("Lote Castillo Ancestral", 0.0004 ether, 0.00001 ether, 0, address(0), 0, 0, 0);
    }

    /**
     * @notice Devuelve el precio actual del próximo micro-share
     */
    function getPrice(uint256 assetId) public view returns (uint256) {
        require(assetId < TOTAL_ASSETS, "Asset ID invalido");
        Asset memory a = assets[assetId];
        return a.basePrice + (a.soldShares * a.priceSlope);
    }

    /**
     * @notice Calcula el costo total de comprar 'count' acciones consecutivas en la curva
     */
    function getBuyCost(uint256 assetId, uint256 count) public view returns (uint256 totalCost) {
        require(assetId < TOTAL_ASSETS, "Asset ID invalido");
        require(count > 0, "Debe comprar al menos 1");
        Asset memory a = assets[assetId];
        require(a.soldShares + count <= SHARES_PER_ASSET, "Supera el limite de 1000 acciones");

        uint256 baseCost = a.basePrice * count;
        uint256 slopeSum = count * a.soldShares + (count * (count - 1)) / 2;
        uint256 slopeCost = a.priceSlope * slopeSum;
        totalCost = baseCost + slopeCost;
    }

    /**
     * @notice Comprar micro-acciones haciendo "Tap"
     */
    function buyShares(uint256 assetId, uint256 count) external payable {
        uint256 cost = getBuyCost(assetId, count);
        require(msg.value >= cost, "Monad MON insuficiente enviado");

        Asset storage a = assets[assetId];
        HolderInfo storage h = holders[assetId][msg.sender];

        // 1. Cobrar y apartar 5% de dividendos para repartir entre accionistas actuales
        uint256 dividend = (cost * DIVIDEND_BPS) / 10000;
        if (a.soldShares > 0 && dividend > 0) {
            // Algoritmo Sushi/MasterChef O(1) de dividendos por acción
            a.accDividendPerShare += (cost * DIVIDEND_BPS * 1e18) / (10000 * a.soldShares);
        }

        // 2. Liquidar dividendos acumulados previos del usuario
        if (h.shares > 0) {
            uint256 pending = ((h.shares * a.accDividendPerShare) / 1e18) - h.rewardDebt;
            h.pendingDividends += pending;
        }

        // 3. Incrementar balance y actualizar estado
        h.shares += count;
        h.rewardDebt = (h.shares * a.accDividendPerShare) / 1e18;
        a.soldShares += count;
        a.totalVolume += cost;

        // 4. Guerra de control: Verificar si se convierte en el nuevo Patrón del Lote
        if (h.shares > a.patronShares) {
            address oldPatron = a.patron;
            a.patron = msg.sender;
            a.patronShares = h.shares;
            emit OwnershipFlipped(assetId, msg.sender, oldPatron, h.shares);
        }

        emit ShareBought(assetId, msg.sender, count, cost, getPrice(assetId));

        // Devolver exceso si envió más MON del necesario
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
    }

    /**
     * @notice Reclamar dividendos disponibles en un lote
     */
    function claimDividends(uint256 assetId) external {
        require(assetId < TOTAL_ASSETS, "Asset ID invalido");
        Asset storage a = assets[assetId];
        HolderInfo storage h = holders[assetId][msg.sender];

        uint256 accumulated = ((h.shares * a.accDividendPerShare) / 1e18) - h.rewardDebt;
        uint256 total = h.pendingDividends + accumulated;
        require(total > 0, "No hay dividendos pendientes");

        h.pendingDividends = 0;
        h.rewardDebt = (h.shares * a.accDividendPerShare) / 1e18;

        // Checks-Effects-Interactions: emitir evento antes de la transferencia externa
        emit DividendClaimed(assetId, msg.sender, total);
        payable(msg.sender).transfer(total);
    }

}
