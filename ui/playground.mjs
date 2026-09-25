import {
  filterCatalog,
  formatCatalogStamp,
  parsePrototypeCatalog,
  sortCatalog,
} from "./catalog.mjs";
import {
  callPublisherTool,
  publisherOperationId,
  publisherSessionFromWindow,
} from "./publisher.mjs";
import {
  IMPORT_DRAFT_KEY,
  IMPORT_LIBRARY_KEY,
  buildStuiModelTree,
  emptyImportLibrary,
  readStudioPlaygroundExport,
  rememberImportedBundle,
} from "./importDraft.mjs";

const status = document.querySelector("#catalog-status");
const table = document.querySelector("#catalog");
const body = table.querySelector("tbody");
const search = document.querySelector("#catalog-search");
const creator = document.querySelector("#catalog-creator");
const clearFilters = document.querySelector("#clear-filters");
const sortButtons = [...table.querySelectorAll("[data-sort]")];
const publisherControls = document.querySelector("#publisher-controls");
const publisherColumn = document.querySelector("#publisher-column");
const publisherStatus = document.querySelector("#publisher-status");
const openTrash = document.querySelector("#open-trash");
const closeTrash = document.querySelector("#close-trash");
const DEFAULT_API_BASE = "https://europe-west1-oneme-dev.cloudfunctions.net/uiPlaygroundPublicHttp";

function configuredApiBase() {
  const params = new URLSearchParams(window.location.search);
  return params.get("apiBase")
    || window.__UIPLAYGROUND_API_BASE__
    || document.querySelector('meta[name="ui-playground-api-base"]')?.content
    || DEFAULT_API_BASE;
}

function apiUrl(path) {
  return `${configuredApiBase().replace(/\/+$/, "")}${path}`;
}

function cell(row, label, value) {
  const element = document.createElement("td");
  element.dataset.label = label;
  element.textContent = value;
  row.append(element);
}

function catalogRow(prototype, state) {
  const row = document.createElement("tr");
  cell(row, "Nimi", prototype.name);
  cell(row, "Tekijä", prototype.creator);
  cell(row, "Versio", prototype.version);
  cell(row, "Kuvaus", prototype.description);
  cell(row, "Luotu", formatCatalogStamp(prototype.createdAt));
  cell(row, "Muokattu", formatCatalogStamp(prototype.updatedAt));
  const openCell = document.createElement("td");
  openCell.dataset.label = "Avaa";
  const link = document.createElement("a");
  link.className = "open";
  link.textContent = "Avaa";
  link.href = prototype.isStatic
    ? prototype.href
    : `view.html?prototypeId=${encodeURIComponent(prototype.prototypeId)}&version=${encodeURIComponent(prototype.versionNumber)}`;
  openCell.append(link);
  row.append(openCell);
  if (state.publisherSession) {
    const managementCell = document.createElement("td");
    managementCell.dataset.label = "Hallinta";
    const actions = document.createElement("div");
    actions.className = "publisher-row-actions";
    // Root-only: one trash/restore action for the whole prototype (no version buttons).
    if (state.showTrash) {
      actions.append(publisherAction("Palauta malli", "restore-model", prototype));
    } else {
      actions.append(publisherAction("Siirrä malli roskakoriin", "trash-model", prototype));
    }
    managementCell.append(actions);
    row.append(managementCell);
  }
  return row;
}

function publisherAction(label, action, prototype) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "publisher-action";
  button.textContent = label;
  button.dataset.publisherAction = action;
  button.dataset.prototypeId = prototype.prototypeId;
  return button;
}

function populateCreators(prototypes) {
  const selected = creator.value;
  const creators = [...new Set(prototypes.map(({ creator: name }) => name))].sort((left, right) =>
    left.localeCompare(right, "fi", { sensitivity: "base" }),
  );
  creator.replaceChildren(new Option("Kaikki tekijät", ""));
  creators.forEach((name) => creator.add(new Option(name, name)));
  creator.value = creators.includes(selected) ? selected : "";
}

function render(state) {
  const filtered = filterCatalog(state.prototypes, { query: search.value, creator: creator.value });
  const visible = sortCatalog(filtered, state.sort);
  body.replaceChildren(...visible.map((prototype) => catalogRow(prototype, state)));
  status.textContent = visible.length
    ? `${visible.length} / ${state.prototypes.length} prototyyppiversiota.`
    : state.showTrash ? "Roskakorissa ei ole prototyyppejä." : "Ei näytettäviä prototyyppejä.";
}

