"use client";

import React, { useEffect, useRef } from "react";

interface TradingViewChartProps {
  symbol: string;
  activeTf: string;
}

const TF_MAP: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1D": "D",
};

export default function TradingViewChart({ symbol, activeTf }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Map to exact global spot gold / btc feed
  const tvSymbol = symbol === "XAUUSDT" ? "OANDA:XAUUSD" : "BINANCE:BTCUSDT";
  const interval = TF_MAP[activeTf] || "5";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(11, 14, 20, 1)",
      gridColor: "rgba(255, 255, 255, 0.04)",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [tvSymbol, interval]);

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden rounded-xl bg-[#0B0E14]">
      <div
        ref={containerRef}
        className="tradingview-widget-container w-full h-full"
        style={{ minHeight: "500px" }}
      />
    </div>
  );
}
