#!/usr/bin/env node
/**
 * Full-page screenshots at a real emulated viewport.
 *
 * `msedge --screenshot --window-size` does NOT apply mobile emulation: it
 * renders at the browser's default layout width and crops, which makes a fine
 * layout look broken. Going through CDP with setDeviceMetricsOverride is the
 * only way to get a truthful mobile capture.
 *
 *   node scripts/shot.mjs <url> <out.png> [width] [height] [theme]
 */

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const [, , URL_ARG, OUT, W = "390", H = "900", THEME = "dark", SCROLL = "0", FULL = "1"] =
  process.argv;

if (!URL_ARG || !OUT) {
  console.error("usage: node scripts/shot.mjs <url> <out.png> [w] [h] [theme]");
  process.exit(1);
}

const PORT = 9334 + Math.floor(Math.random() * 200);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let ws;
try {
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      if (targets?.length) break;
    } catch {
      /* not up yet */
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
    width: Number(W),
    height: Number(H),
    deviceScaleFactor: 2,
    mobile: Number(W) < 700,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: THEME }],
  });

  // next-themes stores an explicit choice, which beats prefers-color-scheme.
  // Set it, then reload, or a "light" request just renders the dark default.
  await send("Page.navigate", { url: URL_ARG });
  await sleep(1500);
  await send("Runtime.evaluate", {
    expression: `localStorage.setItem('theme', '${THEME}')`,
  });
  await send("Page.reload", { ignoreCache: false });

  // Fonts and the client countdown need a beat to settle.
  await sleep(4000);

  // A fixed background only occupies the viewport, so a full-page capture
  // shows it once at the top and bare colour below. To judge it honestly,
  // scroll and capture the viewport alone.
  if (Number(SCROLL) > 0) {
    await send("Runtime.evaluate", {
      expression: `window.scrollTo(0, ${Number(SCROLL)})`,
    });
    await sleep(900);
  }

  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: FULL === "1" && Number(SCROLL) === 0,
  });

  const data = shot.result?.data;
  if (!data) throw new Error("no screenshot data: " + JSON.stringify(shot));

  await writeFile(OUT, Buffer.from(data, "base64"));
  console.log(`wrote ${OUT}  (${W}x${H} @2x, ${THEME})`);
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  browser.kill();
}
