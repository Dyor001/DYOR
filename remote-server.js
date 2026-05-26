const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const WHITELIST_SESSION_COOKIE = 'dyor_wl_session';
const WHITELIST_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const whitelistSessions = new Map();
const PORTFOLIO_MIN_VISIBLE_USD = 10;
const PORTFOLIO_FUND_SOURCE_MIN_USD = 10;
const FUND_ASSET_MIN_VISIBLE_USD = 10;
const RESISTANCE_LEVEL_NAMES = ['近端压力', '关键压力', '强压力'];
const SUPPORT_LEVEL_NAMES = ['近端支撑', '关键支撑', '强支撑'];

// 币安 API 配置
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;
const BASE_URL = 'https://api.binance.com';
const BINANCE_FUTURES_BASE_URL = 'https://fapi.binance.com';
const WEB3_API_BASE = 'https://web3.binance.com';
const BINANCE_ALPHA_BASE_URL = 'https://www.binance.com';
const OPENNEWS_API_BASE = process.env.OPENNEWS_API_BASE || 'https://ai.6551.io';
const OPENNEWS_WSS_URL = process.env.OPENNEWS_WSS_URL || 'wss://ai.6551.io/open/news_wss';
const OPENNEWS_TOKEN = process.env.OPENNEWS_TOKEN;
const OPENNEWS_LISTING_INTERVAL_MS = Number(process.env.OPENNEWS_LISTING_INTERVAL_MS || 60 * 60 * 1000);
const TWITTERAPI_IO_KEY = process.env.TWITTERAPI_IO_KEY;
const BINANCE_ALPHA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 配置文件路径
const ALPHA_HOLDINGS_PATH = path.join(__dirname, 'alpha-holdings.json');
const VIEW_KEYS_PATH = path.join(__dirname, 'view-keys.json');
const WHITELIST_PATH = path.join(__dirname, 'whitelist.json');
const LINKAGE_WHITELIST_PATH = path.join(__dirname, 'linkage-whitelist.json');
const WALLET_WHITELIST_PATH = path.join(__dirname, 'wallet-whitelist.json');
const INVESTORS_PATH = path.join(__dirname, 'investors.json');
const FUND_CONFIG_PATH = path.join(__dirname, 'fund-config.json');
const POSITION_PLANS_PATH = path.join(__dirname, 'position-plans.json');
const THINKTANK_POSTS_PATH = path.join(__dirname, 'thinktank-posts.json');
const NAV_HISTORY_PATH = path.join(__dirname, 'nav-history.json');
const ASSET_SNAPSHOTS_PATH = path.join(__dirname, 'asset-snapshots.json');
const DOWNLOADS_PATH = path.join(__dirname, 'downloads.json');
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');
const LINKAGE_PATH = path.join(__dirname, 'linkage-data.json');
const LISTING_SIGNALS_PATH = path.join(__dirname, 'listing-signals.json');
const CONTACT_CONFIG_PATH = path.join(__dirname, 'contact-config.json');
const PORTFOLIO_MANAGER_PATH = path.join(__dirname, 'portfolio-manager.json');
const WALLET_TOKEN_BASELINE_PATH = path.join(__dirname, 'wallet-token-baseline.json');
const WALLET_HOLDINGS_SNAPSHOT_PATH = path.join(__dirname, 'wallet-holdings-snapshot.json');
const WALLET_WATCH_PATH = path.join(__dirname, 'wallet-watch.json');
const WALLET_WATCH_SNAPSHOT_PATH = path.join(__dirname, 'wallet-watch-snapshots.json');
const KOL_SIGNALS_PATH = path.join(__dirname, 'kol-signals.json');
const KOL_SIGNAL_FEED_PATH = path.join(__dirname, 'kol-signal-feed.json');
const HUNTER_CONFIG_PATH = path.join(__dirname, 'hunter-config.json');
const HUNTER_CACHE_PATH = path.join(__dirname, 'hunter-signals-cache.json');
const HUNTER_HEALTH_PATH = path.join(__dirname, 'hunter-health.json');
const HUNTER_PUSH_FEED_PATH = path.join(__dirname, 'hunter-push-feed.json');
const HUNTER_STATE_PATH = path.join(__dirname, 'hunter-state.json');
const UNISWAP_V4_INITIALIZE_TOPIC = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const UNISWAP_V4_POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90';
const UNISWAP_V4_CHAINS = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    chainId: 1,
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    rpcUrl: process.env.V4_ETH_RPC_URL || 'https://rpc.ankr.com/eth',
    fallbackRpcUrls: [
      process.env.V4_ETH_RPC_URL,
      'https://ethereum-rpc.publicnode.com',
      'https://eth.llamarpc.com',
      'https://1rpc.io/eth'
    ].filter(Boolean),
    explorer: 'https://etherscan.io'
  },
  {
    id: 'base',
    name: 'Base',
    chainId: 8453,
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    rpcUrl: process.env.V4_BASE_RPC_URL || 'https://mainnet.base.org',
    fallbackRpcUrls: [
      process.env.V4_BASE_RPC_URL,
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
      'https://base.llamarpc.com'
    ].filter(Boolean),
    explorer: 'https://basescan.org'
  },
];
const V4_MAJOR_TOKENS = {
  ethereum: {
    '0x0000000000000000000000000000000000000000': 'ETH',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT'
  },
  base: {
    '0x0000000000000000000000000000000000000000': 'ETH',
    '0x4200000000000000000000000000000000000006': 'WETH',
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC'
  }
};

// 基金配置
const DEFAULT_FUND_CONFIG = {
  totalShares: 4981.888266,
  initialNav: 1.0,
  stageCap: 70000,
  totalBurned: 0
};
const FUND_CONFIG = DEFAULT_FUND_CONFIG;
const execFileAsync = promisify(execFile);
const STABLE_COIN_SYMBOLS = new Set([
  'USDT', 'USDC', 'FDUSD', 'USDS', 'DAI', 'BUSD', 'TUSD', 'USDP',
  'BFUSD', 'USD1', 'USDE', 'USDD', 'PYUSD', 'GUSD', 'LUSD', 'FRAX'
]);
const HUNTER_DEFAULT_CONFIG = {
  scoreThreshold: 5.0,
  maxExitRate: 75,
  minSamplePerHour: 8,
  pushTopN: 3
};
const HUNTER_SOURCE_LABEL = 'DYOR Sentinels (Spot + Alpha)';
const HUNTER_CHAINS = [
  { chainId: 'CT_501', chain: 'SOL' },
  { chainId: '56', chain: 'BSC' }
];

function isStableCoinSymbol(symbol) {
  return STABLE_COIN_SYMBOLS.has(String(symbol || '').toUpperCase().trim());
}

const COMMUNITY_ONCHAIN_WALLETS = {
  evmAddress: '0xcd2234ef8bf29d8349e98474f967aa8eda924024',
  solAddress: '8uPkZ3Tx8hXUrpBxZkyMRUcohFVMvmaSG4LVR1L6KC6p',
  evmChains: [
    { chainId: '56', activeChainId: '56', chainKey: 'bsc', chainName: 'BSC', symbol: 'BNB', priceSymbol: 'BNBUSDT', rpcUrl: 'https://bsc-dataseed.binance.org' },
    { chainId: '1', activeChainId: '1', chainKey: 'eth', chainName: 'Ethereum', symbol: 'ETH', priceSymbol: 'ETHUSDT', rpcUrl: 'https://eth.llamarpc.com' },
    { chainId: '8453', activeChainId: '8453', chainKey: 'base', chainName: 'Base', symbol: 'ETH', priceSymbol: 'ETHUSDT', rpcUrl: 'https://mainnet.base.org' }
  ],
  solChain: { chainId: '501', activeChainId: 'CT_501', chainKey: 'solana', chainName: 'Solana', symbol: 'SOL', priceSymbol: 'SOLUSDT', rpcUrl: 'https://api.mainnet-beta.solana.com' }
};

const alphaApiCache = {
  tokenList: { expiresAt: 0, data: null },
  exchangeInfo: { expiresAt: 0, data: null },
  symbolMap: { expiresAt: 0, data: null }
};

const futuresApiCache = {
  exchangeInfo: { expiresAt: 0, data: null },
  symbolSet: { expiresAt: 0, data: null }
};

const externalMetricCache = {
  lienfi: { expiresAt: 0, data: null }
};

function toNumberSafe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatBawTokenAmount(rawAmount, decimals) {
  const amount = toNumberSafe(rawAmount, 0);
  const precision = Math.max(0, Math.min(18, toNumberSafe(decimals, 18)));
  if (precision <= 0) return amount;
  return amount / (10 ** precision);
}

function stripHexZeroAddress(topic) {
  const value = String(topic || '').toLowerCase();
  if (!value.startsWith('0x') || value.length < 42) return '';
  return `0x${value.slice(-40)}`;
}

function decodeUint256Word(data, index) {
  const clean = String(data || '').replace(/^0x/, '');
  const word = clean.slice(index * 64, (index + 1) * 64);
  if (!word) return 0n;
  return BigInt(`0x${word}`);
}

function decodeSignedInt(value, bits = 24) {
  const max = 1n << BigInt(bits);
  const half = 1n << BigInt(bits - 1);
  const normalized = value & (max - 1n);
  return Number(normalized >= half ? normalized - max : normalized);
}

async function rpcCall(rpcUrl, method, params = []) {
  const response = await axios.post(
    rpcUrl,
    { jsonrpc: '2.0', id: Date.now(), method, params },
    { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
  );
  if (response.data?.error) {
    throw new Error(response.data.error.message || 'rpc error');
  }
  return response.data?.result;
}

function decodeUniswapV4InitializeLog(log, chain) {
  const data = String(log.data || '0x');
  const currency0 = stripHexZeroAddress(log.topics?.[2]);
  const currency1 = stripHexZeroAddress(log.topics?.[3]);
  const fee = Number(decodeUint256Word(data, 0));
  const tickSpacing = decodeSignedInt(decodeUint256Word(data, 1), 24);
  const hooks = stripHexZeroAddress(`0x${decodeUint256Word(data, 2).toString(16).padStart(64, '0')}`);
  const sqrtPriceX96 = decodeUint256Word(data, 3).toString();
  const tick = decodeSignedInt(decodeUint256Word(data, 4), 24);
  const hasHook = hooks && hooks !== '0x0000000000000000000000000000000000000000';
  return {
    chainId: chain.id,
    chainName: chain.name,
    poolId: String(log.topics?.[1] || ''),
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
    hasHook,
    sqrtPriceX96,
    tick,
    blockNumber: parseInt(String(log.blockNumber || '0x0'), 16),
    transactionHash: log.transactionHash,
    logIndex: parseInt(String(log.logIndex || '0x0'), 16),
    explorerUrl: `${chain.explorer}/tx/${log.transactionHash}`
  };
}

function enrichUniswapV4Pools(pools = []) {
  const hookCounts = {};
  for (const pool of pools) {
    if (!pool.hasHook) continue;
    const hook = String(pool.hooks || '').toLowerCase();
    hookCounts[hook] = (hookCounts[hook] || 0) + 1;
  }
  return pools.map(pool => {
    const majors = V4_MAJOR_TOKENS[pool.chainId] || {};
    const currency0Label = majors[String(pool.currency0 || '').toLowerCase()] || '';
    const currency1Label = majors[String(pool.currency1 || '').toLowerCase()] || '';
    const majorLabels = [currency0Label, currency1Label].filter(Boolean);
    const projectToken = !currency0Label && currency1Label
      ? pool.currency0
      : (currency0Label && !currency1Label ? pool.currency1 : '');
    const projectTokenSide = projectToken === pool.currency0 ? 'currency0' : (projectToken === pool.currency1 ? 'currency1' : '');
    const projectTokenConfidence = projectToken
      ? 'high'
      : (!currency0Label && !currency1Label ? 'unknown-no-major-pair' : 'unknown-both-major');
    const hookCount = pool.hasHook ? (hookCounts[String(pool.hooks || '').toLowerCase()] || 0) : 0;
    const reasons = [];
    const risks = [];
    let score = 0;

    if (pool.hasHook) {
      score += 45;
      reasons.push('自定义 Hook 池');
    } else {
      risks.push('默认池，非 Hook 项目');
    }
    if (majorLabels.length) {
      score += 25;
      reasons.push(`主流资产配对：${majorLabels.join('/')}`);
    } else {
      risks.push('未识别主流资产配对');
    }
    if (hookCount >= 3) {
      score += 20;
      reasons.push(`同 Hook 近期创建 ${hookCount} 个池`);
    } else if (hookCount === 2) {
      score += 12;
      reasons.push('同 Hook 近期重复出现');
    }
    if ([100, 500, 3000, 10000].includes(Number(pool.fee))) {
      score += 8;
      reasons.push('常规费率');
    } else if (Number(pool.fee) > 100000) {
      score -= 10;
      risks.push('费率异常偏高');
    }
    if (Math.abs(Number(pool.tickSpacing || 0)) > 10000) {
      score -= 8;
      risks.push('tickSpacing 异常偏大');
    }
    const priority = score >= 75 ? 'A' : score >= 50 ? 'B' : score >= 25 ? 'C' : 'D';
    return {
      ...pool,
      currency0Label,
      currency1Label,
      majorPair: majorLabels.join('/'),
      projectToken,
      projectTokenSide,
      projectTokenConfidence,
      hookCount,
      score,
      priority,
      reasons,
      risks
    };
  });
}

async function fetchUniswapV4InitializeLogs(chain, blockWindow = 5000) {
  const rpcUrls = Array.from(new Set([chain.rpcUrl, ...(chain.fallbackRpcUrls || [])].filter(Boolean)));
  const errors = [];
  for (const rpcUrl of rpcUrls) {
    try {
      const latestHex = await rpcCall(rpcUrl, 'eth_blockNumber');
      const latest = parseInt(latestHex, 16);
      const safeWindow = Math.max(1, Math.min(50000, Number(blockWindow || 5000)));
      const fromBlock = Math.max(0, latest - safeWindow);
      const logs = [];
      const chunkSize = Math.max(100, Math.min(2000, Number(chain.logChunkSize || 1500)));
      for (let start = fromBlock; start <= latest; start += chunkSize) {
        const end = Math.min(latest, start + chunkSize - 1);
        const chunkLogs = await rpcCall(rpcUrl, 'eth_getLogs', [{
          address: chain.poolManager || UNISWAP_V4_POOL_MANAGER,
          fromBlock: `0x${start.toString(16)}`,
          toBlock: `0x${end.toString(16)}`,
          topics: [UNISWAP_V4_INITIALIZE_TOPIC]
        }]);
        logs.push(...(Array.isArray(chunkLogs) ? chunkLogs : []));
      }
      return {
        chain: chain.id,
        poolManager: chain.poolManager || UNISWAP_V4_POOL_MANAGER,
        rpcUrl,
        latestBlock: latest,
        fromBlock,
        rows: logs.map(log => decodeUniswapV4InitializeLog(log, chain))
      };
    } catch (error) {
      errors.push(`${rpcUrl}: ${error.message}`);
    }
  }
  throw new Error(`All RPCs failed: ${errors.join(' | ')}`);
}

async function runBawJson(args = [], timeoutMs = 25000) {
  const finalArgs = [...args];
  if (!finalArgs.includes('--json')) finalArgs.push('--json');
  const { stdout } = await execFileAsync('baw', finalArgs, {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(String(stdout || '{}'));
  if (!parsed || parsed.success !== true) {
    throw new Error(parsed?.error || 'baw returned unsuccessful response');
  }
  return parsed;
}

async function safeRunBaw(args = [], timeoutMs = 25000) {
  try {
    return { ok: true, result: await runBawJson(args, timeoutMs) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function hexWeiToAmount(hexValue, decimals = 18) {
  const raw = String(hexValue || '0x0');
  const wei = BigInt(raw);
  return Number(wei) / (10 ** decimals);
}

async function postJsonRpc(rpcUrl, payload, timeoutMs = 15000) {
  const response = await axios.post(rpcUrl, payload, {
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' }
  });
  if (response.data?.error) {
    throw new Error(response.data.error.message || 'rpc error');
  }
  return response.data?.result;
}

async function getEvmNativeBalance(chain, address, prices = {}) {
  const result = await postJsonRpc(chain.rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: [address, 'latest']
  });
  const balance = hexWeiToAmount(result, 18);
  const price = toNumberSafe(prices[chain.priceSymbol], 0);
  return {
    symbol: chain.symbol,
    chainId: chain.chainId,
    chainName: chain.chainName,
    chainKey: chain.chainKey,
    balance,
    price,
    value: price > 0 ? balance * price : 0,
    tokenAddress: 'native',
    ownerAddress: address,
    isNative: true
  };
}

async function getSolNativeBalance(chain, address, prices = {}) {
  const result = await postJsonRpc(chain.rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [address]
  });
  const lamports = Number(result?.value || 0);
  const balance = lamports / 1e9;
  const price = toNumberSafe(prices[chain.priceSymbol], 0);
  return {
    symbol: chain.symbol,
    chainId: chain.chainId,
    chainName: chain.chainName,
    chainKey: chain.chainKey,
    balance,
    price,
    value: price > 0 ? balance * price : 0,
    tokenAddress: 'native',
    ownerAddress: address,
    isNative: true
  };
}

async function fetchBinanceWeb3ActivePositions(chain, address) {
  const response = await axios.get(
    `${WEB3_API_BASE}/bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list`,
    {
      timeout: 20000,
      headers: {
        'Accept-Encoding': 'identity',
        'User-Agent': 'binance-web3/1.1 (Skill)',
        'clienttype': 'web',
        'clientversion': '1.2.0'
      },
      params: {
        address,
        chainId: chain.activeChainId || chain.chainId,
        offset: 0
      }
    }
  );
  const list = response.data?.data?.list;
  if (!Array.isArray(list)) return [];
  return list
    .map(item => {
      const balance = toNumberSafe(item?.remainQty, 0);
      const price = toNumberSafe(item?.price, 0);
      const contractAddress = String(item?.contractAddress || '').trim();
      const isNative = contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        || contractAddress === 'So11111111111111111111111111111111111111111';
      return {
        symbol: String(item?.symbol || '').trim() || '-',
        name: String(item?.name || item?.symbol || '').trim() || '-',
        chainId: String(item?.chainId || chain.chainId || '').replace(/^CT_/, ''),
        rawChainId: String(item?.chainId || chain.activeChainId || chain.chainId || ''),
        chainName: chain.chainName,
        chainKey: chain.chainKey,
        balance,
        price,
        value: price > 0 ? balance * price : 0,
        tokenAddress: contractAddress || 'native',
        contractAddress: contractAddress || 'native',
        ownerAddress: address,
        isNative,
        riskLevel: item?.riskLevel || null,
        marketCap: toNumberSafe(item?.marketCap, null)
      };
    })
    .filter(item => item.symbol && item.balance > 0);
}

function buildWalletHoldingKey(item = {}) {
  return [
    String(item.chainId || item.rawChainId || '').trim(),
    String(item.contractAddress || item.tokenAddress || '').trim().toLowerCase(),
    String(item.symbol || '').trim().toUpperCase()
  ].join(':');
}

async function loadWalletHoldingSnapshot() {
  try {
    const raw = await fs.readFile(WALLET_HOLDINGS_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { holdings: {} };
  } catch (error) {
    return { holdings: {} };
  }
}

async function saveWalletHoldingSnapshot(holdings = {}) {
  const next = {
    updatedAt: new Date().toISOString(),
    holdings
  };
  await fs.writeFile(WALLET_HOLDINGS_SNAPSHOT_PATH, JSON.stringify(next, null, 2));
  return next;
}

function buildWalletPositionChanges(previous = {}, balances = []) {
  const changes = [];
  for (const item of balances) {
    const key = buildWalletHoldingKey(item);
    const prev = Number(previous?.[key]?.balance || 0);
    const curr = Number(item.balance || 0);
    const delta = curr - prev;
    if (Math.abs(delta) <= 1e-10) continue;
    if (prev === 0 && curr === 0) continue;
    changes.push({
      symbol: item.symbol,
      chainId: item.chainId,
      chainName: item.chainName,
      contractAddress: item.contractAddress,
      previousAmount: parseFloat(prev.toFixed(8)),
      currentAmount: parseFloat(curr.toFixed(8)),
      deltaAmount: parseFloat(delta.toFixed(8)),
      direction: delta >= 0 ? 'increase' : 'decrease',
      value: Number(item.value || 0)
    });
  }
  return changes
    .sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount))
    .slice(0, 12);
}

async function getCommunityOnchainTokenBalances(options = {}) {
  const updateSnapshot = Boolean(options.updateSnapshot);
  const warnings = [];
  const chains = [
    ...COMMUNITY_ONCHAIN_WALLETS.evmChains.map(chain => ({ chain, address: COMMUNITY_ONCHAIN_WALLETS.evmAddress })),
    { chain: COMMUNITY_ONCHAIN_WALLETS.solChain, address: COMMUNITY_ONCHAIN_WALLETS.solAddress }
  ];

  const results = await Promise.all(chains.map(({ chain, address }) => (
    fetchBinanceWeb3ActivePositions(chain, address)
      .catch(error => {
        warnings.push(`${chain.chainName}: ${error.message}`);
        return [];
      })
  )));

  const balances = results
    .flat()
    .filter(item => Number(item.value || 0) >= 1)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

  const previousSnapshot = await loadWalletHoldingSnapshot();
  const changes = buildWalletPositionChanges(previousSnapshot.holdings || {}, balances);

  if (updateSnapshot) {
    const nextHoldings = {};
    for (const item of balances) {
      nextHoldings[buildWalletHoldingKey(item)] = {
        symbol: item.symbol,
        chainId: item.chainId,
        chainName: item.chainName,
        contractAddress: item.contractAddress,
        balance: Number(item.balance || 0),
        value: Number(item.value || 0)
      };
    }
    await saveWalletHoldingSnapshot(nextHoldings);
  }

  return { balances, changes, warnings };
}

async function buildCommunityOnchainDashboard() {
  const { balances, changes, warnings } = await getCommunityOnchainTokenBalances({ updateSnapshot: true });

  return {
    success: true,
    timestamp: new Date().toISOString(),
    connected: true,
    mode: 'public-address-monitor',
    addresses: [
      {
        chainId: 'evm',
        chainName: 'EVM: BSC / ETH / Base',
        address: COMMUNITY_ONCHAIN_WALLETS.evmAddress
      },
      {
        chainId: COMMUNITY_ONCHAIN_WALLETS.solChain.chainId,
        chainName: 'Solana',
        address: COMMUNITY_ONCHAIN_WALLETS.solAddress
      }
    ],
    balances,
    recentTransactions: [],
    positionChanges: changes,
    quota: null,
    settings: null,
    warnings
  };
}

const WALLET_WATCH_CHAINS = [
  ...COMMUNITY_ONCHAIN_WALLETS.evmChains,
  COMMUNITY_ONCHAIN_WALLETS.solChain
];

function getWalletWatchChain(chainId) {
  const raw = String(chainId || '').trim().toLowerCase();
  if (!raw) return COMMUNITY_ONCHAIN_WALLETS.evmChains.find(chain => chain.chainId === '8453');
  return WALLET_WATCH_CHAINS.find(chain => (
    String(chain.chainId || '').toLowerCase() === raw
    || String(chain.activeChainId || '').toLowerCase() === raw
    || String(chain.chainKey || '').toLowerCase() === raw
    || String(chain.chainName || '').toLowerCase() === raw
  )) || COMMUNITY_ONCHAIN_WALLETS.evmChains.find(chain => chain.chainId === '8453');
}

function normalizeWalletWatchItem(item = {}, index = 0) {
  const chain = getWalletWatchChain(item.chainId || item.chainKey || item.chainName);
  const address = String(item.address || '').trim();
  const rawMinValue = Number(item.minValueUsd ?? item.minValue ?? 1000);
  const minValue = Number.isFinite(rawMinValue) && rawMinValue === 100 ? 1000 : rawMinValue;
  return {
    id: String(item.id || `wallet_${Date.now()}_${index}`),
    name: String(item.name || `观察钱包 ${index + 1}`).trim(),
    address,
    chainId: String(chain.chainId),
    chainKey: String(chain.chainKey || ''),
    chainName: String(chain.chainName || ''),
    activeChainId: String(chain.activeChainId || chain.chainId),
    tags: Array.isArray(item.tags)
      ? item.tags.map(tag => String(tag || '').trim()).filter(Boolean)
      : String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
    notes: String(item.notes || '').trim(),
    minValueUsd: Number.isFinite(minValue) && minValue >= 0 ? minValue : 1000,
    hiddenTokenKeys: Array.isArray(item.hiddenTokenKeys)
      ? [...new Set(item.hiddenTokenKeys.map(key => String(key || '').trim()).filter(Boolean))]
      : [],
    enabled: item.enabled !== false,
    updatedAt: String(item.updatedAt || new Date().toISOString())
  };
}

function defaultWalletWatchData() {
  return {
    wallets: [
      normalizeWalletWatchItem({
        id: 'bnkr_treasury_base',
        name: 'BNKR 国库钱包',
        address: '0x5f8da8f88ec81e27f2e22fcb9ca5d926c595e508',
        chainId: '8453',
        tags: ['项目金库', 'Base'],
        notes: '观察 BNKR 国库钱包的生态持仓变化，重点关注 BNKR / GITLAWB / DRB / DELU 等筹码线索。',
        minValueUsd: 1000,
        enabled: true
      }, 0)
    ],
    updatedAt: new Date().toISOString()
  };
}

function normalizeWalletWatchData(raw = {}) {
  const source = Array.isArray(raw.wallets) ? raw.wallets : [];
  const wallets = source.map((item, index) => normalizeWalletWatchItem(item, index))
    .filter(item => item.name && item.address && item.enabled !== false);
  return {
    wallets,
    updatedAt: String(raw.updatedAt || new Date().toISOString())
  };
}

async function loadWalletWatchData() {
  try {
    const raw = await fs.readFile(WALLET_WATCH_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeWalletWatchData(parsed);
  } catch (error) {
    return defaultWalletWatchData();
  }
}

async function saveWalletWatchData(payload = {}) {
  const normalized = normalizeWalletWatchData({
    ...payload,
    updatedAt: new Date().toISOString()
  });
  await fs.writeFile(WALLET_WATCH_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function loadWalletWatchSnapshots() {
  try {
    const raw = await fs.readFile(WALLET_WATCH_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { wallets: {} };
  } catch (error) {
    return { wallets: {} };
  }
}

async function saveWalletWatchSnapshots(wallets = {}) {
  const payload = {
    updatedAt: new Date().toISOString(),
    wallets
  };
  await fs.writeFile(WALLET_WATCH_SNAPSHOT_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function buildWalletWatchHoldingKey(item = {}) {
  return [
    String(item.chainId || '').trim(),
    String(item.contractAddress || item.tokenAddress || '').trim().toLowerCase(),
    String(item.symbol || '').trim().toUpperCase()
  ].join(':');
}

function buildWalletWatchChanges(previous = {}, currentHoldings = [], minValueUsd = 1000) {
  const currentMap = {};
  currentHoldings.forEach(item => {
    currentMap[buildWalletWatchHoldingKey(item)] = item;
  });
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(currentMap)]);
  const changes = [];
  for (const key of keys) {
    const prev = previous?.[key] || null;
    const curr = currentMap[key] || null;
    const prevValue = Number(prev?.value || 0);
    const currValue = Number(curr?.value || 0);
    if (prevValue < minValueUsd && currValue < minValueUsd) continue;
    const prevBalance = Number(prev?.balance || 0);
    const currBalance = Number(curr?.balance || 0);
    const deltaBalance = currBalance - prevBalance;
    if (Math.abs(deltaBalance) <= 1e-10 && Math.abs(currValue - prevValue) < 1) continue;
    let direction = 'increase';
    if (!prev && curr) direction = 'new';
    else if (prev && !curr) direction = 'removed';
    else if (deltaBalance < 0) direction = 'decrease';
    changes.push({
      symbol: curr?.symbol || prev?.symbol || '-',
      chainId: curr?.chainId || prev?.chainId || '',
      chainName: curr?.chainName || prev?.chainName || '',
      contractAddress: curr?.contractAddress || prev?.contractAddress || '',
      previousAmount: parseFloat(prevBalance.toFixed(8)),
      currentAmount: parseFloat(currBalance.toFixed(8)),
      deltaAmount: parseFloat(deltaBalance.toFixed(8)),
      previousValue: parseFloat(prevValue.toFixed(2)),
      currentValue: parseFloat(currValue.toFixed(2)),
      deltaValue: parseFloat((currValue - prevValue).toFixed(2)),
      direction
    });
  }
  return changes
    .sort((a, b) => Math.abs(Number(b.deltaValue || 0)) - Math.abs(Number(a.deltaValue || 0)))
    .slice(0, 20);
}

async function enrichWalletWatchHolding(item) {
  let market = null;
  const address = String(item.contractAddress || item.tokenAddress || '').trim();
  if (address && address !== 'native' && !item.isNative) {
    market = await getDexScreenerTokenMarket(address, item.chainId).catch(() => null);
  }
  const price = Number(market?.price || item.price || 0);
  const value = price > 0 ? Number(item.balance || 0) * price : Number(item.value || 0);
  return {
    ...item,
    price,
    value,
    contractAddress: address || 'native',
    changePercent1h: Number.isFinite(market?.changePercent1h) ? parseFloat(market.changePercent1h.toFixed(2)) : null,
    changePercent24h: Number.isFinite(market?.changePercent24h) ? parseFloat(market.changePercent24h.toFixed(2)) : null,
    marketCap: Number.isFinite(Number(item.marketCap)) ? Number(item.marketCap) : null
  };
}

async function buildWalletWatchDashboard(options = {}) {
  const updateSnapshot = Boolean(options.updateSnapshot);
  const data = await loadWalletWatchData();
  const snapshots = await loadWalletWatchSnapshots();
  const nextSnapshots = { ...(snapshots.wallets || {}) };
  const warnings = [];
  const wallets = [];

  for (const wallet of data.wallets) {
    const chain = getWalletWatchChain(wallet.chainId);
    let holdings = [];
    let error = '';
    try {
      const rawHoldings = await fetchBinanceWeb3ActivePositions(chain, wallet.address);
      const enriched = await Promise.all(rawHoldings.map(enrichWalletWatchHolding));
      const hiddenTokenKeys = new Set(wallet.hiddenTokenKeys || []);
      holdings = enriched
        .filter(item => !hiddenTokenKeys.has(buildWalletWatchHoldingKey(item)))
        .filter(item => Number(item.value || 0) >= Number(wallet.minValueUsd || 1000))
        .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
    } catch (err) {
      error = err.message;
      warnings.push(`${wallet.name}: ${err.message}`);
    }

    const previous = snapshots.wallets?.[wallet.id]?.holdings || {};
    const changes = buildWalletWatchChanges(previous, holdings, Number(wallet.minValueUsd || 1000));
    if (updateSnapshot && !error) {
      const nextHoldings = {};
      holdings.forEach(item => {
        nextHoldings[buildWalletWatchHoldingKey(item)] = {
          symbol: item.symbol,
          chainId: item.chainId,
          chainName: item.chainName,
          contractAddress: item.contractAddress,
          balance: Number(item.balance || 0),
          price: Number(item.price || 0),
          value: Number(item.value || 0)
        };
      });
      nextSnapshots[wallet.id] = {
        updatedAt: new Date().toISOString(),
        holdings: nextHoldings
      };
    }

    wallets.push({
      ...wallet,
      totalValue: parseFloat(holdings.reduce((sum, item) => sum + Number(item.value || 0), 0).toFixed(2)),
      holdingCount: holdings.length,
      holdings,
      changes,
      lastSnapshotAt: snapshots.wallets?.[wallet.id]?.updatedAt || '',
      error
    });
  }

  if (updateSnapshot) await saveWalletWatchSnapshots(nextSnapshots);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    minValueUsd: 1000,
    wallets,
    warnings
  };
}

function normalizeKolHandle(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function normalizeKolSignalItem(item = {}, index = 0) {
  const handle = normalizeKolHandle(item.handle || item.username || item.screenName);
  return {
    id: String(item.id || `kol_${handle || Date.now()}_${index}`),
    handle,
    name: String(item.name || handle || `KOL ${index + 1}`).trim(),
    tags: Array.isArray(item.tags)
      ? item.tags.map(tag => String(tag || '').trim()).filter(Boolean)
      : String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
    notes: String(item.notes || '').trim(),
    enabled: item.enabled !== false,
    updatedAt: String(item.updatedAt || new Date().toISOString())
  };
}

function defaultKolSignalsData() {
  const defaults = [
    ['btcbabycow', '牛姐', ['Base', '中文meme']],
    ['irutrenches', '前投行', ['Base', '交易员']],
    ['cutepanda', 'cutepanda', ['Base', '社区建设']],
    ['0xLuo', '0xLuo', ['Base', '研究']],
    ['jessepollak', 'jessepollak', ['Base', 'Builder']],
    ['CrashiusClay69', 'CrashiusClay69', ['Base', 'Alpha Hunter']],
    ['larpalt', 'larpalt', ['Meme Hunter']],
    ['basedsniper', 'basedsniper', ['Base', 'Alpha']],
    ['latenightonbase', 'latenightonbase', ['Base', '社区']]
  ];
  return {
    kols: defaults.map(([handle, name, tags], index) => normalizeKolSignalItem({ handle, name, tags, enabled: true }, index)),
    updatedAt: new Date().toISOString()
  };
}

function normalizeKolSignalsData(raw = {}) {
  const source = Array.isArray(raw.kols) ? raw.kols : [];
  const kols = source.map((item, index) => normalizeKolSignalItem(item, index))
    .filter(item => item.handle && item.enabled !== false);
  return {
    kols,
    updatedAt: String(raw.updatedAt || new Date().toISOString())
  };
}

async function loadKolSignalsData() {
  try {
    const raw = await fs.readFile(KOL_SIGNALS_PATH, 'utf8');
    return normalizeKolSignalsData(JSON.parse(raw));
  } catch (error) {
    return defaultKolSignalsData();
  }
}

async function saveKolSignalsData(payload = {}) {
  const normalized = normalizeKolSignalsData({
    ...payload,
    updatedAt: new Date().toISOString()
  });
  await fs.writeFile(KOL_SIGNALS_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function loadKolSignalFeed() {
  try {
    const raw = await fs.readFile(KOL_SIGNAL_FEED_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      updatedAt: String(parsed.updatedAt || '')
    };
  } catch (error) {
    return { posts: [], updatedAt: '' };
  }
}

async function saveKolSignalFeed(posts = []) {
  const payload = {
    updatedAt: new Date().toISOString(),
    posts: posts.slice(0, 500)
  };
  await fs.writeFile(KOL_SIGNAL_FEED_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function readXmlTag(block, tag) {
  const match = String(block || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXmlText(match[1]) : '';
}

function extractKolSignals(text = '') {
  const source = String(text || '');
  const tokenSet = new Set();
  const caSet = new Set();
  const tokenRegex = /(^|[^A-Za-z0-9_])\$([A-Za-z][A-Za-z0-9_]{1,24})/g;
  let tokenMatch;
  while ((tokenMatch = tokenRegex.exec(source))) {
    const token = String(tokenMatch[2] || '').toUpperCase();
    if (!['USD', 'USDT', 'USDC', 'ETH', 'BTC', 'BNB'].includes(token)) tokenSet.add(token);
  }
  const evmRegex = /0x[a-fA-F0-9]{40}/g;
  let caMatch;
  while ((caMatch = evmRegex.exec(source))) caSet.add(caMatch[0]);
  return {
    tokens: [...tokenSet],
    contracts: [...caSet]
  };
}

function normalizeKolPost(raw = {}) {
  const handle = normalizeKolHandle(raw.handle);
  const text = String(raw.text || '').trim();
  const link = String(raw.link || '').trim();
  const publishedAt = raw.publishedAt ? new Date(raw.publishedAt).toISOString() : new Date().toISOString();
  const id = crypto.createHash('sha1').update(`${handle}|${link}|${text}|${publishedAt}`).digest('hex');
  const signals = extractKolSignals(text);
  return {
    id,
    handle,
    name: String(raw.name || handle).trim(),
    text,
    link,
    publishedAt,
    tokens: signals.tokens,
    contracts: signals.contracts,
    source: String(raw.source || 'rsshub')
  };
}

function getKolRssBases() {
  const raw = String(process.env.KOL_RSS_BASES || '').trim();
  if (raw) return raw.split(',').map(item => item.trim()).filter(Boolean);
  return ['https://rsshub.app'];
}

function normalizeTwitterApiTweet(tweet = {}, kol = {}) {
  const text = String(
    tweet.text
    || tweet.fullText
    || tweet.full_text
    || tweet.content
    || tweet.tweetText
    || ''
  ).trim();
  const tweetId = String(tweet.id || tweet.id_str || tweet.tweetId || '').trim();
  const link = String(tweet.url || tweet.twitterUrl || tweet.link || (tweetId ? `https://x.com/${kol.handle}/status/${tweetId}` : '')).trim();
  const publishedAt = String(tweet.createdAt || tweet.created_at || tweet.createdTime || tweet.time || tweet.date || new Date().toISOString());
  return normalizeKolPost({
    handle: kol.handle,
    name: kol.name,
    text,
    link,
    publishedAt,
    source: 'twitterapi.io'
  });
}

function pickTwitterApiTweets(payload = {}) {
  if (Array.isArray(payload?.tweets)) return payload.tweets;
  if (Array.isArray(payload?.data?.tweets)) return payload.data.tweets;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result?.tweets)) return payload.result.tweets;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTwitterApiLastTweets(kol) {
  if (!TWITTERAPI_IO_KEY) {
    throw new Error('TWITTERAPI_IO_KEY is not configured');
  }
  const response = await axios.get('https://api.twitterapi.io/twitter/user/last_tweets', {
    timeout: 25000,
    headers: {
      'x-api-key': TWITTERAPI_IO_KEY,
      'User-Agent': 'DYOR-KOL-Signal/1.0'
    },
    params: {
      userName: kol.handle
    }
  });
  const rows = pickTwitterApiTweets(response.data);
  if (!rows.length) {
    const message = response.data?.message || response.data?.error || 'TwitterAPI.io returned no tweets';
    throw new Error(message);
  }
  return rows
    .slice(0, 30)
    .map(tweet => normalizeTwitterApiTweet(tweet, kol))
    .filter(post => post.text);
}

async function fetchKolRssPosts(kol) {
  const bases = getKolRssBases();
  const errors = [];
  for (const base of bases) {
    try {
      const url = `${base.replace(/\/$/, '')}/twitter/user/${encodeURIComponent(kol.handle)}`;
      const response = await axios.get(url, {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DYOR-KOL-Signal/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      });
      const xml = String(response.data || '');
      const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
      return itemBlocks.slice(0, 20).map(block => normalizeKolPost({
        handle: kol.handle,
        name: kol.name,
        text: readXmlTag(block, 'description') || readXmlTag(block, 'title'),
        link: readXmlTag(block, 'link'),
        publishedAt: readXmlTag(block, 'pubDate') || new Date().toISOString(),
        source: base
      })).filter(post => post.text);
    } catch (error) {
      errors.push(`${base}: ${error.message}`);
    }
  }
  throw new Error(errors.join('; ') || 'rss fetch failed');
}

function buildKolSignalBoard(posts = [], kols = []) {
  const now = Date.now();
  const recentPosts = posts.filter(post => {
    const t = Date.parse(post.publishedAt) || 0;
    return t > now - 7 * 24 * 60 * 60 * 1000;
  });
  const tokenMap = new Map();
  const contractMap = new Map();
  for (const post of recentPosts) {
    for (const token of post.tokens || []) {
      const row = tokenMap.get(token) || { token, mentions: 0, kols: new Set(), latestAt: '', posts: [] };
      row.mentions += 1;
      row.kols.add(post.handle);
      if (!row.latestAt || String(post.publishedAt) > row.latestAt) row.latestAt = post.publishedAt;
      row.posts.push(post);
      tokenMap.set(token, row);
    }
    for (const contract of post.contracts || []) {
      const key = contract.toLowerCase();
      const row = contractMap.get(key) || { contract, mentions: 0, kols: new Set(), latestAt: '', posts: [] };
      row.mentions += 1;
      row.kols.add(post.handle);
      if (!row.latestAt || String(post.publishedAt) > row.latestAt) row.latestAt = post.publishedAt;
      row.posts.push(post);
      contractMap.set(key, row);
    }
  }
  const tokenSignals = [...tokenMap.values()].map(row => ({
    token: row.token,
    mentions: row.mentions,
    kolCount: row.kols.size,
    kols: [...row.kols],
    latestAt: row.latestAt,
    score: row.kols.size * 10 + Math.min(Math.max(row.mentions - row.kols.size, 0), 3),
    level: row.kols.size >= 3 ? 'strong' : (row.kols.size >= 2 ? 'medium' : 'weak'),
    isCrossVerified: row.kols.size >= 2,
    posts: row.posts.slice(0, 5)
  })).sort((a, b) => b.kolCount - a.kolCount || b.score - a.score || String(b.latestAt).localeCompare(String(a.latestAt)));
  const contractSignals = [...contractMap.values()].map(row => ({
    contract: row.contract,
    mentions: row.mentions,
    kolCount: row.kols.size,
    kols: [...row.kols],
    latestAt: row.latestAt,
    score: row.kols.size * 10 + Math.min(Math.max(row.mentions - row.kols.size, 0), 3),
    level: row.kols.size >= 3 ? 'strong' : (row.kols.size >= 2 ? 'medium' : 'weak'),
    isCrossVerified: row.kols.size >= 2,
    symbol: '',
    chainId: '',
    price: null,
    posts: row.posts.slice(0, 5)
  })).sort((a, b) => b.kolCount - a.kolCount || b.score - a.score || String(b.latestAt).localeCompare(String(a.latestAt)));
  return {
    kolCount: kols.length,
    postCount: posts.length,
    recentPostCount: recentPosts.length,
    tokenSignals,
    contractSignals,
    topSignal: tokenSignals[0] || null,
    latestPosts: posts.slice(0, 80)
  };
}

async function enrichKolContractSignals(contractSignals = []) {
  const enriched = [];
  for (const item of contractSignals.slice(0, 50)) {
    const market = await getDexScreenerTokenMarket(item.contract, '').catch(() => null);
    enriched.push({
      ...item,
      symbol: market?.symbol || item.symbol || '',
      chainId: market?.chainId || item.chainId || '',
      price: Number.isFinite(Number(market?.price)) ? Number(market.price) : null
    });
  }
  return enriched;
}

async function buildKolSignalsDashboard(options = {}) {
  const refresh = Boolean(options.refresh);
  const data = await loadKolSignalsData();
  const feed = await loadKolSignalFeed();
  let posts = Array.isArray(feed.posts) ? feed.posts : [];
  const warnings = [];
  if (refresh) {
    const fetched = [];
    for (let index = 0; index < data.kols.length; index += 1) {
      const kol = data.kols[index];
      if (TWITTERAPI_IO_KEY && index > 0) {
        await sleep(5500);
      }
      try {
        let rows = [];
        try {
          rows = await fetchTwitterApiLastTweets(kol);
        } catch (twitterError) {
          rows = await fetchKolRssPosts(kol).catch(rssError => {
            throw new Error(`TwitterAPI.io: ${twitterError.message}; RSS fallback: ${rssError.message}`);
          });
        }
        fetched.push(...rows);
      } catch (error) {
        warnings.push(`@${kol.handle}: ${error.message}`);
      }
    }
    const merged = new Map();
    [...fetched, ...posts].forEach(post => {
      const normalized = normalizeKolPost(post);
      if (!merged.has(normalized.id)) merged.set(normalized.id, normalized);
    });
    posts = [...merged.values()]
      .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
      .slice(0, 500);
    await saveKolSignalFeed(posts);
  }
  const board = buildKolSignalBoard(posts, data.kols);
  board.contractSignals = await enrichKolContractSignals(board.contractSignals);
  return {
    success: true,
    timestamp: new Date().toISOString(),
    data,
    feedUpdatedAt: feed.updatedAt || '',
    warnings,
    board
  };
}

async function getCommunityOnchainFundAssets(spotPrices = {}) {
  const { balances, warnings } = await getCommunityOnchainTokenBalances({ updateSnapshot: false });
  return {
    warnings,
    assets: balances
      .filter(item => Number(item.balance) > 0 || Number(item.value) > 0)
      .map(item => ({
        symbol: item.symbol,
        name: `${item.chainName} ${item.symbol}`,
        free: Number(item.balance || 0),
        locked: 0,
        total: Number(item.balance || 0),
        usdtPrice: Number(item.price || 0) > 0 ? Number(item.price || 0) : null,
        usdtValue: Number(item.value || 0) > 0 ? Number(item.value || 0) : 0,
        source: 'onchain-wallet',
        chainId: item.chainId,
        chainName: item.chainName,
        contractAddress: item.contractAddress,
        ownerAddress: item.ownerAddress,
        isNative: item.isNative
      }))
  };
}

function buildWalletRecentTransactions(raw = []) {
  const txs = Array.isArray(raw) ? raw : [];
  const nativeFeeLikeSymbols = new Set(['BNB', 'ETH', 'SOL', 'MATIC', 'BASE']);
  const normalized = [];

  for (const tx of txs) {
    const txTime = String(tx?.txTime || '').trim();
    const txHash = String(tx?.txHash || '').trim();
    const txType = String(tx?.txType || 'transfer').trim();
    const chainId = String(tx?.binanceChainId || '').trim();
    const status = String(tx?.status || '').trim();
    const instructions = tx?.txHashList?.[0]?.instructions || {};

    const pushBySide = (side, label) => {
      const list = Array.isArray(instructions?.[side]) ? instructions[side] : [];
      for (const item of list) {
        const tokenSymbol = String(item?.tokenInfo?.symbol || '').trim().toUpperCase();
        const decimals = toNumberSafe(item?.tokenInfo?.decimals, 18);
        const amount = formatBawTokenAmount(item?.amount, decimals);
        if (!(amount > 0)) continue;
        // 过滤手续费体量级别的小额原生币噪音
        if (nativeFeeLikeSymbols.has(tokenSymbol) && amount <= 0.02) continue;
        normalized.push({
          txHash,
          txTime,
          txType,
          chainId,
          status,
          direction: label,
          symbol: tokenSymbol || '-',
          amount: parseFloat(amount.toFixed(8))
        });
      }
    };

    pushBySide('receive', 'IN');
    pushBySide('send', 'OUT');
  }

  return normalized
    .sort((a, b) => Date.parse(b.txTime || '') - Date.parse(a.txTime || ''))
    .slice(0, 20);
}

function buildWalletTokenBaselineKey(item = {}) {
  const chainId = String(item.chainId || '').trim();
  const address = String(item.tokenAddress || '').trim().toLowerCase();
  const symbol = String(item.symbol || '').trim().toUpperCase();
  if (chainId && address) return `${chainId}:${address}`;
  if (chainId && symbol) return `${chainId}:symbol:${symbol}`;
  return symbol || '';
}

function buildFundAssetBaselineKey(asset = {}) {
  const chainId = String(asset.chainId || '').trim();
  const contractAddress = String(asset.contractAddress || '').trim().toLowerCase();
  const symbol = String(asset.symbol || '').trim().toUpperCase();
  const source = String(asset.source || '').trim().toLowerCase();
  if (chainId && contractAddress) return `${chainId}:${contractAddress}`;
  if (source && symbol) return `${source}:symbol:${symbol}`;
  return symbol || '';
}

async function loadWalletTokenBaselines() {
  try {
    const raw = await fs.readFile(WALLET_TOKEN_BASELINE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { tokens: {} };
  } catch (error) {
    return { tokens: {} };
  }
}

async function saveWalletTokenBaselines(payload) {
  const next = {
    tokens: payload?.tokens && typeof payload.tokens === 'object' ? payload.tokens : {},
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(WALLET_TOKEN_BASELINE_PATH, JSON.stringify(next, null, 2));
  return next;
}

// 静态文件服务
function parseCookies(req) {
  const raw = String(req?.headers?.cookie || '').trim();
  if (!raw) return {};
  return raw.split(';').reduce((acc, item) => {
    const idx = item.indexOf('=');
    if (idx <= 0) return acc;
    const key = item.slice(0, idx).trim();
    const val = item.slice(idx + 1).trim();
    try {
      acc[key] = decodeURIComponent(val);
    } catch (error) {
      acc[key] = val;
    }
    return acc;
  }, {});
}

function createWhitelistSession(email) {
  const token = crypto.randomBytes(24).toString('hex');
  whitelistSessions.set(token, {
    email: String(email || '').toLowerCase().trim(),
    expiresAt: Date.now() + WHITELIST_SESSION_TTL_MS
  });
  return token;
}

function getWhitelistSessionEmail(req) {
  const cookies = parseCookies(req);
  const token = String(cookies[WHITELIST_SESSION_COOKIE] || '').trim();
  if (!token) return null;
  const session = whitelistSessions.get(token);
  if (!session) return null;
  if (!session.expiresAt || session.expiresAt < Date.now()) {
    whitelistSessions.delete(token);
    return null;
  }
  return String(session.email || '').trim() || null;
}

async function requireWhitelistSession(req, res, next) {
  try {
    const queryEmail = String(req?.query?.email || '').toLowerCase().trim();
    if (queryEmail) {
      const queryValid = await validateEmail(queryEmail);
      if (queryValid) {
        req.whitelistEmail = queryEmail;
        return next();
      }
    }

    const email = getWhitelistSessionEmail(req);
    if (!email) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, error: 'whitelist login required' });
      }
      return res.status(401).send('Whitelist login required');
    }
    const isValid = await validateEmail(email);
    if (!isValid) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, error: 'email not in whitelist' });
      }
      return res.status(401).send('Whitelist required');
    }
    req.whitelistEmail = email;
    return next();
  } catch (error) {
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ success: false, error: error.message });
    }
    return res.status(500).send('authorization error');
  }
}

app.use(['/api/portfolio-manager'], requireWhitelistSession);
app.use(express.static('public'));
app.use(express.json({ limit: '140mb' }));

app.post('/api/login', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: '请输入邮箱' });
  }
  if (!isValidEmailFormat(email)) {
    return res.status(401).json({ success: false, error: '请输入有效邮箱' });
  }
  const isValid = await validateEmail(email);
  if (!isValid) {
    return res.status(401).json({ success: false, error: '邮箱不在白名单中' });
  }
  return res.json({
    success: true,
    message: '验证成功',
    email: email.toLowerCase().trim()
  });
});

