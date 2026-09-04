import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1720, height: 900 }, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(process.argv[2]).href, { waitUntil: "networkidle" });
await p.screenshot({ path: process.argv[3], fullPage: true });
await b.close();
