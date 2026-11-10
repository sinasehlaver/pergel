// Headless-Chrome launcher for scripts/check.mjs. Needs playwright-core (devDependency) and a Chrome/Chromium:
// set CHROME_PATH, or it tries the usual system locations.
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export async function launch(opts = {}) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome found: install Google Chrome or set CHROME_PATH.");
  const browser = await chromium.launch({ executablePath, headless: true, ...opts });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("[pageerror]", String(e)); });
  page.on("console", (m) => { if (m.type() === "error") { errors.push(m.text()); console.log("[console.error]", m.text()); } });
  return { browser, page, errors };
}