app.post('/api/linkage-login', async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, error: '请输入邮箱' });
  }
  if (!isValidEmailFormat(normalizedEmail)) {
    return res.status(401).json({ success: false, error: '请输入有效邮箱' });
  }
  const isValid = await validateLinkageEmail(normalizedEmail);
  if (!isValid) {
    return res.status(401).json({ success: false, error: '邮箱未开通联动看板白名单' });
  }
  return res.json({
    success: true,
    message: '验证成功',
    email: normalizedEmail
  });
});

setTimeout(() => {
  runListingSignalsCheck().catch(error => {
    console.error('listing signal initial check failed:', error.message);
  });
}, 5000).unref();

setInterval(() => {
  runListingSignalsCheck().catch(error => {
    console.error('listing signal scheduled check failed:', error.message);
  });
}, 60 * 1000).unref();

setTimeout(() => {
  startOpenNewsRealtimeListing();
}, 8000).unref();

setTimeout(() => {
  runHunterSignalsScan().catch(error => {
    console.error('hunter signal initial scan failed:', error.message);
  });
}, 10000).unref();

setInterval(() => {
  runHunterSignalsScan().catch(error => {
    console.error('hunter signal scheduled scan failed:', error.message);
  });
}, 5 * 60 * 1000).unref();

app.get('/api/assets', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(401).json({ success: false, error: '请提供邮箱' });
    }
    if (!isValidEmailFormat(email)) {
      return res.status(401).json({ success: false, error: '请输入有效邮箱' });
    }
    const isValid = await validateEmail(email);
    if (!isValid) {
      return res.status(401).json({ success: false, error: '邮箱不在白名单中' });
    }
    const data = await calculateFundData();
    const visibleAssets = filterVisibleFundAssets(data.assets || []);
    const positionBroadcast = await updateAssetSnapshotsAndBuildChanges(visibleAssets);
    const baselineState = await loadWalletTokenBaselines();
    const baselineTokens = baselineState?.tokens && typeof baselineState.tokens === 'object'
      ? baselineState.tokens
      : {};
    const enrichedAssets = visibleAssets.map(asset => {
      const key = buildFundAssetBaselineKey(asset);
      const baseline = key ? baselineTokens[key] : null;
      const costBasisPrice = Number(baseline?.costBasisPrice || 0);
      const totalAmount = Number(asset.total || 0);
      const currentPrice = Number(asset.usdtPrice || 0);
      const currentValue = Number(asset.usdtValue || 0);
      const costValue = costBasisPrice > 0 && totalAmount > 0 ? costBasisPrice * totalAmount : null;
      const pnlValue = costValue != null ? (currentValue - costValue) : null;
      const pnlPct = costBasisPrice > 0 && currentPrice > 0
        ? ((currentPrice - costBasisPrice) / costBasisPrice) * 100
        : null;
      return {
        ...asset,
        costBasisPrice: costBasisPrice > 0 ? parseFloat(costBasisPrice.toFixed(8)) : null,
        costValue: costValue != null ? parseFloat(costValue.toFixed(8)) : null,
        pnlValue: pnlValue != null ? parseFloat(pnlValue.toFixed(8)) : null,
        pnlPct: pnlPct != null ? parseFloat(pnlPct.toFixed(4)) : null
      };
    });
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
      assets: enrichedAssets,
      fundAssetFilterMinUsd: FUND_ASSET_MIN_VISIBLE_USD,
      positionChanges: positionBroadcast.changes,
      positionChangeBaseline: positionBroadcast.baselineTimestamp,
      positionChangeHistory: positionBroadcast.history,
      positionChangeWindowDays: positionBroadcast.historyWindowDays
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 获取客户端真实IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         'unknown';
}

