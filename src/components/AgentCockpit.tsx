"use client";

import React, { ReactNode } from "react";
import { motion } from "framer-motion";
import { AgentBackground } from "@/components/AgentBackground";

interface AgentCockpitProps {
    core: ReactNode;
    feed: ReactNode;
    actionDeck?: ReactNode;
}

export function AgentCockpit({ core, feed, actionDeck }: AgentCockpitProps) {
    return (
        <div className="relative min-h-[calc(100vh-6rem)] w-full overflow-hidden bg-black text-white flex flex-col lg:flex-row gap-6 p-6">
            {/* Background Ambience - Ice Theme */}
            <AgentBackground />

            {/* Main Panel: The Core (70%) */}
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="w-full lg:w-[70%] flex flex-col relative z-20"
            >
                <div className="flex-1 flex items-center justify-center relative">
                    {/* Ice Holographic Platform */}
                    <div className="absolute bottom-10 w-2/3 h-24 bg-[#88BDF2]/5 blur-3xl rounded-[100%]" />
                    {core}
                </div>

                {/* Action Deck at bottom of center */}
                {actionDeck && (
                    <div className="mt-6">
                        {actionDeck}
                    </div>
                )}
            </motion.div>

            {/* Right Panel: Neural Feed (30%) */}
            <motion.div
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                className="w-full lg:w-[30%] flex flex-col gap-4 relative z-10"
            >
                <div className="flex-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-[#88BDF2]/30 transition-colors flex flex-col">
                    <div className="absolute inset-0 bg-scanline opacity-5 pointer-events-none" />
                    {feed}
                </div>
            </motion.div>
        </div>
    );
}
