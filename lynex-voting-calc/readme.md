## Lynex Voting Weight Calculation Script – Documentation

This script computes the voting weights and bveToken allocations for liquidity pools during a given epoch based on API data from the Lynex platform. It replicates logic from the internal Excel model used in the TLDR tab.

---

### 1. Data Structures

#### PoolData
```ts
type PoolData = {
  symbol: string;
  tvl: number;                   // Total value locked in USD
  fees: number;                  // Total trading fees earned during the epoch
  volume: number;               // Trade volume in USD
  rewards: number;              // Gauge rewards in USD
  rewardsToTVL: number;         // rewards / tvl
  rewardsToFees: number;        // rewards / fees
  rewardsToVolume: number;      // rewards / volume
  classification: number;       // Pool multiplier (0 = excluded)
  bveEnabled: boolean;          // Whether pool is eligible for bveToken rewards
};
```

#### Weights
Used to tune score weighting across metrics.

```ts
type Weights = {
  fees: number;
  tvl: number;
  volume: number;
  rewardsToTVL: number;
  rewardsToFees: number;
  rewardsToVolume: number;
};
```

#### SafetyThresholds
Pools below these thresholds are excluded (set `classification = 0`).

```ts
type SafetyThresholds = {
  minTVL: number;
  minVolume: number;
  minFees: number;
  minRewards: number;
};
```

#### PoolMultiplierMap
Maps pool symbols to custom classification multipliers from the sheet.

```ts
type PoolMultiplierMap = Record<string, number>;
```

#### RewardAllocations
Total amounts to distribute across bveToken and USDC allocations.

```ts
type RewardAllocations = {
  bveTokenTotal: number;
  usdcTotal: number;
};
```

---

### 2. Functions

#### fetchEpochData(epoch)
Pulls JSON data from the Lynex API for a specific epoch and parses it into `PoolData[]`.

#### applySafetyThresholds(pools, thresholds)
Disables pools by setting classification to 0 if they fall below any of the provided safety thresholds.

#### applyPoolMultipliers(pools, multipliers)
Applies per-pool classification multipliers from the sheet (e.g., 1.0 for normal, 0.5 for long tail, 3.0 for core).

#### calculateVotingWeights(pools, weights, allocations?)
1. Filters to pools with `classification > 0` and `bveEnabled == true`
2. Normalizes metrics individually using a min-max formula (ignoring zeroes)
3. Applies weighted scoring across all metrics
4. Multiplies scores by `classification`
5. Converts scores into proportional voting weights
6. Optionally multiplies voting weights by reward allocation totals to derive token values

---

### 3. Output

Each pool result contains:
- `symbol`: Pool name
- `score`: Weighted score (post-classification)
- `votingWeight`: Normalized voting power for that pool
- `bveTokenAllocation`: Proportional bveToken amount (if provided)
- `usdcAllocation`: Proportional USDC reward (if provided)

---

### 4. Matching Sheet Behavior

The script matches Excel by:
- Excluding non-qualified pools from normalization
- Using same normalization logic as Excel's `=(value - min)/(max - min)`
- Applying multipliers **after** threshold screening
- Only scoring pools with both bve eligibility and classification > 0

