import {
  IMPORT_DRAFT_KEY,
  IMPORT_LIBRARY_KEY,
  emptyImportLibrary,
  readStudioPlaygroundExport,
  rememberImportedBundle,
  withTranspose,
} from "./importDraft.mjs";
import { sandboxBundle } from "./sandboxBundle.mjs";

const DEFAULT_API_BASE = "https://europe-west1-oneme-dev.cloudfunctions.net/uiPlaygroundPublicHttp";
const name = document.querySelector("#prototype-name");
const meta = document.querySelector("#prototype-meta");
const status = document.querySelector("#viewer-status");
const frame = document.querySelector("#prototype-frame");

function configuredApiBase() {
  const params = new URLSearchParams(window.location.search);
  return params.get("apiBase")
    || window.__UIPLAYGROUND_API_BASE__
    || document.querySelector('meta[name="ui-playground-api-base"]')?.content
    || DEFAULT_API_BASE;
}

function apiUrl(path) {
  const base = configuredApiBase().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function loadFixture(fixtureRef) {
  if (!fixtureRef || typeof fixtureRef !== "string") return null;
  const response = await fetch(apiUrl(`/fixtures/${encodeURIComponent(fixtureRef)}`), { cache: "no-store" });
  if (!response.ok) throw new Error(`fixture HTTP ${response.status}`);
  return response.json();
}

let draftBundle = null;

function showDraft(bundle) {
  const parsed = readStudioPlaygroundExport(bundle);
  draftBundle = bundle;
  name.textContent = parsed.pkg.stuiId;
  meta.textContent = `${parsed.hierarchy.area} / ${parsed.hierarchy.group} / ${parsed.hierarchy.model} · ${parsed.pkg.modelVersion} · tuotu luonnos`;
  frame.srcdoc = sandboxBundle(bundle, null);
  status.textContent = parsed.pkg.behavior.transpose
    ? "Transponointi on päällä. Prototyyppi suoritetaan eristetyssä iframe-kehyksessä."
    : "Prototyyppi suoritetaan eristetyssä iframe-kehyksessä.";
  const editor = document.querySelector("#draft-editor");
  if (editor) editor.hidden = false;
}

function loadImportLibrary() {
  try {
    const raw = sessionStorage.getItem(IMPORT_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : emptyImportLibrary();
    return parsed && Array.isArray(parsed.entries) ? parsed : emptyImportLibrary();
  } catch {
    return emptyImportLibrary();
  }
}

function bindDraftActions() {
  document.querySelector("#draft-transpose")?.addEventListener("click", () => {
    if (!draftBundle) return;
    const parsed = readStudioPlaygroundExport(draftBundle);
    const next = withTranspose(draftBundle, !parsed.pkg.behavior.transpose);
    const remembered = rememberImportedBundle(loadImportLibrary(), next);
    sessionStorage.setItem(IMPORT_LIBRARY_KEY, JSON.stringify(remembered.library));
    sessionStorage.setItem(IMPORT_DRAFT_KEY, JSON.stringify(next));
    showDraft(next);
  });
  document.querySelector("#draft-export")?.addEventListener("click", () => {
    if (!draftBundle) return;
    const parsed = readStudioPlaygroundExport(draftBundle);
    const blob = new Blob([JSON.stringify(draftBundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stui-20-002-${parsed.pkg.modelVersion}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

async function main() {
  bindDraftActions();
  const params = new URLSearchParams(window.location.search);
  if (params.get("draft") === "1") {
    try {
      const entryId = params.get("entry");
      const saved = entryId
        ? loadImportLibrary().entries.find((entry) => entry.id === entryId)?.bundle
        : JSON.parse(sessionStorage.getItem(IMPORT_DRAFT_KEY) || "null");
      if (!saved) throw new Error(entryId ? "Valittua versiota ei ole kirjastossa." : "Tuotua luonnosta ei ole.");
      showDraft(saved);
    } catch (error) {
      name.textContent = "Tuonti puuttuu";
      status.textContent = error instanceof Error ? error.message : "Tuotua luonnosta ei voitu avata.";
    }
    return;
  }
  const prototypeId = params.get("prototypeId");
  const version = params.get("version");
  if (!prototypeId || !version) {
    name.textContent = "Prototyyppi puuttuu";
    status.textContent = "Anna prototypeId ja version URL-parametreina.";
    return;
  }
  try {
    const response = await fetch(
      apiUrl(`/prototypes/${encodeURIComponent(prototypeId)}/versions/${encodeURIComponent(version)}`),
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const prototype = await response.json();
    if (!prototype?.bundle || typeof prototype.bundle !== "object") throw new Error("Bundle puuttuu.");
    const fixtureRef = prototype.bundle.fixtureRef || prototype.fixtureRef || null;
    const fixture = fixtureRef ? await loadFixture(fixtureRef) : null;
    name.textContent = prototype.name || prototypeId;
    meta.textContent = `${prototype.creatorDisplay || prototype.createdBy?.display || prototype.createdBy || "—"} · v${prototype.versionNumber ?? version}`;
    frame.srcdoc = sandboxBundle(prototype.bundle, fixture);
    status.textContent = fixtureRef
      ? "Prototyyppi suoritetaan eristetyssä iframe-kehyksessä (fixture parentista)."
      : "Prototyyppi suoritetaan eristetyssä iframe-kehyksessä.";
  } catch (error) {
    console.error(error);
    frame.removeAttribute("srcdoc");
    name.textContent = "Prototyyppiversio ei ole saatavilla";
    status.textContent = "Pyydetty versio on poistettu, sitä ei ole julkaistu tai sitä ei voitu ladata. Toista versiota ei avata automaattisesti.";
  }
}

main();
