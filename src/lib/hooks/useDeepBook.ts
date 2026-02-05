"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  DeepBookClient,
  mainnetCoins,
  mainnetPools,
  OrderType,
  SelfMatchingOptions,
} from "@mysten/deepbook-v3";

// ── Types ──────────────────────────────────────────────

export interface OrderbookData {
  bid_prices: number[];
  bid_quantities: number[];
  ask_prices: number[];
  ask_quantities: number[];
}

export interface OpenOrder {
  orderId: string;
  isBid: boolean;
  price: string;
  quantity: string;
  filledQuantity: string;
  status: number;
}

export interface PoolInfo {
  key: string;
  baseCoin: string;
  quoteCoin: string;
  label: string; // e.g. "SUI / USDC"
}

// Pools we expose in the trade UI
export const TRADE_POOLS: PoolInfo[] = [
  { key: "SUI_USDC", baseCoin: "SUI", quoteCoin: "USDC", label: "SUI / USDC" },
  { key: "DEEP_SUI", baseCoin: "DEEP", quoteCoin: "SUI", label: "DEEP / SUI" },
  { key: "DEEP_USDC", baseCoin: "DEEP", quoteCoin: "USDC", label: "DEEP / USDC" },
  { key: "WAL_USDC", baseCoin: "WAL", quoteCoin: "USDC", label: "WAL / USDC" },
  { key: "WAL_SUI", baseCoin: "WAL", quoteCoin: "SUI", label: "WAL / SUI" },
];

export interface PlaceOrderParams {
  poolKey: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: number;
  price?: number;
}

// A well-known address used as sender for read-only simulate calls.
// DeepBook SDK builds Transaction objects for queries but never sets a sender,
// while @mysten/sui v2's simulateTransaction requires one.  This wrapper
// intercepts simulateTransaction and auto-injects the sender so queries work
// even when no wallet is connected.
const READONLY_SENDER =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

function wrapClientForDeepBook(client: any, senderAddress: string) {
  // DeepBook SDK calls client.core.simulateTransaction() for all read queries.
  // It creates Transaction objects but never sets a sender, and @mysten/sui v2
  // requires the sender + fully resolved objects for serialization.
  // We intercept simulateTransaction, set the sender, fully build the tx
  // (which resolves shared objects via RPC), then pass raw bytes.
  const originalCore = client.core;
  const originalSimulate = originalCore.simulateTransaction.bind(originalCore);

  const wrappedCore = Object.create(originalCore);
  wrappedCore.simulateTransaction = async (options: any) => {
    if (options.transaction && !(options.transaction instanceof Uint8Array)) {
      const tx = options.transaction;
      tx.setSenderIfNotSet(senderAddress);
      // Full build resolves UnresolvedObject inputs, gas, etc.
      const bytes = await tx.build({ client });
      return originalSimulate({ ...options, transaction: bytes });
    }
    return originalSimulate(options);
  };

  return new Proxy(client, {
    get(target: any, prop: string | symbol) {
      if (prop === "core") return wrappedCore;
      return target[prop];
    },
  });
}

// ── Hook ───────────────────────────────────────────────

