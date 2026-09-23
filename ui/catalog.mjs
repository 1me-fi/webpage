const REQUIRED_FIELDS = [
  "id",
  "name",
  "author",
  "version",
  "createdAt",
  "updatedAt",
  "description",
  "href",
];

export function parsePrototypeCatalog(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.prototypes)) {
    return {
      prototypes: [],
      skipped: [],
      error: "Prototyyppiluettelo puuttuu tai on virheellinen.",
    };
  }

  const prototypes = [];
  const skipped = [];

  payload.prototypes.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      skipped.push({ index, reason: "entry-not-object" });
      return;
    }
    const missing = REQUIRED_FIELDS.filter((field) => {
      const value = entry[field];
      return typeof value !== "string" || value.trim() === "";
    });
    if (missing.length > 0) {
      skipped.push({ index, id: entry.id ?? null, reason: `missing:${missing.join(",")}` });
      return;
    }
    prototypes.push({
      id: entry.id,
      name: entry.name,
      author: entry.author,
      version: entry.version,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      description: entry.description,
      href: entry.href,
      fixture: typeof entry.fixture === "string" ? entry.fixture : "",
    });
  });

  return { prototypes, skipped, error: null };
}

export function formatCatalogStamp(iso) {
  if (typeof iso !== "string" || iso.trim() === "") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  }).format(date);
}
