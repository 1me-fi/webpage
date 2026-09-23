/**
 * Self-contained Tilamatriisi runtime for sandboxed Playground bundles.
 * Reads synthetic fixture from window.__UIPLAYGROUND_FIXTURE__ (injected by parent viewer).
 * No ES module imports and no network fetches.
 */
(function tilamatriisiSandbox() {
  const CONTENT_KINDS = new Set(["presentation", "task", "material", "exam"]);

  function indexById(items) {
    const map = new Map();
    if (!Array.isArray(items)) return map;
    for (const item of items) {
      if (item && typeof item.id === "string") map.set(item.id, item);
    }
    return map;
  }

  function assertCanonicalFixture(payload) {
    const problems = [];
    if (!payload || typeof payload !== "object") return ["fixture-not-object"];
    if (!payload.course || typeof payload.course.id !== "string" || typeof payload.course.title !== "string") {
      problems.push("course");
    }
    if (!Array.isArray(payload.modules) || payload.modules.length === 0) problems.push("modules");
    if (!Array.isArray(payload.days) || payload.days.length === 0) problems.push("days");
    if (!Array.isArray(payload.materials)) problems.push("materials");
    if (!Array.isArray(payload.assignments)) problems.push("assignments");
    if (!Array.isArray(payload.exams)) problems.push("exams");
    if (!Array.isArray(payload.examQuestions)) problems.push("examQuestions");
    if (!Array.isArray(payload.enrollments)) problems.push("enrollments");
    const courseId = payload.course && payload.course.id;
    for (const day of payload.days || []) {
      if (!day || day.courseId !== courseId || typeof day.moduleId !== "string") {
        problems.push(`day:${day && day.id ? day.id : "unknown"}`);
        continue;
      }
      if (!Array.isArray(day.contentItems)) {
        problems.push(`contentItems:${day.id}`);
        continue;
      }
      for (const item of day.contentItems) {
        if (!item || !CONTENT_KINDS.has(item.kind) || typeof item.refId !== "string") {
          problems.push(`contentItem:${day.id}`);
        }
      }
    }
    return problems;
  }

  function resolveContentItem(item, fixture, materials, assignments, exams) {
    if (item.kind === "material") {
      const material = materials.get(item.refId);
      return {
        id: item.id,
        kind: item.kind,
        refId: item.refId,
        title: item.title,
        learnerVisible: item.learnerVisible === true,
        body: material ? material.contentMarkdown || material.description || "" : "",
        missing: !material,
      };
    }
    if (item.kind === "task") {
      const assignment = assignments.get(item.refId);
      return {
        id: item.id,
        kind: item.kind,
        refId: item.refId,
        title: item.title,
        learnerVisible: item.learnerVisible === true,
        body: assignment ? assignment.instructionsMarkdown || assignment.description || "" : "",
        missing: !assignment,
      };
    }
    if (item.kind === "exam") {
      const exam = exams.get(item.refId);
      const questions = (fixture.examQuestions || [])
        .filter((question) => question && question.examId === item.refId)
        .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0))
        .map((question) => ({
          id: question.id,
          prompt: question.promptMarkdown || "",
          options: Array.isArray(question.options) ? question.options.map((option) => option.label) : [],
        }));
      return {
        id: item.id,
        kind: item.kind,
        refId: item.refId,
        title: item.title,
        learnerVisible: item.learnerVisible === true,
        body: exam ? exam.instructionsMarkdown || exam.description || "" : "",
        questions,
        missing: !exam,
      };
    }
    return {
      id: item.id,
      kind: item.kind,
      refId: item.refId,
      title: item.title,
      learnerVisible: item.learnerVisible === true,
      body: "",
      missing: true,
    };
  }

  function buildCourseMatrix(payload) {
    const problems = assertCanonicalFixture(payload);
    if (problems.length > 0) {
      return { ok: false, problems, courseTitle: "", modules: [], enrollments: [] };
    }
    const materials = indexById(payload.materials);
    const assignments = indexById(payload.assignments);
    const exams = indexById(payload.exams);
    const daysByModule = new Map();
    for (const day of payload.days) {
      const list = daysByModule.get(day.moduleId) || [];
      list.push(day);
      daysByModule.set(day.moduleId, list);
    }
    const modules = [...payload.modules]
      .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0))
      .map((module) => ({
        id: module.id,
        title: module.title,
        description: module.description || "",
        days: (daysByModule.get(module.id) || [])
          .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0))
          .map((day) => ({
            id: day.id,
            title: day.title,
            description: day.description || "",
            startAt: day.startAt,
            items: (day.contentItems || []).map((item) =>
              resolveContentItem(item, payload, materials, assignments, exams),
            ),
          })),
      }));
    return {
      ok: true,
      problems: [],
      courseTitle: payload.course.title,
      courseCode: payload.course.courseCode,
      modules,
      enrollments: payload.enrollments.map((enrollment) => enrollment.userId),
    };
  }

  const title = document.querySelector("#course-title");
  const status = document.querySelector("#proto-status");
  const board = document.querySelector("#board");
  const detail = document.querySelector("#detail");
  const detailTitle = document.querySelector("#detail-title");
  const detailBody = document.querySelector("#detail-body");
  const detailQuestions = document.querySelector("#detail-questions");
  const viewMatrix = document.querySelector("#view-matrix");
  const viewNav = document.querySelector("#view-nav");

  const state = { view: "matrix", moduleId: null, dayId: null, matrix: null };

  function setView(next) {
    state.view = next;
    viewMatrix.setAttribute("aria-pressed", String(next === "matrix"));
    viewNav.setAttribute("aria-pressed", String(next === "nav"));
    board.classList.toggle("is-nav", next === "nav");
    render();
  }

  function showDetail(item) {
    detail.hidden = false;
    detailTitle.textContent = item.title;
    detailBody.textContent = item.missing
      ? "Viittauksen kohde puuttuu fixturesta. Muu näkymä säilyy."
      : item.body || item.kind;
    detailQuestions.replaceChildren();
    for (const question of item.questions || []) {
      const li = document.createElement("li");
      li.textContent = question.prompt;
      if (question.options.length > 0) {
        const choices = document.createElement("div");
        choices.className = "choices";
        for (const label of question.options) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "choice";
          button.textContent = label;
          button.addEventListener("click", () => {
            status.textContent = `Valitsit: ${label}. Vastausta ei tallenneta.`;
          });
          choices.append(button);
        }
        li.append(choices);
      }
      detailQuestions.append(li);
    }
  }

  function dayButton(day, module) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    if (state.dayId === day.id) button.classList.add("is-selected");
    button.innerHTML = "<strong></strong><span class=\"count\"></span>";
    button.querySelector("strong").textContent = day.title;
    button.querySelector(".count").textContent = `${day.items.length} sisältöä`;
    button.addEventListener("click", () => {
      state.moduleId = module.id;
      state.dayId = day.id;
      status.textContent = `${module.title} / ${day.title}`;
      render();
      const selected = (state.matrix.modules.find((item) => item.id === module.id)?.days || [])
        .find((item) => item.id === day.id);
      const first = selected && selected.items[0];
      if (first) showDetail(first);
    });
    return button;
  }

  function render() {
    const matrix = state.matrix;
    if (!matrix) return;
    board.replaceChildren();
    const modules = state.view === "nav" && state.moduleId
      ? matrix.modules.filter((module) => module.id === state.moduleId)
      : matrix.modules;

    for (const module of modules) {
      const column = document.createElement("section");
      column.className = "column";
      const heading = document.createElement("h2");
      const select = document.createElement("button");
      select.type = "button";
      select.className = "module";
      select.textContent = module.title;
      select.addEventListener("click", () => {
        state.moduleId = module.id;
        state.dayId = module.days[0] ? module.days[0].id : null;
        if (state.view === "matrix") setView("nav");
        else render();
        status.textContent = module.title;
      });
      heading.append(select);
      column.append(heading);
      for (const day of module.days) column.append(dayButton(day, module));
      board.append(column);
    }

    if (state.dayId) {
      const selectedModule = matrix.modules.find((module) =>
        module.days.some((day) => day.id === state.dayId),
      );
      const selectedDay = selectedModule?.days.find((day) => day.id === state.dayId);
      if (selectedDay) {
        const list = document.createElement("div");
        list.className = "items";
        for (const item of selectedDay.items) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "item";
          button.textContent = `${item.kind}: ${item.title}`;
          button.addEventListener("click", () => showDetail(item));
          list.append(button);
        }
        const host = [...board.querySelectorAll(".column")].find((column) =>
          column.querySelector(".day.is-selected"),
        );
        if (host) host.append(list);
      }
    }
  }

  function main() {
    const payload = window.__UIPLAYGROUND_FIXTURE__;
    if (!payload) {
      title.textContent = "Fixture puuttuu";
      status.textContent = "Parent-viewer ei toimittanut synteettistä fixturea sandboxiin.";
      return;
    }
    const matrix = buildCourseMatrix(payload);
    if (!matrix.ok) {
      title.textContent = "Fixture ei vastaa odotettua rakennetta";
      status.textContent = "Kurssinäkymää ei rakennettu.";
      return;
    }
    state.matrix = matrix;
    state.moduleId = matrix.modules[0]?.id ?? null;
    title.textContent = matrix.courseTitle;
    status.textContent = `${matrix.courseCode} · ${matrix.enrollments.length} synteettistä osallistujaa`;
    render();
  }

  viewMatrix.addEventListener("click", () => setView("matrix"));
  viewNav.addEventListener("click", () => setView("nav"));
  main();
})();
