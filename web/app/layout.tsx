import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "TradeDesk — Gold & BTC Trading Dashboard",
  description: "Private, fast, clean trading analysis dashboard for Gold (XAUUSDT) and BTC (BTCUSDT)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} h-full antialiased`}>
      <body className={`${inter.className} min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans`}>
        {children}
      </body>
    </html>
  );
}
