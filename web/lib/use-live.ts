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

  useEffect(() => {
    let active = true;
    const url = `/api/stream?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (active) setConnected(true);
    };

    es.addEventListener("snapshot", (event) => {
      if (!active) return;
      try {
        const data = JSON.parse(event.data);
        setSnapshot(data);
        setLastUpdate(Date.now());
        setConnected(true);
      } catch (err) {
        console.error("Failed to parse SSE snapshot:", err);
      }
    });

    es.onerror = () => {
      if (active) setConnected(false);
    };

    return () => {
      active = false;
      es.close();
      esRef.current = null;
    };
  }, [symbol, tf]);

  return { snapshot, connected, lastUpdate };
}