// 加载密钥列表
async function loadViewKeys() {
  try {
    const data = await fs.readFile(VIEW_KEYS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// 保存密钥列表
async function saveViewKeys(keys) {
  await fs.writeFile(VIEW_KEYS_PATH, JSON.stringify(keys, null, 2));
}

// 加载白名单邮箱
async function loadWhitelist() {
  try {
    const data = await fs.readFile(WHITELIST_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { emails: [] };
  }
}

async function loadLinkageWhitelist() {
  try {
    const data = await fs.readFile(LINKAGE_WHITELIST_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return {
      emails: Array.isArray(parsed.emails)
        ? parsed.emails.map(email => String(email || '').toLowerCase().trim()).filter(Boolean)
        : []
    };
  } catch (error) {
    return { emails: [] };
  }
}

async function loadInvestors() {
  try {
    const data = await fs.readFile(INVESTORS_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.investors || [];
  } catch (error) {
    return [];
  }
}

async function saveInvestors(investors) {
  const payload = {
    investors,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(INVESTORS_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

async function ensureDownloadsDir() {
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
}

function normalizeDownloadItem(item = {}) {
  return {
    id: String(item.id || '').trim(),
    name: String(item.name || '').trim(),
    version: String(item.version || '').trim(),
    description: String(item.description || '').trim(),
    fileName: String(item.fileName || '').trim(),
    fileSize: Number(item.fileSize || 0),
    createdAt: String(item.createdAt || '').trim(),
    updatedAt: String(item.updatedAt || '').trim()
  };
}

async function loadDownloads() {
  try {
    const data = await fs.readFile(DOWNLOADS_PATH, 'utf8');
    const parsed = JSON.parse(data);
    const items = Array.isArray(parsed.items) ? parsed.items.map(normalizeDownloadItem) : [];
    return { items };
  } catch (error) {
    return { items: [] };
  }
}

async function saveDownloads(items) {
  const payload = {
    items: Array.isArray(items) ? items.map(normalizeDownloadItem) : [],
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(DOWNLOADS_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function sanitizeFileName(rawName) {
  const fallback = `app-${Date.now()}.bin`;
  const name = String(rawName || '').trim();
  if (!name) return fallback;
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!cleaned) return fallback;
  return cleaned.slice(0, 120);
}

function toStringArray(input) {
  if (Array.isArray(input)) {
    return input.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(input || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeLinkageConcept(item = {}, index = 0) {
  const tokenItemsSource = Array.isArray(item.tokenItems)
    ? item.tokenItems
    : toStringArray(item.tokens).map(symbol => ({ symbol, notes: '' }));
  const tokenItems = [];
  const seenTokens = new Set();
  for (const tokenItem of tokenItemsSource) {
    const symbol = String(tokenItem?.symbol || tokenItem || '').trim().toUpperCase();
    if (!symbol || seenTokens.has(symbol)) continue;
    seenTokens.add(symbol);
    tokenItems.push({
      symbol,
      assetType: String(tokenItem?.assetType || tokenItem?.type || '').trim().toLowerCase() === 'onchain' ? 'onchain' : 'binance',
      chainId: String(tokenItem?.chainId || '').trim(),
      contractAddress: String(tokenItem?.contractAddress || tokenItem?.address || '').trim(),
      entryMarketCapMin: Number.isFinite(Number(tokenItem?.entryMarketCapMin)) ? Number(tokenItem.entryMarketCapMin) : null,
      entryMarketCapMax: Number.isFinite(Number(tokenItem?.entryMarketCapMax)) ? Number(tokenItem.entryMarketCapMax) : null,
      entryPriceMin: Number.isFinite(Number(tokenItem?.entryPriceMin)) ? Number(tokenItem.entryPriceMin) : null,
      entryPriceMax: Number.isFinite(Number(tokenItem?.entryPriceMax)) ? Number(tokenItem.entryPriceMax) : null,
      institutionPrice: Number.isFinite(Number(tokenItem?.institutionPrice)) ? Number(tokenItem.institutionPrice) : null,
      preMarketPrice: Number.isFinite(Number(tokenItem?.preMarketPrice)) ? Number(tokenItem.preMarketPrice) : null,
      openPrice: Number.isFinite(Number(tokenItem?.openPrice)) ? Number(tokenItem.openPrice) : null,
      twitterUrl: /^https?:\/\//i.test(String(tokenItem?.twitterUrl || '').trim()) ? String(tokenItem.twitterUrl).trim() : '',
      listingNodes: {
        binanceFutures: Boolean(tokenItem?.listingNodes?.binanceFutures),
        binanceSpot: Boolean(tokenItem?.listingNodes?.binanceSpot),
        coinbase: Boolean(tokenItem?.listingNodes?.coinbase),
        upbit: Boolean(tokenItem?.listingNodes?.upbit),
        bithumb: Boolean(tokenItem?.listingNodes?.bithumb)
      },
      notes: String(tokenItem?.notes || '').trim()
    });
  }
  return {
    id: String(item.id || `concept_${Date.now()}_${index}`),
    name: String(item.name || '').trim(),
    status: String(item.status || '观察中').trim() || '观察中',
    tokens: tokenItems.map(token => token.symbol),
    tokenItems,
    leaders: [...new Set(toStringArray(item.leaders).map(t => t.toUpperCase()))],
    followers: [...new Set(toStringArray(item.followers).map(t => t.toUpperCase()))],
    notes: String(item.notes || '').trim(),
    updatedAt: String(item.updatedAt || new Date().toISOString())
  };
}

function normalizeLinkageRelation(item = {}, index = 0) {
  const strength = Number(item.strength);
  const lagMinutes = Number(item.lagMinutes);
  return {
    id: String(item.id || `relation_${Date.now()}_${index}`),
    concept: String(item.concept || '').trim(),
    fromSymbol: String(item.fromSymbol || '').trim().toUpperCase(),
    toSymbol: String(item.toSymbol || '').trim().toUpperCase(),
    strength: Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) : 50,
    lagMinutes: Number.isFinite(lagMinutes) ? Math.max(0, Math.round(lagMinutes)) : 60,
    notes: String(item.notes || '').trim(),
    updatedAt: String(item.updatedAt || new Date().toISOString())
  };
}

function normalizeLinkageEvent(item = {}, index = 0) {
  return {
    id: String(item.id || `event_${Date.now()}_${index}`),
    date: String(item.date || new Date().toISOString().slice(0, 10)).trim(),
    concept: String(item.concept || '').trim(),
    leader: String(item.leader || '').trim().toUpperCase(),
    movers: [...new Set(toStringArray(item.movers).map(t => t.toUpperCase()))],
    notes: String(item.notes || '').trim(),
    updatedAt: String(item.updatedAt || new Date().toISOString())
  };
}

function normalizeLinkagePayload(payload = {}) {
  const concepts = Array.isArray(payload.concepts)
    ? payload.concepts.map((item, idx) => normalizeLinkageConcept(item, idx)).filter(item => item.name)
    : [];
  const relations = Array.isArray(payload.relations)
    ? payload.relations.map((item, idx) => normalizeLinkageRelation(item, idx)).filter(item => item.fromSymbol && item.toSymbol)
    : [];
  const events = Array.isArray(payload.events)
    ? payload.events.map((item, idx) => normalizeLinkageEvent(item, idx)).filter(item => item.concept || item.leader || item.movers.length)
    : [];

  return {
    concepts,
    relations,
    events,
    updatedAt: new Date().toISOString()
  };
}

async function loadLinkageData() {
  try {
    const raw = await fs.readFile(LINKAGE_PATH, 'utf8');
    return normalizeLinkagePayload(JSON.parse(raw));
  } catch (error) {
    return {
      concepts: [],
      relations: [],
      events: [],
      updatedAt: new Date().toISOString()
    };
  }
}

async function saveLinkageData(payload) {
  const next = normalizeLinkagePayload(payload);
  await fs.writeFile(LINKAGE_PATH, JSON.stringify(next, null, 2));
  return next;
}

const STOCK_DERIVATIVE_BASES = new Set([
  'AAPL', 'ADBE', 'AMZN', 'AMD', 'AVGO', 'BABA', 'BRK', 'BRKA', 'BRKB', 'CBRS', 'COIN',
  'COHR', 'DIS', 'DISSTOCK', 'GOOG', 'GOOGL', 'HD', 'HDSTOCK', 'INTC', 'META', 'MSFT',
  'MSTR', 'NFLX', 'NVDA', 'ORCL', 'QQQ', 'SPY', 'TSLA', 'UBER'
]);

function isStockDerivativeListing(item = {}) {
  const symbol = String(item.symbol || item.id || '').toUpperCase();
  const base = String(item.baseAsset || '').toUpperCase();
  const name = String(item.name || '').toUpperCase();
  if (symbol.includes('STOCK') || base.includes('STOCK') || name.includes('STOCK')) return true;
  if (symbol.includes('TRADFI') || base.includes('TRADFI') || name.includes('TRADFI')) return true;
  const cleanedBase = base.replace(/[^A-Z]/g, '');
  if (STOCK_DERIVATIVE_BASES.has(cleanedBase)) return true;
  const raw = symbol.replace(/[-_/](USDT|USDC|USD|KRW)$/i, '').replace(/(USDT|USDC|USD|KRW)$/i, '');
  const cleanedSymbolBase = raw.replace(/[^A-Z]/g, '');
  return STOCK_DERIVATIVE_BASES.has(cleanedSymbolBase);
}

function isBinanceTradFiFutures(item = {}) {
  const contractType = String(item.contractType || '').toUpperCase();
  const underlyingType = String(item.underlyingType || '').toUpperCase();
  const marginAsset = String(item.marginAsset || '').toUpperCase();
  const base = String(item.baseAsset || '').toUpperCase();
  const symbol = String(item.symbol || '').toUpperCase();
  if (isStockDerivativeListing({ symbol, baseAsset: base, name: `${contractType} ${underlyingType}` })) return true;
  if (underlyingType && !['COIN'].includes(underlyingType)) return true;
  return contractType.includes('TRADFI') || marginAsset === 'USD1';
}

function parseUpbitNoticeMarkets(title = '') {
  const markets = new Set();
  String(title).replace(/\b(KRW|BTC|USDT|USDC|USD)\b/gi, match => {
    markets.add(match.toUpperCase());
    return match;
  });
  return [...markets];
}

function parseUpbitNoticeBaseAsset(title = '') {
  const matches = [...String(title).matchAll(/\(([A-Z0-9]{2,20})\)/g)]
    .map(match => match[1].toUpperCase())
    .filter(value => !['KRW', 'BTC', 'USDT', 'USDC', 'USD'].includes(value));
  return matches[0] || '';
}

function parseNoticeBaseAsset(title = '') {
  const fromParentheses = parseUpbitNoticeBaseAsset(title);
  if (fromParentheses) return fromParentheses;
  const text = String(title || '').toUpperCase();
  const symbolMatch = text.match(/\b([A-Z0-9]{2,20})(USDT|USDC|USD|KRW|BTC)\b/);
  if (symbolMatch) return symbolMatch[1];
  return '';
}

function isGenericListingNotice(title = '', categories = []) {
  const text = String(title || '').toLowerCase();
  const categoryText = Array.isArray(categories) ? categories.join(' ').toLowerCase() : String(categories || '').toLowerCase();
  if (!text) return false;
  const negativeWords = [
    'delist', 'will remove', 'removal', 'terminate', 'maintenance', 'suspend',
    'deposit', 'withdrawal', 'tradfi', 'stock index', 'stock perpetual',
    '입출금', '종료', '유의', '정지', '점검', '매도 결과'
  ];
  if (negativeWords.some(word => text.includes(word))) return false;
  const positiveWords = [
    'will list', 'listed on', 'new listing', 'world premiere', 'will launch',
    'market support', 'trading support', '신규 거래지원', '마켓 추가', '거래지원'
  ];
  if (positiveWords.some(word => text.includes(word))) return true;
  return categoryText.includes('new-listings') || categoryText.includes('거래');
}

function isUpbitListingNotice(title = '') {
  const text = String(title || '').toLowerCase();
  if (!text) return false;
  if (text.includes('종료') || text.includes('유의') || text.includes('정지')) return false;
  return text.includes('신규 거래지원')
    || text.includes('market support')
    || text.includes('listing');
}

function normalizeOpenNewsCoinSymbol(item = {}) {
  const coins = Array.isArray(item.coins) ? item.coins : [];
  const scoredCoin = coins
    .filter(coin => coin && coin.symbol)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  if (scoredCoin?.symbol) return String(scoredCoin.symbol).toUpperCase();
  return parseNoticeBaseAsset(`${item.text || ''} ${item.description || ''}`);
}

function isOpenNewsActionableListing(item = {}) {
  if (!item || String(item.engineType || '').toLowerCase() !== 'listing') return false;
  const symbol = normalizeOpenNewsCoinSymbol(item);
  if (!symbol) return false;
  if (isStockDerivativeListing({ symbol, baseAsset: symbol, name: `${item.text || ''} ${item.description || ''}` })) return false;
  const score = Number(item.score || item.aiRating?.score || 0);
  if (score >= 50) return true;
  return isGenericListingNotice(`${item.text || ''} ${item.description || ''}`);
}

function openNewsArticleToListingRow(item = {}) {
  const symbol = normalizeOpenNewsCoinSymbol(item);
  const score = Number(item.score || item.aiRating?.score || 0);
  const signal = String(item.aiRating?.signal || '').toUpperCase();
  const grade = String(item.aiRating?.grade || '').toUpperCase();
  return {
    id: `OPENNEWS_${item.id}`,
    symbol,
    baseAsset: symbol,
    quoteAsset: String(item.newsType || item.source || '').toUpperCase(),
    name: String(item.text || item.description || '').trim(),
    board: String(item.link || '').trim(),
    warning: [score ? `SCORE ${score}` : '', grade, signal].filter(Boolean).join(' · '),
    listedAt: item.ts ? new Date(item.ts).toISOString() : ''
  };
}

function dedupeOpenNewsListingRows(rows = []) {
  const bestByKey = new Map();
  for (const row of rows) {
    const key = `${String(row.quoteAsset || '').toUpperCase()}_${String(row.baseAsset || row.symbol || '').toUpperCase()}`;
    const current = bestByKey.get(key);
    if (!current) {
      bestByKey.set(key, row);
      continue;
    }
    const rowScore = Number(String(row.warning || '').match(/SCORE\s+(\d+)/i)?.[1] || 0);
    const currentScore = Number(String(current.warning || '').match(/SCORE\s+(\d+)/i)?.[1] || 0);
    const rowTime = Date.parse(row.listedAt || '') || Number.MAX_SAFE_INTEGER;
    const currentTime = Date.parse(current.listedAt || '') || Number.MAX_SAFE_INTEGER;
    if (rowScore > currentScore || (rowScore === currentScore && rowTime < currentTime)) {
      bestByKey.set(key, row);
    }
  }
  return [...bestByKey.values()];
}

const LISTING_SIGNAL_SOURCES = [
  {
    key: 'opennews_6551_listing',
    exchange: '6551News',
    marketType: '快讯',
    url: `${OPENNEWS_API_BASE}/open/news_search`,
    method: 'POST',
    openNewsAuth: true,
    minIntervalMs: OPENNEWS_LISTING_INTERVAL_MS,
    body: {
      engineTypes: { listing: [] },
      limit: 80,
      page: 1
    },
    emitRecentOnFirstRunMs: 24 * 60 * 60 * 1000,
    parse: payload => dedupeOpenNewsListingRows((payload?.data || [])
      .filter(isOpenNewsActionableListing)
      .map(openNewsArticleToListingRow))
  },
  {
    key: 'binance_spot',
    exchange: 'Binance',
    marketType: '现货',
    url: 'https://api.binance.com/api/v3/exchangeInfo',
    parse: payload => (payload?.symbols || [])
      .filter(item => item && item.status === 'TRADING' && item.symbol)
      .map(item => ({
        id: String(item.symbol).toUpperCase(),
        symbol: String(item.symbol).toUpperCase(),
        baseAsset: String(item.baseAsset || '').toUpperCase(),
        quoteAsset: String(item.quoteAsset || '').toUpperCase()
      }))
  },
  {
    key: 'binance_futures',
    exchange: 'Binance',
    marketType: 'U本位合约',
    url: 'https://fapi.binance.com/fapi/v1/exchangeInfo',
    parse: payload => (payload?.symbols || [])
      .filter(item => item && item.status === 'TRADING' && item.symbol)
      .filter(item => !isBinanceTradFiFutures(item))
      .map(item => ({
        id: String(item.symbol).toUpperCase(),
        symbol: String(item.symbol).toUpperCase(),
        baseAsset: String(item.baseAsset || '').toUpperCase(),
        quoteAsset: String(item.quoteAsset || '').toUpperCase()
      }))
  },
  {
    key: 'binance_alpha',
    exchange: 'Binance Alpha',
    marketType: 'Alpha',
    url: 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list',
    parse: payload => normalizeAlphaTokenList(payload?.data)
      .filter(item => item && (item.symbol || item.alphaId || item.tokenId))
      .map(item => ({
        id: String(item.alphaId || item.tokenId || item.symbol).toUpperCase(),
        symbol: String(item.symbol || item.cexCoinName || item.name || item.alphaId || '').toUpperCase(),
        baseAsset: String(item.symbol || item.cexCoinName || '').toUpperCase(),
        quoteAsset: 'USDT',
        name: String(item.name || '').trim(),
        board: String(item.chainName || item.chainId || '').trim(),
        warning: item.listingCex ? 'CEX' : '',
        contractCandidates: normalizeContractCandidates([{
          source: 'Binance Alpha',
          confidence: 'high',
          chainId: String(item.chainId || '').replace(/^CT_/i, ''),
          chainName: normalizeAlphaChainName(item.chainId, item.chainName),
          contractAddress: item.contractAddress,
          symbol: item.symbol || item.cexCoinName || '',
          name: item.name || '',
          priceUsd: item.price,
          marketCap: item.marketCap,
          fdv: item.fdv,
          liquidityUsd: item.liquidity,
          note: 'Alpha token list'
        }])
      }))
  },
  {
    key: 'binance_notice_listing',
    exchange: 'Binance',
    marketType: '公告',
    url: 'https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=48&pageNo=1&pageSize=20',
    parse: payload => (payload?.data?.articles || [])
      .filter(item => item && item.id && isGenericListingNotice(item.title))
      .map(item => {
        const title = String(item.title || '').trim();
        const baseAsset = parseNoticeBaseAsset(title);
        return {
          id: `BINANCE_NOTICE_${item.id}`,
          symbol: baseAsset || `BINANCE_NOTICE_${item.id}`,
          baseAsset,
          quoteAsset: '',
          name: title,
          board: 'Binance announcement',
          warning: /futures/i.test(title) ? 'FUTURES' : 'SPOT'
        };
      })
      .filter(item => !isStockDerivativeListing(item))
  },
  {
    key: 'kucoin_spot',
    exchange: 'KuCoin',
    marketType: '现货',
    url: 'https://api.kucoin.com/api/v2/symbols',
    parse: payload => (payload?.data || [])
      .filter(item => item && item.enableTrading !== false && item.symbol)
      .map(item => ({
        id: String(item.symbol).toUpperCase(),
        symbol: String(item.symbol).toUpperCase(),
        baseAsset: String(item.baseCurrency || '').toUpperCase(),
        quoteAsset: String(item.quoteCurrency || '').toUpperCase(),
        board: String(item.market || item.quoteCurrency || '').toUpperCase()
      }))
  },
  {
    key: 'kucoin_notice_listing',
    exchange: 'KuCoin',
    marketType: '公告',
    url: 'https://api.kucoin.com/api/v3/announcements?annType=new-listings&pageSize=20&page=1',
    emitRecentOnFirstRunMs: 24 * 60 * 60 * 1000,
    parse: payload => (payload?.data?.items || [])
      .filter(item => item && item.annId && isGenericListingNotice(item.annTitle, item.annType))
      .map(item => {
        const title = String(item.annTitle || '').trim();
        const baseAsset = parseNoticeBaseAsset(title);
        return {
          id: `KUCOIN_NOTICE_${item.annId}`,
          symbol: baseAsset || `KUCOIN_NOTICE_${item.annId}`,
          baseAsset,
          quoteAsset: '',
          name: title,
          board: item.annUrl || 'KuCoin announcement',
          warning: Array.isArray(item.annType) && item.annType.includes('futures-announcements') ? 'FUTURES' : 'SPOT',
          listedAt: item.cTime ? new Date(Number(item.cTime)).toISOString() : ''
        };
      })
      .filter(item => !isStockDerivativeListing(item))
  },
  {
    key: 'mexc_spot',
    exchange: 'MEXC',
    marketType: '现货',
    url: 'https://api.mexc.com/api/v3/defaultSymbols',
    parse: payload => (payload?.data || [])
      .map(item => {
        if (typeof item === 'string') return { id: item.toUpperCase(), symbol: item.toUpperCase() };
        return {
          id: String(item?.symbol || item?.defaultSymbol || '').toUpperCase(),
          symbol: String(item?.symbol || item?.defaultSymbol || '').toUpperCase(),
          baseAsset: String(item?.baseAsset || '').toUpperCase(),
          quoteAsset: String(item?.quoteAsset || '').toUpperCase()
        };
      })
      .filter(item => item.id)
  },
  {
    key: 'mexc_futures',
    exchange: 'MEXC',
    marketType: '合约',
    url: 'https://contract.mexc.com/api/v1/contract/detail',
    parse: payload => (payload?.data || [])
      .filter(item => item && item.symbol)
      .map(item => ({
        id: String(item.symbol).toUpperCase(),
        symbol: String(item.symbol).toUpperCase(),
        baseAsset: String(item.baseCoin || '').toUpperCase(),
        quoteAsset: String(item.quoteCoin || '').toUpperCase()
      }))
      .filter(item => !isStockDerivativeListing(item))
  },
  {
    key: 'upbit_spot',
    exchange: 'Upbit',
    marketType: '现货',
    url: 'https://api.upbit.com/v1/market/all',
    parse: payload => (Array.isArray(payload) ? payload : [])
      .filter(item => item && item.market)
      .map(item => {
        const parts = String(item.market).toUpperCase().split('-');
        return {
          id: String(item.market).toUpperCase(),
          symbol: String(item.market).toUpperCase(),
          baseAsset: parts[1] || '',
          quoteAsset: parts[0] || '',
          name: String(item.english_name || item.korean_name || '').trim(),
          warning: String(item.market_warning || '').trim()
        };
      })
  },
  {
    key: 'upbit_notice_listing',
    exchange: 'Upbit',
    marketType: '公告',
    url: 'https://api-manager.upbit.com/api/v1/announcements?os=web&per_page=20&category=trade&page=1',
    emitRecentOnFirstRunMs: 24 * 60 * 60 * 1000,
    parse: payload => (payload?.data?.notices || [])
      .filter(item => item && item.id && isUpbitListingNotice(item.title))
      .map(item => {
        const title = String(item.title || '').trim();
        const baseAsset = parseUpbitNoticeBaseAsset(title);
        const markets = parseUpbitNoticeMarkets(title);
        return {
          id: `UPBIT_NOTICE_${item.id}`,
          symbol: baseAsset || `UPBIT_NOTICE_${item.id}`,
          baseAsset,
          quoteAsset: markets.join('/'),
          name: title,
          board: 'Upbit announcement',
          warning: item.need_new_badge ? 'NEW' : '',
          listedAt: item.first_listed_at || item.listed_at || ''
        };
      })
  },
  {
    key: 'bithumb_spot',
    exchange: 'Bithumb',
    marketType: '现货',
    url: 'https://api.bithumb.com/public/ticker/ALL_KRW',
    parse: payload => Object.keys(payload?.data || {})
      .filter(key => key && key !== 'date')
      .map(key => ({
        id: `KRW-${String(key).toUpperCase()}`,
        symbol: `KRW-${String(key).toUpperCase()}`,
        baseAsset: String(key).toUpperCase(),
        quoteAsset: 'KRW'
      }))
  },
  {
    key: 'bithumb_notice_listing',
    exchange: 'Bithumb',
    marketType: '公告',
    url: 'https://api.bithumb.com/v1/notices?count=20&page=1',
    emitRecentOnFirstRunMs: 24 * 60 * 60 * 1000,
    parse: payload => (Array.isArray(payload) ? payload : [])
      .filter(item => item && item.title && isGenericListingNotice(item.title, item.categories))
      .map(item => {
        const title = String(item.title || '').trim();
        const baseAsset = parseNoticeBaseAsset(title);
        const id = String(item.pc_url || item.title || '').split('/').pop() || title;
        return {
          id: `BITHUMB_NOTICE_${id}`,
          symbol: baseAsset || `BITHUMB_NOTICE_${id}`,
          baseAsset,
          quoteAsset: title.includes('원화') ? 'KRW' : '',
          name: title,
          board: item.pc_url || 'Bithumb announcement',
          warning: 'NOTICE',
          listedAt: item.published_at ? new Date(String(item.published_at).replace(' ', 'T') + '+09:00').toISOString() : ''
        };
      })
      .filter(item => !isStockDerivativeListing(item))
  },
  {
    key: 'asterdex_spot',
    exchange: 'AsterDEX',
    marketType: '现货',
    url: 'https://sapi.asterdex.com/api/v3/exchangeInfo',
    parse: payload => (payload?.symbols || [])
      .filter(item => item && item.status === 'TRADING' && item.symbol)
      .map(item => ({
        id: String(item.symbol).toUpperCase(),
        symbol: String(item.symbol).toUpperCase(),
        baseAsset: String(item.baseAsset || '').toUpperCase(),
        quoteAsset: String(item.quoteAsset || '').toUpperCase(),
        board: 'ASTERDEX'
      }))
  },
  {
    key: 'hyperliquid_spot',
    exchange: 'Hyperliquid',
    marketType: '现货',
    method: 'POST',
    url: 'https://api.hyperliquid.xyz/info',
    body: { type: 'spotMeta' },
    parse: payload => {
      const tokens = Array.isArray(payload?.tokens) ? payload.tokens : [];
      const tokenByIndex = {};
      tokens.forEach(token => {
        tokenByIndex[String(token.index)] = token;
      });
      return (payload?.universe || [])
        .filter(item => item && item.name)
        .map(item => {
          const tokenIndexes = Array.isArray(item.tokens) ? item.tokens : [];
          const base = tokenByIndex[String(tokenIndexes[0])] || {};
          const quote = tokenByIndex[String(tokenIndexes[1])] || {};
          const name = String(item.name || '').toUpperCase();
          return {
            id: `SPOT:${name}`,
            symbol: name,
            baseAsset: String(base.name || '').toUpperCase(),
            quoteAsset: String(quote.name || '').toUpperCase(),
            name,
            board: item.isCanonical === false ? 'HYPERLIQUID_NON_CANONICAL' : 'HYPERLIQUID'
          };
        })
        .filter(item => item.id);
    }
  },
  {
    key: 'coinbase_spot',
    exchange: 'Coinbase',
    marketType: '现货',
    url: 'https://api.coinbase.com/api/v3/brokerage/market/products?product_type=SPOT',
    parse: payload => (payload?.products || [])
      .filter(item => item && item.product_id && item.product_type === 'SPOT' && item.trading_disabled !== true && item.is_disabled !== true)
      .map(item => ({
        id: String(item.product_id).toUpperCase(),
        symbol: String(item.product_id).toUpperCase(),
        baseAsset: String(item.base_currency_id || item.base_currency || '').toUpperCase(),
        quoteAsset: String(item.quote_currency_id || item.quote_currency || '').toUpperCase(),
        name: String(item.display_name || item.base_name || '').trim(),
        board: item.status === 'online' ? 'ONLINE' : String(item.status || '').toUpperCase(),
        warning: item.new ? 'NEW' : ''
      }))
  },
  {
    key: 'coinbase_intx_futures',
    exchange: 'Coinbase INTX',
    marketType: '合约',
    url: 'https://api.international.coinbase.com/api/v1/instruments',
    parse: payload => (Array.isArray(payload) ? payload : [])
      .filter(item => item && (item.symbol || item.instrument_id) && String(item.trading_state || item.status || 'TRADING').toUpperCase() !== 'OFFLINE')
      .map(item => ({
        id: String(item.symbol || item.instrument_id).toUpperCase(),
        symbol: String(item.symbol || item.instrument_id).toUpperCase(),
        baseAsset: String(item.base_asset_name || '').toUpperCase(),
        quoteAsset: String(item.quote_asset_name || '').toUpperCase(),
        name: String(item.type || item.contract_type || '').trim(),
        board: String(item.trading_state || item.status || '').toUpperCase()
      }))
  }
];

function normalizeContractCandidates(candidates = []) {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set();
  return candidates
    .map(item => ({
      source: String(item?.source || '').trim(),
      confidence: String(item?.confidence || 'candidate').trim(),
      chainId: String(item?.chainId || '').trim(),
      chainName: String(item?.chainName || '').trim(),
      contractAddress: String(item?.contractAddress || item?.address || '').trim(),
      symbol: String(item?.symbol || '').trim().toUpperCase(),
      name: String(item?.name || '').trim(),
      priceUsd: Number.isFinite(Number(item?.priceUsd)) ? Number(item.priceUsd) : null,
      marketCap: Number.isFinite(Number(item?.marketCap)) ? Number(item.marketCap) : null,
      fdv: Number.isFinite(Number(item?.fdv)) ? Number(item.fdv) : null,
      liquidityUsd: Number.isFinite(Number(item?.liquidityUsd)) ? Number(item.liquidityUsd) : null,
      pairUrl: String(item?.pairUrl || '').trim(),
      note: String(item?.note || '').trim()
    }))
    .filter(item => item.contractAddress)
    .filter(item => {
      const valuation = Number.isFinite(item.marketCap) && item.marketCap > 0 ? item.marketCap : item.fdv;
      return !(Number.isFinite(valuation) && valuation > 0 && valuation < 200000);
    })
    .filter(item => {
      const key = `${item.chainId.toLowerCase()}:${item.contractAddress.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function getListingSignalSearchTerm(signal = {}) {
  const base = String(signal.baseAsset || '').trim().toUpperCase();
  if (base) return base;
  const symbol = String(signal.symbol || '').trim().toUpperCase();
  if (!symbol) return '';
  if (symbol.includes('-')) return symbol.split('-').pop();
  if (symbol.includes('_')) return symbol.split('_')[0];
  return symbol.replace(/(USDT|USDC|FDUSD|BTC|ETH|BNB|KRW)$/i, '');
}

function normalizeAlphaChainName(chainId, chainName) {
  const raw = String(chainId || '').replace(/^CT_/i, '').trim();
  if (raw === '501') return 'Solana';
  if (raw === '56') return 'BSC';
  if (raw === '1') return 'Ethereum';
  if (raw === '8453') return 'Base';
  return String(chainName || raw || '').trim();
}

async function getAlphaContractCandidates(term) {
  const query = String(term || '').trim().toUpperCase();
  if (!query) return [];
  try {
    const tokens = await getAlphaTokenList();
    return normalizeContractCandidates(tokens
      .filter(token => {
        const symbol = String(token?.symbol || token?.cexCoinName || '').trim().toUpperCase();
        const name = String(token?.name || '').trim().toUpperCase();
        return symbol === query || name === query;
      })
      .map(token => ({
        source: 'Binance Alpha',
        confidence: 'high',
        chainId: String(token.chainId || '').replace(/^CT_/i, ''),
        chainName: normalizeAlphaChainName(token.chainId, token.chainName),
        contractAddress: token.contractAddress,
        symbol: token.symbol || token.cexCoinName || query,
        name: token.name || '',
        priceUsd: token.price,
        marketCap: token.marketCap,
        fdv: token.fdv,
        liquidityUsd: token.liquidity,
        note: 'Alpha symbol exact match'
      })));
  } catch (error) {
    return [];
  }
}

async function getDexScreenerContractCandidates(term) {
  const query = String(term || '').trim();
  if (!query) return [];
  try {
    const response = await axios.get('https://api.dexscreener.com/latest/dex/search', {
      timeout: 12000,
      params: { q: query },
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    const pairs = Array.isArray(response.data?.pairs) ? response.data.pairs : [];
    const upper = query.toUpperCase();
    return normalizeContractCandidates(pairs
      .map(pair => {
        const baseToken = pair?.baseToken || {};
        const symbol = String(baseToken.symbol || '').toUpperCase();
        const name = String(baseToken.name || '');
        const exact = symbol === upper || name.toUpperCase() === upper;
        return {
          source: 'DexScreener',
          confidence: exact ? 'medium' : 'low',
          chainId: String(pair.chainId || ''),
          chainName: String(pair.chainId || ''),
          contractAddress: baseToken.address || '',
          symbol,
          name,
          priceUsd: pair.priceUsd,
          marketCap: pair.marketCap,
          fdv: pair.fdv,
          liquidityUsd: pair?.liquidity?.usd,
          pairUrl: pair.url || '',
          note: exact ? 'symbol/name exact match' : 'search candidate'
        };
      })
      .filter(item => item.contractAddress && item.symbol)
      .sort((a, b) => {
        const exactA = a.confidence === 'medium' ? 1 : 0;
        const exactB = b.confidence === 'medium' ? 1 : 0;
        if (exactA !== exactB) return exactB - exactA;
        return Number(b.liquidityUsd || 0) - Number(a.liquidityUsd || 0);
      })
      .slice(0, 8));
  } catch (error) {
    return [];
  }
}

async function resolveListingContractCandidates(signal = {}) {
  const term = getListingSignalSearchTerm(signal);
  if (!term || term.length < 2) return [];
  const [alphaCandidates, dexCandidates] = await Promise.all([
    getAlphaContractCandidates(term),
    getDexScreenerContractCandidates(term)
  ]);
  return normalizeContractCandidates([...alphaCandidates, ...dexCandidates]).slice(0, 6);
}

function emptyListingSignals() {
  return {
    baselines: {},
    statuses: {},
    signals: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizeListingSignals(payload = {}) {
  const now = new Date().toISOString();
  const baselines = payload.baselines && typeof payload.baselines === 'object' ? payload.baselines : {};
  const statuses = payload.statuses && typeof payload.statuses === 'object' ? payload.statuses : {};
  const signals = Array.isArray(payload.signals) ? payload.signals : [];
  return {
    baselines,
    statuses,
    signals: signals
      .filter(item => item && item.sourceKey && item.symbol)
      .map(item => ({
        id: String(item.id || `${item.sourceKey}_${item.symbol}_${item.detectedAt || now}`),
        sourceKey: String(item.sourceKey || ''),
        exchange: String(item.exchange || ''),
        marketType: String(item.marketType || ''),
        symbol: String(item.symbol || '').toUpperCase(),
        baseAsset: String(item.baseAsset || '').toUpperCase(),
        quoteAsset: String(item.quoteAsset || '').toUpperCase(),
        name: String(item.name || '').trim(),
        board: String(item.board || '').trim(),
        warning: String(item.warning || '').trim(),
        contractCandidates: normalizeContractCandidates(item.contractCandidates || []),
        detectedAt: String(item.detectedAt || now),
        listedAt: String(item.listedAt || item.sourcePublishedAt || '').trim(),
        note: String(item.note || '').trim()
      })),
    updatedAt: String(payload.updatedAt || now)
  };
}

async function loadListingSignals() {
  try {
    const raw = await fs.readFile(LISTING_SIGNALS_PATH, 'utf8');
    return normalizeListingSignals(JSON.parse(raw));
  } catch (error) {
    return emptyListingSignals();
  }
}

async function saveListingSignals(payload) {
  const next = normalizeListingSignals({
    ...payload,
    updatedAt: new Date().toISOString()
  });
  await fs.writeFile(LISTING_SIGNALS_PATH, JSON.stringify(next, null, 2));
  return next;
}

function trimListingSignals(signals) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const seenOpenNewsKeys = new Set();
  return signals
    .filter(item => !isStockDerivativeListing(item))
    .filter(item => {
      const time = Date.parse(item.detectedAt || '');
      return !Number.isFinite(time) || time >= cutoff;
    })
    .sort((a, b) => {
      if (a.sourceKey === 'opennews_6551_listing' && b.sourceKey === 'opennews_6551_listing') {
        const aKey = `${String(a.quoteAsset || '').toUpperCase()}_${String(a.baseAsset || a.symbol || '').toUpperCase()}`;
        const bKey = `${String(b.quoteAsset || '').toUpperCase()}_${String(b.baseAsset || b.symbol || '').toUpperCase()}`;
        if (aKey === bKey) {
          const aScore = Number(String(a.warning || '').match(/SCORE\s+(\d+)/i)?.[1] || 0);
          const bScore = Number(String(b.warning || '').match(/SCORE\s+(\d+)/i)?.[1] || 0);
          if (aScore !== bScore) return bScore - aScore;
          return String(a.listedAt || '').localeCompare(String(b.listedAt || ''));
        }
      }
      return 0;
    })
    .filter(item => {
      if (item.sourceKey !== 'opennews_6551_listing') return true;
      const key = `${String(item.quoteAsset || '').toUpperCase()}_${String(item.baseAsset || item.symbol || '').toUpperCase()}`;
      if (seenOpenNewsKeys.has(key)) return false;
      seenOpenNewsKeys.add(key);
      return true;
    })
    .sort((a, b) => String(b.detectedAt || '').localeCompare(String(a.detectedAt || '')))
    .slice(0, 300);
}

async function fetchListingSource(source) {
  const nowMs = Date.now();
  if (source.minIntervalMs && source._lastFetchedAt && nowMs - source._lastFetchedAt < source.minIntervalMs) {
    source._lastFetchWasCached = true;
    return source._lastRows || [];
  }
  source._lastFetchWasCached = false;
  const method = String(source.method || 'GET').toUpperCase();
  const requestConfig = {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      ...(source.headers || {})
    }
  };
  if (source.openNewsAuth) {
    if (!OPENNEWS_TOKEN) throw new Error('OPENNEWS_TOKEN is not configured');
    requestConfig.headers.Authorization = `Bearer ${OPENNEWS_TOKEN}`;
  }
  if (method === 'POST') {
    requestConfig.headers['Content-Type'] = 'application/json';
  }
  const response = method === 'POST'
    ? await axios.post(source.url, source.body || {}, requestConfig)
    : await axios.get(source.url, requestConfig);
  const rows = source.parse(response.data) || [];
  const seen = new Set();
  const normalizedRows = rows
    .filter(item => item && item.id)
    .map(item => ({
      ...item,
      id: String(item.id || item.symbol).toUpperCase(),
      symbol: String(item.symbol || item.id).toUpperCase()
    }))
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  source._lastFetchedAt = nowMs;
  source._lastRows = normalizedRows;
  return normalizedRows;
}

async function runListingSignalsCheck() {
  const payload = await loadListingSignals();
  const now = new Date().toISOString();
  const nextBaselines = { ...(payload.baselines || {}) };
  const nextStatuses = { ...(payload.statuses || {}) };
  const nextSignals = [...(payload.signals || [])];
  let newCount = 0;

  await Promise.all(LISTING_SIGNAL_SOURCES.map(async source => {
    try {
      const rows = await fetchListingSource(source);
      const skippedByInterval = Boolean(source._lastFetchWasCached);
      const currentIds = rows.map(item => item.id);
      const previousIds = Array.isArray(nextBaselines[source.key]) ? nextBaselines[source.key] : null;
      const previousSet = new Set(previousIds || []);
      const isFirstRun = !previousIds;
      let newRows = isFirstRun ? [] : rows.filter(item => !previousSet.has(item.id));
      const rowById = new Map(rows.map(item => [item.id, item]));
      for (const signal of nextSignals) {
        if (signal.sourceKey !== source.key || signal.listedAt) continue;
        const rowId = String(signal.id || '').startsWith(`${source.key}_`)
          ? String(signal.id).slice(`${source.key}_`.length).split('_').slice(0, -2).join('_')
          : '';
        const matchedRow = rowById.get(rowId);
        if (matchedRow?.listedAt) signal.listedAt = matchedRow.listedAt;
      }
      if (isFirstRun && source.emitRecentOnFirstRunMs) {
        const recentCutoff = Date.now() - Number(source.emitRecentOnFirstRunMs);
        newRows = rows.filter(item => {
          const time = Date.parse(item.listedAt || item.detectedAt || '');
          return Number.isFinite(time) && time >= recentCutoff;
        });
      }

      for (const item of newRows) {
        const signal = {
          id: `${source.key}_${item.id}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          sourceKey: source.key,
          exchange: source.exchange,
          marketType: source.marketType,
          symbol: item.symbol,
          baseAsset: item.baseAsset || '',
          quoteAsset: item.quoteAsset || '',
          name: item.name || '',
          board: item.board || '',
          warning: item.warning || '',
          detectedAt: now,
          listedAt: item.listedAt || '',
          note: isFirstRun && source.emitRecentOnFirstRunMs ? 'recent announcement on source init' : (isFirstRun ? 'baseline initialized' : '')
        };
        const presetCandidates = normalizeContractCandidates(item.contractCandidates || []);
        const resolvedCandidates = presetCandidates.length ? presetCandidates : await resolveListingContractCandidates(signal);
        signal.contractCandidates = resolvedCandidates;
        nextSignals.push(signal);
        newCount += 1;
      }

      nextBaselines[source.key] = currentIds;
      nextStatuses[source.key] = {
        key: source.key,
        exchange: source.exchange,
        marketType: source.marketType,
        ok: true,
        initialized: true,
        firstRun: isFirstRun,
        count: rows.length,
        newCount: newRows.length,
        lastCheckedAt: now,
        cacheNote: skippedByInterval ? `cached; next paid fetch after ${Math.ceil((source.minIntervalMs - (Date.now() - source._lastFetchedAt)) / 1000)}s` : '',
        error: ''
      };
    } catch (error) {
      nextStatuses[source.key] = {
        key: source.key,
        exchange: source.exchange,
        marketType: source.marketType,
        ok: false,
        initialized: Boolean(nextBaselines[source.key]),
        count: Array.isArray(nextBaselines[source.key]) ? nextBaselines[source.key].length : 0,
        newCount: 0,
        lastCheckedAt: now,
        error: error.message
      };
    }
  }));

  return saveListingSignals({
    baselines: nextBaselines,
    statuses: nextStatuses,
    signals: trimListingSignals(nextSignals),
    updatedAt: now,
    lastCheck: {
      checkedAt: now,
      newCount
    }
  });
}

let openNewsRealtimeSocket = null;
let openNewsRealtimeReconnectTimer = null;

async function ingestOpenNewsListingArticle(article = {}) {
  if (!isOpenNewsActionableListing(article)) return false;
  const row = openNewsArticleToListingRow(article);
  if (!row.id || !row.symbol) return false;
  const payload = await loadListingSignals();
  const now = new Date().toISOString();
  const signals = [...(payload.signals || [])];
  const duplicate = signals.some(signal => {
    if (signal.sourceKey !== 'opennews_6551_listing') return false;
    if (String(signal.id || '').includes(row.id)) return true;
    const sameSymbol = String(signal.baseAsset || signal.symbol || '').toUpperCase() === String(row.baseAsset || row.symbol || '').toUpperCase();
    const sameSource = String(signal.quoteAsset || '').toUpperCase() === String(row.quoteAsset || '').toUpperCase();
    const signalTime = Date.parse(signal.listedAt || signal.detectedAt || '');
    const rowTime = Date.parse(row.listedAt || '');
    return sameSymbol && sameSource && Number.isFinite(signalTime) && Number.isFinite(rowTime) && Math.abs(signalTime - rowTime) < 5 * 60 * 1000;
  });
  if (duplicate) return false;
  const signal = {
    id: `opennews_6551_listing_${row.id}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    sourceKey: 'opennews_6551_listing',
    exchange: '6551News',
    marketType: '快讯',
    symbol: row.symbol,
    baseAsset: row.baseAsset || '',
    quoteAsset: row.quoteAsset || '',
    name: row.name || '',
    board: row.board || '',
    warning: row.warning || '',
    detectedAt: now,
    listedAt: row.listedAt || '',
    note: 'opennews websocket'
  };
  signal.contractCandidates = await resolveListingContractCandidates(signal);
  const baselines = { ...(payload.baselines || {}) };
  baselines.opennews_6551_listing = Array.from(new Set([...(baselines.opennews_6551_listing || []), row.id]));
  const statuses = { ...(payload.statuses || {}) };
  statuses.opennews_6551_listing = {
    ...(statuses.opennews_6551_listing || {}),
    key: 'opennews_6551_listing',
    exchange: '6551News',
    marketType: '快讯',
    ok: true,
    initialized: true,
    count: Array.isArray(baselines.opennews_6551_listing) ? baselines.opennews_6551_listing.length : 0,
    newCount: 1,
    lastCheckedAt: now,
    cacheNote: 'websocket realtime',
    error: ''
  };
  await saveListingSignals({
    ...payload,
    baselines,
    statuses,
    signals: trimListingSignals([signal, ...signals]),
    updatedAt: now,
    lastCheck: { checkedAt: now, newCount: 1 }
  });
  console.log(`opennews realtime listing: ${signal.symbol} ${signal.name}`);
  return true;
}

function scheduleOpenNewsRealtimeReconnect(delayMs = 5 * 60 * 1000) {
  clearTimeout(openNewsRealtimeReconnectTimer);
  openNewsRealtimeReconnectTimer = setTimeout(() => {
    startOpenNewsRealtimeListing();
  }, delayMs);
  openNewsRealtimeReconnectTimer.unref?.();
}

function startOpenNewsRealtimeListing() {
  if (!OPENNEWS_TOKEN) return;
  if (typeof WebSocket !== 'function') {
    console.warn('OpenNews realtime skipped: WebSocket is not available in this Node runtime.');
    return;
  }
  try {
    if (openNewsRealtimeSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(openNewsRealtimeSocket.readyState)) return;
    const wsUrl = `${OPENNEWS_WSS_URL}?token=${encodeURIComponent(OPENNEWS_TOKEN)}`;
    const socket = new WebSocket(wsUrl);
    openNewsRealtimeSocket = socket;
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'news.subscribe',
        params: {
          engineTypes: { listing: [] },
          hasCoin: true
        }
      }));
      console.log('OpenNews realtime listing subscribed.');
    });
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(String(event.data || ''));
        if (!['news.update', 'news.ai_update'].includes(message.method)) return;
        ingestOpenNewsListingArticle(message.params || {}).catch(error => {
          console.error('OpenNews realtime ingest failed:', error.message);
        });
      } catch (error) {
        console.error('OpenNews realtime message parse failed:', error.message);
      }
    });
    socket.addEventListener('error', event => {
      console.error('OpenNews realtime socket error:', event?.message || 'unknown error');
    });
    socket.addEventListener('close', () => {
      if (openNewsRealtimeSocket === socket) openNewsRealtimeSocket = null;
      scheduleOpenNewsRealtimeReconnect();
    });
  } catch (error) {
    console.error('OpenNews realtime start failed:', error.message);
    scheduleOpenNewsRealtimeReconnect();
  }
}

// 保存白名单邮箱
async function saveWhitelist(whitelist) {
  await fs.writeFile(WHITELIST_PATH, JSON.stringify(whitelist, null, 2));
}

async function saveLinkageWhitelist(whitelist) {
  const emails = Array.isArray(whitelist?.emails)
    ? whitelist.emails.map(email => String(email || '').toLowerCase().trim()).filter(Boolean)
    : [];
  const payload = {
    emails: [...new Set(emails)],
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(LINKAGE_WHITELIST_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

async function loadWalletWhitelist() {
  try {
    const data = await fs.readFile(WALLET_WHITELIST_PATH, 'utf8');
    const parsed = JSON.parse(data);
    const wallets = Array.isArray(parsed.wallets) ? parsed.wallets : [];
    return {
      wallets: wallets
        .map(item => String(item || '').trim().toLowerCase())
        .filter(Boolean)
    };
  } catch (error) {
    return { wallets: [] };
  }
}

async function saveWalletWhitelist(payload) {
  const wallets = Array.isArray(payload?.wallets) ? payload.wallets : [];
  const next = {
    wallets: [...new Set(wallets
      .map(item => String(item || '').trim().toLowerCase())
      .filter(Boolean))],
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(WALLET_WHITELIST_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function loadPositionPlans() {
  try {
    const data = await fs.readFile(POSITION_PLANS_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.plans || [];
  } catch (error) {
    return [];
  }
}

async function savePositionPlans(plans) {
  const payload = {
    plans,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(POSITION_PLANS_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

async function loadThinktankPosts() {
  try {
    const data = await fs.readFile(THINKTANK_POSTS_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.posts || [];
  } catch (error) {
    return [];
  }
}

async function saveThinktankPosts(posts) {
  const payload = {
    posts,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(THINKTANK_POSTS_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

async function loadNavHistory() {
  try {
    const data = await fs.readFile(NAV_HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.candles || [];
  } catch (error) {
    return [];
  }
}

async function saveNavHistory(candles) {
  const payload = {
    candles,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(NAV_HISTORY_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function normalizeContactLink(item = {}) {
  const label = String(item.label || '').trim();
  const url = String(item.url || '').trim();
  return { label, url };
}

function normalizeContactQrcode(item = {}) {
  const label = String(item.label || '').trim();
  const dataUrl = String(item.dataUrl || '').trim();
  return { label, dataUrl };
}

function normalizeContactConfig(raw = {}) {
  const links = Array.isArray(raw.links)
    ? raw.links.map(normalizeContactLink).filter(item => item.label && item.url)
    : [];
  const qrcodes = Array.isArray(raw.qrcodes)
    ? raw.qrcodes.map(normalizeContactQrcode).filter(item => item.label && item.dataUrl)
    : [];
  const legacyQrcodeDataUrl = String(raw.qrcodeDataUrl || '').trim();
  const normalizedQrcodes = qrcodes.length
    ? qrcodes
    : (legacyQrcodeDataUrl ? [{ label: '官方二维码', dataUrl: legacyQrcodeDataUrl }] : []);
  return {
    title: String(raw.title || '联系我们').trim() || '联系我们',
    subtitle: String(raw.subtitle || '欢迎通过下方方式与我们取得联系').trim(),
    qrcodes: normalizedQrcodes,
    qrcodeDataUrl: normalizedQrcodes[0] ? normalizedQrcodes[0].dataUrl : '',
    links,
    updatedAt: String(raw.updatedAt || new Date().toISOString())
  };
}

async function loadContactConfig() {
  try {
    const data = await fs.readFile(CONTACT_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return normalizeContactConfig(parsed);
  } catch (error) {
    return normalizeContactConfig({});
  }
}

async function saveContactConfig(config) {
  const payload = normalizeContactConfig({
    ...config,
    updatedAt: new Date().toISOString()
  });
  await fs.writeFile(CONTACT_CONFIG_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

const PRESET_PRICE_LINE_TYPES = [
  { value: 'public_sale', label: '公售价格线' },
  { value: 'institution', label: '机构价格线' },
  { value: 'open_price', label: '代币开盘价格线' },
  { value: 'valuation', label: '估值价格线' },
  { value: 'k4h_resistance', label: '4小时K线压力位' },
  { value: 'k4h_support', label: '4小时K线支撑位' },
  { value: 'custom', label: '自定义价格线' }
];

const PRESET_PRICE_LINE_TYPE_MAP = PRESET_PRICE_LINE_TYPES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const DEFAULT_PORTFOLIO_TAG_LIBRARY = ['Meme', 'AI', 'DeFi', 'GameFi', 'L1', 'L2', 'RWA'];

function normalizeTagArray(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map(item => String(item || '').trim()).filter(Boolean))];
  }
  return [...new Set(String(input || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean))];
}

function normalizePortfolioPriceLine(item = {}, index = 0) {
  const rawType = String(item.type || 'custom').trim();
  const type = PRESET_PRICE_LINE_TYPE_MAP[rawType] ? rawType : 'custom';
  const numericPrice = Number(item.price);
  const fallbackName = PRESET_PRICE_LINE_TYPE_MAP[type] || '自定义价格线';
  const customName = String(item.name || '').trim();
  return {
    id: String(item.id || `line_${Date.now()}_${index}`),
    type,
    name: type === 'custom' ? (customName || fallbackName) : fallbackName,
    price: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : 0
  };
}

function normalizePortfolioTrade(item = {}, index = 0) {
  const quantity = Number(item.quantity);
  const price = Number(item.price);
  const fee = Number(item.fee);
  const side = String(item.side || 'buy').trim().toLowerCase() === 'sell' ? 'sell' : 'buy';
  const dateRaw = String(item.date || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? dateRaw
    : new Date().toISOString().slice(0, 10);

  return {
    id: String(item.id || `trade_${Date.now()}_${index}`),
    date,
    side,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
    price: Number.isFinite(price) && price > 0 ? price : 0,
    fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    note: String(item.note || '').trim()
  };
}

function normalizePortfolioOperationLog(item = {}, index = 0) {
  const action = String(item.action || '').trim() || '更新';
  const note = String(item.note || '').trim();
  const reason = String(item.reason || '').trim();
  const tsRaw = String(item.timestamp || item.time || '').trim();
  const iso = (() => {
    if (!tsRaw) return new Date().toISOString();
    const ms = Date.parse(tsRaw);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
  })();
  const price = Number(item.price);
  return {
    id: String(item.id || `op_${Date.now()}_${index}`),
    timestamp: iso,
    action,
    price: Number.isFinite(price) && price > 0 ? price : null,
    reason,
    note
  };
}

function normalizePortfolioToken(item = {}, index = 0) {
  const rawType = String(item.assetType || 'binance').trim().toLowerCase();
  const assetType = rawType === 'onchain' ? 'onchain' : 'binance';
  const chainIdRaw = String(item.chainId || '56').trim();
  const chainId = chainIdRaw || '56';
  const maxPositionPct = Number(item.maxPositionPct);
  const confirmedAvgCost = Number(item.confirmedAvgCost);
  const symbol = String(item.symbol || '').trim().toUpperCase();
  const reportUrlRaw = String(item.twitterUrl || '').trim();
  const twitterUrl = /^https?:\/\//i.test(reportUrlRaw) ? reportUrlRaw : '';
  const lines = Array.isArray(item.priceLines)
    ? item.priceLines.map((line, lineIndex) => normalizePortfolioPriceLine(line, lineIndex)).filter(line => line.name || line.price > 0)
    : [];
  const trades = Array.isArray(item.trades)
    ? item.trades.map((trade, tradeIndex) => normalizePortfolioTrade(trade, tradeIndex)).filter(trade => trade.quantity > 0 && trade.price > 0)
    : [];
  const tags = normalizeTagArray(item.tags);
  const expectedHoldingPeriod = String(item.expectedHoldingPeriod || '').trim();
  const allocationPlan = String(item.allocationPlan || '').trim();
  const currentStatus = String(item.currentStatus || '').trim();
  const recommendationTime = String(item.recommendationTime || '').trim();
  const targetPrice = Number(item.targetPrice);
  const targetMcap = Number(item.targetMcap);
  const resultTag = String(item.resultTag || '').trim();
  const closedAt = String(item.closedAt || '').trim();
  const operationLogs = Array.isArray(item.operationLogs)
    ? item.operationLogs.map((log, logIndex) => normalizePortfolioOperationLog(log, logIndex))
    : [];

  return {
    id: String(item.id || `token_${Date.now()}_${index}`),
    symbol,
    sectorTag: String(item.sectorTag || '').trim(),
    assetType,
    chainId,
    contractAddress: String(item.contractAddress || '').trim(),
    maxPositionPct: Number.isFinite(maxPositionPct) && maxPositionPct >= 0 ? maxPositionPct : 0,
    confirmedAvgCost: Number.isFinite(confirmedAvgCost) && confirmedAvgCost > 0 ? confirmedAvgCost : null,
    fundamentals: String(item.fundamentals || '').trim(),
    strategy: String(item.strategy || '').trim(),
    keyDate: String(item.keyDate || '').trim(),
    twitterUrl,
    recommendationTime,
    allocationPlan,
    expectedHoldingPeriod,
    targetPrice: Number.isFinite(targetPrice) && targetPrice > 0 ? targetPrice : null,
    targetMcap: Number.isFinite(targetMcap) && targetMcap > 0 ? targetMcap : null,
    currentStatus,
    resultTag,
    closedAt,
    operationLogs,
    tags,
    priceLines: lines,
    trades,
    updatedAt: new Date().toISOString()
  };
}

function normalizePortfolioManagerPayload(raw = {}) {
  const tokens = Array.isArray(raw.tokens)
    ? raw.tokens.map((item, index) => normalizePortfolioToken(item, index))
      .filter(item => item.symbol || item.contractAddress || item.trades.length || item.fundamentals || item.strategy)
    : [];
  const tagLibraryRaw = normalizeTagArray(raw.tagLibrary);
  const tagLibrary = tagLibraryRaw.length ? tagLibraryRaw : DEFAULT_PORTFOLIO_TAG_LIBRARY;

  return {
    tagLibrary,
    tokens,
    updatedAt: String(raw.updatedAt || new Date().toISOString())
  };
}

async function loadPortfolioManager() {
  try {
    const data = await fs.readFile(PORTFOLIO_MANAGER_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return normalizePortfolioManagerPayload(parsed);
  } catch (error) {
    return normalizePortfolioManagerPayload({});
  }
}

async function savePortfolioManager(payload) {
  const prev = await loadPortfolioManager();
  const normalized = normalizePortfolioManagerPayload({
    ...payload,
    updatedAt: new Date().toISOString()
  });
  const prevById = new Map((prev.tokens || []).map(item => [item.id, item]));
  for (const token of normalized.tokens || []) {
    const before = prevById.get(token.id);
    if (!before) continue;
    const changed = [];
    if (String(before.allocationPlan || '') !== String(token.allocationPlan || '')) changed.push('分仓策略');
    if (String(before.expectedHoldingPeriod || '') !== String(token.expectedHoldingPeriod || '')) changed.push('预期周期');
    if (Number(before.targetPrice || 0) !== Number(token.targetPrice || 0)) changed.push('目标价');
    if (Number(before.targetMcap || 0) !== Number(token.targetMcap || 0)) changed.push('目标市值');
    if (String(before.currentStatus || '') !== String(token.currentStatus || '')) changed.push('状态');
    if (!changed.length) continue;
    const nextLogs = Array.isArray(token.operationLogs) ? token.operationLogs : [];
    nextLogs.unshift(normalizePortfolioOperationLog({
      action: '策略更新',
      note: `自动留存：${changed.join('、')}变更`,
      reason: '后台保存触发'
    }, 0));
    token.operationLogs = nextLogs.slice(0, 120);
  }
  await fs.writeFile(PORTFOLIO_MANAGER_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

function computeTradeMetrics(trades = []) {
  const sortedTrades = [...trades].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  let quantity = 0;
  let costBasis = 0;
  let totalBuyCost = 0;
  let totalSellNet = 0;

  for (const trade of sortedTrades) {
    const tradeQty = Number(trade.quantity || 0);
    const tradePrice = Number(trade.price || 0);
    const tradeFee = Number(trade.fee || 0);
    if (!(tradeQty > 0) || !(tradePrice > 0)) continue;

    if (trade.side === 'buy') {
      quantity += tradeQty;
      const buyCost = tradeQty * tradePrice + tradeFee;
      costBasis += buyCost;
      totalBuyCost += buyCost;
      continue;
    }

    const sellQty = Math.min(quantity, tradeQty);
    if (sellQty <= 0) continue;
    const avgCost = quantity > 0 ? (costBasis / quantity) : 0;
    costBasis -= avgCost * sellQty;
    quantity -= sellQty;
    totalSellNet += tradeQty * tradePrice - tradeFee;
  }

  if (quantity <= 0.00000001) {
    quantity = 0;
    costBasis = 0;
  }

  const avgCost = quantity > 0 ? (costBasis / quantity) : null;
  const zeroCostQty = quantity > 0 && totalSellNet >= totalBuyCost ? quantity : null;

  return {
    quantity,
    costBasis,
    avgCost,
    zeroCostQty,
    totalBuyCost,
    totalSellNet
  };
}

function computePriceLinePosition(currentPrice, priceLines = []) {
  if (!(Number.isFinite(currentPrice) && currentPrice > 0)) return null;
  const sorted = priceLines
    .filter(line => Number.isFinite(Number(line.price)) && Number(line.price) > 0)
    .map(line => ({ ...line, price: Number(line.price) }))
    .sort((a, b) => a.price - b.price);

  if (!sorted.length) return null;

  let lower = null;
  let upper = null;
  for (const line of sorted) {
    if (line.price <= currentPrice) lower = line;
    if (line.price >= currentPrice && !upper) {
      upper = line;
      break;
    }
  }

  if (!lower) {
    return { zone: 'below_all', lower: null, upper, progressPct: null };
  }
  if (!upper) {
    return { zone: 'above_all', lower, upper: null, progressPct: null };
  }
  if (upper.id === lower.id || upper.price === lower.price) {
    return { zone: 'on_line', lower, upper, progressPct: 100 };
  }

  const progressPct = parseFloat((((currentPrice - lower.price) / (upper.price - lower.price)) * 100).toFixed(2));
  return {
    zone: 'between',
    lower,
    upper,
    progressPct: Math.max(0, Math.min(100, progressPct))
  };
}

async function resolvePortfolioTokenLivePrice(token, spotPrices) {
  if (token.assetType === 'onchain') {
    if (!token.contractAddress) return null;
    const chainId = String(token.chainId || '').toLowerCase() || '56';
    let priceData = null;
    if (chainId === 'sol') {
      priceData = await getSolanaTokenPrice(token.contractAddress);
    }
    if (!priceData) {
      priceData = await getWeb3TokenPrice(chainId, token.contractAddress);
    }
    if (priceData && Number.isFinite(Number(priceData.price)) && Number(priceData.price) > 0) {
      return { currentPrice: Number(priceData.price), priceSource: 'onchain' };
    }
    return null;
  }

  const symbol = String(token.symbol || '').trim().toUpperCase();
  if (!symbol) return null;
  if (symbol === 'USDT') {
    return { currentPrice: 1, priceSource: 'binance' };
  }
  const pair = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  if (Number.isFinite(spotPrices[pair]) && spotPrices[pair] > 0) {
    return { currentPrice: Number(spotPrices[pair]), priceSource: 'binance' };
  }
  const alphaTicker = await getBinanceAlphaTickerPriceBySymbol(symbol);
  if (alphaTicker && Number.isFinite(alphaTicker.price) && alphaTicker.price > 0) {
    return { currentPrice: alphaTicker.price, priceSource: 'alpha' };
  }
  return null;
}

function buildFundAssetLookupEntry(asset = {}) {
  const symbol = String(asset.symbol || '').trim().toUpperCase();
  const source = String(asset.source || '').trim().toLowerCase();
  const chainId = String(asset.chainId || '56').trim() || '56';
  const contractAddress = String(asset.contractAddress || '').trim().toLowerCase();
  const quantity = Number(asset.total || 0);
  const usdtValue = Number(asset.usdtValue || 0);
  const usdtPrice = Number(asset.usdtPrice || 0);
  if (!symbol || !(quantity > 0)) return null;

  if (source === 'alpha' && contractAddress) {
    return {
      key: `onchain:${chainId.toLowerCase()}:${contractAddress}`,
      kind: 'onchain',
      symbol,
      chainId,
      contractAddress,
      quantity,
      usdtValue: Number.isFinite(usdtValue) ? usdtValue : 0,
      usdtPrice: Number.isFinite(usdtPrice) ? usdtPrice : 0,
      source
    };
  }
  return {
    key: `binance:${symbol}`,
    kind: 'binance',
    symbol,
    chainId: null,
    contractAddress: null,
    quantity,
    usdtValue: Number.isFinite(usdtValue) ? usdtValue : 0,
    usdtPrice: Number.isFinite(usdtPrice) ? usdtPrice : 0,
    source: source || 'binance'
  };
}

function mergeFundAssetEntries(entries = []) {
  const map = new Map();
  for (const item of entries) {
    if (!item) continue;
    const prev = map.get(item.key);
    if (!prev) {
      map.set(item.key, { ...item });
      continue;
    }
    prev.quantity += item.quantity;
    prev.usdtValue += item.usdtValue;
    if (item.usdtPrice > 0) prev.usdtPrice = item.usdtPrice;
    map.set(item.key, prev);
  }
  return map;
}

function syncPortfolioTokensFromFundAssets(payload, fundAssets = []) {
  return {
    ...payload,
    autoCreatedCount: 0
  };
}

function computeAutoCostMetricsFromSnapshots(snapshots = [], overrideAvgCostBySymbol = {}) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return {};
  const sorted = [...snapshots].sort((a, b) => {
    const ta = Date.parse(String(a.timestamp || '')) || 0;
    const tb = Date.parse(String(b.timestamp || '')) || 0;
    return ta - tb;
  });

  const firstSnapshot = sorted[0] || { holdings: {} };
  const symbols = new Set();
  for (const snap of sorted) {
    for (const key of Object.keys(snap.holdings || {})) {
      const s = String(key || '').trim().toUpperCase();
      if (s && s !== 'USDT') symbols.add(s);
    }
  }

  const stateBySymbol = {};
  for (const symbol of symbols) {
    const startQty = Number((firstSnapshot.holdings || {})[symbol] || 0);
    const override = Number(overrideAvgCostBySymbol[symbol] || 0);
    const seededQty = startQty > 0 ? startQty : 0;
    const seededCost = seededQty > 0 && override > 0 ? seededQty * override : 0;
    stateBySymbol[symbol] = {
      quantity: seededQty,
      costBasis: seededCost,
      totalBuyCost: seededCost,
      totalSellNet: 0,
      seededWithOverride: seededQty > 0 && override > 0
    };
  }

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevHoldings = prev.holdings || {};
    const currHoldings = curr.holdings || {};
    const currPrices = curr.prices || {};
    const prevPrices = prev.prices || {};

    for (const symbol of symbols) {
      const s = String(symbol || '').toUpperCase();
      const prevQty = Number(prevHoldings[s] || 0);
      const currQty = Number(currHoldings[s] || 0);
      const delta = currQty - prevQty;
      if (Math.abs(delta) < 1e-12) continue;

      const row = stateBySymbol[s] || { quantity: 0, costBasis: 0, totalBuyCost: 0, totalSellNet: 0, seededWithOverride: false };
      const pNow = Number(currPrices[s] || 0);
      const pPrev = Number(prevPrices[s] || 0);
      const px = pNow > 0 ? pNow : (pPrev > 0 ? pPrev : null);

      if (delta > 0) {
        if (Number.isFinite(px) && px > 0) {
          row.quantity += delta;
          row.costBasis += delta * px;
          row.totalBuyCost += delta * px;
        } else {
          row.quantity += delta;
        }
      } else {
        const sellQty = Math.min(row.quantity, Math.abs(delta));
        if (sellQty > 0) {
          const avgCost = row.quantity > 0 ? row.costBasis / row.quantity : 0;
          row.costBasis -= avgCost * sellQty;
          row.quantity -= sellQty;
          const sellPrice = Number.isFinite(px) && px > 0 ? px : avgCost;
          row.totalSellNet += sellQty * sellPrice;
        }
      }

      if (row.quantity <= 0.00000001) {
        row.quantity = 0;
        row.costBasis = 0;
      }
      stateBySymbol[s] = row;
    }
  }

  const result = {};
  for (const symbol of Object.keys(stateBySymbol)) {
    const row = stateBySymbol[symbol];
    const avgCost = row.quantity > 0 ? (row.costBasis / row.quantity) : null;
    const zeroCostQty = row.quantity > 0 && row.totalSellNet >= row.totalBuyCost ? row.quantity : null;
    result[symbol] = {
      quantity: parseFloat(Number(row.quantity || 0).toFixed(8)),
      costBasis: parseFloat(Number(row.costBasis || 0).toFixed(8)),
      avgCost: avgCost ? parseFloat(avgCost.toFixed(8)) : null,
      zeroCostQty: zeroCostQty ? parseFloat(zeroCostQty.toFixed(8)) : null,
      totalBuyCost: parseFloat(Number(row.totalBuyCost || 0).toFixed(8)),
      totalSellNet: parseFloat(Number(row.totalSellNet || 0).toFixed(8)),
      seededWithOverride: Boolean(row.seededWithOverride)
    };
  }
  return result;
}

async function buildPortfolioManagerViewData() {
  const rawPayload = await loadPortfolioManager();
  const [spotPrices, snapshots] = await Promise.all([
    getAllPrices(),
    loadAssetSnapshots()
  ]);
  const payload = rawPayload;

  const overrideAvgCostBySymbol = {};
  for (const token of payload.tokens) {
    const symbol = String(token.symbol || '').trim().toUpperCase();
    const confirmedAvgCost = Number(token.confirmedAvgCost || 0);
    if (symbol && confirmedAvgCost > 0) {
      overrideAvgCostBySymbol[symbol] = confirmedAvgCost;
    }
  }
  const autoCostBySymbol = computeAutoCostMetricsFromSnapshots(snapshots, overrideAvgCostBySymbol);

  const enrichedTokens = [];

  for (const token of payload.tokens) {
    const manualTradeMetrics = computeTradeMetrics(token.trades || []);
    const livePrice = await resolvePortfolioTokenLivePrice(token, spotPrices);
    const symbol = String(token.symbol || '').trim().toUpperCase();
    const autoCost = autoCostBySymbol[symbol] || null;
    const effectiveTradeMetrics = autoCost
      ? {
          quantity: Number(autoCost.quantity || 0),
          costBasis: Number(autoCost.costBasis || 0),
          avgCost: Number(autoCost.avgCost || 0) || null,
          zeroCostQty: Number(autoCost.zeroCostQty || 0) || null,
          totalBuyCost: Number(autoCost.totalBuyCost || 0),
          totalSellNet: Number(autoCost.totalSellNet || 0)
        }
      : manualTradeMetrics;

    const currentPrice = livePrice
      ? Number(livePrice.currentPrice)
      : null;

    const linkedQuantity = Number(effectiveTradeMetrics.quantity || 0);
    const currentValue = Number.isFinite(currentPrice)
      ? parseFloat((linkedQuantity * currentPrice).toFixed(8))
      : null;

    const roiBaseAvgCost = effectiveTradeMetrics.avgCost;
    const pnlPct = (effectiveTradeMetrics.avgCost && Number.isFinite(currentPrice) && effectiveTradeMetrics.avgCost > 0)
      ? parseFloat((((currentPrice - effectiveTradeMetrics.avgCost) / effectiveTradeMetrics.avgCost) * 100).toFixed(4))
      : null;

    enrichedTokens.push({
      ...token,
      tradeMetrics: {
        quantity: parseFloat(Number(effectiveTradeMetrics.quantity || 0).toFixed(8)),
        costBasis: parseFloat(Number(effectiveTradeMetrics.costBasis || 0).toFixed(8)),
        avgCost: effectiveTradeMetrics.avgCost ? parseFloat(Number(effectiveTradeMetrics.avgCost).toFixed(8)) : null,
        zeroCostQty: effectiveTradeMetrics.zeroCostQty ? parseFloat(Number(effectiveTradeMetrics.zeroCostQty).toFixed(8)) : null,
        totalBuyCost: parseFloat(Number(effectiveTradeMetrics.totalBuyCost || 0).toFixed(8)),
        totalSellNet: parseFloat(Number(effectiveTradeMetrics.totalSellNet || 0).toFixed(8)),
        source: autoCost ? 'snapshot_auto' : 'manual_trades',
        seededWithOverride: autoCost ? Boolean(autoCost.seededWithOverride) : false
      },
      holdingMetrics: {
        quantity: parseFloat(linkedQuantity.toFixed(8)),
        linkedFromFund: false,
        currentValue,
        source: 'portfolio_manual'
      },
      currentPrice,
      currentValue,
      pnlPct,
      estimatedCostBasis: (roiBaseAvgCost && linkedQuantity > 0)
        ? parseFloat((linkedQuantity * roiBaseAvgCost).toFixed(8))
        : null,
      priceSource: livePrice ? livePrice.priceSource : null
    });
  }

  const calculatedFromRows = parseFloat(enrichedTokens.reduce((sum, item) => {
    return sum + (Number.isFinite(item.currentValue) ? Number(item.currentValue) : 0);
  }, 0).toFixed(8));
  const totalPortfolioValue = calculatedFromRows;

  const finalTokens = enrichedTokens.map(item => {
    const currentRatioPct = totalPortfolioValue > 0 && Number.isFinite(item.currentValue)
      ? parseFloat(((item.currentValue / totalPortfolioValue) * 100).toFixed(4))
      : null;
    const buildProgressPct = item.maxPositionPct > 0 && Number.isFinite(currentRatioPct)
      ? parseFloat(((currentRatioPct / item.maxPositionPct) * 100).toFixed(2))
      : null;
    return {
      ...item,
      ratioMetrics: {
        currentRatioPct,
        maxPositionPct: item.maxPositionPct,
        buildProgressPct
      },
      priceLinePosition: computePriceLinePosition(item.currentPrice, item.priceLines || [])
    };
  });

  const visibleTokens = finalTokens;

  const closedTokens = visibleTokens.filter(item => String(item.resultTag || '').trim());
  const winSet = new Set(['达成目标', '止盈', 'tp', 'hit']);
  const loseSet = new Set(['止损', 'sl', 'stop']);
  const winCount = closedTokens.filter(item => winSet.has(String(item.resultTag || '').trim())).length;
  const loseCount = closedTokens.filter(item => loseSet.has(String(item.resultTag || '').trim())).length;
  const validHoldDays = closedTokens
    .map(item => {
      const startMs = Date.parse(String(item.recommendationTime || '').trim());
      const endMs = Date.parse(String(item.closedAt || '').trim());
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
      return (endMs - startMs) / (24 * 3600 * 1000);
    })
    .filter(v => v != null);
  const avgHoldingDays = validHoldDays.length
    ? parseFloat((validHoldDays.reduce((a, b) => a + b, 0) / validHoldDays.length).toFixed(2))
    : null;
  const pnlList = closedTokens
    .map(item => Number(item.pnlPct))
    .filter(v => Number.isFinite(v));
  const pnlDistribution = {
    positive: pnlList.filter(v => v > 0).length,
    zero: pnlList.filter(v => v === 0).length,
    negative: pnlList.filter(v => v < 0).length
  };
  const reviewStats = {
    totalClosed: closedTokens.length,
    winCount,
    loseCount,
    hitRate: closedTokens.length ? parseFloat(((winCount / closedTokens.length) * 100).toFixed(2)) : null,
    avgHoldingDays,
    pnlDistribution
  };

  return {
    ...payload,
    tokens: visibleTokens,
    totalPortfolioValue,
    fundLinked: false,
    autoCostEngine: true,
    reviewStats
  };
}

async function loadAssetSnapshots() {
  try {
    const data = await fs.readFile(ASSET_SNAPSHOTS_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.snapshots || [];
  } catch (error) {
    return [];
  }
}

async function saveAssetSnapshots(snapshots) {
  const payload = {
    snapshots,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(ASSET_SNAPSHOTS_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function buildHoldingsMap(assets) {
  const map = {};
  for (const asset of assets) {
    const symbol = String(asset.symbol || '').toUpperCase().trim();
    if (!symbol || symbol === 'USDT') {
      continue;
    }
    const total = Number(asset.total);
    if (!Number.isFinite(total)) {
      continue;
    }
    map[symbol] = total;
  }
  return map;
}

function filterVisibleFundAssets(assets = []) {
  return (Array.isArray(assets) ? assets : []).filter(asset => {
    const symbol = String(asset?.symbol || '').toUpperCase().trim();
    if (!symbol) return false;
    if (isStableCoinSymbol(symbol)) {
      const qty = Number(asset?.total || 0);
      return Number.isFinite(qty) && qty > 0;
    }
    const usdtValue = Number(asset?.usdtValue || 0);
    return Number.isFinite(usdtValue) && usdtValue >= FUND_ASSET_MIN_VISIBLE_USD;
  });
}

function isSameHoldingsMap(a, b) {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }
    if (Math.abs(Number(a[aKeys[i]]) - Number(b[bKeys[i]])) > 1e-12) {
      return false;
    }
  }
  return true;
}

function buildChangesBetweenSnapshots(previousSnapshot, currentSnapshot, context = {}) {
  if (!previousSnapshot || !currentSnapshot) {
    return [];
  }
  const BNB_FEE_DUST_THRESHOLD = 0.02;
  const currentPriceBySymbol = context.currentPriceBySymbol || {};
  const totalValue = Number(context.totalValue || 0);
  const symbols = new Set([
    ...Object.keys(previousSnapshot.holdings || {}),
    ...Object.keys(currentSnapshot.holdings || {})
  ]);
  const changes = [];
  for (const symbol of symbols) {
    if (symbol === 'USDT') {
      continue;
    }
    const prev = Number(previousSnapshot.holdings[symbol] || 0);
    const curr = Number(currentSnapshot.holdings[symbol] || 0);
    const delta = curr - prev;
    if (Math.abs(delta) < 1e-12) {
      continue;
    }
    // Hide tiny BNB fee burn from position broadcast.
    if (symbol === 'BNB' && delta < 0 && Math.abs(delta) <= BNB_FEE_DUST_THRESHOLD) {
      continue;
    }
    const currentPrice = Number(currentPriceBySymbol[symbol] || 0);
    let previousRatio = null;
    let currentRatio = null;
    let deltaRatio = null;
    if (Number.isFinite(currentPrice) && currentPrice > 0 && totalValue > 0) {
      previousRatio = parseFloat(((prev * currentPrice / totalValue) * 100).toFixed(4));
      currentRatio = parseFloat(((curr * currentPrice / totalValue) * 100).toFixed(4));
      deltaRatio = parseFloat((currentRatio - previousRatio).toFixed(4));
    }
    changes.push({
      symbol,
      previousAmount: parseFloat(prev.toFixed(8)),
      currentAmount: parseFloat(curr.toFixed(8)),
      deltaAmount: parseFloat(delta.toFixed(8)),
      direction: delta > 0 ? 'increase' : 'decrease',
      previousRatio,
      currentRatio,
      deltaRatio
    });
  }
  changes.sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount));
  return changes;
}

async function updateAssetSnapshotsAndBuildChanges(assets) {
  const holdingsMap = buildHoldingsMap(assets);
  const currentPriceBySymbol = {};
  let totalValue = 0;
  for (const asset of assets || []) {
    const symbol = String(asset.symbol || '').toUpperCase().trim();
    const usdtPrice = Number(asset.usdtPrice || 0);
    const usdtValue = Number(asset.usdtValue || 0);
    if (symbol && Number.isFinite(usdtPrice) && usdtPrice > 0) {
      currentPriceBySymbol[symbol] = usdtPrice;
    }
    if (Number.isFinite(usdtValue) && usdtValue > 0) {
      totalValue += usdtValue;
    }
  }
  const ratioContext = { currentPriceBySymbol, totalValue };
  const snapshots = await loadAssetSnapshots();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = getShanghaiDateString(now);
  const lastSnapshot = snapshots[snapshots.length - 1];

  const hasChangedSinceLast = !lastSnapshot || !isSameHoldingsMap(lastSnapshot.holdings || {}, holdingsMap);
  const shouldAppend = !lastSnapshot || hasChangedSinceLast;

  if (shouldAppend) {
    snapshots.push({
      date: today,
      timestamp: nowIso,
      holdings: holdingsMap,
      prices: currentPriceBySymbol
    });
  }

  const trimmed = snapshots.slice(-720);
  await saveAssetSnapshots(trimmed);

  const currentSnapshot = trimmed[trimmed.length - 1];
  const previousSnapshot = trimmed.length > 1 ? trimmed[trimmed.length - 2] : null;
  const historyWindowDays = 7;
  const historyCutoff = Date.now() - historyWindowDays * 24 * 60 * 60 * 1000;

  const changeHistory = [];
  for (let i = 1; i < trimmed.length; i += 1) {
    const prev = trimmed[i - 1];
    const curr = trimmed[i];
    const currentTs = Date.parse(curr.timestamp || '');
    if (Number.isFinite(currentTs) && currentTs < historyCutoff) {
      continue;
    }
    const changes = buildChangesBetweenSnapshots(prev, curr, ratioContext);
    if (!changes.length) {
      continue;
    }
    changeHistory.push({
      date: curr.date || null,
      baselineTimestamp: prev.timestamp || null,
      timestamp: curr.timestamp || null,
      changes
    });
  }
  changeHistory.sort((a, b) => {
    const ta = Date.parse(a.timestamp || '') || 0;
    const tb = Date.parse(b.timestamp || '') || 0;
    return tb - ta;
  });
  const limitedHistory = changeHistory.slice(0, historyWindowDays);

  if (!previousSnapshot) {
    return {
      baselineTimestamp: null,
      changes: [],
      history: [],
      historyWindowDays
    };
  }
  const changes = buildChangesBetweenSnapshots(previousSnapshot, currentSnapshot, ratioContext);

  return {
    baselineTimestamp: previousSnapshot.timestamp || null,
    changes,
    history: limitedHistory,
    historyWindowDays
  };
}

function getShanghaiDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function parseFlexibleDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const zhMatch = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (zhMatch) {
    const y = Number(zhMatch[1]);
    const m = Number(zhMatch[2]);
    const d = Number(zhMatch[3]);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const dashMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    const y = Number(dashMatch[1]);
    const m = Number(dashMatch[2]);
    const d = Number(dashMatch[3]);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getCurrentDaysFromJoin(joinedAt) {
  const joinedDate = parseFlexibleDate(joinedAt);
  if (!joinedDate) return 0;
  const now = new Date();
  const todayStr = getShanghaiDateString(now);
  const today = parseFlexibleDate(todayStr);
  if (!today) return 0;
  const diffMs = today.getTime() - joinedDate.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function calculateInvestorSettlementMetrics(investor, currentNav) {
  const amount = Number(investor.amount || 0);
  const shares = Number(investor.shares || 0);
  const nav = Number(currentNav || 0);

  const currentDays = getCurrentDaysFromJoin(investor.joinedAt);
  let profitShareRatio = 0;
  if (currentDays >= 30) {
    profitShareRatio = 0.5 + 0.2 * Math.pow(currentDays / 365, 1.5);
    if (!Number.isFinite(profitShareRatio)) {
      profitShareRatio = 0;
    }
    profitShareRatio = Math.min(Math.max(profitShareRatio, 0), 1);
  }

  const currentAsset = shares * nav;
  const profit = currentAsset - amount;
  const investorShare = profit > 0 ? profit * profitShareRatio : 0;
  const managerShare = profit > 0 ? profit - investorShare : 0;

  return {
    currentDays,
    profitShareRatio: parseFloat((profitShareRatio * 100).toFixed(2)),
    currentAsset: parseFloat(currentAsset.toFixed(4)),
    profit: parseFloat(profit.toFixed(4)),
    investorShare: parseFloat(investorShare.toFixed(4)),
    managerShare: parseFloat(managerShare.toFixed(4))
  };
}

function normalizeInvestorRecord(item, index) {
  const amount = Number(item.amount);
  const buyNav = Number(item.buyNav);
  const shares = Number(item.shares);
  const queryCodeRaw = String(item.queryCode || '').trim();
  const queryCode = /^\d{4}$/.test(queryCodeRaw)
    ? queryCodeRaw
    : String(1000 + ((Date.now() + index) % 9000));
  const queryCodesRaw = Array.isArray(item.queryCodes) ? item.queryCodes : [];
  const queryCodes = [...new Set([
    queryCode,
    ...queryCodesRaw.map(code => String(code || '').trim()).filter(code => /^\d{4}$/.test(code))
  ])];

  return {
    name: String(item.name || '').trim(),
    amount: Number.isFinite(amount) ? amount : 0,
    joinedAt: String(item.joinedAt || '').trim(),
    lockPeriod: String(item.lockPeriod || '').trim() || '1Y',
    buyNav: Number.isFinite(buyNav) ? buyNav : 1,
    shares: Number.isFinite(shares) ? shares : 0,
    queryCode,
    queryCodes
  };
}

function normalizeQueryCodeInput(rawValue) {
  const raw = String(rawValue || '');
  const normalized = raw
    .trim()
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248))
    .replace(/\s+/g, '');
  return normalized;
}

async function updateNavHistorySnapshot(fundData) {
  const today = getShanghaiDateString();
  const nextClose = parseFloat(Number(fundData.fund.currentNav).toFixed(4));
  const nextTotalValue = parseFloat(Number(fundData.totalValue).toFixed(4));
  const nextTotalShares = parseFloat(Number(fundData.fund.totalShares).toFixed(6));
  const candles = await loadNavHistory();
  const lastCandle = candles[candles.length - 1];

  if (lastCandle && lastCandle.date === today) {
    lastCandle.high = parseFloat(Math.max(Number(lastCandle.high), nextClose).toFixed(4));
    lastCandle.low = parseFloat(Math.min(Number(lastCandle.low), nextClose).toFixed(4));
    lastCandle.close = nextClose;
    lastCandle.totalValue = nextTotalValue;
    lastCandle.totalShares = nextTotalShares;
    lastCandle.updatedAt = new Date().toISOString();
  } else {
    candles.push({
      date: today,
      open: nextClose,
      high: nextClose,
      low: nextClose,
      close: nextClose,
      totalValue: nextTotalValue,
      totalShares: nextTotalShares,
      updatedAt: new Date().toISOString()
    });
  }

  const trimmed = candles.slice(-365);
  await saveNavHistory(trimmed);
  return trimmed;
}

async function loadFundConfig() {
  try {
    const data = await fs.readFile(FUND_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return {
      totalShares: Number(parsed.totalShares) || DEFAULT_FUND_CONFIG.totalShares,
      initialNav: Number(parsed.initialNav) || DEFAULT_FUND_CONFIG.initialNav,
      stageCap: Number(parsed.stageCap) || DEFAULT_FUND_CONFIG.stageCap,
      totalBurned: Number(parsed.totalBurned) || DEFAULT_FUND_CONFIG.totalBurned,
      updatedAt: parsed.updatedAt || null
    };
  } catch (error) {
    return { ...DEFAULT_FUND_CONFIG, updatedAt: null };
  }
}

async function saveFundConfig(config) {
  const nextConfig = {
    totalShares: Number(config.totalShares),
    initialNav: Number(config.initialNav || DEFAULT_FUND_CONFIG.initialNav),
    stageCap: Number(config.stageCap || DEFAULT_FUND_CONFIG.stageCap),
    totalBurned: Number(config.totalBurned || DEFAULT_FUND_CONFIG.totalBurned),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(FUND_CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
  return nextConfig;
}

function isAdminAuthorized(candidate) {
  return Boolean(ADMIN_PASSWORD) && candidate === ADMIN_PASSWORD;
}

async function loadHunterConfig() {
  try {
    const raw = await fs.readFile(HUNTER_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      scoreThreshold: Number.isFinite(Number(parsed.scoreThreshold)) ? Number(parsed.scoreThreshold) : HUNTER_DEFAULT_CONFIG.scoreThreshold,
      maxExitRate: Number.isFinite(Number(parsed.maxExitRate)) ? Number(parsed.maxExitRate) : HUNTER_DEFAULT_CONFIG.maxExitRate,
      minSamplePerHour: Number.isFinite(Number(parsed.minSamplePerHour)) ? Number(parsed.minSamplePerHour) : HUNTER_DEFAULT_CONFIG.minSamplePerHour,
      pushTopN: Number.isFinite(Number(parsed.pushTopN)) ? Number(parsed.pushTopN) : HUNTER_DEFAULT_CONFIG.pushTopN,
      updatedAt: parsed.updatedAt || null
    };
  } catch (error) {
    return { ...HUNTER_DEFAULT_CONFIG, updatedAt: null };
  }
}

async function saveHunterConfig(config = {}) {
  const next = {
    scoreThreshold: Number.isFinite(Number(config.scoreThreshold)) ? Number(config.scoreThreshold) : HUNTER_DEFAULT_CONFIG.scoreThreshold,
    maxExitRate: Number.isFinite(Number(config.maxExitRate)) ? Number(config.maxExitRate) : HUNTER_DEFAULT_CONFIG.maxExitRate,
    minSamplePerHour: Number.isFinite(Number(config.minSamplePerHour)) ? Number(config.minSamplePerHour) : HUNTER_DEFAULT_CONFIG.minSamplePerHour,
    pushTopN: Number.isFinite(Number(config.pushTopN)) ? Number(config.pushTopN) : HUNTER_DEFAULT_CONFIG.pushTopN,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(HUNTER_CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function loadHunterCache() {
  try {
    const raw = await fs.readFile(HUNTER_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      meta: parsed?.meta || {},
      signals: Array.isArray(parsed?.signals) ? parsed.signals : [],
      generatedAt: parsed?.generatedAt || null
    };
  } catch (error) {
    return { meta: {}, signals: [], generatedAt: null };
  }
}

async function saveHunterCache(payload = {}) {
  const next = {
    meta: payload?.meta || {},
    signals: Array.isArray(payload?.signals) ? payload.signals : [],
    generatedAt: payload?.generatedAt || new Date().toISOString()
  };
  await fs.writeFile(HUNTER_CACHE_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function loadHunterHealth() {
  try {
    const raw = await fs.readFile(HUNTER_HEALTH_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

async function saveHunterHealth(payload = {}) {
  const next = {
    ...payload,
    updatedAt: payload?.updatedAt || new Date().toISOString()
  };
  await fs.writeFile(HUNTER_HEALTH_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function loadHunterPushFeed() {
  try {
    const raw = await fs.readFile(HUNTER_PUSH_FEED_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (error) {
    return [];
  }
}

async function saveHunterPushFeed(items = []) {
  const next = {
    items: Array.isArray(items) ? items.slice(0, 500) : [],
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(HUNTER_PUSH_FEED_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function loadHunterState() {
  try {
    const raw = await fs.readFile(HUNTER_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { signals: {} };
  } catch (error) {
    return { signals: {} };
  }
}

async function saveHunterState(state = {}) {
  const next = {
    signals: state?.signals && typeof state.signals === 'object' ? state.signals : {},
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(HUNTER_STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

function hunterRiskWarningText(warnings = []) {
  const map = {
    exit_rate_gte_90: '退出率过高（>=90%）',
    exit_rate_gte_threshold: '退出率偏高',
    oi_drop_gt_30pct: 'OI下滑超过30%',
    turnover_spike: '换手/成交异常放大'
  };
  const list = (Array.isArray(warnings) ? warnings : []).map(key => map[key] || key);
  return list.length ? list.join('；') : '暂无明显高危标签';
}

function formatHunterPushMessage(signal = {}) {
  const priceNow = Number(signal.currentPrice || 0);
  const trigger = Number(signal.triggerPrice || 0) || priceNow;
  const score = Number(signal.totalScore || 0);
  const chart = Number(signal.chartScore || 0);
  const data = Number(signal.dataScore || 0);
  const sl = Number(signal.stopLoss || 0);
  const tp1 = Number(signal.tp1 || 0);
  const tp2 = Number(signal.tp2 || 0);
  const tp3 = Number(signal.tp3 || 0);
  const pct = v => Number.isFinite(v) ? `${v.toFixed(4)}` : '-';
  const strategyMode = String(signal.recommendationMode || 'strict');
  const tf = String(signal.timeframeLabel || '1h');
  const statusText = String(signal.statusText || (String(signal.riskLevel || '') === 'high' ? '高风险观察' : '预突破埋伏'));
  return [
    '🎯【DYOR哨兵营交易信号】',
    `${signal.token || '-'} (${tf}) | 信号类型: ${String(signal.sourceType || signal.chain || '').toUpperCase() || '-'}`,
    `现价: $${pct(priceNow)} | 触发价: $${pct(trigger)} | 状态: ${strategyMode === 'fallback_watchlist' ? '观察池' : statusText}`,
    `评分: 综合 ${score.toFixed(1)}/10 | 图表 ${chart.toFixed(1)}/10 | 数据 ${data.toFixed(1)}/10`,
    `策略: 入场 $${pct(trigger)} | 止损 $${pct(sl)} | TP1 $${pct(tp1)} | TP2 $${pct(tp2)} | TP3 $${pct(tp3)}`,
    `风险: ${hunterRiskWarningText(signal.warnings)}`
  ].join('\n');
}

function deriveHunterStatus(signal = {}) {
  const current = Number(signal.currentPrice || 0);
  const trigger = Number(signal.triggerPrice || 0);
  if (!(current > 0) || !(trigger > 0)) return '观察中';
  const diffPct = ((current - trigger) / trigger) * 100;
  if (diffPct >= 1.0) return '突破中';
  if (diffPct >= -1.5) return '预突破埋伏';
  return '观察中';
}

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeSmartMoneySignal(raw = {}, chain = '') {
  const token = String(
    raw.symbol
    || raw.baseAsset
    || raw.token
    || raw.coin
    || raw.ticker
    || raw.asset
    || ''
  ).toUpperCase().trim();
  if (!token) return null;
  const triggerPrice = toNumber(raw.triggerPrice ?? raw.buyPrice ?? raw.entryPrice ?? raw.signalPrice ?? raw.openPrice, null);
  const currentPrice = toNumber(raw.currentPrice ?? raw.price ?? raw.lastPrice ?? raw.markPrice, null);
  const oiChangePct = toNumber(raw.oiChangePct ?? raw.oiChange ?? raw.openInterestChange ?? raw.oiPct, 0);
  const turnoverPct = toNumber(raw.turnoverPct ?? raw.turnoverRate ?? raw.volumeTurnoverRate, 0);
  const exitRate = toNumber(raw.exitRate ?? raw.smartMoneyExitRate ?? raw.outRate, 0);
  const smartMoneyWallets = toNumber(raw.smartMoneyWallets ?? raw.smartWalletCount ?? raw.walletCount ?? raw.smartMoneyCount, 0);
  const onchainVolumeUsd = toNumber(raw.onchainVolumeUsd ?? raw.amountUsd ?? raw.volumeUsd ?? raw.buyVolumeUsd, 0);
  const signalType = String(raw.signalType || raw.tag || 'smart_money').toLowerCase();
  const detectedAt = raw.detectedAt || raw.signalTime || raw.ts || raw.time || new Date().toISOString();
  return {
    id: `${chain}_${token}_${new Date(detectedAt).getTime() || Date.now()}`,
    token,
    chain,
    signalType,
    triggerPrice,
    currentPrice,
    oiChangePct,
    turnoverPct,
    exitRate,
    smartMoneyWallets,
    onchainVolumeUsd,
    detectedAt: Number.isFinite(Date.parse(detectedAt)) ? new Date(detectedAt).toISOString() : new Date().toISOString(),
    raw
  };
}

function normalizeCexHunterSignal(raw = {}, sourceType = 'spot') {
  const token = String(raw.symbol || raw.baseAsset || raw.token || '').toUpperCase().trim();
  if (!token) return null;
  const currentPrice = toNumber(raw.currentPrice ?? raw.price ?? raw.lastPrice, null);
  const triggerPrice = toNumber(raw.triggerPrice ?? raw.openPrice ?? raw.weightedAvgPrice, null);
  const turnoverPct = toNumber(raw.turnoverPct ?? raw.priceChangePercent ?? raw.changePercent24h ?? raw.change24h, 0);
  const oiChangePct = toNumber(raw.oiChangePct ?? 0, 0);
  const exitRate = toNumber(raw.exitRate ?? 0, 0);
  const smartMoneyWallets = toNumber(raw.smartMoneyWallets ?? 0, 0);
  const onchainVolumeUsd = toNumber(raw.onchainVolumeUsd ?? raw.quoteVolume ?? raw.volumeUsd ?? raw.liquidityUsd, 0);
  const chain = sourceType === 'alpha'
    ? (String(raw.chainId || '').replace(/^CT_/i, '') || 'ALPHA')
    : 'SPOT';
  const detectedAt = raw.detectedAt || raw.time || new Date().toISOString();
  const turnoverAbs = Math.abs(turnoverPct);
  const timeframeLabel = turnoverAbs >= 20 ? '1h' : turnoverAbs >= 10 ? '4h' : '1d';
  return {
    id: `${sourceType}_${token}_${Date.now()}`,
    token,
    chain,
    sourceType,
    signalType: sourceType === 'alpha' ? 'alpha_momentum' : 'spot_momentum',
    timeframeLabel,
    statusText: '预突破埋伏',
    triggerPrice,
    currentPrice,
    oiChangePct,
    turnoverPct,
    exitRate,
    smartMoneyWallets,
    onchainVolumeUsd,
    detectedAt: Number.isFinite(Date.parse(detectedAt)) ? new Date(detectedAt).toISOString() : new Date().toISOString(),
    raw
  };
}

function scoreHunterSignal(signal = {}) {
  const currentPrice = toNumber(signal.currentPrice, null);
  const triggerPrice = toNumber(signal.triggerPrice, null);
  const pricePositionScore = (currentPrice > 0 && triggerPrice > 0)
    ? Math.max(0, 10 - Math.min(10, Math.abs((currentPrice - triggerPrice) / triggerPrice) * 100))
    : 5;
  const chartScore = Math.max(0, Math.min(10,
    pricePositionScore * 0.6 + Math.min(10, Math.abs(toNumber(signal.turnoverPct, 0)) / 2) * 0.4
  ));
  const volumeScoreBase = toNumber(signal.onchainVolumeUsd, 0) > 0
    ? Math.min(10, Math.log10(toNumber(signal.onchainVolumeUsd, 1)))
    : 0;
  const momentumScore = Math.min(10, Math.abs(toNumber(signal.turnoverPct, 0)) / 4);
  const dataScore = Math.max(0, Math.min(10,
    Math.min(10, toNumber(signal.smartMoneyWallets, 0) / 3) * 0.35
    + volumeScoreBase * 0.3
    + Math.max(0, 10 - Math.min(10, toNumber(signal.exitRate, 0) / 10)) * 0.2
    + Math.min(10, Math.abs(toNumber(signal.oiChangePct, 0))) * 0.15
    + momentumScore * 0.2
  ));
  const sentimentScore = 5;
  const totalScore = (chartScore * 0.35) + (dataScore * 0.40) + (sentimentScore * 0.25);
  return { chartScore, dataScore, sentimentScore, totalScore };
}

function riskForHunterSignal(signal = {}, config = HUNTER_DEFAULT_CONFIG) {
  const warnings = [];
  const exitRate = toNumber(signal.exitRate, 0);
  const oiChange = toNumber(signal.oiChangePct, 0);
  if (exitRate >= 90) warnings.push('exit_rate_gte_90');
  else if (exitRate >= config.maxExitRate) warnings.push('exit_rate_gte_threshold');
  if (oiChange <= -30) warnings.push('oi_drop_gt_30pct');
  if (Math.abs(toNumber(signal.turnoverPct, 0)) >= 80) warnings.push('turnover_spike');
  const riskLevel = warnings.includes('exit_rate_gte_90') || warnings.includes('oi_drop_gt_30pct')
    ? 'high'
    : warnings.length ? 'medium' : 'low';
  return { riskLevel, warnings };
}

function buildHunterStrategy(signal = {}, riskLevel = 'low') {
  const entry = toNumber(signal.triggerPrice, null) || toNumber(signal.currentPrice, null);
  if (!(entry > 0)) return { stopLoss: null, tp1: null, tp2: null, tp3: null };
  const stopPct = riskLevel === 'low' ? 0.05 : riskLevel === 'medium' ? 0.08 : 0.02;
  const tp1Mul = riskLevel === 'high' ? 1.03 : 1.05;
  const tp2Mul = riskLevel === 'high' ? 1.08 : 1.12;
  const tp3Mul = riskLevel === 'high' ? 1.20 : 1.28;
  return {
    stopLoss: Number((entry * (1 - stopPct)).toPrecision(10)),
    tp1: Number((entry * tp1Mul).toPrecision(10)),
    tp2: Number((entry * tp2Mul).toPrecision(10)),
    tp3: Number((entry * tp3Mul).toPrecision(10))
  };
}

function evaluateHunterDataHealth(meta = {}, config = HUNTER_DEFAULT_CONFIG) {
  const warnings = [];
  const rawCount = Number(meta.rawCount || 0);
  if (rawCount < Number(config.minSamplePerHour || HUNTER_DEFAULT_CONFIG.minSamplePerHour)) warnings.push('sample_insufficient');
  if (meta.upstreamError) warnings.push('upstream_error');
  const updatedAtMs = Date.parse(meta.updatedAt || '');
  if (!Number.isFinite(updatedAtMs) || (Date.now() - updatedAtMs > 90 * 60 * 1000)) warnings.push('data_stale');
  let status = 'healthy';
  if (warnings.includes('upstream_error')) status = 'upstream_error';
  else if (warnings.includes('sample_insufficient')) status = 'sample_insufficient';
  return { status, warnings };
}

async function fetchSmartMoneySignalsByChain(chainId, chainLabel) {
  const response = await axios.post(
    `${WEB3_API_BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/web/signal/smart-money/ai`,
    { chainId },
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'binance-web3/1.1',
        'Accept-Encoding': 'identity'
      },
      timeout: 20000
    }
  );
  const payload = response?.data?.data;
  const rows = Array.isArray(payload?.signals) ? payload.signals
    : Array.isArray(payload?.list) ? payload.list
      : Array.isArray(payload?.rows) ? payload.rows
        : Array.isArray(payload) ? payload : [];
  return rows.map(item => normalizeSmartMoneySignal(item, chainLabel)).filter(Boolean);
}

async function fetchHunterSpotSignals() {
  const response = await axios.get(`${BASE_URL}/api/v3/ticker/24hr`, { timeout: 20000 });
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows
    .filter(item => item && item.symbol && String(item.symbol).endsWith('USDT'))
    .map(item => normalizeCexHunterSignal({
      symbol: String(item.symbol).replace(/USDT$/, ''),
      baseAsset: String(item.symbol).replace(/USDT$/, ''),
      currentPrice: item.lastPrice,
      weightedAvgPrice: item.weightedAvgPrice,
      priceChangePercent: item.priceChangePercent,
      quoteVolume: item.quoteVolume,
      detectedAt: new Date().toISOString()
    }, 'spot'))
    .filter(Boolean)
    .sort((a, b) => Number(b.onchainVolumeUsd || 0) - Number(a.onchainVolumeUsd || 0))
    .slice(0, 120);
}

async function fetchHunterAlphaSignals() {
  const response = await axios.get(
    `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list`,
    { headers: BINANCE_ALPHA_HEADERS, timeout: 20000 }
  );
  const list = normalizeAlphaTokenList(response.data?.data);
  return list
    .map(item => normalizeCexHunterSignal({
      symbol: item.symbol || item.cexCoinName || item.alphaId || '',
      currentPrice: item.price,
      triggerPrice: item.openPrice,
      changePercent24h: item.changePercent24h,
      liquidityUsd: item.liquidity,
      chainId: item.chainId,
      detectedAt: new Date().toISOString()
    }, 'alpha'))
    .filter(Boolean)
    .slice(0, 120);
}

async function runHunterSignalsScan() {
  const config = await loadHunterConfig();
  const state = await loadHunterState();
  const upstreamErrors = [];
  const sourceResults = await Promise.all([
    (async () => {
      try {
        const signals = await fetchHunterSpotSignals();
        return { source: 'spot', signals, ok: true };
      } catch (error) {
        upstreamErrors.push(`spot:${error.message}`);
        return { source: 'spot', signals: [], ok: false };
      }
    })(),
    (async () => {
      try {
        const signals = await fetchHunterAlphaSignals();
        return { source: 'alpha', signals, ok: true };
      } catch (error) {
        upstreamErrors.push(`alpha:${error.message}`);
        return { source: 'alpha', signals: [], ok: false };
      }
    })()
  ]);
  const rawSignals = sourceResults.flatMap(item => item.signals);
  const scored = rawSignals.map(signal => {
    const scores = scoreHunterSignal(signal);
    const risk = riskForHunterSignal(signal, config);
    const strategy = buildHunterStrategy(signal, risk.riskLevel);
    const statusText = deriveHunterStatus({ ...signal, ...strategy });
    return { ...signal, ...scores, ...risk, ...strategy, statusText };
  });
  const filtered = scored
    .filter(signal => Number(signal.totalScore || 0) >= Number(config.scoreThreshold || HUNTER_DEFAULT_CONFIG.scoreThreshold))
    .filter(signal => Number(signal.exitRate || 0) < Number(config.maxExitRate || HUNTER_DEFAULT_CONFIG.maxExitRate))
    .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0));
  const fallbackRecommendations = scored
    .slice()
    .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
    .slice(0, Math.max(3, Number(config.pushTopN || HUNTER_DEFAULT_CONFIG.pushTopN)));
  const recommendations = filtered.length ? filtered : fallbackRecommendations.map(item => ({
    ...item,
    recommendationMode: 'fallback_watchlist'
  }));
  const pushed = filtered
    .filter(signal => String(signal.riskLevel) !== 'high')
    .slice(0, Math.max(1, Number(config.pushTopN || HUNTER_DEFAULT_CONFIG.pushTopN)));
  const meta = {
    source: HUNTER_SOURCE_LABEL,
    updatedAt: new Date().toISOString(),
    rawCount: rawSignals.length,
    scoredCount: scored.length,
    filteredCount: filtered.length,
    pushedCount: pushed.length,
    upstreamError: upstreamErrors.length ? upstreamErrors.join('; ') : ''
  };
  const health = evaluateHunterDataHealth(meta, config);
  const payload = {
    meta: {
      ...meta,
      recommendationMode: filtered.length ? 'strict' : 'fallback_watchlist',
      dataHealth: health.status,
      healthWarnings: health.warnings
    },
    signals: recommendations,
    generatedAt: new Date().toISOString()
  };
  const pushFeed = await loadHunterPushFeed();
  const nextEntries = pushed.flatMap(item => {
    const stateKey = `${String(item.sourceType || item.chain || 'x')}:${String(item.token || 'x')}:${String(item.timeframeLabel || '1h')}`;
    const prev = state.signals?.[stateKey] || {};
    const changed = String(prev.statusText || '') !== String(item.statusText || '');
    state.signals[stateKey] = {
      statusText: item.statusText || '',
      triggerPrice: Number(item.triggerPrice || 0),
      currentPrice: Number(item.currentPrice || 0),
      updatedAt: new Date().toISOString()
    };
    if (!changed) return [];
    const key = `${stateKey}:${item.statusText}:${new Date().toISOString().slice(0, 16)}`;
    return {
      id: key,
      createdAt: new Date().toISOString(),
      token: item.token,
      sourceType: item.sourceType || item.chain || '',
      riskLevel: item.riskLevel || '',
      score: Number(item.totalScore || 0),
      message: formatHunterPushMessage(item),
      signal: item
    };
  });
  const dedupMap = new Map();
  for (const entry of [...nextEntries, ...pushFeed]) {
    if (!entry?.id || dedupMap.has(entry.id)) continue;
    dedupMap.set(entry.id, entry);
  }
  const mergedFeed = [...dedupMap.values()]
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
    .slice(0, 500);
  await Promise.all([
    saveHunterCache(payload),
    saveHunterPushFeed(mergedFeed),
    saveHunterState(state),
    saveHunterHealth({
      status: health.status,
      source: HUNTER_SOURCE_LABEL,
      sampleCount1h: rawSignals.length,
      warnings: health.warnings,
      upstream: {
        spotApi: sourceResults.find(item => item.source === 'spot')?.ok ? 'ok' : 'degraded',
        alphaApi: sourceResults.find(item => item.source === 'alpha')?.ok ? 'ok' : 'degraded',
        oiApi: 'not_enabled'
      },
      updatedAt: meta.updatedAt
    })
  ]);
  return payload;
}

function normalizePositionPlan(item, index) {
  const rawSymbol = String(item.symbol || '').trim();
  const assetType = String(item.assetType || 'binance').trim() === 'onchain' ? 'onchain' : 'binance';
  const status = String(item.status || 'watching').trim() || 'watching';
  const numericPosition = Number(item.currentPosition);
  const rawReportUrl = String(item.reportUrl || '').trim();
  const reportUrl = /^https?:\/\//i.test(rawReportUrl) ? rawReportUrl : '';

  return {
    id: String(item.id || `plan_${Date.now()}_${index}`),
    symbol: rawSymbol.toUpperCase(),
    assetType,
    contractAddress: String(item.contractAddress || '').trim(),
    chainId: String(item.chainId || '56').trim() || '56',
    narrative: String(item.narrative || '').trim(),
    strategyTag: String(item.strategyTag || '').trim(),
    entryRange: String(item.entryRange || '').trim(),
    targetZone: String(item.targetZone || '').trim(),
    currentPosition: Number.isFinite(numericPosition) ? numericPosition : 0,
    status,
    thesis: String(item.thesis || '').trim(),
    reportUrl,
    visibleToWhitelist: Boolean(item.visibleToWhitelist),
    updatedAt: new Date().toISOString()
  };
}

function normalizeThinktankPost(item, index) {
  const tags = Array.isArray(item.tags)
    ? item.tags.map(tag => String(tag || '').trim()).filter(Boolean)
    : String(item.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);

  const publishedAtRaw = String(item.publishedAt || '').trim();
  const publishedAt = publishedAtRaw || new Date().toISOString().slice(0, 10);
  const readMinutesNumber = Number(item.readMinutes);

  return {
    id: String(item.id || `post_${Date.now()}_${index}`),
    title: String(item.title || '').trim(),
    summary: String(item.summary || '').trim(),
    category: String(item.category || '').trim(),
    tags,
    author: String(item.author || '').trim() || 'DYOR Research',
    publishedAt,
    readMinutes: Number.isFinite(readMinutesNumber) && readMinutesNumber > 0 ? Math.round(readMinutesNumber) : 8,
    content: String(item.content || '').trim(),
    featured: Boolean(item.featured),
    visibleToWhitelist: item.visibleToWhitelist !== false,
    updatedAt: new Date().toISOString()
  };
}

function buildThinktankPreviewText(content, limit = 300) {
  const plain = String(content || '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  if (plain.length <= limit) return plain;
  return `${plain.slice(0, Math.max(1, limit))}...`;
}

function toThinktankPreviewPost(item) {
  const { content, ...rest } = item || {};
  return {
    ...rest,
    contentPreview: buildThinktankPreviewText(content, 300),
    previewLimit: 300,
    locked: true
  };
}

// 验证邮箱是否在白名单
async function validateEmail(email) {
  const whitelist = await loadWhitelist();
  const normalizedEmail = email.toLowerCase().trim();
  return whitelist.emails.includes(normalizedEmail);
}

async function validateLinkageEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) return false;
  const [fullWhitelist, linkageWhitelist] = await Promise.all([
    loadWhitelist(),
    loadLinkageWhitelist()
  ]);
  return (fullWhitelist.emails || []).includes(normalizedEmail)
    || (linkageWhitelist.emails || []).includes(normalizedEmail);
}

async function validateFullWhitelistEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) return false;
  const whitelist = await loadWhitelist();
  return (whitelist.emails || []).includes(normalizedEmail);
}

function isSpecialAlphaConcept(concept = {}) {
  return /优质.*alpha|alpha/i.test(String(concept.name || ''));
}

function filterLinkageForPublic(linkage = {}) {
  const concepts = Array.isArray(linkage.concepts)
    ? linkage.concepts.filter(concept => !isSpecialAlphaConcept(concept))
    : [];
  return {
    ...linkage,
    concepts,
    relations: [],
    events: []
  };
}

function isValidEmailFormat(email) {
  const value = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// 验证密钥（一次性使用 + IP绑定）
async function validateKey(inputKey, clientIP) {
  const keys = await loadViewKeys();
  const keyRecord = keys.find(k => k.key === inputKey);
  
  if (!keyRecord) {
    return { valid: false, error: '密钥不存在' };
  }
  
  if (keyRecord.used) {
    // 已使用过的密钥，检查IP是否匹配
    if (keyRecord.boundIP !== clientIP) {
      return { valid: false, error: '此密钥已在其他设备使用，无法在当前设备访问' };
    }
    // IP匹配，允许继续访问（一次性密钥可以重复使用同一设备）
    return { valid: true, record: keyRecord, keys };
  }
  
  // 首次使用，绑定IP
  return { valid: true, record: keyRecord, keys, firstUse: true };
}

// 标记密钥为已使用
async function markKeyUsed(inputKey, clientIP) {
  const keys = await loadViewKeys();
  const keyIndex = keys.findIndex(k => k.key === inputKey);
  
  if (keyIndex !== -1) {
    keys[keyIndex].used = true;
    keys[keyIndex].boundIP = clientIP;
    keys[keyIndex].usedAt = new Date().toISOString();
    await saveViewKeys(keys);
  }
}

// 生成签名
function generateSignature(queryString) {
  return crypto
    .createHmac('sha256', BINANCE_API_SECRET)
    .update(queryString)
    .digest('hex');
}

// 获取币安现货账户资产
async function getBinanceAssets() {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = generateSignature(queryString);

  const response = await axios.get(`${BASE_URL}/api/v3/account?${queryString}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }
  });
  
  return response.data.balances
    .filter(asset => parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0)
    .map(asset => ({ ...asset, source: 'binance' }));
}

// 获取币安资金账户资产
async function getFundingAssets() {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = generateSignature(queryString);

  try {
    const response = await axios.post(`${BASE_URL}/sapi/v1/asset/get-funding-asset?${queryString}&signature=${signature}`, {}, {
      headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }
    });
    
    return response.data
      .filter(asset => parseFloat(asset.free) > 0)
      .map(asset => ({ 
        asset: asset.asset, 
        free: asset.free, 
        locked: '0',
        source: 'funding' 
      }));
  } catch (error) {
    console.log('资金账户获取失败:', error.message);
    return [];
  }
}

// 获取 Alpha 账户持仓
async function getAlphaHoldings() {
  try {
    const data = await fs.readFile(ALPHA_HOLDINGS_PATH, 'utf8');
    const holdings = JSON.parse(data);
    return holdings.holdings || [];
  } catch (error) {
    return [];
  }
}

// 获取 Web3 代币价格
async function getWeb3TokenPrice(chainId, contractAddress) {
  try {
    const response = await axios.get(
      `${WEB3_API_BASE}/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai?chainId=${chainId}&contractAddress=${contractAddress}`,
      {
        headers: {
          'Accept-Encoding': 'identity',
          'User-Agent': 'binance-web3/1.1 (Skill)'
        }
      }
    );
    
    if (response.data.success && response.data.data) {
      return {
        price: parseFloat(response.data.data.price),
        symbol: response.data.data.symbol || null
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function getSolanaTokenPrice(mintAddress) {
  try {
    const address = String(mintAddress || '').trim();
    if (!address) return null;

    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      timeout: 10000
    });
    const pairs = Array.isArray(response.data?.pairs) ? response.data.pairs : [];
    const solPairs = pairs.filter(pair => String(pair.chainId || '').toLowerCase() === 'solana');
    if (solPairs.length === 0) return null;

    const ranked = solPairs
      .map(pair => ({
        priceUsd: Number(pair.priceUsd),
        liquidityUsd: Number(pair?.liquidity?.usd || 0)
      }))
      .filter(item => Number.isFinite(item.priceUsd) && item.priceUsd > 0)
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd);

    if (ranked.length === 0) return null;

    return {
      price: ranked[0].priceUsd,
      symbol: null
    };
  } catch (error) {
    return null;
  }
}

function normalizeDexScreenerChainId(chainId) {
  const raw = String(chainId || '').trim().toLowerCase();
  if (raw === '1' || raw === 'eth' || raw === 'ethereum') return 'ethereum';
  if (raw === '56' || raw === 'bsc' || raw === 'bnb') return 'bsc';
  if (raw === '8453' || raw === 'base') return 'base';
  if (raw === '501' || raw === 'sol' || raw === 'solana') return 'solana';
  if (raw === 'ton' || raw === 'toncoin') return 'ton';
  return raw;
}

async function getDexScreenerTokenMarket(contractAddress, chainId = '') {
  try {
    const address = String(contractAddress || '').trim();
    if (!address) return null;
    const preferredChain = normalizeDexScreenerChainId(chainId);
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      timeout: 10000
    });
    const allPairs = Array.isArray(response.data?.pairs) ? response.data.pairs : [];
    let pairs = allPairs;
    if (preferredChain) {
      const filtered = pairs.filter(pair => String(pair.chainId || '').toLowerCase() === preferredChain);
      if (!filtered.length && allPairs.length) {
        return {
          price: null,
          symbol: null,
          chainId: preferredChain,
          error: `DexScreener found this contract, but not on selected chain ${preferredChain}`
        };
      }
      if (filtered.length) pairs = filtered;
    }
    const ranked = pairs
      .map(pair => ({
        priceUsd: Number(pair.priceUsd),
        liquidityUsd: Number(pair?.liquidity?.usd || 0),
        chainId: String(pair.chainId || ''),
        symbol: String(pair?.baseToken?.symbol || ''),
        priceChange: pair?.priceChange || {}
      }))
      .filter(item => Number.isFinite(item.priceUsd) && item.priceUsd > 0)
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    if (!ranked.length) {
      return {
        price: null,
        symbol: null,
        chainId: preferredChain || null,
        error: 'DexScreener has no liquid price pair for this contract'
      };
    }
    const best = ranked[0];
    return {
      price: best.priceUsd,
      symbol: best.symbol || null,
      chainId: best.chainId || preferredChain || null,
      changePercent24h: Number(best.priceChange?.h24),
      changePercent1h: Number(best.priceChange?.h1),
      changePercent5m: Number(best.priceChange?.m5)
    };
  } catch (error) {
    return {
      price: null,
      symbol: null,
      chainId: normalizeDexScreenerChainId(chainId),
      error: error.message || 'DexScreener request failed'
    };
  }
}

// 获取所有交易对价格
async function getAllPrices() {
  const response = await axios.get(`${BASE_URL}/api/v3/ticker/price`);
  const prices = {};
  response.data.forEach(ticker => {
    prices[ticker.symbol] = parseFloat(ticker.price);
  });
  return prices;
}

async function getAllTicker24h() {
  const response = await axios.get(`${BASE_URL}/api/v3/ticker/24hr`);
  const map = {};
  response.data.forEach(ticker => {
    if (!ticker || !ticker.symbol) return;
    map[ticker.symbol] = {
      symbol: ticker.symbol,
      priceChangePercent: Number(ticker.priceChangePercent),
      lastPrice: Number(ticker.lastPrice),
      quoteVolume: Number(ticker.quoteVolume)
    };
  });
  return map;
}

async function getTickerWindowForSymbols(symbols = [], windowSize = '15m') {
  const uniqueSymbols = Array.from(new Set(
    symbols
      .map(symbol => String(symbol || '').trim().toUpperCase())
      .filter(Boolean)
  ));
  if (!uniqueSymbols.length) return {};

  const map = {};
  const chunkSize = 80;
  const fetchOne = async (symbol) => {
    try {
      const response = await axios.get(`${BASE_URL}/api/v3/ticker`, {
        timeout: 15000,
        params: { windowSize, symbol }
      });
      const ticker = response.data;
      if (!ticker || !ticker.symbol) return;
      map[ticker.symbol] = {
        symbol: ticker.symbol,
        priceChangePercent: Number(ticker.priceChangePercent),
        lastPrice: Number(ticker.lastPrice),
        quoteVolume: Number(ticker.quoteVolume)
      };
    } catch (error) {}
  };
  for (let i = 0; i < uniqueSymbols.length; i += chunkSize) {
    const chunk = uniqueSymbols.slice(i, i + chunkSize);
    try {
      const response = await axios.get(`${BASE_URL}/api/v3/ticker`, {
        timeout: 15000,
        params: {
          windowSize,
          symbols: JSON.stringify(chunk)
        }
      });
      const rows = Array.isArray(response.data) ? response.data : [response.data];
      rows.forEach(ticker => {
        if (!ticker || !ticker.symbol) return;
        map[ticker.symbol] = {
          symbol: ticker.symbol,
          priceChangePercent: Number(ticker.priceChangePercent),
          lastPrice: Number(ticker.lastPrice),
          quoteVolume: Number(ticker.quoteVolume)
        };
      });
    } catch (error) {
      await Promise.all(chunk.map(fetchOne));
    }
  }
  return map;
}

async function getBinanceThreeDayChangeForSymbols(symbols = [], ticker24hMap = {}) {
  const uniqueSymbols = Array.from(new Set(
    symbols
      .map(symbol => String(symbol || '').trim().toUpperCase())
      .filter(Boolean)
  ));
  const map = {};
  const fetchOne = async (pair) => {
    try {
      const response = await axios.get(`${BASE_URL}/api/v3/klines`, {
        timeout: 15000,
        params: { symbol: pair, interval: '1d', limit: 4 }
      });
      const rows = normalizeKlineRows(response.data);
      if (!rows.length) return;
      const startPrice = Number(rows[0]?.open || rows[0]?.close || 0);
      const currentPrice = Number(ticker24hMap[pair]?.lastPrice || rows[rows.length - 1]?.close || 0);
      if (!(startPrice > 0) || !(currentPrice > 0)) return;
      map[pair] = parseFloat((((currentPrice - startPrice) / startPrice) * 100).toFixed(2));
    } catch (error) {}
  };

  const chunkSize = 10;
  for (let i = 0; i < uniqueSymbols.length; i += chunkSize) {
    await Promise.all(uniqueSymbols.slice(i, i + chunkSize).map(fetchOne));
  }
  return map;
}

function getFreshCache(key) {
  const entry = alphaApiCache[key];
  if (!entry) return null;
  if (Date.now() >= Number(entry.expiresAt || 0)) return null;
  return entry.data;
}

function setCache(key, data, ttlMs) {
  if (!alphaApiCache[key]) return;
  alphaApiCache[key] = {
    data,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs || 1000))
  };
}

function normalizeAlphaTokenList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.list)) return raw.list;
  if (raw && Array.isArray(raw.tokens)) return raw.tokens;
  return [];
}

async function getAlphaTokenList(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh) {
    const cached = getFreshCache('tokenList');
    if (cached) return cached;
  }

  const response = await axios.get(
    `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list`,
    {
      timeout: 15000,
      headers: BINANCE_ALPHA_HEADERS
    }
  );
  const list = normalizeAlphaTokenList(response.data?.data);
  setCache('tokenList', list, 60 * 1000);
  return list;
}

