# Security Policy & Architecture - Tap-to-Own Arena

## 1. Overview & Threat Model

**Tap-to-Own Arena** is an on-chain, high-throughput gamified RWA marketplace on **Monad**. The smart contract layer (`TapToOwnArena.sol`) manages 4 independent bonding curve markets with shared infrastructure, participant fee-sharing dividends, and majority shareholder tracking.

The system is designed under a **Zero-Trust & Solvency-First** security model.

---

## 2. Core Security Mitigations

### 2.1 Reentrancy & Checks-Effects-Interactions (CEI)
* **ReentrancyGuard:** Inherits OpenZeppelin's production-grade `ReentrancyGuard.sol`. Mutative entry points (`buyShares`, `sellShares`, `claimRewards`, `claimAllRewards`, `withdrawMaintenanceFund`) are guarded with the `nonReentrant` modifier.
* **Checks-Effects-Interactions:** State modifications (share deduction, supply decrement, reserve debits, and zeroing out `_unclaimedRewards`) are executed strictly **before** invoking external `.call{value: ...}("")` native transfers.
* **Verification:** Confirmed via `TestReentrantAttacker` in [TapToOwnArenaTestPlan.t.sol](file:///c:/Monad-Project/MonadHack/test/TapToOwnArenaTestPlan.t.sol) and `ArenaMaliciousAttacker` in [TapToOwnArenaInvariants.t.sol](file:///c:/Monad-Project/MonadHack/test/TapToOwnArenaInvariants.t.sol).

### 2.2 Slippage & Front-Running Protection
* **`buyShares(assetId, quantity, maxTotalCost, deadline)`:** Users specify the maximum acceptable native token payment. If an front-running transaction raises the bonding curve price beyond `maxTotalCost`, the transaction reverts with `SlippageExceeded`.
* **`sellShares(assetId, quantity, minNetProceeds, deadline)`:** Sellers specify a minimum acceptable net payout. If a previous liquidation reduces proceeds below `minNetProceeds`, the transaction reverts.
* **`deadline` Enforcement:** Every trade requires a block timestamp deadline. Transactions pending longer than `deadline` revert with `DeadlineExpired`.

### 2.3 Strict Reserve Segregation (No Cross-Market Contamination)
* Each market $i \in \{0, 1, 2, 3\}$ maintains an independent `reserve` balance.
* Buying in Market 0 credits only `assets[0].reserve`.
* Selling in Market 0 debits only `assets[0].reserve`.
* **Hard Enforcement:**
  ```solidity
  if (rawRefund > market.reserve) revert InsufficientMarketReserve(market.reserve, rawRefund);
  ```
  A market can never borrow or drain liquidity from another market.

### 2.4 Rug-Pull Immunity & Admin Restraints
* **Zero Reserve Drain:** The contract owner has **no function** to withdraw, drain, or redirect redemption reserves (`market.reserve`) or participant reward pools.
* **Maintenance Fund Isolation:** The owner can only withdraw from `maintenanceFund`, which is accumulated strictly from the 20% maintenance fee split.
* **Fee Caps:** The administrator cannot arbitrarily increase fees to confiscate capital:
  ```solidity
  if (buyFeeBps > MAX_FEE_BPS || sellFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
  ```
  Both `buyFeeBps` and `sellFeeBps` are hard-capped at **10.0% (`MAX_FEE_BPS = 1000`)**.

### 2.5 Double-Claim & Reward Drainage Defense
* `claimRewards` and `claimAllRewards` calculate accrued dividends and set `_unclaimedRewards[assetId][msg.sender] = 0` prior to transferring funds.
* Any immediate subsequent call reverts with `NoRewardsToClaim`.
* A participant can only withdraw their own mathematically earned dividends; calling claim on one wallet cannot touch another wallet's rewards.

### 2.6 Native Token Transfer Safety
* All native MON payouts use low-level `.call{value: ...}("")` to prevent gas griefing (e.g., smart contract wallets or account abstraction receivers requiring more than 2,300 gas).
* Transfer success is strictly validated:
  ```solidity
  (bool ok, ) = recipient.call{value: amount}("");
  if (!ok) revert NativeTransferFailed();
  ```
* Confirmed via `RejectingRecipient` in [TapToOwnArenaInvariants.t.sol](file:///c:/Monad-Project/MonadHack/test/TapToOwnArenaInvariants.t.sol).

---

## 3. Arithmetic Safety & Dust Accounting

* **Solidity 0.8.24:** Built-in overflow and underflow protection on all mathematical operations.
* **Lossless Curve Division:** In linear bonding curve operations, $q \times (q - 1)$ is always an even integer for any integer $q \ge 1$. Consequently, division by 2 is exact with **zero remainder**.
* **Dust Banking:** In dividend distribution, integer division residuals resulting from $\frac{\text{reward} \times 10^{18}}{S}$ are tracked and stored in `market.undistributedRewards`. No wei is ever trapped or lost.

---

## 4. Key Management & Credential Policy

* **No Hardcoded Keys:** No private keys, mnemonic seed phrases, or sensitive API credentials are stored in any source code, deployment scripts, or configuration files.
* **Environment Variable Injection:** Deployment and administrative scripts exclusively load credentials at runtime via secure environment variables (`PRIVATE_KEY`, `MONAD_RPC_URL`).

---

## 5. Automated Verification & Audit Disclaimer

> [!WARNING]
> **Audit Disclaimer:** This codebase has been thoroughly tested using automated unit, integration, invariant, and property-based fuzz testing (Foundry, 66 tests passing, 256 fuzz runs, and a 40-wallet concurrency benchmark). **No formal external audit by a third-party commercial cybersecurity firm has been conducted.** Deployments on public testnets are for demonstration purposes only.
