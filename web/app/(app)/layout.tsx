import React, { Suspense } from "react";
import Link from "next/link";
import { getHealth } from "@/lib/engine";

export const metadata = {
  title: "TradeDesk — Gold & BTC Trading Dashboard",
  description: "Private trading analysis dashboard for Gold (XAUUSDT) and BTC (BTCUSDT)",
};

async function EngineStatusBadge() {
  try {
    const health = await getHealth();
    if (health.ok) return null;
  } catch {
    // offline
  }

  return (
    <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
      <span>Engine Offline</span>
    </div>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 antialiased selection:bg-zinc-800 selection:text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-base font-bold tracking-tight text-zinc-100">
                TradeDesk
              </span>
            </Link>

            <nav className="hidden md:flex items-center space-x-1 text-sm font-medium">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-md text-zinc-200 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/backtest"
                className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
              >
                Backtest
              </Link>
              <Link
                href="/journal"
                className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
              >
                Journal
              </Link>
            </nav>
          </div>

          <div className="flex items-center space-x-3">
            <Suspense fallback={null}>
              <EngineStatusBadge />
            </Suspense>

            <form action="/api/logout" method="POST">
              <button
                type="submit"
                className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-4 px-4 sm:px-6 text-center text-xs text-zinc-600">
        <p>
          Analysis tool, not financial advice. XAUUSDT is a perpetual, not spot gold.
        </p>
      </footer>
    </div>
  );
}