async function getAlphaSymbolMap(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh) {
    const cached = getFreshCache('symbolMap');
    if (cached) return cached;
  }

  const tokens = await getAlphaTokenList({ forceRefresh });
  const symbolToAlphaId = {};
  const alphaIdToSymbol = {};

  for (const token of tokens) {
    const rawSymbol = String(token?.symbol || '').trim().toUpperCase();
    const alphaId = String(token?.alphaId || '').trim().toUpperCase();
    if (!rawSymbol || !alphaId) continue;
    symbolToAlphaId[rawSymbol] = alphaId;
    alphaIdToSymbol[alphaId] = rawSymbol;
  }

  const map = { symbolToAlphaId, alphaIdToSymbol };
  setCache('symbolMap', map, 60 * 1000);
  return map;
}

function resolveAlphaTradingPair(rawSymbol, symbolMap) {
  const value = String(rawSymbol || '').trim().toUpperCase();
  if (!value) return null;

  if (value.endsWith('USDT') && value.startsWith('ALPHA_')) return value;
  if (value.startsWith('ALPHA_')) return `${value}USDT`;
  const alphaId = symbolMap?.symbolToAlphaId?.[value];
  if (!alphaId) return null;
  return `${alphaId}USDT`;
}

function normalizeAlphaExchangeSymbols(data = {}) {
  if (Array.isArray(data?.symbols)) return data.symbols;
  if (Array.isArray(data?.symbolList)) return data.symbolList;
  if (Array.isArray(data)) return data;
  return [];
}

