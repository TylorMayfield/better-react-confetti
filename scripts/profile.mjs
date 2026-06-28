import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4173;
const TOTAL = Number(process.env.CONFETTI_TOTAL ?? 700);
const DURATION = Number(process.env.CONFETTI_DURATION ?? 12000);
const ROOT = new URL("..", import.meta.url);
const baseUrl = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await wait(250);
    }
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const sum = samples.reduce((value, item) => value + item, 0);
  return {
    avg: samples.length ? sum / samples.length : 0,
    p95: quantile(0.95),
    max: sorted.at(-1) ?? 0
  };
}

async function profileMode(browser, mode) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  await page.goto(`${baseUrl}/?mode=${mode}&total=${TOTAL}&duration=${DURATION}`, {
    waitUntil: "networkidle"
  });

  await page.waitForTimeout(DURATION + 800);

  const stats = await page.evaluate(() => window.__CONFETTI_STATS__);
  const domNodes = await page.evaluate(() => document.querySelectorAll("*").length);
  const canvasCount = await page.evaluate(() => document.querySelectorAll("canvas").length);
  const confettiDomNodes = await page.evaluate(() => document.querySelectorAll("[class*='confetti']").length);
  const metrics = await client.send("Performance.getMetrics");
  await page.screenshot({ path: `results/${mode}.png`, fullPage: true });
  await page.close();

  const metricMap = Object.fromEntries(metrics.metrics.map((metric) => [metric.name, metric.value]));
  const frames = stats?.frameIntervals ?? [];
  const longTasks = stats?.longTasks ?? [];
  const renderCommits = stats?.renderCommits ?? [];
  const frameSummary = summarize(frames.slice(5));

  return {
    mode,
    total: TOTAL,
    durationMs: DURATION,
    domNodes,
    confettiDomNodes,
    canvasCount,
    jsHeapUsedMb: Number(((metricMap.JSHeapUsedSize ?? 0) / 1024 / 1024).toFixed(2)),
    frameIntervalAvgMs: Number(frameSummary.avg.toFixed(2)),
    frameIntervalP95Ms: Number(frameSummary.p95.toFixed(2)),
    frameIntervalMaxMs: Number(frameSummary.max.toFixed(2)),
    estimatedFps: Number((1000 / frameSummary.avg).toFixed(1)),
    droppedFrameSamples: frames.filter((value) => value > 25).length,
    longTaskCount: longTasks.length,
    longTaskTotalMs: Number(longTasks.reduce((value, item) => value + item, 0).toFixed(2)),
    reactRenderTotalMs: Number(
      renderCommits.reduce((value, commit) => value + commit.actualDuration, 0).toFixed(2)
    )
  };
}

function improvement(original, better, key, lowerIsBetter = true) {
  const before = original[key];
  const after = better[key];
  if (!before) return "n/a";
  const delta = lowerIsBetter ? (before - after) / before : (after - before) / before;
  return `${(delta * 100).toFixed(1)}%`;
}

function markdown(original, better) {
  return `# Confetti Profiler Results

Workload: ${TOTAL} particles for ${DURATION}ms per isolated run.

| Metric | @tholman/confetti | better-react-confetti | Improvement |
| --- | ---: | ---: | ---: |
| DOM nodes | ${original.domNodes} | ${better.domNodes} | ${improvement(original, better, "domNodes")} |
| Confetti DOM nodes | ${original.confettiDomNodes} | ${better.confettiDomNodes} | ${improvement(original, better, "confettiDomNodes")} |
| Canvas elements | ${original.canvasCount} | ${better.canvasCount} | n/a |
| JS heap used | ${original.jsHeapUsedMb} MB | ${better.jsHeapUsedMb} MB | ${improvement(original, better, "jsHeapUsedMb")} |
| Avg frame interval | ${original.frameIntervalAvgMs} ms | ${better.frameIntervalAvgMs} ms | ${improvement(original, better, "frameIntervalAvgMs")} |
| P95 frame interval | ${original.frameIntervalP95Ms} ms | ${better.frameIntervalP95Ms} ms | ${improvement(original, better, "frameIntervalP95Ms")} |
| Dropped frame samples (>25ms) | ${original.droppedFrameSamples} | ${better.droppedFrameSamples} | ${improvement(original, better, "droppedFrameSamples")} |
| Long tasks | ${original.longTaskCount} | ${better.longTaskCount} | ${improvement(original, better, "longTaskCount")} |
| React render total | ${original.reactRenderTotalMs} ms | ${better.reactRenderTotalMs} ms | ${improvement(original, better, "reactRenderTotalMs")} |

Screenshots: \`results/original.png\`, \`results/better.png\`.
Raw data: \`results/profile-results.json\`.
`;
}

await mkdir(new URL("../results", import.meta.url), { recursive: true });

const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore"
});

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const original = await profileMode(browser, "original");
  const better = await profileMode(browser, "better");
  await browser.close();

  const results = { generatedAt: new Date().toISOString(), original, better };
  await writeFile(new URL("../results/profile-results.json", import.meta.url), JSON.stringify(results, null, 2));
  await writeFile(new URL("../results/profile-results.md", import.meta.url), markdown(original, better));
  console.log(markdown(original, better));
} finally {
  server.kill();
}
