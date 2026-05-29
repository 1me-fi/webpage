import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const STORE_KEY = 'oneMeMmdPresets.v2';
const DRAFT_KEY = 'oneMeMmdDraft.v2';
const MANIFEST_URL = '/mmd/diagrams/manifest.json';

const $ = (id) => document.getElementById(id);
const ui = {
  list: $('diagramList'),
  search: $('diagramSearch'),
  category: $('categoryFilter'),
  input: $('mmdInput'),
  status: $('status'),
  validation: $('validationBox'),
  meta: $('metaGrid'),
  canvas: $('diagramCanvas'),
  file: $('fileInput'),
  dropZone: $('dropZone'),
  refresh: $('refreshLibraryBtn'),
  add: $('newDiagramBtn'),
  clearLocal: $('clearLocalBtn'),
  render: $('renderBtn'),
  save: $('saveLocalBtn'),
  copy: $('copyBtn'),
  dlMmd: $('downloadMmdBtn'),
  exportLocal: $('exportLocalBtn'),
  clearEditor: $('clearEditorBtn'),
  zoomOut: $('zoomOutBtn'),
  zoomReset: $('zoomResetBtn'),
  zoomIn: $('zoomInBtn'),
  dlSvg: $('downloadSvgBtn'),
  dlPng: $('downloadPngBtn'),
  dlPdf: $('downloadPdfBtn'),
  print: $('printBtn')
};

let library = [];
let activeId = null;
let currentMeta = {};
let zoom = 1;
let renderTimer = null;

const newTemplate = `%% 1ME-MMD: v1
%% id: =LOCAL+MMD-UUSI-KAAVIO
%% title: Uusi 1ME-kaavio
%% type: flowchart
%% aspect: =LOCAL+MMD-UUSI
%% owner: 1ME
%% status: draft
%% updated: ${new Date().toISOString().slice(0, 10)}
%% tags: local, draft
%% purpose: Kuvaa uusi ajatus selkeänä Mermaid-kaaviona.
%% /1ME-MMD
flowchart TD
  A[Uusi ajatus] --> B{Päätös}
  B -- kyllä --> C[Tallenna presetiksi]
  B -- ei --> D[Muokkaa]
  D --> B`;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  deterministicIds: false,
  flowchart: { htmlLabels: false, useMaxWidth: true, curve: 'basis' },
  sequence: { useMaxWidth: true },
  mindmap: { useMaxWidth: true },
  themeVariables: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    primaryColor: '#fffaf2',
    primaryTextColor: '#1f2933',
    primaryBorderColor: '#c7341c',
    lineColor: '#697386',
    secondaryColor: '#eef6ff',
    tertiaryColor: '#f7f7f7',
    noteBkgColor: '#fff8ea',
    noteTextColor: '#1f2933'
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setStatus(kind, message) {
  ui.status.className = `status ${kind}`;
  ui.status.textContent = message;
}

function stripCodeFence(source) {
  return String(source || '')
    .replace(/^\s*```(?:mermaid|mmd)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function safeFileName(value, fallback = '1me-diagram') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._=-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || fallback;
}

function parseMeta(source) {
  const meta = {};
  for (const raw of String(source || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('%%')) {
      if (line.length > 0) break;
      continue;
    }
    const clean = line.replace(/^%%\s?/, '').trim();
    if (!clean || clean === '/1ME-MMD') continue;
    const idx = clean.indexOf(':');
    if (idx === -1) continue;
    meta[clean.slice(0, idx).trim()] = clean.slice(idx + 1).trim();
  }
  return meta;
}

function detectDiagramType(source) {
  const lines = stripCodeFence(source).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstCodeLine = lines.find((line) => !line.startsWith('%%') && !line.startsWith('---')) || '';
  const match = firstCodeLine.match(/^(flowchart|graph|sequenceDiagram|mindmap|stateDiagram-v2|classDiagram|erDiagram|gantt|timeline|journey|gitGraph|pie)\b/i);
  return match ? match[1] : 'tuntematon';
}

function tagsFrom(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

function itemFromSource(source, overrides = {}) {
  const cleanSource = stripCodeFence(source);
  const meta = parseMeta(cleanSource);
  const id = meta.id || overrides.id || `local-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const title = meta.title || overrides.title || overrides.fileName || 'Nimetön kaavio';
  const tags = tagsFrom(meta.tags || overrides.tags);
  return {
    id,
    title,
    type: meta.type || overrides.type || detectDiagramType(cleanSource),
    aspect: meta.aspect || overrides.aspect || '',
    category: overrides.category || meta.category || (overrides.origin === 'git' ? 'git' : 'preset'),
    status: meta.status || overrides.status || 'draft',
    updated: meta.updated || overrides.updated || new Date().toISOString().slice(0, 10),
    owner: meta.owner || overrides.owner || '',
    purpose: meta.purpose || overrides.purpose || overrides.description || '',
    tags,
    path: overrides.path || '',
    origin: overrides.origin || 'local',
    source: cleanSource
  };
}

function readPresets() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(data) ? data.filter((item) => item && item.source) : [];
  } catch {
    return [];
  }
}

