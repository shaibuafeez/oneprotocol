// ======== Sui Network ========
export const SUI_NETWORK = "mainnet";
export const SUI_RPC_URL = "https://fullnode.mainnet.sui.io:443";

// Contract IDs (updated after deployment)
export const PACKAGE_ID = "";
export const VAULT_STATE_ID = "";
export const ADMIN_CAP_ID = "";

// ======== Arc Network (Circle L1) — Testnet (mainnet not live yet) ========
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_CHAIN_ID = 5042002;
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_FAUCET = "https://faucet.circle.com";

// USDC on Arc (native gas token — system contract)
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

// ======== LI.FI ========
export const LIFI_INTEGRATOR = "dara-yield-agent";

// Supported chains for cross-chain
export const SUPPORTED_CHAINS = {
  SUI: "sui",
  ARC: ARC_CHAIN_ID,
  ARBITRUM: 42161,
  OPTIMISM: 10,
} as const;

// ======== Agent Config ========
export const AGENT_CONFIG = {
  // Strategy loop interval (ms)
  LOOP_INTERVAL: 60_000,
  // Target allocation percentages
  TARGET_SUI_PCT: 50,
  TARGET_EVM_PCT: 50,
  // Rebalance when drift exceeds this %
  REBALANCE_THRESHOLD: 5,
  // Minimum amount to trigger rebalance (in SUI, MIST units)
  MIN_REBALANCE_AMOUNT: 100_000_000, // 0.1 SUI
  // Price drop threshold to trigger safety move (%)
  SAFETY_THRESHOLD: 10,
  // Minimum APY difference to trigger yield rebalance
  YIELD_REBALANCE_THRESHOLD: 2.0,
  // Maximum allocation to any single protocol
  MAX_PROTOCOL_ALLOCATION_PCT: 50,
} as const;

// ======== Scallop Protocol (Mainnet) ========
export const SCALLOP = {
  PACKAGE: "0x83bbe0b3985c5e3857803e2678899b03f3c4a31be75006ab03faf268c014ce41",
  VERSION: "0x07871c4b3c847a0f674510d4978d5cf6f960452795e8ff6f189fd2088a3f6ac7",
  MARKET: "0xa757975255146dc9686aa823b7838b507f315d704f428cbadad2f4ea061939d9",
  CORE: "0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf",
  COIN_DECIMALS_REGISTRY: "0x200abe9bf19751cc566ae35aa58e2b7e4ff688fc1130f8d8909ea09bc137d668",
  SUI_POOL: "0x9c9077abf7a29eebce41e33addbcd6f5246a5221dd733e56ea0f00ae1b25c9e8",
  SUI_COLLATERAL: "0x75aacfb7dcbf92ee0111fc1bf975b12569e4ba632e81ed7ae5ac090d40cd3acb",
  USDC_POOL: "0xd3be98bf540f7603eeb550c0c0a19dbfc78822f25158b5fa84ebd9609def415f",
  USDC_COLLATERAL: "0x8f0d529ba179c5b3d508213003eab813aaae31f78226099639b9a69d1aec17af",
} as const;

// ======== NAVI Protocol (Mainnet) ========
export const NAVI = {
  PACKAGE: "0xee0041239b89564ce870a7dec5ddc5d114367ab94a1137e90aa0633cb76518e0",
  STORAGE: "0xbb4e2f4b6205c2e2a2db47aeb4f830796ec7c005f88537ee775986639bc442fe",
  INCENTIVE_V3: "0x62982dad27fb10bb314b3384d5de8d2ac2d72ab2dbeae5d801dbdb9efa816c80",
  ORACLE: "0x1568865ed9a0b5ec414220e8f79b3d04c77acc82358f6e5ae4635687392ffbef",
  RESERVE_PARENT_ID: "0xe6d4c6610b86ce7735ea754596d71d72d10c7980b5052fc3c8cdf8d09fea9b4b",
  SUI_POOL: "0x96df0fce3c471489f4debaaa762cf960b3d97820bd1f3f025ff8190730e958c5",
  USDC_POOL: "0xa3582097b4c57630046c0c49a88bfc6b202a3ec0a9db5597c31765f7563755a8",
  // Asset IDs for NAVI
  SUI_ASSET_ID: 0,
  USDC_ASSET_ID: 10,
  CONFIG_API: "https://open-api.naviprotocol.io/api/navi/config?env=prod",
} as const;

