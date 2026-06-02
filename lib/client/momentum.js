// Shared Momentum Engine — one brain for EDGE LIVE + Conviction.
// Reads the SHAPE of a price run (trend, acceleration, reversal, run-length)
// and renders the sparkline. Pure functions, no DOM/state.

export function lsq(arr) { // least-squares slope (per step)
  const m = arr.length; if (m < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / m, mx = (m - 1) / 2;
  let num = 0, den = 0;
  for (let i = 0; i < m; i++) { num += (i - mx) * (arr[i] - mean); den += (i - mx) ** 2; }
  return den ? num / den : 0;
}

// series: array of probabilities (0..1). Returns a momentum read in ¢ units.
export function analyzeMomentum(series) {
  const n = series.length;
  if (n < 2) return { score: 0, state: "quiet", emoji: "💤", label: "Quiet", delta: 0, recentMove: 0, accel: 0, dir: 0 };
  const c = series.map((v) => v * 100);
  const delta = Math.round(c[n - 1] - c[0]);
  const h = Math.max(2, Math.floor(n / 2));
  const early = lsq(c.slice(0, h)), recent = lsq(c.slice(-h)), full = lsq(c);
  const recentMove = Math.round(c[n - 1] - c[Math.max(0, n - 1 - Math.min(n - 1, 4))]);
  const accel = recent - early, range = Math.max(...c) - Math.min(...c);
  let runLen = 0; const dir0 = Math.sign(c[n - 1] - c[n - 2]);
  for (let i = n - 1; i > 0 && dir0 !== 0; i--) { if (Math.sign(c[i] - c[i - 1]) === dir0) runLen++; else break; }
  let state = "steady", emoji = "➡️", label = "Steady";
  if (Math.abs(delta) < 2 && range < 3) { state = "quiet"; emoji = "💤"; label = "Quiet"; }
  else if ((early > 1.2 && recent < -1.2) || (early < -1.2 && recent > 1.2)) { state = "reversal"; emoji = "🔄"; label = recent > 0 ? "Reversing up" : "Reversing down"; }
  else if (Math.abs(recentMove) >= 6 && Math.abs(accel) >= 1) { state = "breakout"; emoji = recentMove > 0 ? "🚀" : "🔻"; label = recentMove > 0 ? "Breakout" : "Breakdown"; }
  else if (Math.abs(delta) >= 5 || (Math.abs(full) >= 0.5 && runLen >= 2)) { const u = (delta || full) > 0; state = "run"; emoji = u ? "📈" : "📉"; label = u ? "Running up" : "Running down"; }
  const score = Math.abs(recentMove) + Math.abs(accel) * 1.8 + runLen * 1.2 + Math.abs(delta) * 0.3;
  return { score, state, emoji, label, delta, recentMove, accel: Math.round(accel * 10) / 10, dir: Math.sign(recentMove || delta) };
}

export function sparkPath(series, w, h, pad) {
  const min = Math.min(...series), max = Math.max(...series), range = (max - min) || 0.02, n = series.length;
  const X = (i) => pad + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * pad));
  const Y = (v) => h - pad - ((v - min) / range) * (h - 2 * pad);
  let d = ""; series.forEach((v, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) + " "; });
  return { d, lastX: X(n - 1), lastY: Y(series[n - 1]) };
}

// delta sets the trend color. w/h size it (LIVE uses 150×30, Conviction uses big).
export function sparkSvg(series, delta, w = 150, h = 30, pad = 3) {
  const col = delta > 0 ? "var(--green)" : delta < 0 ? "var(--magenta)" : "var(--muted)";
  const { d, lastX, lastY } = sparkPath(series, w, h, pad);
  const sw = h >= 44 ? 2.4 : 1.7, r = h >= 44 ? 3 : 2.2;
  const gid = "sg" + Math.floor(Math.random() * 1e7);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d} L ${lastX.toFixed(1)} ${h} L ${pad} ${h} Z" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="${r}" fill="${col}"/></svg>`;
}
