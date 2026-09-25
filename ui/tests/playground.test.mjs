import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { filterCatalog, isTrashedCatalogEntry, parsePrototypeCatalog, sortCatalog } from "../catalog.mjs";
import {
  buildStuiModelTree,
  hierarchyFromModelKey,
  readStudioPlaygroundExport,
  rememberImportedBundle,
  stuiFamilyId,
  withTranspose,
} from "../importDraft.mjs";
import { DEFAULT_PUBLISHER_TOOLS, parseMcpToolResult } from "../publisher.mjs";
import { assertCanonicalFixture, buildCourseMatrix } from "../fixtureView.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ui = join(root, "ui");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("root page stays the public 1ME page", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /Your digital twin/);
  assert.doesNotMatch(html, /UI Playground/);
  const htaccess = readFileSync(join(root, ".htaccess"), "utf8");
  assert.match(htaccess, /Options -Indexes/);
  assert.match(htaccess, /AddType text\/javascript \.mjs/);
});

test("catalog lists only complete prototypes and keeps the page model if a row is bad", () => {
  const catalog = readJson(join(ui, "data", "prototypes.json"));
  const parsed = parsePrototypeCatalog(catalog);
  assert.equal(parsed.error, null);
  assert.equal(parsed.prototypes.length, 1);
  assert.equal(parsed.prototypes[0].name, "Tilamatriisi – demo");

  const broken = parsePrototypeCatalog({
    prototypes: [
      parsed.prototypes[0],
      { id: "broken", name: "Puuttuva" },
    ],
  });
  assert.equal(broken.prototypes.length, 1);
  assert.equal(broken.skipped.length, 1);

  const missing = parsePrototypeCatalog(null);
  assert.equal(missing.prototypes.length, 0);
  assert.ok(missing.error);
});

test("catalog accepts public API version rows and filters plus sorts them safely", () => {
  const parsed = parsePrototypeCatalog({
    versions: [
      {
        prototypeId: "xss",
        name: "<img src=x onerror=alert(1)>",
        creatorDisplay: "Zed",
        versionNumber: 10,
        description: "Alpha description",
        createdAt: "2026-09-23T10:00:00.000Z",
        updatedAt: "2026-09-23T10:00:00.000Z",
      },
      {
        prototypeId: "normal",
        name: "Beta",
        creatorDisplay: "Atte",
        versionNumber: 2,
        description: "Needle",
        createdAt: "2026-09-22T10:00:00.000Z",
        updatedAt: "2026-09-22T10:00:00.000Z",
      },
    ],
  });
  assert.equal(parsed.error, null);
  assert.equal(filterCatalog(parsed.prototypes, { query: "needle" }).length, 1);
  assert.equal(filterCatalog(parsed.prototypes, { query: "img" }).length, 1);
  assert.equal(filterCatalog(parsed.prototypes, { creator: "Atte" })[0].name, "Beta");
  assert.deepEqual(
    sortCatalog(parsed.prototypes, { key: "version", direction: "asc" }).map((prototype) => prototype.version),
    ["v2", "v10"],
  );
  assert.equal(parsed.prototypes[0].name, "<img src=x onerror=alert(1)>");
});

test("catalog accepts Firestore REST timestamp wire format _seconds", () => {
  const parsed = parsePrototypeCatalog({
    versions: [
      {
        prototypeId: "tilamatriisi-atte",
        name: "Tilamatriisi",
        creatorDisplay: "Atte",
        versionNumber: 1,
        createdAt: { _seconds: 1790178917, _nanoseconds: 988000000 },
        updatedAt: { _seconds: 1790178917, _nanoseconds: 988000000 },
      },
    ],
  });
  assert.equal(parsed.error, null);
  assert.equal(parsed.skipped.length, 0);
  assert.equal(parsed.prototypes.length, 1);
  assert.match(parsed.prototypes[0].createdAt, /^20\d{2}-/);
});

