"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  CrosshairMode,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import type { SnapshotData } from "@/lib/engine";
import TradingViewChart from "./TradingViewChart";

interface ChartProps {
  symbol: string;
  activeTf: string;
  onTfChange: (tf: string) => void;
  candles: Array<[number, number, number, number, number, number]>;
  liveCandle?: SnapshotData["candle"] | null;
  setup?: SnapshotData["setup"] | null;
  liquidity?: SnapshotData["liquidity"] | null;
}

const ALL_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1D"];

export default function Chart({
  symbol,
  activeTf,
  onTfChange,
  candles,
  liveCandle,
  setup,
  liquidity,
}: ChartProps) {
  const [chartMode, setChartMode] = useState<"exness" | "quant">("exness");
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!chartWrapperRef.current) return;
    if (!document.fullscreenElement) {
      chartWrapperRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Legend State (OHLCV)
  const [legendData, setLegendData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change: number;
    changePct: number;
  } | null>(null);

  // Fallback / Latest candle for legend
  const latestBarRef = useRef<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // 1. Initialize TradingView / Exness Style Chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0B0E14" },
        textColor: "#9CA3AF",
        fontSize: 11,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.03)" },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(156, 163, 175, 0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E222D",
        },
        horzLine: {
          color: "rgba(156, 163, 175, 0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1E222D",
        },
      },
      timeScale: {
        rightOffset: 14,
        barSpacing: 9,
        minBarSpacing: 2,
        borderColor: "rgba(255, 255, 255, 0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        autoScale: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.22, // leaves bottom 22% for volume histogram
        },
      },
    });

    // Candlestick Series (Official TradingView / Exness palette)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#089981",
      downColor: "#F23645",
      borderUpColor: "#089981",
      borderDownColor: "#F23645",
      wickUpColor: "#089981",
      wickDownColor: "#F23645",
      priceLineVisible: true,
      priceLineColor: "#3B82F6",
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dotted,
    });

    // Volume Histogram (TradingView style overlay at bottom)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "", // overlay scale
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair move listener to update OHLCV Legend
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        // Revert to latest candle
        if (latestBarRef.current) {
          const lb = latestBarRef.current;
          const diff = lb.close - lb.open;
          const pct = lb.open > 0 ? (diff / lb.open) * 100 : 0;
          setLegendData({
            open: lb.open,
            high: lb.high,
            low: lb.low,
            close: lb.close,
            volume: lb.volume,
            change: diff,
            changePct: pct,
          });
        }
        return;
      }

      const cData = param.seriesData.get(candleSeries) as any;
      const vData = param.seriesData.get(volumeSeries) as any;
      if (cData && typeof cData.open === "number") {
        const diff = cData.close - cData.open;
        const pct = cData.open > 0 ? (diff / cData.open) * 100 : 0;
        setLegendData({
          open: cData.open,
          high: cData.high,
          low: cData.low,
          close: cData.close,
          volume: vData?.value ?? 0,
          change: diff,
          changePct: pct,
        });
      }
    });

    // Resize observer
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
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // 2. Set Historical Data whenever candles, symbol, or activeTf changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !candles || candles.length === 0) return;

    const formattedCandlesMap = new Map<number, { time: UTCTimestamp; open: number; high: number; low: number; close: number }>();
    const formattedVolumeMap = new Map<number, { time: UTCTimestamp; value: number; color: string }>();

    for (const c of candles) {
      const timeSec = Math.floor(c[0] / 1000) as UTCTimestamp;
      const o = c[1];
      const h = c[2];
      const l = c[3];
      const cl = c[4];
      const v = c[5];

      formattedCandlesMap.set(timeSec, { time: timeSec, open: o, high: h, low: l, close: cl });
      formattedVolumeMap.set(timeSec, {
        time: timeSec,
        value: v,
        color: cl >= o ? "rgba(8, 153, 129, 0.4)" : "rgba(242, 54, 69, 0.4)",
      });
    }

    const sortedCandles = Array.from(formattedCandlesMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    const sortedVolume = Array.from(formattedVolumeMap.values()).sort((a, b) => (a.time as number) - (b.time as number));

    candleSeriesRef.current.setData(sortedCandles);
    volumeSeriesRef.current.setData(sortedVolume);

    // Update latest bar ref
    if (sortedCandles.length > 0) {
      const last = sortedCandles[sortedCandles.length - 1];
      const lastVol = sortedVolume[sortedVolume.length - 1]?.value ?? 0;
      latestBarRef.current = {
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: lastVol,
      };
      const diff = last.close - last.open;
      const pct = last.open > 0 ? (diff / last.open) * 100 : 0;
      setLegendData({
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: lastVol,
        change: diff,
        changePct: pct,
      });
    }

    // TradingView / Exness style focus: Show the last 45 bars for closer candle perspective
    if (chartRef.current && sortedCandles.length > 0) {
      const fromIdx = Math.max(0, sortedCandles.length - 45);
      const toIdx = sortedCandles.length + 8;
      chartRef.current.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });
    }
  }, [candles, symbol, activeTf]);

  // 3. Dynamic Tick-by-Tick Live Candle Update
  useEffect(() => {
    if (!candleSeriesRef.current || !liveCandle) return;
    if (liveCandle.tf !== activeTf) return;

    try {
      const timeSec = Math.floor(liveCandle.t / 1000) as UTCTimestamp;
      const o = liveCandle.o;
      const h = liveCandle.h;
      const l = liveCandle.l;
      const c = liveCandle.c;
      const v = liveCandle.v;

      // Update candlestick
      candleSeriesRef.current.update({
        time: timeSec,
        open: o,
        high: h,
        low: l,
        close: c,
      });

      // Update volume
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: timeSec,
          value: v,
          color: c >= o ? "rgba(8, 153, 129, 0.4)" : "rgba(242, 54, 69, 0.4)",
        });
      }

      // Update latestBarRef & Legend
      latestBarRef.current = { open: o, high: h, low: l, close: c, volume: v };
      const diff = c - o;
      const pct = o > 0 ? (diff / o) * 100 : 0;
      setLegendData({
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
        change: diff,
        changePct: pct,
      });
    } catch {
      // Ignore sequencing micro-errors
    }
  }, [liveCandle, activeTf]);

  // 4. Update Price Lines (Entry / Stop / Target & Liquidity Walls)
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    for (const line of priceLinesRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch {}
    }
    priceLinesRef.current = [];

    // Active setup lines
    if (setup && (setup.action === "BUY" || setup.action === "SELL")) {
      if (setup.entry > 0) {
        const entryLine = candleSeriesRef.current.createPriceLine({
          price: setup.entry,
          color: "#38bdf8",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "ENTRY",
        });
        priceLinesRef.current.push(entryLine);
      }
      if (setup.sl > 0) {
        const slLine = candleSeriesRef.current.createPriceLine({
          price: setup.sl,
          color: "#ef4444",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "STOP",
        });
        priceLinesRef.current.push(slLine);
      }
      if (setup.tp > 0) {
        const tpLine = candleSeriesRef.current.createPriceLine({
          price: setup.tp,
          color: "#22c55e",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "TARGET",
        });
        priceLinesRef.current.push(tpLine);
      }
    }

    // Liquidity Walls (Dashed Orderbook depth lines)
    if (liquidity?.buyWall?.price) {
      const buyWallLine = candleSeriesRef.current.createPriceLine({
        price: liquidity.buyWall.price,
        color: "rgba(34, 197, 94, 0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `BUY WALL $${liquidity.buyWall.price.toLocaleString()}`,
      });
      priceLinesRef.current.push(buyWallLine);
    }

    if (liquidity?.sellWall?.price) {
      const sellWallLine = candleSeriesRef.current.createPriceLine({
        price: liquidity.sellWall.price,
        color: "rgba(239, 68, 68, 0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SELL WALL $${liquidity.sellWall.price.toLocaleString()}`,
      });
      priceLinesRef.current.push(sellWallLine);
    }
  }, [setup, liquidity]);

  const handleResetZoom = () => {
    if (chartRef.current && candles.length > 0) {
      const fromIdx = Math.max(0, candles.length - 45);
      const toIdx = candles.length + 8;
      chartRef.current.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });
    }
  };

  useEffect(() => {
    if (chartMode === "quant" && containerRef.current && chartRef.current) {
      setTimeout(() => {
        if (!containerRef.current || !chartRef.current) return;
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        if (candles.length > 0) {
          const fromIdx = Math.max(0, candles.length - 45);
          const toIdx = candles.length + 8;
          chartRef.current.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });
        }
      }, 50);
    }
  }, [chartMode, candles.length]);

  const isUp = (legendData?.change ?? 0) >= 0;
  const changeColor = isUp ? "text-[#089981]" : "text-[#F23645]";

  return (
    <div
      ref={chartWrapperRef}
      className={`bg-[#0B0E14] overflow-hidden transition-all ${
        isFullscreen
          ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-none flex flex-col"
          : "flex flex-col h-full w-full rounded-xl border border-zinc-800 shadow-2xl"
      }`}
    >
      {/* Top Toolbar: Timeframes, Mode Switcher & Full Display */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 px-4 py-2.5 bg-[#12161F]/90 gap-2 select-none">
        {/* Left: Timeframe Buttons */}
        <div className="flex items-center space-x-1">
          {ALL_TIMEFRAMES.map((tf) => (
            <Button
              key={tf}
              variant="ghost"
              size="sm"
              onClick={() => onTfChange(tf)}
              className={`h-7 px-2.5 text-xs font-semibold rounded transition-all ${
                activeTf === tf
                  ? "bg-zinc-100 text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
              }`}
            >
              {tf}
            </Button>
          ))}
        </div>

        {/* Center/Right: Feed Mode Switcher & Actions */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => setChartMode("exness")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 ${
                chartMode === "exness"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Official TradingView Spot Gold/BTC feed matching Exness & OANDA"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Exness / OANDA Live</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode("quant")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 ${
                chartMode === "quant"
                  ? "bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Lightweight Charts with local orderbook liquidity depth walls"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>Quant Depth Walls</span>
            </button>
          </div>

          {chartMode === "quant" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              className="h-7 px-2 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 rounded font-medium"
              title="Reset to latest candles"
            >
              Reset View
            </Button>
          )}

          {/* Full Display Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-7 px-2.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/60 rounded flex items-center space-x-1 border border-zinc-800/80 bg-zinc-900/60"
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Full Display Screen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 mr-1 text-amber-400" />
                <span className="text-[11px] font-medium">Exit Full</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                <span className="text-[11px] font-medium">Full Display</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Chart Area with Zero-Layout-Shift Stacking */}
      <div className="relative flex-1 min-h-[460px] w-full overflow-hidden">
        {/* 1. TradingView Exness/OANDA Feed */}
        <div
          className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${
            chartMode === "exness"
              ? "opacity-100 z-10 pointer-events-auto"
              : "opacity-0 pointer-events-none -z-10"
          }`}
        >
          <TradingViewChart symbol={symbol} activeTf={activeTf} />
        </div>

        {/* 2. Bybit Quant Walls Feed */}
        <div
          className={`absolute inset-0 flex flex-col w-full h-full transition-opacity duration-200 ${
            chartMode === "quant"
              ? "opacity-100 z-10 pointer-events-auto"
              : "opacity-0 pointer-events-none -z-10"
          }`}
        >
          {/* TradingView / Exness Style Legend Overlay for Quant Mode */}
          {legendData && (
            <div className="px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono bg-[#0B0E14]/95 border-b border-zinc-900/60 select-none z-10">
              <span className="font-semibold text-zinc-200">
                {symbol} <span className="text-zinc-500 text-[11px] font-normal">({activeTf})</span>
              </span>
              <span className="text-zinc-400">
                O: <span className="text-zinc-200">{legendData.open.toFixed(2)}</span>
              </span>
              <span className="text-zinc-400">
                H: <span className="text-zinc-200">{legendData.high.toFixed(2)}</span>
              </span>
              <span className="text-zinc-400">
                L: <span className="text-zinc-200">{legendData.low.toFixed(2)}</span>
              </span>
              <span className="text-zinc-400">
                C: <span className="text-zinc-200">{legendData.close.toFixed(2)}</span>
              </span>
              <span className={changeColor}>
                {isUp ? "+" : ""}
                {legendData.change.toFixed(2)} ({isUp ? "+" : ""}
                {legendData.changePct.toFixed(2)}%)
              </span>
              {legendData.volume > 0 && (
                <span className="text-zinc-500 text-[11px]">
                  Vol: {legendData.volume > 1000 ? `${(legendData.volume / 1000).toFixed(1)}K` : legendData.volume.toFixed(1)}
                </span>
              )}
            </div>
          )}

          {/* Chart Canvas */}
          <div className="relative flex-1 min-h-[440px] w-full" ref={containerRef} />
        </div>
      </div>
    </div>
  );
}
