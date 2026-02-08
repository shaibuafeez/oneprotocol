"use client";

import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";
import { VaultStatus } from "@/components/VaultStatus";
import { Header } from "@/components/Header";

export default function VaultPage() {
  const account = useCurrentAccount();

  const { data: balanceData } = useSuiClientQuery(
    "getBalance",
    { owner: account?.address || "" },
    { enabled: !!account?.address, refetchInterval: 10000 }
  );

  const suiBalance = BigInt(balanceData?.totalBalance || "0");

  return (
    <div className="min-h-screen text-foreground">
      <Header />

      <main className="pt-24 w-full max-w-none mx-auto px-6 md:px-10 pb-12">
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Vault</h2>
            <p className="text-slate-400 text-sm">
              Portfolio allocation, live earnings, and position tracking
            </p>
          </div>

          <VaultStatus suiBalance={suiBalance} />
        </div>
      </main>
    </div>
  );
}
