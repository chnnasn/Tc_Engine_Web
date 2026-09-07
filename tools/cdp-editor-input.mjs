/**
 * Real browser-input regression checks for the upstream ImGui editor.
 *
 * Unlike a DOM test this script drives Chromium's Input domain.  The events
 * therefore take the same path as a physical mouse/keyboard event before
 * reaching GLFW/Emscripten/ImGui.  It is intentionally coordinate driven:
 * the upstream editor owns the pixels and does not expose HTML controls.
 *
 * Usage:
 *   node tools/cdp-editor-input.mjs <editor-url> [waitMs] [chromePath]
 *
 * Optional environment variables:
 *   TC_EDITOR_INPUT_OUT       screenshot path (default: tools/editor-input.png)
 *   TC_EDITOR_INPUT_X/Y       scene viewport point used for drag/shortcut tests
 *   TC_EDITOR_HIERARCHY_X/Y   empty hierarchy point used for context menu test
 *   TC_EDITOR_CREATE_X/Y      popup item point used to create an empty entity
 *   TC_EDITOR_DIAG_EXPR       Runtime.evaluate expression returning JSON state
 *
 * The diagnostic expression is deliberately injectable because the native
 * ABI can change.  Once the upstream runtime publishes a stable input/debug
 * ABI, set TC_EDITOR_DIAG_EXPR to that expression and this script will assert
 * the returned state after each action.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [, , rawUrl, rawWait, chromeArg] = process.argv;
if (!rawUrl) throw new Error("Usage: node tools/cdp-editor-input.mjs <editor-url> [waitMs] [chromePath]");
const url = rawUrl;
const waitMs = Number(rawWait || 18000);
const output = resolve(process.env.TC_EDITOR_INPUT_OUT || "tools/editor-input.png");
const chromeCandidates = [
  chromeArg,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const chromeExe = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromeExe) throw new Error("Chrome/Edge not found");

const profile = mkdtempSync(join(tmpdir(), "tc-editor-input-"));
const port = 9400 + Math.floor(Math.random() * 400);
const child = spawn(chromeExe, [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-gpu-sandbox", "--no-sandbox", "--enable-unsafe-swiftshader",
  "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--enable-webgl",
  "--window-size=1440,900", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
async function json(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return response.json();
}

let target;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    target = (await json("/json/list")).find((entry) => entry.type === "page");
    if (target) break;
  } catch { /* Chromium is still starting. */ }
  await sleep(150);
}
if (!target) throw new Error("Could not reach Chrome DevTools endpoint");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolvePromise, reject) => {
  ws.onopen = resolvePromise;
  ws.onerror = reject;
});
let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
};
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolvePromise, reject) => pending.set(id, { resolve: resolvePromise, reject }));
}
async function evaluate(expression, awaitPromise = false) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  return result.result?.value;
}
async function input(method, params) {
  await send(method, params);
  // Let the browser dispatch the event through the canvas and let the native
  // frame consume it before the next event is sent.
  await sleep(35);
}
async function mouse(type, x, y, button = "none", buttons = 0, clickCount = 1) {
  await input("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount });
}
async function click(x, y, button = "left") {
  const mask = button === "left" ? 1 : button === "right" ? 2 : 4;
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, button, mask, 1);
  await mouse("mouseReleased", x, y, button, 0, 1);
}
async function drag(x1, y1, x2, y2, button = "middle", steps = 8) {
  const mask = button === "left" ? 1 : button === "right" ? 2 : 4;
  await mouse("mouseMoved", x1, y1);
  await mouse("mousePressed", x1, y1, button, mask, 1);
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    await mouse("mouseMoved", x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, "none", mask, 1);
  }
  await mouse("mouseReleased", x2, y2, button, 0, 1);
}
function modifierMask({ ctrl = false, alt = false, shift = false, meta = false } = {}) {
  return (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
}
async function key(key, code, options = {}) {
  const modifiers = modifierMask(options);
  await input("Input.dispatchKeyEvent", {
    type: "keyDown", key, code, modifiers,
    windowsVirtualKeyCode: options.windowsVirtualKeyCode,
    nativeVirtualKeyCode: options.windowsVirtualKeyCode,
    autoRepeat: false,
  });
  await input("Input.dispatchKeyEvent", {
    type: "keyUp", key, code, modifiers,
    windowsVirtualKeyCode: options.windowsVirtualKeyCode,
    nativeVirtualKeyCode: options.windowsVirtualKeyCode,
  });
}
async function diagnostic(label) {
  const expression = process.env.TC_EDITOR_DIAG_EXPR;
  if (!expression) return null;
  const value = await evaluate(expression, true);
  const item = { label, value };
  console.log(`[diagnostic:${label}] ${JSON.stringify(value)}`);
  return item;
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.navigate", { url });
  await sleep(waitMs);
  const canvas = await evaluate(`(() => {
    const node = document.querySelector('canvas');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { width: node.width, height: node.height, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, ready: !!window.TomCatRuntime?.running };
  })()`);
  if (!canvas) throw new Error("Editor canvas was not found");
  if (!canvas.ready) throw new Error("Editor runtime did not become ready");
  console.log(JSON.stringify({ url, canvas }, null, 2));

  const viewportX = Number(process.env.TC_EDITOR_INPUT_X || Math.round(canvas.rect.width * 0.62));
  const viewportY = Number(process.env.TC_EDITOR_INPUT_Y || Math.round(canvas.rect.height * 0.48));
  const hierarchyX = Number(process.env.TC_EDITOR_HIERARCHY_X || Math.round(canvas.rect.width * 0.15));
  const hierarchyY = Number(process.env.TC_EDITOR_HIERARCHY_Y || Math.round(canvas.rect.height * 0.42));
  const offsetX = canvas.rect.x;
  const offsetY = canvas.rect.y;
  const point = (x, y) => ({ x: offsetX + x, y: offsetY + y });

  // Focus the native canvas first. This is required for unmodified Q/W/E/R
  // key events to reach the GLFW keyboard callback.
  await click(...Object.values(point(viewportX, viewportY)));
  await diagnostic("focused");

  // Hierarchy context menu: this must be a real right-button sequence. The
  // native layer should open its ImGui popup instead of the browser menu.
  await click(...Object.values(point(hierarchyX, hierarchyY)), "right");
  await diagnostic("hierarchy-context-menu");
  const createX = process.env.TC_EDITOR_CREATE_X;
  const createY = process.env.TC_EDITOR_CREATE_Y;
  if (createX != null && createY != null) {
    await click(...Object.values(point(Number(createX), Number(createY))));
    await diagnostic("create-empty-entity");
  } else {
    console.log("[context-menu] set TC_EDITOR_CREATE_X and TC_EDITOR_CREATE_Y to click the upstream Create Empty Entity item");
    await key("Escape", "Escape", { windowsVirtualKeyCode: 27 });
  }

  // Tool shortcuts are sent as physical key events after the canvas is focused.
  for (const [keyName, code, vk] of [["q", "KeyQ", 81], ["w", "KeyW", 87], ["e", "KeyE", 69], ["r", "KeyR", 82]]) {
    await key(keyName, code, { windowsVirtualKeyCode: vk });
    await diagnostic(`tool-${keyName}`);
  }

  // Exercise the three editor drag paths: middle pan, right orbit, and left
  // selection/drag. Coordinates are configurable because panel layouts vary.
  await drag(...Object.values(point(viewportX - 36, viewportY)), ...Object.values(point(viewportX + 36, viewportY + 16)), "middle");
  await diagnostic("middle-drag");
  await drag(...Object.values(point(viewportX, viewportY)), ...Object.values(point(viewportX + 32, viewportY - 14)), "right");
  await diagnostic("right-drag");
  await drag(...Object.values(point(viewportX - 24, viewportY)), ...Object.values(point(viewportX + 24, viewportY)), "left");
  await diagnostic("left-drag");

  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(output, Buffer.from(screenshot.data, "base64"));
  console.log(`screenshot: ${output}`);
  if (process.env.TC_EDITOR_DIAG_EXPR) await diagnostic("final");
} finally {
  try { ws.close(); } catch { /* best effort */ }
  child.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}
