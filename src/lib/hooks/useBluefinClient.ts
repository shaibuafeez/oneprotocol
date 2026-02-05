"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useCurrentAccount,
  useSignPersonalMessage,
  useSignTransaction,
} from "@mysten/dapp-kit";
import { SUI_NETWORK } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────

export interface BluefinPosition {
  symbol: string;
  side: string;
  quantity: string;
  avgEntryPrice: string;
  leverage: string;
  liquidationPrice: string;
  unrealizedProfit: string;
  unrealizedProfitPercent: string;
  margin: string;
  positionValue: string;
  updatedAt: number;
}

export interface BluefinOrder {
  id: number;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  quantity: string;
  filledQty: string;
  orderStatus: string;
  leverage: string;
  createdAt: number;
  hash: string;
}

export interface BluefinAccountData {
  walletBalance: string;
  freeCollateral: string;
  accountValue: string;
  totalUnrealizedProfit: string;
  totalPositionMargin: string;
}

export interface PlaceOrderParams {
  symbol: string;
  side: "long" | "short";
  orderType: "market" | "limit";
  quantity: number;
  price?: number;
  leverage?: number;
}

// Lazy-loaded SDK references (avoids pulling Node.js modules at parse time)
let _BluefinClient: any = null;
let _Networks: any = null;
let _ORDER_SIDE: any = null;
let _ORDER_TYPE: any = null;

async function loadSDK() {
  if (_BluefinClient) return;
  const mod = await import("@bluefin-exchange/bluefin-v2-client");
  _BluefinClient = mod.BluefinClient;
  _Networks = mod.Networks;
  _ORDER_SIDE = mod.ORDER_SIDE;
  _ORDER_TYPE = mod.ORDER_TYPE;
}

// ── Hook ───────────────────────────────────────────────

