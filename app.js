'use strict';

// ─── Restaurant Definitions ──────────────────────────────────────
const RESTAURANTS = {
  'graces-asienshop': {
    id:        'graces-asienshop',
    name:      'Graces Asienshop',
    address:   'Albertusstraße, Köln-Innenstadt',
    emoji:     '🍜',
    color:     '#c0392b',
    colorLite: '#faeaea',
    menuUrl:   'https://www.facebook.com/asienshopalbertusstrasse/',
    note:      'Wochenkarte als Bild auf Facebook',
    autoFetch: false,
    pdfUrl:    null,
    fbUrl:     'https://www.facebook.com/photo/?fbid=1415127993750159&set=a.537838708145763',
  },
  'cafe-bauturm': {
    id:        'cafe-bauturm',
    name:      'Café Bauturm',
    address:   'Aachener Straße 24, Köln',
    emoji:     '🍲',
    color:     '#b5560c',
    colorLite: '#fdf0e6',
    menuUrl:   'https://www.cafe-bauturm.de/speisen/business-lunch/',
    note:      'Business Lunch – Wochenkarte',
    autoFetch: true,
    pdfUrl:    null,
    fbUrl:     null,
  },
  'punto-pasta': {
    id:        'punto-pasta',
    name:      'Punto Pasta',
    address:   'Köln-Innenstadt',
    emoji:     '🍝',
    color:     '#2e7d32',
    colorLite: '#e8f5e9',
    menuUrl:   'https://www.puntopasta-koeln.de',
    note:      'Speisekarte als PDF',
    autoFetch: false,
    pdfUrl:    'https://sc97229f836997328.jimcontent.com/download/version/1703434148/module/16653316522/name/20231224_menu-punto-pasta_DE.pdf',
    fbUrl:     null,
  },
  'rich-and-greens': {
    id:        'rich-and-greens',
    name:      'Rich and Greens',
    address:   'Richmodisstraße, Köln',
    emoji:     '🥗',
    color:     '#388e3c',
    colorLite: '#f1f8f2',
    menuUrl:   'https://rich-n-greens.de',
    note:      'Bowls & Salate – Tagesangebote',
    autoFetch: false,
    pdfUrl:    null,
    fbUrl:     null,
  },
};

const DEFAULT_ACTIVE = ['graces-asienshop', 'cafe-bauturm', 'punto-pasta'];
const STORAGE_KEY    = 'koeln-mittagstisch-v2';
const SHARED_MENUS_URL = 'menus.json';
const GITHUB_WORKFLOW_PATH = '.github/workflows/update-menu.yml';
const PROXY          = 'https://api.allorigins.win/raw?url=';

// ─── State ───────────────────────────────────────────────────────
const state = {
  activeRestaurants: [...DEFAULT_ACTIVE],
  coffeeEntries:     [],
  menuContent:       {}, // lokale Entwürfe/Änderungen: { id: { text, imageUrl, updatedAt } }
  sharedMenuContent: {}, // aus menus.json, für alle sichtbar
  selectedPrice:     null,
  lastPublishPayload: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.activeRestaurants))
      state.activeRestaurants = saved.activeRestaurants.filter(id => RESTAURANTS[id]);
    if (Array.isArray(saved.coffeeEntries))
      state.coffeeEntries = saved.coffeeEntries;
    if (saved.menuContent && typeof saved.menuContent === 'object')
      state.menuContent = saved.menuContent;
  } catch { /* ignore */ }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeRestaurants: state.activeRestaurants,
      coffeeEntries:     state.coffeeEntries,
      menuContent:       state.menuContent,
    }));
  } catch { /* ignore */ }
}

