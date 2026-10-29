"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Bot, User, Sparkles, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `👋 **স্বাগতম! আমি আপনার TradeDesk AI Copilot।**\n\nবর্তমানে আমি **${symbol}**-এর প্রতিটি লাইভ প্রাইস মুভমেন্ট, SMC Order Blocks, Fair Value Gaps, লিকুইডিটি পুল এবং আসন্ন ইকোনমিক নিউজ রিয়েল-টাইমে মনিটর করছি।\n\nমার্কেট বা কোনো ট্রেড সেটআপ নিয়ে আপনার যেকোনো প্রশ্ন নিচে করতে পারেন!`,
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
  }, [messages, isOpen]);

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
    { label: "মার্কেট অবস্থা বিশ্লেষণ", prompt: "বর্তমান মার্কেট স্ট্রাকচার, স্কোর ও বায়াস বিশ্লেষণ করে বুঝিয়ে বলো।" },
    { label: "এখন কি ট্রেড নেওয়া নিরাপদ?", prompt: "এখন কি কোনো বাই বা সেল এন্ট্রি নেওয়া ঠিক হবে নাকি অপেক্ষা করব?" },
    { label: "SMC Blocks & FVG", prompt: "বর্তমান চার্টের প্রধান অর্ডার ব্লক (OB) ও ফেয়ার ভ্যালু গ্যাপ (FVG) কোথায় আছে?" },
    { label: "আসন্ন নিউজের ঝুঁকি", prompt: "আজকের আসন্ন ফরেক্স ফ্যাক্টরি নিউজের কী কী ঝুঁকি আছে এবং কত মিনিট বাকি?" },
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

      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-[92vw] sm:w-[430px] h-[600px] max-h-[85vh] rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="p-3.5 px-4 bg-gradient-to-r from-zinc-900 to-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-cyan-400">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-zinc-100 tracking-tight">TradeDesk AI Copilot</span>
                  <Badge variant="outline" className="text-[9px] font-mono text-cyan-300 border-cyan-500/30 bg-cyan-500/10 px-1 py-0">
                    Live Synced
                  </Badge>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  SMC • ICT • News Radar • Exness {symbol}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1">
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
                title="Clear Chat"
                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="p-2 px-3 bg-zinc-950/70 border-b border-zinc-800/60 overflow-x-auto flex space-x-1.5 scrollbar-none">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(qp.prompt)}
                disabled={loading}
                className="px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800/80 transition-colors flex items-center space-x-1"
              >
                <span>💡</span>
                <span>{qp.label}</span>
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-3.5 space-y-3.5 overflow-y-auto text-xs font-sans">
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div key={idx} className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                      isUser
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 border border-zinc-700 text-cyan-300"
                    }`}
                  >
                    {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>

                  <div
                    className={`p-3 rounded-2xl max-w-[85%] text-xs leading-relaxed space-y-1.5 shadow-sm ${
                      isUser
                        ? "bg-blue-600 text-white rounded-tr-none font-medium"
                        : "bg-zinc-900/90 border border-zinc-800 text-zinc-200 rounded-tl-none whitespace-pre-line"
                    }`}
                  >
                    <div className="prose prose-invert max-w-none text-xs">
                      {m.content}
                    </div>
                    <div
                      className={`text-[9px] font-mono text-right ${
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
                <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-400 rounded-tl-none flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="font-mono text-[11px]">মার্কেট ডেটা বিশ্লেষণ করা হচ্ছে...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-zinc-950 border-t border-zinc-800">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="মার্কেট বা ট্রেড নিয়ে প্রশ্ন করুন..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="flex-1 h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/60 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition-all"
              />
              <Button
                size="sm"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="text-[10px] text-zinc-600 text-center mt-1.5 font-mono">
              Powered by Google Gemini Flash • Real-Time SMC & Macro Feed
            </div>
          </div>
        </div>
      )}
    </>
  );
}

