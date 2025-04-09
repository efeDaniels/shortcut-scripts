type PoolData = {
  symbol: string;
  tvl: number;
  fees: number;
  volume: number;
  rewards: number;
  rewardsToTVL: number;
  rewardsToFees: number;
  rewardsToVolume: number;
  classification: number;
  bveEnabled: boolean;
};

type Weights = {
  fees: number;
  tvl: number;
  volume: number;
  rewardsToTVL: number;
  rewardsToFees: number;
  rewardsToVolume: number;
};

type SafetyThresholds = {
  minTVL: number;
  minVolume: number;
  minFees: number;
  minRewards: number;
};

type PoolMultiplierMap = Record<string, number>;

type RewardAllocations = {
  bveTokenTotal: number;
  usdcTotal: number;
};

export async function fetchEpochData(epoch: number): Promise<PoolData[]> {
  const API_URL = `https://prod-api.lynex.fi/tracking/snapshot/epoch/${epoch}`;
  const response = await fetch(API_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const json = await response.json();
  const pools = json.pools.filter(
    (p: any) => p.gaugeAlive && p.gaugeRewardPerEpochUsd > 0
  );

  return pools.map((p: any) => ({
    symbol: `${p.symbol} ${p.title}`,
    tvl: p.tvl || 0,
    fees: p.gaugeFeeInUsd || 0,
    volume: p.volumeUsd || 0,
    rewards: p.gaugeRewardPerEpochUsd || 0,
    rewardsToTVL: p.tvl ? p.gaugeRewardPerEpochUsd / p.tvl : 0,
    rewardsToFees: p.gaugeFeeInUsd
      ? p.gaugeRewardPerEpochUsd / p.gaugeFeeInUsd
      : 0,
    rewardsToVolume: p.volumeUsd ? p.gaugeRewardPerEpochUsd / p.volumeUsd : 0,
    classification: 1,
    bveEnabled: true, // you can override from config manually
  }));
}

export function applySafetyThresholds(
  pools: PoolData[],
  thresholds: SafetyThresholds
): PoolData[] {
  return pools.map((pool) => {
    const safe =
      pool.tvl >= thresholds.minTVL &&
      pool.volume >= thresholds.minVolume &&
      pool.fees >= thresholds.minFees &&
      pool.rewards >= thresholds.minRewards;
    return { ...pool, classification: safe ? pool.classification : 0 };
  });
}

export function applyPoolMultipliers(
  pools: PoolData[],
  multipliers: PoolMultiplierMap
): PoolData[] {
  return pools.map((pool) => ({
    ...pool,
    classification:
      pool.classification !== 0 ? multipliers[pool.symbol] ?? 1 : 0,
  }));
}

export function calculateVotingWeights(
  pools: PoolData[],
  weights: Weights,
  allocations?: RewardAllocations
): {
  symbol: string;
  score: number;
  votingWeight: number;
  bveTokenAllocation?: number;
  usdcAllocation?: number;
}[] {
  const eligible = pools.filter((p) => p.classification > 0 && p.bveEnabled);

  const normalize = (arr: number[]) => {
    const valid = arr.filter((v) => v > 0);
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    return arr.map((v) =>
      max !== min ? (v > 0 ? (v - min) / (max - min) : 0) : v === 0 ? 0 : 1
    );
  };

  const tvls = normalize(eligible.map((p) => p.tvl));
  const fees = normalize(eligible.map((p) => p.fees));
  const volumes = normalize(eligible.map((p) => p.volume));
  const rTVL = normalize(eligible.map((p) => p.rewardsToTVL));
  const rFees = normalize(eligible.map((p) => p.rewardsToFees));
  const rVolume = normalize(eligible.map((p) => p.rewardsToVolume));

  const rawScores = eligible.map(
    (p, i) =>
      fees[i] * weights.fees +
      tvls[i] * weights.tvl +
      volumes[i] * weights.volume +
      rTVL[i] * weights.rewardsToTVL +
      rFees[i] * weights.rewardsToFees +
      rVolume[i] * weights.rewardsToVolume
  );

  const incClassifiedScores = rawScores.map(
    (s, i) => s * eligible[i].classification
  );

  const total = incClassifiedScores.reduce((sum, s) => sum + s, 0);
  const votingWeights = incClassifiedScores.map((s) =>
    total !== 0 ? s / total : 0
  );

  const lookup = Object.fromEntries(
    eligible.map((p, i) => [
      p.symbol,
      { score: incClassifiedScores[i], votingWeight: votingWeights[i] },
    ])
  );

  return pools.map((p) => {
    const match = lookup[p.symbol];
    return {
      symbol: p.symbol,
      score: match ? +match.score.toFixed(6) : 0,
      votingWeight: match ? +match.votingWeight.toFixed(6) : 0,
      bveTokenAllocation: match
        ? match.votingWeight * (allocations?.bveTokenTotal ?? 0)
        : 0,
      usdcAllocation: match
        ? match.votingWeight * (allocations?.usdcTotal ?? 0)
        : 0,
    };
  });
}

// Example usage
(async () => {
  const epoch = 60;
  const weights: Weights = {
    fees: 0.6,
    tvl: 0.2,
    volume: 0.05,
    rewardsToTVL: 0.05,
    rewardsToFees: 0.1,
    rewardsToVolume: 0,
  };

  const safetyThresholds: SafetyThresholds = {
    minTVL: 10000,
    minVolume: 10000,
    minFees: 100,
    minRewards: 100,
  };

  const rewardAllocations: RewardAllocations = {
    bveTokenTotal: 1000000,
    usdcTotal: 0,
  };

  const multipliers: PoolMultiplierMap = {
    "USDC/LYNX Classic Volatile": 0,
    "USDC/WETH Classic Volatile": 0,
    "USDT/WETH Classic Volatile": 0,
    "USDC/USDT Classic Stable": 1,
    "STONE/WETH Classic Stable": 0,
    "wstETH/WETH Classic Stable": 0,
    "USDC/USD+ Classic Stable": 0,
    "USDT+/USDT Classic Stable": 0,
    "USDC/DUSD Classic Stable": 0,
    "USDC/MAI Classic Stable": 0.5,
    "USDT+/USD+ Classic Stable": 0,
    "USDC/USDT Classic Volatile": 0,
    "LYNX/WETH Classic Volatile": 0.3,
    "MATIC/WETH Classic Volatile": 0,
    "USDC/LYNX Classic Stable": 0,
    "WBTC/WETH Classic Volatile": 0,
    "wstETH/WETH Classic Volatile": 0,
    "LUCIA/WETH Classic Volatile": 0,
    "oLYNX/WETH Classic Volatile": 0,
    "XRGB/WETH Classic Volatile": 0,
    "axlLqdr/WETH Classic Volatile": 0,
    "USDC/MENDI Classic Volatile": 1,
    "USDC/NDX_2412 Classic Volatile": 0,
    "USDC/iNDX_2412 Classic Volatile": 0,
    "LYNX/WETH Classic Stable": 0,
    "USDC/A3A Classic Volatile": 0,
    "wDAI/USDC Classic Stable": 1,
    "LYNX/oLYNX Classic Volatile": 0,
    "MENDI/WETH Classic Volatile": 0,
    "USDT/WETH Classic Stable": 0,
    "LINUS/WETH Classic Volatile": 0.5,
    "LYNX/WBTC Classic Volatile": 0,
    "FOXY/WETH Classic Volatile": 0,
    "FOXY/WETH Classic Stable": 0,
    "ezETH/WETH Classic Stable": 0,
    "LYNX/WBTC Classic Stable": 0,
    "ZERO/WETH Classic Volatile": 0,
    "FLY/USD+ Classic Volatile": 0,
    "QI/WETH Classic Volatile": 0,
    "WBTC/SolvBTC.m Classic Stable": 1,
    "FAITH/WETH Classic Volatile": 0,
    "WBTC/M-BTC Classic Stable": 0,
    "M-BTC/WETH Classic Volatile": 0,
    "SolvBTC.m/M-BTC Classic Stable": 0,
    "LYNX/oLYNX Classic Stable": 0,
    "USDC/USDe Classic Stable": 0,
    "FLY/WETH Classic Volatile": 0,
    "WEF/WETH Classic Volatile": 0,
    "BULL/WETH Classic Volatile": 0,
    "USDC/eUSD Classic Stable": 1,
    "HOTDOG/WETH Classic Volatile": 0.5,
    "alUSD/USDC Classic Stable": 0.5,
    "alETH/WETH Classic Stable": 1,
    "RYZE/WETH Classic Volatile": 1,
    "WETH/DTC Classic Volatile": 0,
    "IBEX/WETH Classic Volatile": 0,
    "LPUSS/WETH Classic Volatile": 0,
    "DGAF/WETH Classic Volatile": 0,
    "WBTC/WETH Gamma (Narrow)": 1,
    "USDT/WETH Gamma (Narrow)": 1,
    "USDC/WETH Gamma (Narrow)": 1,
    "MATIC/WETH Gamma (Narrow)": 0,
    "USDC/LYNX Gamma (Wide)": 1,
    "CROAK/WETH Gamma (Wide)": 0,
    "USDC/WBTC Gamma (Narrow)": 1,
    "wstETH/WETH Gamma (Correlated)": 1.25,
    "STONE/WETH Gamma (Correlated)": 1,
    "ezETH/WETH Gamma (Correlated)": 1,
    "uniETH/WETH Gamma (Correlated)": 1,
    "weETH/WETH Gamma (Correlated)": 1,
    "inETH/wstETH Gamma (Correlated)": 1,
    "NWG/WETH Gamma (Wide)": 0,
    "PEPE/WETH Gamma (Wide)": 0,
    "USDC/WETH Gamma (Long-Short)": 1,
    "WBTC/WETH Single Deposit (wBTC)": 1,
    "LYNX/WETH Single Deposit (WETH)": 3,
    "USDC/LYNX Single Deposit (USDC)": 3,
    "LYNX/WBTC Single Deposit (wBTC)": 3,
    "LYNX/USDT Single Deposit (USDT)": 3,
    "LYNX/STONE Single Deposit (STONE)": 1.5,
    "FOXY/WETH Single Deposit (WETH)": 1,
    "FOXY/WETH Single Deposit (FOXY)": 0,
    "ZERO/WETH Single Deposit (WETH)": 1,
    "MENDI/WETH Single Deposit (WETH)": 1,
    "WBTC/aBTC Single Deposit (aBTC)": 0.5,
    "WBTC/aBTC Single Deposit (wBTC)": 0,
    "USDC/USDT Steer (Stable)": 1,
    "USDC/EURO3 Steer (Stable)": 0,
    "USDT/WETH Steer (Classic Rebalance)": 1,
    "USDC/WETH Steer (High Low Channel)": 1,
    "WBTC/WETH Steer (Elastic Expansion)": 1,
    "SolvBTC.m/WETH Steer (Classic Rebalance)": 0.5,
    "ankrETH/ANKR Steer (Classic Rebalance)": 0,
    "ankrETH/wstETH Steer (Classic Rebalance)": 0.5,
    "USDC/DAI DefiEdge (Stable)": 0,
    "DOGE/WETH DefiEdge (Volatile)": 0,
    "DAI/WETH DefiEdge (Volatile)": 0,
    "SHIB/WETH DefiEdge (Volatile)": 0,
    "USDC/USDT Clip (Tight)": 0,
    "USDC/WETH Clip (Dynamic)": 0,
    "CLIP/WETH Clip (Narrow)": 0,
    "CLIP/WETH Clip (Wide)": 0,
    "WETH/SOULS Clip (Wide)": 0,
    "USDC/DAI Clip (Stable)": 0,
    "DAI/WETH Clip (Volatile)": 0,
    "LLL/WETH Clip (Wide)": 0,
    "APE/WETH Classic Volatile": 0,
    "LYNX/abcLYNX Classic Stable": 0,
    "LYNX/LPUSS Classic Volatile": 1,
  };

  let pools = await fetchEpochData(epoch);
  pools = applyPoolMultipliers(pools, multipliers);
  pools = applySafetyThresholds(pools, safetyThresholds);
  const results = calculateVotingWeights(
    pools,
    weights,
    rewardAllocations
  ).sort((a, b) => b.votingWeight - a.votingWeight);

  results
    .slice(0, 20)
    .forEach((p) =>
      console.log(
        `${p.symbol.padEnd(40)} Score: ${p.score.toFixed(4)}  Weight: ${(
          p.votingWeight * 100
        ).toFixed(2)}%  bve: ${p.bveTokenAllocation?.toFixed(2)}`
      )
    );
})();
