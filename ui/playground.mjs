import { formatCatalogStamp, parsePrototypeCatalog } from "./catalog.mjs";

const status = document.querySelector("#catalog-status");
const list = document.querySelector("#catalog");

function card(prototype) {
  const item = document.createElement("li");
  item.className = "card";
  item.innerHTML = `
    <h2></h2>
    <p class="desc"></p>
    <dl>
      <div><dt>Tekijä</dt><dd class="author"></dd></div>
      <div><dt>Versio</dt><dd class="version"></dd></div>
      <div><dt>Luotu</dt><dd class="created"></dd></div>
      <div><dt>Muokattu</dt><dd class="updated"></dd></div>
    </dl>
    <a class="open"></a>
  `;
  item.querySelector("h2").textContent = prototype.name;
  item.querySelector(".desc").textContent = prototype.description;
  item.querySelector(".author").textContent = prototype.author;
  item.querySelector(".version").textContent = prototype.version;
  item.querySelector(".created").textContent = formatCatalogStamp(prototype.createdAt);
  item.querySelector(".updated").textContent = formatCatalogStamp(prototype.updatedAt);
  const link = item.querySelector(".open");
  link.textContent = "Avaa proto";
  link.href = prototype.href;
  return item;
}

async function main() {
  try {
    const response = await fetch("data/prototypes.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const catalog = parsePrototypeCatalog(payload);
    if (catalog.error) {
      status.textContent = catalog.error;
      return;
    }
    list.replaceChildren(...catalog.prototypes.map(card));
    if (catalog.prototypes.length === 0) {
      status.textContent = "Ei näytettäviä prototyyppejä.";
      return;
    }
    const skipped = catalog.skipped.length
      ? ` ${catalog.skipped.length} virheellistä riviä ohitettiin.`
      : "";
    status.textContent = `${catalog.prototypes.length} prototyyppiä.${skipped}`;
  } catch (error) {
    status.textContent = "Prototyyppiluetteloa ei voitu ladata. Playgroundin muu sivu säilyy käytettävissä.";
    console.error(error);
  }
}

main();
