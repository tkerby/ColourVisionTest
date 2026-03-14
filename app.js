const HUE_STEPS = 24;
const TRIALS_PER_HUE = 6;
const RESPONSE_LIMIT_MS = 5000;
const MIN_DIVIDER_RATIO = 0.1;
const MAX_DIVIDER_RATIO = 0.9;
const HIT_MARGIN_PX = 28;
const FEEDBACK_MS = 650;

const prep = document.getElementById('prep');
const test = document.getElementById('test');
const results = document.getElementById('results');
const startBtn = document.getElementById('startBtn');
const cantTellBtn = document.getElementById('cantTellBtn');
const pairArea = document.getElementById('pairArea');
const progressTitle = document.getElementById('progressTitle');
const timerText = document.getElementById('timerText');
const feedbackText = document.getElementById('feedbackText');
const avgText = document.getElementById('avgText');
const perHueList = document.getElementById('perHueList');
const radar = document.getElementById('radar');
const saveBtn = document.getElementById('saveBtn');
const shareBtn = document.getElementById('shareBtn');
const restartBtn = document.getElementById('restartBtn');
const historyNode = document.getElementById('history');
const grayStrip = document.getElementById('grayStrip');
const sharedResult = document.getElementById('sharedResult');
const actualMarker = document.getElementById('actualMarker');
const clickMarker = document.getElementById('clickMarker');

let state = {};
let trialTimer;
let locked = false;

function setupGrayscale() {
  grayStrip.innerHTML = '';
  for (let i = 0; i < 8; i += 1) {
    const box = document.createElement('div');
    const tone = 25 + i * 30;
    box.style.background = `rgb(${tone},${tone},${tone})`;
    grayStrip.appendChild(box);
  }
}

