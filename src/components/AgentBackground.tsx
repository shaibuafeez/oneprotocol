"use client";

export function AgentBackground() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden bg-black">
            {/* SVG Neural Pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <pattern id="hex-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M0 40L20 0L40 40" fill="none" stroke="#88BDF2" strokeWidth="0.5" opacity="0.3" />
                        <circle cx="20" cy="0" r="1" fill="#00F0FF" opacity="0.5" />
                    </pattern>
                    <radialGradient id="deep-space" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#0B1021" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                    </radialGradient>
                </defs>

                {/* Background Gradients */}
                <rect width="100%" height="100%" fill="url(#deep-space)" />
                <rect width="100%" height="100%" fill="url(#hex-grid)" mask="url(#fade-mask)" />

                {/* Random connecting lines (Abstract) */}
                <path d="M 100 100 Q 400 200 800 100" stroke="#88BDF2" strokeWidth="0.5" fill="none" opacity="0.2" />
                <path d="M -100 500 Q 500 800 1200 300" stroke="#00F0FF" strokeWidth="0.5" fill="none" opacity="0.1" />
            </svg>

            {/* CSS Overlay for Vignette & Depth */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000000_90%)]" />
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#88BDF2]/20 to-transparent" />
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#88BDF2]/20 to-transparent" />
        </div>
    );
}
