/**
 * Headless Chromium verification helper for the Web editor.
 *
 * Launches Chrome with SwiftShader WebGL2, navigates to a URL, waits, then
 * saves a screenshot plus console/exception output.  Usage:
 *
 *   node tools/cdp-shot.mjs <url> <out.png> [waitMs] [chromePath]
 *
 * Requires a Chromium-family browser and Node >= 22 (global WebSocket/fetch).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [, , rawUrl, outPath, rawWait, chromeArg] = process.argv;
const url = rawUrl;
const outFile = resolve(outPath);
const waitMs = Number(rawWait || 18000);
const chromeCandidates = [
  chromeArg,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const chromeExe = chromeCandidates.find((p) => existsSync(p));
if (!chromeExe) throw new Error("Chrome/Edge not found");

const profile = mkdtempSync(join(tmpdir(), "tcshot-"));
const port = 9333 + Math.floor(Math.random() * 500);
const child = spawn(
  chromeExe,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu-sandbox",
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--window-size=1440,900",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(path, init) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  return res.json();
}

let target;
for (let i = 0; i < 60; i++) {
  try {
    const list = await json("/json/list");
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {
    /* Chrome still starting */
  }
  await sleep(250);
}
if (!target) throw new Error("Could not reach Chrome DevTools endpoint");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
const consoleLines = [];
const errors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    consoleLines.push(`[console.${msg.params.type}] ${text}`);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(`[exception] ${msg.params.exceptionDetails?.text} ${msg.params.exceptionDetails?.exception?.description ?? ""}`);
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    errors.push(`[log.error] ${msg.params.entry.text}`);
  }
};

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Page.navigate", { url });
await sleep(waitMs);

const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(outFile, Buffer.from(result.data, "base64"));

const snapshot = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    title: document.title,
    url: location.href,
    text: document.body ? document.body.innerText.slice(0, 4000) : "",
    loadingClass: document.getElementById("loading")?.className || null,
    loadingText: document.getElementById("loadingText")?.textContent || null,
    hostStatus: document.getElementById("hostStatus")?.textContent || null,
    hostStatusHidden: document.getElementById("hostStatus")?.classList.contains("hidden") ?? null,
    runtime: window.TomCatRuntime ? {
      running: window.TomCatRuntime.running,
      moduleLoaded: !!window.TomCatRuntime.module,
      storage: !!window.TomCatRuntime.storage,
      files: !!window.TomCatRuntime.files,
      scene: window.TomCatRuntime.scene?.name || null,
      frameHandle: window.TomCatRuntime.frameHandle || 0
    } : null,
    canvas: (() => {
      const c = document.querySelector("canvas");
      if (!c) return null;
      const gl = c.getContext("webgl2");
      return { width: c.width, height: c.height, css: c.getBoundingClientRect().toJSON(), webgl2: !!gl };
    })(),
    hasModule: typeof window.Module !== "undefined"
  })`,
  returnByValue: true,
});

const state = JSON.parse(snapshot.result.value);
console.log(JSON.stringify(state, null, 2));
const evalExpr = process.env.EVAL_EXPR;
if (evalExpr) {
  const extra = await send("Runtime.evaluate", { expression: evalExpr, returnByValue: true, awaitPromise: true });
  console.log("--- eval ---");
  console.log(JSON.stringify(extra.result?.value ?? extra.exceptionDetails ?? null));
}
console.log("--- console ---");
console.log(consoleLines.slice(-40).join("\n") || "(none)");
console.log("--- errors ---");
console.log(errors.slice(-30).join("\n") || "(none)");

ws.close();
child.kill();
await sleep(600);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* profile cleanup is best effort */
}
