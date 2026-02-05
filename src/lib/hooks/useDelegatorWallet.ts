"use client";

import { useState, useEffect, useCallback } from "react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const DELEGATOR_STORAGE_KEY = "dara_delegator_wallet";
const DELEGATOR_VERSION = "v1";
const VERSION_KEY = "dara_delegator_version";

export interface DelegatorState {
  keypair: Ed25519Keypair | null;
  address: string | null;
  balance: bigint;
  isInitialized: boolean;
}

export function useDelegatorWallet(suiClient: SuiJsonRpcClient) {
  const [delegatorState, setDelegatorState] = useState<DelegatorState>({
    keypair: null,
    address: null,
    balance: BigInt(0),
    isInitialized: false,
  });

  // Initialize or load delegator keypair
  useEffect(() => {
    const initDelegator = () => {
      try {
        const storedVersion = localStorage.getItem(VERSION_KEY);
        const storedKey = localStorage.getItem(DELEGATOR_STORAGE_KEY);
        let keypair: Ed25519Keypair;

        if (storedKey && storedVersion === DELEGATOR_VERSION) {
          try {
            const keyBytes = Buffer.from(storedKey, "base64");
            const privateKey = keyBytes.slice(0, 32);
            keypair = Ed25519Keypair.fromSecretKey(privateKey);
            console.log("[Delegator] Restored existing wallet");
          } catch {
            keypair = Ed25519Keypair.generate();
            const privateKey = keypair.getSecretKey().slice(0, 32);
            const secretKey = Buffer.from(privateKey).toString("base64");
            localStorage.setItem(DELEGATOR_STORAGE_KEY, secretKey);
            localStorage.setItem(VERSION_KEY, DELEGATOR_VERSION);
          }
        } else {
          keypair = Ed25519Keypair.generate();
          const privateKey = keypair.getSecretKey().slice(0, 32);
          const secretKey = Buffer.from(privateKey).toString("base64");
          localStorage.setItem(DELEGATOR_STORAGE_KEY, secretKey);
          localStorage.setItem(VERSION_KEY, DELEGATOR_VERSION);
          console.log("[Delegator] Generated new wallet");
        }

        const address = keypair.getPublicKey().toSuiAddress();
        setDelegatorState({
          keypair,
          address,
          balance: BigInt(0),
          isInitialized: true,
        });
        console.log("[Delegator] Initialized:", address);
      } catch (error) {
        console.error("[Delegator] Failed to initialize:", error);
      }
    };

    initDelegator();
  }, []);

  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  const checkBalance = useCallback(async (): Promise<bigint> => {
    if (!delegatorState.address) return BigInt(0);
    if (isCheckingBalance) return delegatorState.balance;

    setIsCheckingBalance(true);
    try {
      const balance = await suiClient.getBalance({
        owner: delegatorState.address,
        coinType: "0x2::sui::SUI",
      });
      const balanceAmount = BigInt(balance.totalBalance);
      setDelegatorState((prev) => ({ ...prev, balance: balanceAmount }));
      return balanceAmount;
    } catch (error) {
      console.error("[Delegator] Balance check failed:", error);
      return delegatorState.balance;
    } finally {
      setIsCheckingBalance(false);
    }
  }, [delegatorState.address, delegatorState.balance, suiClient, isCheckingBalance]);

  const buildFundingTransaction = useCallback(
    async (
      userAddress: string,
      suiAmount: bigint
    ): Promise<Transaction | null> => {
      if (!delegatorState.address) return null;

      const tx = new Transaction();
      tx.setSender(userAddress);
      const [suiCoin] = tx.splitCoins(tx.gas, [
        tx.pure.u64(suiAmount.toString()),
      ]);
      tx.transferObjects([suiCoin], tx.pure.address(delegatorState.address));

      console.log("[Delegator] Built funding tx:", {
        from: userAddress,
        to: delegatorState.address,
        amount: Number(suiAmount) / 1e9 + " SUI",
      });
      return tx;
    },
    [delegatorState.address]
  );

  const executeWithDelegator = useCallback(
    async (
      transaction: Transaction
    ): Promise<{
      digest: string;
      success: boolean;
      effects?: unknown;
    } | null> => {
      if (!delegatorState.keypair || !delegatorState.address) return null;

      try {
        transaction.setSender(delegatorState.address);
        const result = await suiClient.signAndExecuteTransaction({
          signer: delegatorState.keypair as Parameters<typeof suiClient.signAndExecuteTransaction>[0]["signer"],
          transaction: transaction as Parameters<typeof suiClient.signAndExecuteTransaction>[0]["transaction"],
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true,
          },
        });

        console.log("[Delegator] Executed:", result.digest);
        return {
          digest: result.digest,
          success: result.effects?.status.status === "success",
          effects: result.effects,
        };
      } catch (error) {
        console.error("[Delegator] Execution failed:", error);
        throw error;
      }
    },
    [delegatorState.keypair, delegatorState.address, suiClient]
  );

  const autoReclaimGas = useCallback(
    async (
      userAddress: string
    ): Promise<{ digest: string; recovered: bigint } | null> => {
      if (!delegatorState.keypair || !delegatorState.address) return null;

      try {
        const balance = await checkBalance();
        if (balance === BigInt(0)) {
          return { digest: "", recovered: BigInt(0) };
        }

        const tx = new Transaction();
        tx.setSender(delegatorState.address);
        tx.transferObjects([tx.gas], tx.pure.address(userAddress));

        const result = await suiClient.signAndExecuteTransaction({
          signer: delegatorState.keypair as Parameters<typeof suiClient.signAndExecuteTransaction>[0]["signer"],
          transaction: tx as Parameters<typeof suiClient.signAndExecuteTransaction>[0]["transaction"],
          options: { showEffects: true },
        });

        setDelegatorState((prev) => ({ ...prev, balance: BigInt(0) }));
        return { digest: result.digest, recovered: balance };
      } catch (error) {
        console.error("[Delegator] Reclaim failed:", error);
        return null;
      }
    },
    [delegatorState.keypair, delegatorState.address, suiClient, checkBalance]
  );

  const clearDelegator = useCallback(() => {
    localStorage.removeItem(DELEGATOR_STORAGE_KEY);
    localStorage.removeItem(VERSION_KEY);
    setDelegatorState({
      keypair: null,
      address: null,
      balance: BigInt(0),
      isInitialized: false,
    });
  }, []);

  return {
    delegator: delegatorState.keypair,
    delegatorAddress: delegatorState.address,
    delegatorBalance: delegatorState.balance,
    isInitialized: delegatorState.isInitialized,
    buildFundingTransaction,
    executeWithDelegator,
    autoReclaimGas,
    checkBalance,
    clearDelegator,
  };
}