async function loadStaticCatalog() {
  const response = await fetch("data/prototypes.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`static HTTP ${response.status}`);
  return parsePrototypeCatalog(await response.json());
}

/** Static fallback only for network/unreachable failures — never for HTTP error responses. */
function canUseStaticFallback(error) {
  return error instanceof TypeError;
}

async function loadPublicCatalog() {
  const response = await fetch(apiUrl("/catalog"), { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parsePrototypeCatalog(await response.json());
}

function isTrashedPublisherEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  return entry.trashed === true
    || entry.isTrashed === true
    || entry.trashedAt != null
    || entry.deletedAt != null
    || String(entry.status ?? "").toLocaleLowerCase() === "trashed";
}

async function loadTrashCatalog(state) {
  const payload = await callPublisherTool(state.publisherSession, state.publisherSession.tools.list, {
    includeTrashed: true,
  });
  const entries = Array.isArray(payload?.versions)
    ? payload.versions.filter(isTrashedPublisherEntry)
    : Array.isArray(payload?.prototypes)
      ? payload.prototypes.filter(isTrashedPublisherEntry)
      : [];
  // Clear trash markers so parsePrototypeCatalog accepts rows for the trash view.
  return parsePrototypeCatalog({
    versions: entries.map((entry) => ({
      ...entry,
      trashed: false,
      isTrashed: false,
      trashedAt: undefined,
      deletedAt: undefined,
      status: entry.status === "trashed" ? "active" : entry.status,
    })),
  });
}

function setPublisherStatus(message = "") {
  publisherStatus.hidden = !message;
  publisherStatus.textContent = message;
}

async function reloadCatalog(state) {
  if (state.showTrash) {
    const trash = await loadTrashCatalog(state);
    if (trash.error) throw new Error(trash.error);
    state.prototypes = trash.prototypes;
  } else {
    const catalog = await loadPublicCatalog();
    if (catalog.error) throw new Error(catalog.error);
    state.prototypes = catalog.prototypes;
  }
  populateCreators(state.prototypes);
  render(state);
}

function confirmationFor(action, prototype) {
  const model = `mallin “${prototype.name}” kaikki versiot`;
  if (action === "trash-model") return `Haluatko siirtää roskakoriin ${model}?`;
  return `Haluatko palauttaa ${model} roskakorista?`;
}

async function handlePublisherAction(event, state) {
  const button = event.target.closest("[data-publisher-action]");
  if (!button || !state.publisherSession) return;
  const action = button.dataset.publisherAction;
  if (action !== "trash-model" && action !== "restore-model") return;

  const prototype = {
    prototypeId: button.dataset.prototypeId,
    name: button.closest("tr")?.cells[0]?.textContent || button.dataset.prototypeId,
  };
  if (!window.confirm(confirmationFor(action, prototype))) return;

  const isRestore = action === "restore-model";
  const tool = isRestore
    ? state.publisherSession.tools.restore
    : state.publisherSession.tools.trash;
  const args = {
    operationId: publisherOperationId(isRestore ? "restore" : "trash"),
    prototypeId: prototype.prototypeId,
  };
  button.disabled = true;
  setPublisherStatus("Tallennetaan muutosta…");
  try {
    await callPublisherTool(state.publisherSession, tool, args);
    await reloadCatalog(state);
    setPublisherStatus(isRestore ? "Palautus onnistui." : "Siirto roskakoriin onnistui.");
  } catch (error) {
    console.error(error);
    setPublisherStatus(`Toiminto epäonnistui: ${error.message}`);
  } finally {
    button.disabled = false;
  }
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

function appendVersion(parent, version) {
  const item = document.createElement("li");
  const label = version.label === version.modelVersion ? version.label : `${version.label} · ${version.modelVersion}`;
  item.textContent = label;
  const link = document.createElement("a");
  link.href = `view.html?draft=1&entry=${encodeURIComponent(version.id)}`;
  link.textContent = `Avaa ${label} (tuotu luonnos, ei julkaistu versio)`;
  item.append(document.createElement("br"), link);
  parent.append(item);
}

function renderImportHierarchy(library) {
  const root = document.querySelector("#import-hierarchy");
  const status = document.querySelector("#import-status");
  if (!root) return;
  root.replaceChildren();
  const treeData = buildStuiModelTree(library);
  if (treeData.length === 0) return;
  const tree = document.createElement("ol");
  tree.className = "import-tree";
  for (const family of treeData) {
    const familyItem = document.createElement("li");
    familyItem.textContent = family.id;
    const standards = document.createElement("ol");
    for (const standard of family.standards) {
      const standardItem = document.createElement("li");
      standardItem.textContent = standard.id;
      const alternatives = document.createElement("ol");
      for (const alternative of standard.alternatives) {
        const alternativeItem = document.createElement("li");
        alternativeItem.textContent = alternative.id;
        const versions = document.createElement("ol");
        for (const version of alternative.versions) appendVersion(versions, version);
        alternativeItem.append(versions);
        alternatives.append(alternativeItem);
      }
      standardItem.append(alternatives);
      standards.append(standardItem);
    }
    familyItem.append(standards);
    tree.append(familyItem);
  }
  root.append(tree);
  if (status) {
    status.textContent = "STUI-20 näkyy kerran ja STUI-20-002 sen alla. Vaihtoehdot ja versiot eivät ole omia standardeja. Luonnoksia ei ole julkaistu.";
  }
}

function bindImport() {
  const button = document.querySelector("#import-package");
  const input = document.querySelector("#import-file");
  const status = document.querySelector("#import-status");
  if (!button || !input) return;
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const draft = readStudioPlaygroundExport(parsed);
        const remembered = rememberImportedBundle(loadImportLibrary(), draft.bundle);
        sessionStorage.setItem(IMPORT_LIBRARY_KEY, JSON.stringify(remembered.library));
        sessionStorage.setItem(IMPORT_DRAFT_KEY, JSON.stringify(draft.bundle));
        renderImportHierarchy(remembered.library);
      } catch (error) {
        renderImportHierarchy(loadImportLibrary());
        if (status) status.textContent = error instanceof Error ? error.message : "Tuonti epäonnistui.";
      }
    };
    reader.readAsText(file);
  });
  try {
    renderImportHierarchy(loadImportLibrary());
  } catch {
    sessionStorage.removeItem(IMPORT_DRAFT_KEY);
  }
}

