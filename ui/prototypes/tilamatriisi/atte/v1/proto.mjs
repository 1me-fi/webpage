import { buildCourseMatrix } from "../../../../fixtureView.mjs";

const title = document.querySelector("#course-title");
const status = document.querySelector("#proto-status");
const board = document.querySelector("#board");
const detail = document.querySelector("#detail");
const detailTitle = document.querySelector("#detail-title");
const detailBody = document.querySelector("#detail-body");
const detailQuestions = document.querySelector("#detail-questions");
const viewMatrix = document.querySelector("#view-matrix");
const viewNav = document.querySelector("#view-nav");

const state = {
  view: "matrix",
  moduleId: null,
  dayId: null,
  matrix: null,
};

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
  button.innerHTML = `<strong></strong><span class="count"></span>`;
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

async function main() {
  try {
    const response = await fetch("../../../../data/fixtures/lms-course.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const matrix = buildCourseMatrix(payload);
    if (!matrix.ok) {
      title.textContent = "Fixture ei vastaa odotettua rakennetta";
      status.textContent = "Kurssinäkymää ei rakennettu. Palaa Playgroundiin.";
      return;
    }
    state.matrix = matrix;
    state.moduleId = matrix.modules[0]?.id ?? null;
    title.textContent = matrix.courseTitle;
    status.textContent = `${matrix.courseCode} · ${matrix.enrollments.length} synteettistä osallistujaa`;
    render();
  } catch (error) {
    title.textContent = "Fixturea ei voitu ladata";
    status.textContent = "Proto säilyy auki. Palaa Playgroundiin ja tarkista fixture-polku.";
    console.error(error);
  }
}

viewMatrix.addEventListener("click", () => setView("matrix"));
viewNav.addEventListener("click", () => setView("nav"));
main();