async function resolveAlphaTradingPairForTrade(rawSymbol, options = {}) {
  const value = String(rawSymbol || '').trim().toUpperCase();
  if (!value) return null;
  const symbolMap = options.symbolMap || await getAlphaSymbolMap();
  const alphaId = value.startsWith('ALPHA_')
    ? value.replace(/(USDT|USDC|U)$/i, '')
    : symbolMap?.symbolToAlphaId?.[value];
  if (!alphaId) return null;

  try {
    const info = await getAlphaExchangeInfo();
    const symbols = normalizeAlphaExchangeSymbols(info);
    const candidates = symbols
      .filter(item => String(item?.baseAsset || '').toUpperCase() === alphaId)
      .filter(item => String(item?.status || '').toUpperCase() === 'TRADING')
      .map(item => ({
        symbol: String(item.symbol || '').toUpperCase(),
        quoteAsset: String(item.quoteAsset || '').toUpperCase()
      }))
      .filter(item => item.symbol);
    const quotePriority = ['USDT', 'USDC', 'U'];
    for (const quote of quotePriority) {
      const match = candidates.find(item => item.quoteAsset === quote || item.symbol.endsWith(quote));
      if (match) return match.symbol;
    }
    if (candidates[0]?.symbol) return candidates[0].symbol;
  } catch (error) {}

  return `${alphaId}USDT`;
}

