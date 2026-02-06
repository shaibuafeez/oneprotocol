"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { VoiceState } from "@/lib/types";

export function VoiceOrb({ state }: { state: VoiceState }) {
    const [layers, setLayers] = useState<number[]>([1, 2, 3]);

    // Orb colors based on state
    const colors = {
        idle: "from-slate-500/20 to-slate-900/20",
        listening: "from-ice/50 to-slate-600/50", // Misty Blue
        thinking: "from-purple-500/50 to-indigo-600/50",
        speaking: "from-white/80 to-ice/50",
        error: "from-red-500/50 to-orange-600/50",
    };

    const glowColor = {
        idle: "rgba(100, 116, 139, 0.2)",
        listening: "rgba(160, 175, 183, 0.6)", // Misty Blue
        thinking: "rgba(168, 85, 247, 0.6)",
        speaking: "rgba(255, 255, 255, 0.8)",
        error: "rgba(239, 68, 68, 0.6)",
    };

    return (
        <div className="relative w-64 h-64 flex items-center justify-center">
            {/* Outer Glow Ring */}
            <motion.div
                animate={{
                    scale: state === "speaking" ? [1, 1.2, 1] : state === "thinking" ? [1, 1.1, 1] : 1,
                    opacity: state === "idle" ? 0.2 : 0.6,
                }}
                transition={{
                    duration: state === "speaking" ? 0.3 : 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute inset-0 rounded-full blur-[60px]"
                style={{ background: glowColor[state] }}
            />

            {/* Core Sphere */}
            <div className="relative w-32 h-32">
                {/* Rotating Rings */}
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        animate={{
                            rotate: state === "idle" ? 360 : [0, 360],
                            scale: state === "speaking" ? [1, 1.1, 1] : 1,
                        }}
                        transition={{
                            rotate: {
                                duration: 10 - i * 2,
                                repeat: Infinity,
                                ease: "linear",
                                repeatType: "loop",
                            },
                            scale: {
                                duration: 0.2,
                                repeat: Infinity,
                            },
                        }}
                        className={`absolute inset-0 rounded-full border border-white/20`}
                        style={{
                            borderWidth: "1px",
                            borderRadius: `${40 + i * 5}%`,
                            transform: `rotate(${i * 45}deg)`,
                        }}
                    />
                ))}

                {/* Inner Core */}
                <motion.div
                    animate={{
                        scale: state === "listening" ? [1, 0.9, 1] : state === "speaking" ? [0.8, 1.1, 0.8] : 1,
                    }}
                    transition={{
                        duration: state === "speaking" ? 0.4 : 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    className={`absolute inset-2 rounded-full bg-gradient-radial ${colors[state]} backdrop-blur-sm border border-white/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.2)]`}
                >
                    {/* Particle Dust inside */}
                    <div className="absolute inset-0 overflow-hidden rounded-full">
                        <div className="absolute top-1/2 left-1/2 w-full h-[1px] bg-white/20 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                        <div className="absolute top-1/2 left-1/2 h-full w-[1px] bg-white/20 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                </motion.div>
            </div>

            {/* State Text Label */}
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={state}
                    className="px-3 py-1 rounded-full bg-black/50 border border-white/10 backdrop-blur-md text-[10px] uppercase tracking-[0.2em] font-bold text-white shadow-lg"
                >
                    {state}
                </motion.div>
            </div>
        </div>
    );
}