// ======== DeepBook V3 (Mainnet) ========
export const DEEPBOOK = {
  PACKAGE: "0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497",
  REGISTRY: "0xaf16199a2dff736e9f07a845f23c5da6df6f756eddb631aed9d24a93efc4549d",
  DEEP_TREASURY: "0x032abf8948dda67a271bcc18e776dbbcfb0d58c8d288a700ff0d5521e57a1ffe",
  SUI_USDC_POOL: "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
} as const;

// Coin type addresses (Mainnet)
export const COIN_TYPES = {
  SUI: "0x2::sui::SUI",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  DEEP: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  WUSDC: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
} as const;

// Coin decimals
export const COIN_DECIMALS = {
  SUI: 9,
  USDC: 6,
  DEEP: 6,
} as const;

// ======== Stork Oracle ========
export const STORK_FEEDS = {
  SUI_USD: "SUI",
  BTC_USD: "BTC",
  ETH_USD: "ETH",
} as const;

// ======== DeFi Llama ========
export const DEFI_LLAMA_YIELDS_URL = "https://yields.llama.fi/pools";

// Protocol identifiers on DeFi Llama
export const YIELD_PROTOCOLS = {
  SCALLOP: { project: "scallop-lend", chain: "Sui", displayName: "Scallop" },
  NAVI: { project: "navi-lending", chain: "Sui", displayName: "NAVI" },
  AAVE_V3: { project: "aave-v3", chain: "Arbitrum", displayName: "Aave V3" },
  COMPOUND: { project: "compound-v3", chain: "Optimism", displayName: "Compound V3" },
} as const;

// Target assets to scan for yield
export const YIELD_ASSETS = ["SUI", "USDC", "USDT", "WETH"] as const;

// Bridge fee estimates (as percentage)
export const BRIDGE_FEES = {
  SUI_TO_ARBITRUM: 0.3,
  SUI_TO_OPTIMISM: 0.3,
  SUI_TO_ARC: 0.1,
  ARBITRUM_TO_SUI: 0.3,
  OPTIMISM_TO_SUI: 0.3,
  ARC_TO_SUI: 0.1,
} as const;

// ======== Risk Profiles ========
export const RISK_PROFILES = {
  conservative: {
    rebalanceThresholdApy: 3.0,
    maxAllocationPct: 30,
    safetyThresholdPriceDrop: 5,
    allowCrossChain: false,
  },
  moderate: {
    rebalanceThresholdApy: 2.0,
    maxAllocationPct: 50,
    safetyThresholdPriceDrop: 10,
    allowCrossChain: true,
  },
  aggressive: {
    rebalanceThresholdApy: 1.0,
    maxAllocationPct: 70,
    safetyThresholdPriceDrop: 15,
    allowCrossChain: true,
  },
} as const;

// ======== Bluefin Perpetual DEX ========
export const BLUEFIN = {
  MAINNET_API: "https://dapi.api.sui-prod.bluefin.io",
  TESTNET_API: "https://dapi.api.sui-staging.bluefin.io",
  MAINNET_PACKAGE: "0x6e907d39523030260c8cd89b8a498e07f6b3cc39e5e6e7c7a18a88a009075def",
  TESTNET_PACKAGE: "0xb9b92f069eb185d9fe1fcc988e7d89b3b48e5f58d879a0dbc4187bff8f8e6946",
  MARKETS: ["SUI-PERP", "ETH-PERP", "BTC-PERP"],
  // Funding payments every 8 hours (3x per day)
  FUNDING_INTERVAL_HOURS: 8,
  FUNDING_PAYMENTS_PER_DAY: 3,
} as const;

// ======== Arc Vault (Agentic Commerce) ========
export const ARC_VAULT_ADDRESS = (process.env.NEXT_PUBLIC_ARC_VAULT_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// Treasury safety thresholds
export const TREASURY_CONFIG = {
  // Price drop % to trigger safety move to Arc vault
  SAFETY_THRESHOLD_PCT: 8,
  // Price recovery % from low to trigger redeployment
  RECOVERY_THRESHOLD_PCT: 5,
  // Minimum yield % to prefer Sui over Arc safety
  MIN_YIELD_FOR_DEPLOYMENT: 2.0,
  // Max price history entries to track
  MAX_PRICE_HISTORY: 20,
  // Proportion of funds to move on safety trigger (0-1)
  SAFETY_MOVE_RATIO: 0.5,
  // Default risk score thresholds
  HIGH_RISK_THRESHOLD: 65,
  MEDIUM_RISK_THRESHOLD: 35,
} as const;

// ======== Gemini Voice ========
export const GEMINI_MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";
export const GEMINI_VOICE = "Kore";
