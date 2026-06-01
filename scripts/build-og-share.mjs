// Build a set of elite shareable OG / iMessage cards (1200×630) via Satori+Resvg.
// Run: node scripts/build-og-share.mjs   → writes og-share-{a,b,c,d}.png
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN = "THEPOLYEDGE.COM";

async function getFont(family, weight) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`,
    { headers: { "User-Agent": "Mozilla/5.0 Chrome/120 Safari/537.36" } },
  ).then((r) => r.text());
  const m = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  return Buffer.from(await fetch(m[1]).then((r) => r.arrayBuffer()));
}

const C = {
  void: "#050507", void2: "#0C0C10", void3: "#141418",
  lime: "#C4FF00", magenta: "#FF006E", green: "#00FF85", red: "#FF3344",
  white: "#F5F5F0", muted: "#7A7A82",
  border: "rgba(245,245,240,0.10)", borderBright: "rgba(196,255,0,0.30)",
  borderGreen: "rgba(0,255,133,0.32)", borderMag: "rgba(255,0,110,0.40)",
};
const el = (type, props, ...children) => ({
  type, key: null,
  props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
});
const flex = (extra = {}) => ({ display: "flex", ...extra });

const Mark = (size = 30) => el("svg",
  { width: size, height: size, viewBox: "0 0 64 64", style: flex() },
  el("path", { d: "M20 10 L50 32 L20 54", fill: "none", stroke: C.lime, strokeWidth: 7, strokeLinecap: "square", strokeLinejoin: "miter" }),
);
const Grid = () => el("div", { style: flex({
  position: "absolute", inset: 0,
  backgroundImage: "linear-gradient(rgba(0,255,133,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,133,0.05) 1px, transparent 1px)",
  backgroundSize: "56px 56px",
}) });
const Glow = (x, y, color, size = 60) => el("div", { style: flex({
  position: "absolute", inset: 0,
  backgroundImage: `radial-gradient(circle at ${x} ${y}, ${color}, transparent ${size}%)`,
}) });
const Brackets = () => {
  const arm = 34, t = 2, o = 26;
  const mk = (c) => {
    const pos = { tl:{top:o,left:o}, tr:{top:o,right:o}, bl:{bottom:o,left:o}, br:{bottom:o,right:o} }[c];
    return el("div", { style: flex({ position: "absolute", width: arm, height: arm, ...pos }) },
      el("div", { style: flex({ position: "absolute", width: arm, height: t, backgroundColor: C.green, [c.includes("t")?"top":"bottom"]:0, [c.includes("l")?"left":"right"]:0 }) }),
      el("div", { style: flex({ position: "absolute", width: t, height: arm, backgroundColor: C.green, [c.includes("t")?"top":"bottom"]:0, [c.includes("l")?"left":"right"]:0 }) }),
    );
  };
  return el("div", { style: flex({ position: "absolute", inset: 0 }) }, mk("tl"), mk("tr"), mk("bl"), mk("br"));
};
const Wordmark = (fs = 30) => el("div", { style: flex({ fontFamily: "Anton", fontSize: fs, letterSpacing: "-1px", alignItems: "center" }) },
  el("div", { style: flex({ color: C.lime }) }, "$"),
  el("div", { style: flex({ color: C.white }) }, "EDGE"),
);
const TopBar = (right, dot = C.green) => el("div", { style: flex({
  alignItems: "center", justifyContent: "space-between", height: 66, paddingLeft: 50, paddingRight: 50, borderBottom: `1px solid ${C.borderGreen}`, zIndex: 5,
}) },
  el("div", { style: flex({ alignItems: "center", gap: 14 }) }, Mark(28), Wordmark(30)),
  el("div", { style: flex({ alignItems: "center", gap: 10, paddingLeft: 14, paddingRight: 14, paddingTop: 6, paddingBottom: 6, border: `1px solid ${C.borderGreen}`, fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 12, letterSpacing: "3.5px", color: dot, textTransform: "uppercase" }) },
    el("div", { style: flex({ width: 7, height: 7, borderRadius: 999, backgroundColor: dot }) }),
    el("div", { style: flex() }, right),
  ),
);
const FootBar = (left) => el("div", { style: flex({
  alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 20,
  fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 15, letterSpacing: "3px", textTransform: "uppercase",
}) },
  el("div", { style: flex({ gap: 16, color: C.muted, alignItems: "center" }) }, ...left),
  el("div", { style: flex({ color: C.lime }) }, `${DOMAIN} →`),
);
const stat = (val, lbl, color = C.green) => el("div", { style: flex({ alignItems: "center", gap: 8 }) },
  el("div", { style: flex({ color, fontWeight: 700 }) }, val),
  el("div", { style: flex() }, lbl),
);
const page = (...kids) => el("div", { style: flex({ width: "100%", height: "100%", flexDirection: "column", backgroundColor: C.void, color: C.white, position: "relative" }) }, ...kids);

// ── A · FLAGSHIP: WATCH THE ACTION ──────────────────────────────────────
const A = () => page(
  Grid(), Glow("12% 32%", "rgba(196,255,0,0.16)", 48), Glow("92% 86%", "rgba(255,0,110,0.13)", 50), Brackets(),
  TopBar("LIVE · POLYMARKET + KALSHI"),
  el("div", { style: flex({ flexDirection: "column", padding: "40px 56px 34px", flex: 1, position: "relative", zIndex: 5 }) },
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 96, lineHeight: 0.86, letterSpacing: "-3px", color: C.white }) }, "WATCH THE"),
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 138, lineHeight: 0.84, letterSpacing: "-5px", color: C.lime }) }, "ACTION."),
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 96, lineHeight: 0.9, letterSpacing: "-3px" }) },
      el("div", { style: flex({ color: C.magenta }) }, "BEFORE"),
      el("div", { style: flex({ color: C.white, marginLeft: 22 }) }, "YOU BET."),
    ),
    el("div", { style: flex({ fontFamily: "DM Sans", fontSize: 27, color: C.white, opacity: 0.82, marginTop: 22 }) },
      "Every market. Every whale. Every signal. One screen — live."),
    FootBar([stat("$99M", "24H", C.lime), el("div", { style: flex() }, "·"), stat("8,341", "MARKETS", C.white), el("div", { style: flex() }, "·"), el("div", { style: flex({ color: C.green }) }, "REAL-TIME")]),
  ),
);

// ── B · THE HOOK: cross-platform divergence ─────────────────────────────
const platPill = (name, pct, color, bord) => el("div", { style: flex({
  flexDirection: "column", flex: 1, border: `1px solid ${bord}`, backgroundColor: C.void2, padding: "20px 24px", gap: 6,
}) },
  el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 16, letterSpacing: "3px", color, textTransform: "uppercase" }) }, name),
  el("div", { style: flex({ fontFamily: "Anton", fontSize: 92, lineHeight: 0.9, color: C.white }) }, pct),
);
const B = () => page(
  Grid(), Glow("85% 24%", "rgba(0,255,133,0.15)", 52), Glow("10% 90%", "rgba(255,0,110,0.10)", 48), Brackets(),
  TopBar("CROSS-PLATFORM EDGE"),
  el("div", { style: flex({ flexDirection: "column", padding: "34px 56px 32px", flex: 1, position: "relative", zIndex: 5 }) },
    el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 19, letterSpacing: "4px", color: C.muted, textTransform: "uppercase", marginBottom: 14 }) }, "SAME BET · TWO PLATFORMS · ONE GAP"),
    el("div", { style: flex({ gap: 16, alignItems: "stretch" }) },
      platPill("Polymarket", "31%", C.magenta, C.borderMag),
      el("div", { style: flex({ flexDirection: "column", justifyContent: "center", alignItems: "center", paddingLeft: 14, paddingRight: 14 }) },
        el("div", { style: flex({ fontFamily: "Anton", fontSize: 60, color: C.green }) }, "14"),
        el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 14, letterSpacing: "2px", color: C.green }) }, "PT GAP"),
      ),
      platPill("Kalshi", "45%", C.lime, C.borderBright),
    ),
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 78, lineHeight: 0.92, letterSpacing: "-2px", marginTop: 26 }) },
      el("div", { style: flex({ color: C.white }) }, "THE EDGE IS IN"),
      el("div", { style: flex({ color: C.lime, marginLeft: 24 }) }, "THE SPREAD."),
    ),
    el("div", { style: flex({ fontFamily: "DM Sans", fontSize: 25, color: C.white, opacity: 0.8, marginTop: 12 }) },
      "Polymarket vs Kalshi, side by side. The only place that shows you the gap."),
    FootBar([el("div", { style: flex({ color: C.green }) }, "LIVE RADAR"), el("div", { style: flex() }, "·"), el("div", { style: flex() }, "POLY ↔ KALSHI")]),
  ),
);

// ── C · THE FLEX: the terminal ──────────────────────────────────────────
const tile = (val, lbl) => el("div", { style: flex({ flexDirection: "column", flex: 1, border: `1px solid ${C.border}`, backgroundColor: C.void2, padding: "16px 20px", gap: 4 }) },
  el("div", { style: flex({ fontFamily: "Anton", fontSize: 40, color: C.lime }) }, val),
  el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 13, letterSpacing: "2px", color: C.muted, textTransform: "uppercase" }) }, lbl),
);
const Cv = () => page(
  Grid(), Glow("20% 18%", "rgba(196,255,0,0.16)", 46), Glow("90% 95%", "rgba(0,255,133,0.10)", 50), Brackets(),
  TopBar("LIVE TERMINAL"),
  el("div", { style: flex({ flexDirection: "column", padding: "36px 56px 32px", flex: 1, position: "relative", zIndex: 5 }) },
    el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 19, letterSpacing: "4px", color: C.green, textTransform: "uppercase", marginBottom: 6 }) }, "● LIVE 24H VOLUME · POLYMARKET + KALSHI"),
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 150, lineHeight: 0.86, letterSpacing: "-5px", color: C.lime }) }, "$99.8M"),
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 64, lineHeight: 0.92, letterSpacing: "-2px", marginTop: 8 }) },
      el("div", { style: flex({ color: C.white }) }, "THE PREDICTION-MARKET"),
      el("div", { style: flex({ color: C.lime, marginLeft: 22 }) }, "TERMINAL."),
    ),
    el("div", { style: flex({ gap: 14, marginTop: 22 }) }, tile("8,341", "Markets tracked"), tile("337", "Whales live"), tile("<1s", "Price updates")),
    FootBar([el("div", { style: flex() }, "Every market · Every whale · Every signal")]),
  ),
);

// ── D · MINIMAL: clean wordmark flex ────────────────────────────────────
const D = () => page(
  Glow("50% 38%", "rgba(196,255,0,0.13)", 42), Glow("50% 100%", "rgba(255,0,110,0.08)", 40), Brackets(),
  el("div", { style: flex({ flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 5, gap: 4 }) },
    el("div", { style: flex({ alignItems: "center", gap: 22 }) }, Mark(80), el("div", { style: flex({ fontFamily: "Anton", fontSize: 150, letterSpacing: "-4px" }) },
      el("div", { style: flex({ color: C.lime }) }, "$"), el("div", { style: flex({ color: C.white }) }, "EDGE"))),
    el("div", { style: flex({ fontFamily: "DM Sans", fontSize: 34, color: C.white, opacity: 0.9, marginTop: 18 }) }, "See the action before you bet."),
    el("div", { style: flex({ marginTop: 26, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, border: `1px solid ${C.borderBright}`, fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 15, letterSpacing: "4px", color: C.lime, textTransform: "uppercase" }) }, "POLYMARKET × KALSHI · LIVE"),
  ),
  el("div", { style: flex({ justifyContent: "center", paddingBottom: 40, fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 16, letterSpacing: "5px", color: C.muted }) }, DOMAIN),
);

// ── YUP! · the swipe app (Tinder for prediction markets) ────────────────
const yupOdd = (pct, label, color, bord) => el("div", { style: flex({
  flexDirection: "column", alignItems: "center", flex: 1, border: `1px solid ${bord}`,
  borderRadius: 11, backgroundColor: C.void2, paddingTop: 11, paddingBottom: 11, gap: 1,
}) },
  el("div", { style: flex({ fontFamily: "Anton", fontSize: 40, color }) }, pct),
  el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 12, letterSpacing: "2px", color: C.muted }) }, label),
);
const yupCard = () => el("div", { style: flex({
  flexDirection: "column", width: 392, borderRadius: 24, border: `1px solid ${C.borderBright}`,
  backgroundColor: C.void3, paddingTop: 24, paddingLeft: 24, paddingRight: 24, paddingBottom: 24,
  position: "relative", transform: "rotate(3deg)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
}) },
  el("div", { style: flex({ position: "absolute", top: 0, left: 0, width: 150, height: 5, backgroundColor: C.lime }) }),
  el("div", { style: flex({ justifyContent: "space-between", alignItems: "center" }) },
    el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 13, letterSpacing: "1px", color: C.muted }) }, "BITCOIN · KALSHI"),
    el("div", { style: flex({ fontFamily: "JetBrains Mono", fontSize: 12, color: C.muted }) }, "$2.4M VOL"),
  ),
  el("div", { style: flex({ flexDirection: "column", alignItems: "center", marginTop: 18 }) },
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 104, lineHeight: 0.9, color: C.lime, letterSpacing: "1px" }) }, "0:42"),
    el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 12, letterSpacing: "5px", color: C.muted, marginTop: 2 }) }, "UNTIL CLOSE"),
  ),
  el("div", { style: flex({ fontFamily: "DM Sans", fontWeight: 700, fontSize: 23, color: C.white, textAlign: "center", justifyContent: "center", marginTop: 18, marginBottom: 18, lineHeight: 1.2 }) }, "BTC price up in the next 15 min?"),
  el("div", { style: flex({ gap: 11 }) }, yupOdd("53¢", "NO", C.magenta, C.borderMag), yupOdd("47¢", "YES", C.green, C.borderGreen)),
  el("div", { style: flex({ position: "absolute", top: 64, right: -6, transform: "rotate(11deg)", border: `4px solid ${C.green}`, borderRadius: 10, paddingLeft: 13, paddingRight: 13, paddingTop: 3, paddingBottom: 3, fontFamily: "Anton", fontSize: 40, color: C.green }) }, "YUP!"),
);
const Y = () => page(
  Grid(), Glow("6% 26%", "rgba(196,255,0,0.18)", 46), Glow("96% 92%", "rgba(255,0,110,0.14)", 48), Brackets(),
  TopBar("YUP! · BETS CLOSING IN MINUTES", C.lime),
  el("div", { style: flex({ flex: 1, flexDirection: "column", padding: "14px 56px 26px", position: "relative", zIndex: 5 }) },
    el("div", { style: flex({ flex: 1, flexDirection: "row", alignItems: "center" }) },
      el("div", { style: flex({ flexDirection: "column", flex: 1, paddingRight: 16 }) },
        el("div", { style: flex({ fontFamily: "Anton", fontSize: 178, lineHeight: 0.82, letterSpacing: "-5px", alignItems: "baseline" }) },
          el("div", { style: flex({ color: C.white }) }, "YUP"),
          el("div", { style: flex({ color: C.lime }) }, "!"),
        ),
        el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 21, letterSpacing: "3px", color: C.lime, textTransform: "uppercase", marginTop: 16 }) }, "TINDER FOR PREDICTION MARKETS"),
        el("div", { style: flex({ fontFamily: "DM Sans", fontSize: 26, color: C.white, opacity: 0.85, marginTop: 14, lineHeight: 1.3, maxWidth: 440 }) }, "Bets that settle in minutes. Swipe right, send it."),
        el("div", { style: flex({ gap: 18, marginTop: 28, alignItems: "center" }) },
          el("div", { style: flex({ fontFamily: "Anton", fontSize: 32, color: C.magenta }) }, "← NAH"),
          el("div", { style: flex({ width: 2, height: 28, backgroundColor: C.border }) }),
          el("div", { style: flex({ fontFamily: "Anton", fontSize: 32, color: C.green }) }, "YUP →"),
        ),
      ),
      el("div", { style: flex({ alignItems: "center", justifyContent: "center", paddingLeft: 8 }) }, yupCard()),
    ),
    FootBar([el("div", { style: flex({ color: C.lime }) }, "/YUP"), el("div", { style: flex() }, "·"), el("div", { style: flex() }, "POLYMARKET × KALSHI"), el("div", { style: flex() }, "·"), el("div", { style: flex({ color: C.green }) }, "INSTANT")]),
  ),
);

// ── YUP! DARE — the scroll-stopper: clock + a call the viewer wants to make ──
const dareBtn = (label, color, bord) => el("div", { style: flex({
  flexDirection: "column", alignItems: "center", border: `2px solid ${bord}`, borderRadius: 16,
  paddingTop: 16, paddingBottom: 16, paddingLeft: 40, paddingRight: 40, backgroundColor: C.void2,
}) },
  el("div", { style: flex({ fontFamily: "Anton", fontSize: 48, color }) }, label),
);
const Ydare = () => page(
  Grid(), Glow("50% 4%", "rgba(196,255,0,0.18)", 42), Glow("8% 96%", "rgba(255,0,110,0.13)", 44), Glow("94% 96%", "rgba(0,255,133,0.10)", 42), Brackets(),
  TopBar("YUP! · TINDER FOR MARKETS", C.lime),
  el("div", { style: flex({ flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 56px 14px", position: "relative", zIndex: 5 }) },
    el("div", { style: flex({ alignItems: "center", gap: 11, fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 18, letterSpacing: "4px", color: C.green, textTransform: "uppercase" }) },
      el("div", { style: flex({ width: 9, height: 9, borderRadius: 999, backgroundColor: C.red }) }),
      "BITCOIN · KALSHI · CLOSES IN",
    ),
    el("div", { style: flex({ fontFamily: "Anton", fontSize: 224, lineHeight: 0.8, letterSpacing: "3px", color: C.lime, marginTop: 2 }) }, "0:42"),
    el("div", { style: flex({ fontFamily: "DM Sans", fontWeight: 700, fontSize: 41, color: C.white, marginTop: 12 }) }, "Will BTC be UP in 15 minutes?"),
    el("div", { style: flex({ alignItems: "center", gap: 26, marginTop: 26 }) },
      dareBtn("← NO", C.magenta, C.borderMag),
      el("div", { style: flex({ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 15, letterSpacing: "3px", color: C.muted }) }, "YOUR CALL"),
      dareBtn("YUP →", C.green, C.borderGreen),
    ),
  ),
  el("div", { style: flex({ justifyContent: "center", alignItems: "center", paddingBottom: 30, gap: 12, fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 15, letterSpacing: "3px", color: C.muted, textTransform: "uppercase", zIndex: 5 }) },
    el("div", { style: flex({ color: C.lime }) }, "YUP!"), el("div", { style: flex() }, "·"),
    el("div", { style: flex() }, "BETS THAT SETTLE IN MINUTES, NOT YEARS"), el("div", { style: flex() }, "·"),
    el("div", { style: flex({ color: C.lime }) }, DOMAIN),
  ),
);

console.log("→ fonts…");
const [anton, dm, mono5, mono7] = await Promise.all([
  getFont("Anton", 400), getFont("DM Sans", 400), getFont("JetBrains Mono", 500), getFont("JetBrains Mono", 700),
]);
const fonts = [
  { name: "Anton", data: anton, weight: 400, style: "normal" },
  { name: "DM Sans", data: dm, weight: 400, style: "normal" },
  { name: "JetBrains Mono", data: mono5, weight: 500, style: "normal" },
  { name: "JetBrains Mono", data: mono7, weight: 700, style: "normal" },
];
const cards = { "og-share-a": A, "og-share-b": B, "og-share-c": Cv, "og-share-d": D, "og-share-yup": Ydare, "og-share-yup2": Y };
for (const [name, fn] of Object.entries(cards)) {
  const svg = await satori(fn(), { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  writeFileSync(resolve(projectRoot, `${name}.png`), png);
  console.log(`✓ ${name}.png (${(png.byteLength / 1024).toFixed(0)} KB)`);
}
