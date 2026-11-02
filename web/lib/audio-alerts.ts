/**
 * Audio Synthesizer & Desktop Notification Manager for TradeDesk
 * Generates institutional audio chimes via Web Audio API (zero external assets).
 */

export interface AlertPreferences {
  soundEnabled: boolean;
  volume: number; // 0.1 to 1.0
  desktopAlertsEnabled: boolean;
  notifySetup: boolean;
  notifySweep: boolean;
  notifyNews: boolean;
}

const DEFAULT_PREFERENCES: AlertPreferences = {
  soundEnabled: true,
  volume: 0.5,
  desktopAlertsEnabled: false,
  notifySetup: true,
  notifySweep: true,
  notifyNews: true,
};

const STORAGE_KEY = "tradedesk_alert_preferences";

export function getAlertPreferences(): AlertPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveAlertPreferences(prefs: AlertPreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play Trade Setup Chime (Ascending for BUY, Descending for SELL)
 */
export function playSetupAlert(side: "BUY" | "SELL" = "BUY", customVolume?: number) {
  const prefs = getAlertPreferences();
  if (!prefs.soundEnabled || !prefs.notifySetup) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = customVolume !== undefined ? customVolume : prefs.volume;
  const now = ctx.currentTime;

  if (side === "BUY") {
    // Bullish Harmonic Chime: F5 -> A5 -> C6
    const freqs = [698.46, 880.0, 1046.5];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(vol * 0.35, now + idx * 0.1 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.6);
    });
  } else {
    // Bearish Harmonic Chime: C6 -> Ab5 -> F5
    const freqs = [1046.5, 830.6, 698.46];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(vol * 0.35, now + idx * 0.1 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.6);
    });
  }
}

/**
 * Play SMC Liquidity Sweep Alert (Judas Swing Frequency Sweep)
 */
export function playLiquiditySweepAlert(customVolume?: number) {
  const prefs = getAlertPreferences();
  if (!prefs.soundEnabled || !prefs.notifySweep) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = customVolume !== undefined ? customVolume : prefs.volume;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(1150, now + 0.3);

  gain.gain.setValueAtTime(0.01, now);
  gain.gain.linearRampToValueAtTime(vol * 0.4, now + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.45);
}

/**
 * Play High-Impact Economic News Warning Pulse
 */
export function playNewsWarningAlert(customVolume?: number) {
  const prefs = getAlertPreferences();
  if (!prefs.soundEnabled || !prefs.notifyNews) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = customVolume !== undefined ? customVolume : prefs.volume;
  const now = ctx.currentTime;

  // Double pulse (440Hz -> 523Hz)
  [0, 0.22].forEach((offset, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(idx === 0 ? 440 : 523.25, now + offset);

    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(vol * 0.3, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + offset);
    osc.stop(now + offset + 0.18);
  });
}

/**
 * Desktop Notification Integration (Web Notifications API)
 */
export async function requestDesktopNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    const res = await Notification.requestPermission();
    return res === "granted";
  }
  return false;
}

export function sendDesktopNotification(title: string, body: string, tag?: string) {
  const prefs = getAlertPreferences();
  if (!prefs.desktopAlertsEnabled) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, {
      body,
      tag: tag || "tradedesk-alert",
      icon: "/favicon.ico",
    });
  } catch {
    // Notifications not allowed in insecure contexts
  }
}
