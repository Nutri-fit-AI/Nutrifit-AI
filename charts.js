/* ==========================================================================
   CHARTS.JS
   Rendu de tous les graphiques de l'application en Canvas 2D natif et
   pilotage des jauges SVG (ring / gauge semi-circulaire). Aucune
   dépendance externe : tout est dessiné à la main pour rester
   entièrement autonome ("sans framework").
   ========================================================================== */

/** Lit une variable CSS custom (--xxx) déjà résolue pour le thème courant. */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#39ff88';
}

/**
 * Prépare un <canvas> pour un rendu net sur écrans HiDPI : redimensionne
 * le buffer interne selon le ratio de pixels de l'appareil tout en
 * gardant les coordonnées de dessin en pixels CSS.
 */
function setupCanvas(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || (canvas.parentElement ? canvas.parentElement.clientWidth : 300) || 300;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssWidth, h: cssHeight };
}

/** Trace un rectangle aux coins arrondis (radii = [tl, tr, br, bl] ou nombre unique). */
function roundRectPath(ctx, x, y, w, h, radii) {
  const r = typeof radii === 'number' ? [radii, radii, radii, radii] : radii;
  const [tl, tr, br, bl] = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* GRAPHIQUE EN ANNEAU — répartition des macronutriments               */
/* ------------------------------------------------------------------ */
function drawDonutChart(canvasId, segments, legendId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const cssHeight = Number(canvas.getAttribute('height')) || 220;
  const { ctx, w, h } = setupCanvas(canvas, cssHeight);
  ctx.clearRect(0, 0, w, h);

  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1;
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) / 2 - 14;
  const thickness = Math.max(16, radius * 0.34);

  let start = -Math.PI / 2;
  segments.forEach(seg => {
    const sweep = (seg.value / total) * Math.PI * 2;
    if (sweep <= 0) return;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start + 0.015, start + sweep - 0.015);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.stroke();
    start += sweep;
  });

  ctx.fillStyle = cssVar('--text-high');
  ctx.font = "700 20px 'JetBrains Mono', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(total) + ' kcal', cx, cy - 6);
  ctx.font = "400 11px 'Inter', sans-serif";
  ctx.fillStyle = cssVar('--text-low');
  ctx.fillText('répartition cible', cx, cy + 14);

  if (legendId) {
    const legend = document.getElementById(legendId);
    if (legend) {
      legend.innerHTML = segments.map(seg => {
        const pct = Math.round((seg.value / total) * 100);
        return `<div class="chart-legend__item"><span class="chart-legend__dot" style="background:${seg.color}"></span>${seg.label} · ${pct}%</div>`;
      }).join('');
    }
  }
}

