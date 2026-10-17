// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TapToOwnArena} from "../src/TapToOwnArena.sol";

contract TapToOwnArenaTest is Test {
    TapToOwnArena public arena;

    address public owner = address(0x999);
    address public alice = address(0xA11CE);
    address public bob   = address(0xB0B);
    address public treasury = address(0x777);

    function setUp() public {
        vm.prank(owner);
        arena = new TapToOwnArena(owner);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ==========================================
    // 1. GETTERS & INITIAL STATE
    // ==========================================

    function test_InitialMarketsAndGetters() public view {
        TapToOwnArena.AssetInfo memory asset0 = arena.getAsset(0);
        assertEq(asset0.name, "Cafe Montana Dorada");
        assertEq(asset0.maxSupply, 1000);
        assertEq(asset0.circulatingSupply, 0);
        assertEq(asset0.paused, false);
        assertEq(asset0.reserve, 0);
        assertEq(asset0.buyFeeBps, 200);           // 2.0%
        assertEq(asset0.sellFeeBps, 200);          // 2.0%
        assertEq(asset0.maintenanceSplitBps, 2000); // 20.0%

        TapToOwnArena.AssetInfo memory asset1 = arena.getAsset(1);
        assertEq(asset1.name, "Cafe Volcan Rojo");

        TapToOwnArena.AssetInfo memory asset2 = arena.getAsset(2);
        assertEq(asset2.name, "Arte Urbano Medellin");

        TapToOwnArena.AssetInfo memory asset3 = arena.getAsset(3);
        assertEq(asset3.name, "Local Genesis");

        assertEq(arena.getCurrentPrice(0), 0.001 ether);
        assertEq(arena.balanceOf(0, alice), 0);
        assertEq(arena.getPendingRewards(0, alice), 0);
        assertEq(arena.maintenanceFund(), 0);
    }

    // ==========================================
    // 2. BUY SHARES WITH DEADLINE & SLIPPAGE
    // ==========================================

    function test_BuySharesSuccess() public {
        (,, uint256 totalCost) = arena.quoteBuy(0, 5);

        vm.prank(alice);
        arena.buyShares{value: totalCost}(
            0,
            5,
            totalCost, // maxTotalCost equals exact quote
            block.timestamp + 300 // deadline
        );

        assertEq(arena.balanceOf(0, alice), 5);
        TapToOwnArena.AssetInfo memory asset0 = arena.getAsset(0);
        assertEq(asset0.circulatingSupply, 5);
        assertEq(asset0.leader, alice);
        assertEq(asset0.leaderShares, 5);
    }

    function test_BuySharesRevertsOnSlippage() public {
        (,, uint256 totalCost) = arena.quoteBuy(0, 5);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.SlippageExceeded.selector, totalCost, totalCost - 1)
        );
        arena.buyShares{value: totalCost}(0, 5, totalCost - 1, block.timestamp + 100);
    }

    function test_BuySharesRevertsOnExpiredDeadline() public {
        (,, uint256 totalCost) = arena.quoteBuy(0, 5);

        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.DeadlineExpired.selector, 999, 1000)
        );
        arena.buyShares{value: totalCost}(0, 5, totalCost, 999);
    }

    // ==========================================
    // 3. SELL SHARES WITH DEADLINE & SLIPPAGE
    // ==========================================

    function test_SellSharesSuccess() public {
        (,, uint256 cost) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 10, cost, block.timestamp + 100);

        (,, uint256 netProceeds) = arena.quoteSell(0, 10);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        arena.sellShares(0, 10, netProceeds, block.timestamp + 100);
        uint256 balAfter = alice.balance;

        assertEq(balAfter - balBefore, netProceeds);
        assertEq(arena.balanceOf(0, alice), 0);
        assertEq(arena.getAsset(0).circulatingSupply, 0);
    }

    function test_SellSharesRevertsOnSlippage() public {
        (,, uint256 cost) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 10, cost, block.timestamp + 100);

        (,, uint256 netProceeds) = arena.quoteSell(0, 10);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.SlippageExceeded.selector, netProceeds, netProceeds + 1)
        );
        arena.sellShares(0, 10, netProceeds + 1, block.timestamp + 100);
    }

    // ==========================================
    // 4. ACCOUNTING: FEES, RESERVES & MAINTENANCE
    // ==========================================

    function test_FeeSegregationAndMaintenanceCut() public {
        // Alice buys 10 shares in asset 0 (first purchase, supply was 0)
        (uint256 rawA, uint256 feeA, uint256 costA) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: costA}(0, 10, costA, block.timestamp + 100);

        // 20% of feeA goes to maintenanceFund
        uint256 maintenanceA = (feeA * 2000) / 10000;
        uint256 rewardA = feeA - maintenanceA;
        assertEq(arena.maintenanceFund(), maintenanceA);
        // Since supply was 0 before Alice's buy, rewardA is safely preserved in undistributedRewards
        assertEq(arena.getAsset(0).undistributedRewards, rewardA);
        assertEq(arena.getAsset(0).reserve, rawA);

        // Bob buys 10 shares
        (, uint256 feeB, uint256 costB) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: costB}(0, 10, costB, block.timestamp + 100);

        uint256 maintenanceB = (feeB * 2000) / 10000;
        uint256 participantRewardB = feeB - maintenanceB;

        assertEq(arena.maintenanceFund(), maintenanceA + maintenanceB);

        // Alice owns 100% of the 10 existing shares, so she earns participantRewardB (minus integer dust)
        uint256 alicePending = arena.getPendingRewards(0, alice);
        assertApproxEqAbs(alicePending, participantRewardB, 2);

        // Bob's newly acquired shares do NOT receive any reward generated before or during this buy
        assertEq(arena.getPendingRewards(0, bob), 0);

        // Alice claims rewards
        uint256 alicePreBal = alice.balance;
        vm.prank(alice);
        arena.claimRewards(0);
        uint256 alicePostBal = alice.balance;
        assertEq(alicePostBal - alicePreBal, alicePending);
        assertEq(arena.getPendingRewards(0, alice), 0);
    }

    function test_MaintenanceFundWithdrawalByOwner() public {
        (,, uint256 cost) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 10, cost, block.timestamp + 100);

        uint256 mFund = arena.maintenanceFund();
        assertTrue(mFund > 0);

        // Non-owner cannot withdraw
        vm.prank(alice);
        vm.expectRevert();
        arena.withdrawMaintenanceFund(payable(alice), mFund);

        // Owner withdraws to treasury
        uint256 treasuryPre = treasury.balance;
        vm.prank(owner);
        arena.withdrawMaintenanceFund(payable(treasury), mFund);
        uint256 treasuryPost = treasury.balance;

        assertEq(treasuryPost - treasuryPre, mFund);
        assertEq(arena.maintenanceFund(), 0);
    }

    function test_ConfigureFeeParameters() public {
        // Owner updates fee parameters for asset 2
        vm.prank(owner);
        arena.setFeeParameters(
            2,
            300, // 3% buy fee
            150, // 1.5% sell fee
            1000 // 10% to maintenance
        );

        TapToOwnArena.AssetInfo memory a2 = arena.getAsset(2);
        assertEq(a2.buyFeeBps, 300);
        assertEq(a2.sellFeeBps, 150);
        assertEq(a2.maintenanceSplitBps, 1000);

        // Attempting to set fee > 10% reverts
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(TapToOwnArena.FeeTooHigh.selector, 1001, 1000)
        );
        arena.setFeeParameters(2, 1001, 150, 1000);
    }

    // ==========================================
    // 5. CIRCUIT BREAKER: PAUSE & UNPAUSE
    // ==========================================

    function test_PauseAndUnpauseAsset() public {
        // Non-owner cannot pause
        vm.prank(alice);
        vm.expectRevert();
        arena.pauseAsset(0);

        // Owner pauses asset 0
        vm.prank(owner);
        arena.pauseAsset(0);
        assertTrue(arena.getAsset(0).paused);

        // Attempting to buy on paused asset reverts
        (,, uint256 cost) = arena.quoteBuy(0, 5);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TapToOwnArena.MarketPaused.selector, 0));
        arena.buyShares{value: cost}(0, 5, cost, block.timestamp + 100);

        // Owner unpauses asset 0
        vm.prank(owner);
        arena.unpauseAsset(0);
        assertFalse(arena.getAsset(0).paused);

        // Buy succeeds after unpause
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 5, cost, block.timestamp + 100);
        assertEq(arena.balanceOf(0, alice), 5);
    }

    // ==========================================
    // 6. MATHEMATICAL FORMULAS & VERIFIABLE SOLVENCY
    // ==========================================

    function test_MathematicalFormulaSymmetry() public view {
        uint64 B = 0.001 ether;
        uint64 K = 0.00005 ether;
        uint256 S = 20;
        uint32 q = 10;

        uint256 buyCost = arena.calculateBuyCost(S, q, B, K);
        assertEq(buyCost, 0.02225 ether);

        uint256 sellRefund = arena.calculateSellGrossRefund(S + q, q, B, K);
        assertEq(sellRefund, buyCost);
    }

    function test_PriceRisesOnBuyAndFallsOnSell() public {
        uint256 initialPrice = arena.getCurrentPrice(0);
        assertEq(initialPrice, 0.001 ether);

        (,, uint256 cost) = arena.quoteBuy(0, 10);
        vm.prank(alice);
        arena.buyShares{value: cost}(0, 10, cost, block.timestamp + 100);

        uint256 priceAfterBuy = arena.getCurrentPrice(0);
        assertEq(priceAfterBuy, 0.0015 ether);
        assertTrue(priceAfterBuy > initialPrice);

        (,, uint256 netProceeds) = arena.quoteSell(0, 5);
        vm.prank(alice);
        arena.sellShares(0, 5, netProceeds, block.timestamp + 100);

        uint256 priceAfterSell = arena.getCurrentPrice(0);
        assertEq(priceAfterSell, 0.00125 ether);
        assertTrue(priceAfterSell < priceAfterBuy);
    }

    function test_GlobalAccountingAndSolvencyReport() public {
        // Alice buys in market 0 and market 2
        (,, uint256 cost0) = arena.quoteBuy(0, 20);
        (,, uint256 cost2) = arena.quoteBuy(2, 30);

        vm.startPrank(alice);
        arena.buyShares{value: cost0}(0, 20, cost0, block.timestamp + 100);
        arena.buyShares{value: cost2}(2, 30, cost2, block.timestamp + 100);
        vm.stopPrank();

        // Bob buys in market 0, generating participant rewards & maintenance fees
        (,, uint256 cost0Bob) = arena.quoteBuy(0, 10);
        vm.prank(bob);
        arena.buyShares{value: cost0Bob}(0, 10, cost0Bob, block.timestamp + 100);

        (
            uint256 contractBal,
            uint256 totalReserves,
            uint256 totalUnclaimed,
            uint256 totalUndistributed,
            uint256 maintenanceBal,
            bool isSolvent
        ) = arena.getGlobalAccounting();

        assertTrue(isSolvent);
        // Every wei in the contract is exactly accounted for:
        uint256 totalAccounted = totalReserves + totalUnclaimed + totalUndistributed + maintenanceBal;
        assertEq(contractBal, totalAccounted);

        // Verify per-asset accounting report
        TapToOwnArena.AccountingReport memory report0 = arena.getAccountingReport(0);
        assertTrue(report0.reserve > 0);
        assertTrue(report0.participantRewardPool > 0);
        assertTrue(report0.pendingUnclaimedRewards > 0);
    }
}
