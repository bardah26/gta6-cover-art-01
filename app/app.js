// Solara Cover Studio — offline GTA-style cover art maker.
// All rendering happens on one canvas: drawCover(ctx, w, h) paints the
// multi-panel cover at any size, so the live preview and the exported
// PNG are the same drawing. Photos never leave the machine.

'use strict';

const SAMPLE_PHOTOS = [
  { name: 'Sunset Blvd', src: 'samples/sunset-boulevard.jpg' },
  { name: 'Coastal Hwy', src: 'samples/coastal-highway.jpg' },
  { name: 'Neon Skyline', src: 'samples/neon-skyline.jpg' },
];

// Panel rectangles as fractions of the cover (x, y, width, height).
const LAYOUTS = {
  solo: [{ x: 0, y: 0, w: 1, h: 1 }],
  duo: [
    { x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0, w: 0.5, h: 1 },
  ],
  trio: [
    { x: 0, y: 0, w: 0.62, h: 1 },
    { x: 0.62, y: 0, w: 0.38, h: 0.5 },
    { x: 0.62, y: 0.5, w: 0.38, h: 0.5 },
  ],
  grid: [
    { x: 0, y: 0, w: 1, h: 0.58 },
    { x: 0, y: 0.58, w: 0.34, h: 0.42 },
    { x: 0.34, y: 0.58, w: 0.33, h: 0.42 },
    { x: 0.67, y: 0.58, w: 0.33, h: 0.42 },
  ],
};

const GRADES = ['sunset', 'neon', 'golden', 'noir'];
const SIZES = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1920x1080': [1920, 1080] };

const state = {
  layout: 'grid',
  grade: 'sunset',
  size: '1080x1080',
  title: 'SOLARA BAY',
  subtitle: 'Every street has a story',
  titleColor: '#ffffff',
  titleScale: 100,
  captionPos: 'bottom',
  library: [], // { name, img }
  panels: [], // { photo: library index or null, zoom, ox, oy }
  selected: 0,
};

const canvas = document.getElementById('cover');
const ctx = canvas.getContext('2d');

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image: ' + src));
    img.src = src;
  });
}

function resetPanels() {
  const count = LAYOUTS[state.layout].length;
  const old = state.panels;
  state.panels = [];
  for (let i = 0; i < count; i++) {
    state.panels.push(old[i] ? old[i] : { photo: null, zoom: 1, ox: 0, oy: 0 });
  }
  if (state.selected >= count) state.selected = 0;
}

function panelRect(i, w, h) {
  const p = LAYOUTS[state.layout][i];
  return { x: p.x * w, y: p.y * h, w: p.w * w, h: p.h * h };
}

function drawPhotoInPanel(c, panel, rect) {
  const photo = state.library[panel.photo];
  if (!photo || !photo.img) return;
  const img = photo.img;
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * panel.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + panel.ox * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + panel.oy * rect.h;
  c.save();
  c.beginPath();
  c.rect(rect.x, rect.y, rect.w, rect.h);
  c.clip();
  if (state.grade === 'noir') c.filter = 'grayscale(1) contrast(1.12)';
  c.drawImage(img, dx, dy, dw, dh);
  c.restore();
}

function applyGrade(c, w, h) {
  const top = { sunset: '#ff2e88', neon: '#00e5ff', golden: '#ffb347', noir: '#888888' }[state.grade];
  const bottom = { sunset: '#ff7a18', neon: '#ff00a8', golden: '#ff7a18', noir: '#222222' }[state.grade];
  const grad = c.createLinearGradient(0, 0, w * 0.25, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  c.save();
  c.globalAlpha = state.grade === 'noir' ? 0.1 : 0.22;
  c.globalCompositeOperation = 'overlay';
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);
  c.restore();
  // Vignette: darken the corners so the caption pops.
  const vig = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.28)');
  c.fillStyle = vig;
  c.fillRect(0, 0, w, h);
}

