"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { motion } from "framer-motion";

import { DaraLogo } from "@/components/DaraLogo";

const NAV_ITEMS = [
  { label: "Portfolio", href: "/" },
  { label: "Agent", href: "/agent" },
  { label: "Swap", href: "/swap" },
  { label: "Perps", href: "/perps" },
  { label: "Vault", href: "/vault" },
  { label: "Bridge", href: "/bridge" },
  { label: "Treasury", href: "/treasury" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full px-2 py-2 flex items-center gap-2 shadow-2xl shadow-black/50 relative">
        {/* Glass reflection effect */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />

        {/* Logo Section */}
        <Link href="/" className="flex items-center gap-3 pl-3 pr-4 group">
          <DaraLogo className="w-8 h-8 group-hover:scale-105 transition-transform duration-300" />
          <span className="text-sm font-bold text-white tracking-wide hidden sm:block group-hover:text-ice transition-colors font-mono">
            DARA
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center bg-white/5 rounded-full p-1 border border-white/5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-white/10 rounded-full shadow-inner border border-white/5"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <span className={`relative z-10 ${isActive ? "text-white" : "text-slate-400 hover:text-white"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Action Button / Wallet */}
        <div className="pl-2 pr-1">
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
