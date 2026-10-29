"use client";

import { useEffect, useState, useRef } from "react";
import type { SnapshotData } from "./engine";

interface UseLiveOptions {
  symbol: string;
  tf: string;
  initialSnapshot?: SnapshotData | null;
}

export function useLive({ symbol, tf, initialSnapshot = null }: UseLiveOptions) {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(initialSnapshot);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const esRef = useRef<EventSource | null>(null);

  // Sync initialSnapshot when symbol or page props change
  useEffect(() => {
    if (initialSnapshot) {
      setSnapshot(initialSnapshot);
    }
  }, [initialSnapshot]);

  useEffect(() => {
    let active = true;
    const url = `/api/stream?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (active) setConnected(true);
    };

    const handleData = (event: MessageEvent) => {
      if (!active) return;
      try {
        const data = JSON.parse(event.data);
        setSnapshot(data);
        setLastUpdate(Date.now());
        setConnected(true);
      } catch (err) {
        console.error("Failed to parse SSE snapshot:", err);
      }
    };

    es.addEventListener("snapshot", handleData);
    es.onmessage = handleData;

    es.onerror = () => {
      if (active) setConnected(false);
    };

    // Fast 2-second fallback polling to guarantee real-time sync with chart
    const pollInterval = setInterval(async () => {
      if (!active) return;
      try {
        const res = await fetch(`/api/snapshot?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`);
        if (res.ok) {
          const freshData = await res.json();
          setSnapshot(freshData);
          setLastUpdate(Date.now());
          setConnected(true);
        }
      } catch {
        // silent fallback
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
      es.close();
      esRef.current = null;
    };
  }, [symbol, tf]);

  return { snapshot, connected, lastUpdate };
}
