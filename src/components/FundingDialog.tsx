"use client";

import { useDelegatorWallet } from "@/lib/hooks/useDelegatorWallet";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface FundingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

import { useSuiClient } from "@mysten/dapp-kit";

export function FundingDialog({ open, onOpenChange }: FundingDialogProps) {
  const suiClient = useSuiClient();
  const { delegatorAddress: walletAddress, delegatorBalance: balance } = useDelegatorWallet(suiClient);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const balanceNum = Number(balance) / 1e9;
  const isLowBalance = balanceNum < 0.05;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-black/90 border border-white/10 rounded-2xl p-6 shadow-2xl shadow-cyan-900/40 z-[10000] animate-in zoom-in-95 duration-200">
          <Dialog.Title className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_10px_#22d3ee]"></span>
            Fund Agent Wallet
          </Dialog.Title>
          <Dialog.Description className="text-slate-400 text-sm mb-6">
            Your AI agent needs SUI for gas fees to execute transaction on your behalf.
          </Dialog.Description>

          <div className="space-y-4">
            {/* Address Box */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl relative group">
              <p className="text-xs uppercase text-slate-500 font-bold mb-1">
                Agent Wallet Address
              </p>
              <div className="flex items-center justify-between">
                <code className="text-sm text-cyan-400 font-mono break-all">
                  {walletAddress}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Balance Status */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${isLowBalance ? "bg-red-500/10 border-red-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
              <div>
                <p className={`text-xs font-bold ${isLowBalance ? "text-red-400" : "text-emerald-400"}`}>Current Balance</p>
                <p className={`text-lg font-mono font-bold ${isLowBalance ? "text-white" : "text-white"}`}>
                  {balanceNum.toFixed(4)} SUI
                </p>
              </div>
              {isLowBalance && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-1 rounded animate-pulse">Low Balance</span>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 flex gap-3">
              <button
                onClick={() => onOpenChange(false)}
                className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              >
                Close
              </button>
              <a
                href={`https://suiscan.xyz/mainnet/account/${walletAddress}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 transition-all hover:shadow-cyan-500/20"
              >
                View on Explorer <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
