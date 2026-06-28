import React, { Profiler, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import OriginalConfetti, {
  Circle as OriginalCircle,
  Rectangle as OriginalRectangle,
  Triangle as OriginalTriangle
} from "@tholman/confetti";
import BetterConfetti, {
  Circle as BetterCircle,
  Rectangle as BetterRectangle,
  Triangle as BetterTriangle
} from "../src";
import "./styles.css";

type Mode = "side-by-side" | "original" | "better";
type ConfettiStats = {
  mode: Mode;
  total: number;
  frameIntervals: number[];
  longTasks: number[];
  renderCommits: Array<{ id: string; phase: string; actualDuration: number }>;
  startedAt: number;
  stoppedAt?: number;
};

declare global {
  interface Window {
    __CONFETTI_STATS__?: ConfettiStats;
  }
}

const params = new URLSearchParams(window.location.search);
const total = Number(params.get("total") ?? 500);
const mode = (params.get("mode") ?? "side-by-side") as Mode;
const duration = Number(params.get("duration") ?? 12000);

window.__CONFETTI_STATS__ = {
  mode,
  total,
  frameIntervals: [],
  longTasks: [],
  renderCommits: [],
  startedAt: performance.now()
};

function useProfilerStats(activeMode: Mode) {
  useEffect(() => {
    const stats = window.__CONFETTI_STATS__;
    if (!stats) return;
    stats.mode = activeMode;

    let lastFrame = performance.now();
    let raf = requestAnimationFrame(function sample(now) {
      stats.frameIntervals.push(now - lastFrame);
      lastFrame = now;
      raf = requestAnimationFrame(sample);
    });

    const observer =
      "PerformanceObserver" in window
        ? new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              stats.longTasks.push(entry.duration);
            }
          })
        : null;

    try {
      observer?.observe({ type: "longtask", buffered: true });
    } catch {
      observer?.disconnect();
    }

    const stop = window.setTimeout(() => {
      stats.stoppedAt = performance.now();
      cancelAnimationFrame(raf);
      observer?.disconnect();
    }, duration);

    return () => {
      window.clearTimeout(stop);
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [activeMode]);
}

function BetterShapeSet() {
  return useMemo(
    () => [
      <BetterRectangle color="#ef476f" key="rect" />,
      <BetterCircle color="#06d6a0" key="circle" />,
      <BetterTriangle color="#118ab2" key="triangle" />
    ],
    []
  );
}

function OriginalShapeSet() {
  return useMemo(
    () => [
      <OriginalRectangle color="#ef476f" key="rect" />,
      <OriginalCircle color="#06d6a0" key="circle" />,
      <OriginalTriangle color="#118ab2" key="triangle" />
    ],
    []
  );
}

function Panel({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h2>{name}</h2>
      </header>
      <div className="stage">{children}</div>
    </section>
  );
}

function App() {
  const [visible, setVisible] = useState(true);
  const originalShapes = OriginalShapeSet();
  const betterShapes = BetterShapeSet();
  useProfilerStats(mode);

  const onRender = (id: string, phase: "mount" | "update" | "nested-update", actualDuration: number) => {
    window.__CONFETTI_STATS__?.renderCommits.push({ id, phase, actualDuration });
  };

  return (
    <main>
      <nav>
        <strong>better-react-confetti profiler</strong>
        <span>{total} particles</span>
        <button onClick={() => setVisible((value) => !value)}>{visible ? "Pause" : "Resume"}</button>
      </nav>
      <div className={mode === "side-by-side" ? "grid" : "single"}>
        {(mode === "side-by-side" || mode === "original") && (
          <Panel name="@tholman/confetti">
            <Profiler id="original" onRender={onRender}>
              {visible && <OriginalConfetti total={total} Component={originalShapes} />}
            </Profiler>
          </Panel>
        )}
        {(mode === "side-by-side" || mode === "better") && (
          <Panel name="better-react-confetti">
            <Profiler id="better" onRender={onRender}>
              {visible && <BetterConfetti total={total} Component={betterShapes} />}
            </Profiler>
          </Panel>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