function writePresets(items) {
  localStorage.setItem(STORE_KEY, JSON.stringify(items, null, 2));
}

async function loadManifestItems() {
  const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Manifestia ei voitu ladata (${response.status}).`);
  const manifest = await response.json();
  const items = Array.isArray(manifest.diagrams) ? manifest.diagrams : [];
  return Promise.all(items.map(async (entry) => {
    const fileResponse = await fetch(entry.path, { cache: 'no-store' });
    if (!fileResponse.ok) throw new Error(`Kaaviota ei voitu ladata: ${entry.path}`);
    const source = await fileResponse.text();
    return itemFromSource(source, { ...entry, origin: 'git' });
  }));
}

async function loadLibrary() {
  setStatus('warn', 'Ladataan kaaviokirjastoa...');
  let gitItems = [];
  let warning = '';

  try {
    gitItems = await loadManifestItems();
  } catch (error) {
    warning = error?.message || String(error);
  }

  const presets = readPresets().map((item) => itemFromSource(item.source, { ...item, origin: 'local' }));
  library = [...presets, ...gitItems];
  updateCategories();
  drawList();

  if (library.length) {
    const wanted = activeId && library.find((item) => item.id === activeId) ? activeId : library[0].id;
    await selectItem(wanted, { keepStatus: true });
    setStatus(warning ? 'warn' : 'ok', warning ? `Kirjasto ladattu osittain. ${warning}` : `Kirjasto ladattu. Kaavioita: ${library.length}.`);
  } else {
    ui.input.value = localStorage.getItem(DRAFT_KEY) || newTemplate;
    await renderDiagram();
    setStatus(warning ? 'warn' : 'ok', warning || 'Kirjasto on tyhjä. Luo tai droppaa ensimmäinen .mmd-tiedosto.');
  }
}

function updateCategories() {
  const previous = ui.category.value;
  const categories = [...new Set(library.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fi'));
  ui.category.innerHTML = '<option value="">Kaikki kategoriat</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  if (categories.includes(previous)) ui.category.value = previous;
}

function filteredLibrary() {
  const query = ui.search.value.trim().toLowerCase();
  const category = ui.category.value;
  return library.filter((item) => {
    if (category && item.category !== category) return false;
    if (!query) return true;
    return [item.id, item.title, item.type, item.aspect, item.category, item.status, item.purpose, item.tags.join(' '), item.source]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function drawList() {
  const items = filteredLibrary();
  if (!items.length) {
    ui.list.innerHTML = '<div class="status warn">Ei hakua vastaavia kaavioita. Droppaa .mmd tai tyhjennä haku.</div>';
    return;
  }

  ui.list.innerHTML = items.map((item) => `
    <button class="diagram-item${item.id === activeId ? ' active' : ''}" type="button" data-id="${escapeHtml(item.id)}">
      <span class="diagram-title">${escapeHtml(item.title)}</span>
      <span class="diagram-purpose">${escapeHtml(item.purpose || item.aspect || item.path || 'Ei kuvausta.')}</span>
      <span class="badges">
        <span class="badge">${item.origin === 'git' ? 'Git' : 'Preset'}</span>
        <span class="badge">${escapeHtml(item.type || 'mmd')}</span>
        <span class="badge">${escapeHtml(item.status || 'draft')}</span>
      </span>
      ${item.origin === 'local' ? `<span class="item-actions"><span class="mini-action" data-delete-id="${escapeHtml(item.id)}">Poista</span></span>` : ''}
    </button>
  `).join('');
}

async function selectItem(id, options = {}) {
  const item = library.find((candidate) => candidate.id === id);
  if (!item) return;
  activeId = item.id;
  ui.input.value = item.source;
  drawList();
  await renderDiagram();
  if (!options.keepStatus) setStatus('ok', `Avattu: ${item.title}`);
}

function validateStandard(source, meta) {
  const warnings = [];
  const required = ['1ME-MMD', 'id', 'title', 'type', 'aspect', 'status', 'purpose'];
  for (const field of required) {
    if (!meta[field]) warnings.push(`Puuttuu otsikkokenttä: ${field}`);
  }
  if (meta.id && !/^=[A-Z0-9_]+\+[A-Z0-9_]+-[A-Z0-9_]+/.test(meta.id)) {
    warnings.push('id ei näytä 1ME-aspektikoodilta. Suositus: =FUNCTION+AREA-OBJECT[-WO##]');
  }
  if (meta.aspect && !/^=[A-Z0-9_]+\+[A-Z0-9_]+-[A-Z0-9_]+/.test(meta.aspect)) {
    warnings.push('aspect ei näytä 1ME-aspektikoodilta. Suositus: =FUNCTION+AREA-OBJECT');
  }
  const detected = detectDiagramType(source);
  if (meta.type && detected !== 'tuntematon' && meta.type !== detected) {
    warnings.push(`type-kenttä (${meta.type}) ja Mermaid-tyyppi (${detected}) eivät täsmää.`);
  }
  if (/```/.test(source)) warnings.push('Syötteessä on markdown-koodiaita ``` — poista se ennen tallennusta.');
  if (/api[_-]?key|secret|password|token\s*:/i.test(source)) warnings.push('Mahdollinen salaisuus havaittu. Älä tallenna tokeneita tai avaimia .mmd-kaavioon.');
  return { warnings, detected };
}

