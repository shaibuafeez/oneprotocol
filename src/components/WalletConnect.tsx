"use client";

import { useState, useRef, useEffect } from "react";
import {
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useConnectWallet,
  useWallets,
} from "@mysten/dapp-kit";

export function WalletConnect() {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const { mutate: connect, isPending } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const wallets = useWallets();
  const [showDropdown, setShowDropdown] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (account) {
    const addr = account.address;
    const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-full text-sm transition-all duration-200"
        >
          <span className="text-white font-mono text-xs">{short}</span>
          {currentWallet && (
            <span className="text-slate-400 text-[10px] hidden sm:inline">
              {currentWallet.name}
            </span>
          )}
        </button>

        {showDropdown && (
          <div className="absolute right-0 top-full mt-3 w-56 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Connected</p>
              <p className="text-xs text-white font-mono truncate mt-1">{addr}</p>
            </div>
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full px-4 py-3 text-left text-xs text-red-400 hover:bg-white/5 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isPending}
        className="px-4 py-1.5 bg-gradient-to-r from-ice to-blue-600 hover:from-ice/90 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-black disabled:text-slate-400 rounded-full text-xs font-bold transition-all duration-200 shadow-[0_0_15px_rgba(136,189,242,0.2)] hover:shadow-[0_0_20px_rgba(136,189,242,0.3)]"
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-3 w-72 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-medium text-white">Connect a wallet</p>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
              Select a Sui wallet to continue
            </p>
          </div>

          <div className="py-1">
            {wallets.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-slate-400 mb-2">
                  No wallets detected
                </p>
                <a
                  href="https://suiwallet.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-ice hover:text-ice/80 transition-colors"
                >
                  Install Sui Wallet
                </a>
              </div>
            ) : (
              <>
                {connectError && (
                  <div className="mx-3 mb-1 px-3 py-2 bg-red-900/20 border border-red-500/20 rounded-xl">
                    <p className="text-[10px] text-red-400">{connectError}</p>
                  </div>
                )}
                {wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    onClick={() => {
                      setConnectError(null);
                      connect(
                        { wallet },
                        {
                          onSuccess: () => {
                            setShowDropdown(false);
                            setConnectError(null);
                          },
                          onError: (err) => {
                            console.error(
                              `[Wallet] ${wallet.name} connect failed:`,
                              err
                            );
                            const msg = err.message || "";
                            if (msg.includes("set up your wallet")) {
                              setConnectError(
                                `${wallet.name} needs setup first. Open the extension and create/import a wallet.`
                              );
                            } else {
                              setConnectError(
                                `${wallet.name}: ${msg.slice(0, 80)}`
                              );
                            }
                          },
                        }
                      );
                    }}
                    disabled={isPending}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-50 rounded-xl mx-0"
                  >
                    {wallet.icon && (
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        className="w-7 h-7 rounded-full ring-1 ring-white/10"
                      />
                    )}
                    <div className="text-left">
                      <p className="text-xs text-white font-medium">{wallet.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {wallet.accounts?.length
                          ? `${wallet.accounts.length} account(s)`
                          : "Click to connect"}
                      </p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
