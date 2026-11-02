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
import { getSymbolConfig, formatPriceWithUnit, formatSymbolPrice } from "@/lib/formatters";

interface ChartProps {
  symbol: string;
  activeTf: string;
  onTfChange: (tf: string) => void;
  candles: Array<[number, number, number, number, number, number]>;
  liveCandle?: SnapshotData["candle"] | null;
  setup?: SnapshotData["setup"] | null;
  liquidity?: SnapshotData["liquidity"] | null;
  smc?: SnapshotData["smc"] | null;
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
  smc,
}: ChartProps) {
  const [chartMode, setChartMode] = useState<"exness" | "quant">("quant");
  const [showSmcZones, setShowSmcZones] = useState<boolean>(true);
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

    // Apply accurate decimal precision for this symbol
    const symConfig = getSymbolConfig(symbol);
    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: "price",
        precision: symConfig.decimals,
        minMove: Math.pow(10, -symConfig.decimals),
      },
    });

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

  // 4. Update Price Lines (Entry / Stop / Target, SMC Order Blocks, FVG & Liquidity Pools)
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    for (const line of priceLinesRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch {}
    }
    priceLinesRef.current = [];

    // Helper for currency-aware price labels
    const fmtP = (p: number) => formatPriceWithUnit(p, symbol);

    // 4A. Active Setup Trade Lines (Entry, SL, TP)
    if (setup && (setup.action === "BUY" || setup.action === "SELL")) {
      if (setup.entry > 0) {
        const entryLine = candleSeriesRef.current.createPriceLine({
          price: setup.entry,
          color: "#38bdf8",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `ENTRY ${fmtP(setup.entry)}`,
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
          title: `STOP LOSS ${fmtP(setup.sl)}`,
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
          title: `TARGET TP ${fmtP(setup.tp)}`,
        });
        priceLinesRef.current.push(tpLine);
      }
    }

    // 4B. SMC / ICT Overlays (Order Blocks, FVGs, Liquidity Pools & Equilibrium)
    if (showSmcZones && smc) {
      // 1. Bullish Order Block (Demand Zone)
      const bullOB = smc.orderBlocks?.bullishOB;
      if (bullOB && bullOB.top > 0) {
        const bullObTop = candleSeriesRef.current.createPriceLine({
          price: bullOB.top,
          color: "#10b981", // Emerald-500
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🟢 DEMAND OB TOP ${fmtP(bullOB.top)}`,
        });
        priceLinesRef.current.push(bullObTop);

        if (bullOB.bottom > 0 && Math.abs(bullOB.bottom - bullOB.top) > 0.0001) {
          const bullObBase = candleSeriesRef.current.createPriceLine({
            price: bullOB.bottom,
            color: "#059669", // Emerald-600
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `🟢 DEMAND OB BASE ${fmtP(bullOB.bottom)}`,
          });
          priceLinesRef.current.push(bullObBase);
        }
      }

      // 2. Bearish Order Block (Supply Zone)
      const bearOB = smc.orderBlocks?.bearishOB;
      if (bearOB && bearOB.bottom > 0) {
        const bearObBottom = candleSeriesRef.current.createPriceLine({
          price: bearOB.bottom,
          color: "#f43f5e", // Rose-500
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🔴 SUPPLY OB BASE ${fmtP(bearOB.bottom)}`,
        });
        priceLinesRef.current.push(bearObBottom);

        if (bearOB.top > 0 && Math.abs(bearOB.top - bearOB.bottom) > 0.0001) {
          const bearObTop = candleSeriesRef.current.createPriceLine({
            price: bearOB.top,
            color: "#e11d48", // Rose-600
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `🔴 SUPPLY OB TOP ${fmtP(bearOB.top)}`,
          });
          priceLinesRef.current.push(bearObTop);
        }
      }

      // 3. Buy-Side Liquidity Pool (BSL / Equal Highs)
      const bsl = smc.liquidity?.bsl;
      if (bsl && bsl.level > 0) {
        const bslLine = candleSeriesRef.current.createPriceLine({
          price: bsl.level,
          color: "#f59e0b", // Amber-500
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `🎯 BSL LIQUIDITY ${fmtP(bsl.level)}`,
        });
        priceLinesRef.current.push(bslLine);
      }

      // 4. Sell-Side Liquidity Pool (SSL / Equal Lows)
      const ssl = smc.liquidity?.ssl;
      if (ssl && ssl.level > 0) {
        const sslLine = candleSeriesRef.current.createPriceLine({
          price: ssl.level,
          color: "#a855f7", // Purple-500
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `🎯 SSL LIQUIDITY ${fmtP(ssl.level)}`,
        });
        priceLinesRef.current.push(sslLine);
      }

      // 5. Fair Value Gaps (FVG)
      const bullFVG = smc.orderBlocks?.nearestBullishFVG;
      if (bullFVG && bullFVG.top > 0 && !bullFVG.mitigated) {
        const fvgMid = (bullFVG.top + bullFVG.bottom) / 2;
        const bullFvgLine = candleSeriesRef.current.createPriceLine({
          price: fvgMid,
          color: "#06b6d4", // Cyan-500
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `🟩 BULLISH FVG ${fmtP(bullFVG.bottom)}-${fmtP(bullFVG.top)}`,
        });
        priceLinesRef.current.push(bullFvgLine);
      }

      const bearFVG = smc.orderBlocks?.nearestBearishFVG;
      if (bearFVG && bearFVG.bottom > 0 && !bearFVG.mitigated) {
        const fvgMid = (bearFVG.top + bearFVG.bottom) / 2;
        const bearFvgLine = candleSeriesRef.current.createPriceLine({
          price: fvgMid,
          color: "#fb923c", // Orange-400
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `🟥 BEARISH FVG ${fmtP(bearFVG.bottom)}-${fmtP(bearFVG.top)}`,
        });
        priceLinesRef.current.push(bearFvgLine);
      }

      // 6. 50% Equilibrium & OTE Fib Zone
      const pd = smc.pdArray;
      if (pd && pd.equilibrium > 0) {
        const eqLine = candleSeriesRef.current.createPriceLine({
          price: pd.equilibrium,
          color: "rgba(148, 163, 184, 0.7)", // Slate-400
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `⚖️ 50% EQUILIBRIUM ${fmtP(pd.equilibrium)}`,
        });
        priceLinesRef.current.push(eqLine);
      }

      if (pd?.oteLong && pd.oteLong.top > 0 && pd.oteLong.bottom > 0) {
        const oteMid = (pd.oteLong.top + pd.oteLong.bottom) / 2;
        const oteLine = candleSeriesRef.current.createPriceLine({
          price: oteMid,
          color: "#38bdf8", // Sky-400
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `⚡ OTE FIB 62-79% ${fmtP(pd.oteLong.bottom)}-${fmtP(pd.oteLong.top)}`,
        });
        priceLinesRef.current.push(oteLine);
      }
    }

    // 4C. Liquidity Walls (Orderbook Depth Walls)
    if (liquidity?.buyWall?.price) {
      const buyWallLine = candleSeriesRef.current.createPriceLine({
        price: liquidity.buyWall.price,
        color: "rgba(34, 197, 94, 0.5)",
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
        color: "rgba(239, 68, 68, 0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SELL WALL $${liquidity.sellWall.price.toLocaleString()}`,
      });
      priceLinesRef.current.push(sellWallLine);
    }
  }, [setup, liquidity, smc, showSmcZones]);

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

        {/* Center/Right: Feed Mode Switcher, SMC Toggle & Actions */}
        <div className="flex items-center space-x-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => setChartMode("quant")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                chartMode === "quant"
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Lightweight Charts with live SMC Order Blocks, FVGs & Liquidity Pools"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>SMC Quant Chart</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode("exness")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                chartMode === "exness"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Official TradingView Spot Gold/BTC feed matching Exness & OANDA"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>TradingView Live</span>
            </button>
          </div>

          {/* SMC Zones Toggle (Visible in Quant mode) */}
          {chartMode === "quant" && (
            <button
              type="button"
              onClick={() => setShowSmcZones(!showSmcZones)}
              className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 border cursor-pointer ${
                showSmcZones
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                  : "bg-zinc-900/60 text-zinc-500 border-zinc-800 hover:text-zinc-300"
              }`}
              title="Toggle Order Blocks, FVGs, BSL/SSL & Equilibrium lines directly on chart"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${showSmcZones ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
              <span>SMC Zones {showSmcZones ? "ON" : "OFF"}</span>
            </button>
          )}

          {chartMode === "quant" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              className="h-7 px-2 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 rounded font-medium cursor-pointer"
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
                O: <span className="text-zinc-200">{formatSymbolPrice(legendData.open, symbol)}</span>
              </span>
              <span className="text-zinc-400">
                H: <span className="text-zinc-200">{formatSymbolPrice(legendData.high, symbol)}</span>
              </span>
              <span className="text-zinc-400">
                L: <span className="text-zinc-200">{formatSymbolPrice(legendData.low, symbol)}</span>
              </span>
              <span className="text-zinc-400">
                C: <span className="text-zinc-200">{formatSymbolPrice(legendData.close, symbol)}</span>
              </span>
              <span className={changeColor}>
                {isUp ? "+" : ""}
                {formatSymbolPrice(legendData.change, symbol)} ({isUp ? "+" : ""}
                {legendData.changePct.toFixed(2)}%)
              </span>
              {legendData.volume > 0 && (
                <span className="text-zinc-500 text-[11px]">
                  Vol: {legendData.volume > 1000 ? `${(legendData.volume / 1000).toFixed(1)}K` : legendData.volume.toFixed(1)}
                </span>
              )}
            </div>
          )}

          {/* Chart Canvas & On-Chart Overlays */}
          <div className="relative flex-1 min-h-[440px] w-full overflow-hidden" ref={containerRef}>
            {/* On-Chart Live SMC HUD (Top-Left) */}
            {showSmcZones && smc && (
              <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none flex flex-col gap-1 max-w-[340px] select-none text-[11px] font-mono">
                {/* Structure & Zone Badge */}
                <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                  <span
                    className={`px-2 py-0.5 rounded font-bold shadow-sm backdrop-blur-md border ${
                      smc.structure?.trend === "BULLISH"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : smc.structure?.trend === "BEARISH"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        : "bg-zinc-800/80 text-zinc-300 border-zinc-700/60"
                    }`}
                  >
                    {smc.structure?.trend === "BULLISH"
                      ? "🟢 BULLISH"
                      : smc.structure?.trend === "BEARISH"
                      ? "🔴 BEARISH"
                      : "⚪ NEUTRAL"}{" "}
                    {smc.structure?.bos?.broken ? "• BOS ACTIVE" : ""}
                  </span>

                  {smc.pdArray?.zone && (
                    <span
                      className={`px-2 py-0.5 rounded font-semibold backdrop-blur-md border ${
                        smc.pdArray.zone === "DISCOUNT"
                          ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/60"
                          : smc.pdArray.zone === "PREMIUM"
                          ? "bg-rose-950/60 text-rose-400 border-rose-800/60"
                          : "bg-zinc-900/80 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      {smc.pdArray.zone} ({smc.pdArray.currentPercent}%)
                    </span>
                  )}
                </div>

                {/* Key Levels Pill Bar */}
                <div className="p-1.5 px-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-md space-y-0.5 text-[10px] text-zinc-300 shadow-lg pointer-events-auto">
                  {smc.orderBlocks?.bullishOB?.top > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Demand OB:
                      </span>
                      <span className="font-mono text-zinc-200">
                        {formatPriceWithUnit(smc.orderBlocks.bullishOB.bottom, symbol)} - {formatPriceWithUnit(smc.orderBlocks.bullishOB.top, symbol)}
                      </span>
                    </div>
                  )}

                  {smc.orderBlocks?.bearishOB?.bottom > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-rose-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        Supply OB:
                      </span>
                      <span className="font-mono text-zinc-200">
                        {formatPriceWithUnit(smc.orderBlocks.bearishOB.bottom, symbol)} - {formatPriceWithUnit(smc.orderBlocks.bearishOB.top, symbol)}
                      </span>
                    </div>
                  )}

                  {(smc.liquidity?.bsl?.level > 0 || smc.liquidity?.ssl?.level > 0) && (
                    <div className="flex items-center justify-between gap-3 pt-0.5 border-t border-zinc-800/60">
                      <span className="text-amber-400 font-medium">🎯 Liquidity:</span>
                      <span className="font-mono text-zinc-300">
                        BSL {smc.liquidity?.bsl?.level ? formatPriceWithUnit(smc.liquidity.bsl.level, symbol) : "--"} • SSL {smc.liquidity?.ssl?.level ? formatPriceWithUnit(smc.liquidity.ssl.level, symbol) : "--"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bottom-Left Mini Legend Color Key */}
            {showSmcZones && smc && (
              <div className="absolute bottom-2 left-2 z-10 pointer-events-none flex items-center gap-2 px-2 py-1 rounded bg-[#0B0E14]/90 border border-zinc-800/80 backdrop-blur text-[9px] font-mono text-zinc-400 select-none hidden sm:flex">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Demand
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Supply
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> BSL
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1 text-purple-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> SSL
                </span>
                <span className="text-zinc-600">•</span>
                <span className="flex items-center gap-1 text-cyan-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> FVG
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
