const CONTENT_KINDS = new Set(["presentation", "task", "material", "exam"]);

function indexById(items) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (item && typeof item.id === "string") map.set(item.id, item);
  }
  return map;
}

export function assertCanonicalFixture(payload) {
  const problems = [];
  if (!payload || typeof payload !== "object") {
    return ["fixture-not-object"];
  }
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

export function buildCourseMatrix(payload) {
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