test("catalog never renders trashed models or versions from a public payload", () => {
  const parsed = parsePrototypeCatalog({
    versions: [
      {
        prototypeId: "visible",
        name: "Näkyvä",
        creatorDisplay: "Atte",
        versionNumber: 1,
        createdAt: "2026-09-23T10:00:00.000Z",
        updatedAt: "2026-09-23T10:00:00.000Z",
      },
      {
        prototypeId: "deleted-version",
        name: "Poistettu versio",
        creatorDisplay: "Atte",
        versionNumber: 2,
        createdAt: "2026-09-23T10:00:00.000Z",
        updatedAt: "2026-09-23T10:00:00.000Z",
        trashedAt: "2026-09-23T12:00:00.000Z",
      },
      {
        prototypeId: "deleted-model",
        name: "Poistettu malli",
        creatorDisplay: "Atte",
        versionNumber: 1,
        createdAt: "2026-09-23T10:00:00.000Z",
        updatedAt: "2026-09-23T10:00:00.000Z",
        status: "trashed",
      },
      {
        prototypeId: "flagged",
        name: "isTrashed",
        creatorDisplay: "Atte",
        versionNumber: 1,
        createdAt: "2026-09-23T10:00:00.000Z",
        updatedAt: "2026-09-23T10:00:00.000Z",
        isTrashed: true,
      },
    ],
  });
  assert.deepEqual(parsed.prototypes.map((prototype) => prototype.prototypeId), ["visible"]);
  assert.equal(parsed.skipped.filter((entry) => entry.reason === "trashed").length, 3);
  assert.equal(isTrashedCatalogEntry({ deletedAt: "2026-09-23T12:00:00.000Z" }), true);
  assert.equal(isTrashedCatalogEntry({ isTrashed: true }), true);
});

