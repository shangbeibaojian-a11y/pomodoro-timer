"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Mode = "work" | "break";

const DEFAULT_WORK = 25;
const DEFAULT_BREAK = 5;

function playBeep(ctx: AudioContext, frequency: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

function playNotification(ctx: AudioContext) {
  playBeep(ctx, 880, 0.3);
  setTimeout(() => playBeep(ctx, 660, 0.5), 350);
}

export default function PomodoroTimer() {
  const [workMinutes, setWorkMinutes] = useState(DEFAULT_WORK);
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK);
  const [mode, setMode] = useState<Mode>("work");
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_WORK * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [tempWork, setTempWork] = useState(DEFAULT_WORK);
  const [tempBreak, setTempBreak] = useState(DEFAULT_BREAK);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      // 端末が非対応／許可されない場合は無視（時刻ベース計算でズレは防げる）
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // ignore
    }
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    const savedDate = localStorage.getItem("pomodoro-sessions-date");
    const today = new Date().toDateString();
    if (savedDate === today) {
      setSessions(Number(localStorage.getItem("pomodoro-sessions") || "0"));
    } else {
      localStorage.setItem("pomodoro-sessions-date", today);
      localStorage.setItem("pomodoro-sessions", "0");
    }
  }, []);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const switchMode = useCallback((nextMode: Mode, wMin: number, bMin: number) => {
    setMode(nextMode);
    setSecondsLeft((nextMode === "work" ? wMin : bMin) * 60);
    setRunning(false);
  }, []);

  const handleFinish = useCallback(() => {
    playNotification(getAudioCtx());
    if (mode === "work") {
      setSessions((prev) => {
        const next = prev + 1;
        localStorage.setItem("pomodoro-sessions", String(next));
        return next;
      });
      switchMode("break", workMinutes, breakMinutes);
    } else {
      switchMode("work", workMinutes, breakMinutes);
    }
  }, [mode, workMinutes, breakMinutes, getAudioCtx, switchMode]);

  useEffect(() => {
    if (!running) return;

    // 経過時間は「終了予定時刻 − 現在時刻」で計算する。
    // こうすると画面ロックでタイマーが一時停止しても、復帰時に正しい残り時間に戻る。
    const tick = () => {
      const remaining = Math.max(0, Math.round((endTimeRef.current! - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        handleFinish();
      }
    };

    acquireWakeLock();
    tick();
    intervalRef.current = setInterval(tick, 250);

    // 画面復帰時に即座に再計算し、画面ロックも取り直す
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalRef.current!);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      releaseWakeLock();
    };
  }, [running, handleFinish, acquireWakeLock, releaseWakeLock]);

  const reset = () => {
    clearInterval(intervalRef.current!);
    setRunning(false);
    setSecondsLeft((mode === "work" ? workMinutes : breakMinutes) * 60);
  };

  const applySettings = () => {
    setWorkMinutes(tempWork);
    setBreakMinutes(tempBreak);
    setMode("work");
    setSecondsLeft(tempWork * 60);
    setRunning(false);
    setShowSettings(false);
  };

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");
  const total = (mode === "work" ? workMinutes : breakMinutes) * 60;
  const progress = ((total - secondsLeft) / total) * 100;

  const isWork = mode === "work";
  const bgColor = isWork ? "#eef6ec" : "#e6f2ed";
  const accentColor = isWork ? "#7fb583" : "#6fb8a3";
  const textColor = "#4a5d4a";
  const subTextColor = "#8a9a8a";

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: bgColor,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
      color: textColor,
      transition: "background-color 0.8s ease",
    }}>
      <div style={{ fontSize: "1.1rem", letterSpacing: "0.2em", color: accentColor, marginBottom: "0.5rem", fontWeight: 600 }}>
        {isWork ? "🌱 作業中" : "🍵 休憩中"}
      </div>

      <div style={{ fontSize: "0.9rem", color: subTextColor, marginBottom: "2.5rem" }}>
        今日の完了セッション: <strong style={{ color: textColor }}>{sessions}</strong> 回
      </div>

      <div style={{ position: "relative", width: 240, height: 240, marginBottom: "2.5rem" }}>
        <svg width={240} height={240} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={120} cy={120} r={108} fill="none" stroke="#d8e8d6" strokeWidth={10} />
          <circle
            cx={120} cy={120} r={108} fill="none"
            stroke={accentColor} strokeWidth={10}
            strokeDasharray={`${2 * Math.PI * 108}`}
            strokeDashoffset={`${2 * Math.PI * 108 * (1 - progress / 100)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.8s ease" }}
          />
        </svg>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "3.5rem", fontWeight: 700, letterSpacing: "0.05em",
        }}>
          {minutes}:{seconds}
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        <button
          onClick={() => {
            getAudioCtx();
            setRunning((r) => {
              const next = !r;
              if (next) {
                // スタート／再開時に終了予定時刻を記録
                endTimeRef.current = Date.now() + secondsLeft * 1000;
              }
              return next;
            });
          }}
          style={{
            padding: "0.8rem 2.5rem", fontSize: "1.1rem", borderRadius: "2rem",
            border: "none", cursor: "pointer", fontWeight: 700,
            backgroundColor: accentColor, color: "#fff",
            boxShadow: "0 4px 12px rgba(127, 181, 131, 0.3)",
          }}
        >
          {running ? "一時停止" : "スタート"}
        </button>
        <button
          onClick={reset}
          style={{
            padding: "0.8rem 1.5rem", fontSize: "1rem", borderRadius: "2rem",
            border: `2px solid ${accentColor}`, cursor: "pointer", fontWeight: 600,
            backgroundColor: "transparent", color: accentColor,
          }}
        >
          リセット
        </button>
      </div>

      <button
        onClick={() => switchMode(isWork ? "break" : "work", workMinutes, breakMinutes)}
        style={{ background: "none", border: "none", color: subTextColor, cursor: "pointer", fontSize: "0.85rem", marginBottom: "2rem" }}
      >
        {isWork ? "→ 休憩へスキップ" : "→ 作業へスキップ"}
      </button>

      <button
        onClick={() => { setTempWork(workMinutes); setTempBreak(breakMinutes); setShowSettings(true); }}
        style={{ background: "none", border: "none", color: subTextColor, cursor: "pointer", fontSize: "0.85rem" }}
      >
        ⚙️ 時間を設定
      </button>

      {showSettings && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "rgba(74, 93, 74, 0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            backgroundColor: "#ffffff", borderRadius: "1.2rem", padding: "2rem",
            width: 300, display: "flex", flexDirection: "column", gap: "1.2rem",
            boxShadow: "0 8px 30px rgba(74, 93, 74, 0.2)",
          }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: textColor }}>時間の設定</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ color: subTextColor, fontSize: "0.85rem" }}>作業時間（分）</span>
              <input
                type="number" min={1} max={99} value={tempWork}
                onChange={(e) => setTempWork(Number(e.target.value))}
                style={{ padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #cfe0cd", backgroundColor: "#f7faf6", color: textColor, fontSize: "1rem" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ color: subTextColor, fontSize: "0.85rem" }}>休憩時間（分）</span>
              <input
                type="number" min={1} max={99} value={tempBreak}
                onChange={(e) => setTempBreak(Number(e.target.value))}
                style={{ padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #cfe0cd", backgroundColor: "#f7faf6", color: textColor, fontSize: "1rem" }}
              />
            </label>
            <div style={{ display: "flex", gap: "0.8rem" }}>
              <button
                onClick={applySettings}
                style={{ flex: 1, padding: "0.7rem", borderRadius: "0.5rem", border: "none", backgroundColor: accentColor, color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                適用
              </button>
              <button
                onClick={() => setShowSettings(false)}
                style={{ flex: 1, padding: "0.7rem", borderRadius: "0.5rem", border: "1px solid #cfe0cd", backgroundColor: "transparent", color: subTextColor, cursor: "pointer" }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