async function getAlphaExchangeInfo(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh) {
    const cached = getFreshCache('exchangeInfo');
    if (cached) return cached;
  }

  const response = await axios.get(
    `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/alpha-trade/get-exchange-info`,
    {
      timeout: 15000,
      headers: BINANCE_ALPHA_HEADERS
    }
  );
  const data = response.data?.data || {};
  setCache('exchangeInfo', data, 120 * 1000);
  return data;
}

async function getAlphaTickerBySymbol(symbol) {
  const pair = await resolveAlphaTradingPairForTrade(symbol);
  if (!pair) return null;

  const response = await axios.get(
    `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/alpha-trade/ticker`,
    {
      timeout: 15000,
      params: { symbol: pair },
      headers: BINANCE_ALPHA_HEADERS
    }
  );

  const data = response.data?.data || {};
  return { pair, data };
}

async function getBinanceAlphaTickerPriceBySymbol(symbol) {
  try {
    const ticker = await getAlphaTickerBySymbol(symbol);
    if (!ticker) return null;
    const lastPrice = Number(ticker.data?.lastPrice ?? ticker.data?.price ?? ticker.data?.c);
    if (!(Number.isFinite(lastPrice) && lastPrice > 0)) return null;
    return {
      price: lastPrice,
      pair: ticker.pair
    };
  } catch (error) {
    return null;
  }
}

function safeAlphaLimit(raw, defaultValue = 100, maxValue = 1000) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.min(maxValue, Math.floor(n));
}

function normalizeKlineRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      if (row && !Array.isArray(row) && typeof row === 'object') {
        return {
          openTime: Number(row.openTime),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume)
        };
      }
      const source = Array.isArray(row) ? row : [];
      return {
        openTime: Number(source[0]),
        open: Number(source[1]),
        high: Number(source[2]),
        low: Number(source[3]),
        close: Number(source[4]),
        volume: Number(source[5])
      };
    })
    .filter(item => Number.isFinite(item.high) && Number.isFinite(item.low) && Number.isFinite(item.close) && item.high > 0 && item.low > 0);
}

async function fetchSpotKlines(symbol, interval = '4h', limit = 240) {
  const pair = `${String(symbol || '').trim().toUpperCase()}USDT`;
  const response = await axios.get(`${BASE_URL}/api/v3/klines`, {
    timeout: 15000,
    params: { symbol: pair, interval, limit }
  });
  const rows = normalizeKlineRows(response.data);
  if (!rows.length) return null;
  return { pair, source: 'binance_spot', rows };
}

async function fetchAlphaKlinesForAnalysis(symbol, interval = '4h', limit = 240) {
  const pair = await resolveAlphaTradingPairForTrade(symbol);
  if (!pair) return null;
  const response = await axios.get(
    `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/alpha-trade/klines`,
    { timeout: 15000, headers: BINANCE_ALPHA_HEADERS, params: { symbol: pair, interval, limit } }
  );
  const rows = normalizeKlineRows(response.data?.data || []);
  if (!rows.length) return null;
  return { pair, source: 'binance_alpha', rows };
}

function calcChangePercentFromRows(rows = [], currentPrice) {
  const cleanRows = Array.isArray(rows) ? rows.filter(row => Number(row?.open || row?.close) > 0) : [];
  const latest = Number(currentPrice || cleanRows[cleanRows.length - 1]?.close || 0);
  const start = Number(cleanRows[0]?.open || cleanRows[0]?.close || 0);
  if (!(latest > 0) || !(start > 0)) return null;
  return parseFloat((((latest - start) / start) * 100).toFixed(2));
}

async function getAlphaLinkageMetrics(symbol) {
  const ticker = await getAlphaTickerBySymbol(symbol);
  if (!ticker) return null;
  const data = ticker.data || {};
  const lastPrice = Number(data.lastPrice ?? data.price ?? data.c);
  if (!(Number.isFinite(lastPrice) && lastPrice > 0)) return null;
  const changePercent1d = Number(data.priceChangePercent ?? data.priceChangePercent24h ?? data.changePercent24h);
  const [k5m, k1h, k7d] = await Promise.all([
    fetchAlphaKlinesForAnalysis(symbol, '5m', 2).catch(() => null),
    fetchAlphaKlinesForAnalysis(symbol, '1h', 2).catch(() => null),
    fetchAlphaKlinesForAnalysis(symbol, '1d', 8).catch(() => null)
  ]);
  return {
    pair: ticker.pair,
    lastPrice,
    changePercent5m: calcChangePercentFromRows(k5m?.rows || [], lastPrice),
    changePercent1h: calcChangePercentFromRows(k1h?.rows || [], lastPrice),
    changePercent1d: Number.isFinite(changePercent1d) ? parseFloat(changePercent1d.toFixed(2)) : null,
    changePercent7d: calcChangePercentFromRows(k7d?.rows || [], lastPrice)
  };
}

function getFreshFuturesCache(key) {
  const entry = futuresApiCache[key];
  if (!entry) return null;
  if (Date.now() >= Number(entry.expiresAt || 0)) return null;
  return entry.data;
}

function setFuturesCache(key, data, ttlMs) {
  if (!futuresApiCache[key]) return;
  futuresApiCache[key] = {
    data,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs || 1000))
  };
}

async function getFuturesExchangeInfo(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh) {
    const cached = getFreshFuturesCache('exchangeInfo');
    if (cached) return cached;
  }
  const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/fapi/v1/exchangeInfo`, {
    timeout: 15000
  });
  const data = response.data || {};
  setFuturesCache('exchangeInfo', data, 2 * 60 * 1000);
  return data;
}

async function getFuturesSymbolSet(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh) {
    const cached = getFreshFuturesCache('symbolSet');
    if (cached) return cached;
  }
  const info = await getFuturesExchangeInfo({ forceRefresh });
  const set = new Set(
    (Array.isArray(info.symbols) ? info.symbols : [])
      .filter(item => String(item?.quoteAsset || '').toUpperCase() === 'USDT')
      .filter(item => !item.status || String(item.status).toUpperCase() === 'TRADING')
      .map(item => String(item.symbol || '').toUpperCase())
      .filter(Boolean)
  );
  setFuturesCache('symbolSet', set, 2 * 60 * 1000);
  return set;
}

async function getFuturesTickerBySymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return null;
  const pair = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/fapi/v1/ticker/24hr`, {
    timeout: 15000,
    params: { symbol: pair }
  });
  const data = response.data || {};
  const lastPrice = Number(data.lastPrice);
  if (!(Number.isFinite(lastPrice) && lastPrice > 0)) return null;
  return { pair, data };
}

async function fetchFuturesKlinesForAnalysis(symbol, interval = '4h', limit = 240) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return null;
  const pair = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  const response = await axios.get(`${BINANCE_FUTURES_BASE_URL}/fapi/v1/klines`, {
    timeout: 15000,
    params: { symbol: pair, interval, limit }
  });
  const rows = normalizeKlineRows(response.data || []);
  if (!rows.length) return null;
  return { pair, source: 'binance_futures', rows };
}

async function getFuturesLinkageMetrics(symbol) {
  const ticker = await getFuturesTickerBySymbol(symbol);
  if (!ticker) return null;
  const data = ticker.data || {};
  const lastPrice = Number(data.lastPrice);
  if (!(Number.isFinite(lastPrice) && lastPrice > 0)) return null;
  const changePercent1d = Number(data.priceChangePercent);
  const [k5m, k1h, k7d] = await Promise.all([
    fetchFuturesKlinesForAnalysis(ticker.pair, '5m', 2).catch(() => null),
    fetchFuturesKlinesForAnalysis(ticker.pair, '1h', 2).catch(() => null),
    fetchFuturesKlinesForAnalysis(ticker.pair, '1d', 8).catch(() => null)
  ]);
  return {
    pair: ticker.pair,
    lastPrice,
    changePercent5m: calcChangePercentFromRows(k5m?.rows || [], lastPrice),
    changePercent1h: calcChangePercentFromRows(k1h?.rows || [], lastPrice),
    changePercent1d: Number.isFinite(changePercent1d) ? parseFloat(changePercent1d.toFixed(2)) : null,
    changePercent7d: calcChangePercentFromRows(k7d?.rows || [], lastPrice)
  };
}

async function resolveLinkageTokenSource(symbol, ticker24hMap = null) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return { symbol: '', source: 'unknown', label: 'unknown', found: false };
  const pair = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  const cleanSymbol = pair.replace(/USDT$/, '');

  let existsSpot = false;
  try {
    const spotMap = ticker24hMap || await getAllTicker24h();
    existsSpot = Boolean(spotMap[pair]);
  } catch (error) {}

  let existsAlpha = false;
  let alphaPair = '';
  try {
    const alphaMap = await getAlphaSymbolMap();
    alphaPair = await resolveAlphaTradingPairForTrade(cleanSymbol, { symbolMap: alphaMap }) || '';
    existsAlpha = Boolean(alphaPair);
  } catch (error) {}

  let existsFutures = false;
  try {
    const futuresSet = await getFuturesSymbolSet();
    existsFutures = futuresSet.has(pair);
  } catch (error) {
    try {
      existsFutures = Boolean(await getFuturesTickerBySymbol(pair));
    } catch (fallbackError) {}
  }

  let source = 'unknown';
  let label = '未识别';
  let resolvedPair = '';
  if (existsSpot) {
    source = 'binance_spot';
    label = 'Binance 现货';
    resolvedPair = pair;
  } else if (existsAlpha) {
    source = 'binance_alpha';
    label = 'Binance Alpha';
    resolvedPair = alphaPair;
  } else if (existsFutures) {
    source = 'binance_futures';
    label = 'Binance 合约';
    resolvedPair = pair;
  }

  return {
    symbol: cleanSymbol,
    pair,
    alphaPair,
    resolvedPair,
    source,
    label,
    found: source !== 'unknown',
    existsSpot,
    existsAlpha,
    existsFutures
  };
}

async function fetchPortfolio4hKlines(token = {}) {
  const symbol = String(token.symbol || '').trim().toUpperCase();
  if (!symbol) return null;
  try {
    const spot = await fetchSpotKlines(symbol, '4h', 240);
    if (spot) return spot;
  } catch (error) {}
  try {
    const alpha = await fetchAlphaKlinesForAnalysis(symbol, '4h', 240);
    if (alpha) return alpha;
  } catch (error) {}
  return null;
}

function pickNearestKlinePrice(rows = [], targetMs = 0) {
  const list = normalizeKlineRows(rows);
  if (!list.length || !Number.isFinite(Number(targetMs))) return null;
  let best = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const row of list) {
    const diff = Math.abs(Number(row.openTime || 0) - Number(targetMs));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }
  if (!best) return null;
  return {
    price: Number(best.close),
    openTime: Number(best.openTime || 0),
    diffMs: bestDiff
  };
}

async function fetchRecommendationPriceByTime(token = {}) {
  const symbol = String(token.symbol || '').trim().toUpperCase();
  const recommendationRaw = String(token.recommendationTime || '').trim();
  const targetMs = Date.parse(recommendationRaw);
  if (!symbol) throw new Error('symbol is required');
  if (!Number.isFinite(targetMs)) throw new Error('recommendationTime is required');

  const spotPair = `${symbol}USDT`;
  const startTime = targetMs - 6 * 60 * 60 * 1000;
  const endTime = targetMs + 6 * 60 * 60 * 1000;

  try {
    const spotResp = await axios.get(`${BASE_URL}/api/v3/klines`, {
      timeout: 15000,
      params: {
        symbol: spotPair,
        interval: '1m',
        startTime,
        endTime,
        limit: 1000
      }
    });
    const nearest = pickNearestKlinePrice(spotResp.data || [], targetMs);
    if (nearest && nearest.price > 0) {
      return {
        price: nearest.price,
        source: 'binance_spot_1m',
        pair: spotPair,
        matchedAt: nearest.openTime,
        diffMinutes: parseFloat((nearest.diffMs / 60000).toFixed(2))
      };
    }
  } catch (error) {}

  try {
    const alphaPair = await resolveAlphaTradingPairForTrade(symbol);
    if (alphaPair) {
      const alphaResp = await axios.get(
        `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/alpha-trade/klines`,
        {
          timeout: 15000,
          headers: BINANCE_ALPHA_HEADERS,
          params: {
            symbol: alphaPair,
            interval: '1m',
            startTime,
            endTime,
            limit: 1000
          }
        }
      );
      const nearest = pickNearestKlinePrice(alphaResp.data?.data || [], targetMs);
      if (nearest && nearest.price > 0) {
        return {
          price: nearest.price,
          source: 'binance_alpha_1m',
          pair: alphaPair,
          matchedAt: nearest.openTime,
          diffMinutes: parseFloat((nearest.diffMs / 60000).toFixed(2))
        };
      }
    }
  } catch (error) {}

  throw new Error('no historical price matched near recommendation time');
}

function clusterTechnicalLevels(values, currentPrice, side, options = {}) {
  const monthlyRange = Number(options.monthlyRange || 0);
  const clean = values
    .map(item => ({ price: Number(item.price), index: Number(item.index || 0), volume: Number(item.volume || 0) }))
    .filter(item => Number.isFinite(item.price) && item.price > 0)
    .filter(item => side === 'resistance' ? item.price > currentPrice : item.price < currentPrice)
    .sort((a, b) => a.price - b.price);
  if (!clean.length) return [];

  const tolerance = Math.max(currentPrice * 0.008, monthlyRange * 0.025, clean[clean.length - 1].price * 0.002, 1e-10);
  const clusters = [];
  for (const item of clean) {
    const existing = clusters.find(group => Math.abs(group.avg - item.price) <= tolerance);
    if (existing) {
      existing.items.push(item);
      existing.avg = existing.items.reduce((sum, row) => sum + row.price, 0) / existing.items.length;
      continue;
    }
    clusters.push({ avg: item.price, items: [item] });
  }

  return clusters
    .map(group => {
      const touches = group.items.length;
      const lastIndex = Math.max(...group.items.map(item => item.index));
      const volumeSum = group.items.reduce((sum, item) => sum + (Number.isFinite(item.volume) ? item.volume : 0), 0);
      const distancePct = Math.abs(group.avg - currentPrice) / currentPrice * 100;
      const score = touches * 12 + Math.log10(volumeSum + 1) * 2 + lastIndex * 0.015;
      return { price: group.avg, touches, lastIndex, distancePct, score };
    })
    .sort((a, b) => b.score - a.score);
}

function selectMonthlyTieredLevels(levels, currentPrice, side, monthlyExtreme, monthlyRange) {
  const valid = levels
    .filter(level => side === 'resistance' ? level.price > currentPrice : level.price < currentPrice)
    .sort((a, b) => side === 'resistance' ? a.price - b.price : b.price - a.price);
  if (!valid.length) return [];

  const minGap = Math.max(currentPrice * 0.025, monthlyRange * 0.12, 1e-10);
  const pickDistinct = (pool, targetPrice = null) => {
    const selected = [];
    const used = new Set();
    const add = (level) => {
      if (!level || used.has(level)) return;
      if (selected.some(item => Math.abs(item.price - level.price) < minGap)) return;
      selected.push(level);
      used.add(level);
    };

    add(pool[0]);

    const middlePool = pool
      .filter(level => !used.has(level))
      .sort((a, b) => {
        if (targetPrice != null) return Math.abs(a.price - targetPrice) - Math.abs(b.price - targetPrice);
        return b.score - a.score;
      });
    add(middlePool[0]);

    const extremePool = pool
      .filter(level => !used.has(level))
      .sort((a, b) => Math.abs(b.price - currentPrice) - Math.abs(a.price - currentPrice));
    add(extremePool[0]);

    for (const level of pool.filter(level => !used.has(level)).sort((a, b) => b.score - a.score)) {
      if (selected.length >= 3) break;
      add(level);
    }

    return selected;
  };

  const sideRange = Math.abs(monthlyExtreme - currentPrice);
  const targetMid = side === 'resistance'
    ? currentPrice + sideRange * 0.55
    : currentPrice - sideRange * 0.55;
  const selected = pickDistinct(valid, Number.isFinite(targetMid) ? targetMid : null);

  if (Number.isFinite(monthlyExtreme) && monthlyExtreme > 0 && selected.length < 3) {
    selected.push({
      price: monthlyExtreme,
      touches: 1,
      lastIndex: valid[valid.length - 1]?.lastIndex || 0,
      distancePct: Math.abs(monthlyExtreme - currentPrice) / currentPrice * 100,
      score: 0
    });
  }

  const result = selected
    .filter((level, index, array) => array.findIndex(item => Math.abs(item.price - level.price) < minGap) === index)
    .sort((a, b) => side === 'resistance' ? a.price - b.price : b.price - a.price);

  const fallbackMultipliers = [0.22, 0.5, 0.9, 1.25];
  for (const multiplier of fallbackMultipliers) {
    if (result.length >= 3) break;
    const price = side === 'resistance'
      ? currentPrice + monthlyRange * multiplier
      : currentPrice - monthlyRange * multiplier;
    if (!(price > 0)) continue;
    if (side === 'resistance' && price <= currentPrice) continue;
    if (side === 'support' && price >= currentPrice) continue;
    if (result.some(level => Math.abs(level.price - price) < minGap)) continue;
    result.push({
      price,
      touches: 0,
      lastIndex: 0,
      distancePct: Math.abs(price - currentPrice) / currentPrice * 100,
      score: -1
    });
  }

  return result
    .sort((a, b) => side === 'resistance' ? a.price - b.price : b.price - a.price)
    .slice(0, 3);
}

function buildPortfolio4hLevels(rows = []) {
  const klines = normalizeKlineRows(rows);
  if (klines.length < 42) {
    throw new Error('not enough 4h klines for technical level analysis');
  }

  const monthKlines = klines.slice(-180);
  const currentPrice = monthKlines[monthKlines.length - 1].close;
  const monthlyHigh = Math.max(...monthKlines.map(row => row.high));
  const monthlyLow = Math.min(...monthKlines.map(row => row.low));
  const monthlyRange = Math.max(monthlyHigh - monthlyLow, currentPrice * 0.02);
  const candidatesHigh = [];
  const candidatesLow = [];
  const start = 2;
  const end = monthKlines.length - 3;

  for (let i = start; i <= end; i += 1) {
    const row = monthKlines[i];
    const prev1 = monthKlines[i - 1];
    const prev2 = monthKlines[i - 2];
    const next1 = monthKlines[i + 1];
    const next2 = monthKlines[i + 2];
    if (row.high >= prev1.high && row.high >= prev2.high && row.high >= next1.high && row.high >= next2.high) {
      candidatesHigh.push({ price: row.high, index: i, volume: row.volume });
    }
    if (row.low <= prev1.low && row.low <= prev2.low && row.low <= next1.low && row.low <= next2.low) {
      candidatesLow.push({ price: row.low, index: i, volume: row.volume });
    }
  }

  for (let i = 0; i < monthKlines.length; i += 1) {
    const weight = i >= monthKlines.length - 42 ? 2 : 1;
    candidatesHigh.push({ price: monthKlines[i].high, index: i, volume: monthKlines[i].volume * weight });
    candidatesLow.push({ price: monthKlines[i].low, index: i, volume: monthKlines[i].volume * weight });
  }
  candidatesHigh.push({ price: monthlyHigh, index: monthKlines.length - 1, volume: 0 });
  candidatesLow.push({ price: monthlyLow, index: monthKlines.length - 1, volume: 0 });

  const resistance = selectMonthlyTieredLevels(
    clusterTechnicalLevels(candidatesHigh, currentPrice, 'resistance', { monthlyRange }),
    currentPrice,
    'resistance',
    monthlyHigh,
    monthlyRange
  );
  const support = selectMonthlyTieredLevels(
    clusterTechnicalLevels(candidatesLow, currentPrice, 'support', { monthlyRange }),
    currentPrice,
    'support',
    monthlyLow,
    monthlyRange
  );

  return {
    currentPrice,
    monthlyHigh,
    monthlyLow,
    support,
    resistance,
    lineCount: support.length + resistance.length
  };
}

function listingBaselineSet(payload, key) {
  return new Set((Array.isArray(payload?.baselines?.[key]) ? payload.baselines[key] : []).map(item => String(item || '').toUpperCase()));
}

async function getListingBaselineSets() {
  const payload = await loadListingSignals().catch(() => ({ baselines: {} }));
  return {
    binanceFutures: listingBaselineSet(payload, 'binance_futures'),
    binanceSpot: listingBaselineSet(payload, 'binance_spot'),
    coinbase: listingBaselineSet(payload, 'coinbase_spot'),
    upbit: listingBaselineSet(payload, 'upbit_spot'),
    bithumb: listingBaselineSet(payload, 'bithumb_spot')
  };
}

function autoListingNodes(symbol, manualNodes = {}, baselineSets = {}) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return { ...manualNodes };
  return {
    ...manualNodes,
    binanceFutures: Boolean(manualNodes.binanceFutures) || baselineSets.binanceFutures?.has(`${raw}USDT`),
    binanceSpot: Boolean(manualNodes.binanceSpot) || baselineSets.binanceSpot?.has(`${raw}USDT`),
    coinbase: Boolean(manualNodes.coinbase) || baselineSets.coinbase?.has(`${raw}-USD`) || baselineSets.coinbase?.has(`${raw}-USDC`) || baselineSets.coinbase?.has(`${raw}-USDT`),
    upbit: Boolean(manualNodes.upbit) || baselineSets.upbit?.has(`KRW-${raw}`) || baselineSets.upbit?.has(`BTC-${raw}`) || baselineSets.upbit?.has(`USDT-${raw}`),
    bithumb: Boolean(manualNodes.bithumb) || baselineSets.bithumb?.has(`KRW-${raw}`)
  };
}