function drawCaption(c, w, h) {
  const pad = Math.round(h * 0.045);
  let titleSize = Math.round(h * 0.105 * (state.titleScale / 100));
  const subSize = Math.round(h * 0.026);
  const title = (state.title || 'UNTITLED').toUpperCase();
  c.save();
  c.textBaseline = 'alphabetic';
  c.font = titleSize + 'px Anton, "Arial Black", sans-serif';
  let titleW = c.measureText(title).width;
  // Shrink the title until it fits the cover width (portrait covers are narrow).
  const maxTitleW = w - pad * 2;
  if (titleW > maxTitleW) {
    titleSize = Math.max(10, Math.floor(titleSize * maxTitleW / titleW));
    c.font = titleSize + 'px Anton, "Arial Black", sans-serif';
    titleW = c.measureText(title).width;
  }
  const bottom = state.captionPos === 'bottom';
  const titleY = bottom ? h - pad - subSize - Math.round(h * 0.02) : pad + titleSize;
  const subY = bottom ? h - pad : titleY + subSize + Math.round(h * 0.025);
  const barY = bottom ? titleY - titleSize - Math.round(h * 0.018) : pad + titleSize + Math.round(h * 0.012);
  // Accent bar above the title.
  const bar = c.createLinearGradient(pad, 0, pad + titleW * 0.5, 0);
  bar.addColorStop(0, '#ff2e88');
  bar.addColorStop(1, '#ff7a18');
  c.fillStyle = bar;
  c.fillRect(pad, barY, Math.max(titleW * 0.5, h * 0.08), Math.max(4, Math.round(h * 0.009)));
  // Title with a hard outline and a soft drop shadow.
  c.lineJoin = 'round';
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = Math.round(titleSize * 0.12);
  c.shadowOffsetY = Math.round(titleSize * 0.04);
  c.strokeStyle = '#14081f';
  c.lineWidth = Math.max(3, Math.round(titleSize * 0.14));
  c.strokeText(title, pad, titleY);
  c.shadowColor = 'transparent';
  c.fillStyle = state.titleColor;
  c.fillText(title, pad, titleY);
  // Subtitle.
  c.font = '700 ' + subSize + 'px "Segoe UI", system-ui, Arial, sans-serif';
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = Math.max(2, Math.round(subSize * 0.16));
  c.strokeText(state.subtitle, pad, subY);
  c.fillStyle = '#ffffff';
  c.fillText(state.subtitle, pad, subY);
  c.restore();
}

function drawCover(c, w, h, showSelection) {
  c.save();
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  const gap = Math.max(2, Math.round(w * 0.005));
  for (let i = 0; i < state.panels.length; i++) {
    const r = panelRect(i, w, h);
    const inset = { x: r.x + gap, y: r.y + gap, w: r.w - gap * 2, h: r.h - gap * 2 };
    if (inset.w <= 0 || inset.h <= 0) continue;
    if (state.panels[i].photo === null) {
      c.fillStyle = '#1d0f30';
      c.fillRect(inset.x, inset.y, inset.w, inset.h);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.font = '700 ' + Math.max(14, Math.round(h * 0.022)) + 'px "Segoe UI", system-ui, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('Add a photo', inset.x + inset.w / 2, inset.y + inset.h / 2);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    } else {
      drawPhotoInPanel(c, state.panels[i], inset);
    }
  }
  applyGrade(c, w, h);
  drawCaption(c, w, h);
  if (showSelection) {
    const r = panelRect(state.selected, w, h);
    c.save();
    c.strokeStyle = '#2ee6ff';
    c.lineWidth = Math.max(3, Math.round(w * 0.004));
    c.setLineDash([Math.round(w * 0.012), Math.round(w * 0.008)]);
    c.strokeRect(r.x + gap, r.y + gap, r.w - gap * 2, r.h - gap * 2);
    c.restore();
  }
  c.restore();
}

