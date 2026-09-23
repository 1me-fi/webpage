import {
  filterCatalog,
  formatCatalogStamp,
  parsePrototypeCatalog,
  sortCatalog,
} from "./catalog.mjs";

const status = document.querySelector("#catalog-status");
const table = document.querySelector("#catalog");
const body = table.querySelector("tbody");
const search = document.querySelector("#catalog-search");
const creator = document.querySelector("#catalog-creator");
const clearFilters = document.querySelector("#clear-filters");
const sortButtons = [...table.querySelectorAll("[data-sort]")];
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

function catalogRow(prototype) {
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
  return row;
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
  body.replaceChildren(...visible.map(catalogRow));
  status.textContent = visible.length
    ? `${visible.length} / ${state.prototypes.length} prototyyppiversiota.`
    : "Ei näytettäviä prototyyppejä.";
}

async function loadStaticCatalog() {
  const response = await fetch("data/prototypes.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`static HTTP ${response.status}`);
  return parsePrototypeCatalog(await response.json());
}

async function main() {
  let catalog;
  let source = "API";
  try {
    const response = await fetch(apiUrl("/catalog"), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    catalog = parsePrototypeCatalog(await response.json());
  } catch (error) {
    console.warn("UI Playground API catalog failed; using static fallback.", error);
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

  const state = { prototypes: catalog.prototypes, sort: null };
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
}

main();
