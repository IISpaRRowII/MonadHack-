// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TapToOwnArena
 * @notice High-performance Web3 arena on Monad managing 4 independent gamified RWA markets.
 *         Features strict accounting separation:
 *           - Independent redemption reserves per market
 *           - Participant reward pools with O(1) fee-sharing
 *           - Optional maintenance / protocol treasury fund
 *           - Unclaimed & undistributed rounding dust tracking
 *         Illustrative 2.0% configurable fee structure with slippage and deadline protection.
 * @dev Disclaimer: Virtual demo shares; does not grant legal ownership of physical assets.
 */
contract TapToOwnArena is ReentrancyGuard, Ownable {
    // --- CONSTANTS ---
    uint256 public constant TOTAL_ASSETS = 4;
    uint32 public constant MAX_SUPPLY_PER_ASSET = 1000;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_FEE_BPS = 1000; // 10.0% max fee cap to prevent admin abuse
    uint256 private constant REWARD_PRECISION = 1e18;

    // Default fee parameters: 2.0% (200 BPS)
    uint16 public constant DEFAULT_BUY_FEE_BPS = 200;           // 2.0%
    uint16 public constant DEFAULT_SELL_FEE_BPS = 200;          // 2.0%
    uint16 public constant DEFAULT_MAINTENANCE_SPLIT_BPS = 2000; // 20.0% of fee to maintenance, 80% to holders

    // --- STRUCTS ---
    struct AssetMarket {
        string name;
        uint32 maxSupply;
        uint32 circulatingSupply;
        uint64 basePrice; // in wei
        uint64 slope;     // in wei per unit
        // --- ACCOUNTING SEGREGATION ---
        uint256 reserve;                 // Dedicated liquidity backing redemptions for THIS market
        uint256 totalDistributedRewards; // Cumulative rewards distributed to participants
        uint256 totalClaimedRewards;     // Cumulative rewards paid out to participants
        uint256 undistributedRewards;   // Residual dust and rollover from periods with no eligible holders
        uint256 accRewardPerShare;       // Scaled by REWARD_PRECISION for O(1) rewards
        // --- CONFIGURABLE FEE PARAMETERS ---
        uint16 buyFeeBps;                // Buy fee (default 200 BPS = 2.0%)
        uint16 sellFeeBps;               // Sell fee (default 200 BPS = 2.0%)
        uint16 maintenanceSplitBps;      // Fraction of fee allocated to maintenance fund (default 2000 BPS = 20%)
        bool paused;
        address leader;
        uint32 leaderShares;
    }

    struct AssetInfo {
        uint256 id;
        string name;
        uint32 maxSupply;
        uint32 circulatingSupply;
        uint64 basePrice;
        uint64 slope;
        uint256 reserve;
        uint256 accumulatedRewardsPerShare;
        uint256 totalDistributedRewards;
        uint256 undistributedRewards;
        uint16 buyFeeBps;
        uint16 sellFeeBps;
        uint16 maintenanceSplitBps;
        bool paused;
        address leader;
        uint32 leaderShares;
        uint256 currentBuyPrice;  // cost of next 1 share (including buy fee)
        uint256 currentSellPrice; // net proceed for current 1 share (after exit fee)
    }

    struct UserMarketView {
        uint256 assetId;
        uint32 shares;
        uint256 pendingRewards;
        uint256 liquidationValue; // net proceeds if selling all shares
    }

    struct AccountingReport {
        uint256 assetId;
        uint256 reserve;
        uint256 participantRewardPool;
        uint256 claimedRewards;
        uint256 pendingUnclaimedRewards;
        uint256 undistributedRewards;
        uint16 buyFeeBps;
        uint16 sellFeeBps;
        uint16 maintenanceSplitBps;
    }

    // --- STATE VARIABLES ---
    AssetMarket[TOTAL_ASSETS] public assets;

    // assetId => wallet => shares
    mapping(uint256 => mapping(address => uint32)) private _shares;

    // assetId => wallet => rewardDebt
    mapping(uint256 => mapping(address => uint256)) private _rewardDebt;

    // assetId => wallet => accruedUnclaimedRewards
    mapping(uint256 => mapping(address => uint256)) private _unclaimedRewards;

    // assetId => total pending unclaimed rewards
    mapping(uint256 => uint256) public totalMarketUnclaimedRewards;

    // Global aggregate reserve across all 4 markets
    uint256 public totalReserve;

    // Global maintenance fund pool (isolated from reserves)
    uint256 public maintenanceFund;

    // --- EVENTS FOR OFF-CHAIN INDEXING & REAL-TIME LEADERBOARDS ---
    event SharesPurchased(
        uint256 indexed assetId,
        address indexed buyer,
        uint32 quantity,
        uint256 totalCost,
        uint256 rawCost,
        uint256 totalFee,
        uint256 participantReward,
        uint256 maintenanceCut,
        uint32 newSupply,
        uint32 buyerTotalShares
    );

    event SharesSold(
        uint256 indexed assetId,
        address indexed seller,
        uint32 quantity,
        uint256 rawRefund,
        uint256 totalFee,
        uint256 participantReward,
        uint256 maintenanceCut,
        uint256 netProceeds,
        uint32 newSupply,
        uint32 sellerTotalShares
    );

    event RewardsClaimed(
        uint256 indexed assetId,
        address indexed recipient,
        uint256 amount
    );

    event LeaderChanged(
        uint256 indexed assetId,
        address indexed previousLeader,
        address indexed newLeader,
        uint32 leaderShares
    );

    event FeeParametersUpdated(
        uint256 indexed assetId,
        uint16 buyFeeBps,
        uint16 sellFeeBps,
        uint16 maintenanceSplitBps
    );

    event MaintenanceFundWithdrawn(address indexed to, uint256 amount);
    event AssetPaused(uint256 indexed assetId);
    event AssetUnpaused(uint256 indexed assetId);

    // --- CUSTOM ERRORS ---
    error InvalidAsset(uint256 assetId);
    error InvalidQuantity();
    error MarketPaused(uint256 assetId);
    error DeadlineExpired(uint256 deadline, uint256 currentTimestamp);
    error SlippageExceeded(uint256 actual, uint256 limit);
    error SupplyCapExceeded(uint256 currentSupply, uint32 requested, uint32 maxCap);
    error InsufficientSupply(uint32 available, uint32 requested);
    error InsufficientShares(uint32 owned, uint32 requested);
    error InsufficientPayment(uint256 provided, uint256 requiredAmount);
    error InsufficientMarketReserve(uint256 available, uint256 requiredAmount);
    error InsufficientMaintenanceBalance(uint256 available, uint256 requested);
    error FeeTooHigh(uint16 provided, uint256 maxAllowed);
    error InvalidSplit(uint16 provided);
    error NoRewardsToClaim();
    error NativeTransferFailed();

    // --- CONSTRUCTOR ---
    constructor(address initialOwner)
        Ownable(initialOwner == address(0) ? msg.sender : initialOwner)
    {
        // Asset 0: Café Montaña Dorada (Specialty Coffee Micro-Lot)
        assets[0] = AssetMarket({
            name: "Cafe Montana Dorada",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.001 ether,
            slope: 0.00005 ether,
            reserve: 0,
            totalDistributedRewards: 0,
            totalClaimedRewards: 0,
            undistributedRewards: 0,
            accRewardPerShare: 0,
            buyFeeBps: DEFAULT_BUY_FEE_BPS,
            sellFeeBps: DEFAULT_SELL_FEE_BPS,
            maintenanceSplitBps: DEFAULT_MAINTENANCE_SPLIT_BPS,
            paused: false,
            leader: address(0),
            leaderShares: 0
        });

        // Asset 1: Café Volcán Rojo (High Altitude Volcanic Harvest)
        assets[1] = AssetMarket({
            name: "Cafe Volcan Rojo",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.0015 ether,
            slope: 0.00008 ether,
            reserve: 0,
            totalDistributedRewards: 0,
            totalClaimedRewards: 0,
            undistributedRewards: 0,
            accRewardPerShare: 0,
            buyFeeBps: DEFAULT_BUY_FEE_BPS,
            sellFeeBps: DEFAULT_SELL_FEE_BPS,
            maintenanceSplitBps: DEFAULT_MAINTENANCE_SPLIT_BPS,
            paused: false,
            leader: address(0),
            leaderShares: 0
        });

        // Asset 2: Arte Urbano Medellín (Comuna 13 Landmark Mural)
        assets[2] = AssetMarket({
            name: "Arte Urbano Medellin",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.0008 ether,
            slope: 0.00004 ether,
            reserve: 0,
            totalDistributedRewards: 0,
            totalClaimedRewards: 0,
            undistributedRewards: 0,
            accRewardPerShare: 0,
            buyFeeBps: DEFAULT_BUY_FEE_BPS,
            sellFeeBps: DEFAULT_SELL_FEE_BPS,
            maintenanceSplitBps: DEFAULT_MAINTENANCE_SPLIT_BPS,
            paused: false,
            leader: address(0),
            leaderShares: 0
        });

        // Asset 3: Local Genesis (Flagship Specialty Coffee Lounge)
        assets[3] = AssetMarket({
            name: "Local Genesis",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.002 ether,
            slope: 0.0001 ether,
            reserve: 0,
            totalDistributedRewards: 0,
            totalClaimedRewards: 0,
            undistributedRewards: 0,
            accRewardPerShare: 0,
            buyFeeBps: DEFAULT_BUY_FEE_BPS,
            sellFeeBps: DEFAULT_SELL_FEE_BPS,
            maintenanceSplitBps: DEFAULT_MAINTENANCE_SPLIT_BPS,
            paused: false,
            leader: address(0),
            leaderShares: 0
        });
    }

    // --- MATHEMATICAL BONDING CURVE MODEL ---

    /**
     * @notice Marginal price at supply s: P(s) = B + K * s
     */
    function marginalPrice(uint256 s, uint64 B, uint64 K) public pure returns (uint256) {
        return uint256(B) + uint256(K) * s;
    }

    /**
     * @notice Cost of buying q units starting from supply S:
     *         C_buy(S, q) = q * B + K * [q * S + q * (q - 1) / 2]
     */
    function calculateBuyCost(
        uint256 S,
        uint32 q,
        uint64 B,
        uint64 K
    ) public pure returns (uint256) {
        if (q == 0) return 0;
        uint256 baseTerm = uint256(q) * uint256(B);
        uint256 curveTerm = uint256(K) * (uint256(q) * S + (uint256(q) * (uint256(q) - 1)) / 2);
        return baseTerm + curveTerm;
    }

    /**
     * @notice Gross proceeds from selling q units starting from supply S:
     *         C_sell(S, q) = q * B + K * [q * (S - q) + q * (q - 1) / 2]
     */
    function calculateSellGrossRefund(
        uint256 S,
        uint32 q,
        uint64 B,
        uint64 K
    ) public pure returns (uint256) {
        if (q == 0) return 0;
        uint256 baseTerm = uint256(q) * uint256(B);
        uint256 curveTerm = uint256(K) * (uint256(q) * (S - q) + (uint256(q) * (uint256(q) - 1)) / 2);
        return baseTerm + curveTerm;
    }

    // --- QUOTE VIEWS ---

    /**
     * @notice Calculate the cost and fee breakdown to buy `quantity` shares in `assetId`.
     * @param assetId The asset market ID (0 to 3).
     * @param quantity Number of shares to purchase.
     * @return rawCost Base bonding curve cost entering reserve.
     * @return fee Total fee collected (2% by default).
     * @return totalCost Total native token required (rawCost + fee).
     */
    function quoteBuy(uint256 assetId, uint32 quantity)
        public
        view
        returns (uint256 rawCost, uint256 fee, uint256 totalCost)
    {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        if (quantity == 0) revert InvalidQuantity();
        AssetMarket storage m = assets[assetId];
        if (uint256(m.circulatingSupply) + quantity > m.maxSupply) {
            revert SupplyCapExceeded(m.circulatingSupply, quantity, m.maxSupply);
        }

        rawCost = calculateBuyCost(m.circulatingSupply, quantity, m.basePrice, m.slope);
        fee = (rawCost * m.buyFeeBps) / BPS_DENOMINATOR;
        totalCost = rawCost + fee;
    }

    /**
     * @notice Calculate the gross refund, exit fee, and net proceeds when selling `quantity` shares.
     * @param assetId The asset market ID (0 to 3).
     * @param quantity Number of shares to liquidate.
     * @return rawRefund Gross bonding curve refund deducted from reserve.
     * @return exitFee Fee collected on exit (2% by default).
     * @return netProceeds Net native token paid out to seller.
     */
    function quoteSell(uint256 assetId, uint32 quantity)
        public
        view
        returns (uint256 rawRefund, uint256 exitFee, uint256 netProceeds)
    {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        if (quantity == 0) revert InvalidQuantity();
        AssetMarket storage m = assets[assetId];
        if (quantity > m.circulatingSupply) {
            revert InsufficientSupply(m.circulatingSupply, quantity);
        }

        rawRefund = calculateSellGrossRefund(m.circulatingSupply, quantity, m.basePrice, m.slope);
        exitFee = (rawRefund * m.sellFeeBps) / BPS_DENOMINATOR;
        netProceeds = rawRefund - exitFee;
    }

    // --- MUTATIVE TRADING FUNCTIONS ---

    /**
     * @notice Purchase shares with strict accounting separation, slippage, and deadline protection.
     * @param assetId ID of the asset (0 to 3).
     * @param quantity Number of shares to buy.
     * @param maxTotalCost Maximum total payment allowed (slippage cap).
     * @param deadline Unix timestamp after which transaction reverts.
     */
    function buyShares(
        uint256 assetId,
        uint32 quantity,
        uint256 maxTotalCost,
        uint256 deadline
    ) external payable nonReentrant {
        if (block.timestamp > deadline) revert DeadlineExpired(deadline, block.timestamp);
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);

        AssetMarket storage market = assets[assetId];
        if (market.paused) revert MarketPaused(assetId);

        (uint256 rawCost, uint256 fee, uint256 totalCost) = quoteBuy(assetId, quantity);

        if (totalCost > maxTotalCost) revert SlippageExceeded(totalCost, maxTotalCost);
        if (msg.value < totalCost) revert InsufficientPayment(msg.value, totalCost);

        uint32 currentSupply = market.circulatingSupply;

        // --- FEE BREAKDOWN & DISTRIBUTION ---
        uint256 maintenanceCut = (fee * market.maintenanceSplitBps) / BPS_DENOMINATOR;
        uint256 participantReward = fee - maintenanceCut;

        if (maintenanceCut > 0) {
            maintenanceFund += maintenanceCut;
        }

        // 1. Distribute participant reward to existing eligible holders
        if (participantReward > 0) {
            if (currentSupply > 0) {
                uint256 rewardPerShareIncrement = (participantReward * REWARD_PRECISION) / currentSupply;
                uint256 distributedAmount = (rewardPerShareIncrement * currentSupply) / REWARD_PRECISION;
                uint256 dust = participantReward - distributedAmount; // integer rounding residual

                market.accRewardPerShare += rewardPerShareIncrement;
                market.totalDistributedRewards += distributedAmount;
                totalMarketUnclaimedRewards[assetId] += distributedAmount;

                // Dust is banked in undistributed rewards (zero loss)
                if (dust > 0) {
                    market.undistributedRewards += dust;
                }
            } else {
                // No existing eligible holders: entire reward is preserved in undistributed rewards
                market.undistributedRewards += participantReward;
            }
        }

        // 2. Accrue buyer's earned rewards on their EXISTING shares (before adding new shares)
        _accrueUserRewards(assetId, msg.sender);

        // 3. Update balances and redemption reserve (rawCost strictly backs redemptions)
        market.circulatingSupply = currentSupply + quantity;
        _shares[assetId][msg.sender] += quantity;
        market.reserve += rawCost;
        totalReserve += rawCost;

        // 4. Update rewardDebt at the NEW accRewardPerShare rate.
        // Newly acquired shares do NOT receive rewards generated prior to this acquisition.
        _rewardDebt[assetId][msg.sender] =
            (uint256(_shares[assetId][msg.sender]) * market.accRewardPerShare) / REWARD_PRECISION;

        // 5. Majority shareholder tracking
        uint32 buyerTotalShares = _shares[assetId][msg.sender];
        if (buyerTotalShares > market.leaderShares) {
            address prevLeader = market.leader;
            market.leader = msg.sender;
            market.leaderShares = buyerTotalShares;
            emit LeaderChanged(assetId, prevLeader, msg.sender, buyerTotalShares);
        }

        emit SharesPurchased(
            assetId,
            msg.sender,
            quantity,
            totalCost,
            rawCost,
            fee,
            participantReward,
            maintenanceCut,
            market.circulatingSupply,
            buyerTotalShares
        );

        // 6. Automatic refund of any excess payment
        uint256 excess = msg.value - totalCost;
        if (excess > 0) {
            (bool refundOk, ) = msg.sender.call{value: excess}("");
            if (!refundOk) revert NativeTransferFailed();
        }
    }

    /**
     * @notice Sell shares with strict reserve solvency verification, slippage, and deadline protection.
     * @param assetId ID of the asset (0 to 3).
     * @param quantity Number of shares to sell.
     * @param minNetProceeds Minimum native tokens acceptable (slippage floor).
     * @param deadline Unix timestamp after which transaction reverts.
     */
    function sellShares(
        uint256 assetId,
        uint32 quantity,
        uint256 minNetProceeds,
        uint256 deadline
    ) external nonReentrant {
        if (block.timestamp > deadline) revert DeadlineExpired(deadline, block.timestamp);
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);

        AssetMarket storage market = assets[assetId];
        if (market.paused) revert MarketPaused(assetId);

        uint32 userBal = _shares[assetId][msg.sender];
        if (userBal < quantity) revert InsufficientShares(userBal, quantity);

        // 1. Calculate gross refund and fees
        (uint256 rawRefund, uint256 exitFee, uint256 netProceeds) = quoteSell(assetId, quantity);

        // 2. Strict reserve constraint: payment can NEVER exceed available market reserve
        if (rawRefund > market.reserve) {
            revert InsufficientMarketReserve(market.reserve, rawRefund);
        }

        if (netProceeds < minNetProceeds) revert SlippageExceeded(netProceeds, minNetProceeds);

        // 3. Accrue seller's pending dividends prior to share reduction
        _accrueUserRewards(assetId, msg.sender);

        // 4. Update seller position and market circulating supply
        uint32 newSupply = market.circulatingSupply - quantity;
        market.circulatingSupply = newSupply;
        _shares[assetId][msg.sender] = userBal - quantity;

        // Deduct raw refund strictly from this market's reserve
        market.reserve -= rawRefund;
        totalReserve -= rawRefund;

        // 5. Fee breakdown & distribution to remaining diamond hand holders
        uint256 maintenanceCut = (exitFee * market.maintenanceSplitBps) / BPS_DENOMINATOR;
        uint256 participantReward = exitFee - maintenanceCut;

        if (maintenanceCut > 0) {
            maintenanceFund += maintenanceCut;
        }

        if (participantReward > 0) {
            if (newSupply > 0) {
                uint256 rewardPerShareIncrement = (participantReward * REWARD_PRECISION) / newSupply;
                uint256 distributedAmount = (rewardPerShareIncrement * newSupply) / REWARD_PRECISION;
                uint256 dust = participantReward - distributedAmount;

                market.accRewardPerShare += rewardPerShareIncrement;
                market.totalDistributedRewards += distributedAmount;
                totalMarketUnclaimedRewards[assetId] += distributedAmount;

                if (dust > 0) {
                    market.undistributedRewards += dust;
                }
            } else {
                // If supply reaches 0, remaining fee is retained in market undistributed rewards
                market.undistributedRewards += participantReward;
            }
        }

        // 6. Reset rewardDebt with remaining shares at the current accumulator
        _rewardDebt[assetId][msg.sender] =
            (uint256(_shares[assetId][msg.sender]) * market.accRewardPerShare) / REWARD_PRECISION;

        // 7. Handle majority shareholder updates
        if (market.leader == msg.sender) {
            market.leaderShares = _shares[assetId][msg.sender];
            if (market.leaderShares == 0) {
                market.leader = address(0);
                emit LeaderChanged(assetId, msg.sender, address(0), 0);
            }
        }

        emit SharesSold(
            assetId,
            msg.sender,
            quantity,
            rawRefund,
            exitFee,
            participantReward,
            maintenanceCut,
            netProceeds,
            newSupply,
            _shares[assetId][msg.sender]
        );

        // 8. Transfer net proceeds to seller
        (bool payoutOk, ) = msg.sender.call{value: netProceeds}("");
        if (!payoutOk) revert NativeTransferFailed();
    }

    /**
     * @notice Claim accumulated native dividend rewards for a specific asset market.
     * @param assetId The market ID (0 to 3).
     */
    function claimRewards(uint256 assetId) external nonReentrant {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);

        _accrueUserRewards(assetId, msg.sender);

        uint256 payout = _unclaimedRewards[assetId][msg.sender];
        if (payout == 0) revert NoRewardsToClaim();

        _unclaimedRewards[assetId][msg.sender] = 0;
        totalMarketUnclaimedRewards[assetId] -= payout;
        assets[assetId].totalClaimedRewards += payout;

        emit RewardsClaimed(assetId, msg.sender, payout);

        (bool success, ) = msg.sender.call{value: payout}("");
        if (!success) revert NativeTransferFailed();
    }

    /**
     * @notice Claim all accumulated rewards across all 4 markets in 1 atomic transaction.
     */
    function claimAllRewards() external nonReentrant {
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < TOTAL_ASSETS; i++) {
            _accrueUserRewards(i, msg.sender);
            uint256 amount = _unclaimedRewards[i][msg.sender];
            if (amount > 0) {
                _unclaimedRewards[i][msg.sender] = 0;
                totalMarketUnclaimedRewards[i] -= amount;
                assets[i].totalClaimedRewards += amount;
                totalPayout += amount;
                emit RewardsClaimed(i, msg.sender, amount);
            }
        }

        if (totalPayout == 0) revert NoRewardsToClaim();

        (bool success, ) = msg.sender.call{value: totalPayout}("");
        if (!success) revert NativeTransferFailed();
    }

    // --- FEE CONFIGURATION & MAINTENANCE MANAGEMENT (ADMIN) ---

    /**
     * @notice Configure fee parameters for an individual market.
     * @param assetId The market ID (0 to 3).
     * @param buyFeeBps Buy fee in basis points (e.g. 200 = 2.0%).
     * @param sellFeeBps Sell fee in basis points (e.g. 200 = 2.0%).
     * @param maintenanceSplitBps Split of fee allocated to maintenance (e.g. 2000 = 20%).
     */
    function setFeeParameters(
        uint256 assetId,
        uint16 buyFeeBps,
        uint16 sellFeeBps,
        uint16 maintenanceSplitBps
    ) external onlyOwner {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        if (buyFeeBps > MAX_FEE_BPS) revert FeeTooHigh(buyFeeBps, MAX_FEE_BPS);
        if (sellFeeBps > MAX_FEE_BPS) revert FeeTooHigh(sellFeeBps, MAX_FEE_BPS);
        if (maintenanceSplitBps > BPS_DENOMINATOR) revert InvalidSplit(maintenanceSplitBps);

        AssetMarket storage m = assets[assetId];
        m.buyFeeBps = buyFeeBps;
        m.sellFeeBps = sellFeeBps;
        m.maintenanceSplitBps = maintenanceSplitBps;

        emit FeeParametersUpdated(assetId, buyFeeBps, sellFeeBps, maintenanceSplitBps);
    }

    /**
     * @notice Withdraw funds accrued in the optional maintenance fund.
     * @param to Recipient address for maintenance funds.
     * @param amount Amount in wei to withdraw.
     */
    function withdrawMaintenanceFund(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (amount > maintenanceFund) {
            revert InsufficientMaintenanceBalance(maintenanceFund, amount);
        }
        maintenanceFund -= amount;
        emit MaintenanceFundWithdrawn(to, amount);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    // --- CIRCUIT BREAKERS (ADMIN) ---

    function pauseAsset(uint256 assetId) external onlyOwner {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        assets[assetId].paused = true;
        emit AssetPaused(assetId);
    }

    function unpauseAsset(uint256 assetId) external onlyOwner {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        assets[assetId].paused = false;
        emit AssetUnpaused(assetId);
    }

    // --- INTERNAL REWARD ACCRUAL ---

    function _accrueUserRewards(uint256 assetId, address wallet) internal {
        uint32 shares = _shares[assetId][wallet];
        if (shares > 0) {
            uint256 accumulated = (uint256(shares) * assets[assetId].accRewardPerShare) / REWARD_PRECISION;
            if (accumulated > _rewardDebt[assetId][wallet]) {
                uint256 pending = accumulated - _rewardDebt[assetId][wallet];
                _unclaimedRewards[assetId][wallet] += pending;
            }
        }
        _rewardDebt[assetId][wallet] =
            (uint256(shares) * assets[assetId].accRewardPerShare) / REWARD_PRECISION;
    }

    // --- VIEW / QUERY INTERFACES ---

    function balanceOf(uint256 assetId, address wallet) external view returns (uint32) {
        if (assetId >= TOTAL_ASSETS) return 0;
        return _shares[assetId][wallet];
    }

    function getCurrentPrice(uint256 assetId) external view returns (uint256) {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        AssetMarket storage m = assets[assetId];
        uint32 s = m.circulatingSupply < m.maxSupply ? m.circulatingSupply : m.maxSupply - 1;
        return uint256(m.basePrice) + uint256(m.slope) * s;
    }

    function getPendingRewards(uint256 assetId, address wallet) public view returns (uint256) {
        if (assetId >= TOTAL_ASSETS) return 0;
        uint32 shares = _shares[assetId][wallet];
        uint256 pending = _unclaimedRewards[assetId][wallet];

        if (shares > 0) {
            uint256 accumulated = (uint256(shares) * assets[assetId].accRewardPerShare) / REWARD_PRECISION;
            if (accumulated > _rewardDebt[assetId][wallet]) {
                pending += accumulated - _rewardDebt[assetId][wallet];
            }
        }
        return pending;
    }

    function _getAsset(uint256 assetId) internal view returns (AssetInfo memory info) {
        AssetMarket storage m = assets[assetId];

        uint256 nextBuy = 0;
        if (m.circulatingSupply < m.maxSupply) {
            (,, nextBuy) = quoteBuy(assetId, 1);
        }

        uint256 currentSell = 0;
        if (m.circulatingSupply > 0) {
            (,, currentSell) = quoteSell(assetId, 1);
        }

        info = AssetInfo({
            id: assetId,
            name: m.name,
            maxSupply: m.maxSupply,
            circulatingSupply: m.circulatingSupply,
            basePrice: m.basePrice,
            slope: m.slope,
            reserve: m.reserve,
            accumulatedRewardsPerShare: m.accRewardPerShare,
            totalDistributedRewards: m.totalDistributedRewards,
            undistributedRewards: m.undistributedRewards,
            buyFeeBps: m.buyFeeBps,
            sellFeeBps: m.sellFeeBps,
            maintenanceSplitBps: m.maintenanceSplitBps,
            paused: m.paused,
            leader: m.leader,
            leaderShares: m.leaderShares,
            currentBuyPrice: nextBuy,
            currentSellPrice: currentSell
        });
    }

    function getAsset(uint256 assetId) public view returns (AssetInfo memory) {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        return _getAsset(assetId);
    }

    function getAllAssets() external view returns (AssetInfo[TOTAL_ASSETS] memory views) {
        for (uint256 i = 0; i < TOTAL_ASSETS; i++) {
            views[i] = _getAsset(i);
        }
    }

    function getUserPortfolio(address wallet)
        external
        view
        returns (UserMarketView[TOTAL_ASSETS] memory views, uint256 totalClaimable)
    {
        for (uint256 i = 0; i < TOTAL_ASSETS; i++) {
            uint32 shares = _shares[i][wallet];
            uint256 pending = getPendingRewards(i, wallet);
            totalClaimable += pending;

            uint256 sellValue = 0;
            if (shares > 0) {
                (,, sellValue) = quoteSell(i, shares);
            }

            views[i] = UserMarketView({
                assetId: i,
                shares: shares,
                pendingRewards: pending,
                liquidationValue: sellValue
            });
        }
    }

    /**
     * @notice Verifiable accounting report per asset market.
     */
    function getAccountingReport(uint256 assetId) external view returns (AccountingReport memory) {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset(assetId);
        AssetMarket storage m = assets[assetId];
        return AccountingReport({
            assetId: assetId,
            reserve: m.reserve,
            participantRewardPool: m.totalDistributedRewards,
            claimedRewards: m.totalClaimedRewards,
            pendingUnclaimedRewards: totalMarketUnclaimedRewards[assetId],
            undistributedRewards: m.undistributedRewards,
            buyFeeBps: m.buyFeeBps,
            sellFeeBps: m.sellFeeBps,
            maintenanceSplitBps: m.maintenanceSplitBps
        });
    }

    /**
     * @notice Global audit view verifying exact solvency across the whole contract.
     */
    function getGlobalAccounting() external view returns (
        uint256 contractBalance,
        uint256 totalReserves,
        uint256 totalUnclaimed,
        uint256 totalUndistributed,
        uint256 maintenanceBalance,
        bool isSolvent
    ) {
        contractBalance = address(this).balance;
        totalReserves = totalReserve;
        maintenanceBalance = maintenanceFund;

        for (uint256 i = 0; i < TOTAL_ASSETS; i++) {
            totalUnclaimed += totalMarketUnclaimedRewards[i];
            totalUndistributed += assets[i].undistributedRewards;
        }

        uint256 totalLiabilities = totalReserves + totalUnclaimed + totalUndistributed + maintenanceBalance;
        isSolvent = (contractBalance >= totalLiabilities);
    }
}
