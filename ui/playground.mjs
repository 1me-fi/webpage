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
    if (state.showTrash) {
      actions.append(
        publisherAction("Palauta", "restore-version", prototype),
        publisherAction("Palauta koko malli", "restore-model", prototype),
      );
    } else {
      actions.append(
        publisherAction("Siirrä roskakoriin", "trash-version", prototype),
        publisherAction("Siirrä koko malli roskakoriin", "trash-model", prototype),
      );
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
  button.dataset.version = String(prototype.versionNumber);
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

function canUseStaticFallback(error) {
  return error instanceof TypeError;
}

async function loadPublicCatalog() {
  const response = await fetch(apiUrl("/catalog"), { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parsePrototypeCatalog(await response.json());
}

async function loadTrashCatalog(state) {
  const payload = await callPublisherTool(state.publisherSession, state.publisherSession.tools.list, {
    includeTrashed: true,
  });
  const entries = Array.isArray(payload?.versions)
    ? payload.versions.filter((entry) => entry?.trashed || entry?.isTrashed || entry?.trashedAt)
    : [];
  return parsePrototypeCatalog({ versions: entries.map((entry) => ({ ...entry, trashed: false, isTrashed: false, trashedAt: undefined })) });
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
  const version = `mallin “${prototype.name}” version ${prototype.version}`;
  if (action === "trash-model") return `Haluatko siirtää roskakoriin ${model}?`;
  if (action === "trash-version") return `Haluatko siirtää roskakoriin vain ${version}?`;
  if (action === "restore-model") return `Haluatko palauttaa ${model} roskakorista?`;
  return `Haluatko palauttaa vain ${version} roskakorista?`;
}

async function handlePublisherAction(event, state) {
  const button = event.target.closest("[data-publisher-action]");
  if (!button || !state.publisherSession) return;
  const prototype = {
    prototypeId: button.dataset.prototypeId,
    versionNumber: Number(button.dataset.version),
    name: button.closest("tr")?.cells[0]?.textContent || button.dataset.prototypeId,
    version: `v${button.dataset.version}`,
  };
  const action = button.dataset.publisherAction;
  if (!window.confirm(confirmationFor(action, prototype))) return;

  const isModel = action.endsWith("model");
  const isRestore = action.startsWith("restore");
  const tool = isRestore
    ? (isModel ? state.publisherSession.tools.restoreModel : state.publisherSession.tools.restoreVersion)
    : (isModel ? state.publisherSession.tools.trashModel : state.publisherSession.tools.trashVersion);
  const args = {
    operationId: publisherOperationId(isRestore ? "restore" : "trash"),
    prototypeId: prototype.prototypeId,
    ...(isModel ? {} : { versionNumber: prototype.versionNumber }),
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

async function main() {
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
    try { catalog = await loadStaticCatalog(); } catch (fallbackError) {
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
  const state = { prototypes: catalog.prototypes, sort: null, publisherSession: publisherSession.token ? publisherSession : null, showTrash: false };
  if (state.publisherSession) {
    publisherControls.hidden = false;
    publisherColumn.hidden = false;
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
  openTrash.addEventListener("click", async () => {
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
  closeTrash.addEventListener("click", async () => {
    state.showTrash = false;
    openTrash.hidden = false;
    closeTrash.hidden = true;
    try {
      await reloadCatalog(state);
      setPublisherStatus("");
    } catch (error) {
      console.error(error);
      setPublisherStatus(`Luettelon lataus epäonnistui: ${error.message}`);
    }
  });
}

main();