function renderPreview() {
  const [w, h] = SIZES[state.size];
  // Cover-only mode (used for screenshots of an exported-size cover):
  // size the canvas to fill the viewport; otherwise cap the long side at 900.
  const coverOnly = document.body.classList.contains('cover-only');
  const scale = coverOnly
    ? Math.min(window.innerWidth / w, window.innerHeight / h)
    : Math.min(1, 900 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  drawCover(ctx, canvas.width, canvas.height, !coverOnly);
  document.getElementById('panelHint').textContent =
    'Panel ' + (state.selected + 1) + ' of ' + state.panels.length + ' selected. Drag the photo in the preview to move it, or use the sliders.';
  syncPanelControls();
}

function syncPanelControls() {
  const p = state.panels[state.selected];
  if (!p) return;
  document.getElementById('zoom').value = String(p.zoom);
  document.getElementById('panX').value = String(p.ox);
  document.getElementById('panY').value = String(p.oy);
}

function renderTray() {
  const tray = document.getElementById('tray');
  tray.innerHTML = '';
  if (state.library.length === 0) {
    const span = document.createElement('span');
    span.className = 'empty';
    span.textContent = 'No photos yet — add your own or try a sample.';
    tray.appendChild(span);
    return;
  }
  state.library.forEach((photo, i) => {
    const thumb = document.createElement('img');
    thumb.src = photo.img.src;
    thumb.alt = photo.name;
    thumb.title = photo.name;
    if (state.panels[state.selected] && state.panels[state.selected].photo === i) thumb.classList.add('selected');
    thumb.addEventListener('click', () => {
      state.panels[state.selected].photo = i;
      renderPreview();
      renderTray();
    });
    tray.appendChild(thumb);
  });
}

function addPhotoToLibrary(name, img, assignToSelected) {
  const existing = state.library.findIndex((p) => p.name === name);
  const index = existing >= 0 ? existing : state.library.length;
  if (existing < 0) state.library.push({ name, img });
  else state.library[existing].img = img;
  if (assignToSelected) state.panels[state.selected].photo = index;
  renderTray();
}

async function loadSample(src, assignToSelected) {
  const name = src.split('/').pop();
  const img = await loadImage(src);
  addPhotoToLibrary(name, img, assignToSelected);
  return img;
}

function exportPNG() {
  const [w, h] = SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  drawCover(off.getContext('2d'), w, h, false);
  off.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'solara-cover-' + state.size + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

function panelAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  for (let i = 0; i < state.panels.length; i++) {
    const r = panelRect(i, canvas.width, canvas.height);
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return 0;
}

function bindControls() {
  document.getElementById('upload').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const img = await loadImage(dataUrl);
      addPhotoToLibrary(file.name, img, true);
    }
    renderPreview();
    e.target.value = '';
  });

  document.querySelectorAll('#sampleRow .thumb-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await loadSample(btn.dataset.sample, true);
      renderPreview();
    });
  });

  document.querySelectorAll('#layoutRow button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#layoutRow button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.layout = btn.dataset.layout;
      resetPanels();
      renderPreview();
    });
  });

  document.getElementById('zoom').addEventListener('input', (e) => {
    state.panels[state.selected].zoom = parseFloat(e.target.value);
    renderPreview();
  });
  document.getElementById('panX').addEventListener('input', (e) => {
    state.panels[state.selected].ox = parseFloat(e.target.value);
    renderPreview();
  });
  document.getElementById('panY').addEventListener('input', (e) => {
    state.panels[state.selected].oy = parseFloat(e.target.value);
    renderPreview();
  });

  document.getElementById('fillPanel').addEventListener('click', () => {
    if (state.library.length === 0) return;
    const p = state.panels[state.selected];
    p.photo = p.photo === null ? 0 : (p.photo + 1) % state.library.length;
    p.zoom = 1;
    p.ox = 0;
    p.oy = 0;
    renderPreview();
    renderTray();
  });
  document.getElementById('clearPanel').addEventListener('click', () => {
    state.panels[state.selected].photo = null;
    renderPreview();
    renderTray();
  });

  document.getElementById('title').addEventListener('input', (e) => {
    state.title = e.target.value;
    renderPreview();
  });
  document.getElementById('subtitle').addEventListener('input', (e) => {
    state.subtitle = e.target.value;
    renderPreview();
  });
  document.getElementById('titleSize').addEventListener('input', (e) => {
    state.titleScale = parseInt(e.target.value, 10);
    renderPreview();
  });
  document.querySelectorAll('#colorRow .swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#colorRow .swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.titleColor = btn.dataset.color;
      renderPreview();
    });
  });
  document.querySelectorAll('#posRow button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#posRow button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.captionPos = btn.dataset.pos;
      renderPreview();
    });
  });
  document.querySelectorAll('#gradeRow button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#gradeRow button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.grade = btn.dataset.grade;
      renderPreview();
    });
  });
  document.querySelectorAll('#sizeRow button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sizeRow button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.size = btn.dataset.size;
      renderPreview();
    });
  });

  document.getElementById('exportBtn').addEventListener('click', exportPNG);

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const i = panelAt(e.clientX, e.clientY);
    state.selected = i;
    const rect = canvas.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
    canvas.setPointerCapture(e.pointerId);
    renderPreview();
    renderTray();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = state.panels[state.selected];
    if (!p || p.photo === null) return;
    const r = panelRect(state.selected, canvas.width, canvas.height);
    p.ox = Math.max(-0.4, Math.min(0.4, p.ox + ((e.clientX - drag.x) / drag.w) * (canvas.width / r.w)));
    p.oy = Math.max(-0.4, Math.min(0.4, p.oy + ((e.clientY - drag.y) / drag.h) * (canvas.height / r.h)));
    drag.x = e.clientX;
    drag.y = e.clientY;
    renderPreview();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
}

async function applyQueryParams() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('layout') && LAYOUTS[q.get('layout')]) {
    state.layout = q.get('layout');
    document.querySelectorAll('#layoutRow button').forEach((b) => b.classList.toggle('active', b.dataset.layout === state.layout));
  }
  if (q.get('grade') && GRADES.includes(q.get('grade'))) {
    state.grade = q.get('grade');
    document.querySelectorAll('#gradeRow button').forEach((b) => b.classList.toggle('active', b.dataset.grade === state.grade));
  }
  if (q.get('size') && SIZES[q.get('size')]) {
    state.size = q.get('size');
    document.querySelectorAll('#sizeRow button').forEach((b) => b.classList.toggle('active', b.dataset.size === state.size));
  }
  if (q.get('title')) {
    state.title = q.get('title');
    document.getElementById('title').value = state.title;
  }
  if (q.get('cover') === '1') document.body.classList.add('cover-only');
  if (q.get('sample') === '1') {
    for (const s of SAMPLE_PHOTOS) await loadSample(s.src, false);
    state.panels.forEach((p, i) => { p.photo = i % state.library.length; });
  }
}

resetPanels();
bindControls();
renderTray();
applyQueryParams().then(() => {
  renderPreview();
  renderTray();
});
// First render waits for the Anton display font: drawing before it loads
// would letter the cover in the fallback font. If the font cannot load,
// render anyway with the fallback.
if (document.fonts && document.fonts.load) {
  document.fonts.load('40px Anton').then(renderPreview).catch(renderPreview);
  document.fonts.ready.then(renderPreview);
} else {
  renderPreview();
}
