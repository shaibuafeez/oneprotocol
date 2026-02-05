import { Header } from "@/components/Header";
import { ArcVaultStatus } from "@/components/ArcVaultStatus";
import { BridgeMonitor } from "@/components/BridgeMonitor";
import { CrossChainPanel } from "@/components/CrossChainPanel";
import { TreasuryDecisionTimeline } from "@/components/TreasuryDecisionTimeline";

export default function TreasuryPage() {
    return (
        <div className="min-h-screen text-white font-sans selection:bg-cyan-500/30">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-cyan-900/10 blur-[120px]" />
            </div>

            <Header />

            <main className="relative z-10 max-w-[1400px] mx-auto px-6 pt-24 pb-12">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-white mb-1">Treasury</h2>
                    <p className="text-slate-400 text-sm">
                        AI-managed cross-chain treasury — Arc (RWA safety) + Sui (DeFi yield)
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Col: Vault Status + Decision Timeline */}
                    <div className="lg:col-span-2 space-y-6">
                        <ArcVaultStatus />
                        <TreasuryDecisionTimeline />
                    </div>

                    {/* Right Col: Bridge & Operations */}
                    <div className="space-y-6">
                        <BridgeMonitor />
                        <CrossChainPanel />
                    </div>
                </div>
            </main>
        </div>
    );
}
