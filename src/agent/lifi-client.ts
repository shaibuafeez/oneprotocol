import {
  createConfig,
  getRoutes,
  getChains,
  getTokens,
  executeRoute,
  Sui,
} from "@lifi/sdk";
import type { RouteExtended } from "@lifi/sdk";
import type { Route, Token } from "@lifi/types";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
import { LIFI_INTEGRATOR } from "@/lib/constants";

let configured = false;

/**
 * Initialize LI.FI SDK with Sui provider
 */
export function initLifi(
  getWallet?: () => Promise<WalletWithRequiredFeatures>
) {
  createConfig({
    integrator: LIFI_INTEGRATOR,
    providers: [Sui({ getWallet })],
  });
  configured = true;
}

// Fallback: init without provider for quote-only usage
if (!configured) {
  createConfig({ integrator: LIFI_INTEGRATOR });
}

// Sui chain ID in LI.FI (first 16 non-letter hex digits of SUI genesis blob)
const SUI_CHAIN_ID = 9270000000000000;

// Common token addresses on Sui
const SUI_TOKENS = {
  SUI: "0x2::sui::SUI",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
};

/**
 * Get available cross-chain routes
 */
export async function getSwapRoutes(params: {
  fromChainId: number | string;
  toChainId: number | string;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  toAddress: string;
}) {
  const routes = await getRoutes({
    fromChainId: params.fromChainId as number,
    toChainId: params.toChainId as number,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress!,
    options: {
      slippage: 0.03,
    },
  });
  return routes.routes;
}

/**
 * Execute a bridge route (signs transactions via the Sui wallet)
 */
export async function executeBridgeRoute(
  route: Route,
  onUpdate?: (updatedRoute: RouteExtended) => void
): Promise<RouteExtended> {
  return executeRoute(route, {
    updateRouteHook: onUpdate,
  });
}

/**
 * Get supported chains from LI.FI
 */
export async function getSupportedChains() {
  try {
    const chains = await getChains();
    return chains;
  } catch (e) {
    console.error("Failed to get chains:", e);
    return [];
  }
}

/**
 * Get tokens available on a chain
 */
export async function getChainTokens(chainId: number): Promise<Token[]> {
  try {
    const result = await getTokens({ chains: [chainId] });
    return result.tokens[chainId] || [];
  } catch (e) {
    console.error("Failed to get tokens:", e);
    return [];
  }
}

/**
 * Build a Sui → Arc USDC bridge route (used by agent executor)
 */
export async function buildSuiToArcRoute(
  amount: string,
  fromAddress: string,
  toAddress: string
) {
  return getSwapRoutes({
    fromChainId: SUI_CHAIN_ID,
    toChainId: 5042001, // Arc chain ID
    fromTokenAddress: SUI_TOKENS.SUI,
    toTokenAddress: "0x0000000000000000000000000000000000000000",
    fromAmount: amount,
    fromAddress,
    toAddress,
  });
}

export { SUI_CHAIN_ID, SUI_TOKENS };
