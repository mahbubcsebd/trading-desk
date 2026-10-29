"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  TrendingUp,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AiCopilotProps {
  symbol: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
}

export default function AiCopilot({ symbol }: AiCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `👋 **স্বাগতম! আমি আপনার TradeDesk AI Copilot।**

বর্তমানে আমি **${symbol}**-এর প্রতিটি লাইভ প্রাইস মুভমেন্ট, **SMC Order Blocks**, **Fair Value Gaps (FVG)**, **Liquidity Pools** এবং আসন্ন ইকোনমিক ক্যালেন্ডার রিয়েল-টাইমে ট্র্যাক করছি।

💡 *আমি আপনাকে শুধুমাত্র অপেক্ষার কথা বলব না—বুলিশ ও বিয়ারিশ উভয় দিকের এক্স্যাক্ট এন্ট্রি, স্টপলস এবং টার্গেটসহ ক্লিয়ার রোডম্যাপ তৈরি করে দেব।* 

নিচের কুইক প্রম্পট ক্লিক করতে পারেন অথবা সরাসরি প্রশ্ন করুন!`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isExpanded]);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: textToSend,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          symbol,
          history: messages.slice(-5).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      const replyMsg: ChatMessage = {
        role: "assistant",
        content: data.reply || "দুঃখিত, কোনো উত্তর পাওয়া যায়নি।",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ সার্ভার এরর: ${err?.message || "মেসেজ পাঠানো সম্ভব হয়নি"}।`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = [
    { label: "🎯 আজকের ফুল ট্রেড প্ল্যান (Buy & Sell Roadmap)", prompt: "বর্তমান মার্কেট অনুযায়ী বুলিশ ও বিয়ারিশ উভয় দিকের এক্স্যাক্ট এন্ট্রি, স্টপলস এবং টার্গেট রোডম্যাপ দাও।" },
    { label: "📊 মার্কেট স্ট্রাকচার ও প্রধান লেভেল", prompt: "বর্তমান মার্কেট স্ট্রাকচার, বায়াস এবং কি-লেভেলগুলো বিশ্লেষণ করে বুঝিয়ে বলো।" },
    { label: "🏛️ SMC Order Block ও Liquidity জোন", prompt: "বর্তমান চার্টের প্রধান বুলিশ/বিয়ারিশ অর্ডার ব্লক এবং লিকুইডিটি পুল (BSL/SSL) কোথায় আছে?" },
    { label: "⚡ আসন্ন নিউজ ও DXY ডলার প্রভাব", prompt: "আসন্ন ফরেক্স ফ্যাক্টরি নিউজ এবং DXY ডলার ইনডেক্সের মুভমেন্ট গোল্ড/ক্রিপ্টোতে কী প্রভাব ফেলবে?" },
    { label: "🛡️ ১% রিস্ক অনুযায়ী লট সাইজ", prompt: "আমার বর্তমান ব্যালেন্স অনুযায়ী আজকের ট্রেডে এক্সনেস রিকমেন্ডেড লট সাইজ ও রিস্ক কত রাখা উচিত?" },
  ];

  return (
    <>
      {/* Floating Trigger Pill (Bottom Right) */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50">
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center space-x-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-[0_0_20px_rgba(37,99,235,0.45)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-100"></span>
            </span>
            <Sparkles className="w-4 h-4 text-cyan-200 animate-spin-slow" />
            <span className="tracking-wide font-sans">TradeDesk AI Copilot</span>
            <Badge variant="outline" className="text-[9px] font-mono uppercase bg-white/10 text-cyan-200 border-white/20 px-1.5 py-0">
              {symbol}
            </Badge>
          </button>
        </div>
      )}

      {/* Floating Chat Window with Resize Support */}
      {isOpen && (
        <div
          className={`fixed z-50 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded
              ? "bottom-2 right-2 sm:bottom-5 sm:right-5 w-[96vw] sm:w-[860px] md:w-[940px] h-[90vh] max-h-[94vh]"
              : "bottom-4 right-4 sm:bottom-5 sm:right-5 w-[94vw] sm:w-[480px] h-[640px] max-h-[86vh]"
          }`}
        >
          {/* Header */}
          <div className="p-3.5 px-4 bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-cyan-400">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-zinc-100 tracking-tight">TradeDesk AI Copilot</span>
                  <Badge variant="outline" className="text-[9px] font-mono text-cyan-300 border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0">
                    Live SMC Synced
                  </Badge>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  Order Blocks • FVG • News Radar • Exness {symbol}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {/* Maximize / Restore Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "ছোট উইন্ডোতে ফিরুন (Restore)" : "বড় উইন্ডো করুন (Maximize)"}
                className="h-7 w-7 p-0 text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 rounded-md transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>

              {/* Clear Chat */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setMessages([
                    {
                      role: "assistant",
                      content: `🔄 **চ্যাট ক্লিয়ার করা হয়েছে।**\n\nবর্তমান **${symbol}** মার্কেট সম্পর্কে আপনি কী জানতে চান?`,
                      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    },
                  ])
                }
                title="চ্যাট হিস্ট্রি ক্লিয়ার করুন"
                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>

              {/* Close Window */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="p-2 px-3 bg-zinc-950/80 border-b border-zinc-800/60 overflow-x-auto flex space-x-1.5 scrollbar-thin scrollbar-thumb-zinc-800 shrink-0">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(qp.prompt)}
                disabled={loading}
                className="px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 border border-zinc-800 hover:border-cyan-500/30 transition-all flex items-center space-x-1 cursor-pointer"
              >
                <span>{qp.label}</span>
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-3.5 sm:p-4 space-y-4 overflow-y-auto text-xs font-sans scrollbar-thin scrollbar-thumb-zinc-800">
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div key={idx} className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] mt-0.5 ${
                      isUser
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 border border-zinc-700 text-cyan-300"
                    }`}
                  >
                    {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>

                  <div
                    className={`p-3.5 rounded-2xl ${
                      isExpanded ? "max-w-[90%]" : "max-w-[88%]"
                    } text-xs leading-relaxed shadow-sm ${
                      isUser
                        ? "bg-blue-600 text-white rounded-tr-none font-medium"
                        : "bg-zinc-900/90 border border-zinc-800/80 text-zinc-200 rounded-tl-none shadow-black/40"
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : (
                      <div className="prose prose-invert max-w-none text-xs">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => (
                              <h1 className="text-sm font-bold text-cyan-300 mt-2 mb-1 flex items-center gap-1.5 border-b border-zinc-800 pb-1">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-xs font-bold text-zinc-100 mt-2.5 mb-1 flex items-center gap-1.5">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-xs font-semibold text-amber-300 mt-2 mb-1 flex items-center gap-1.5">
                                {children}
                              </h3>
                            ),
                            p: ({ children }) => (
                              <p className="text-xs text-zinc-300 leading-relaxed my-1.5">{children}</p>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc pl-4 space-y-1 my-1.5 text-zinc-300">{children}</ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal pl-4 space-y-1 my-1.5 text-zinc-300">{children}</ol>
                            ),
                            li: ({ children }) => (
                              <li className="text-xs text-zinc-300 leading-relaxed">{children}</li>
                            ),
                            strong: ({ children }) => (
                              <strong className="text-zinc-100 font-semibold">{children}</strong>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-2 border-cyan-500 bg-cyan-950/25 pl-2.5 py-1 my-2 rounded-r text-zinc-300 text-xs">
                                {children}
                              </blockquote>
                            ),
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2 border border-zinc-800 rounded-lg">
                                <table className="w-full text-left border-collapse text-[11px]">{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => (
                              <thead className="bg-zinc-800/90 text-zinc-200 border-b border-zinc-700">
                                {children}
                              </thead>
                            ),
                            th: ({ children }) => (
                              <th className="p-1.5 px-2 font-semibold text-zinc-300">{children}</th>
                            ),
                            td: ({ children }) => (
                              <td className="p-1.5 px-2 border-b border-zinc-800/60 font-mono text-zinc-300">
                                {children}
                              </td>
                            ),
                            code: ({ children, className }) => {
                              const isBlock = className?.includes("language-");
                              return isBlock ? (
                                <pre className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg overflow-x-auto my-2 font-mono text-[11px] text-zinc-300">
                                  <code>{children}</code>
                                </pre>
                              ) : (
                                <code className="bg-zinc-800/90 text-cyan-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-zinc-700/60">
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    <div
                      className={`text-[9px] font-mono text-right mt-1.5 ${
                        isUser ? "text-blue-200" : "text-zinc-500"
                      }`}
                    >
                      {m.time}
                    </div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-start gap-2.5">
                <div className="h-6 w-6 rounded-full bg-zinc-800 border border-zinc-700 text-cyan-300 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 animate-pulse" />
                </div>
                <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-400 rounded-tl-none flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="font-mono text-[11px] text-zinc-300">
                    SMC চার্ট ও ফরেক্স ফ্যাক্টরি নিউজ থেকে ফুল রোডম্যাপ তৈরি করা হচ্ছে...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-zinc-950 border-t border-zinc-800 shrink-0">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="যেমন: আজকের গোল্ডের বাই ও সেল রোডম্যাপ কি কি লেভেলে আছে?..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-cyan-500/50 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-colors"
              />
              <Button
                size="sm"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-3 h-8 text-xs font-semibold cursor-pointer disabled:opacity-40 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="mt-1.5 text-[10px] text-zinc-500 flex items-center justify-between px-1">
              <span>Enter চেপে মেসেজ পাঠান</span>
              <span className="font-mono text-zinc-500">Exness 1% Risk Engine</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