async function loadSharedMenus() {
  try {
    const resp = await fetch(`${SHARED_MENUS_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data || typeof data !== 'object') return;
    state.sharedMenuContent = data;
  } catch (err) {
    console.warn('Gemeinsame menus.json konnte nicht geladen werden:', err);
  }
}

function menuEntry(id) {
  const local = state.menuContent[id] || null;
  const shared = state.sharedMenuContent[id] || null;
  if (!local) return shared || {};
  if (!shared) return local;
  return (Number(local.updatedAt || 0) >= Number(shared.updatedAt || 0)) ? local : shared;
}

function isLocalDraft(id) {
  const local = state.menuContent[id];
  const shared = state.sharedMenuContent[id];
  return !!local && Number(local.updatedAt || 0) > Number(shared?.updatedAt || 0);
}

function buildPublishPayload(id) {
  const entry = state.menuContent[id] || menuEntry(id) || {};
  return {
    restaurantId: id,
    text: entry.text || '',
    imageUrl: entry.imageUrl || '',
    updatedAt: entry.updatedAt || Date.now(),
  };
}

function base64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function makeWorkflowUrl() {
  const origin = location.origin;
  const path = location.pathname.split('/').filter(Boolean);
  const repo = path[0] || '';
  if (!/github\.io$/i.test(location.hostname) || !repo) return '';
  const owner = location.hostname.replace(/\.github\.io$/i, '');
  return `https://github.com/${owner}/${repo}/actions/workflows/update-menu.yml`;
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

// ─── Utilities ───────────────────────────────────────────────────
const fmt = v => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const isProbablyImageUrl = url => /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url || '') || /scontent|fbcdn|lookaside/i.test(url || '');

function extractLikelyMenuText(text) {
  return String(text || '')
    .replace(/[|¦]/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/(€)\s+/g, '$1 ')
    .trim();
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function urlToOcrSource(url) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) throw new Error('missing-url');
  if (!isProbablyImageUrl(cleanUrl)) return cleanUrl;

  // Direct image URLs often work. If CORS blocks the image, retry through the public proxy.
  try {
    const resp = await fetch(cleanUrl, { mode: 'cors' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return await fileToDataUrl(blob);
  } catch {
    const resp = await fetch(PROXY + encodeURIComponent(cleanUrl));
    if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
    const blob = await resp.blob();
    return await fileToDataUrl(blob);
  }
}

// ─── Date ────────────────────────────────────────────────────────
function renderDate() {
  document.getElementById('current-date').textContent =
    new Date().toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ─── Pool ────────────────────────────────────────────────────────
function renderPool() {
  const grid      = document.getElementById('pool-grid');
  const available = Object.keys(RESTAURANTS).filter(id => !state.activeRestaurants.includes(id));

  if (available.length === 0) {
    grid.innerHTML = '<p class="pool-empty">Alle Restaurants sind bereits in deiner Liste ✓</p>';
    return;
  }

  grid.innerHTML = available.map(id => {
    const r = RESTAURANTS[id];
    return `<div class="pool-item" draggable="true" data-id="${id}"
                 style="--item-color:${r.color}" title="Klicken oder Ziehen zum Hinzufügen">
      <span class="pool-emoji">${r.emoji}</span>
      <div class="pool-info">
        <strong>${r.name}</strong>
        <small>${r.address}</small>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.pool-item').forEach(el => {
    el.addEventListener('dragstart', App.onPoolDragStart);
    el.addEventListener('dragend',   App.onPoolDragEnd);
    el.addEventListener('click',     () => App.addRestaurant(el.dataset.id));
  });
}

// ─── Card body (view mode HTML) ───────────────────────────────────
function cardBodyViewHtml(id) {
  const r       = RESTAURANTS[id];
  const content = menuEntry(id) || {};
  const text    = content.text || '';
  const updAt   = content.updatedAt;
  const imageUrl = content.imageUrl || r.imageUrl || '';

  const updStr = updAt
    ? `Aktualisiert: ${new Date(updAt).toLocaleDateString('de-DE', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}`
    : '';

  const imageHtml = imageUrl
    ? `<a class="menu-image-link" href="${esc(imageUrl)}" target="_blank" rel="noopener" title="Originalbild öffnen">
         <img class="menu-image" src="${esc(imageUrl)}" alt="Menübild von ${esc(r.name)}" loading="lazy">
       </a>`
    : '';

  const textHtml = text
    ? `<div class="content-display">${esc(text)}</div>`
    : `<div class="content-display empty"><span class="empty-hint">Noch kein Menütext — 🖼️ Bild/OCR oder ✏️ Bearbeiten klicken</span></div>`;

  let btns = '';
  if (r.autoFetch)
    btns += `<button class="card-btn auto-btn" data-auto="${id}">🔄 Auto-laden</button>`;
  if (isLocalDraft(id))
    btns += `<button class="card-btn publish-btn" data-publish="${id}">🚀 Für alle vorbereiten</button>`;
  btns += `<button class="card-btn ocr-btn" data-ocr="${id}">🖼️ Bild/OCR</button>`;
  if (r.pdfUrl)
    btns += `<a  class="card-btn pdf-btn"  href="${esc(r.pdfUrl)}" target="_blank" rel="noopener">📄 PDF</a>`;
  if (r.fbUrl)
    btns += `<a  class="card-btn fb-btn"   href="${esc(r.fbUrl)}"  target="_blank" rel="noopener">📱 Facebook</a>`;
  btns += `<button class="card-btn edit-btn" data-edit="${id}">✏️ Bearbeiten</button>`;

  return `
    <div class="menu-note"><span>📋</span>${r.note}</div>
    ${imageHtml}
    ${textHtml}
    <div class="content-footer">
      <span class="updated-time">${esc(updStr)}${isLocalDraft(id) ? ' · nur lokal gespeichert' : ''}</span>
      <div class="footer-btns">${btns}</div>
    </div>`;
}

function attachBodyListeners(id) {
  const body = document.getElementById(`body-${id}`);
  if (!body) return;
  body.querySelector(`[data-edit="${id}"]`)?.addEventListener('click', () => App.editMenu(id));
  body.querySelector(`[data-ocr="${id}"]`)?.addEventListener('click', () => App.ocrMenu(id));
  body.querySelector(`[data-auto="${id}"]`)?.addEventListener('click', () => App.autoFetch(id));
  body.querySelector(`[data-publish="${id}"]`)?.addEventListener('click', () => App.prepareGithubPublish(id));
}

// ─── Card ────────────────────────────────────────────────────────
function renderCard(r) {
  return `<div class="restaurant-card" draggable="true" data-id="${r.id}"
               style="--card-color:${r.color};--card-color-lite:${r.colorLite}">
    <div class="card-head">
      <div class="card-title-row">
        <div class="card-emoji-ring">${r.emoji}</div>
        <div class="card-title-text">
          <h3>${r.name}</h3>
          <p class="card-address">📍 ${r.address}</p>
        </div>
      </div>
      <div class="card-actions">
        <a class="menu-link" href="${r.menuUrl}" target="_blank" rel="noopener">Webseite&nbsp;↗</a>
        <button class="remove-btn" data-remove="${r.id}" title="Entfernen">✕</button>
      </div>
    </div>
    <div class="card-body" id="body-${r.id}">${cardBodyViewHtml(r.id)}</div>
  </div>`;
}

function renderActiveList() {
  const list = document.getElementById('restaurant-list');

  list.innerHTML = state.activeRestaurants
    .filter(id => RESTAURANTS[id])
    .map(id => renderCard(RESTAURANTS[id]))
    .join('') + `
    <div class="drop-zone" id="end-drop-zone">
      <span>➕ Restaurant hier ablegen</span>
    </div>`;

  list.querySelectorAll('.restaurant-card').forEach(card => {
    card.addEventListener('dragstart', App.onCardDragStart);
    card.addEventListener('dragover',  App.onCardDragOver);
    card.addEventListener('dragleave', App.onCardDragLeave);
    card.addEventListener('drop',      App.onCardDrop);
    card.addEventListener('dragend',   App.onCardDragEnd);
  });
  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => App.removeRestaurant(btn.dataset.remove));
  });

  state.activeRestaurants.filter(id => RESTAURANTS[id]).forEach(id => attachBodyListeners(id));

  const dz = document.getElementById('end-drop-zone');
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dz-active'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dz-active'));
  dz.addEventListener('drop',      App.onEndZoneDrop);
}

function renderAll() {
  renderPool();
  renderActiveList();
  renderCoffee();
}

// ─── Auto-fetch (Café Bauturm) ────────────────────────────────────
async function fetchViaProxy(url) {
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), 14_000);
  try {
    const resp = await fetch(PROXY + encodeURIComponent(url), { signal: ctl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (err) { clearTimeout(tid); throw err; }
}

function extractLunchangebot(doc) {
  // Walk all elements, find one whose text includes "lunchangebot"
  const all = [...doc.querySelectorAll('h1,h2,h3,h4,h5,p,strong,b,div,section')];
  for (const node of all) {
    const txt = (node.textContent || '').toLowerCase().trim();
    if (!txt.includes('lunchangebot') && !txt.includes('unser lunch') && !txt.includes('lunch-angebot')) continue;
    // Collect sibling content after this heading
    let content = '';
    let el = node.nextElementSibling;
    let steps = 0;
    while (el && steps < 30) {
      const tag = el.tagName?.toLowerCase() || '';
      if (['h1','h2','h3'].includes(tag)) break;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) content += t + '\n';
      el = el.nextElementSibling;
      steps++;
    }
    if (content.trim().length > 30) return content.trim();
    // Node might itself be the container
    const self = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (self.length > 80) return self;
  }
  // Fallback: main content area
  const entry = doc.querySelector('.entry-content, .page-content, article, main');
  if (entry) {
    const cl = entry.cloneNode(true);
    cl.querySelectorAll('script,style,nav,header,footer,form').forEach(n => n.remove());
    return (cl.textContent || '').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().substring(0, 2000);
  }
  return null;
}

// ─── App ─────────────────────────────────────────────────────────
const App = {

  // ── Restaurant management ─────────────────────────────────────
  addRestaurant(id) {
    if (!RESTAURANTS[id] || state.activeRestaurants.includes(id)) return;
    state.activeRestaurants.push(id);
    saveState(); renderAll();
  },

  removeRestaurant(id) {
    state.activeRestaurants = state.activeRestaurants.filter(r => r !== id);
    saveState(); renderAll();
  },

  // ── Menu editing ──────────────────────────────────────────────
  editMenu(id) {
    // Disable drag while editing
    const card = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    if (card) card.draggable = false;

    const body    = document.getElementById(`body-${id}`);
    if (!body) return;
    const currentEntry = menuEntry(id) || {};
    const current = currentEntry.text || '';
    const imageUrl = currentEntry.imageUrl || RESTAURANTS[id]?.imageUrl || '';

    body.innerHTML = `
      <div class="edit-mode">
        <label class="field-label" for="img-${id}">Bild-URL optional</label>
        <input class="input menu-image-input" type="url" id="img-${id}" draggable="false"
               placeholder="Direkte Bildadresse einfügen, z. B. https://...jpg" value="${esc(imageUrl)}">
        <textarea class="menu-textarea" id="ta-${id}" draggable="false"
                  placeholder="Menütext hier einfügen oder tippen…">${esc(current)}</textarea>
        <div class="edit-actions">
          <button class="save-btn"   data-save="${id}">💾 Speichern</button>
          <button class="cancel-btn" data-cancel="${id}">Abbrechen</button>
        </div>
      </div>`;

    document.getElementById(`ta-${id}`)?.focus();
    body.querySelector('[data-save]').addEventListener('click',   () => App.saveMenu(id));
    body.querySelector('[data-cancel]').addEventListener('click', () => App._revertToView(id));
  },

  ocrMenu(id) {
    const card = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    if (card) card.draggable = false;

    const body = document.getElementById(`body-${id}`);
    if (!body) return;
    const content = menuEntry(id) || {};
    const imageUrl = content.imageUrl || RESTAURANTS[id]?.imageUrl || '';
    const current = content.text || '';

    body.innerHTML = `
      <div class="edit-mode ocr-mode">
        <div class="ocr-help">
          <strong>Bild automatisch auslesen</strong>
          <span>Füge eine direkte Bildadresse ein oder lade ein Bild hoch. Bei Facebook: Rechtsklick auf das Foto → „Bildadresse kopieren“. Eine normale Facebook-Beitragsseite funktioniert meistens nicht.</span>
        </div>
        <label class="field-label" for="ocr-url-${id}">Bild-URL</label>
        <input class="input menu-image-input" type="url" id="ocr-url-${id}" draggable="false"
               placeholder="https://...jpg / ...png / fbcdn..." value="${esc(imageUrl)}">
        <label class="field-label" for="ocr-file-${id}">oder Bilddatei</label>
        <input class="file-input" type="file" id="ocr-file-${id}" accept="image/*" draggable="false">
        <div class="ocr-preview-wrap" id="ocr-preview-${id}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="Vorschau">` : ''}</div>
        <button class="run-ocr-btn" data-run-ocr="${id}">🔎 Text aus Bild lesen</button>
        <div class="ocr-status" id="ocr-status-${id}"></div>
        <textarea class="menu-textarea" id="ta-${id}" draggable="false"
                  placeholder="OCR-Ergebnis erscheint hier und kann korrigiert werden…">${esc(current)}</textarea>
        <div class="edit-actions">
          <button class="save-btn"   data-save="${id}">💾 Speichern</button>
          <button class="cancel-btn" data-cancel="${id}">Abbrechen</button>
        </div>
      </div>`;

    const urlInput = document.getElementById(`ocr-url-${id}`);
    const fileInput = document.getElementById(`ocr-file-${id}`);
    urlInput?.addEventListener('input', () => App._updateOcrPreview(id, urlInput.value));
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      urlInput.value = dataUrl;
      App._updateOcrPreview(id, dataUrl);
    });
    body.querySelector('[data-run-ocr]').addEventListener('click', () => App.runOcrFromImage(id));
    body.querySelector('[data-save]').addEventListener('click', () => App.saveMenu(id));
    body.querySelector('[data-cancel]').addEventListener('click', () => App._revertToView(id));
  },

  _updateOcrPreview(id, src) {
    const wrap = document.getElementById(`ocr-preview-${id}`);
    if (!wrap) return;
    wrap.innerHTML = src ? `<img src="${esc(src)}" alt="Vorschau">` : '';
  },

  _setOcrStatus(id, msg, isError = false) {
    const el = document.getElementById(`ocr-status-${id}`);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('ocr-error', isError);
  },

  async runOcrFromImage(id) {
    const urlInput = document.getElementById(`ocr-url-${id}`);
    const ta = document.getElementById(`ta-${id}`);
    const btn = document.querySelector(`[data-run-ocr="${id}"]`);
    const rawUrl = urlInput?.value.trim();

    if (!window.Tesseract) {
      App._setOcrStatus(id, 'OCR-Bibliothek konnte nicht geladen werden. Prüfe deine Internetverbindung.', true);
      return;
    }
    if (!rawUrl) {
      App._setOcrStatus(id, 'Bitte zuerst eine Bild-URL einfügen oder eine Datei auswählen.', true);
      urlInput?.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ OCR läuft…';
    App._setOcrStatus(id, 'Bild wird vorbereitet…');

    try {
      const source = rawUrl.startsWith('data:') ? rawUrl : await urlToOcrSource(rawUrl);
      App._setOcrStatus(id, 'Text wird erkannt… 0%');
      const result = await Tesseract.recognize(source, 'deu+eng', {
        logger: m => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            App._setOcrStatus(id, `Text wird erkannt… ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      const extracted = extractLikelyMenuText(result?.data?.text || '');
      if (!extracted) throw new Error('empty');
      ta.value = extracted;
      App._setOcrStatus(id, '✅ Text erkannt. Bitte kurz prüfen und speichern.');
    } catch (err) {
      App._setOcrStatus(id, '⚠️ Konnte das Bild nicht lesen. Bei Facebook bitte direkte Bildadresse oder Screenshot-Datei verwenden.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔎 Text aus Bild lesen';
    }
  },

  saveMenu(id) {
    const ta = document.getElementById(`ta-${id}`);
    const img = document.getElementById(`img-${id}`) || document.getElementById(`ocr-url-${id}`);
    if (!ta) return;
    const text = ta.value.trim();
    const imageUrl = img?.value.trim() || '';
    state.menuContent[id] = { text, imageUrl, updatedAt: Date.now() };
    saveState();
    App._revertToView(id);
    setTimeout(() => App.prepareGithubPublish(id, { silentPrompt: true }), 50);
  },

  _revertToView(id) {
    const card = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    if (card) card.draggable = true;
    const body = document.getElementById(`body-${id}`);
    if (!body) return;
    body.innerHTML = cardBodyViewHtml(id);
    attachBodyListeners(id);
  },

  async prepareGithubPublish(id, options = {}) {
    const payload = buildPublishPayload(id);
    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = base64EncodeUnicode(payloadJson);
    state.lastPublishPayload = payloadBase64;

    const body = document.getElementById(`body-${id}`);
    if (!body) return;
    const existing = body.querySelector('.publish-panel');
    if (existing) existing.remove();

    const workflowUrl = makeWorkflowUrl();
    const panel = document.createElement('div');
    panel.className = 'publish-panel';
    panel.innerHTML = `
      <strong>Änderung für alle veröffentlichen</strong>
      <span>Payload wurde vorbereitet. Kopiere ihn in GitHub unter <em>Actions → Update shared menu → Run workflow</em>.</span>
      <textarea class="publish-payload" readonly>${esc(payloadBase64)}</textarea>
      <div class="publish-actions">
        <button class="card-btn publish-copy-btn" type="button">📋 Payload kopieren</button>
        ${workflowUrl ? `<a class="card-btn publish-open-btn" href="${esc(workflowUrl)}" target="_blank" rel="noopener">GitHub Action öffnen ↗</a>` : ''}
      </div>
      <small>Nach dem Workflow-Run aktualisiert GitHub <code>menus.json</code>; danach sehen alle Besucher das Menü.</small>
    `;
    body.appendChild(panel);

    const copyBtn = panel.querySelector('.publish-copy-btn');
    copyBtn?.addEventListener('click', async () => {
      try {
        await copyToClipboard(payloadBase64);
        copyBtn.textContent = '✓ Kopiert';
        setTimeout(() => copyBtn.textContent = '📋 Payload kopieren', 1600);
      } catch {
        panel.querySelector('.publish-payload')?.select();
      }
    });

    if (options.silentPrompt) {
      try { await copyToClipboard(payloadBase64); copyBtn.textContent = '✓ Payload kopiert'; } catch { /* user can copy manually */ }
    }
  },

  // ── Auto-fetch ────────────────────────────────────────────────
  async autoFetch(id) {
    const r   = RESTAURANTS[id];
    const btn = document.querySelector(`[data-auto="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Lade…'; }

    try {
      const html = await fetchViaProxy(r.menuUrl);
      const doc  = new DOMParser().parseFromString(html, 'text/html');

      let extracted = null;
      if (id === 'cafe-bauturm') extracted = extractLunchangebot(doc);

      if (!extracted) {
        const entry = doc.querySelector('.entry-content,.page-content,article,main');
        if (entry) {
          const cl = entry.cloneNode(true);
          cl.querySelectorAll('script,style,nav,header,footer,form').forEach(n => n.remove());
          extracted = (cl.textContent||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().substring(0,2000);
        }
      }

      if (!extracted || extracted.length < 20) throw new Error('no content');

      state.menuContent[id] = { text: extracted, updatedAt: Date.now() };
      saveState();
      App._revertToView(id);

    } catch {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Auto-laden'; }
      const body = document.getElementById(`body-${id}`);
      if (body) {
        const msg = document.createElement('div');
        msg.className = 'auto-error';
        msg.textContent = '⚠️ Auto-laden fehlgeschlagen – bitte Inhalt manuell einfügen.';
        body.appendChild(msg);
        setTimeout(() => msg.remove(), 4000);
      }
    }
  },

  loadAllMenus() {
    // Only auto-fetches for restaurants where autoFetch is enabled
    state.activeRestaurants
      .filter(id => RESTAURANTS[id]?.autoFetch)
      .forEach(id => App.autoFetch(id));
  },

  // ── Drag & Drop ───────────────────────────────────────────────
  _drag: { id: null, type: null },

  onPoolDragStart(e) {
    App._drag = { id: e.currentTarget.dataset.id, type: 'pool' };
    e.currentTarget.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', App._drag.id);
    document.getElementById('restaurant-list').classList.add('list-drag-active');
  },
  onPoolDragEnd(e) {
    e.currentTarget.classList.remove('is-dragging');
    document.getElementById('restaurant-list').classList.remove('list-drag-active');
    document.querySelectorAll('.dz-active,.card-drag-over').forEach(el =>
      el.classList.remove('dz-active','card-drag-over'));
  },
  onCardDragStart(e) {
    // Don't drag while in edit mode
    if (e.target.closest('.edit-mode')) { e.preventDefault(); return; }
    App._drag = { id: e.currentTarget.dataset.id, type: 'card' };
    e.currentTarget.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', App._drag.id);
  },
  onCardDragOver(e) {
    e.preventDefault();
    const card = e.currentTarget;
    if (card.dataset.id === App._drag.id) return;
    card.classList.add('card-drag-over');
  },
  onCardDragLeave(e) { e.currentTarget.classList.remove('card-drag-over'); },
  onCardDrop(e) {
    e.preventDefault(); e.stopPropagation();
    const targetId = e.currentTarget.dataset.id;
    e.currentTarget.classList.remove('card-drag-over');
    const { id: srcId, type } = App._drag;
    if (type === 'pool') {
      if (!state.activeRestaurants.includes(srcId)) {
        const idx = state.activeRestaurants.indexOf(targetId);
        state.activeRestaurants.splice(idx, 0, srcId);
        saveState(); renderAll();
      }
    } else if (type === 'card' && srcId !== targetId) {
      const from = state.activeRestaurants.indexOf(srcId);
      const to   = state.activeRestaurants.indexOf(targetId);
      state.activeRestaurants.splice(from, 1);
      state.activeRestaurants.splice(to, 0, srcId);
      saveState(); renderAll();
    }
  },
  onCardDragEnd(e) {
    e.currentTarget.classList.remove('is-dragging');
    document.querySelectorAll('.card-drag-over').forEach(el => el.classList.remove('card-drag-over'));
  },
  onListDragOver(e)  { if (e.target === e.currentTarget) e.preventDefault(); },
  onListDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.currentTarget.classList.remove('list-drag-active');
  },
  onListDrop(e) { e.currentTarget.classList.remove('list-drag-active'); },
  onEndZoneDrop(e) {
    e.preventDefault();
    document.getElementById('end-drop-zone').classList.remove('dz-active');
    document.getElementById('restaurant-list').classList.remove('list-drag-active');
    const { id: srcId, type } = App._drag;
    if (type === 'pool' && !state.activeRestaurants.includes(srcId)) App.addRestaurant(srcId);
  },

  // ── Coffee ────────────────────────────────────────────────────
  addCoffee() {
    const priceIn = document.getElementById('custom-price');
    const typeIn  = document.getElementById('coffee-type');
    let price = state.selectedPrice;
    if (!price && priceIn.value) price = parseFloat(priceIn.value.replace(',', '.'));
    if (!price || isNaN(price) || price <= 0) {
      priceIn.classList.add('input-error');
      priceIn.focus();
      setTimeout(() => priceIn.classList.remove('input-error'), 1500);
      return;
    }
    const NAMES = { 1.5:'Espresso', 2.5:'Americano', 3.0:'Cappuccino', 3.5:'Latte Macchiato' };
    const type  = typeIn.value.trim() || NAMES[price] || 'Kaffee';
    state.coffeeEntries.push({ id: Date.now().toString(), price, type, ts: Date.now() });
    state.selectedPrice = null;
    priceIn.value = ''; typeIn.value = '';
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    saveState(); renderCoffee();
    const btn = document.getElementById('add-coffee-btn');
    btn.classList.add('btn-success'); btn.textContent = '✓ Hinzugefügt!';
    setTimeout(() => { btn.classList.remove('btn-success'); btn.textContent = '☕ Kaffee hinzufügen'; }, 1300);
    const cnt = document.getElementById('coffee-count');
    cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump');
  },

  deleteCoffee(id) {
    state.coffeeEntries = state.coffeeEntries.filter(e => e.id !== id);
    saveState(); renderCoffee();
  },

  selectPreset(btn) {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedPrice = parseFloat(btn.dataset.price);
    document.getElementById('custom-price').value = state.selectedPrice.toFixed(2);
    document.getElementById('coffee-type').value  = btn.querySelector('.preset-name').textContent;
  },
};

// ─── Coffee render ────────────────────────────────────────────────
function todayStr()     { return new Date().toDateString(); }
function todayEntries() { const t=todayStr(); return state.coffeeEntries.filter(e=>new Date(e.ts).toDateString()===t); }
function weekEntries()  { const c=Date.now()-7*86_400_000; return state.coffeeEntries.filter(e=>e.ts>=c); }
function monthEntries() {
  const n=new Date();
  return state.coffeeEntries.filter(e=>{const d=new Date(e.ts);return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();});
}

function renderCoffee() {
  const today=todayEntries(), week=weekEntries(), month=monthEntries();
  const sum = arr => arr.reduce((s,e)=>s+e.price,0);
  document.getElementById('coffee-count').textContent       = today.length;
  document.getElementById('coffee-total-today').textContent = fmt(sum(today));
  document.getElementById('week-count').textContent         = `${week.length} ☕`;
  document.getElementById('week-cost').textContent          = fmt(sum(week));
  document.getElementById('month-count').textContent        = `${month.length} ☕`;
  document.getElementById('month-cost').textContent         = fmt(sum(month));

  const listEl = document.getElementById('coffee-list');
  if (!today.length) { listEl.innerHTML='<p class="empty-msg">Noch kein Kaffee heute ☕</p>'; return; }
  listEl.innerHTML = today.slice().reverse().map(e=>`
    <div class="coffee-entry">
      <span class="entry-time">${new Date(e.ts).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</span>
      <span class="entry-type">${esc(e.type)}</span>
      <span class="entry-price">${fmt(e.price)}</span>
      <button class="entry-del" data-del="${e.id}" title="Entfernen">✕</button>
    </div>`).join('');
  listEl.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => App.deleteCoffee(btn.dataset.del)));
}

// ─── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadState();
  renderDate();
  await loadSharedMenus();
  renderAll();

  document.querySelectorAll('.preset-btn').forEach(btn =>
    btn.addEventListener('click', () => App.selectPreset(btn)));
  document.getElementById('add-coffee-btn').addEventListener('click', App.addCoffee);
  ['custom-price','coffee-type'].forEach(id =>
    document.getElementById(id).addEventListener('keydown', e => { if (e.key==='Enter') App.addCoffee(); }));
  document.getElementById('custom-price').addEventListener('input', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    state.selectedPrice = null;
  });
  document.getElementById('refresh-all-btn').addEventListener('click', App.loadAllMenus);
});
