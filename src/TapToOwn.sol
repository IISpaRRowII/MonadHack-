// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TapToOwn - Real-World Asset Wars
 * @notice Gamified micro-share arena on Monad with linear bonding curves,
 *         O(1) instant fee-sharing dividends, and real-time majority shareholder tracking.
 * @dev Optimized for sub-second block times and parallel execution.
 *      Disclaimer: Virtual demo shares; does not grant legal ownership of physical assets.
 */
contract TapToOwn {
    // --- CONSTANTS ---
    uint256 public constant TOTAL_ASSETS = 4;
    uint32 public constant MAX_SUPPLY_PER_ASSET = 1000;
    uint256 public constant BUY_FEE_BPS = 500;   // 5.0% distributed to current holders
    uint256 public constant SELL_FEE_BPS = 250;  // 2.5% exit fee to remaining diamond hands
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 private constant DIVIDEND_PRECISION = 1e18;

    // --- STRUCTS ---
    struct Asset {
        string name;
        uint32 maxSupply;
        uint32 circulatingSupply;
        uint64 basePrice; // in wei
        uint64 slope;     // in wei per unit
        address leader;
        uint32 leaderShares;
        uint256 accDividendPerShare; // Scaled by DIVIDEND_PRECISION
    }

    struct AssetView {
        uint256 id;
        string name;
        uint32 maxSupply;
        uint32 circulatingSupply;
        uint64 basePrice;
        uint64 slope;
        uint256 nextBuyPrice;
        uint256 currentSellPrice;
        address leader;
        uint32 leaderShares;
    }

    struct UserAssetView {
        uint256 assetId;
        uint32 shares;
        uint256 pendingDividends;
        uint256 currentSellRefund;
    }

    // --- STATE VARIABLES ---
    Asset[TOTAL_ASSETS] public assets;

    // assetId => userAddress => shares
    mapping(uint256 => mapping(address => uint32)) public userShares;

    // assetId => userAddress => rewardDebt
    mapping(uint256 => mapping(address => uint256)) public rewardDebt;

    // assetId => userAddress => accruedUnclaimedDividends
    mapping(uint256 => mapping(address => uint256)) public unclaimedDividends;

    // Total reserved native token in contract for bonding curve redemptions
    uint256 public totalBondingReserve;

    // Reentrancy guard state
    uint256 private _locked = 1;

    // --- EVENTS ---
    event UnitsPurchased(
        uint256 indexed assetId,
        address indexed buyer,
        uint32 amount,
        uint256 totalCost,
        uint256 rawCost,
        uint256 fee,
        uint32 newSupply
    );

    event UnitsSold(
        uint256 indexed assetId,
        address indexed seller,
        uint32 amount,
        uint256 netRefund,
        uint256 exitFee,
        uint32 newSupply
    );

    event DividendsClaimed(
        uint256 indexed assetId,
        address indexed user,
        uint256 amount
    );

    event LeaderChanged(
        uint256 indexed assetId,
        address indexed previousLeader,
        address indexed newLeader,
        uint32 leaderShares
    );

    // --- CUSTOM ERRORS ---
    error InvalidAsset();
    error InvalidAmount();
    error SupplyCapExceeded();
    error InsufficientSupply();
    error InsufficientShares();
    error InsufficientPayment(uint256 provided, uint256 requiredAmount);
    error NoDividendsToClaim();
    error TransferFailed();
    error ReentrancyGuardLocked();

    // --- MODIFIERS ---
    modifier nonReentrant() {
        if (_locked != 1) revert ReentrancyGuardLocked();
        _locked = 2;
        _;
        _locked = 1;
    }

    // --- CONSTRUCTOR ---
    constructor() {
        // Asset 0: Café Montaña Dorada (Specialty Coffee Lot)
        assets[0] = Asset({
            name: "Cafe Montana Dorada",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.001 ether,
            slope: 0.00005 ether,
            leader: address(0),
            leaderShares: 0,
            accDividendPerShare: 0
        });

        // Asset 1: Café Volcán Rojo (High Altitude Volcanic Harvest)
        assets[1] = Asset({
            name: "Cafe Volcan Rojo",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.0015 ether,
            slope: 0.00008 ether,
            leader: address(0),
            leaderShares: 0,
            accDividendPerShare: 0
        });

        // Asset 2: Arte Urbano Medellín (Comuna 13 Landmark Mural)
        assets[2] = Asset({
            name: "Arte Urbano Medellin",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.0008 ether,
            slope: 0.00004 ether,
            leader: address(0),
            leaderShares: 0,
            accDividendPerShare: 0
        });

        // Asset 3: Local Genesis (Flagship Specialty Coffee Lounge)
        assets[3] = Asset({
            name: "Local Genesis",
            maxSupply: MAX_SUPPLY_PER_ASSET,
            circulatingSupply: 0,
            basePrice: 0.002 ether,
            slope: 0.0001 ether,
            leader: address(0),
            leaderShares: 0,
            accDividendPerShare: 0
        });
    }

    // --- INTERNAL PURE MATH HELPERS ---

    function _rawCost(uint256 s, uint256 k, uint64 p0, uint64 slope) internal pure returns (uint256) {
        return (k * p0) + (slope * k * (2 * s + k - 1)) / 2;
    }

    function _rawRefund(uint256 s, uint256 k, uint64 p0, uint64 slope) internal pure returns (uint256) {
        return (k * p0) + (slope * k * (2 * s - k - 1)) / 2;
    }

    // --- BONDING CURVE PRICING MATH ---

    /**
     * @notice Calculate the cost and fee to buy `amount` units of an asset.
     */
    function getBuyCost(uint256 assetId, uint32 amount)
        public
        view
        returns (uint256 rawCost, uint256 fee, uint256 totalCost)
    {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset();
        if (amount == 0) revert InvalidAmount();
        Asset storage asset = assets[assetId];
        if (uint256(asset.circulatingSupply) + amount > asset.maxSupply) {
            revert SupplyCapExceeded();
        }

        rawCost = _rawCost(asset.circulatingSupply, amount, asset.basePrice, asset.slope);

        // If no units exist yet, no existing shareholders receive fees; fee is 0
        fee = (asset.circulatingSupply == 0) ? 0 : (rawCost * BUY_FEE_BPS) / BPS_DENOMINATOR;
        totalCost = rawCost + fee;
    }

    /**
     * @notice Calculate the redemption value and exit fee when selling `amount` units.
     */
    function getSellRefund(uint256 assetId, uint32 amount)
        public
        view
        returns (uint256 rawRefund, uint256 exitFee, uint256 netRefund)
    {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset();
        if (amount == 0) revert InvalidAmount();
        Asset storage asset = assets[assetId];
        if (amount > asset.circulatingSupply) revert InsufficientSupply();

        rawRefund = _rawRefund(asset.circulatingSupply, amount, asset.basePrice, asset.slope);

        // Exit fee is 0 if this sell drains the entire supply (no remaining holders)
        exitFee = (asset.circulatingSupply == amount) ? 0 : (rawRefund * SELL_FEE_BPS) / BPS_DENOMINATOR;
        netRefund = rawRefund - exitFee;
    }

    // --- CORE MUTATIVE FUNCTIONS ---

    /**
     * @notice Purchase gamified micro-shares of a chosen asset.
     * @param assetId The ID of the asset (0 to 3).
     * @param amount The number of units to acquire.
     */
    function buy(uint256 assetId, uint32 amount) external payable nonReentrant {
        (uint256 rawCost, uint256 fee, uint256 totalCost) = getBuyCost(assetId, amount);

        if (msg.value < totalCost) {
            revert InsufficientPayment(msg.value, totalCost);
        }

        Asset storage asset = assets[assetId];
        uint32 currentSupply = asset.circulatingSupply;

        // Distribute buy fee to existing holders before adding buyer's new shares
        if (fee > 0 && currentSupply > 0) {
            asset.accDividendPerShare += (fee * DIVIDEND_PRECISION) / currentSupply;
        }

        // Accrue buyer's earned dividends based on their existing balance
        _accrueUserDividends(assetId, msg.sender);

        // Update balances and reserve
        asset.circulatingSupply = currentSupply + amount;
        userShares[assetId][msg.sender] += amount;
        totalBondingReserve += rawCost;

        // Reset reward debt at the updated accumulator rate
        rewardDebt[assetId][msg.sender] =
            (uint256(userShares[assetId][msg.sender]) * asset.accDividendPerShare) / DIVIDEND_PRECISION;

        // Majority shareholder tracking
        uint32 buyerTotalShares = userShares[assetId][msg.sender];
        if (buyerTotalShares > asset.leaderShares) {
            address prevLeader = asset.leader;
            asset.leader = msg.sender;
            asset.leaderShares = buyerTotalShares;
            emit LeaderChanged(assetId, prevLeader, msg.sender, buyerTotalShares);
        }

        emit UnitsPurchased(
            assetId,
            msg.sender,
            amount,
            totalCost,
            rawCost,
            fee,
            asset.circulatingSupply
        );

        // Refund any excess msg.value
        uint256 excess = msg.value - totalCost;
        if (excess > 0) {
            (bool refundOk, ) = msg.sender.call{value: excess}("");
            if (!refundOk) revert TransferFailed();
        }
    }

    /**
     * @notice Sell micro-shares back to the bonding curve reserve.
     * @param assetId The ID of the asset (0 to 3).
     * @param amount The number of units to liquidate.
     */
    function sell(uint256 assetId, uint32 amount) external nonReentrant {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset();
        if (amount == 0) revert InvalidAmount();

        uint32 currentShares = userShares[assetId][msg.sender];
        if (currentShares < amount) revert InsufficientShares();

        (uint256 rawRefund, uint256 exitFee, uint256 netRefund) = getSellRefund(assetId, amount);

        // Accrue user's pending dividends prior to share reduction
        _accrueUserDividends(assetId, msg.sender);

        Asset storage asset = assets[assetId];
        uint32 newSupply = asset.circulatingSupply - amount;
        asset.circulatingSupply = newSupply;
        userShares[assetId][msg.sender] = currentShares - amount;
        totalBondingReserve -= rawRefund;

        // Distribute exit fee to remaining diamond hands
        if (exitFee > 0 && newSupply > 0) {
            asset.accDividendPerShare += (exitFee * DIVIDEND_PRECISION) / newSupply;
        }

        // Reset reward debt at the current accumulator
        rewardDebt[assetId][msg.sender] =
            (uint256(userShares[assetId][msg.sender]) * asset.accDividendPerShare) / DIVIDEND_PRECISION;

        // Handle leader status change if current leader liquidated shares
        if (asset.leader == msg.sender) {
            asset.leaderShares = userShares[assetId][msg.sender];
            if (asset.leaderShares == 0) {
                asset.leader = address(0);
                emit LeaderChanged(assetId, msg.sender, address(0), 0);
            }
        }

        emit UnitsSold(
            assetId,
            msg.sender,
            amount,
            netRefund,
            exitFee,
            newSupply
        );

        // Pay out net refund to seller
        (bool payoutOk, ) = msg.sender.call{value: netRefund}("");
        if (!payoutOk) revert TransferFailed();
    }

    /**
     * @notice Claim accumulated MON dividends for a single asset.
     * @param assetId The ID of the asset (0 to 3).
     */
    function claimDividends(uint256 assetId) external nonReentrant {
        if (assetId >= TOTAL_ASSETS) revert InvalidAsset();

        _accrueUserDividends(assetId, msg.sender);

        uint256 payout = unclaimedDividends[assetId][msg.sender];
        if (payout == 0) revert NoDividendsToClaim();

        unclaimedDividends[assetId][msg.sender] = 0;

        emit DividendsClaimed(assetId, msg.sender, payout);

        (bool success, ) = msg.sender.call{value: payout}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Claim all accumulated MON dividends across all 4 assets in 1 single transaction.
     */
    function claimAllDividends() external nonReentrant {
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < TOTAL_ASSETS; i++) {
            _accrueUserDividends(i, msg.sender);
            uint256 amount = unclaimedDividends[i][msg.sender];
            if (amount > 0) {
                unclaimedDividends[i][msg.sender] = 0;
                totalPayout += amount;
                emit DividendsClaimed(i, msg.sender, amount);
            }
        }

        if (totalPayout == 0) revert NoDividendsToClaim();

        (bool success, ) = msg.sender.call{value: totalPayout}("");
        if (!success) revert TransferFailed();
    }

    // --- INTERNAL HELPERS ---

    /**
     * @dev Internal accumulator logic for O(1) dividend distribution.
     */
    function _accrueUserDividends(uint256 assetId, address user) internal {
        uint32 shares = userShares[assetId][user];
        if (shares > 0) {
            uint256 accumulated = (uint256(shares) * assets[assetId].accDividendPerShare) / DIVIDEND_PRECISION;
            if (accumulated > rewardDebt[assetId][user]) {
                uint256 pending = accumulated - rewardDebt[assetId][user];
                unclaimedDividends[assetId][user] += pending;
            }
        }
        rewardDebt[assetId][user] = (uint256(shares) * assets[assetId].accDividendPerShare) / DIVIDEND_PRECISION;
    }

    // --- VIEW FUNCTIONS FOR FRONTEND & BACKEND ---

    /**
     * @notice Get pending claimable dividends for a user on a given asset.
     */
    function getPendingDividends(uint256 assetId, address user) public view returns (uint256) {
        if (assetId >= TOTAL_ASSETS) return 0;
        uint32 shares = userShares[assetId][user];
        uint256 pending = unclaimedDividends[assetId][user];

        if (shares > 0) {
            uint256 accumulated = (uint256(shares) * assets[assetId].accDividendPerShare) / DIVIDEND_PRECISION;
            if (accumulated > rewardDebt[assetId][user]) {
                pending += accumulated - rewardDebt[assetId][user];
            }
        }
        return pending;
    }

    /**
     * @notice Returns complete state of all 4 assets in a single call.
     */
    function getAllAssets() external view returns (AssetView[TOTAL_ASSETS] memory views) {
        for (uint256 i = 0; i < TOTAL_ASSETS; i++) {
            Asset storage a = assets[i];

            uint256 nextBuy = 0;
            if (a.circulatingSupply < a.maxSupply) {
                uint256 raw = _rawCost(a.circulatingSupply, 1, a.basePrice, a.slope);
                uint256 fee = (a.circulatingSupply == 0) ? 0 : (raw * BUY_FEE_BPS) / BPS_DENOMINATOR;
                nextBuy = raw + fee;
            }

            uint256 currentSell = 0;
            if (a.circulatingSupply > 0) {
                uint256 raw = _rawRefund(a.circulatingSupply, 1, a.basePrice, a.slope);
                uint256 exitFee = (a.circulatingSupply == 1) ? 0 : (raw * SELL_FEE_BPS) / BPS_DENOMINATOR;
                currentSell = raw - exitFee;
            }

            views[i] = AssetView({
                id: i,
                name: a.name,
                maxSupply: a.maxSupply,
                circulatingSupply: a.circulatingSupply,
                basePrice: a.basePrice,
                slope: a.slope,
                nextBuyPrice: nextBuy,
                currentSellPrice: currentSell,
                leader: a.leader,
                leaderShares: a.leaderShares
            });
        }
    }

    /**
     * @notice Returns the portfolio and claimable dividends of a user across all 4 assets.
     */
    function getUserPortfolio(address user)
        external
        view
        returns (UserAssetView[TOTAL_ASSETS] memory views, uint256 totalClaimable)
    {
        for (uint256 i = 0; i < TOTAL_ASSETS; i++) {
            uint32 shares = userShares[i][user];
            uint256 pending = getPendingDividends(i, user);
            totalClaimable += pending;

            uint256 sellValue = 0;
            if (shares > 0) {
                uint256 raw = _rawRefund(assets[i].circulatingSupply, shares, assets[i].basePrice, assets[i].slope);
                uint256 exitFee = (assets[i].circulatingSupply == shares) ? 0 : (raw * SELL_FEE_BPS) / BPS_DENOMINATOR;
                sellValue = raw - exitFee;
            }

            views[i] = UserAssetView({
                assetId: i,
                shares: shares,
                pendingDividends: pending,
                currentSellRefund: sellValue
            });
        }
    }
}
