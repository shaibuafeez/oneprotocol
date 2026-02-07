"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import {
  getPoolOHLCV,
  getPoolInfo,
  getGeckoPoolAddress,
  type OHLCVData,
} from "@/lib/api/geckoterminal";

interface SpotChartProps {
  poolKey: string;
  label: string;
}

type Timeframe = "15m" | "1h" | "4h" | "1d";

export function SpotChart({ poolKey, label }: SpotChartProps) {
  const [chartData, setChartData] = useState<OHLCVData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const fetchData = useCallback(async () => {
    const geckoPool = getGeckoPoolAddress(poolKey);
    if (!geckoPool) {
      setError("No chart data available for this pool");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [ohlcvResult, poolInfoResult] = await Promise.all([
      getPoolOHLCV(geckoPool, timeframe),
      getPoolInfo(geckoPool),
    ]);

    if (ohlcvResult.success && ohlcvResult.data) {
      setChartData(ohlcvResult.data);
    } else {
      setError(ohlcvResult.error || "Failed to load chart data");
    }

    if (poolInfoResult.success && poolInfoResult.price !== undefined) {
      setPrice(poolInfoResult.price);
      setPriceChange(poolInfoResult.priceChange24h || 0);
    }

    setLoading(false);
  }, [poolKey, timeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Create / update chart
  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.3)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "rgba(255,255,255,0.05)",
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.05)",
      },
      crosshair: {
        vertLine: { color: "rgba(34,211,238,0.3)", width: 1 },
        horzLine: { color: "rgba(34,211,238,0.3)", width: 1 },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#f43f5e",
      priceFormat: {
        type: "price",
        precision: 4,
        minMove: 0.0001,
      },
    });

    const formatted = chartData
      .map((d) => ({
        time: Math.floor(d.timestamp / 1000) as unknown as string,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      .sort((a, b) => Number(a.time) - Number(b.time))
      .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time);

    series.setData(formatted as any);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData]);

  const timeframes: Timeframe[] = ["15m", "1h", "4h", "1d"];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30">{label}</span>
          {price !== null && (
            <>
              <span className="text-sm font-mono text-white font-medium">
                ${price.toFixed(price < 0.01 ? 6 : 4)}
              </span>
              <span
                className={`text-xs font-mono ${priceChange >= 0 ? "text-cyan-400" : "text-rose-400"}`}
              >
                {priceChange >= 0 ? "+" : ""}
                {priceChange.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        {/* Timeframe selector */}
        <div className="flex gap-1">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                timeframe === tf
                  ? "bg-white/10 text-white border border-white/10"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-5 h-5 border-2 border-white/10 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">
            {error}
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      <div className="text-[9px] text-white/15 text-right mt-1">
        GeckoTerminal
      </div>
    </div>
  );
}