test("publisher controls are root-only trash/restore via MCP tools", () => {
  const script = readFileSync(join(ui, "playground.mjs"), "utf8");
  const page = readFileSync(join(ui, "index.html"), "utf8");
  const publisher = readFileSync(join(ui, "publisher.mjs"), "utf8");
  const viewer = readFileSync(join(ui, "view.mjs"), "utf8");
  const readme = readFileSync(join(ui, "README.md"), "utf8");

  assert.match(page, />Roskakori</);
  assert.match(script, /Siirrä malli roskakoriin/);
  assert.match(script, /Palauta malli/);
  assert.match(script, /includeTrashed: true/);
  assert.doesNotMatch(script, /includeArchived/);
  assert.doesNotMatch(script, /trash-version|restore-version/);
  assert.doesNotMatch(script, /["']trash_version["']|["']restore_version["']/);
  assert.doesNotMatch(publisher, /["']trash_version["']|["']restore_version["']/);
  assert.doesNotMatch(script, /versionNumber: prototype\.versionNumber/);

  assert.equal(DEFAULT_PUBLISHER_TOOLS.trash, "trash_prototype");
  assert.equal(DEFAULT_PUBLISHER_TOOLS.restore, "restore_prototype");
  assert.equal(DEFAULT_PUBLISHER_TOOLS.list, "list_prototypes");
  assert.equal(Object.hasOwn(DEFAULT_PUBLISHER_TOOLS, "trashVersion"), false);
  assert.equal(Object.hasOwn(DEFAULT_PUBLISHER_TOOLS, "restoreVersion"), false);

  assert.match(script, /canUseStaticFallback/);
  assert.match(script, /error instanceof TypeError/);
  assert.match(publisher, /__UIPLAYGROUND_PUBLISHER_ACCESS_TOKEN__/);
  assert.match(publisher, /DEV harness|DEV ONLY|fromDevHarness/i);
  assert.match(readme, /DEV harness/);
  assert.match(readme, /OAuth — ei toteutettu|ei toteutettu tällä sivustolla/i);

  assert.match(viewer, /Toista versiota ei avata automaattisesti/);
  assert.match(viewer, /frame\.removeAttribute\("srcdoc"\)/);
  assert.doesNotMatch(viewer, /latestVersion|fallback.*version|toinen versio/i);

  assert.deepEqual(
    parseMcpToolResult({ result: { content: [{ type: "text", text: "{\"ok\":true}" }] } }),
    { ok: true },
  );
});

test("HTTP catalog errors must not use static fallback; only TypeError may", () => {
  const script = readFileSync(join(ui, "playground.mjs"), "utf8");
  assert.match(script, /function canUseStaticFallback\(error\) \{\s*return error instanceof TypeError;\s*\}/);
  assert.match(script, /if \(!canUseStaticFallback\(error\)\)/);
  assert.match(script, /Prototyyppiluetteloa ei voitu ladata/);
});

test("viewer keeps generated bundles in a scripts-only sandbox", () => {
  const viewer = readFileSync(join(ui, "view.html"), "utf8");
  const script = readFileSync(join(ui, "view.mjs"), "utf8");
  const sandbox = readFileSync(join(ui, "sandboxBundle.mjs"), "utf8");
  assert.match(viewer, /sandbox="allow-scripts"/);
  assert.doesNotMatch(viewer, /allow-same-origin|allow-top-navigation|allow-forms/);
  assert.match(script, /name\.textContent/);
  assert.match(script, /frame\.srcdoc/);
  assert.match(script, /loadFixture/);
  assert.match(script, /sandboxBundle/);
  assert.match(sandbox, /__UIPLAYGROUND_FIXTURE__/);
  assert.match(sandbox, /connect-src 'none'/);
});

test("sandboxBundle injects fixture and escapes script breakouts", async () => {
  const { sandboxBundle, serializeFixtureForSrcdoc } = await import("../sandboxBundle.mjs");
  const fixture = { course: { id: "c1", title: "T</script><img src=x onerror=alert(1)>" } };
  const serialized = serializeFixtureForSrcdoc(fixture);
  assert.doesNotMatch(serialized, /<\/script/i);
  assert.match(serialized, /\\u003c/);
  const doc = sandboxBundle(
    { html: "<main id=\"board\"></main>", css: "body{}", js: "window.__RAN__=true;" },
    fixture,
  );
  assert.match(doc, /window\.__UIPLAYGROUND_FIXTURE__=/);
  assert.match(doc, /connect-src 'none'/);
  assert.doesNotMatch(doc, /<\/script><img/i);
});

test("Tilamatriisi sandbox bundle has no fetch or module imports", async () => {
  const { tilamatriisiSandboxHtml } = await import(
    "../prototypes/tilamatriisi/atte/v1/buildSandboxHtml.mjs"
  );
  const indexHtml = readFileSync(join(ui, "prototypes/tilamatriisi/atte/v1/index.html"), "utf8");
  const js = readFileSync(join(ui, "prototypes/tilamatriisi/atte/v1/proto.sandbox.js"), "utf8");
  const html = tilamatriisiSandboxHtml(indexHtml);
  assert.match(html, /id="course-title"/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /class="back"/);
  assert.match(js, /__UIPLAYGROUND_FIXTURE__/);
  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /\bimport\s/);
  assert.doesNotMatch(js, /\bfrom\s+['"]/);
});

test("listed prototype files exist", () => {
  const catalog = parsePrototypeCatalog(readJson(join(ui, "data", "prototypes.json")));
  for (const prototype of catalog.prototypes) {
    const html = readFileSync(join(ui, prototype.href), "utf8");
    assert.match(html, /Playground/);
    if (prototype.fixture) {
      const fixture = readJson(join(ui, prototype.fixture));
      assert.deepEqual(assertCanonicalFixture(fixture), []);
    }
  }
});

test("LMS fixture follows the canonical course graph and builds a matrix", () => {
  const fixture = readJson(join(ui, "data", "fixtures", "lms-course.json"));
  assert.equal(fixture.fixtureMeta.notProjectData, true);
  assert.equal(fixture.course.status, "published");
  assert.ok(fixture.modules.length >= 2);
  assert.ok(fixture.days.length >= 3);
  assert.ok(fixture.materials.length >= 1);
  assert.ok(fixture.assignments.length >= 1);
  assert.ok(fixture.exams.length >= 1);
  assert.equal(fixture.enrollments[0].role, "learner");

  const matrix = buildCourseMatrix(fixture);
  assert.equal(matrix.ok, true);
  assert.equal(matrix.modules.length, 2);
  const firstDay = matrix.modules[0].days[0];
  assert.ok(firstDay.items.some((item) => item.kind === "material" && item.body.length > 0));
  assert.ok(matrix.modules[1].days[0].items.some((item) => item.kind === "exam" && item.questions.length === 2));
});

test("studio export import keeps the modelKey hierarchy and rejects a foreign STUI", () => {
  const pkg = {
    packageVersion: 1,
    stuiId: "STUI-20-002",
    modelKey: "studio/lists/studio-configurable-table-v1",
    modelVersion: "baseline",
    behavior: { transpose: false, sections: [] },
  };
  const bundle = {
    schemaVersion: 1,
    html: `<script type="application/json" id="stui-experiment-package">${JSON.stringify(pkg)}</script>`,
    css: "",
    js: "",
    stuiExperiment: pkg,
  };
  const imported = readStudioPlaygroundExport(bundle);
  assert.deepEqual(hierarchyFromModelKey(imported.pkg.modelKey), {
    area: "studio",
    group: "lists",
    model: "studio-configurable-table-v1",
  });
  const withRow = {
    ...imported.bundle,
    stuiExperiment: {
      ...imported.pkg,
      fixture: { kind: "synthetic", rows: [{ id: "r1", values: { unit: "A1" } }] },
    },
  };
  withRow.html = withRow.html.replace(
    /(<script type="application\/json" id="stui-experiment-package">)[\s\S]*?(<\/script>)/,
    `$1${JSON.stringify(withRow.stuiExperiment)}$2`,
  );
  const flipped = withTranspose(readStudioPlaygroundExport(withRow).bundle, true);
  assert.equal(flipped.stuiExperiment.behavior.transpose, true);
  assert.equal(flipped.stuiExperiment.fixture.rows[0].id, "r1");
  assert.equal(flipped.stuiExperiment.fixture.rows[0].values.unit, "A1");
  assert.equal(flipped.stuiExperiment.stuiId, "STUI-20-002");
  assert.match(flipped.html, /"transpose":true/);
  assert.match(flipped.html, /"id":"r1"/);
  assert.throws(() => readStudioPlaygroundExport({ schemaVersion: 1, stuiExperiment: { ...pkg, stuiId: "STUI-1" } }), /STUI-20-002/);
  assert.match(readFileSync(join(ui, "index.html"), "utf8"), /Tuo Playground-paketti/);
});

test("STUI-20-002 appears once, with alternatives and versions underneath", () => {
  const basePkg = {
    packageVersion: 1,
    stuiId: "STUI-20-002",
    modelKey: "studio/lists/studio-configurable-table-v1",
    modelVersion: "baseline",
    lineage: { source: "studio-baseline", basedOnModelVersion: null, basedOnContentHash: null },
    behavior: { transpose: false, sections: [] },
    fixture: { rows: [{ id: "r1", values: { unit: "A1" } }] },
  };
  const base = {
    schemaVersion: 1,
    html: `<script type="application/json" id="stui-experiment-package">${JSON.stringify(basePkg)}</script>`,
    css: "",
    js: "",
    stuiExperiment: basePkg,
  };
  const exportedPkg = {
    ...basePkg,
    modelVersion: "baseline-columns",
    behavior: { ...basePkg.behavior, transpose: true },
    lineage: { source: "studio-export", basedOnModelVersion: "baseline", basedOnContentHash: "abc" },
  };
  const exported = {
    ...base,
    html: `<script type="application/json" id="stui-experiment-package">${JSON.stringify(exportedPkg)}</script>`,
    stuiExperiment: exportedPkg,
  };
  const trialPkg = {
    ...basePkg,
    modelVersion: "kokeilu A",
    lineage: { source: "mcp-edit", basedOnModelVersion: "baseline", basedOnContentHash: "def" },
  };
  const trial = {
    ...base,
    html: `<script type="application/json" id="stui-experiment-package">${JSON.stringify(trialPkg)}</script>`,
    stuiExperiment: trialPkg,
  };
  let library = { entries: [] };
  library = rememberImportedBundle(library, base).library;
  library = rememberImportedBundle(library, base).library;
  library = rememberImportedBundle(library, exported).library;
  library = rememberImportedBundle(library, trial).library;
  assert.equal(library.entries.length, 3);
  const tree = buildStuiModelTree(library);
  assert.equal(stuiFamilyId("STUI-20-002"), "STUI-20");
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, "STUI-20");
  assert.equal(tree[0].standards.length, 1);
  assert.equal(tree[0].standards[0].id, "STUI-20-002");
  const alternatives = tree[0].standards[0].alternatives;
  assert.deepEqual(alternatives.map((item) => item.id), ["baseline", "kokeilu A"]);
  assert.deepEqual(alternatives[0].versions.map((item) => item.label), ["v1", "baseline-columns"]);
  assert.equal(alternatives[0].versions[0].stuiId, "STUI-20-002");
  assert.equal(alternatives[1].versions[0].label, "v1");
});

test("a broken fixture does not pretend to be a course matrix", () => {
  const matrix = buildCourseMatrix({ course: { id: "x" } });
  assert.equal(matrix.ok, false);
  assert.ok(matrix.problems.includes("modules"));
});
