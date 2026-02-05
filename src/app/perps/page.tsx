"use client";

import { Header } from "@/components/Header";
import { PerpsView } from "@/components/PerpsView";

export default function PerpsPage() {
  return (
    <div className="min-h-screen text-foreground">
      <Header />

      <main className="pt-24 max-w-[1400px] mx-auto px-4 pb-12">
        <PerpsView />
      </main>
    </div>
  );
}
