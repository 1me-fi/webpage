import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { filterCatalog, parsePrototypeCatalog, sortCatalog } from "../catalog.mjs";
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

test("viewer keeps generated bundles in a scripts-only sandbox", () => {
  const viewer = readFileSync(join(ui, "view.html"), "utf8");
  const script = readFileSync(join(ui, "view.mjs"), "utf8");
  assert.match(viewer, /sandbox="allow-scripts"/);
  assert.doesNotMatch(viewer, /allow-same-origin|allow-top-navigation|allow-forms/);
  assert.match(script, /name\.textContent/);
  assert.match(script, /frame\.srcdoc/);
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

test("a broken fixture does not pretend to be a course matrix", () => {
  const matrix = buildCourseMatrix({ course: { id: "x" } });
  assert.equal(matrix.ok, false);
  assert.ok(matrix.problems.includes("modules"));
});
