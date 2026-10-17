// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TapToOwn} from "../src/TapToOwn.sol";

contract MaliciousAttacker {
    TapToOwn public target;
    uint256 public targetAssetId;
    bool public hasAttacked;
    bool public reentrancyBlocked;

    constructor(TapToOwn _target) {
        target = _target;
    }

    function attackBuy(uint256 assetId) external payable {
        targetAssetId = assetId;
        (,, uint256 totalCost) = target.getBuyCost(assetId, 10);
        target.buy{value: totalCost}(assetId, 10);
    }

    function attackSell(uint256 assetId) external {
        targetAssetId = assetId;
        target.sell(assetId, 5);
    }

    receive() external payable {
        if (!hasAttacked) {
            hasAttacked = true;
            // Attempt reentrancy during native token transfer
            (bool success, bytes memory data) = address(target).call(
                abi.encodeWithSelector(TapToOwn.claimDividends.selector, targetAssetId)
            );
            // Verify reentrancy was blocked by ReentrancyGuardLocked
            if (!success && bytes4(data) == TapToOwn.ReentrancyGuardLocked.selector) {
                reentrancyBlocked = true;
            }
        }
    }
}

contract TapToOwnTest is Test {
    TapToOwn public arena;

    address public alice = address(0xA11CE);
    address public bob   = address(0xB0B);
    address public carol = address(0xCA201);

    function setUp() public {
        arena = new TapToOwn();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ==========================================
    // 1. INITIALIZATION & SETUP TESTS
    // ==========================================

    function test_InitialAssetConfiguration() public view {
        TapToOwn.AssetView[4] memory assets = arena.getAllAssets();

        assertEq(assets[0].name, "Cafe Montana Dorada");
        assertEq(assets[0].maxSupply, 1000);
        assertEq(assets[0].circulatingSupply, 0);
        assertEq(assets[0].basePrice, 0.001 ether);
        assertEq(assets[0].slope, 0.00005 ether);
        assertEq(assets[0].leader, address(0));

        assertEq(assets[1].name, "Cafe Volcan Rojo");
        assertEq(assets[2].name, "Arte Urbano Medellin");
        assertEq(assets[3].name, "Local Genesis");
    }

    // ==========================================
    // 2. BONDING CURVE & BUYING MECHANICS
    // ==========================================

    function test_FirstPurchaseHasZeroFee() public view {
        // When circulatingSupply is 0, no previous holders exist to collect fees
        (uint256 rawCost, uint256 fee, uint256 totalCost) = arena.getBuyCost(0, 10);
        assertEq(fee, 0);
        assertEq(rawCost, totalCost);

        // Hand calculation for 10 units at basePrice = 0.001 ether, slope = 0.00005 ether:
        // rawCost = 10 * 0.001 + 0.00005 * 10 * 9 / 2 = 0.01 + 0.00005 * 45 = 0.01 + 0.00225 = 0.01225 ether
        assertEq(rawCost, 0.01225 ether);
    }

    function test_BuySingleAndMultipleUnits() public {
        (,, uint256 cost) = arena.getBuyCost(0, 5);

        vm.prank(alice);
        arena.buy{value: cost}(0, 5);

        assertEq(arena.userShares(0, alice), 5);
        TapToOwn.AssetView[4] memory assetViews = arena.getAllAssets();
        assertEq(assetViews[0].circulatingSupply, 5);
        assertEq(arena.totalBondingReserve(), cost);
    }

    function test_ExcessMsgValueRefunded() public {
        (,, uint256 cost) = arena.getBuyCost(0, 2);
        uint256 balanceBefore = alice.balance;

        // Alice sends 1 ether (far more than required)
        vm.prank(alice);
        arena.buy{value: 1 ether}(0, 2);
        uint256 balanceAfter = alice.balance;

        // Alice should only have spent the exact cost
        assertEq(balanceBefore - balanceAfter, cost);
    }

    function test_RevertWhenSupplyCapExceeded() public {
        vm.prank(alice);
        vm.expectRevert(TapToOwn.SupplyCapExceeded.selector);
        arena.buy{value: 100 ether}(0, 1001);
    }

    function test_RevertOnInsufficientPayment() public {
        (,, uint256 cost) = arena.getBuyCost(0, 5);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TapToOwn.InsufficientPayment.selector, cost - 1, cost));
        arena.buy{value: cost - 1}(0, 5);
    }

    // ==========================================
    // 3. DIVIDEND DISTRIBUTION & CLAIMING
    // ==========================================

    function test_DividendAccrualOnSubsequentPurchases() public {
        // Alice buys 10 units
        (,, uint256 costAlice) = arena.getBuyCost(0, 10);
        vm.prank(alice);
        arena.buy{value: costAlice}(0, 10);

        // Bob buys 10 units. Bob pays 5% fee on rawCost.
        (, uint256 feeBob, uint256 costBob) = arena.getBuyCost(0, 10);
        assertTrue(feeBob > 0);

        vm.prank(bob);
        arena.buy{value: costBob}(0, 10);

        // Alice is the sole holder of the initial 10 units, so she should receive 100% of feeBob
        uint256 alicePending = arena.getPendingDividends(0, alice);
        assertEq(alicePending, feeBob);

        // Bob just bought, so he has 0 pending dividends from his own buy
        uint256 bobPending = arena.getPendingDividends(0, bob);
        assertEq(bobPending, 0);

        // Alice claims her dividends
        uint256 aliceBalanceBefore = alice.balance;
        vm.prank(alice);
        arena.claimDividends(0);
        uint256 aliceBalanceAfter = alice.balance;

        assertEq(aliceBalanceAfter - aliceBalanceBefore, feeBob);
        assertEq(arena.getPendingDividends(0, alice), 0);
    }

    function test_ProportionalDividendDistribution() public {
        // Alice buys 20 units
        (,, uint256 costAlice) = arena.getBuyCost(1, 20);
        vm.prank(alice);
        arena.buy{value: costAlice}(1, 20);

        // Bob buys 10 units (total supply is now 30)
        (, uint256 feeBob, uint256 costBob) = arena.getBuyCost(1, 10);
        vm.prank(bob);
        arena.buy{value: costBob}(1, 10);

        // Carol buys 30 units. Fee is distributed among Alice (20/30 = 2/3) and Bob (10/30 = 1/3)
        (, uint256 feeCarol, uint256 costCarol) = arena.getBuyCost(1, 30);

        vm.prank(carol);
        arena.buy{value: costCarol}(1, 30);

        uint256 alicePending = arena.getPendingDividends(1, alice);
        uint256 bobPending = arena.getPendingDividends(1, bob);

        // Alice receives 100% of feeBob (since she was sole holder of first 20 units) + 2/3 of feeCarol
        assertApproxEqAbs(alicePending, feeBob + (feeCarol * 2) / 3, 2);
        assertApproxEqAbs(bobPending, (feeCarol * 1) / 3, 2);
    }

    function test_ClaimAllDividendsAcrossMultipleAssets() public {
        (,, uint256 cost0) = arena.getBuyCost(0, 10);
        vm.prank(alice);
        arena.buy{value: cost0}(0, 10);

        (,, uint256 cost2) = arena.getBuyCost(2, 10);
        vm.prank(alice);
        arena.buy{value: cost2}(2, 10);

        // Bob buys in asset 0 and asset 2, generating fees in both
        (,, uint256 bCost0) = arena.getBuyCost(0, 10);
        vm.prank(bob);
        arena.buy{value: bCost0}(0, 10);

        (,, uint256 bCost2) = arena.getBuyCost(2, 10);
        vm.prank(bob);
        arena.buy{value: bCost2}(2, 10);

        (, uint256 totalClaimable) = arena.getUserPortfolio(alice);
        assertTrue(totalClaimable > 0);

        uint256 alicePreBal = alice.balance;
        vm.prank(alice);
        arena.claimAllDividends();
        uint256 alicePostBal = alice.balance;

        assertEq(alicePostBal - alicePreBal, totalClaimable);
    }

    // ==========================================
    // 4. SELLING & DIAMOND HANDS EXIT FEES
    // ==========================================

    function test_SellUnitsAndReceiveRefund() public {
        (uint256 rawCost,, uint256 totalCost) = arena.getBuyCost(0, 10);
        vm.prank(alice);
        arena.buy{value: totalCost}(0, 10);

        // When Alice sells all 10 units (draining supply back to 0), exit fee is 0
        (uint256 rawRefund, uint256 exitFee, uint256 netRefund) = arena.getSellRefund(0, 10);
        assertEq(rawRefund, rawCost);
        assertEq(exitFee, 0);
        assertEq(netRefund, rawCost);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        arena.sell(0, 10);
        uint256 balAfter = alice.balance;

        assertEq(balAfter - balBefore, netRefund);
        assertEq(arena.userShares(0, alice), 0);
        assertEq(arena.totalBondingReserve(), 0);
    }

    function test_ExitFeeDistributesToDiamondHands() public {
        // Alice buys 10 units
        (,, uint256 cA) = arena.getBuyCost(0, 10);
        vm.prank(alice);
        arena.buy{value: cA}(0, 10);

        // Bob buys 10 units
        (,, uint256 cB) = arena.getBuyCost(0, 10);
        vm.prank(bob);
        arena.buy{value: cB}(0, 10);

        // Bob sells 5 units. Exit fee is 2.5% on raw refund
        (, uint256 exitFee,) = arena.getSellRefund(0, 5);
        assertTrue(exitFee > 0);

        uint256 aliceDivsBefore = arena.getPendingDividends(0, alice);
        vm.prank(bob);
        arena.sell(0, 5);

        // Alice receives the exit fee since she holds diamond hands!
        uint256 aliceDivsAfter = arena.getPendingDividends(0, alice);
        assertTrue(aliceDivsAfter > aliceDivsBefore);
    }

    // ==========================================
    // 5. MAJORITY SHAREHOLDER / LEADER TRACKING
    // ==========================================

    function test_LeaderboardTracking() public {
        // Alice buys 10 units -> Alice is leader
        (,, uint256 costA) = arena.getBuyCost(3, 10);
        vm.prank(alice);
        arena.buy{value: costA}(3, 10);

        TapToOwn.AssetView[4] memory v1 = arena.getAllAssets();
        assertEq(v1[3].leader, alice);
        assertEq(v1[3].leaderShares, 10);

        // Bob buys 25 units -> Bob usurps Alice and becomes leader
        (,, uint256 costB) = arena.getBuyCost(3, 25);
        vm.prank(bob);
        arena.buy{value: costB}(3, 25);

        TapToOwn.AssetView[4] memory v2 = arena.getAllAssets();
        assertEq(v2[3].leader, bob);
        assertEq(v2[3].leaderShares, 25);

        // Bob liquidates all his units -> Leader resets to address(0)
        vm.prank(bob);
        arena.sell(3, 25);

        TapToOwn.AssetView[4] memory v3 = arena.getAllAssets();
        assertEq(v3[3].leader, address(0));
        assertEq(v3[3].leaderShares, 0);
    }

    // ==========================================
    // 6. SECURITY: REENTRANCY ATTACK PREVENTION
    // ==========================================

    function test_ReentrancyProtectionOnClaim() public {
        MaliciousAttacker attacker = new MaliciousAttacker(arena);
        vm.deal(address(attacker), 10 ether);

        // Attacker buys 10 units
        attacker.attackBuy(0);

        // Another buyer buys to generate pending dividends for attacker
        (,, uint256 bCost) = arena.getBuyCost(0, 10);
        vm.prank(bob);
        arena.buy{value: bCost}(0, 10);

        // Attacker triggers sell which attempts reentrancy in receive()
        attacker.attackSell(0);

        // Verify that reentrancy was detected and blocked by the modifier
        assertTrue(attacker.reentrancyBlocked());
    }

    // ==========================================
    // 7. INVARIANT & FUZZ TESTING: SOLVENCY
    // ==========================================

    function testFuzz_BuyAndSellSolvency(uint16 buyAmt, uint16 sellAmt) public {
        // Restrict to valid ranges
        vm.assume(buyAmt >= 1 && buyAmt <= 500);
        vm.assume(sellAmt >= 1 && sellAmt <= buyAmt);

        vm.deal(alice, 1000 ether);

        (,, uint256 buyCost) = arena.getBuyCost(0, uint32(buyAmt));
        vm.prank(alice);
        arena.buy{value: buyCost}(0, uint32(buyAmt));

        // Contract balance must strictly cover the bonding reserve
        assertTrue(address(arena).balance >= arena.totalBondingReserve());

        vm.prank(alice);
        arena.sell(0, uint32(sellAmt));

        // Contract balance must remain >= bonding reserve after sell
        assertTrue(address(arena).balance >= arena.totalBondingReserve());
    }
}
