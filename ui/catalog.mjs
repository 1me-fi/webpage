function toIsoString(value) {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value && typeof value === "object") {
    const seconds = typeof value.seconds === "number"
      ? value.seconds
      : typeof value._seconds === "number"
        ? value._seconds
        : null;
    if (seconds != null) return new Date(seconds * 1000).toISOString();
  }
  return "";
}

function versionLabel(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `v${value}`;
  if (typeof value === "string" && value.trim() !== "") {
    return value.startsWith("v") ? value : `v${value}`;
  }
  return "";
}

function versionNumber(value) {
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

function normalizeEntry(entry, index) {
  const prototypeId = entry.prototypeId ?? entry.id;
  const version = versionLabel(entry.versionNumber ?? entry.version);
  const name = entry.name;
  const creator = entry.creatorDisplay ?? entry.createdBy ?? entry.author;
  const description = entry.description ?? "";
  const createdAt = toIsoString(entry.createdAt);
  const updatedAt = toIsoString(entry.updatedAt);
  const staticHref = entry.href;
  const missing = [
    ["id", prototypeId],
    ["name", name],
    ["creator", creator],
    ["version", version],
    ["createdAt", createdAt],
    ["updatedAt", updatedAt],
  ].filter(([, value]) => typeof value !== "string" || value.trim() === "");

  if (missing.length > 0 || (typeof staticHref !== "string" && !prototypeId)) {
    return {
      error: {
        index,
        id: prototypeId ?? null,
        reason: `missing:${missing.map(([field]) => field).join(",")}`,
      },
    };
  }

  return {
    prototype: {
      id: `${prototypeId}:${version}`,
      prototypeId,
      name,
      creator,
      author: creator,
      version,
      versionNumber: versionNumber(version),
      createdAt,
      updatedAt,
      description: typeof description === "string" ? description : "",
      href: typeof staticHref === "string" ? staticHref : "",
      fixture: typeof entry.fixture === "string" ? entry.fixture : "",
      isStatic: typeof staticHref === "string" && staticHref !== "",
    },
  };
}

export function parsePrototypeCatalog(payload) {
  const entries = Array.isArray(payload?.prototypes)
    ? payload.prototypes
    : Array.isArray(payload?.versions)
      ? payload.versions
      : Array.isArray(payload?.items)
        ? payload.items
        : null;
  if (!entries) {
    return {
      prototypes: [],
      skipped: [],
      error: "Prototyyppiluettelo puuttuu tai on virheellinen.",
    };
  }

  const prototypes = [];
  const skipped = [];

  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      skipped.push({ index, reason: "entry-not-object" });
      return;
    }
    const normalized = normalizeEntry(entry, index);
    if (normalized.error) {
      skipped.push(normalized.error);
      return;
    }
    prototypes.push(normalized.prototype);
  });

  return { prototypes, skipped, error: null };
}

export function filterCatalog(prototypes, { query = "", creator = "" } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return prototypes.filter((prototype) => {
    const matchesQuery = !normalizedQuery
      || `${prototype.name} ${prototype.description}`.toLocaleLowerCase().includes(normalizedQuery);
    return matchesQuery && (!creator || prototype.creator === creator);
  });
}

export function sortCatalog(prototypes, sort) {
  if (!sort?.key) return [...prototypes];
  const direction = sort.direction === "desc" ? -1 : 1;
  const key = sort.key;
  return [...prototypes].sort((left, right) => {
    let compared;
    if (key === "version") {
      compared = left.versionNumber - right.versionNumber;
    } else if (key === "createdAt" || key === "updatedAt") {
      compared = new Date(left[key]).getTime() - new Date(right[key]).getTime();
    } else {
      compared = String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "fi", {
        sensitivity: "base",
      });
    }
    return (Number.isNaN(compared) ? 0 : compared) * direction;
  });
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