async function buildLinkageSnapshot(linkageData, ticker24hMap, ticker1hMap = {}, ticker3dMap = {}, ticker5mMap = {}, ticker7dMap = {}) {
  const alphaTokens = await getAlphaTokenList().catch(() => []);
  const listingBaselineSets = await getListingBaselineSets();
  const alphaMetaMap = {};
  for (const token of alphaTokens) {
    const symbol = String(token?.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    alphaMetaMap[symbol] = token;
  }
  const concepts = await Promise.all((linkageData.concepts || []).map(async concept => {
    const conceptIsAlpha = isSpecialAlphaConcept(concept);
    const tokenItems = Array.isArray(concept.tokenItems)
      ? concept.tokenItems
      : (Array.isArray(concept.tokens) ? concept.tokens.map(symbol => ({ symbol, assetType: 'binance', notes: '' })) : []);
    const tokenResults = await Promise.all(tokenItems.map(async tokenMeta => {
      const symbol = String(tokenMeta?.symbol || '').trim().toUpperCase();
      const assetType = String(tokenMeta?.assetType || '').trim().toLowerCase() === 'onchain' ? 'onchain' : 'binance';
      const alphaMeta = alphaMetaMap[symbol] || null;
      const alphaMarketCap = Number(alphaMeta?.marketCap);
      if (!symbol) return { ok: false, missing: { token: '', reason: 'empty symbol' } };
      const alphaMetrics = alphaMeta ? await getAlphaLinkageMetrics(symbol).catch(() => null) : null;

      if (assetType === 'onchain') {
        const chainId = String(tokenMeta?.chainId || '').trim();
        const contractAddress = String(tokenMeta?.contractAddress || '').trim();
        if (!contractAddress) {
          return {
            ok: false,
            missing: {
              token: symbol,
              assetType: 'onchain',
              chainId,
              contractAddress,
              reason: 'missing contract address'
            }
          };
        }
        const market = await getDexScreenerTokenMarket(contractAddress, chainId);
        if (!market || !(Number(market.price) > 0)) {
          if (alphaMetrics?.lastPrice) {
            return {
              ok: true,
              item: {
                token: symbol,
                pair: alphaMetrics.pair || `${chainId || 'onchain'}:${contractAddress}`,
                assetType: 'onchain',
                chainId,
                contractAddress,
                notes: tokenMeta?.notes || '',
                currentMarketCap: Number.isFinite(alphaMarketCap) && alphaMarketCap > 0 ? alphaMarketCap : null,
                entryMarketCapMin: Number.isFinite(Number(tokenMeta?.entryMarketCapMin)) ? Number(tokenMeta.entryMarketCapMin) : null,
                entryMarketCapMax: Number.isFinite(Number(tokenMeta?.entryMarketCapMax)) ? Number(tokenMeta.entryMarketCapMax) : null,
                entryPriceMin: Number.isFinite(Number(tokenMeta?.entryPriceMin)) ? Number(tokenMeta.entryPriceMin) : null,
                entryPriceMax: Number.isFinite(Number(tokenMeta?.entryPriceMax)) ? Number(tokenMeta.entryPriceMax) : null,
                institutionPrice: Number.isFinite(Number(tokenMeta?.institutionPrice)) ? Number(tokenMeta.institutionPrice) : null,
                preMarketPrice: Number.isFinite(Number(tokenMeta?.preMarketPrice)) ? Number(tokenMeta.preMarketPrice) : null,
                openPrice: Number.isFinite(Number(tokenMeta?.openPrice)) ? Number(tokenMeta.openPrice) : null,
                twitterUrl: /^https?:\/\//i.test(String(tokenMeta?.twitterUrl || '').trim()) ? String(tokenMeta.twitterUrl).trim() : '',
                listingNodes: autoListingNodes(symbol, tokenMeta?.listingNodes || {}, listingBaselineSets),
                changePercent24h: Number.isFinite(alphaMetrics.changePercent1d) ? alphaMetrics.changePercent1d : null,
                changePercent1d: Number.isFinite(alphaMetrics.changePercent1d) ? alphaMetrics.changePercent1d : null,
                changePercent1h: Number.isFinite(alphaMetrics.changePercent1h) ? alphaMetrics.changePercent1h : null,
                changePercent3d: null,
                changePercent5m: Number.isFinite(alphaMetrics.changePercent5m) ? alphaMetrics.changePercent5m : null,
                changePercent7d: Number.isFinite(alphaMetrics.changePercent7d) ? alphaMetrics.changePercent7d : null,
                lastPrice: alphaMetrics.lastPrice
              }
            };
          }
          return {
            ok: false,
            missing: {
              token: symbol,
              assetType: 'onchain',
              chainId,
              contractAddress,
              reason: market?.error || 'onchain price not found'
            }
          };
        }
        return {
          ok: true,
          item: {
            token: symbol,
            pair: `${market.chainId || chainId || 'onchain'}:${contractAddress}`,
            assetType: 'onchain',
            chainId,
            contractAddress,
            notes: tokenMeta?.notes || '',
            currentMarketCap: Number.isFinite(alphaMarketCap) && alphaMarketCap > 0 ? alphaMarketCap : null,
            entryMarketCapMin: Number.isFinite(Number(tokenMeta?.entryMarketCapMin)) ? Number(tokenMeta.entryMarketCapMin) : null,
            entryMarketCapMax: Number.isFinite(Number(tokenMeta?.entryMarketCapMax)) ? Number(tokenMeta.entryMarketCapMax) : null,
            entryPriceMin: Number.isFinite(Number(tokenMeta?.entryPriceMin)) ? Number(tokenMeta.entryPriceMin) : null,
            entryPriceMax: Number.isFinite(Number(tokenMeta?.entryPriceMax)) ? Number(tokenMeta.entryPriceMax) : null,
            institutionPrice: Number.isFinite(Number(tokenMeta?.institutionPrice)) ? Number(tokenMeta.institutionPrice) : null,
            preMarketPrice: Number.isFinite(Number(tokenMeta?.preMarketPrice)) ? Number(tokenMeta.preMarketPrice) : null,
            openPrice: Number.isFinite(Number(tokenMeta?.openPrice)) ? Number(tokenMeta.openPrice) : null,
            twitterUrl: /^https?:\/\//i.test(String(tokenMeta?.twitterUrl || '').trim()) ? String(tokenMeta.twitterUrl).trim() : '',
            listingNodes: autoListingNodes(symbol, tokenMeta?.listingNodes || {}, listingBaselineSets),
            changePercent24h: Number.isFinite(alphaMetrics?.changePercent1d) ? alphaMetrics.changePercent1d : (Number.isFinite(market.changePercent24h) ? parseFloat(market.changePercent24h.toFixed(2)) : null),
            changePercent1d: Number.isFinite(alphaMetrics?.changePercent1d) ? alphaMetrics.changePercent1d : (Number.isFinite(market.changePercent24h) ? parseFloat(market.changePercent24h.toFixed(2)) : null),
            changePercent1h: Number.isFinite(alphaMetrics?.changePercent1h) ? alphaMetrics.changePercent1h : (Number.isFinite(market.changePercent1h) ? parseFloat(market.changePercent1h.toFixed(2)) : null),
            changePercent3d: null,
            changePercent5m: Number.isFinite(alphaMetrics?.changePercent5m) ? alphaMetrics.changePercent5m : (Number.isFinite(market.changePercent5m) ? parseFloat(market.changePercent5m.toFixed(2)) : null),
            changePercent7d: Number.isFinite(alphaMetrics?.changePercent7d) ? alphaMetrics.changePercent7d : null,
            lastPrice: Number.isFinite(Number(market.price)) ? Number(market.price) : null
          }
        };
      }

      const alphaListPrice = Number(alphaMeta?.price);
      const alphaListChange24h = Number(alphaMeta?.percentChange24h);
      if (conceptIsAlpha && (alphaMetrics?.lastPrice || (Number.isFinite(alphaListPrice) && alphaListPrice > 0))) {
        const alphaLastPrice = alphaMetrics?.lastPrice || alphaListPrice;
        const alphaChange24h = Number.isFinite(alphaMetrics?.changePercent1d)
          ? alphaMetrics.changePercent1d
          : (Number.isFinite(alphaListChange24h) ? parseFloat(alphaListChange24h.toFixed(2)) : null);
        return {
          ok: true,
          item: {
            token: symbol,
            pair: alphaMetrics?.pair || (alphaMeta?.alphaId ? `${String(alphaMeta.alphaId).trim().toUpperCase()}USDT` : `${symbol}USDT`),
            assetType: 'binance',
            source: 'binance_alpha',
            notes: tokenMeta?.notes || '',
            currentMarketCap: Number.isFinite(alphaMarketCap) && alphaMarketCap > 0 ? alphaMarketCap : null,
            entryMarketCapMin: Number.isFinite(Number(tokenMeta?.entryMarketCapMin)) ? Number(tokenMeta.entryMarketCapMin) : null,
            entryMarketCapMax: Number.isFinite(Number(tokenMeta?.entryMarketCapMax)) ? Number(tokenMeta.entryMarketCapMax) : null,
            entryPriceMin: Number.isFinite(Number(tokenMeta?.entryPriceMin)) ? Number(tokenMeta.entryPriceMin) : null,
            entryPriceMax: Number.isFinite(Number(tokenMeta?.entryPriceMax)) ? Number(tokenMeta.entryPriceMax) : null,
            institutionPrice: Number.isFinite(Number(tokenMeta?.institutionPrice)) ? Number(tokenMeta.institutionPrice) : null,
            preMarketPrice: Number.isFinite(Number(tokenMeta?.preMarketPrice)) ? Number(tokenMeta.preMarketPrice) : null,
            openPrice: Number.isFinite(Number(tokenMeta?.openPrice)) ? Number(tokenMeta.openPrice) : null,
            twitterUrl: /^https?:\/\//i.test(String(tokenMeta?.twitterUrl || '').trim()) ? String(tokenMeta.twitterUrl).trim() : '',
            listingNodes: autoListingNodes(symbol, tokenMeta?.listingNodes || {}, listingBaselineSets),
            changePercent24h: alphaChange24h,
            changePercent1d: alphaChange24h,
            changePercent1h: Number.isFinite(alphaMetrics?.changePercent1h) ? alphaMetrics.changePercent1h : null,
            changePercent3d: null,
            changePercent5m: Number.isFinite(alphaMetrics?.changePercent5m) ? alphaMetrics.changePercent5m : null,
            changePercent7d: Number.isFinite(alphaMetrics?.changePercent7d) ? alphaMetrics.changePercent7d : null,
            lastPrice: alphaLastPrice
          }
        };
      }

      const pair = `${symbol}USDT`;
      const ticker = ticker24hMap[pair];
      const ticker1h = ticker1hMap[pair];
      if (!ticker || !Number.isFinite(ticker.priceChangePercent)) {
        if (alphaMetrics?.lastPrice) {
          return {
            ok: true,
            item: {
              token: symbol,
              pair: alphaMetrics.pair || pair,
              assetType: 'binance',
              notes: tokenMeta?.notes || '',
              currentMarketCap: Number.isFinite(alphaMarketCap) && alphaMarketCap > 0 ? alphaMarketCap : null,
              entryMarketCapMin: Number.isFinite(Number(tokenMeta?.entryMarketCapMin)) ? Number(tokenMeta.entryMarketCapMin) : null,
              entryMarketCapMax: Number.isFinite(Number(tokenMeta?.entryMarketCapMax)) ? Number(tokenMeta.entryMarketCapMax) : null,
              entryPriceMin: Number.isFinite(Number(tokenMeta?.entryPriceMin)) ? Number(tokenMeta.entryPriceMin) : null,
              entryPriceMax: Number.isFinite(Number(tokenMeta?.entryPriceMax)) ? Number(tokenMeta.entryPriceMax) : null,
              institutionPrice: Number.isFinite(Number(tokenMeta?.institutionPrice)) ? Number(tokenMeta.institutionPrice) : null,
              preMarketPrice: Number.isFinite(Number(tokenMeta?.preMarketPrice)) ? Number(tokenMeta.preMarketPrice) : null,
              openPrice: Number.isFinite(Number(tokenMeta?.openPrice)) ? Number(tokenMeta.openPrice) : null,
              twitterUrl: /^https?:\/\//i.test(String(tokenMeta?.twitterUrl || '').trim()) ? String(tokenMeta.twitterUrl).trim() : '',
              listingNodes: autoListingNodes(symbol, tokenMeta?.listingNodes || {}, listingBaselineSets),
              changePercent24h: Number.isFinite(alphaMetrics.changePercent1d) ? alphaMetrics.changePercent1d : null,
              changePercent1d: Number.isFinite(alphaMetrics.changePercent1d) ? alphaMetrics.changePercent1d : null,
              changePercent1h: Number.isFinite(alphaMetrics.changePercent1h) ? alphaMetrics.changePercent1h : null,
              changePercent3d: null,
              changePercent5m: Number.isFinite(alphaMetrics.changePercent5m) ? alphaMetrics.changePercent5m : null,
              changePercent7d: Number.isFinite(alphaMetrics.changePercent7d) ? alphaMetrics.changePercent7d : null,
              lastPrice: alphaMetrics.lastPrice
            }
          };
        }
        const futuresMetrics = await getFuturesLinkageMetrics(symbol).catch(() => null);
        if (futuresMetrics?.lastPrice) {
          return {
            ok: true,
            item: {
              token: symbol,
              pair: futuresMetrics.pair || pair,
              assetType: 'binance',
              source: 'binance_futures',
              notes: tokenMeta?.notes || '',
              currentMarketCap: Number.isFinite(alphaMarketCap) && alphaMarketCap > 0 ? alphaMarketCap : null,
              entryMarketCapMin: Number.isFinite(Number(tokenMeta?.entryMarketCapMin)) ? Number(tokenMeta.entryMarketCapMin) : null,
              entryMarketCapMax: Number.isFinite(Number(tokenMeta?.entryMarketCapMax)) ? Number(tokenMeta.entryMarketCapMax) : null,
              entryPriceMin: Number.isFinite(Number(tokenMeta?.entryPriceMin)) ? Number(tokenMeta.entryPriceMin) : null,
              entryPriceMax: Number.isFinite(Number(tokenMeta?.entryPriceMax)) ? Number(tokenMeta.entryPriceMax) : null,
              institutionPrice: Number.isFinite(Number(tokenMeta?.institutionPrice)) ? Number(tokenMeta.institutionPrice) : null,
              preMarketPrice: Number.isFinite(Number(tokenMeta?.preMarketPrice)) ? Number(tokenMeta.preMarketPrice) : null,
              openPrice: Number.isFinite(Number(tokenMeta?.openPrice)) ? Number(tokenMeta.openPrice) : null,
              twitterUrl: /^https?:\/\//i.test(String(tokenMeta?.twitterUrl || '').trim()) ? String(tokenMeta.twitterUrl).trim() : '',
              listingNodes: autoListingNodes(symbol, tokenMeta?.listingNodes || {}, listingBaselineSets),
              changePercent24h: Number.isFinite(futuresMetrics.changePercent1d) ? futuresMetrics.changePercent1d : null,
              changePercent1d: Number.isFinite(futuresMetrics.changePercent1d) ? futuresMetrics.changePercent1d : null,
              changePercent1h: Number.isFinite(futuresMetrics.changePercent1h) ? futuresMetrics.changePercent1h : null,
              changePercent3d: null,
              changePercent5m: Number.isFinite(futuresMetrics.changePercent5m) ? futuresMetrics.changePercent5m : null,
              changePercent7d: Number.isFinite(futuresMetrics.changePercent7d) ? futuresMetrics.changePercent7d : null,
              lastPrice: futuresMetrics.lastPrice
            }
          };
        }
        return {
          ok: false,
          missing: {
            token: symbol,
            pair,
            assetType: 'binance',
            reason: 'Binance USDT ticker not found'
          }
        };
      }
      return {
        ok: true,
        item: {
          token: symbol,
          pair,
          assetType: 'binance',
          notes: tokenMeta?.notes || '',
          currentMarketCap: Number.isFinite(alphaMarketCap) && alphaMarketCap > 0 ? alphaMarketCap : null,
          entryMarketCapMin: Number.isFinite(Number(tokenMeta?.entryMarketCapMin)) ? Number(tokenMeta.entryMarketCapMin) : null,
          entryMarketCapMax: Number.isFinite(Number(tokenMeta?.entryMarketCapMax)) ? Number(tokenMeta.entryMarketCapMax) : null,
          entryPriceMin: Number.isFinite(Number(tokenMeta?.entryPriceMin)) ? Number(tokenMeta.entryPriceMin) : null,
          entryPriceMax: Number.isFinite(Number(tokenMeta?.entryPriceMax)) ? Number(tokenMeta.entryPriceMax) : null,
          institutionPrice: Number.isFinite(Number(tokenMeta?.institutionPrice)) ? Number(tokenMeta.institutionPrice) : null,
          preMarketPrice: Number.isFinite(Number(tokenMeta?.preMarketPrice)) ? Number(tokenMeta.preMarketPrice) : null,
          openPrice: Number.isFinite(Number(tokenMeta?.openPrice)) ? Number(tokenMeta.openPrice) : null,
          twitterUrl: /^https?:\/\//i.test(String(tokenMeta?.twitterUrl || '').trim()) ? String(tokenMeta.twitterUrl).trim() : '',
          listingNodes: autoListingNodes(symbol, tokenMeta?.listingNodes || {}, listingBaselineSets),
          changePercent24h: parseFloat(ticker.priceChangePercent.toFixed(2)),
          changePercent1d: parseFloat(ticker.priceChangePercent.toFixed(2)),
          changePercent1h: Number.isFinite(ticker1h?.priceChangePercent)
            ? parseFloat(ticker1h.priceChangePercent.toFixed(2))
            : null,
          changePercent3d: Number.isFinite(ticker3dMap[pair]) ? ticker3dMap[pair] : null,
          changePercent5m: Number.isFinite(ticker5mMap[pair]?.priceChangePercent)
            ? parseFloat(ticker5mMap[pair].priceChangePercent.toFixed(2))
            : null,
          changePercent7d: Number.isFinite(ticker7dMap[pair]?.priceChangePercent)
            ? parseFloat(ticker7dMap[pair].priceChangePercent.toFixed(2))
            : null,
          lastPrice: Number.isFinite(ticker.lastPrice) ? ticker.lastPrice : null
        }
      };
    }));
    const missingTokens = tokenResults
      .filter(result => result && !result.ok && result.missing?.token)
      .map(result => result.missing);
    const movers = tokenResults
      .filter(result => result?.ok && result.item)
      .map(result => result.item)
      .sort((a, b) => Number(b.changePercent1h ?? -999) - Number(a.changePercent1h ?? -999));

    const positiveCount = movers.filter(item => item.changePercent24h > 0).length;
    const movers1h = movers.filter(item => Number.isFinite(item.changePercent1h));
    const positiveCount1h = movers1h.filter(item => item.changePercent1h > 0).length;
    const avgChange = movers.length
      ? movers.reduce((sum, item) => sum + item.changePercent24h, 0) / movers.length
      : 0;
    const avgChange1h = movers1h.length
      ? movers1h.reduce((sum, item) => sum + item.changePercent1h, 0) / movers1h.length
      : 0;

    return {
      conceptId: concept.id,
      name: concept.name,
      status: concept.status,
      tokenCount: concept.tokens.length,
      trackedCount: movers.length,
      positiveCount,
      trackedCount1h: movers1h.length,
      positiveCount1h,
      avgChange24h: parseFloat(avgChange.toFixed(2)),
      avgChange1h: parseFloat(avgChange1h.toFixed(2)),
      leaderNow: movers[0]?.token || '',
      topMovers: movers.slice(0, 10),
      allMovers: movers,
      missingTokens
    };
  }));

  const allPairs = Object.values(ticker24hMap)
    .filter(item => item.symbol.endsWith('USDT') && Number.isFinite(item.priceChangePercent))
    .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
    .slice(0, 30)
    .map(item => ({
      pair: item.symbol,
      token: item.symbol.replace(/USDT$/, ''),
      changePercent24h: parseFloat(item.priceChangePercent.toFixed(2))
    }));

  return {
    generatedAt: new Date().toISOString(),
    conceptBoard: concepts.sort((a, b) => b.avgChange1h - a.avgChange1h),
    marketTop30: allPairs
  };
}

async function getPlanLivePrice(plan, spotPrices) {
  if (plan.assetType === 'onchain') {
    if (!plan.contractAddress) {
      return null;
    }
    const chainId = String(plan.chainId || '56').trim();
    let priceData = null;
    if (chainId === '501') {
      priceData = await getSolanaTokenPrice(plan.contractAddress);
    }
    if (!priceData) {
      priceData = await getWeb3TokenPrice(chainId, plan.contractAddress);
    }
    if (!priceData || !Number.isFinite(priceData.price)) {
      return null;
    }
    return {
      currentPrice: priceData.price,
      priceSource: 'onchain'
    };
  }

  if (plan.symbol === 'USDT') {
    return {
      currentPrice: 1,
      priceSource: 'binance'
    };
  }

  const tradingPair = `${plan.symbol}USDT`;
  if (!Number.isFinite(spotPrices[tradingPair])) {
    const alphaTicker = await getBinanceAlphaTickerPriceBySymbol(plan.symbol);
    if (!alphaTicker || !Number.isFinite(alphaTicker.price)) {
      return null;
    }
    return {
      currentPrice: alphaTicker.price,
      priceSource: 'alpha'
    };
  }
  return {
    currentPrice: spotPrices[tradingPair],
    priceSource: 'binance'
  };
}

async function getLienFiMetrics() {
  const cached = externalMetricCache.lienfi;
  if (cached.data && Date.now() < Number(cached.expiresAt || 0)) {
    return cached.data;
  }

  const response = await axios.get('https://lienfi.com/', {
    timeout: 15000,
    headers: {
      'User-Agent': BINANCE_ALPHA_HEADERS['User-Agent'],
      'Accept': 'text/html,application/xhtml+xml'
    }
  });
  const html = String(response.data || '');
  const match = html.match(/Portfolio[\s\S]{0,600}?Live[\s\S]{0,600}?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!match) {
    throw new Error('LienFi live portfolio value not found');
  }

  const tvl = Number(String(match[1]).replace(/,/g, ''));
  if (!Number.isFinite(tvl)) {
    throw new Error('LienFi live portfolio value invalid');
  }

  const data = {
    provider: 'LienFi',
    label: 'Portfolio Live',
    tvl,
    formattedTvl: `$${tvl.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    url: 'https://lienfi.com/',
    fetchedAt: new Date().toISOString()
  };
  externalMetricCache.lienfi = {
    data,
    expiresAt: Date.now() + 5 * 60 * 1000
  };
  return data;
}

// 计算基金数据
async function calculateFundData() {
  const [binanceAssets, fundingAssets, alphaHoldings, spotPrices, fundConfig] = await Promise.all([
    getBinanceAssets(),
    getFundingAssets(),
    getAlphaHoldings(),
    getAllPrices(),
    loadFundConfig()
  ]);

  // 合并现货和资金账户资产
  const combinedBinanceAssets = [...binanceAssets];
  
  // 将资金账户资产合并到现货资产中
  for (const fundingAsset of fundingAssets) {
    const existingIndex = combinedBinanceAssets.findIndex(a => a.asset === fundingAsset.asset);
    if (existingIndex >= 0) {
      // 如果现货账户已有该资产，累加数量
      const existingFree = parseFloat(combinedBinanceAssets[existingIndex].free);
      const fundingFree = parseFloat(fundingAsset.free);
      combinedBinanceAssets[existingIndex].free = (existingFree + fundingFree).toString();
    } else {
      // 否则添加新资产
      combinedBinanceAssets.push(fundingAsset);
    }
  }

  // 处理币安资产（现货+资金账户合并）
  const binanceEnriched = combinedBinanceAssets.map(asset => {
    const total = parseFloat(asset.free) + parseFloat(asset.locked || 0);
    const symbol = asset.asset;
    
    let usdtPrice = 0;
    let usdtValue = 0;
    
    if (isStableCoinSymbol(symbol)) {
      usdtPrice = 1;
      usdtValue = total;
    } else {
      const tradingPair = `${symbol}USDT`;
      if (spotPrices[tradingPair]) {
        usdtPrice = spotPrices[tradingPair];
        usdtValue = total * usdtPrice;
      }
    }

    return {
      symbol, name: symbol,
      free: parseFloat(asset.free), locked: parseFloat(asset.locked || 0), total,
      usdtPrice: usdtPrice || null, usdtValue: usdtValue || null,
      source: asset.source || 'binance', chainId: null, contractAddress: null
    };
  }).filter(asset => asset.usdtPrice !== null);

  // 处理 Alpha 持仓
  const alphaEnriched = [];
  for (const holding of alphaHoldings) {
    let resolvedPrice = null;
    const priceData = await getWeb3TokenPrice(holding.chainId, holding.contractAddress);
    if (priceData && Number.isFinite(Number(priceData.price)) && Number(priceData.price) > 0) {
      resolvedPrice = {
        price: Number(priceData.price),
        source: 'onchain'
      };
    } else if (holding.symbol) {
      const alphaTicker = await getBinanceAlphaTickerPriceBySymbol(holding.symbol);
      if (alphaTicker && Number.isFinite(alphaTicker.price) && alphaTicker.price > 0) {
        resolvedPrice = {
          price: Number(alphaTicker.price),
          source: 'alpha'
        };
      }
    }

    if (resolvedPrice) {
      const usdtValue = holding.amount * resolvedPrice.price;
      alphaEnriched.push({
        symbol: holding.symbol, name: holding.symbol,
        free: holding.amount, locked: 0, total: holding.amount,
        usdtPrice: resolvedPrice.price, usdtValue: usdtValue,
        source: resolvedPrice.source, chainId: holding.chainId, contractAddress: holding.contractAddress
      });
    }
  }

  // 合并并排序
  const onchainWalletData = await getCommunityOnchainFundAssets(spotPrices);
  const onchainWalletEnriched = onchainWalletData.assets;

  const allAssets = [...binanceEnriched, ...alphaEnriched, ...onchainWalletEnriched];
  allAssets.sort((a, b) => b.usdtValue - a.usdtValue);

  // 计算总计
  const binanceTotal = binanceEnriched.reduce((sum, a) => sum + a.usdtValue, 0);
  const alphaTotal = alphaEnriched.reduce((sum, a) => sum + a.usdtValue, 0);
  const onchainWalletTotal = onchainWalletEnriched.reduce((sum, a) => sum + a.usdtValue, 0);
  const totalValue = binanceTotal + alphaTotal + onchainWalletTotal;

  // 计算净值
  const currentNav = totalValue / fundConfig.totalShares;
  const navChange = ((currentNav - fundConfig.initialNav) / fundConfig.initialNav) * 100;
  const totalBurned = Math.max(0, Number(fundConfig.totalBurned || 0));
  const circulating = Math.max(0, Number(fundConfig.totalShares || 0));
  const totalIssued = parseFloat((circulating + totalBurned).toFixed(6));
  const stageCap = Math.max(totalIssued, Number(fundConfig.stageCap || DEFAULT_FUND_CONFIG.stageCap));
  const pendingUnlock = parseFloat(Math.max(0, stageCap - totalIssued).toFixed(6));

  return {
    totalValue,
    fund: {
      totalShares: fundConfig.totalShares,
      currentNav: parseFloat(currentNav.toFixed(4)),
      initialNav: fundConfig.initialNav,
      navChange: parseFloat(navChange.toFixed(2)),
      isProfitable: currentNav >= fundConfig.initialNav,
      supply: {
        stageCap: parseFloat(stageCap.toFixed(6)),
        totalIssued,
        circulating: parseFloat(circulating.toFixed(6)),
        totalBurned: parseFloat(totalBurned.toFixed(6)),
        pendingUnlock
      }
    },
    breakdown: {
      binance: { total: binanceTotal, count: binanceEnriched.length },
      alpha: { total: alphaTotal, count: alphaEnriched.length },
      onchainWallet: {
        total: onchainWalletTotal,
        count: onchainWalletEnriched.length,
        warnings: onchainWalletData.warnings
      }
    },
    assets: allAssets
  };
}

// API 路由：公开基金概况
app.get('/api/alpha/token-list', async (req, res) => {
  try {
    const forceRefresh = String(req.query.force || '').trim() === '1';
    const list = await getAlphaTokenList({ forceRefresh });
    const symbolMap = await getAlphaSymbolMap({ forceRefresh });
    res.json({
      success: true,
      count: list.length,
      data: list,
      mapping: symbolMap
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alpha/exchange-info', async (req, res) => {
  try {
    const forceRefresh = String(req.query.force || '').trim() === '1';
    const data = await getAlphaExchangeInfo({ forceRefresh });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alpha/ticker', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }
    const ticker = await getAlphaTickerBySymbol(symbol);
    if (!ticker) {
      return res.status(404).json({ success: false, error: 'symbol not found in Binance Alpha map' });
    }
    res.json({
      success: true,
      pair: ticker.pair,
      data: ticker.data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alpha/klines', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim();
    const interval = String(req.query.interval || '4h').trim();
    const limit = safeAlphaLimit(req.query.limit, 100, 1000);
    const startTime = String(req.query.startTime || '').trim();
    const endTime = String(req.query.endTime || '').trim();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }

    const symbolMap = await getAlphaSymbolMap();
    const pair = resolveAlphaTradingPair(symbol, symbolMap);
    if (!pair) {
      return res.status(404).json({ success: false, error: 'symbol not found in Binance Alpha map' });
    }

    const params = { symbol: pair, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const response = await axios.get(
      `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/alpha-trade/klines`,
      { timeout: 15000, headers: BINANCE_ALPHA_HEADERS, params }
    );

    res.json({
      success: true,
      pair,
      interval,
      limit,
      data: response.data?.data || []
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alpha/agg-trades', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim();
    const limit = safeAlphaLimit(req.query.limit, 100, 1000);
    const startTime = String(req.query.startTime || '').trim();
    const endTime = String(req.query.endTime || '').trim();
    const fromId = String(req.query.fromId || '').trim();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }

    const symbolMap = await getAlphaSymbolMap();
    const pair = resolveAlphaTradingPair(symbol, symbolMap);
    if (!pair) {
      return res.status(404).json({ success: false, error: 'symbol not found in Binance Alpha map' });
    }

    const params = { symbol: pair, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    if (fromId) params.fromId = fromId;

    const response = await axios.get(
      `${BINANCE_ALPHA_BASE_URL}/bapi/defi/v1/public/alpha-trade/agg-trades`,
      { timeout: 15000, headers: BINANCE_ALPHA_HEADERS, params }
    );

    res.json({
      success: true,
      pair,
      limit,
      data: response.data?.data || []
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/wallet-dashboard', requireWhitelistSession, async (req, res) => {
  try {
    const dashboard = await buildCommunityOnchainDashboard();
    return res.json(dashboard);

    const [status, address, balance, quota, history, settings] = await Promise.all([
      safeRunBaw(['wallet', 'status']),
      safeRunBaw(['wallet', 'address']),
      safeRunBaw(['wallet', 'balance']),
      safeRunBaw(['wallet', 'left-quota']),
      safeRunBaw(['wallet', 'tx-history']),
      safeRunBaw(['wallet', 'settings'])
    ]);

    const warnings = [status, address, balance, quota, history, settings]
      .filter(item => !item.ok)
      .map(item => item.error);

    const connected = String(status.result?.data?.status || '').toUpperCase() === 'CONNECTED';
    const addresses = Array.isArray(address.result?.data?.addresses)
      ? address.result.data.addresses.map(item => ({
          chainId: String(item?.binanceChainId || '').trim(),
          chainName: String(item?.chainName || '').trim(),
          address: String(item?.address || '').trim()
        })).filter(item => item.chainName && item.address)
      : [];

    const rawBalances = Array.isArray(balance.result?.data)
      ? balance.result.data
          .map(item => ({
            symbol: String(item?.symbol || '').trim().toUpperCase(),
            chainId: String(item?.binanceChainId || '').trim(),
            balance: toNumberSafe(item?.balance, 0),
            price: toNumberSafe(item?.price, 0),
            value: toNumberSafe(item?.value, 0),
            tokenAddress: String(item?.address || '').trim()
          }))
          .filter(item => item.symbol && item.balance > 0)
      : [];

    const baselineState = await loadWalletTokenBaselines();
    const baselineTokens = baselineState.tokens || {};
    let baselineChanged = false;

    const balances = rawBalances.map(item => {
      const key = buildWalletTokenBaselineKey(item);
      const currentPrice = toNumberSafe(item.price, 0);
      const currentValue = toNumberSafe(item.value, 0);
      let baseline = key ? baselineTokens[key] : null;

      if ((!baseline || !Number.isFinite(Number(baseline.costBasisPrice))) && currentPrice > 0 && key) {
        baseline = {
          symbol: item.symbol,
          chainId: item.chainId,
          tokenAddress: item.tokenAddress,
          costBasisPrice: currentPrice,
          firstSeenAt: new Date().toISOString()
        };
        baselineTokens[key] = baseline;
        baselineChanged = true;
      }

      const costBasisPrice = toNumberSafe(baseline?.costBasisPrice, 0);
      const pnlPct = costBasisPrice > 0 && currentPrice > 0
        ? ((currentPrice - costBasisPrice) / costBasisPrice) * 100
        : null;
      const costValue = costBasisPrice > 0 ? costBasisPrice * item.balance : null;
      const pnlValue = costValue !== null ? (currentValue - costValue) : null;

      return {
        ...item,
        costBasisPrice: costBasisPrice > 0 ? costBasisPrice : null,
        pnlPct: pnlPct !== null ? Number(pnlPct.toFixed(4)) : null,
        pnlValue: pnlValue !== null ? Number(pnlValue.toFixed(8)) : null
      };
    }).sort((a, b) => b.value - a.value);

    if (baselineChanged) {
      await saveWalletTokenBaselines({ tokens: baselineTokens });
    }

    const rawTransactions = history.result?.data?.transactions || [];
    const recentTransactions = buildWalletRecentTransactions(rawTransactions);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      connected,
      addresses,
      balances,
      recentTransactions,
      quota: quota.result?.data || null,
      settings: settings.result?.data || null,
      warnings
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/wallet-watch', requireWhitelistSession, async (req, res) => {
  try {
    const refresh = String(req.query.refresh || '').trim() === '1';
    const dashboard = await buildWalletWatchDashboard({ updateSnapshot: refresh });
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/wallet-watch', async (req, res) => {
  const { adminPassword } = req.query;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const data = await loadWalletWatchData();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/wallet-watch', async (req, res) => {
  const { adminPassword, data } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const saved = await saveWalletWatchData(data || {});
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kol-signals', requireWhitelistSession, async (req, res) => {
  try {
    const refresh = String(req.query.refresh || '').trim() === '1';
    const dashboard = await buildKolSignalsDashboard({ refresh });
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/kol-signals', async (req, res) => {
  const { adminPassword } = req.query;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const data = await loadKolSignalsData();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/kol-signals', async (req, res) => {
  const { adminPassword, data } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const saved = await saveKolSignalsData(data || {});
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/kol-signals/import', async (req, res) => {
  const { adminPassword, handle, text } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const sourceHandle = normalizeKolHandle(handle || 'manual');
    const rawText = String(text || '').trim();
    if (!rawText) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }
    const blocks = rawText
      .split(/\n\s*\n/g)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 50);
    const feed = await loadKolSignalFeed();
    const manualPosts = blocks.map((block, index) => normalizeKolPost({
      handle: sourceHandle,
      name: sourceHandle,
      text: block,
      link: '',
      publishedAt: new Date(Date.now() - index * 1000).toISOString(),
      source: 'manual'
    }));
    const merged = new Map();
    [...manualPosts, ...(feed.posts || [])].forEach(post => {
      const normalized = normalizeKolPost(post);
      if (!merged.has(normalized.id)) merged.set(normalized.id, normalized);
    });
    const posts = [...merged.values()]
      .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
      .slice(0, 500);
    await saveKolSignalFeed(posts);
    const data = await loadKolSignalsData();
    const board = buildKolSignalBoard(posts, data.kols);
    board.contractSignals = await enrichKolContractSignals(board.contractSignals);
    res.json({ success: true, imported: manualPosts.length, board });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/uniswap-v4/pools', async (req, res) => {
  try {
    const rawChains = String(req.query.chains || 'base,ethereum')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean);
    const selected = UNISWAP_V4_CHAINS.filter(chain => rawChains.includes(chain.id));
    const blockWindow = Number(req.query.blockWindow || 5000);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 80)));
    const hookOnly = String(req.query.hookOnly || '') === '1';
    const results = await Promise.all(selected.map(async chain => {
      try {
        return await fetchUniswapV4InitializeLogs(chain, blockWindow);
      } catch (error) {
        return { chain: chain.id, poolManager: chain.poolManager || UNISWAP_V4_POOL_MANAGER, latestBlock: null, fromBlock: null, rows: [], error: error.message };
      }
    }));
    const rawPools = results
      .flatMap(item => item.rows || [])
      .filter(item => !hookOnly || item.hasHook)
      .sort((a, b) => (b.blockNumber - a.blockNumber) || (b.logIndex - a.logIndex));
    const pools = enrichUniswapV4Pools(rawPools)
      .sort((a, b) => (b.score - a.score) || (b.blockNumber - a.blockNumber) || (b.logIndex - a.logIndex))
      .slice(0, limit);
    res.json({
      success: true,
      poolManager: UNISWAP_V4_POOL_MANAGER,
      topic: UNISWAP_V4_INITIALIZE_TOPIC,
      generatedAt: new Date().toISOString(),
      chains: results.map(item => ({
        chain: item.chain,
        poolManager: item.poolManager || null,
        rpcUrl: item.rpcUrl || null,
        latestBlock: item.latestBlock,
        fromBlock: item.fromBlock,
        count: item.rows?.length || 0,
        error: item.error || null
      })),
      pools
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/fund', async (req, res) => {
  try {
    const data = await calculateFundData();
    const navHistory = await updateNavHistorySnapshot(data);
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalValue: data.totalValue,
      fund: data.fund,
      breakdown: data.breakdown,
      navHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/contact', async (req, res) => {
  try {
    const config = await loadContactConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API 路由：验证邮箱
app.post('/api/login', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: '请输入邮箱' });
  }

  // 验证是否为谷歌邮箱
  if (!email.toLowerCase().endsWith('@gmail.com')) {
    return res.status(401).json({ success: false, error: '请使用谷歌邮箱(@gmail.com)' });
  }

  const isValid = await validateEmail(email);

  if (!isValid) {
    return res.status(401).json({ success: false, error: '邮箱不在白名单中' });
  }

  return res.json({
    success: true,
    message: '验证成功',
    email: email.toLowerCase().trim()
  });
});

// API 路由：获取完整资产数据（需验证邮箱）
app.get('/api/assets', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(401).json({ success: false, error: '请提供邮箱' });
    }

    // 验证是否为谷歌邮箱
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      return res.status(401).json({ success: false, error: '请使用谷歌邮箱(@gmail.com)' });
    }

    const isValid = await validateEmail(email);

    if (!isValid) {
      return res.status(401).json({ success: false, error: '邮箱不在白名单中' });
    }

    const data = await calculateFundData();
    const visibleAssets = filterVisibleFundAssets(data.assets || []);
    const positionBroadcast = await updateAssetSnapshotsAndBuildChanges(visibleAssets);
    const baselineState = await loadWalletTokenBaselines();
    const baselineTokens = baselineState?.tokens && typeof baselineState.tokens === 'object'
      ? baselineState.tokens
      : {};
    const enrichedAssets = visibleAssets.map(asset => {
      const key = buildFundAssetBaselineKey(asset);
      const baseline = key ? baselineTokens[key] : null;
      const costBasisPrice = Number(baseline?.costBasisPrice || 0);
      const totalAmount = Number(asset.total || 0);
      const currentPrice = Number(asset.usdtPrice || 0);
      const currentValue = Number(asset.usdtValue || 0);
      const costValue = costBasisPrice > 0 && totalAmount > 0 ? costBasisPrice * totalAmount : null;
      const pnlValue = costValue != null ? (currentValue - costValue) : null;
      const pnlPct = costBasisPrice > 0 && currentPrice > 0
        ? ((currentPrice - costBasisPrice) / costBasisPrice) * 100
        : null;
      return {
        ...asset,
        costBasisPrice: costBasisPrice > 0 ? parseFloat(costBasisPrice.toFixed(8)) : null,
        costValue: costValue != null ? parseFloat(costValue.toFixed(8)) : null,
        pnlValue: pnlValue != null ? parseFloat(pnlValue.toFixed(8)) : null,
        pnlPct: pnlPct != null ? parseFloat(pnlPct.toFixed(4)) : null
      };
    });
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
      assets: enrichedAssets,
      fundAssetFilterMinUsd: FUND_ASSET_MIN_VISIBLE_USD,
      positionChanges: positionBroadcast.changes,
      positionChangeBaseline: positionBroadcast.baselineTimestamp,
      positionChangeHistory: positionBroadcast.history,
      positionChangeWindowDays: positionBroadcast.historyWindowDays
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API 路由：管理员查看密钥使用情况（可选，用于你管理）
app.get('/api/admin/keys', async (req, res) => {
  const { adminKey } = req.query;
  
  // 简单的管理员验证（可以用环境变量设置更复杂的）
  if (!isAdminAuthorized(adminKey)) {
    return res.status(403).json({ success: false, error: '无权限' });
  }
  
  try {
    const keys = await loadViewKeys();
    // 隐藏完整密钥，只显示前8位
    const maskedKeys = keys.map(k => ({
      ...k,
      key: k.key.substring(0, 8) + '****'
    }));
    res.json({ success: true, keys: maskedKeys });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 管理员接口：添加白名单邮箱
app.post('/api/admin/whitelist', async (req, res) => {
  const { adminKey, emails } = req.body;

  if (!isAdminAuthorized(adminKey)) {
    return res.status(403).json({ success: false, error: '无权限' });
  }

  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ success: false, error: '请提供邮箱数组' });
  }

  try {
    const whitelist = await loadWhitelist();
    const newEmails = emails.map(e => e.toLowerCase().trim());
    whitelist.emails = [...new Set([...whitelist.emails, ...newEmails])];
    await saveWhitelist(whitelist);
    res.json({ success: true, message: '白名单已更新', count: whitelist.emails.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 管理员接口：查看白名单
app.get('/api/admin/whitelist', async (req, res) => {
  const { adminKey } = req.query;

  if (!isAdminAuthorized(adminKey)) {
    return res.status(403).json({ success: false, error: '无权限' });
  }

  try {
    const whitelist = await loadWhitelist();
    res.json({ success: true, emails: whitelist.emails });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/wallet-whitelist', async (req, res) => {
  const { adminKey } = req.query;

  if (!isAdminAuthorized(adminKey)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const whitelist = await loadWalletWhitelist();
    res.json({ success: true, wallets: whitelist.wallets || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/wallet-whitelist', async (req, res) => {
  const { adminKey, wallets } = req.body;

  if (!isAdminAuthorized(adminKey)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  if (!Array.isArray(wallets)) {
    return res.status(400).json({ success: false, error: 'wallets must be an array' });
  }

  try {
    const current = await loadWalletWhitelist();
    const merged = [...new Set([...(current.wallets || []), ...wallets])];
    const saved = await saveWalletWhitelist({ wallets: merged });
    res.json({ success: true, wallets: saved.wallets, count: saved.wallets.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/wallet-whitelist/replace', async (req, res) => {
  const { adminKey, wallets } = req.body;

  if (!isAdminAuthorized(adminKey)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  if (!Array.isArray(wallets)) {
    return res.status(400).json({ success: false, error: 'wallets must be an array' });
  }

  try {
    const saved = await saveWalletWhitelist({ wallets });
    res.json({ success: true, wallets: saved.wallets, count: saved.wallets.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 启动服务器


// ?????????????
app.post('/api/admin/whitelist/replace', async (req, res) => {
  const { adminKey, emails } = req.body;

  if (!isAdminAuthorized(adminKey)) {
    return res.status(403).json({ success: false, error: '???' });
  }

  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ success: false, error: '???????' });
  }

  try {
    const whitelist = {
      emails: emails
        .map(e => String(e || '').toLowerCase().trim())
        .filter(Boolean)
    };
    await saveWhitelist(whitelist);
    res.json({ success: true, message: '????????', count: whitelist.emails.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/linkage-whitelist', async (req, res) => {
  const { adminKey, adminPassword } = req.query;
  if (!isAdminAuthorized(adminKey || adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const whitelist = await loadLinkageWhitelist();
    res.json({ success: true, emails: whitelist.emails || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/linkage-whitelist', async (req, res) => {
  const { adminKey, adminPassword, emails } = req.body;
  if (!isAdminAuthorized(adminKey || adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  if (!Array.isArray(emails)) {
    return res.status(400).json({ success: false, error: 'emails must be an array' });
  }
  try {
    const current = await loadLinkageWhitelist();
    const merged = [...new Set([
      ...(current.emails || []),
      ...emails.map(email => String(email || '').toLowerCase().trim()).filter(Boolean)
    ])];
    const saved = await saveLinkageWhitelist({ emails: merged });
    res.json({ success: true, emails: saved.emails, count: saved.emails.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/linkage-whitelist/replace', async (req, res) => {
  const { adminKey, adminPassword, emails } = req.body;
  if (!isAdminAuthorized(adminKey || adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  if (!Array.isArray(emails)) {
    return res.status(400).json({ success: false, error: 'emails must be an array' });
  }
  try {
    const saved = await saveLinkageWhitelist({ emails });
    res.json({ success: true, emails: saved.emails, count: saved.emails.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ????????????
app.get('/api/admin/fund-config', async (req, res) => {
  const { adminPassword } = req.query;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const config = await loadFundConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ????????????
app.post('/api/admin/fund-config', async (req, res) => {
  const { adminPassword, totalShares } = req.body;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  const numericTotalShares = Number(totalShares);
  if (!Number.isFinite(numericTotalShares) || numericTotalShares <= 0) {
    return res.status(400).json({ success: false, error: 'invalid totalShares' });
  }

  try {
    const currentConfig = await loadFundConfig();
    const saved = await saveFundConfig({
      totalShares: numericTotalShares,
      initialNav: currentConfig.initialNav,
      stageCap: currentConfig.stageCap,
      totalBurned: currentConfig.totalBurned
    });
    res.json({ success: true, message: 'fund config updated', config: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ???????? Alpha ??
app.get('/api/admin/alpha-holdings', async (req, res) => {
  const { adminPassword } = req.query;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: '???' });
  }

  try {
    const holdings = await getAlphaHoldings();
    res.json({ success: true, holdings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ????????????
app.get('/api/admin/fund-config', async (req, res) => {
  const { adminPassword } = req.query;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const config = await loadFundConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ????????????
app.post('/api/admin/fund-config', async (req, res) => {
  const { adminPassword, totalShares } = req.body;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  const numericTotalShares = Number(totalShares);
  if (!Number.isFinite(numericTotalShares) || numericTotalShares <= 0) {
    return res.status(400).json({ success: false, error: 'invalid totalShares' });
  }

  try {
    const currentConfig = await loadFundConfig();
    const saved = await saveFundConfig({
      totalShares: numericTotalShares,
      initialNav: currentConfig.initialNav,
      stageCap: currentConfig.stageCap,
      totalBurned: currentConfig.totalBurned
    });
    res.json({ success: true, message: 'fund config updated', config: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/contact-config', async (req, res) => {
  const { adminPassword } = req.query;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const config = await loadContactConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/contact-config', async (req, res) => {
  const { adminPassword, config } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ success: false, error: 'config is required' });
  }
  try {
    const saved = await saveContactConfig(config);
    res.json({ success: true, config: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ???????? Alpha ??
app.post('/api/admin/alpha-holdings', async (req, res) => {
  const { adminPassword, holdings } = req.body;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: '???' });
  }

  if (!Array.isArray(holdings)) {
    return res.status(400).json({ success: false, error: '???????' });
  }

  const normalized = holdings
    .map(item => ({
      symbol: String(item.symbol || '').trim(),
      contractAddress: String(item.contractAddress || '').trim(),
      chainId: String(item.chainId || '56').trim(),
      amount: Number(item.amount),
      source: 'alpha'
    }))
    .filter(item => item.symbol && item.contractAddress && Number.isFinite(item.amount) && item.amount > 0);

  try {
    await fs.writeFile(ALPHA_HOLDINGS_PATH, JSON.stringify({
      holdings: normalized,
      lastUpdated: new Date().toISOString()
    }, null, 2));
    res.json({ success: true, message: 'Alpha updated', count: normalized.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/fund-asset-costs', async (req, res) => {
  const { adminPassword } = req.query;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  try {
    const baselineState = await loadWalletTokenBaselines();
    res.json({ success: true, tokens: baselineState.tokens || {} });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/fund-asset-costs', async (req, res) => {
  const { adminPassword, items } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'items must be an array' });
  }
  try {
    const baselineState = await loadWalletTokenBaselines();
    const tokens = baselineState?.tokens && typeof baselineState.tokens === 'object'
      ? { ...baselineState.tokens }
      : {};
    for (const raw of items) {
      const key = String(raw?.key || '').trim();
      const costBasisPrice = Number(raw?.costBasisPrice || 0);
      if (!key) continue;
      if (!Number.isFinite(costBasisPrice) || costBasisPrice <= 0) {
        delete tokens[key];
        continue;
      }
      tokens[key] = {
        costBasisPrice: parseFloat(costBasisPrice.toFixed(8)),
        updatedAt: new Date().toISOString()
      };
    }
    const saved = await saveWalletTokenBaselines({ tokens });
    res.json({ success: true, count: Object.keys(saved.tokens || {}).length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/position-plans', async (req, res) => {
  const { adminPassword } = req.query;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const plans = await loadPositionPlans();
    res.json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/position-plans', async (req, res) => {
  const { adminPassword, plans } = req.body;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  if (!Array.isArray(plans)) {
    return res.status(400).json({ success: false, error: 'plans must be an array' });
  }

  const normalizedPlans = plans
    .map((item, index) => normalizePositionPlan(item, index))
    .filter(item => item.symbol || item.narrative || item.strategyTag || item.thesis || item.reportUrl);

  try {
    const spotPrices = await getAllPrices();

    for (const plan of normalizedPlans) {
      if (!plan.symbol) {
        return res.status(400).json({ success: false, error: 'symbol is required' });
      }

      if (plan.assetType === 'onchain' && !plan.contractAddress) {
        return res.status(400).json({ success: false, error: `${plan.symbol} missing contractAddress` });
      }

      const livePrice = await getPlanLivePrice(plan, spotPrices);
      if (!livePrice) {
        // Allow saving research plans even when real-time price is temporarily unavailable.
        // Member page will render price/value as "-" for such symbols.
        console.warn(`[position-plans] price unavailable for ${plan.symbol}, saved without live price`);
      }
    }

    const saved = await savePositionPlans(normalizedPlans);
    res.json({ success: true, count: saved.plans.length, plans: saved.plans });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/member/position-plans', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(401).json({ success: false, error: 'email required' });
    }

    if (!isValidEmailFormat(email)) {
      return res.status(401).json({ success: false, error: 'invalid email' });
    }

    const isValid = await validateEmail(email);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'email not allowed' });
    }

    const plans = await loadPositionPlans();
    const visiblePlans = plans.filter(item => item.visibleToWhitelist);
    const spotPrices = await getAllPrices();
    let lienFiMetrics = null;
    if (visiblePlans.some(item => String(item.symbol || '').trim().toUpperCase() === 'LFI')) {
      try {
        lienFiMetrics = await getLienFiMetrics();
      } catch (error) {
        lienFiMetrics = {
          provider: 'LienFi',
          label: 'Portfolio Live',
          url: 'https://lienfi.com/',
          error: error.message,
          fetchedAt: new Date().toISOString()
        };
      }
    }
    const enrichedPlans = [];

    for (const plan of visiblePlans) {
      const livePrice = await getPlanLivePrice(plan, spotPrices);
      const currentPrice = livePrice ? livePrice.currentPrice : null;
      const currentValue = Number.isFinite(currentPrice)
        ? parseFloat((plan.currentPosition * currentPrice).toFixed(4))
        : null;

      enrichedPlans.push({
        ...plan,
        currentPrice,
        currentValue,
        priceSource: livePrice ? livePrice.priceSource : null,
        externalMetrics: String(plan.symbol || '').trim().toUpperCase() === 'LFI' ? lienFiMetrics : null
      });
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      plans: enrichedPlans
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/portfolio-manager', async (req, res) => {
  const { adminPassword } = req.query;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const [rawData, viewData] = await Promise.all([
      loadPortfolioManager(),
      buildPortfolioManagerViewData()
    ]);
    const viewById = new Map((viewData.tokens || []).map(item => [String(item.id || ''), item]));
    const mergedTokens = (rawData.tokens || []).map(item => {
      const id = String(item.id || '');
      const view = viewById.get(id);
      if (!view) {
        return {
          ...item,
          currentPrice: null,
          currentValue: 0,
          pnlPct: null,
          ratioMetrics: null,
          priceLinePosition: null,
          tradeMetrics: null,
          holdingMetrics: null
        };
      }
      return {
        ...item,
        currentPrice: view.currentPrice,
        currentValue: view.currentValue,
        pnlPct: view.pnlPct,
        ratioMetrics: view.ratioMetrics || null,
        priceLinePosition: view.priceLinePosition || null,
        tradeMetrics: view.tradeMetrics || null,
        holdingMetrics: view.holdingMetrics || null
      };
    });

    res.json({
      success: true,
      data: {
        ...rawData,
        tokens: mergedTokens,
        totalPortfolioValue: viewData.totalPortfolioValue,
        fundLinked: viewData.fundLinked,
        autoCostEngine: viewData.autoCostEngine,
        reviewStats: viewData.reviewStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/portfolio-manager/technical-lines', async (req, res) => {
  const { adminPassword, token } = req.body || {};

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const symbol = String(token?.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }

    const klineData = await fetchPortfolio4hKlines(token);
    if (!klineData || !Array.isArray(klineData.rows) || !klineData.rows.length) {
      return res.status(404).json({ success: false, error: `${symbol} 4h klines not found from Binance spot or Alpha` });
    }

    const levels = buildPortfolio4hLevels(klineData.rows);
    const lines = [
      ...levels.resistance.map((level, index) => ({
        type: 'k4h_resistance',
        name: RESISTANCE_LEVEL_NAMES[index] || `压力 ${index + 1}`,
        price: Number(level.price.toPrecision(12)),
        touches: level.touches,
        distancePct: Number(level.distancePct.toFixed(4))
      })),
      ...levels.support.map((level, index) => ({
        type: 'k4h_support',
        name: SUPPORT_LEVEL_NAMES[index] || `支撑 ${index + 1}`,
        price: Number(level.price.toPrecision(12)),
        touches: level.touches,
        distancePct: Number(level.distancePct.toFixed(4))
      }))
    ];

    res.json({
      success: true,
      symbol,
      pair: klineData.pair,
      source: klineData.source,
      interval: '4h',
      currentPrice: Number(levels.currentPrice.toPrecision(12)),
      lines,
      klineCount: klineData.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/portfolio-manager/recommendation-price', async (req, res) => {
  const { adminPassword, token } = req.body || {};

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const result = await fetchRecommendationPriceByTime(token || {});
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/portfolio-manager/technical-lines', async (req, res) => {
  const { token } = req.body || {};

  try {
    const symbol = String(token?.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }

    const klineData = await fetchPortfolio4hKlines(token);
    if (!klineData || !Array.isArray(klineData.rows) || !klineData.rows.length) {
      return res.status(404).json({ success: false, error: `${symbol} 4h klines not found from Binance spot or Alpha` });
    }

    const levels = buildPortfolio4hLevels(klineData.rows);
    const lines = [
      ...levels.resistance.map((level, index) => ({
        type: 'k4h_resistance',
        name: RESISTANCE_LEVEL_NAMES[index] || `压力 ${index + 1}`,
        price: Number(level.price.toPrecision(12)),
        touches: level.touches,
        distancePct: Number(level.distancePct.toFixed(4))
      })),
      ...levels.support.map((level, index) => ({
        type: 'k4h_support',
        name: SUPPORT_LEVEL_NAMES[index] || `支撑 ${index + 1}`,
        price: Number(level.price.toPrecision(12)),
        touches: level.touches,
        distancePct: Number(level.distancePct.toFixed(4))
      }))
    ];

    res.json({
      success: true,
      symbol,
      pair: klineData.pair,
      source: klineData.source,
      interval: '4h',
      currentPrice: Number(levels.currentPrice.toPrecision(12)),
      lines,
      klineCount: klineData.rows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/portfolio-manager', async (req, res) => {
  try {
    const viewData = await buildPortfolioManagerViewData();
    res.json({ success: true, data: viewData, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/portfolio-manager', async (req, res) => {
  const { adminPassword, data } = req.body;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: 'data is required' });
  }

  try {
    const saved = await savePortfolioManager(data);
    res.json({ success: true, data: saved, count: saved.tokens.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/thinktank-posts', async (req, res) => {
  const { adminPassword } = req.query;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const posts = await loadThinktankPosts();
    res.json({ success: true, posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/thinktank-posts-preview', async (req, res) => {
  try {
    const posts = await loadThinktankPosts();
    const visiblePosts = posts
      .filter(item => item.visibleToWhitelist !== false)
      .sort((a, b) => {
        if (Boolean(a.featured) !== Boolean(b.featured)) {
          return a.featured ? -1 : 1;
        }
        return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
      })
      .map(toThinktankPreviewPost);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      posts: visiblePosts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/thinktank-post-preview', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, error: 'id required' });
    }

    const posts = await loadThinktankPosts();
    const visiblePosts = posts
      .filter(item => item.visibleToWhitelist !== false)
      .map(toThinktankPreviewPost);
    const post = visiblePosts.find(item => String(item.id) === id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'post not found' });
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      post
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/qrcode', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, error: 'text required' });
    }
    const size = Math.min(1000, Math.max(160, parseInt(String(req.query.size || '360'), 10) || 360));

    const response = await axios.get('https://api.qrserver.com/v1/create-qr-code/', {
      timeout: 15000,
      responseType: 'arraybuffer',
      params: {
        size: `${size}x${size}`,
        format: 'png',
        data: text
      },
      headers: {
        'User-Agent': BINANCE_ALPHA_HEADERS['User-Agent'],
        'Accept': 'image/png'
      }
    });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(response.data));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/thinktank-posts', async (req, res) => {
  const { adminPassword, posts } = req.body;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  if (!Array.isArray(posts)) {
    return res.status(400).json({ success: false, error: 'posts must be an array' });
  }

  const normalizedPosts = posts
    .map((item, index) => normalizeThinktankPost(item, index))
    .filter(item => item.title || item.summary || item.content);

  if (normalizedPosts.some(item => !item.title)) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  try {
    const saved = await saveThinktankPosts(normalizedPosts);
    res.json({ success: true, posts: saved.posts, count: saved.posts.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/member/thinktank-posts', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(401).json({ success: false, error: 'email required' });
    }

    if (!isValidEmailFormat(email)) {
      return res.status(401).json({ success: false, error: 'invalid email' });
    }

    const isValid = await validateEmail(email);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'email not allowed' });
    }

    const posts = await loadThinktankPosts();
    const visiblePosts = posts
      .filter(item => item.visibleToWhitelist !== false)
      .sort((a, b) => {
        if (Boolean(a.featured) !== Boolean(b.featured)) {
          return a.featured ? -1 : 1;
        }
        return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
      })
      .map(item => ({
        ...item,
        contentPreview: buildThinktankPreviewText(item.content, 300),
        previewLimit: 300,
        locked: false
      }));

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      posts: visiblePosts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/investors', async (req, res) => {
  const { adminPassword } = req.query;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const investors = await loadInvestors();
    const fundData = await calculateFundData();
    const rows = investors.map((investor) => {
      const metrics = calculateInvestorSettlementMetrics(investor, fundData.fund.currentNav);
      return {
        ...investor,
        currentNav: fundData.fund.currentNav,
        ...metrics
      };
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/investors', async (req, res) => {
  const { adminPassword, investors } = req.body;

  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  if (!Array.isArray(investors)) {
    return res.status(400).json({ success: false, error: 'investors must be an array' });
  }

  const existingInvestorsMap = new Map();
  try {
    const existing = await loadInvestors();
    existing.forEach(item => {
      const key = String(item.name || '').trim();
      if (key) existingInvestorsMap.set(key, item);
    });
  } catch (error) {
    // Ignore loading errors and proceed with submitted data only.
  }

  const normalized = investors
    .map((item, index) => normalizeInvestorRecord(item, index))
    .map(item => {
      const oldRecord = existingInvestorsMap.get(item.name);
      if (!oldRecord) return item;
      const oldAliases = Array.isArray(oldRecord.queryCodes) ? oldRecord.queryCodes : [];
      const mergedAliases = [...new Set([
        item.queryCode,
        ...(item.queryCodes || []),
        ...oldAliases.map(code => String(code || '').trim()).filter(code => /^\d{4}$/.test(code))
      ])];
      return {
        ...item,
        queryCodes: mergedAliases
      };
    })
    .filter(item => item.name || item.amount > 0 || item.shares > 0);

  if (normalized.some(item => !item.name)) {
    return res.status(400).json({ success: false, error: 'investor name is required' });
  }

  try {
    const saved = await saveInvestors(normalized);
    res.json({ success: true, count: saved.investors.length, investors: saved.investors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/api/investor/query', async (req, res) => {
  const { queryCode } = req.body;
  const normalizedCode = normalizeQueryCodeInput(queryCode);

  if (!/^\d{4}$/.test(normalizedCode)) {
    return res.status(400).json({ success: false, error: 'invalid code' });
  }

  try {
    const investors = await loadInvestors();
    const matchedInvestors = investors.filter(item => {
      const primaryCode = String(item.queryCode || '');
      const aliases = Array.isArray(item.queryCodes) ? item.queryCodes.map(code => String(code || '')) : [];
      return primaryCode === normalizedCode || aliases.includes(normalizedCode);
    });

    if (!matchedInvestors.length) {
      return res.status(404).json({ success: false, error: 'code not found' });
    }

    const fundData = await calculateFundData();
    const investorRows = matchedInvestors.map((investor) => {
      const metrics = calculateInvestorSettlementMetrics(investor, fundData.fund.currentNav);
      const profitRate = investor.amount > 0 ? (metrics.profit / investor.amount) * 100 : 0;
      return {
        joinedAt: investor.joinedAt,
        lockPeriod: investor.lockPeriod,
        amount: investor.amount,
        buyNav: investor.buyNav,
        shares: investor.shares,
        currentNav: fundData.fund.currentNav,
        currentDays: metrics.currentDays,
        profitShareRatio: metrics.profitShareRatio,
        currentAsset: metrics.currentAsset,
        profitRate: parseFloat(profitRate.toFixed(2)),
        profitValue: metrics.profit,
        investorShare: metrics.investorShare,
        managerShare: metrics.managerShare,
        timestamp: new Date().toISOString()
      };
    });

    const summary = investorRows.reduce((acc, row) => {
      acc.totalAmount += Number(row.amount || 0);
      acc.totalShares += Number(row.shares || 0);
      acc.totalCurrentAsset += Number(row.currentAsset || 0);
      acc.totalProfitValue += Number(row.profitValue || 0);
      return acc;
    }, {
      recordCount: investorRows.length,
      totalAmount: 0,
      totalShares: 0,
      totalCurrentAsset: 0,
      totalProfitValue: 0
    });
    summary.totalAmount = parseFloat(summary.totalAmount.toFixed(4));
    summary.totalShares = parseFloat(summary.totalShares.toFixed(6));
    summary.totalCurrentAsset = parseFloat(summary.totalCurrentAsset.toFixed(4));
    summary.totalProfitValue = parseFloat(summary.totalProfitValue.toFixed(4));
    summary.profitRate = summary.totalAmount > 0
      ? parseFloat(((summary.totalProfitValue / summary.totalAmount) * 100).toFixed(2))
      : 0;
    summary.currentNav = fundData.fund.currentNav;
    summary.timestamp = new Date().toISOString();

    res.json({
      success: true,
      summary,
      investors: investorRows,
      // Backward compatibility for older frontend.
      investor: investorRows[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/linkage/resolve-token', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }
    const result = await resolveLinkageTokenSource(symbol);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/linkage', async (req, res) => {
  try {
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email || !isValidEmailFormat(email)) {
      return res.status(401).json({ success: false, error: 'linkage whitelist email required' });
    }
    const isLinkageAllowed = await validateLinkageEmail(email);
    if (!isLinkageAllowed) {
      return res.status(401).json({ success: false, error: 'email not in linkage whitelist' });
    }
    const includeAlpha = isAdminAuthorized(req.query.adminPassword || req.query.adminKey)
      || await validateFullWhitelistEmail(email);
    const rawLinkage = await loadLinkageData();
    const linkage = includeAlpha ? rawLinkage : filterLinkageForPublic(rawLinkage);
    let snapshot = { generatedAt: new Date().toISOString(), conceptBoard: [], marketTop30: [] };
    try {
      const ticker24hMap = await getAllTicker24h();
      const linkagePairs = Array.from(new Set(
        (linkage.concepts || [])
          .flatMap(concept => Array.isArray(concept.tokenItems)
            ? concept.tokenItems.filter(item => String(item.assetType || '').toLowerCase() !== 'onchain').map(item => item.symbol)
            : (Array.isArray(concept.tokens) ? concept.tokens : []))
          .map(token => `${String(token || '').trim().toUpperCase()}USDT`)
          .filter(pair => pair.length > 4)
      ));
      const [ticker5mMap, ticker1hMap, ticker7dMap, ticker3dMap] = await Promise.all([
        getTickerWindowForSymbols(linkagePairs, '5m'),
        getTickerWindowForSymbols(linkagePairs, '1h'),
        getTickerWindowForSymbols(linkagePairs, '7d'),
        getBinanceThreeDayChangeForSymbols(linkagePairs, ticker24hMap)
      ]);
      snapshot = await buildLinkageSnapshot(linkage, ticker24hMap, ticker1hMap, ticker3dMap, ticker5mMap, ticker7dMap);
    } catch (error) {
      snapshot.error = `snapshot unavailable: ${error.message}`;
    }

    res.json({
      success: true,
      data: linkage,
      snapshot,
      canViewAlpha: includeAlpha
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/hunter/signals', async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
    const source = String(req.query.source || 'all').toLowerCase();
    const forceRefresh = String(req.query.refresh || '') === '1';
    const cache = forceRefresh ? await runHunterSignalsScan() : await loadHunterCache();
    if (!cache?.generatedAt || !Array.isArray(cache?.signals)) {
      const fresh = await runHunterSignalsScan();
      const signals = (fresh.signals || []).filter(item => source === 'all' ? true : String(item.sourceType || '').toLowerCase() === source);
      return res.json({
        success: true,
        meta: fresh.meta,
        signals: signals.slice(0, limit)
      });
    }
    const filteredSignals = (cache.signals || []).filter(item => source === 'all' ? true : String(item.sourceType || '').toLowerCase() === source);
    return res.json({
      success: true,
      meta: cache.meta || {},
      signals: filteredSignals.slice(0, limit)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'failed to load hunter signals' });
  }
});

app.get('/api/hunter/health', async (req, res) => {
  try {
    const [health, cache, config] = await Promise.all([
      loadHunterHealth(),
      loadHunterCache(),
      loadHunterConfig()
    ]);
    const meta = cache?.meta || {};
    const evaluated = evaluateHunterDataHealth({
      ...meta,
      updatedAt: health.updatedAt || meta.updatedAt || cache.generatedAt
    }, config);
    return res.json({
      success: true,
      status: evaluated.status,
      updatedAt: health.updatedAt || meta.updatedAt || cache.generatedAt || null,
      sampleCount1h: Number(meta.rawCount || health.sampleCount1h || 0),
      upstream: health.upstream || {
        smartMoneyApi: 'unknown',
        oiApi: 'not_enabled',
        turnoverApi: 'not_enabled'
      },
      warnings: [...new Set([...(health.warnings || []), ...(evaluated.warnings || [])])]
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'failed to load hunter health' });
  }
});

app.get('/api/hunter/push-feed', async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 100);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 100;
    const source = String(req.query.source || 'all').toLowerCase();
    const refresh = String(req.query.refresh || '') === '1';
    if (refresh) {
      await runHunterSignalsScan();
    }
    const items = (await loadHunterPushFeed()).filter(item => source === 'all' ? true : String(item.sourceType || '').toLowerCase() === source);
    return res.json({
      success: true,
      count: items.length,
      items: items.slice(0, limit)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'failed to load push feed' });
  }
});

app.post('/api/admin/hunter/config', async (req, res) => {
  try {
    const { adminPassword, config = {} } = req.body || {};
    if (!isAdminAuthorized(adminPassword)) {
      return res.status(401).json({ success: false, error: '未授权' });
    }
    const current = await loadHunterConfig();
    const next = await saveHunterConfig({
      ...current,
      ...config
    });
    return res.json({ success: true, config: next });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'failed to save hunter config' });
  }
});

app.get('/api/admin/hunter/config', async (req, res) => {
  try {
    const { adminPassword } = req.query || {};
    if (!isAdminAuthorized(adminPassword)) {
      return res.status(401).json({ success: false, error: '未授权' });
    }
    const config = await loadHunterConfig();
    return res.json({ success: true, config });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'failed to load hunter config' });
  }
});

app.get('/api/admin/linkage', async (req, res) => {
  const { adminPassword } = req.query;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const linkage = await loadLinkageData();
    res.json({ success: true, data: linkage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/linkage', async (req, res) => {
  const { adminPassword, data } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: 'data is required' });
  }

  try {
    const saved = await saveLinkageData(data);
    res.json({
      success: true,
      counts: {
        concepts: saved.concepts.length,
        relations: saved.relations.length,
        events: saved.events.length
      },
      data: saved
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/listing-signals', async (req, res) => {
  try {
    const payload = await loadListingSignals();
    const statuses = LISTING_SIGNAL_SOURCES.map(source => ({
      key: source.key,
      exchange: source.exchange,
      marketType: source.marketType,
      ...(payload.statuses?.[source.key] || {
        ok: null,
        initialized: false,
        count: 0,
        newCount: 0,
        lastCheckedAt: '',
        error: ''
      })
    }));
    res.json({
      success: true,
      updatedAt: payload.updatedAt,
      statuses,
      signals: trimListingSignals(payload.signals || [])
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/listing-signals/contract-candidates', async (req, res) => {
  try {
    const signal = {
      symbol: String(req.query.symbol || '').trim().toUpperCase(),
      baseAsset: String(req.query.baseAsset || '').trim().toUpperCase(),
      name: String(req.query.name || '').trim()
    };
    const candidates = await resolveListingContractCandidates(signal);
    res.json({
      success: true,
      term: getListingSignalSearchTerm(signal),
      candidates
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/listing-signals/check', async (req, res) => {
  const adminPassword = req.body?.adminPassword || req.query?.adminPassword;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const payload = await runListingSignalsCheck();
    const statuses = LISTING_SIGNAL_SOURCES.map(source => ({
      key: source.key,
      exchange: source.exchange,
      marketType: source.marketType,
      ...(payload.statuses?.[source.key] || {})
    }));
    const newCount = statuses.reduce((sum, item) => sum + Number(item.newCount || 0), 0);
    res.json({
      success: true,
      updatedAt: payload.updatedAt,
      newCount,
      statuses,
      signals: trimListingSignals(payload.signals || [])
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/listing-signals/check', async (req, res) => {
  const { adminPassword } = req.query;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const payload = await runListingSignalsCheck();
    const statuses = LISTING_SIGNAL_SOURCES.map(source => ({
      key: source.key,
      exchange: source.exchange,
      marketType: source.marketType,
      ...(payload.statuses?.[source.key] || {})
    }));
    const newCount = statuses.reduce((sum, item) => sum + Number(item.newCount || 0), 0);
    res.json({
      success: true,
      updatedAt: payload.updatedAt,
      newCount,
      statuses,
      signals: trimListingSignals(payload.signals || [])
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/listing-signals/reset-baseline', async (req, res) => {
  const adminPassword = req.body?.adminPassword || req.query?.adminPassword;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const payload = await saveListingSignals(emptyListingSignals());
    res.json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/downloads', async (req, res) => {
  try {
    const payload = await loadDownloads();
    const items = (payload.items || [])
      .filter(item => item.name && item.fileName)
      .map(item => ({
        ...item,
        downloadUrl: `/downloads/${encodeURIComponent(item.fileName)}`
      }))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/downloads', async (req, res) => {
  const { adminPassword } = req.query;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    const payload = await loadDownloads();
    const items = (payload.items || [])
      .map(item => ({
        ...item,
        downloadUrl: `/downloads/${encodeURIComponent(item.fileName)}`
      }))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/downloads/upload', async (req, res) => {
  const { adminPassword, name, version, description, fileName, base64Data } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    return res.status(400).json({ success: false, error: 'name is required' });
  }

  const rawBase64 = String(base64Data || '').trim();
  if (!rawBase64) {
    return res.status(400).json({ success: false, error: 'base64Data is required' });
  }

  const cleanBase64 = rawBase64.includes(',')
    ? rawBase64.split(',').pop()
    : rawBase64;

  let fileBuffer;
  try {
    fileBuffer = Buffer.from(cleanBase64, 'base64');
  } catch (error) {
    return res.status(400).json({ success: false, error: 'invalid base64 data' });
  }

  if (!fileBuffer || !fileBuffer.length) {
    return res.status(400).json({ success: false, error: 'empty file content' });
  }

  const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
  if (fileBuffer.length > MAX_UPLOAD_SIZE) {
    return res.status(400).json({ success: false, error: 'file too large (max 100MB)' });
  }

  try {
    await ensureDownloadsDir();
    const safeFileName = sanitizeFileName(fileName);
    const targetPath = path.join(DOWNLOADS_DIR, safeFileName);
    await fs.writeFile(targetPath, fileBuffer);

    const payload = await loadDownloads();
    const now = new Date().toISOString();
    const nextItem = {
      id: crypto.randomUUID(),
      name: normalizedName,
      version: String(version || '').trim(),
      description: String(description || '').trim(),
      fileName: safeFileName,
      fileSize: fileBuffer.length,
      createdAt: now,
      updatedAt: now
    };
    const nextItems = [nextItem, ...(payload.items || [])];
    await saveDownloads(nextItems);

    res.json({
      success: true,
      item: {
        ...nextItem,
        downloadUrl: `/downloads/${encodeURIComponent(nextItem.fileName)}`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/downloads/delete', async (req, res) => {
  const { adminPassword, id } = req.body;
  if (!isAdminAuthorized(adminPassword)) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  const targetId = String(id || '').trim();
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'id is required' });
  }

  try {
    const payload = await loadDownloads();
    const items = payload.items || [];
    const target = items.find(item => item.id === targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: 'item not found' });
    }

    const nextItems = items.filter(item => item.id !== targetId);
    await saveDownloads(nextItems);

    const filePath = path.join(DOWNLOADS_DIR, target.fileName || '');
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    res.json({ success: true, count: nextItems.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 币安基金资产查看器已启动`);
  console.log(`📊 访问地址: http://163.7.9.6:${PORT}`);
  console.log(`📧 白名单邮箱验证已启用`);
  console.log(`⏰ 启动时间: ${new Date().toLocaleString('zh-CN')}`);
});
