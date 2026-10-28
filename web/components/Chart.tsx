"use client";

import React, { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  LineStyle,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";
import { Button } from "@/components/ui/button";
import type { SnapshotData } from "@/lib/engine";

interface ChartProps {
  symbol: string;
  activeTf: string;
  onTfChange: (tf: string) => void;
  candles: Array<[number, number, number, number, number, number]>;
  liveCandle?: SnapshotData["candle"] | null;
  setup?: SnapshotData["setup"] | null;
  liquidity?: SnapshotData["liquidity"] | null;
}

export default function Chart({
  symbol,
  activeTf,
  onTfChange,
  candles,
  liveCandle,
  setup,
  liquidity,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  // 1. Initialize Chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" }, // zinc-950
        textColor: "#a1a1aa", // zinc-400
        fontSize: 12,
        fontFamily: "Inter, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(39, 39, 42, 0.4)" }, // zinc-800
        horzLines: { color: "rgba(39, 39, 42, 0.4)" },
      },
      crosshair: {
        vertLine: { color: "#71717a", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "#71717a", width: 1, style: LineStyle.Dashed },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#27272a",
        autoScale: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", // green-500
      downColor: "#ef4444", // red-500
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 2. Set Historical Data whenever candles or symbol or tf changes
  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;

    // Deduplicate and format timestamps (ascending)
    const formattedMap = new Map<number, { time: UTCTimestamp; open: number; high: number; low: number; close: number }>();
    for (const c of candles) {
      const timeSec = Math.floor(c[0] / 1000) as UTCTimestamp;
      formattedMap.set(timeSec, {
        time: timeSec,
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
      });
    }

    const sortedData = Array.from(formattedMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    seriesRef.current.setData(sortedData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [candles, symbol, activeTf]);

  // 3. Update single live candle on ticks (series.update)
  useEffect(() => {
    if (!seriesRef.current || !liveCandle) return;
    if (liveCandle.tf !== activeTf) return;

    try {
      seriesRef.current.update({
        time: Math.floor(liveCandle.t / 1000) as UTCTimestamp,
        open: liveCandle.o,
        high: liveCandle.h,
        low: liveCandle.l,
        close: liveCandle.c,
      });
    } catch {
      // Ignore timestamp sequencing micro-errors
    }
  }, [liveCandle, activeTf]);

  // 4. Update Price Lines (Entry / Stop / Target & Liquidity Walls)
  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove existing price lines
    for (const line of priceLinesRef.current) {
      try {
        seriesRef.current.removePriceLine(line);
      } catch {}
    }
    priceLinesRef.current = [];

    // Active setup lines
    if (setup && (setup.action === "BUY" || setup.action === "SELL")) {
      if (setup.entry > 0) {
        const entryLine = seriesRef.current.createPriceLine({
          price: setup.entry,
          color: "#38bdf8", // sky-400
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "ENTRY",
        });
        priceLinesRef.current.push(entryLine);
      }
      if (setup.sl > 0) {
        const slLine = seriesRef.current.createPriceLine({
          price: setup.sl,
          color: "#ef4444", // red-500
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "STOP",
        });
        priceLinesRef.current.push(slLine);
      }
      if (setup.tp > 0) {
        const tpLine = seriesRef.current.createPriceLine({
          price: setup.tp,
          color: "#22c55e", // green-500
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "TARGET",
        });
        priceLinesRef.current.push(tpLine);
      }
    }

    // Liquidity Walls (thin dashed lines)
    if (liquidity?.buyWall?.price) {
      const buyWallLine = seriesRef.current.createPriceLine({
        price: liquidity.buyWall.price,
        color: "rgba(34, 197, 94, 0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "BUY WALL",
      });
      priceLinesRef.current.push(buyWallLine);
    }

    if (liquidity?.sellWall?.price) {
      const sellWallLine = seriesRef.current.createPriceLine({
        price: liquidity.sellWall.price,
        color: "rgba(239, 68, 68, 0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "SELL WALL",
      });
      priceLinesRef.current.push(sellWallLine);
    }
  }, [setup, liquidity]);

  return (
    <div className="flex flex-col h-full w-full rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      {/* Timeframe switch toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2 bg-zinc-900/40">
        <div className="flex items-center space-x-1">
          {["15m", "1h", "4h"].map((tf) => (
            <Button
              key={tf}
              variant="ghost"
              size="sm"
              onClick={() => onTfChange(tf)}
              className={`h-7 px-3 text-xs font-medium rounded transition-colors ${
                activeTf === tf
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              {tf}
            </Button>
          ))}
        </div>
        <div className="text-[11px] text-zinc-500 font-mono tracking-tight">
          Bybit Linear Perpetual • {symbol}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative flex-1 min-h-[420px] w-full" ref={containerRef} />
    </div>
  );
}