function resetState() {
  const hues = Array.from({ length: HUE_STEPS }, (_, i) => i * (360 / HUE_STEPS));
  state = {
    hueIndex: 0,
    trialIndex: 0,
    hues,
    thresholds: Array(HUE_STEPS).fill(null),
    records: hues.map((h) => ({ h, delta: 8, best: null, times: [] })),
    startMs: 0,
    dividerRatio: 0.5,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lchToLab(l, c, hDeg) {
  const hr = (hDeg * Math.PI) / 180;
  return { L: l, a: Math.cos(hr) * c, b: Math.sin(hr) * c };
}

function labToXyz({ L, a, b }) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;

  const xr = fx ** 3 > epsilon ? fx ** 3 : (116 * fx - 16) / kappa;
  const yr = L > kappa * epsilon ? ((L + 16) / 116) ** 3 : L / kappa;
  const zr = fz ** 3 > epsilon ? fz ** 3 : (116 * fz - 16) / kappa;

  return { X: xr * 95.047, Y: yr * 100, Z: zr * 108.883 };
}

function xyzToSrgb({ X, Y, Z }) {
  let x = X / 100;
  let y = Y / 100;
  let z = Z / 100;

  let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let b = x * 0.0557 + y * -0.204 + z * 1.057;

  const gamma = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);
  r = clamp(gamma(r), 0, 1);
  g = clamp(gamma(g), 0, 1);
  b = clamp(gamma(b), 0, 1);

  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

function deltaE76(lab1, lab2) {
  return Math.hypot(lab1.L - lab2.L, lab1.a - lab2.a, lab1.b - lab2.b);
}

function hideMarkers() {
  actualMarker.classList.add('hidden');
  clickMarker.classList.add('hidden');
}

function setMarker(marker, ratio) {
  marker.style.left = `${(ratio * 100).toFixed(2)}%`;
  marker.classList.remove('hidden');
}

function renderTrial() {
  locked = false;
  hideMarkers();
  feedbackText.textContent = '';

  const rec = state.records[state.hueIndex];
  const h = rec.h;
  const deltaHue = rec.delta;
  const base = lchToLab(65, 45, h);
  const shifted = lchToLab(65, 45, h + deltaHue);
  const leftFirst = Math.random() > 0.5;

  const left = xyzToSrgb(labToXyz(leftFirst ? base : shifted));
  const right = xyzToSrgb(labToXyz(leftFirst ? shifted : base));

  const dividerRatio = Math.random() * (MAX_DIVIDER_RATIO - MIN_DIVIDER_RATIO) + MIN_DIVIDER_RATIO;
  state.dividerRatio = dividerRatio;
  pairArea.style.background = `linear-gradient(to right, ${left} 0 ${(dividerRatio * 100).toFixed(2)}%, ${right} ${(dividerRatio * 100).toFixed(2)}% 100%)`;

  const actualDeltaE = deltaE76(base, shifted);
  rec.currentDeltaE = actualDeltaE;

  progressTitle.textContent = `Hue ${state.hueIndex + 1} / ${HUE_STEPS} · Trial ${state.trialIndex + 1}`;
  state.startMs = Date.now();
  timerText.textContent = `Respond within ${RESPONSE_LIMIT_MS / 1000}s.`;

  clearTimeout(trialTimer);
  trialTimer = setTimeout(() => handleResponse({ canSeeLine: false, timeout: true }), RESPONSE_LIMIT_MS);
}

function nextStep() {
  state.trialIndex += 1;
  if (state.trialIndex >= TRIALS_PER_HUE) {
    const rec = state.records[state.hueIndex];
    state.thresholds[state.hueIndex] = rec.best ?? rec.currentDeltaE;
    state.hueIndex += 1;
    state.trialIndex = 0;
  }

  if (state.hueIndex >= HUE_STEPS) {
    finishTest();
  } else {
    renderTrial();
  }
}

function handleResponse({ canSeeLine, timeout = false, clickRatio = null }) {
  if (locked) return;
  locked = true;
  clearTimeout(trialTimer);

  const rec = state.records[state.hueIndex];
  const elapsed = Date.now() - state.startMs;
  rec.times.push(elapsed);

  const dividerPx = state.dividerRatio * pairArea.clientWidth;
  const clickPx = clickRatio === null ? null : clickRatio * pairArea.clientWidth;
  const clickDistance = clickPx === null ? Infinity : Math.abs(clickPx - dividerPx);

  const success = canSeeLine && !timeout && elapsed <= RESPONSE_LIMIT_MS && clickDistance <= HIT_MARGIN_PX;

  if (success) {
    rec.best = rec.best === null ? rec.currentDeltaE : Math.min(rec.best, rec.currentDeltaE);
    rec.delta = clamp(rec.delta * 0.72, 0.2, 20);
  } else {
    rec.delta = clamp(rec.delta * 1.35, 0.2, 20);
  }

  setMarker(actualMarker, state.dividerRatio);
  if (clickRatio !== null) {
    setMarker(clickMarker, clickRatio);
  } else {
    clickMarker.classList.add('hidden');
  }

  if (timeout) {
    feedbackText.textContent = 'Timed out (>5s). White = actual line.';
  } else if (!canSeeLine) {
    feedbackText.textContent = 'Marked as no line. White = actual line.';
  } else {
    feedbackText.textContent = `${success ? 'Hit ✓' : 'Miss ✕'} — red = your tap, white = actual line.`;
  }

  timerText.textContent = `Response time: ${(elapsed / 1000).toFixed(2)}s`;
  setTimeout(nextStep, FEEDBACK_MS);
}

function drawRadar(values) {
  const ctx = radar.getContext('2d');
  const w = radar.width;
  const h = radar.height;
  const cx = w / 2;
  const cy = h / 2;
  const rMax = 120;
  const maxVal = Math.max(...values, 1);

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#2b3642';
  for (let i = 1; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, (rMax * i) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < values.length; i += 1) {
    const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * rMax, cy + Math.sin(angle) * rMax);
    ctx.stroke();
  }

  ctx.beginPath();
  values.forEach((v, i) => {
    const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    const rr = (v / maxVal) * rMax;
    const x = cx + Math.cos(angle) * rr;
    const y = cy + Math.sin(angle) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(78, 168, 255, 0.35)';
  ctx.strokeStyle = '#4ea8ff';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}

function formatResultPayload(result) {
  const compact = {
    v: 1,
    a: Number(result.average.toFixed(2)),
    t: result.thresholds.map((n) => Number(n.toFixed(2))),
    d: result.date,
  };
  return btoa(JSON.stringify(compact)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parsePayload(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function finishTest() {
  prep.classList.add('hidden');
  test.classList.add('hidden');
  results.classList.remove('hidden');

  const thresholds = state.thresholds.map((v) => (v === null ? 0 : v));
  const average = thresholds.reduce((a, b) => a + b, 0) / thresholds.length;
  const result = { date: new Date().toISOString(), thresholds, average };
  window.latestResult = result;

  avgText.textContent = `Average minimum ΔE detected: ${average.toFixed(2)} (lower is more sensitive).`;
  perHueList.innerHTML = '';
  thresholds.forEach((v, i) => {
    const li = document.createElement('li');
    li.textContent = `Hue ${Math.round((360 / HUE_STEPS) * i)}°: ΔE ${v.toFixed(2)}`;
    perHueList.appendChild(li);
  });
  drawRadar(thresholds);
}

function loadHistory() {
  historyNode.innerHTML = '';
  const items = JSON.parse(localStorage.getItem('jnd-history') || '[]');
  items.slice(-10).reverse().forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${new Date(item.date).toLocaleString()} · Avg ΔE ${item.average.toFixed(2)}`;
    historyNode.appendChild(li);
  });
}

startBtn.addEventListener('click', () => {
  resetState();
  prep.classList.add('hidden');
  test.classList.remove('hidden');
  results.classList.add('hidden');
  renderTrial();
});

pairArea.addEventListener('pointerdown', (event) => {
  if (locked) return;
  const rect = pairArea.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  handleResponse({ canSeeLine: true, clickRatio: ratio });
});

cantTellBtn.addEventListener('click', () => handleResponse({ canSeeLine: false }));

saveBtn.addEventListener('click', () => {
  if (!window.latestResult) return;
  const items = JSON.parse(localStorage.getItem('jnd-history') || '[]');
  items.push(window.latestResult);
  localStorage.setItem('jnd-history', JSON.stringify(items));
  loadHistory();
});

shareBtn.addEventListener('click', () => {
  if (!window.latestResult) return;
  const payload = formatResultPayload(window.latestResult);
  const url = new URL(window.location.href);
  url.searchParams.set('r', payload);
  navigator.clipboard?.writeText(url.toString());
  sharedResult.textContent = `Share URL copied (if clipboard allowed):\n${url}`;
});

restartBtn.addEventListener('click', () => {
  prep.classList.remove('hidden');
  test.classList.add('hidden');
  results.classList.add('hidden');
});

function initShared() {
  const payload = new URLSearchParams(window.location.search).get('r');
  if (!payload) return;
  const parsed = parsePayload(payload);
  if (!parsed || !Array.isArray(parsed.t)) {
    sharedResult.textContent = 'Could not decode shared score.';
    return;
  }
  sharedResult.textContent = `Shared result\nAverage ΔE: ${parsed.a}\nDate: ${parsed.d}`;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

setupGrayscale();
loadHistory();
initShared();
