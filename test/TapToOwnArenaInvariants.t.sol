// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TapToOwnArena} from "../src/TapToOwnArena.sol";

contract TapToOwnArenaInvariantsTest is Test {
    TapToOwnArena public arena;

    address public owner = address(0x999);
    address public alice = address(0xA11CE);
    address public bob   = address(0xB0B);
    address public carol = address(0xCA201);
    address public treasury = address(0x777);

    function setUp() public {
        vm.prank(owner);
        arena = new TapToOwnArena(owner);

        vm.deal(alice, 500 ether);
        vm.deal(bob, 500 ether);
        vm.deal(carol, 500 ether);
    }

    // =========================================================================
    // INVARIANT 1: Ningún activo supera las 1.000 unidades circulantes
    // =========================================================================

    function testInvariant_NoAssetExceeds1000Units() public {
        (,, uint256 cost1000) = arena.quoteBuy(0, 1000);

        vm.prank(alice);
        arena.buyShares{value: cost1000}(0, 1000, cost1000, block.timestamp + 100);

        assertEq(arena.getAsset(0).circulatingSupply, 1000);

        // Attempting to buy even 1 more share reverts with SupplyCapExceeded
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.SupplyCapExceeded.selector, 1000, 1, 1000)
        );
        arena.buyShares{value: 10 ether}(0, 1, 10 ether, block.timestamp + 100);
    }

    // =========================================================================
    // INVARIANT 2: Nadie vende más unidades de las que posee
    // =========================================================================

    function testInvariant_CannotSellMoreUnitsThanOwned() public {
        (,, uint256 cost) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 10, cost, block.timestamp + 100);

        // Alice owns 10, attempts to sell 11
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.InsufficientShares.selector, 10, 11)
        );
        arena.sellShares(0, 11, 0, block.timestamp + 100);

        // Bob owns 0, attempts to sell 1
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.InsufficientShares.selector, 0, 1)
        );
        arena.sellShares(0, 1, 0, block.timestamp + 100);
    }

    // =========================================================================
    // INVARIANT 3: Saldos y reservas nunca son negativos ni contablemente inconsistentes
    // =========================================================================

    function testInvariant_BalancesAndReservesConsistencyFuzz(uint16 buyQty, uint16 sellQty) public {
        vm.assume(buyQty >= 1 && buyQty <= 500);
        vm.assume(sellQty >= 1 && sellQty <= buyQty);

        (,, uint256 cost) = arena.quoteBuy(1, uint32(buyQty));
        vm.prank(alice);
        arena.buyShares{value: cost}(1, uint32(buyQty), cost, block.timestamp + 100);

        uint256 reserveAfterBuy = arena.getAsset(1).reserve;
        assertTrue(reserveAfterBuy > 0);

        (uint256 rawRefund,, uint256 netProceeds) = arena.quoteSell(1, uint32(sellQty));
        vm.prank(alice);
        arena.sellShares(1, uint32(sellQty), netProceeds, block.timestamp + 100);

        uint256 reserveAfterSell = arena.getAsset(1).reserve;
        assertEq(reserveAfterSell, reserveAfterBuy - rawRefund);
        assertEq(arena.balanceOf(1, alice), uint32(buyQty - sellQty));
    }

    // =========================================================================
    // INVARIANT 4: Ninguna operación retira fondos reservados para otros participantes
    // =========================================================================

    function testInvariant_NoOperationWithdrawsOtherParticipantsFunds() public {
        // Alice buys in market 0
        (,, uint256 costA) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: costA}(0, 10, costA, block.timestamp + 100);

        // Bob buys in market 0, generating pending rewards for Alice
        (,, uint256 costB) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 10, costB, block.timestamp + 100);

        uint256 aliceEarned = arena.getPendingRewards(0, alice);
        assertTrue(aliceEarned > 0);

        // Bob cannot claim Alice's rewards; Bob's claim reverts with NoRewardsToClaim
        vm.prank(bob);
        vm.expectRevert(TapToOwnArena.NoRewardsToClaim.selector);
        arena.claimRewards(0);

        // Alice claims her exact earned rewards
        uint256 alicePreBal = alice.balance;
        vm.prank(alice);
        arena.claimRewards(0);
        assertEq(alice.balance - alicePreBal, aliceEarned);
    }

    // =========================================================================
    // INVARIANT 5: Las recompensas no pueden reclamarse dos veces
    // =========================================================================

    function testInvariant_RewardsCannotBeClaimedTwice() public {
        (,, uint256 costA) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: costA}(0, 10, costA, block.timestamp + 100);

        (,, uint256 costB) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 10, costB, block.timestamp + 100);

        // First claim succeeds
        vm.prank(alice);
        arena.claimRewards(0);

        // Immediate second claim MUST revert
        vm.prank(alice);
        vm.expectRevert(TapToOwnArena.NoRewardsToClaim.selector);
        arena.claimRewards(0);
    }

    // =========================================================================
    // INVARIANT 6: Administrador no puede retirar reservas de recompra ni recompensas ajenas
    // =========================================================================

    function testInvariant_AdminCannotWithdrawRedemptionReserves() public {
        (,, uint256 cost) = arena.quoteBuy(0, 50);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 50, cost, block.timestamp + 100);

        uint256 reserve = arena.getAsset(0).reserve;
        uint256 mFund = arena.maintenanceFund();
        assertTrue(reserve > 0);
        assertTrue(mFund > 0);

        // Owner attempts to withdraw more than maintenanceFund (e.g. attempting to touch reserve)
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.InsufficientMaintenanceBalance.selector, mFund, mFund + 1)
        );
        arena.withdrawMaintenanceFund(payable(treasury), mFund + 1);

        // Valid withdrawal only consumes maintenanceFund, leaving reserve 100% intact
        vm.prank(owner);
        arena.withdrawMaintenanceFund(payable(treasury), mFund);
        assertEq(arena.getAsset(0).reserve, reserve);
    }

    // =========================================================================
    // INVARIANT 7: Las cuatro reservas permanecen independientes
    // =========================================================================

    function testInvariant_FourReservesRemainIndependent() public {
        // Alice buys in market 0 only
        (,, uint256 cost0) = arena.quoteBuy(0, 20);
        vm.prank(alice);
        arena.buyShares{value: cost0}(0, 20, cost0, block.timestamp + 100);

        TapToOwnArena.AssetInfo memory a0 = arena.getAsset(0);
        TapToOwnArena.AssetInfo memory a1 = arena.getAsset(1);
        TapToOwnArena.AssetInfo memory a2 = arena.getAsset(2);
        TapToOwnArena.AssetInfo memory a3 = arena.getAsset(3);

        assertTrue(a0.reserve > 0);
        assertEq(a1.reserve, 0);
        assertEq(a2.reserve, 0);
        assertEq(a3.reserve, 0);

        // Selling in market 0 only debits market 0's reserve
        (,, uint256 netProceeds) = arena.quoteSell(0, 10);
        vm.prank(alice);
        arena.sellShares(0, 10, netProceeds, block.timestamp + 100);

        assertEq(arena.getAsset(1).reserve, 0);
        assertEq(arena.getAsset(2).reserve, 0);
        assertEq(arena.getAsset(3).reserve, 0);
    }

    // =========================================================================
    // INVARIANT 8: Compras nuevas no confiscan participaciones de otros jugadores
    // =========================================================================

    function testInvariant_NewPurchasesDoNotConfiscateOtherPlayersShares() public {
        (,, uint256 costA) = arena.quoteBuy(2, 30);
        vm.prank(alice);
        arena.buyShares{value: costA}(2, 30, costA, block.timestamp + 100);

        assertEq(arena.balanceOf(2, alice), 30);

        // Bob buys 50 shares
        (,, uint256 costB) = arena.quoteBuy(2, 50);
        vm.prank(bob);
        arena.buyShares{value: costB}(2, 50, costB, block.timestamp + 100);

        // Carol buys 20 shares
        (,, uint256 costC) = arena.quoteBuy(2, 20);
        vm.prank(carol);
        arena.buyShares{value: costC}(2, 20, costC, block.timestamp + 100);

        // Alice's and Bob's share balances remain completely untouched
        assertEq(arena.balanceOf(2, alice), 30);
        assertEq(arena.balanceOf(2, bob), 50);
        assertEq(arena.balanceOf(2, carol), 20);
        assertEq(arena.getAsset(2).circulatingSupply, 100);
    }

    // =========================================================================
    // INVARIANT 9: Comisiones y pagos respaldados por el balance real del contrato
    // =========================================================================

    function testInvariant_SolvencyBackedByRealContractBalance() public {
        (,, uint256 c0) = arena.quoteBuy(0, 15);
        (,, uint256 c1) = arena.quoteBuy(1, 25);
        (,, uint256 c2) = arena.quoteBuy(2, 35);
        (,, uint256 c3) = arena.quoteBuy(3, 45);

        vm.startPrank(alice);
        arena.buyShares{value: c0}(0, 15, c0, block.timestamp + 100);
        arena.buyShares{value: c1}(1, 25, c1, block.timestamp + 100);
        arena.buyShares{value: c2}(2, 35, c2, block.timestamp + 100);
        arena.buyShares{value: c3}(3, 45, c3, block.timestamp + 100);
        vm.stopPrank();

        (
            uint256 contractBal,
            uint256 totalReserves,
            uint256 totalUnclaimed,
            uint256 totalUndistributed,
            uint256 maintenanceBal,
            bool isSolvent
        ) = arena.getGlobalAccounting();

        assertTrue(isSolvent);
        assertEq(contractBal, totalReserves + totalUnclaimed + totalUndistributed + maintenanceBal);
    }

    // =========================================================================
    // INVARIANT 10: Funciones administrativas tienen permisos explícitos
    // =========================================================================

    function testInvariant_AdminFunctionsHaveExplicitPermissions() public {
        // Alice (non-owner) attempts pauseAsset -> reverts
        vm.prank(alice);
        vm.expectRevert();
        arena.pauseAsset(0);

        // Alice attempts unpauseAsset -> reverts
        vm.prank(alice);
        vm.expectRevert();
        arena.unpauseAsset(0);

        // Alice attempts setFeeParameters -> reverts
        vm.prank(alice);
        vm.expectRevert();
        arena.setFeeParameters(0, 100, 100, 1000);

        // Alice attempts withdrawMaintenanceFund -> reverts
        vm.prank(alice);
        vm.expectRevert();
        arena.withdrawMaintenanceFund(payable(alice), 1 ether);
    }

    // =========================================================================
    // MECÁNICA DE QUEMA Y RECIRCULACIÓN CONSISTENTE CON LA CURVA
    // =========================================================================

    function test_BurnedSharesRecirculateUnderCurveSymmetrically() public {
        // Step 1: Alice buys 100 shares. Supply becomes 100.
        (,, uint256 totalCostAlice) = arena.quoteBuy(0, 100);
        vm.prank(alice);
        arena.buyShares{value: totalCostAlice}(0, 100, totalCostAlice, block.timestamp + 100);

        assertEq(arena.getAsset(0).circulatingSupply, 100);
        uint256 priceAt100 = arena.getCurrentPrice(0);

        // Step 2: Alice sells 60 shares back to curve.
        // Those 60 shares are BURNED from circulating supply.
        (uint256 rawRefundAlice,, uint256 netProceedsAlice) = arena.quoteSell(0, 60);
        vm.prank(alice);
        arena.sellShares(0, 60, netProceedsAlice, block.timestamp + 100);

        // Circulating supply drops back to 40
        assertEq(arena.getAsset(0).circulatingSupply, 40);
        uint256 priceAt40 = arena.getCurrentPrice(0);
        assertTrue(priceAt40 < priceAt100);

        // Step 3: Bob buys 60 shares to fill supply back to 100.
        // Cost to buy 60 shares starting at supply 40 MUST EXACTLY equal rawRefundAlice!
        (uint256 rawCostBob,, uint256 totalCostBob) = arena.quoteBuy(0, 60);
        assertEq(rawCostBob, rawRefundAlice);

        vm.prank(bob);
        arena.buyShares{value: totalCostBob}(0, 60, totalCostBob, block.timestamp + 100);

        // Supply is back at 100, and price returns exactly to priceAt100
        assertEq(arena.getAsset(0).circulatingSupply, 100);
        assertEq(arena.getCurrentPrice(0), priceAt100);
    }

    // =========================================================================
    // SEGURIDAD: VERIFICACIÓN CONTRA REENTRANCIA
    // =========================================================================

    function testSecurity_ReentrancyAttackPreventedOnSell() public {
        ArenaMaliciousAttacker attacker = new ArenaMaliciousAttacker(arena);
        vm.deal(address(attacker), 10 ether);

        // Attacker buys 10 shares
        attacker.buy(0, 10);

        // Bob buys, generating pending rewards for attacker
        (,, uint256 costB) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 10, costB, block.timestamp + 100);

        // Attacker sells, attempting to reenter in receive()
        attacker.sell(0, 5);

        // Reentrancy was intercepted and blocked by OpenZeppelin ReentrancyGuard
        assertTrue(attacker.reentrancyBlocked());
    }

    function testSecurity_TransferRevertsWhenRecipientRejectsNativeToken() public {
        RejectingRecipient rejector = new RejectingRecipient(arena);
        vm.deal(address(rejector), 10 ether);

        rejector.buy(0, 10);

        // Rejector attempts to sell, but its receive() reverts, so contract safely reverts with NativeTransferFailed
        vm.expectRevert(TapToOwnArena.NativeTransferFailed.selector);
        rejector.sell(0, 5);
    }
}

contract ArenaMaliciousAttacker {
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

contract RejectingRecipient {
    TapToOwnArena public arena;

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
        // Intentionally reject incoming transfers to test NativeTransferFailed revert
        revert("I refuse MON");
    }
}
