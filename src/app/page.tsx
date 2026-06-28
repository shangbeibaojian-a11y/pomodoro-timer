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
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            handleFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current!);
  }, [running, handleFinish]);

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
  const bgColor = isWork ? "#1a1a2e" : "#0f2027";
  const accentColor = isWork ? "#e94560" : "#4ecca3";

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: bgColor,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
      color: "#fff",
      transition: "background-color 0.8s ease",
    }}>
      <div style={{ fontSize: "1.1rem", letterSpacing: "0.2em", color: accentColor, marginBottom: "0.5rem", fontWeight: 600 }}>
        {isWork ? "🍅 作業中" : "☕ 休憩中"}
      </div>

      <div style={{ fontSize: "0.9rem", color: "#aaa", marginBottom: "2.5rem" }}>
        今日の完了セッション: <strong style={{ color: "#fff" }}>{sessions}</strong> 回
      </div>

      <div style={{ position: "relative", width: 240, height: 240, marginBottom: "2.5rem" }}>
        <svg width={240} height={240} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={120} cy={120} r={108} fill="none" stroke="#333" strokeWidth={10} />
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
            setRunning((r) => !r);
          }}
          style={{
            padding: "0.8rem 2.5rem", fontSize: "1.1rem", borderRadius: "2rem",
            border: "none", cursor: "pointer", fontWeight: 700,
            backgroundColor: accentColor, color: "#fff",
          }}
        >
          {running ? "一時停止" : "スタート"}
        </button>
        <button
          onClick={reset}
          style={{
            padding: "0.8rem 1.5rem", fontSize: "1rem", borderRadius: "2rem",
            border: "2px solid #555", cursor: "pointer", fontWeight: 600,
            backgroundColor: "transparent", color: "#ccc",
          }}
        >
          リセット
        </button>
      </div>

      <button
        onClick={() => switchMode(isWork ? "break" : "work", workMinutes, breakMinutes)}
        style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "0.85rem", marginBottom: "2rem" }}
      >
        {isWork ? "→ 休憩へスキップ" : "→ 作業へスキップ"}
      </button>

      <button
        onClick={() => { setTempWork(workMinutes); setTempBreak(breakMinutes); setShowSettings(true); }}
        style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "0.85rem" }}
      >
        ⚙️ 時間を設定
      </button>

      {showSettings && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            backgroundColor: "#1e1e2e", borderRadius: "1rem", padding: "2rem",
            width: 300, display: "flex", flexDirection: "column", gap: "1.2rem",
          }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>時間の設定</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ color: "#aaa", fontSize: "0.85rem" }}>作業時間（分）</span>
              <input
                type="number" min={1} max={99} value={tempWork}
                onChange={(e) => setTempWork(Number(e.target.value))}
                style={{ padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #555", backgroundColor: "#111", color: "#fff", fontSize: "1rem" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ color: "#aaa", fontSize: "0.85rem" }}>休憩時間（分）</span>
              <input
                type="number" min={1} max={99} value={tempBreak}
                onChange={(e) => setTempBreak(Number(e.target.value))}
                style={{ padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #555", backgroundColor: "#111", color: "#fff", fontSize: "1rem" }}
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
                style={{ flex: 1, padding: "0.7rem", borderRadius: "0.5rem", border: "1px solid #555", backgroundColor: "transparent", color: "#ccc", cursor: "pointer" }}
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
