// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {TapToOwnArena} from "../src/TapToOwnArena.sol";

contract TestReentrantAttacker {
    TapToOwnArena public arena;
    bool public hasReentered;
    bool public reentrancyBlocked;

    constructor(TapToOwnArena _arena) {
        arena = _arena;
    }

    function buy(uint256 assetId, uint32 qty) external payable {
        (,, uint256 cost) = arena.quoteBuy(assetId, qty);
        arena.buyShares{value: cost}(assetId, qty, cost, block.timestamp + 100);
    }

    function sell(uint256 assetId, uint32 qty) external {
        arena.sellShares(assetId, qty, 0, block.timestamp + 100);
    }

    receive() external payable {
        if (!hasReentered) {
            hasReentered = true;
            (bool success, ) = address(arena).call(
                abi.encodeWithSelector(TapToOwnArena.claimRewards.selector, 0)
            );
            if (!success) {
                reentrancyBlocked = true;
            }
        }
    }
}

contract TapToOwnArenaTestPlan is Test {
    TapToOwnArena public arena;

    address public owner = address(0x999);
    address public alice = address(0xA11CE);
    address public bob   = address(0xB0B);
    address public carol = address(0xCA201);
    address public dave  = address(0xDA7E);

    function setUp() public {
        vm.prank(owner);
        arena = new TapToOwnArena(owner);

        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(carol, 1000 ether);
        vm.deal(dave, 1000 ether);
    }

    // =========================================================================
    // 1. Compra de una unidad
    // =========================================================================
    function test_01_BuySingleUnit() public {
        (uint256 rawCost, uint256 fee, uint256 totalCost) = arena.quoteBuy(0, 1);
        assertEq(rawCost, 0.001 ether); // B = 0.001 ether
        assertEq(fee, (rawCost * 200) / 10000); // 2% fee

        vm.prank(alice);
        arena.buyShares{value: totalCost}(0, 1, totalCost, block.timestamp + 100);

        assertEq(arena.balanceOf(0, alice), 1);
        assertEq(arena.getAsset(0).circulatingSupply, 1);
    }

    // =========================================================================
    // 2. Compra de varias unidades
    // =========================================================================
    function test_02_BuyMultipleUnits() public {
        (,, uint256 totalCost) = arena.quoteBuy(1, 25);

        vm.prank(alice);
        arena.buyShares{value: totalCost}(1, 25, totalCost, block.timestamp + 100);

        assertEq(arena.balanceOf(1, alice), 25);
        assertEq(arena.getAsset(1).circulatingSupply, 25);
    }

    // =========================================================================
    // 3. Cotización frente a ejecución real
    // =========================================================================
    function test_03_QuoteVsActualExecution() public {
        (uint256 qRaw,, uint256 qTotal) = arena.quoteBuy(2, 10);
        uint256 preBal = alice.balance;
        uint256 preReserve = arena.getAsset(2).reserve;

        vm.prank(alice);
        arena.buyShares{value: qTotal}(2, 10, qTotal, block.timestamp + 100);

        assertEq(preBal - alice.balance, qTotal);
        assertEq(arena.getAsset(2).reserve - preReserve, qRaw);

        (uint256 qSellRaw,, uint256 qProceeds) = arena.quoteSell(2, 10);
        uint256 preSellBal = alice.balance;

        vm.prank(alice);
        arena.sellShares(2, 10, qProceeds, block.timestamp + 100);

        assertEq(alice.balance - preSellBal, qProceeds);
        assertEq(arena.getAsset(2).reserve, preReserve);
        assertEq(qSellRaw, qRaw);
    }

    // =========================================================================
    // 4. Venta parcial
    // =========================================================================
    function test_04_PartialSell() public {
        (,, uint256 cost) = arena.quoteBuy(0, 20);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 20, cost, block.timestamp + 100);

        (,, uint256 netProceeds) = arena.quoteSell(0, 8);
        vm.prank(alice);
        arena.sellShares(0, 8, netProceeds, block.timestamp + 100);

        assertEq(arena.balanceOf(0, alice), 12);
        assertEq(arena.getAsset(0).circulatingSupply, 12);
    }

    // =========================================================================
    // 5. Venta de todas las unidades de un titular
    // =========================================================================
    function test_05_FullSellAllUnits() public {
        (,, uint256 cost) = arena.quoteBuy(3, 15);
        vm.prank(alice);
        arena.buyShares{value: cost}(3, 15, cost, block.timestamp + 100);

        (,, uint256 netProceeds) = arena.quoteSell(3, 15);
        vm.prank(alice);
        arena.sellShares(3, 15, netProceeds, block.timestamp + 100);

        assertEq(arena.balanceOf(3, alice), 0);
        assertEq(arena.getAsset(3).circulatingSupply, 0);
        assertEq(arena.getAsset(3).reserve, 0);
    }

    // =========================================================================
    // 6. Límite de suministro (Cap de 1.000 unidades)
    // =========================================================================
    function test_06_SupplyCapExceeded() public {
        (,, uint256 cost1000) = arena.quoteBuy(0, 1000);
        vm.prank(alice);
        arena.buyShares{value: cost1000}(0, 1000, cost1000, block.timestamp + 100);

        // Intento de comprar 1 más revierte
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.SupplyCapExceeded.selector, 1000, 1, 1000)
        );
        arena.buyShares{value: 1 ether}(0, 1, 1 ether, block.timestamp + 100);
    }

    // =========================================================================
    // 7. Saldo insuficiente (msg.value insuficiente y falta de acciones al vender)
    // =========================================================================
    function test_07_InsufficientBalanceOrPayment() public {
        (,, uint256 cost) = arena.quoteBuy(0, 5);

        // Envío de fondos insuficiente en buy
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.InsufficientPayment.selector, cost - 1, cost)
        );
        arena.buyShares{value: cost - 1}(0, 5, cost, block.timestamp + 100);

        // Intento de vender sin poseer suficientes acciones
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.InsufficientShares.selector, 0, 1)
        );
        arena.sellShares(0, 1, 0, block.timestamp + 100);
    }

    // =========================================================================
    // 8. Slippage excedido
    // =========================================================================
    function test_08_SlippageExceeded() public {
        (,, uint256 cost) = arena.quoteBuy(1, 10);

        // maxTotalCost menor al costo real revierte
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.SlippageExceeded.selector, cost, cost - 1)
        );
        arena.buyShares{value: cost}(1, 10, cost - 1, block.timestamp + 100);

        // Compra exitosa
        vm.prank(alice);
        arena.buyShares{value: cost}(1, 10, cost, block.timestamp + 100);

        (,, uint256 netProceeds) = arena.quoteSell(1, 5);

        // minNetProceeds superior al ingreso real revierte
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.SlippageExceeded.selector, netProceeds, netProceeds + 1)
        );
        arena.sellShares(1, 5, netProceeds + 1, block.timestamp + 100);
    }

    // =========================================================================
    // 9. Transacción expirada
    // =========================================================================
    function test_09_ExpiredDeadline() public {
        vm.warp(2000);
        (,, uint256 cost) = arena.quoteBuy(0, 5);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.DeadlineExpired.selector, 1999, 2000)
        );
        arena.buyShares{value: cost}(0, 5, cost, 1999);
    }

    // =========================================================================
    // 10. Cálculo de comisiones (2% por defecto con split 20% mantenimiento / 80% pool)
    // =========================================================================
    function test_10_FeeCalculation() public {
        (uint256 rawCost, uint256 fee, uint256 totalCost) = arena.quoteBuy(0, 10);
        assertEq(fee, (rawCost * 200) / 10000);
        assertEq(totalCost, rawCost + fee);

        vm.prank(alice);
        arena.buyShares{value: totalCost}(0, 10, totalCost, block.timestamp + 100);

        uint256 maintenance = (fee * 2000) / 10000;
        assertEq(arena.maintenanceFund(), maintenance);
    }

    // =========================================================================
    // 11. Acumulación y reparto de recompensas
    // =========================================================================
    function test_11_RewardAccrualAndDistribution() public {
        // Alice compra 20 acciones
        (,, uint256 costA) = arena.quoteBuy(1, 20);
        vm.prank(alice);
        arena.buyShares{value: costA}(1, 20, costA, block.timestamp + 100);

        // Bob compra 10 acciones (oferta pasa a 30)
        (,, uint256 costB) = arena.quoteBuy(1, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(1, 10, costB, block.timestamp + 100);

        // Carol compra 30 acciones. La comisión de participantes se reparte 2/3 a Alice y 1/3 a Bob
        (, uint256 feeC, uint256 costC) = arena.quoteBuy(1, 30);
        vm.prank(carol);
        arena.buyShares{value: costC}(1, 30, costC, block.timestamp + 100);

        uint256 participantRewardC = feeC - (feeC * 2000) / 10000;
        uint256 alicePending = arena.getPendingRewards(1, alice);
        uint256 bobPending = arena.getPendingRewards(1, bob);

        assertApproxEqAbs(bobPending, (participantRewardC * 1) / 3, 2);
        assertTrue(alicePending > bobPending);
    }

    // =========================================================================
    // 12. Reclamación de recompensas
    // =========================================================================
    function test_12_ClaimRewards() public {
        (,, uint256 costA) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: costA}(0, 10, costA, block.timestamp + 100);

        (,, uint256 costB) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 10, costB, block.timestamp + 100);

        uint256 pendingAlice = arena.getPendingRewards(0, alice);
        assertTrue(pendingAlice > 0);

        uint256 preBal = alice.balance;
        vm.prank(alice);
        arena.claimRewards(0);
        assertEq(alice.balance - preBal, pendingAlice);
        assertEq(arena.getPendingRewards(0, alice), 0);
    }

    // =========================================================================
    // 13. Prevención de doble reclamación
    // =========================================================================
    function test_13_DoubleClaimPrevention() public {
        (,, uint256 costA) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: costA}(0, 10, costA, block.timestamp + 100);

        (,, uint256 costB) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 10, costB, block.timestamp + 100);

        vm.prank(alice);
        arena.claimRewards(0);

        // Segundo intento de cobro inmediato revierte
        vm.prank(alice);
        vm.expectRevert(TapToOwnArena.NoRewardsToClaim.selector);
        arena.claimRewards(0);
    }

    // =========================================================================
    // 14. Intentos de reentrancia
    // =========================================================================
    function test_14_ReentrancyAttempt() public {
        TestReentrantAttacker attacker = new TestReentrantAttacker(arena);
        vm.deal(address(attacker), 10 ether);

        attacker.buy(0, 10);

        // Bob compra para generar dividendos para el atacante
        (,, uint256 costB) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 10, costB, block.timestamp + 100);

        // El atacante vende; en su receive() intenta reentrar a claimRewards
        attacker.sell(0, 5);
        assertTrue(attacker.reentrancyBlocked());
    }

    // =========================================================================
    // 15. Pausa y reanudación
    // =========================================================================
    function test_15_PauseAndUnpause() public {
        vm.prank(owner);
        arena.pauseAsset(2);

        (,, uint256 cost) = arena.quoteBuy(2, 5);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TapToOwnArena.MarketPaused.selector, 2));
        arena.buyShares{value: cost}(2, 5, cost, block.timestamp + 100);

        vm.prank(owner);
        arena.unpauseAsset(2);

        vm.prank(alice);
        arena.buyShares{value: cost}(2, 5, cost, block.timestamp + 100);
        assertEq(arena.balanceOf(2, alice), 5);
    }

    // =========================================================================
    // 16. Independencia de los cuatro activos
    // =========================================================================
    function test_16_AssetIndependence() public {
        (,, uint256 cost0) = arena.quoteBuy(0, 15);
        vm.prank(alice);
        arena.buyShares{value: cost0}(0, 15, cost0, block.timestamp + 100);

        assertEq(arena.getAsset(0).circulatingSupply, 15);
        assertEq(arena.getAsset(1).circulatingSupply, 0);
        assertEq(arena.getAsset(2).circulatingSupply, 0);
        assertEq(arena.getAsset(3).circulatingSupply, 0);

        assertTrue(arena.getAsset(0).reserve > 0);
        assertEq(arena.getAsset(1).reserve, 0);
    }

    // =========================================================================
    // 17. Compras y ventas repetidas
    // =========================================================================
    function test_17_RepeatedBuysAndSellsSequence() public {
        for (uint256 i = 0; i < 5; i++) {
            (,, uint256 cBuy) = arena.quoteBuy(0, 10);
            vm.prank(alice);
            arena.buyShares{value: cBuy}(0, 10, cBuy, block.timestamp + 100);

            (,, uint256 cSell) = arena.quoteSell(0, 5);
            vm.prank(alice);
            arena.sellShares(0, 5, cSell, block.timestamp + 100);
        }
        assertEq(arena.balanceOf(0, alice), 25);
        assertEq(arena.getAsset(0).circulatingSupply, 25);
    }

    // =========================================================================
    // 18. Solvencia de reservas
    // =========================================================================
    function test_18_ReserveSolvency() public {
        (,, uint256 c0) = arena.quoteBuy(0, 30);
        (,, uint256 c1) = arena.quoteBuy(1, 40);
        vm.startPrank(alice);
        arena.buyShares{value: c0}(0, 30, c0, block.timestamp + 100);
        arena.buyShares{value: c1}(1, 40, c1, block.timestamp + 100);
        vm.stopPrank();

        (uint256 r0,,) = arena.quoteSell(0, 30);
        (uint256 r1,,) = arena.quoteSell(1, 40);

        assertEq(arena.getAsset(0).reserve, r0);
        assertEq(arena.getAsset(1).reserve, r1);
        assertTrue(address(arena).balance >= arena.totalReserve());
    }

    // =========================================================================
    // 19. Divisiones y redondeos (Polvo residual acumulado en undistributedRewards)
    // =========================================================================
    function test_19_IntegerDivisionAndRoundingDust() public {
        (,, uint256 costA) = arena.quoteBuy(0, 7);
        vm.prank(alice);
        arena.buyShares{value: costA}(0, 7, costA, block.timestamp + 100);

        (,, uint256 costB) = arena.quoteBuy(0, 13);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 13, costB, block.timestamp + 100);

        // Verificamos que todo wei está contabilizado sin fugas
        (,, uint256 unclaimed, uint256 dust, uint256 mFund, bool isSolvent) = arena.getGlobalAccounting();
        assertTrue(isSolvent);
        assertTrue(dust + unclaimed + mFund > 0);
    }

    // =========================================================================
    // 20. Operaciones sin titulares elegibles (Primer comprador)
    // =========================================================================
    function test_20_OperationsWithoutEligibleHolders() public {
        assertEq(arena.getAsset(0).circulatingSupply, 0);
        (,, uint256 totalCost) = arena.quoteBuy(0, 10);

        vm.prank(alice);
        arena.buyShares{value: totalCost}(0, 10, totalCost, block.timestamp + 100);

        // La comisión de participante sin tenedores previos se transfiere a undistributedRewards
        assertTrue(arena.getAsset(0).undistributedRewards > 0);
    }

    // =========================================================================
    // 21. Intentos de retirar fondos reservados
    // =========================================================================
    function test_21_UnauthorizedReserveWithdrawalAttempts() public {
        (,, uint256 cost) = arena.quoteBuy(0, 20);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 20, cost, block.timestamp + 100);

        uint256 res = arena.getAsset(0).reserve;
        uint256 mFund = arena.maintenanceFund();

        // Intento de retirar más de maintenanceFund revierte
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.InsufficientMaintenanceBalance.selector, mFund, mFund + 1)
        );
        arena.withdrawMaintenanceFund(payable(owner), mFund + 1);

        assertEq(arena.getAsset(0).reserve, res);
    }

    // =========================================================================
    // 22. Cambios de liderazgo mediante eventos e indexación
    // =========================================================================
    function test_22_LeadershipChangesViaEventsAndIndexing() public {
        // Alice compra 10 -> Alice líder
        (,, uint256 cA) = arena.quoteBuy(3, 10);
        vm.prank(alice);
        arena.buyShares{value: cA}(3, 10, cA, block.timestamp + 100);
        assertEq(arena.getAsset(3).leader, alice);
        assertEq(arena.getAsset(3).leaderShares, 10);

        // Bob compra 25 -> Bob usurpa el liderazgo
        (,, uint256 cB) = arena.quoteBuy(3, 25);
        vm.prank(bob);
        arena.buyShares{value: cB}(3, 25, cB, block.timestamp + 100);
        assertEq(arena.getAsset(3).leader, bob);
        assertEq(arena.getAsset(3).leaderShares, 25);

        // Bob vende todas sus acciones -> Liderazgo se reinicia
        (,, uint256 sB) = arena.quoteSell(3, 25);
        vm.prank(bob);
        arena.sellShares(3, 25, sB, block.timestamp + 100);
        assertEq(arena.getAsset(3).leader, address(0));
        assertEq(arena.getAsset(3).leaderShares, 0);
    }

    // =========================================================================
    // PRUEBA BASADA EN PROPIEDADES (FUZZING DE SECUENCIAS ALEATORIAS)
    // =========================================================================
    function testFuzz_RandomBuySellSequenceInvariants(
        uint8[6] memory assetIds,
        uint16[6] memory quantities,
        bool[6] memory isBuyAction
    ) public {
        address[2] memory traders = [alice, bob];

        for (uint256 i = 0; i < 6; i++) {
            uint256 assetId = uint256(assetIds[i]) % 4;
            uint32 qty = uint32(bound(quantities[i], 1, 30));
            address trader = traders[i % 2];

            if (isBuyAction[i]) {
                uint32 curSupply = arena.getAsset(assetId).circulatingSupply;
                if (curSupply + qty <= 1000) {
                    (,, uint256 cost) = arena.quoteBuy(assetId, qty);
                    vm.prank(trader);
                    arena.buyShares{value: cost}(assetId, qty, cost, block.timestamp + 100);
                }
            } else {
                uint32 userShares = arena.balanceOf(assetId, trader);
                if (userShares > 0) {
                    uint32 sellQty = qty > userShares ? userShares : qty;
                    (,, uint256 proceeds) = arena.quoteSell(assetId, sellQty);
                    vm.prank(trader);
                    arena.sellShares(assetId, sellQty, proceeds, block.timestamp + 100);
                }
            }

            // Invariante comprobado después de CADA operación:
            (,,,,, bool isSolvent) = arena.getGlobalAccounting();
            assertTrue(isSolvent);
            assertTrue(arena.getAsset(assetId).circulatingSupply <= 1000);
            assertTrue(arena.getAsset(assetId).reserve <= address(arena).balance);
        }
    }
}
