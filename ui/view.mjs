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

export function sandboxBundle(bundle) {
  const css = typeof bundle?.css === "string" ? bundle.css : "";
  const html = typeof bundle?.html === "string" ? bundle.html : "";
  const js = typeof bundle?.js === "string" ? bundle.js.replace(/<\/script/gi, "<\\/script") : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:"><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;
}

function apiUrl(prototypeId, version) {
  const base = configuredApiBase().replace(/\/+$/, "");
  return `${base}/prototypes/${encodeURIComponent(prototypeId)}/versions/${encodeURIComponent(version)}`;
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
    const response = await fetch(apiUrl(prototypeId, version), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const prototype = await response.json();
    if (!prototype?.bundle || typeof prototype.bundle !== "object") throw new Error("Bundle puuttuu.");
    name.textContent = prototype.name || prototypeId;
    meta.textContent = `${prototype.creatorDisplay || prototype.createdBy || "—"} · v${prototype.versionNumber ?? version}`;
    frame.srcdoc = sandboxBundle(prototype.bundle);
    status.textContent = "Prototyyppi suoritetaan eristetyssä iframe-kehyksessä.";
  } catch (error) {
    console.error(error);
    name.textContent = "Prototyyppiä ei voitu avata";
    status.textContent = "Julkaistua prototyyppiversiota ei löytynyt tai sitä ei voitu ladata.";
  }
}

main();
