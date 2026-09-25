export const IMPORT_DRAFT_KEY = "1me.playground.stuiImportDraft.v1";
export const IMPORT_LIBRARY_KEY = "1me.playground.stuiImportLibrary.v1";
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

/** STUI-20-002 belongs to family STUI-20. The family is not a second standard. */
export function stuiFamilyId(stuiId) {
  const parts = String(stuiId || "").split("-").filter(Boolean);
  if (parts.length < 3) return String(stuiId || "");
  return parts.slice(0, -1).join("-");
}

/**
 * Alternative is the trial (baseline, or an mcp edit name).
 * A studio export stays under the trial it came from and adds a version.
 */
export function placementForPackage(pkg) {
  const source = pkg?.lineage?.source || "studio-baseline";
  const modelVersion = String(pkg?.modelVersion || "baseline");
  const basedOn = typeof pkg?.lineage?.basedOnModelVersion === "string" ? pkg.lineage.basedOnModelVersion : "";
  if (source === "studio-export" && basedOn) return { alternative: basedOn, version: modelVersion };
  if (source === "mcp-edit") return { alternative: modelVersion, version: "v1" };
  return { alternative: modelVersion, version: "v1" };
}

export function packageFingerprint(pkg) {
  const text = JSON.stringify(pkg);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function emptyImportLibrary() {
  return { entries: [] };
}

export function rememberImportedBundle(library, bundle) {
  const parsed = readStudioPlaygroundExport(bundle);
  const id = packageFingerprint(parsed.pkg);
  const entries = Array.isArray(library?.entries) ? library.entries : [];
  if (entries.some((entry) => entry.id === id)) return { library: { entries }, id, duplicate: true };
  return {
    library: { entries: [...entries, { id, bundle: parsed.bundle }] },
    id,
    duplicate: false,
  };
}

/** One STUI id once. Versions sit under an alternative, not as sibling standards. */
export function buildStuiModelTree(library) {
  const families = [];
  const familyIndex = new Map();
  for (const entry of library?.entries || []) {
    const { pkg } = readStudioPlaygroundExport(entry.bundle);
    const familyId = stuiFamilyId(pkg.stuiId);
    let family = familyIndex.get(familyId);
    if (!family) {
      family = { id: familyId, standards: [], standardIndex: new Map() };
      familyIndex.set(familyId, family);
      families.push(family);
    }
    let standard = family.standardIndex.get(pkg.stuiId);
    if (!standard) {
      standard = { id: pkg.stuiId, alternatives: [], alternativeIndex: new Map() };
      family.standardIndex.set(pkg.stuiId, standard);
      family.standards.push(standard);
    }
    const place = placementForPackage(pkg);
    let alternative = standard.alternativeIndex.get(place.alternative);
    if (!alternative) {
      alternative = { id: place.alternative, versions: [] };
      standard.alternativeIndex.set(place.alternative, alternative);
      standard.alternatives.push(alternative);
    }
    if (!alternative.versions.some((version) => version.id === entry.id)) {
      alternative.versions.push({
        id: entry.id,
        label: place.version,
        modelVersion: pkg.modelVersion,
        stuiId: pkg.stuiId,
      });
    }
  }
  return families.map((family) => ({
    id: family.id,
    standards: family.standards.map((standard) => ({
      id: standard.id,
      alternatives: standard.alternatives.map((alternative) => ({
        id: alternative.id,
        versions: alternative.versions,
      })),
    })),
  }));
}
