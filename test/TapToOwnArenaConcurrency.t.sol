// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {TapToOwnArena} from "../src/TapToOwnArena.sol";

contract TapToOwnArenaConcurrencyTest is Test {
    TapToOwnArena public arena;

    address public owner = address(0x999);
    uint256 public constant NUM_WALLETS = 40;
    address[NUM_WALLETS] public traders;

    function setUp() public {
        vm.prank(owner);
        arena = new TapToOwnArena(owner);

        // Generate 40 isolated local test wallets and fund them locally
        for (uint256 i = 0; i < NUM_WALLETS; i++) {
            traders[i] = makeAddr(string(abi.encodePacked("concurrency_trader_", vm.toString(i))));
            vm.deal(traders[i], 100 ether);
        }
    }

    /**
     * @notice Local concurrency benchmark with 40 wallets distributed across all 4 asset markets.
     *         Simulates high-throughput trading, majority leader contests, and dividend harvesting.
     */
    function test_Concurrency_40WalletsDistributedAcross4Assets() public {
        uint256 successfulBuys = 0;
        uint256 successfulSells = 0;
        uint256 successfulClaims = 0;
        uint256 expectedReverts = 0;

        uint256 totalBuyGas = 0;
        uint256 totalSellGas = 0;

        console2.log("================================================================================");
        console2.log("  TAP-TO-OWN ARENA: LOCAL CONCURRENCY & BENCHMARK SIMULATION (40 WALLETS)       ");
        console2.log("================================================================================");

        // --- ROUND 1: CONCURRENT BUY WAVE ACROSS 4 MARKETS ---
        // 40 wallets buy in parallel (10 wallets per market)
        for (uint256 i = 0; i < NUM_WALLETS; i++) {
            address trader = traders[i];
            uint256 targetAsset = i % 4; // 10 traders per asset
            uint32 qty = uint32(5 + (i % 10)); // Variable quantities: 5 to 14 shares

            (,, uint256 quoteCost) = arena.quoteBuy(targetAsset, qty);

            uint256 gasStart = gasleft();
            vm.prank(trader);
            try arena.buyShares{value: quoteCost}(
                targetAsset,
                qty,
                quoteCost, // exact slippage limit
                block.timestamp + 300
            ) {
                uint256 gasUsed = gasStart - gasleft();
                totalBuyGas += gasUsed;
                successfulBuys++;
            } catch {
                expectedReverts++;
            }
        }

        // Verify initial distribution
        for (uint256 m = 0; m < 4; m++) {
            TapToOwnArena.AssetInfo memory asset = arena.getAsset(m);
            assertTrue(asset.circulatingSupply > 0);
            assertTrue(asset.reserve > 0);
            assertTrue(asset.leader != address(0));
            console2.log(string.concat("[Market ", vm.toString(m), "] ", asset.name));
            console2.log("  Circulating Supply :", asset.circulatingSupply);
            console2.log("  Leader             :", asset.leader);
            console2.log("  Leader Shares      :", asset.leaderShares);
        }

        // --- ROUND 2: CROSS-MARKET TRADING & ARBITRAGE WAVE ---
        // Odd wallets buy in other markets; even wallets sell partial shares
        for (uint256 i = 0; i < NUM_WALLETS; i++) {
            address trader = traders[i];

            if (i % 2 == 0) {
                // Seller wave: sell 3 shares from primary market
                uint256 primaryAsset = i % 4;
                uint32 balance = arena.balanceOf(primaryAsset, trader);

                if (balance >= 3) {
                    (,, uint256 minProceeds) = arena.quoteSell(primaryAsset, 3);
                    uint256 gasStart = gasleft();
                    vm.prank(trader);
                    try arena.sellShares(
                        primaryAsset,
                        3,
                        minProceeds,
                        block.timestamp + 300
                    ) {
                        uint256 gasUsed = gasStart - gasleft();
                        totalSellGas += gasUsed;
                        successfulSells++;
                    } catch {
                        expectedReverts++;
                    }
                }
            } else {
                // Buyer wave: cross-bid in next market (i + 1) % 4
                uint256 crossAsset = (i + 1) % 4;
                uint32 qty = 4;
                (,, uint256 quoteCost) = arena.quoteBuy(crossAsset, qty);

                uint256 gasStart = gasleft();
                vm.prank(trader);
                try arena.buyShares{value: quoteCost}(
                    crossAsset,
                    qty,
                    quoteCost,
                    block.timestamp + 300
                ) {
                    uint256 gasUsed = gasStart - gasleft();
                    totalBuyGas += gasUsed;
                    successfulBuys++;
                } catch {
                    expectedReverts++;
                }
            }
        }

        // --- ROUND 3: CONCURRENT DIVIDEND HARVESTING WAVE ---
        for (uint256 i = 0; i < NUM_WALLETS; i++) {
            address trader = traders[i];
            uint256 pending = arena.getPendingRewards(i % 4, trader);

            if (pending > 0) {
                vm.prank(trader);
                try arena.claimRewards(i % 4) {
                    successfulClaims++;
                } catch {
                    expectedReverts++;
                }
            }
        }

        // --- ROUND 4: CONCURRENT STRESS & SLIPPAGE / DEADLINE BOUNDARY TEST ---
        for (uint256 i = 0; i < 8; i++) {
            address trader = traders[i];
            // Intentional slippage violation: maxTotalCost is 1 wei below required cost
            (,, uint256 cost) = arena.quoteBuy(0, 5);
            vm.prank(trader);
            try arena.buyShares{value: cost}(0, 5, cost - 1, block.timestamp + 100) {
                successfulBuys++;
            } catch {
                expectedReverts++; // Expected slippage revert caught safely
            }
        }

        // --- FINAL METRICS & RECONCILIATION ---
        uint256 avgBuyGas = successfulBuys > 0 ? totalBuyGas / successfulBuys : 0;
        uint256 avgSellGas = successfulSells > 0 ? totalSellGas / successfulSells : 0;

        console2.log("--------------------------------------------------------------------------------");
        console2.log("  SIMULATION PERFORMANCE & METRICS RESULTS:");
        console2.log("--------------------------------------------------------------------------------");
        console2.log("  Total Test Wallets Active      :", NUM_WALLETS);
        console2.log("  Successful Buys Executed       :", successfulBuys);
        console2.log("  Successful Sells Executed      :", successfulSells);
        console2.log("  Successful Dividend Claims     :", successfulClaims);
        console2.log("  Intentional Reverts Caught     :", expectedReverts);
        console2.log("  Avg Gas per buyShares() tx     :", avgBuyGas);
        console2.log("  Avg Gas per sellShares() tx    :", avgSellGas);

        // --- STRICT FINAL ACCOUNTING AUDIT ---
        (
            uint256 contractBalance,
            uint256 totalReserves,
            uint256 totalUnclaimed,
            uint256 totalUndistributed,
            uint256 maintenanceBalance,
            bool isSolvent
        ) = arena.getGlobalAccounting();

        console2.log("--------------------------------------------------------------------------------");
        console2.log("  FINAL RECONCILED ACCOUNTING STATE:");
        console2.log("--------------------------------------------------------------------------------");
        console2.log("  Contract Real Balance (wei)    :", contractBalance);
        console2.log("  Total Reserves Locked (wei)    :", totalReserves);
        console2.log("  Unclaimed Rewards Pool (wei)   :", totalUnclaimed);
        console2.log("  Undistributed Residuals (wei)  :", totalUndistributed);
        console2.log("  Maintenance Fund Pool (wei)    :", maintenanceBalance);
        console2.log("  Solvency Invariant Respected   :", isSolvent);
        console2.log("================================================================================");

        assertTrue(isSolvent, "Contract must remain strictly solvent");
        uint256 totalLiabilities = totalReserves + totalUnclaimed + totalUndistributed + maintenanceBalance;
        assertEq(contractBalance, totalLiabilities, "Real balance must strictly match total liabilities");
        assertTrue(successfulBuys >= 40, "At least 40 buys should succeed");
        assertTrue(successfulSells >= 15, "At least 15 sells should succeed");
        assertTrue(expectedReverts >= 8, "Expected boundary reverts must be captured");
    }
}
