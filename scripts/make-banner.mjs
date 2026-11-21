/*
 * Renders the OE Chess brand banner to public/banner-hero.jpg.
 *
 * The banner is pure CSS/SVG (no bitmap sources), so it stays crisp at any
 * size and always matches the app's palette. Run with:
 *   node scripts/make-banner.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = path.join(root, "node_modules/@fontsource");

async function fontFace(family, weight, style, file) {
  const bytes = await readFile(path.join(fontDir, file));
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:block;src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');}`;
}

const fonts = await Promise.all([
  fontFace("Fraunces", 300, "normal", "fraunces/files/fraunces-latin-300-normal.woff2"),
  fontFace("Fraunces", 400, "italic", "fraunces/files/fraunces-latin-400-italic.woff2"),
  fontFace("Fraunces", 600, "normal", "fraunces/files/fraunces-latin-600-normal.woff2"),
  fontFace("Outfit", 500, "normal", "outfit/files/outfit-latin-500-normal.woff2"),
]);

/**
 * Gold king emblem drawn as vector paths: cross, three-peaked crown, baluster
 * body and stepped base, lit with a brass gradient plus a soft-light sheen.
 */
function king({ id, width, opacity = 1, blur = 0, fill = null, style = "", shadow = false }) {
  const shade = shadow ? " drop-shadow(0 26px 22px rgba(0,0,0,.45))" : "";
  return `<svg class="king" style="width:${width}px;opacity:${opacity};filter:blur(${blur}px)${shade};${style}" viewBox="0 0 200 300" aria-hidden="true">
    <defs>
      <linearGradient id="gold-${id}" x1="0.12" y1="0" x2="0.88" y2="1">
        <stop offset="0" stop-color="#F9E2B0"/>
        <stop offset="0.32" stop-color="#E7B96E"/>
        <stop offset="0.66" stop-color="#C0873B"/>
        <stop offset="1" stop-color="#7E5220"/>
      </linearGradient>
      <linearGradient id="sheen-${id}" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#FFF7E6" stop-opacity="0.55"/>
        <stop offset="0.55" stop-color="#FFF7E6" stop-opacity="0.05"/>
        <stop offset="1" stop-color="#3F2509" stop-opacity="0.28"/>
      </linearGradient>
    </defs>
    <g fill="${fill ?? `url(#gold-${id})`}">
      <rect x="91" y="0" width="18" height="56" rx="4"/>
      <rect x="68" y="16" width="64" height="16" rx="4"/>
      <path d="M44 104V62l28 20L100 50l28 32 28-20v42Z"/>
      <rect x="38" y="100" width="124" height="20" rx="10"/>
      <path d="M74 120h52c-2 18-8 28-12 36H86c-4-8-10-18-12-36Z"/>
      <path d="M86 156h28c9 18 17 34 23 50 6 15 9 24 9 30H54c0-6 3-15 9-30 6-16 14-32 23-50Z"/>
      <rect x="46" y="232" width="108" height="16" rx="7"/>
      <rect x="34" y="246" width="132" height="18" rx="8"/>
      <rect x="22" y="262" width="156" height="18" rx="8"/>
    </g>
    <g fill="url(#sheen-${id})" style="mix-blend-mode:soft-light">
      <path d="M44 104V62l28 20L100 50l28 32 28-20v42Z"/>
      <path d="M86 156h12c-9 18-17 34-23 50-6 15-9 24-9 30H54c0-6 3-15 9-30 6-16 14-32 23-50Z"/>
      <rect x="38" y="100" width="124" height="5" rx="2.5"/>
    </g>
    <g fill="none" stroke="#3A2208" stroke-opacity="0.28" stroke-width="2">
      <path d="M100 0v56M68 24h64M38 110h124M46 240h108M34 255h132M22 271h156M74 120h52"/>
    </g>
  </svg>`;
}

const pawn = (id, size, opacity, style = "") => `<svg class="pawn" style="width:${size}px;opacity:${opacity};${style}" viewBox="0 0 100 160" aria-hidden="true">
  <g fill="#2A1D12">
    <circle cx="50" cy="28" r="19"/>
    <path d="M31 44h38c0 12 4 19 10 25H21c6-6 10-13 10-25Z"/>
    <path d="M28 70h44c7 14 12 28 16 42 3 9 5 15 5 19H7c0-4 2-10 5-19 4-14 9-28 16-42Z"/>
    <rect x="14" y="128" width="72" height="12" rx="5"/>
    <rect x="6" y="138" width="88" height="14" rx="6"/>
  </g>
</svg>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
${fonts.join("\n")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1600px;height:900px;overflow:hidden;background:#0F110D}
.stage{position:relative;width:1600px;height:900px;overflow:hidden;
  background:
    radial-gradient(760px 620px at 79% 40%, rgba(226,175,101,.20), rgba(226,175,101,0) 62%),
    radial-gradient(1100px 700px at 18% 18%, rgba(96,104,78,.16), rgba(96,104,78,0) 70%),
    linear-gradient(155deg,#191C15 0%,#141611 46%,#0C0E0A 100%);}
.board{position:absolute;inset:0}
.soft{position:absolute;inset:0;background:
  linear-gradient(100deg, rgba(10,12,9,.94) 0%, rgba(10,12,9,.72) 22%, rgba(10,12,9,.18) 40%, rgba(10,12,9,0) 52%),
  linear-gradient(0deg, rgba(6,8,5,.55) 0%, rgba(6,8,5,0) 24%),
  radial-gradient(1200px 560px at 76% 82%, rgba(240,206,147,.16), rgba(240,206,147,0) 65%),
  radial-gradient(900px 420px at 50% 100%, rgba(0,0,0,.35), rgba(0,0,0,0) 70%);}
.vignette{position:absolute;inset:0;box-shadow:inset 0 0 260px 70px rgba(6,8,5,.85)}
.grain{position:absolute;inset:-40%;opacity:.07;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E")}
.copy{position:absolute;left:118px;top:0;height:900px;width:640px;
  display:flex;flex-direction:column;justify-content:center;gap:0;z-index:4}
.oe{font-family:Fraunces;font-weight:300;font-size:232px;line-height:.8;letter-spacing:.005em;
  color:#F6EEDE;text-shadow:0 2px 60px rgba(240,200,140,.20)}
.rule{display:flex;align-items:center;gap:18px;margin:30px 0 26px;width:352px}
.rule i{flex:1;height:1px;background:linear-gradient(90deg,rgba(201,146,58,.15),rgba(214,164,88,.85))}
.rule i:last-child{background:linear-gradient(270deg,rgba(201,146,58,.15),rgba(214,164,88,.85))}
.rule b{width:7px;height:7px;background:#D9A85F;transform:rotate(45deg);box-shadow:0 0 14px rgba(217,168,95,.7)}
.chess{font-family:Fraunces;font-weight:300;font-size:112px;line-height:.95;letter-spacing:.34em;
  color:#EFE4D0;margin-left:6px}
.tag{font-family:Outfit;font-weight:500;font-size:17px;letter-spacing:.52em;color:#D8A85C;margin-top:34px}
.pitch{font-family:Fraunces;font-style:italic;font-weight:400;font-size:25px;color:rgba(240,232,217,.58);margin-top:16px}
.foot{position:absolute;left:120px;bottom:44px;font-family:Outfit;font-weight:500;font-size:12px;
  letter-spacing:.34em;color:rgba(226,214,192,.4);z-index:5}
.pieces{position:absolute;inset:0;z-index:3}
.king{position:absolute;display:block}
.glow{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(244,203,138,.38),rgba(244,203,138,0) 70%);filter:blur(10px)}
.shadow{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.72),rgba(0,0,0,0) 72%);filter:blur(10px)}
</style></head>
<body><div class="stage">
  <svg class="board" viewBox="0 0 1600 900" preserveAspectRatio="none"><g id="squares"></g>
    <defs>
      <linearGradient id="fade" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#0C0E0A" stop-opacity="0"/>
        <stop offset="0.12" stop-color="#0C0E0A" stop-opacity="0.05"/>
        <stop offset="0.4" stop-color="#0C0E0A" stop-opacity="0.55"/>
        <stop offset="0.7" stop-color="#0C0E0A" stop-opacity="0.88"/>
        <stop offset="1" stop-color="#0C0E0A" stop-opacity="0.98"/>
      </linearGradient>
      <radialGradient id="pool" cx="0.76" cy="0.72" r="0.5">
        <stop offset="0" stop-color="#F2CE93" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#F2CE93" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#fade)"/>
    <rect width="1600" height="900" fill="url(#pool)"/>
  </svg>
  <div class="soft"></div>

  <div class="pieces">
    ${pawn("bg1", 74, 0.5, "position:absolute;left:900px;top:722px;filter:blur(2.5px)")}
    ${pawn("bg2", 58, 0.42, "position:absolute;left:1352px;top:712px;filter:blur(3px)")}
    <div class="glow" style="left:940px;top:398px;width:520px;height:520px"></div>
    <div class="shadow" style="left:990px;top:826px;width:380px;height:58px;opacity:.75"></div>
    ${king({ id: "hero", width: 330, shadow: true, style: "position:absolute;left:1015px;top:350px" })}
  </div>

  <div class="copy">
    <div class="oe">OE</div>
    <div class="rule"><i></i><b></b><i></i></div>
    <div class="chess">CHESS</div>
    <div class="tag">OPENINGS &middot; ENDGAMES</div>
    <div class="pitch">A quiet place to study the game.</div>
  </div>

  <div class="vignette"></div>
  <div class="grain"></div>
  <div class="foot">OFFLINE &middot; LOCAL ENGINE &middot; YOUR LIBRARY</div>
</div>
<script>
  // Perspective board: straight-edged rows, compressed toward the far edge.
  const svg = document.getElementById("squares");
  const far = { y: 700, cx: 1150, hw: 400 };
  const near = { y: 1090, cx: 1150, hw: 900 };
  const ROWS = 8, COLS = 8;
  const mix = (a, b, t) => a + (b - a) * t;
  const edge = (t) => {
    const y = mix(far.y, near.y, t);
    const cx = mix(far.cx, near.cx, t);
    const hw = mix(far.hw, near.hw, t);
    return { y, x0: cx - hw, x1: cx + hw };
  };
  const warp = (i) => Math.pow(i / ROWS, 1.3);
  const ns = "http://www.w3.org/2000/svg";
  for (let r = 0; r < ROWS; r++) {
    const a = edge(warp(r)), b = edge(warp(r + 1));
    for (let c = 0; c < COLS; c++) {
      const pts = [
        [mix(a.x0, a.x1, c / COLS), a.y],
        [mix(a.x0, a.x1, (c + 1) / COLS), a.y],
        [mix(b.x0, b.x1, (c + 1) / COLS), b.y],
        [mix(b.x0, b.x1, c / COLS), b.y],
      ];
      const p = document.createElementNS(ns, "polygon");
      p.setAttribute("points", pts.map(([x, y]) => x.toFixed(1) + "," + y.toFixed(1)).join(" "));
      const light = (r + c) % 2 === 0;
      p.setAttribute("fill", light ? "#B58F5B" : "#3A2718");
      p.setAttribute("opacity", (0.34 + 0.66 * warp(r + 0.5)).toFixed(3));
      svg.appendChild(p);
    }
  }
  // Warm rim light catching the far edge of the table.
  const e0 = edge(0);
  const rim = document.createElementNS(ns, "path");
  rim.setAttribute("d", "M" + e0.x0.toFixed(1) + " " + (e0.y + 1.5).toFixed(1) + "H" + e0.x1.toFixed(1));
  rim.setAttribute("stroke", "#EBC68B");
  rim.setAttribute("stroke-width", "2.5");
  rim.setAttribute("opacity", "0.16");
  rim.setAttribute("filter", "blur(1px)");
  svg.appendChild(rim);

  // Depth of field: far rows dissolve into the background.
  document.fonts.ready.then(() => document.body.setAttribute("data-ready", "1"));
</script></body></html>`;

await mkdir(path.join(root, "scripts/.banner"), { recursive: true });
const htmlPath = path.join(root, "scripts/.banner/banner.html");
await writeFile(htmlPath, html, "utf8");

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  chromium.executablePath(),
].filter(Boolean);
const { existsSync } = await import("node:fs");
const executablePath = chromeCandidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Chromium found. Set CHROME_PATH.");
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
});
await page.goto("file://" + htmlPath.replaceAll("\\", "/"));
await page.waitForFunction(() => document.body.getAttribute("data-ready") === "1");
await page.waitForTimeout(300);
await page.screenshot({
  path: path.join(root, "public/banner-hero.jpg"),
  type: "jpeg",
  quality: 92,
});
await browser.close();
console.log("wrote public/banner-hero.jpg");