function drawMeta(meta, source) {
  currentMeta = meta;
  const fields = ['id', 'title', 'type', 'aspect', 'owner', 'status', 'updated', 'tags', 'purpose'];
  ui.meta.innerHTML = fields.map((field) => `
    <div class="meta-item">
      <div class="meta-label">${escapeHtml(field)}</div>
      <div class="meta-value">${escapeHtml(meta[field] || '—')}</div>
    </div>
  `).join('');

  const validation = validateStandard(source, meta);
  ui.validation.className = validation.warnings.length ? 'status warn' : 'status ok';
  ui.validation.textContent = validation.warnings.length
    ? `Standardivaroitukset:\n- ${validation.warnings.join('\n- ')}`
    : `OK: 1ME-MMD v1 -otsikkoblokki näyttää kelvolliselta. Mermaid-tyyppi: ${validation.detected}.`;
}

async function renderDiagram() {
  const source = stripCodeFence(ui.input.value);
  if (!source) {
    ui.canvas.innerHTML = '<div class="empty-state"><strong>Tyhjä syöte.</strong><br />Droppaa .mmd tai liitä Mermaid-teksti editoriin.</div>';
    setStatus('warn', 'Ei renderöitävää sisältöä.');
    return;
  }

  const meta = parseMeta(source);
  drawMeta(meta, source);

  try {
    setStatus('warn', 'Renderöidään kaaviota...');
    const renderId = `mmd-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const result = await mermaid.render(renderId, source);
    ui.canvas.innerHTML = result.svg;
    localStorage.setItem(DRAFT_KEY, source);
    applyZoom();
    const warnings = validateStandard(source, meta).warnings;
    setStatus(warnings.length ? 'warn' : 'ok', warnings.length ? 'Kaavio renderöityi, mutta standarditarkistus antoi varoituksia.' : 'Kaavio renderöity onnistuneesti.');
  } catch (error) {
    console.error(error);
    ui.canvas.innerHTML = '<div class="empty-state"><strong>Renderöinti epäonnistui.</strong><br />Tarkista Mermaid-syntaksi ja poista markdown-koodiaidat.</div>';
    setStatus('err', `Mermaid-virhe:\n${error?.message || error}`);
  }
}

async function savePreset() {
  const source = stripCodeFence(ui.input.value);
  if (!source) {
    setStatus('warn', 'Tyhjää kaaviota ei tallennettu.');
    return;
  }

  const item = itemFromSource(source, { ...(library.find((candidate) => candidate.id === activeId) || {}), origin: 'local' });
  const preset = {
    id: item.id,
    title: item.title,
    type: item.type,
    aspect: item.aspect,
    category: item.category === 'git' ? 'preset' : item.category,
    status: item.status,
    updated: new Date().toISOString().slice(0, 10),
    owner: item.owner,
    purpose: item.purpose,
    tags: item.tags,
    source
  };

  const presets = readPresets();
  const index = presets.findIndex((candidate) => candidate.id === preset.id);
  if (index >= 0) presets[index] = preset;
  else presets.unshift(preset);
  writePresets(presets);
  activeId = preset.id;
  await loadLibrary();
  setStatus('ok', `Tallennettu presetiksi: ${preset.title}`);
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => /\.(mmd|md|txt)$/i.test(file.name) || file.type.startsWith('text/'));
  if (!files.length) {
    setStatus('warn', 'Droppaa .mmd-, .md- tai .txt-tiedosto.');
    return;
  }

  const presets = readPresets();
  const imported = [];

  for (const file of files) {
    const text = await file.text();
    const item = itemFromSource(text, { fileName: file.name, category: 'import', origin: 'local' });
    const preset = {
      id: item.id,
      title: item.title,
      type: item.type,
      aspect: item.aspect,
      category: item.category,
      status: item.status,
      updated: item.updated,
      owner: item.owner,
      purpose: item.purpose,
      tags: item.tags,
      source: item.source
    };
    const index = presets.findIndex((candidate) => candidate.id === preset.id);
    if (index >= 0) presets[index] = preset;
    else presets.unshift(preset);
    imported.push(preset);
  }

  writePresets(presets);
  activeId = imported[0]?.id || activeId;
  await loadLibrary();
  setStatus('ok', `Tuotu ja tallennettu presetiksi: ${imported.length} tiedosto(a).`);
}

function deletePreset(id) {
  const presets = readPresets().filter((item) => item.id !== id);
  writePresets(presets);
  if (activeId === id) activeId = null;
  loadLibrary();
}

function downloadBlob(content, mimeType, filename) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function svgElement() {
  const svg = ui.canvas.querySelector('svg');
  if (!svg) throw new Error('Kaaviota ei ole renderöity SVG-muodossa.');
  return svg;
}

function svgSize(svg) {
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  if (viewBox && viewBox.width && viewBox.height) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const rect = svg.getBoundingClientRect();
  return { width: Math.max(rect.width || 1000, 100), height: Math.max(rect.height || 700, 100) };
}

function serializedSvg() {
  const svg = svgElement();
  const { width, height } = svgSize(svg);
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(Math.ceil(width)));
  clone.setAttribute('height', String(Math.ceil(height)));
  clone.setAttribute('style', 'background:#ffffff;font-family:Inter,Arial,sans-serif;');
  return new XMLSerializer().serializeToString(clone);
}

async function svgToPng(scale = 2.5) {
  const svg = svgElement();
  const { width, height } = svgSize(svg);
  const blob = new Blob([serializedSvg()], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadPng() {
  const { dataUrl } = await svgToPng();
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${safeFileName(currentMeta.title || currentMeta.id)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadPdf() {
  if (!window.jspdf?.jsPDF) throw new Error('PDF-kirjastoa ei voitu ladata.');
  const { dataUrl, width, height } = await svgToPng();
  const orientation = width >= height ? 'landscape' : 'portrait';
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 34;
  const title = currentMeta.title || '1ME MMD -kaavio';
  const subtitle = [currentMeta.id, currentMeta.aspect, currentMeta.updated].filter(Boolean).join(' · ');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(title, margin, 28);
  if (subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(subtitle, margin, 42);
  }
  const availableW = pageW - margin * 2;
  const availableH = pageH - margin * 2 - 24;
  const ratio = Math.min(availableW / width, availableH / height);
  const drawW = width * ratio;
  const drawH = height * ratio;
  pdf.addImage(dataUrl, 'PNG', (pageW - drawW) / 2, Math.max(58, (pageH - drawH) / 2 + 10), drawW, drawH, undefined, 'FAST');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text('Generated with 1ME MMD View', margin, pageH - 18);
  pdf.save(`${safeFileName(currentMeta.title || currentMeta.id)}.pdf`);
}

function applyZoom() {
  ui.canvas.style.transform = `scale(${zoom})`;
  ui.canvas.style.width = `${100 / zoom}%`;
  ui.zoomReset.textContent = `${Math.round(zoom * 100)} %`;
}

function activateDropState(active) {
  document.body.classList.toggle('is-dragging-file', active);
  if (ui.dropZone) ui.dropZone.classList.toggle('is-active', active);
}

function bindEvents() {
  ui.list.addEventListener('click', async (event) => {
    const deleteTarget = event.target.closest('[data-delete-id]');
    if (deleteTarget) {
      event.preventDefault();
      event.stopPropagation();
      if (confirm('Poistetaanko tämä selainpreset?')) deletePreset(deleteTarget.dataset.deleteId);
      return;
    }
    const button = event.target.closest('[data-id]');
    if (button) await selectItem(button.dataset.id);
  });

  ui.search.addEventListener('input', drawList);
  ui.category.addEventListener('change', drawList);
  ui.refresh.addEventListener('click', loadLibrary);
  ui.render.addEventListener('click', renderDiagram);
  ui.save.addEventListener('click', savePreset);
  ui.add.addEventListener('click', async () => {
    activeId = null;
    ui.input.value = newTemplate;
    drawList();
    await renderDiagram();
    ui.input.focus();
  });
  ui.clearLocal.addEventListener('click', () => {
    if (confirm('Poistetaanko kaikki selaimeen tallennetut presetit? Gitissä olevia kaavioita ei poisteta.')) {
      localStorage.removeItem(STORE_KEY);
      activeId = null;
      loadLibrary();
    }
  });

  ui.file.addEventListener('change', async (event) => {
    await importFiles(event.target.files);
    event.target.value = '';
  });

  ui.input.addEventListener('input', () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderDiagram, 700);
  });

  ui.copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(ui.input.value);
    setStatus('ok', 'MMD kopioitu leikepöydälle.');
  });
  ui.dlMmd.addEventListener('click', () => {
    const meta = parseMeta(ui.input.value);
    downloadBlob(ui.input.value, 'text/plain;charset=utf-8', `${safeFileName(meta.title || meta.id)}.mmd`);
  });
  ui.exportLocal.addEventListener('click', () => {
    downloadBlob(JSON.stringify({ version: 2, exported: new Date().toISOString(), presets: readPresets() }, null, 2), 'application/json;charset=utf-8', '1me-mmd-presets.json');
  });
  ui.clearEditor.addEventListener('click', async () => {
    ui.input.value = '';
    localStorage.removeItem(DRAFT_KEY);
    activeId = null;
    drawList();
    await renderDiagram();
  });

  ui.zoomOut.addEventListener('click', () => { zoom = Math.max(0.35, zoom - 0.1); applyZoom(); });
  ui.zoomIn.addEventListener('click', () => { zoom = Math.min(2.5, zoom + 0.1); applyZoom(); });
  ui.zoomReset.addEventListener('click', () => { zoom = 1; applyZoom(); });
  ui.dlSvg.addEventListener('click', () => downloadBlob(serializedSvg(), 'image/svg+xml;charset=utf-8', `${safeFileName(currentMeta.title || currentMeta.id)}.svg`));
  ui.dlPng.addEventListener('click', () => downloadPng().catch((error) => setStatus('err', error?.message || String(error))));
  ui.dlPdf.addEventListener('click', () => downloadPdf().catch((error) => setStatus('err', error?.message || String(error))));
  ui.print.addEventListener('click', () => window.print());

  const dropTargets = [document.body, ui.dropZone].filter(Boolean);
  for (const target of dropTargets) {
    target.addEventListener('dragenter', (event) => {
      event.preventDefault();
      activateDropState(true);
    });
    target.addEventListener('dragover', (event) => {
      event.preventDefault();
      activateDropState(true);
    });
    target.addEventListener('dragleave', (event) => {
      if (event.target === target) activateDropState(false);
    });
    target.addEventListener('drop', async (event) => {
      event.preventDefault();
      activateDropState(false);
      await importFiles(event.dataTransfer.files);
    });
  }
}

bindEvents();
loadLibrary();
