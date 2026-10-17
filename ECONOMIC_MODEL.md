# Economic & Mathematical Model - Tap-to-Own Arena

## 1. Overview & Vision

**Tap-to-Own Arena** is an on-chain, gamified micro-share marketplace tokenizing four culturally resonant real-world assets (RWAs):

1. **Café Montaña Dorada** (Specialty Coffee Micro-Lot)
2. **Café Volcán Rojo** (High-Altitude Volcanic Harvest)
3. **Arte Urbano Medellín** (Comuna 13 Landmark Mural)
4. **Local Genesis** (Flagship Specialty Coffee Lounge)

Each asset operates as an **independent on-chain market** with a strict circulating supply cap of **1,000 micro-shares**, backed by an autonomous mathematical bonding curve and an $O(1)$ dividend distribution engine on **Monad**.

> [!NOTE]
> **Legal Disclaimer:** These micro-shares are virtual gamified digital units for demonstration purposes. They do not confer legal ownership, equity, or property rights over physical farms, real estate, businesses, or murals.

---

## 2. Mathematical Bonding Curve

### 2.1 Marginal Price Function
The marginal price $P(s)$ of the next share when the circulating supply is $s$ is governed by a linear bonding curve:

$$P(s) = B + K \times s$$

Where:
* $B$: Initial base price in wei (at $s = 0$).
* $K$: Price increment slope in wei per share.
* $s$: Current circulating supply ($0 \le s < 1000$).

#### Market Parameters:
| ID | Market Name | Cap Máx | Base Price ($B$) | Slope ($K$) | P(0) | P(1000) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **0** | **Café Montaña Dorada** | 1.000 | 0.001 MON | 0.00005 MON | 0.0010 MON | 0.0510 MON |
| **1** | **Café Volcán Rojo** | 1.000 | 0.0015 MON | 0.00008 MON | 0.0015 MON | 0.0815 MON |
| **2** | **Arte Urbano Medellín** | 1.000 | 0.0008 MON | 0.00004 MON | 0.0008 MON | 0.0408 MON |
| **3** | **Local Genesis** | 1.000 | 0.0020 MON | 0.00010 MON | 0.0020 MON | 0.1020 MON |

---

### 2.2 Cost of Buying $q$ Units ($C_{buy}$)
The gross cost to mint/acquire $q$ shares starting from a circulating supply $S$ is the discrete integral under the curve:

$$C_{buy}(S, q) = \sum_{i=S}^{S+q-1} (B + K \cdot i) = q \cdot B + K \cdot \left[ q \cdot S + \frac{q \cdot (q - 1)}{2} \right]$$

* **Lossless Integer Arithmetic:** Since $q \times (q - 1)$ is always an even integer for any natural number $q$, the division by 2 produces zero rounding truncation in Solidity.
* **Price Impact:** Buying increases the circulating supply to $S + q$, monotonically increasing the marginal price for subsequent purchases.

---

### 2.3 Gross Proceeds of Selling $q$ Units ($C_{sell}$)
When liquidating $q$ shares from a circulating supply $S$, the shares from $S - q$ to $S - 1$ are returned to the reserve:

$$C_{sell}(S, q) = \sum_{i=S-q}^{S-1} (B + K \cdot i) = q \cdot B + K \cdot \left[ q \cdot (S - q) + \frac{q \cdot (q - 1)}{2} \right]$$

### 2.4 Mathematical Symmetry Proof
The curve is 100% symmetric:

$$C_{buy}(S - q, q) \equiv C_{sell}(S, q)$$

The exact capital required to advance supply from $S - q$ to $S$ is identical to the gross capital released when burning supply from $S$ back to $S - q$.

---

## 3. Fee Structure & Dividend Distribution

### 3.1 Base Fees (Configurable, Default 2.0%)
* **Buy Fee:** 2.0% (`200 BPS`) of $C_{buy}$.
* **Sell / Exit Fee:** 2.0% (`200 BPS`) of $C_{sell}$.
* **Fee Allocation Policy:**
  * **80% (1.6% net):** Participant Dividend Pool, shared proportionally among current holders.
  * **20% (0.4% net):** Maintenance Fund, allocated to protocol infrastructure and operations.

### 3.2 $O(1)$ Scaled Dividend Accumulator
To prevent gas exhaustion on high-throughput networks like Monad, dividends are tracked using a global accumulator index:

$$\Delta \text{accRewardPerShare} = \frac{\text{participantReward} \times 10^{18}}{S}$$

#### Pending Rewards Formula:
$$\text{Pending}(wallet) = \frac{\text{shares}(wallet) \times \text{accRewardPerShare}}{10^{18}} - \text{rewardDebt}(wallet) + \text{unclaimed}(wallet)$$

* **No Past Dilution:** Newly acquired shares update `rewardDebt` at the *new* rate, ensuring they never receive dividends distributed before their acquisition.
* **Diamond Hands Rewarded:** When a participant liquidates shares, the exit fee is injected into the remaining $S - q$ shares.

---

## 4. Burning & Recirculation Mechanics

```
               [ User Buys q shares ]
                       │
                       ▼
       Supply increases: S ──> S + q (Price rises)
                       │
               [ User Sells q shares ]
                       │
                       ▼
       Supply decreases: S + q ──> S (Shares burned)
                       │
                       ▼
       Capacity released: 1,000 - S slots open again
```

* **Dynamic Liquidity:** Liquidated shares are burned from `circulatingSupply`.
* **Cap Preservation:** The 1,000 limit represents the maximum *simultaneous* circulating shares. Liquidated shares re-open headroom for subsequent buyers.
* **Symmetric Re-entry:** The marginal price steps down predictably, allowing new participants to buy back in at the lower curve price.

---

## 5. Solvency Invariant

At all times, the contract's actual balance must strictly satisfy:

$$\text{Contract Balance} \ge \sum_{i=0}^3 \text{Reserve}_i + \sum_{i=0}^3 \text{UnclaimedRewards}_i + \sum_{i=0}^3 \text{UndistributedDust}_i + \text{MaintenanceFund}$$

* **Solvency Guarantee:** The locked reserve $\text{Reserve}_i$ always equals $C_{sell}(S_i, S_i)$, fully backing a simultaneous 100% liquidation of all circulating shares.
