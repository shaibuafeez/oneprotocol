"use client";

import { motion } from "framer-motion";

export function DaraLogo({ className = "w-8 h-8" }: { className?: string }) {
    return (
        <div className={`${className} relative flex items-center justify-center`}>
            <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]"
            >
                <defs>
                    <linearGradient id="ice-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#A0AFB7" /> {/* Misty Blue Light */}
                        <stop offset="100%" stopColor="#78909C" /> {/* Misty Blue Dark */}
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Abstract Futuristic 'D' */}
                <motion.path
                    d="M 30 20 L 50 20 C 75 20 90 35 90 50 C 90 65 75 80 50 80 L 30 80 L 30 20 Z"
                    stroke="url(#ice-gradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                />

                {/* Internal Tech Details */}
                <motion.circle cx="45" cy="50" r="4" fill="#A0AFB7" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                <motion.path d="M 30 50 L 40 50" stroke="#A0AFB7" strokeWidth="2" />
                <path d="M 50 28 L 50 35" stroke="#A0AFB7" strokeWidth="2" opacity="0.5" />
                <path d="M 50 72 L 50 65" stroke="#A0AFB7" strokeWidth="2" opacity="0.5" />
            </svg>
        </div>
    );
}