/* ------------------------------------------------------------------ */
/* GRAPHIQUE EN BARRES — calories consommées / brûlées sur 7 jours     */
/* ------------------------------------------------------------------ */
function drawBarChart(canvasId, labels, values, options) {
  options = options || {};
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const cssHeight = Number(canvas.getAttribute('height')) || 220;
  const { ctx, w, h } = setupCanvas(canvas, cssHeight);
  ctx.clearRect(0, 0, w, h);

  const padL = 40, padB = 24, padT = 16, padR = 12;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const maxVal = Math.max(...values, options.targetValue || 0, 1) * 1.15;

  ctx.font = "10px 'JetBrains Mono', monospace";
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + chartH - chartH * (i / steps);
    ctx.strokeStyle = cssVar('--border');
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--text-low');
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(maxVal * (i / steps)), padL - 6, y);
  }

  const slot = chartW / Math.max(values.length, 1);
  const barWidth = Math.min(30, slot * 0.5);
  const color = options.color || cssVar('--brand-signal');

  values.forEach((val, i) => {
    const x = padL + slot * i + slot / 2 - barWidth / 2;
    const barH = Math.max((val / maxVal) * chartH, val > 0 ? 2 : 0);
    const y = padT + chartH - barH;
    const grad = ctx.createLinearGradient(0, y, 0, padT + chartH);
    grad.addColorStop(0, color);
    grad.addColorStop(1, options.colorEnd || 'rgba(57,255,136,.18)');
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y, barWidth, barH, [6, 6, 0, 0]);
    ctx.fill();

    ctx.fillStyle = cssVar('--text-low');
    ctx.font = "10px 'Inter', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(labels[i], padL + slot * i + slot / 2, padT + chartH + 6);
  });

  if (options.targetValue) {
    const y = padT + chartH - (options.targetValue / maxVal) * chartH;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = cssVar('--brand-gold');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ------------------------------------------------------------------ */
/* GRAPHIQUE EN COURBE — évolution du poids                            */
/* ------------------------------------------------------------------ */
function drawLineChart(canvasId, labels, values, options) {
  options = options || {};
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const cssHeight = Number(canvas.getAttribute('height')) || 220;
  const { ctx, w, h } = setupCanvas(canvas, cssHeight);
  ctx.clearRect(0, 0, w, h);

  if (!values.length) {
    ctx.fillStyle = cssVar('--text-low');
    ctx.font = "13px 'Inter', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Ajoutez une première pesée pour voir la courbe', w / 2, h / 2);
    return;
  }

  const padL = 38, padB = 22, padT = 16, padR = 14;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const minVal = Math.min(...values), maxVal = Math.max(...values);
  const range = (maxVal - minVal) || 1;
  const lo = minVal - range * 0.2, hi = maxVal + range * 0.2;

  const steps = 4;
  ctx.font = "10px 'JetBrains Mono', monospace";
  for (let i = 0; i <= steps; i++) {
    const val = lo + (hi - lo) * (i / steps);
    const y = padT + chartH - chartH * (i / steps);
    ctx.strokeStyle = cssVar('--border');
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--text-low');
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(val.toFixed(1), padL - 6, y);
  }

  const stepX = values.length > 1 ? chartW / (values.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: padL + stepX * i,
    y: padT + chartH - ((v - lo) / (hi - lo)) * chartH
  }));

  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, 'rgba(57,255,136,.30)');
  grad.addColorStop(1, 'rgba(57,255,136,0)');
  ctx.beginPath();
  ctx.moveTo(points[0].x, padT + chartH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = options.color || cssVar('--brand-signal');
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = options.color || cssVar('--brand-signal');
    ctx.fill();
  });

  ctx.fillStyle = cssVar('--text-low');
  ctx.font = "10px 'Inter', sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6));
  labels.forEach((lab, i) => {
    if (i % labelEvery === 0 || i === labels.length - 1) {
      ctx.fillText(lab, points[i].x, padT + chartH + 6);
    }
  });
}

/* ------------------------------------------------------------------ */
/* JAUGES SVG — anneaux du tableau de bord + jauge semi-circulaire      */
/* ------------------------------------------------------------------ */

/** Anime un anneau SVG (cercle r=52, circonférence ≈ 327) vers `percent`. */
function setRingProgress(elId, percent) {
  const el = document.getElementById(elId);
  if (!el) return;
  const circumference = 2 * Math.PI * 52;
  const clamped = Math.max(0, Math.min(100, percent));
  el.style.strokeDasharray = String(circumference);
  requestAnimationFrame(() => { el.style.strokeDashoffset = String(circumference * (1 - clamped / 100)); });
}

/** Anime la jauge semi-circulaire (longueur de tracé ≈ 251) vers `percent`. */
function setGaugeProgress(elId, percent) {
  const el = document.getElementById(elId);
  if (!el) return;
  const length = 251.3;
  const clamped = Math.max(0, Math.min(100, percent));
  el.style.strokeDasharray = String(length);
  requestAnimationFrame(() => { el.style.strokeDashoffset = String(length * (1 - clamped / 100)); });
}