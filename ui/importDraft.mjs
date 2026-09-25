export const IMPORT_DRAFT_KEY = "1me.playground.stuiImportDraft.v1";
const MODEL_KEY = "studio/lists/studio-configurable-table-v1";

function markerPackage(html) {
  if (typeof html !== "string") return null;
  const match = html.match(/id="stui-experiment-package">([\s\S]*?)<\/script>/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

export function hierarchyFromModelKey(modelKey) {
  const parts = String(modelKey || "").split("/").filter(Boolean);
  if (parts.length < 3) {
    throw new Error("modelKey ei ole kirjaston polku studio/lists/…");
  }
  return { area: parts[0], group: parts[1], model: parts.slice(2).join("/") };
}

/** Validate a Studio Playground export. Does not publish a backend version. */
export function readStudioPlaygroundExport(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.schemaVersion !== 1) {
    throw new Error("Tiedosto ei ole Playground-vienti (schemaVersion 1).");
  }
  let fromHtml = null;
  try {
    fromHtml = markerPackage(raw.html);
  } catch {
    throw new Error("HTML-merkki ei ole kelvollista JSONia.");
  }
  const fromField = raw.stuiExperiment ?? null;
  if (!fromField && !fromHtml) throw new Error("Paketista puuttuu stuiExperiment.");
  if (fromField && fromHtml && JSON.stringify(fromField) !== JSON.stringify(fromHtml)) {
    throw new Error("stuiExperiment ja HTML-merkki eivät täsmää.");
  }
  const pkg = fromField || fromHtml;
  if (!pkg || pkg.packageVersion !== 1) throw new Error("Tuntematon packageVersion.");
  if (pkg.stuiId !== "STUI-20-002") throw new Error("Vain STUI-20-002 voidaan tuoda tässä pilotissa.");
  if (pkg.modelKey !== MODEL_KEY) throw new Error(`modelKey ei ole ${MODEL_KEY}.`);
  if (!pkg.behavior || typeof pkg.behavior.transpose !== "boolean") {
    throw new Error("Paketin behavior.transpose puuttuu.");
  }
  hierarchyFromModelKey(pkg.modelKey);
  return {
    bundle: { ...raw, stuiExperiment: pkg },
    pkg,
    hierarchy: hierarchyFromModelKey(pkg.modelKey),
  };
}

export function withTranspose(bundle, transpose) {
  const pkg = {
    ...bundle.stuiExperiment,
    behavior: { ...bundle.stuiExperiment.behavior, transpose: Boolean(transpose) },
  };
  const json = JSON.stringify(pkg).replace(/</g, "\\u003c");
  const html = String(bundle.html || "").replace(
    /(<script type="application\/json" id="stui-experiment-package">)[\s\S]*?(<\/script>)/,
    `$1${json}$2`,
  );
  return { ...bundle, html, stuiExperiment: pkg };
}
