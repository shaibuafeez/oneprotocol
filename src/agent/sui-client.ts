import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, VAULT_STATE_ID, SUI_NETWORK } from "@/lib/constants";
import { VaultState } from "@/lib/types";

const network = SUI_NETWORK as "testnet" | "mainnet" | "devnet" | "localnet";
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network), network });

export { client as suiClient };

/**
 * Read vault state from chain
 */
export async function getVaultState(): Promise<VaultState | null> {
  if (!VAULT_STATE_ID) return null;

  try {
    const obj = await client.getObject({
      id: VAULT_STATE_ID,
      options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== "moveObject") return null;

    const fields = obj.data.content.fields as Record<string, unknown>;
    return {
      id: VAULT_STATE_ID,
      suiBalance: BigInt((fields.sui_balance as Record<string, string>)?.value || "0"),
      agent: fields.agent as string,
      isActive: fields.is_active as boolean,
      targetSuiPct: Number(fields.target_sui_pct),
      rebalanceThreshold: Number(fields.rebalance_threshold),
      totalDeposits: BigInt(String(fields.total_deposits || "0")),
      rebalanceCount: Number(fields.rebalance_count),
    };
  } catch (e) {
    console.error("Failed to read vault state:", e);
    return null;
  }
}

/**
 * Get SUI balance for an address
 */
export async function getSuiBalance(address: string): Promise<bigint> {
  const balance = await client.getBalance({ owner: address });
  return BigInt(balance.totalBalance);
}

/**
 * Build deposit transaction
 */
export function buildDepositTx(amount: bigint): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
  tx.moveCall({
    target: `${PACKAGE_ID}::vault::deposit`,
    arguments: [tx.object(VAULT_STATE_ID), coin],
  });
  return tx;
}

/**
 * Build withdraw transaction
 */
export function buildWithdrawTx(receiptId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::vault::withdraw`,
    arguments: [tx.object(VAULT_STATE_ID), tx.object(receiptId)],
  });
  return tx;
}

/**
 * Build agent rebalance transaction (PTB)
 * This batches: read state + rebalance in one atomic tx
 */
export function buildAgentRebalanceTx(
  amount: bigint,
  action: string,
  priceSignal: number
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::vault::agent_rebalance`,
    arguments: [
      tx.object(VAULT_STATE_ID),
      tx.pure.u64(amount),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(action))),
      tx.pure.u64(Math.floor(priceSignal * 1e6)),
    ],
  });
  return tx;
}

/**
 * Build agent deposit back transaction
 */
export function buildAgentDepositBackTx(coinId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::vault::agent_deposit_back`,
    arguments: [tx.object(VAULT_STATE_ID), tx.object(coinId)],
  });
  return tx;
}

/**
 * Build agent cross-chain log transaction
 */
export function buildAgentLogCrossChainTx(
  action: string,
  amount: bigint,
  targetChain: string,
  reason: string
): Transaction {
  const tx = new Transaction();
  const encode = (s: string) =>
    tx.pure.vector("u8", Array.from(new TextEncoder().encode(s)));
  tx.moveCall({
    target: `${PACKAGE_ID}::vault::agent_log_cross_chain`,
    arguments: [
      tx.object(VAULT_STATE_ID),
      encode(action),
      tx.pure.u64(amount),
      encode(targetChain),
      encode(reason),
    ],
  });
  return tx;
}

/**
 * Query recent vault events
 */
export async function getVaultEvents(eventType: string, limit: number = 20) {
  if (!PACKAGE_ID) return [];

  try {
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${PACKAGE_ID}::vault::${eventType}`,
      },
      limit,
      order: "descending",
    });
    return events.data;
  } catch (e) {
    console.error("Failed to query events:", e);
    return [];
  }
}
