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

async function main() {
  const params = new URLSearchParams(window.location.search);
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