async function main() {
  bindImport();
  let catalog;
  let source = "API";
  try {
    catalog = await loadPublicCatalog();
  } catch (error) {
    if (!canUseStaticFallback(error)) {
      console.error(error);
      status.textContent = "Prototyyppiluetteloa ei voitu ladata.";
      return;
    }
    console.warn("UI Playground API catalog was unreachable; using static fallback.", error);
    source = "staattinen varaluettelo";
    try {
      catalog = await loadStaticCatalog();
    } catch (fallbackError) {
      console.error(fallbackError);
      status.textContent = "Prototyyppiluetteloa ei voitu ladata.";
      return;
    }
  }
  if (catalog.error) {
    status.textContent = catalog.error;
    return;
  }

  const publisherSession = publisherSessionFromWindow();
  const state = {
    prototypes: catalog.prototypes,
    sort: null,
    publisherSession: publisherSession.token ? publisherSession : null,
    showTrash: false,
  };
  if (state.publisherSession) {
    publisherControls.hidden = false;
    publisherColumn.hidden = false;
    if (publisherSession.fromDevHarness) {
      setPublisherStatus("Publisher DEV-harness aktiivinen (ei OAuth-kirjautumista).");
    }
  }
  populateCreators(state.prototypes);
  render(state);
  if (source !== "API") status.textContent += " Käytössä on staattinen varaluettelo.";

  search.addEventListener("input", () => render(state));
  creator.addEventListener("change", () => render(state));
  clearFilters.addEventListener("click", () => {
    search.value = "";
    creator.value = "";
    render(state);
  });
  sortButtons.forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    const direction = state.sort?.key === key && state.sort.direction === "asc" ? "desc" : "asc";
    state.sort = { key, direction };
    sortButtons.forEach((candidate) => {
      candidate.setAttribute("aria-sort", candidate === button
        ? (direction === "asc" ? "ascending" : "descending")
        : "none");
    });
    render(state);
  }));
  body.addEventListener("click", (event) => handlePublisherAction(event, state));
  openTrash?.addEventListener("click", async () => {
    if (!state.publisherSession) return;
    state.showTrash = true;
    openTrash.hidden = true;
    closeTrash.hidden = false;
    try {
      await reloadCatalog(state);
      setPublisherStatus("Näytetään roskakori.");
    } catch (error) {
      console.error(error);
      setPublisherStatus(`Roskakorin lataus epäonnistui: ${error.message}`);
    }
  });
  closeTrash?.addEventListener("click", async () => {
    state.showTrash = false;
    openTrash.hidden = false;
    closeTrash.hidden = true;
    try {
      await reloadCatalog(state);
      setPublisherStatus(state.publisherSession?.fromDevHarness
        ? "Publisher DEV-harness aktiivinen (ei OAuth-kirjautumista)."
        : "");
    } catch (error) {
      console.error(error);
      setPublisherStatus(`Luettelon lataus epäonnistui: ${error.message}`);
    }
  });
}

main();