export function useDeepBook() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [midPrice, setMidPrice] = useState<number>(0);
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [balanceManagerId, setBalanceManagerId] = useState<string | null>(null);
  const [suiBalance, setSuiBalance] = useState<number>(0);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [poolParams, setPoolParams] = useState<{
    tickSize: number;
    lotSize: number;
    minSize: number;
  } | null>(null);
  const [tradeParams, setTradeParams] = useState<{
    takerFee: number;
    makerFee: number;
  } | null>(null);
  const [selectedPool, setSelectedPool] = useState<string>("SUI_USDC");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<
    { time: string; price: number }[]
  >([]);

  const clientRef = useRef<DeepBookClient | null>(null);
  const senderRef = useRef<string>(READONLY_SENDER);

  // Keep sender ref in sync
  senderRef.current = account?.address || READONLY_SENDER;

  // Build DeepBook client — only recreate when suiClient or balanceManagerId truly changes.
  // We use a ref for the sender to avoid recreating the client when the wallet connects
  // (read-only queries work with any sender).
  const dbClient = useMemo(() => {
    const sender = senderRef.current;
    const wrappedClient = wrapClientForDeepBook(suiClient, sender);
    const client = new DeepBookClient({
      client: wrappedClient as any,
      address: sender,
      network: "mainnet",
      coins: mainnetCoins,
      pools: mainnetPools,
      ...(balanceManagerId
        ? { balanceManagers: { MANAGER: { address: balanceManagerId } } }
        : {}),
    });
    clientRef.current = client;
    return client;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiClient, balanceManagerId]);

  // ── Fetch public market data ──

  const refreshMarketData = useCallback(async () => {
    try {
      const [price, ob, bookParams, tParams] = await Promise.allSettled([
        dbClient.midPrice(selectedPool),
        dbClient.getLevel2TicksFromMid(selectedPool, 12),
        dbClient.poolBookParams(selectedPool),
        dbClient.poolTradeParams(selectedPool),
      ]);

      if (price.status === "fulfilled" && price.value > 0) {
        setMidPrice(price.value);
        const t = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setPriceHistory((prev) =>
          [...prev, { time: t, price: price.value }].slice(-60)
        );
      }
      if (ob.status === "fulfilled") {
        setOrderbook(ob.value);
      }
      if (bookParams.status === "fulfilled") setPoolParams(bookParams.value);
      if (tParams.status === "fulfilled")
        setTradeParams({
          takerFee: tParams.value.takerFee,
          makerFee: tParams.value.makerFee,
        });
    } catch (err: any) {
      console.error("[DeepBook] Market data fetch failed:", err);
    }
  }, [dbClient, selectedPool]);

  // Auto-refresh market data every 5s
  useEffect(() => {
    refreshMarketData();
    const id = setInterval(refreshMarketData, 5_000);
    return () => clearInterval(id);
  }, [refreshMarketData]);

  // Reset price history when pool changes
  useEffect(() => {
    setPriceHistory([]);
  }, [selectedPool]);

  // ── Balance Manager discovery ──

  const findBalanceManager = useCallback(async () => {
    if (!account?.address) return;

    try {
      // Query owned objects for BalanceManager type
      const res = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: {
          StructType:
            "0x000000000000000000000000000000000000000000000000000000000000dee9::balance_manager::BalanceManager",
        },
        options: { showContent: true },
      });

      // Also try the actual package ID
      const res2 = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: {
          StructType:
            "0xdee9::balance_manager::BalanceManager",
        },
        options: { showContent: true },
      });

      const allObjects = [...(res.data || []), ...(res2.data || [])];
      if (allObjects.length > 0 && allObjects[0].data) {
        setBalanceManagerId(allObjects[0].data.objectId);
        return allObjects[0].data.objectId;
      }
    } catch (err) {
      console.error("[DeepBook] Failed to find BalanceManager:", err);
    }
    return null;
  }, [account?.address, suiClient]);

  useEffect(() => {
    findBalanceManager();
  }, [findBalanceManager]);

  // ── Fetch user balances ──

  const refreshBalances = useCallback(async () => {
    if (!balanceManagerId || !dbClient) return;

    try {
      const [sui, usdc] = await Promise.allSettled([
        dbClient.checkManagerBalance("MANAGER", "SUI"),
        dbClient.checkManagerBalance("MANAGER", "USDC"),
      ]);
      if (sui.status === "fulfilled") setSuiBalance(sui.value.balance);
      if (usdc.status === "fulfilled") setUsdcBalance(usdc.value.balance);
    } catch (err) {
      console.error("[DeepBook] Balance check failed:", err);
    }
  }, [balanceManagerId, dbClient]);

  useEffect(() => {
    if (balanceManagerId) refreshBalances();
  }, [balanceManagerId, refreshBalances]);

  // ── Fetch open orders ──

  const refreshOrders = useCallback(async () => {
    if (!balanceManagerId || !dbClient) return;

    try {
      const orderIds = await dbClient.accountOpenOrders(
        selectedPool,
        "MANAGER"
      );

      if (orderIds.length === 0) {
        setOpenOrders([]);
        return;
      }

      const orders = await dbClient.getOrders(selectedPool, orderIds);
      if (orders) {
        setOpenOrders(
          orders.map((o) => ({
            orderId: o.order_id,
            isBid: true,
            price: o.order_deep_price?.deep_per_asset ?? "0",
            quantity: o.quantity,
            filledQuantity: o.filled_quantity,
            status: o.status,
          }))
        );
      }
    } catch (err) {
      console.error("[DeepBook] Open orders fetch failed:", err);
      setOpenOrders([]);
    }
  }, [balanceManagerId, dbClient, selectedPool]);

  useEffect(() => {
    if (balanceManagerId) refreshOrders();
  }, [balanceManagerId, refreshOrders]);

  // ── Create Balance Manager ──

  const createBalanceManager = useCallback(async () => {
    if (!account?.address) throw new Error("Wallet not connected");

    setIsLoading(true);
    setError(null);

    try {
      const tx = new Transaction();
      dbClient.balanceManager.createAndShareBalanceManager()(tx);

      const result = await signAndExecute({ transaction: tx });
      console.log("[DeepBook] BalanceManager created:", result);

      // Wait a moment then search for the new manager
      await new Promise((r) => setTimeout(r, 2000));
      const mgr = await findBalanceManager();
      if (mgr) {
        console.log("[DeepBook] Found new BalanceManager:", mgr);
      }
      return result;
    } catch (err: any) {
      console.error("[DeepBook] Create BalanceManager failed:", err);
      setError(err?.message || "Failed to create Balance Manager");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [account?.address, dbClient, signAndExecute, findBalanceManager]);

  // ── Deposit into Balance Manager ──

  const deposit = useCallback(
    async (coinKey: string, amount: number) => {
      if (!balanceManagerId || !account?.address)
        throw new Error("No balance manager");

      setIsLoading(true);
      setError(null);

      try {
        const tx = new Transaction();
        dbClient.balanceManager.depositIntoManager(
          "MANAGER",
          coinKey,
          amount
        )(tx);

        const result = await signAndExecute({ transaction: tx });
        console.log("[DeepBook] Deposit success:", result);
        await refreshBalances();
        return result;
      } catch (err: any) {
        console.error("[DeepBook] Deposit failed:", err);
        setError(err?.message || "Deposit failed");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [
      balanceManagerId,
      account?.address,
      dbClient,
      signAndExecute,
      refreshBalances,
    ]
  );

  // ── Place Order ──

  const placeOrder = useCallback(
    async (params: PlaceOrderParams) => {
      if (!balanceManagerId || !account?.address)
        throw new Error("No balance manager — create one first");

      setIsLoading(true);
      setError(null);

      try {
        const tx = new Transaction();
        const clientOrderId = Date.now().toString();
        const isBid = params.side === "buy";

        if (params.orderType === "market") {
          dbClient.deepBook.placeMarketOrder({
            poolKey: params.poolKey,
            balanceManagerKey: "MANAGER",
            clientOrderId,
            quantity: params.quantity,
            isBid,
            selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
          })(tx);
        } else {
          if (!params.price || params.price <= 0)
            throw new Error("Limit price required");

          dbClient.deepBook.placeLimitOrder({
            poolKey: params.poolKey,
            balanceManagerKey: "MANAGER",
            clientOrderId,
            price: params.price,
            quantity: params.quantity,
            isBid,
            orderType: OrderType.NO_RESTRICTION,
            selfMatchingOption: SelfMatchingOptions.SELF_MATCHING_ALLOWED,
          })(tx);
        }

        const result = await signAndExecute({ transaction: tx });
        console.log("[DeepBook] Order placed:", result);

        // Refresh data after order
        await Promise.allSettled([
          refreshOrders(),
          refreshBalances(),
          refreshMarketData(),
        ]);
        return result;
      } catch (err: any) {
        console.error("[DeepBook] Place order failed:", err);
        setError(err?.message || "Order failed");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [
      balanceManagerId,
      account?.address,
      dbClient,
      signAndExecute,
      refreshOrders,
      refreshBalances,
      refreshMarketData,
    ]
  );

  // ── Cancel Order ──

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!balanceManagerId) throw new Error("No balance manager");

      setIsLoading(true);
      setError(null);

      try {
        const tx = new Transaction();
        dbClient.deepBook.cancelOrder(
          selectedPool,
          "MANAGER",
          orderId
        )(tx);

        const result = await signAndExecute({ transaction: tx });
        console.log("[DeepBook] Order cancelled:", result);

        await Promise.allSettled([refreshOrders(), refreshBalances()]);
        return result;
      } catch (err: any) {
        console.error("[DeepBook] Cancel order failed:", err);
        setError(err?.message || "Cancel failed");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [
      balanceManagerId,
      selectedPool,
      dbClient,
      signAndExecute,
      refreshOrders,
      refreshBalances,
    ]
  );

  // ── Withdraw from Balance Manager ──

  const withdraw = useCallback(
    async (coinKey: string, amount: number) => {
      if (!balanceManagerId || !account?.address)
        throw new Error("No balance manager");

      setIsLoading(true);
      setError(null);

      try {
        const tx = new Transaction();
        dbClient.balanceManager.withdrawFromManager(
          "MANAGER",
          coinKey,
          amount,
          account.address
        )(tx);

        const result = await signAndExecute({ transaction: tx });
        console.log("[DeepBook] Withdraw success:", result);
        await refreshBalances();
        return result;
      } catch (err: any) {
        console.error("[DeepBook] Withdraw failed:", err);
        setError(err?.message || "Withdraw failed");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [
      balanceManagerId,
      account?.address,
      dbClient,
      signAndExecute,
      refreshBalances,
    ]
  );

  return {
    // State
    midPrice,
    orderbook,
    openOrders,
    balanceManagerId,
    suiBalance,
    usdcBalance,
    poolParams,
    tradeParams,
    selectedPool,
    isLoading,
    error,
    priceHistory,

    // Actions
    setSelectedPool,
    createBalanceManager,
    deposit,
    withdraw,
    placeOrder,
    cancelOrder,
    refreshMarketData,
    refreshBalances,
    refreshOrders,
    setError,
  };
}
