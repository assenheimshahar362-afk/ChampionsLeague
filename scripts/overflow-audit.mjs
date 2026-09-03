#!/usr/bin/env node
/**
 * Finds elements that push the document wider than the viewport.
 *
 * Drives headless Edge/Chrome over the DevTools Protocol using Node's built-in
 * fetch and WebSocket — no browser-automation dependency for a diagnostic.
 *
 *   node scripts/overflow-audit.mjs <url> [viewportWidth]
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const URL_ARG = process.argv[2] ?? "http://localhost:3000/en";
const WIDTH = Number(process.argv[3] ?? 390);
const PORT = 9333;

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

const browser = spawn(
  BROWSERS[0],
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},1200`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let ws;
try {
  // Wait for the debugging endpoint to come up.
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      if (targets?.length) break;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  if (!targets?.length) throw new Error("no debug targets");

  const page = targets.find((t) => t.type === "page") ?? targets[0];
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const msgId = ++id;
      pending.set(msgId, res);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.navigate", { url: URL_ARG });
  await sleep(3500);

  const expression = `
    (() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const overflowsRight = r.right > vw + 1;
        const overflowsLeft  = r.left < -1;
        if (overflowsRight || overflowsLeft) {
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute('class') || '').slice(0, 90),
            text: (el.textContent || '').trim().slice(0, 30),
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
            depth: (() => { let d = 0, n = el; while ((n = n.parentElement)) d++; return d; })(),
          });
        }
      }
      // Shallowest offenders first: the outermost one is the real cause.
      out.sort((a, b) => a.depth - b.depth);
      return JSON.stringify({
        viewportWidth: vw,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        offenders: out.slice(0, 14),
      }, null, 2);
    })()
  `;

  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });

  console.log(result.result?.result?.value ?? JSON.stringify(result, null, 2));
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  browser.kill();
}