export function useBluefinClient() {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const clientRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<BluefinPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<BluefinOrder[]>([]);
  const [accountData, setAccountData] = useState<BluefinAccountData | null>(
    null
  );

  // Build wallet adapter that bridges dapp-kit → suiet WalletContextState shape
  const buildAdapter = useCallback(() => {
    if (!account) return null;

    return {
      getAddress: () => account.address,
      address: account.address,
      connected: true,
      connecting: false,
      account: {
        address: account.address,
        publicKey: account.publicKey
          ? Array.from(account.publicKey)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("")
          : "",
      },
      status: "connected" as const,

      // signPersonalMessage — used by OrderSigner.signPayloadUsingWallet
      signPersonalMessage: async (input: { message: Uint8Array }) => {
        const result = await signPersonalMessage({ message: input.message });
        return { bytes: result.bytes, signature: result.signature };
      },

      // signMessage (deprecated but some code paths still use it)
      signMessage: async (input: { message: Uint8Array }) => {
        const result = await signPersonalMessage({ message: input.message });
        return { bytes: result.bytes, signature: result.signature };
      },

      // signData — used by some internal paths
      signData: async (data: Uint8Array) => {
        const result = await signPersonalMessage({ message: data });
        return result.signature;
      },

      // signTransactionBlock — used by signTransactionUsingWallet
      signTransactionBlock: async (input: { transactionBlock: unknown }) => {
        const result = await signTransaction({
          transaction: input.transactionBlock as Parameters<
            typeof signTransaction
          >[0]["transaction"],
        });
        return {
          transactionBlockBytes: result.bytes,
          signature: result.signature,
        };
      },

      // Stubs for interface compatibility
      disconnect: async () => {},
      select: async () => {},
      getAccounts: () => [],
      switchAccount: async () => ({}) as any,
      signAndExecuteTransaction: async () => ({}) as any,
      signTransaction: async (input: { transaction: unknown }) => {
        const result = await signTransaction({
          transaction: input.transaction as Parameters<
            typeof signTransaction
          >[0]["transaction"],
        });
        return { bytes: result.bytes, signature: result.signature };
      },
      verifySignedPersonalMessage: async () => false,
      verifySignedTransaction: async () => false,
      on: () => () => {},
      reportTransactionEffects: async () => {},
      signAndExecuteTransactionBlock: async () => ({}) as any,
      verifySignedMessage: async () => false,
      configuredWallets: [],
      detectedWallets: [],
      allAvailableWallets: [],
      chains: [],
      chain: undefined,
      name: undefined,
      adapter: undefined,
      useLegacyDisconnectDropdown: false,
      enableSuiNS: false,
    };
  }, [account, signPersonalMessage, signTransaction]);

  // Initialize client when wallet connects
  const initialize = useCallback(async () => {
    if (!account?.address) {
      clientRef.current = null;
      setIsReady(false);
      setError(null);
      setPositions([]);
      setOpenOrders([]);
      setAccountData(null);
      return;
    }

    const adapter = buildAdapter();
    if (!adapter) return;

    try {
      setIsOnboarding(true);
      setError(null);

      // Dynamically load SDK (avoids Node.js module crashes in browser)
      await loadSDK();

      const network =
        (SUI_NETWORK as string) === "mainnet"
          ? _Networks.PRODUCTION_SUI
          : _Networks.TESTNET_SUI;

      const client = new _BluefinClient(true, network);
      await client.initializeWithHook(adapter as any, account.address);
      await client.init();

      clientRef.current = client;
      setIsReady(true);
      console.log("[Bluefin SDK] Client initialized for", account.address);
    } catch (err: any) {
      console.error("[Bluefin SDK] Init failed:", err);
      setError(err?.message || "Failed to initialize Bluefin client");
      setIsReady(false);
      clientRef.current = null;
    } finally {
      setIsOnboarding(false);
    }
  }, [account?.address, buildAdapter]);

  // Fetch positions, orders, account data
  const refreshData = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !isReady) return;

    try {
      const [posResult, ordResult, accResult] = await Promise.allSettled([
        client.getUserPosition({}),
        client.getUserOrders({
          statuses: ["OPEN", "PENDING", "PARTIAL_FILLED"] as any,
        }),
        client.getUserAccountData(),
      ]);

      if (posResult.status === "fulfilled") {
        const data =
          (posResult.value as any)?.data || posResult.value || [];
        setPositions(
          (Array.isArray(data) ? data : []).map((p: any) => ({
            symbol: p.symbol,
            side: p.side,
            quantity: p.quantity,
            avgEntryPrice: p.avgEntryPrice,
            leverage: p.leverage,
            liquidationPrice: p.liquidationPrice,
            unrealizedProfit: p.unrealizedProfit,
            unrealizedProfitPercent: p.unrealizedProfitPercent,
            margin: p.margin,
            positionValue: p.positionValue,
            updatedAt: p.updatedAt,
          }))
        );
      }

      if (ordResult.status === "fulfilled") {
        const data =
          (ordResult.value as any)?.data || ordResult.value || [];
        setOpenOrders(
          (Array.isArray(data) ? data : []).map((o: any) => ({
            id: o.id,
            symbol: o.symbol,
            side: o.side,
            orderType: o.orderType,
            price: o.price,
            quantity: o.quantity,
            filledQty: o.filledQty,
            orderStatus: o.orderStatus,
            leverage: o.leverage,
            createdAt: o.createdAt,
            hash: o.hash,
          }))
        );
      }

      if (accResult.status === "fulfilled") {
        const d = (accResult.value as any)?.data || accResult.value;
        if (d) {
          setAccountData({
            walletBalance: d.walletBalance || "0",
            freeCollateral: d.freeCollateral || "0",
            accountValue: d.accountValue || "0",
            totalUnrealizedProfit: d.totalUnrealizedProfit || "0",
            totalPositionMargin: d.totalPositionMargin || "0",
          });
        }
      }
    } catch (err) {
      console.error("[Bluefin SDK] Refresh failed:", err);
    }
  }, [isReady]);

  // Auto-refresh every 15s when ready
  useEffect(() => {
    if (!isReady) return;
    refreshData();
    const id = setInterval(refreshData, 15_000);
    return () => clearInterval(id);
  }, [isReady, refreshData]);

  // Place order
  const placeOrder = useCallback(
    async (params: PlaceOrderParams) => {
      const client = clientRef.current;
      if (!client || !isReady) throw new Error("Bluefin client not ready");

      await loadSDK();

      const orderSide =
        params.side === "long" ? _ORDER_SIDE.BUY : _ORDER_SIDE.SELL;
      const oType =
        params.orderType === "market"
          ? _ORDER_TYPE.MARKET
          : _ORDER_TYPE.LIMIT;

      const orderParams: any = {
        symbol: params.symbol,
        side: orderSide,
        orderType: oType,
        quantity: params.quantity,
        price: params.orderType === "market" ? 0 : (params.price ?? 0),
        leverage: params.leverage ?? 1,
      };

      const result = await client.postOrder(orderParams);
      await refreshData();
      return result;
    },
    [isReady, refreshData]
  );

  // Cancel order
  const cancelOrder = useCallback(
    async (orderHash: string) => {
      const client = clientRef.current;
      if (!client || !isReady) throw new Error("Bluefin client not ready");

      const result = await client.postCancelOrder({
        hashes: [orderHash],
      });
      await refreshData();
      return result;
    },
    [isReady, refreshData]
  );

  return {
    isReady,
    isOnboarding,
    error,
    positions,
    openOrders,
    accountData,
    initialize,
    placeOrder,
    cancelOrder,
    refreshData,
  };
}
