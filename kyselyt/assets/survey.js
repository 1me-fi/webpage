const $ = (s) => document.querySelector(s);
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token = location.pathname.split('/').filter(Boolean).at(-1);
const content = $('#k-content'), error = $('#k-error'), next = $('#k-next'), prev = $('#k-prev');
const answers = new Map(), team = new Map();
let definition, all, step = 0, name = '', feedback = '', pending = null, busy = false, sent = false;
const options = () => new Map(definition.options.map(o => [o.id, o.label]));
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
function progress() {
  $('#k-count').textContent = `${answers.size} / ${all.length} vastattu`;
  $('#k-progress').max = all.length;
  $('#k-progress').value = answers.size;
  document.querySelectorAll('[data-step]').forEach(button => {
    const index = Number(button.dataset.step);
    const complete = index < definition.groups.length && definition.groups[index].questions.every(q => answers.has(q.id));
    button.querySelector('.k-circle').textContent = complete ? '✓' : index + 1;
  });
}
function render(focus = true) {
  error.textContent = '';
  const groups = definition.groups, review = step === groups.length;
  $('.k-nav').innerHTML = [...groups.map(g => g.title), 'Tarkista'].map((title, i) => `<button type="button" data-step="${i}" ${i === step ? 'aria-current="step"' : ''} ${pending || busy ? 'disabled' : ''}><span class="k-circle">${i+1}</span><span>${escape(title)}</span></button>`).join('');
  $('#k-step').textContent = review ? 'Vastausten tarkistus' : `Osio ${step + 1} / ${groups.length}`;
  $('.k-footer').hidden = false;
  prev.disabled = step === 0 || Boolean(pending) || busy;
  next.disabled = busy;
  next.textContent = busy ? 'Tallennetaan…' : pending ? 'Yritä samaa lähetystä uudelleen' : review ? 'Lähetä vastaukset' : step === groups.length - 1 ? 'Tarkista vastaukset' : 'Seuraava aihe';
  if (!review) {
    const g = groups[step];
    content.innerHTML = `<h1 tabindex="-1">${escape(g.title)}</h1>${step === 0 ? `<p class="k-intro"><strong>${escape(definition.title)}</strong><br>${escape(definition.description)} ${escape(definition.instructions)}</p>` : ''}<p class="k-intro">${escape(g.description)}</p>` + g.questions.map(q => `<section class="k-question" id="question-${escape(q.id)}" tabindex="-1"><fieldset aria-describedby="help-${escape(q.id)}"><legend><span class="k-index">AIHE ${all.findIndex(a => a.id === q.id) + 1} / ${all.length}</span>${escape(q.title)}</legend><p id="help-${escape(q.id)}" class="k-help">${escape(q.description)}</p><div class="k-choices">${definition.options.map(o => `<label class="k-choice" data-option="${escape(o.id)}"><input type="radio" name="${escape(q.id)}" value="${o.id}" required ${answers.get(q.id) === o.id ? 'checked' : ''}><span>${escape(o.label)}</span></label>`).join('')}</div></fieldset><label class="k-team"><input type="checkbox" data-team="${escape(q.id)}" ${team.get(q.id) ? 'checked' : ''}><span>${escape(definition.teamOption.label)}</span></label></section>`).join('');
  } else {
    content.innerHTML = `<h1 tabindex="-1">Tarkista vastauksesi</h1><p class="k-intro">Voit vielä muuttaa valintojasi ennen lähettämistä.</p><div class="k-question">` + groups.map((g, i) => `<h2>${escape(g.title)}</h2>` + g.questions.map(q => `<div class="k-review"><div><strong>${escape(q.title)}</strong><p>${escape(options().get(answers.get(q.id)) || 'Vastaus puuttuu')}</p>${team.get(q.id) ? '<p>Myös tiimillä koulutustarvetta</p>' : ''}</div><button class="k-action" type="button" data-edit="${i}" data-question="${escape(q.id)}" aria-label="Muuta: ${escape(q.title)}" ${pending || busy ? 'disabled' : ''}>Muuta</button></div>`).join('')).join('') + `<label class="k-field">Etunimi (pakollinen)<input name="respondent" autocomplete="given-name" maxlength="100" required value="${escape(name)}" ${pending || busy ? 'readonly' : ''}></label><label class="k-field">Muita koulutustoiveita <span class="k-muted">(vapaaehtoinen)</span><textarea name="feedback" maxlength="5000" rows="4" ${pending || busy ? 'readonly' : ''}>${escape(feedback)}</textarea></label></div>`;
  }
  progress();
  if (focus) content.querySelector('h1')?.focus();
}
function missingQuestion(q) {
  step = definition.groups.findIndex(g => g.questions.some(a => a.id === q.id));
  render(false);
  error.textContent = `Valitse vastaus aiheeseen ”${q.title}”. Myös ”En osaa arvioida” on sopiva vastaus.`;
  const section = document.getElementById(`question-${q.id}`);
  section.setAttribute('aria-describedby', 'k-error');
  section.querySelector('input').focus();
  section.scrollIntoView({block:'center'});
}
function saved(message = 'Kiitos vastauksistasi', detail = 'Vastauksesi on tallennettu.') {
  sent = true; busy = false;
  content.innerHTML = `<section class="k-sent"><h1 tabindex="-1">${escape(message)}</h1><p>${escape(detail)}</p></section>`;
  $('.k-footer').hidden = true; $('.k-nav').innerHTML = ''; $('#k-step').textContent = 'Valmis';
  error.textContent = ''; content.querySelector('h1').focus();
}
document.addEventListener('change', e => {
  if (pending || busy || sent) return;
  const t = e.target;
  if (t.matches('.k-choice input')) { answers.set(t.name, t.value); progress(); error.textContent = ''; }
  if (t.dataset.team) team.set(t.dataset.team, t.checked);
});
document.addEventListener('input', e => {
  if (pending || busy || sent) return;
  if (e.target.name === 'respondent') name = e.target.value;
  if (e.target.name === 'feedback') feedback = e.target.value;
});
document.addEventListener('click', e => {
  if (pending || busy || sent || !definition) return;
  const button = e.target.closest('[data-step],[data-edit]');
  if (!button) return;
  step = Number(button.dataset.step ?? button.dataset.edit); render();
  if (button.dataset.question) document.getElementById(`question-${button.dataset.question}`)?.querySelector('input')?.focus();
});
prev.addEventListener('click', () => { if (!pending && !busy && !sent && step > 0) { step--; render(); } });
next.addEventListener('click', async () => {
  if (busy || sent || !definition) return;
  if (step < definition.groups.length) {
    const missing = definition.groups[step].questions.find(q => !answers.has(q.id));
    if (missing) return missingQuestion(missing);
    step++; render(); return;
  }
  if (!pending) {
    const missing = all.find(q => !answers.has(q.id));
    if (missing) return missingQuestion(missing);
    if (!name.trim() || [...name.trim()].length > 100) { error.textContent = 'Kirjoita etunimesi (1–100 merkkiä).'; $('[name="respondent"]').focus(); return; }
    if ([...feedback].length > 5000) { error.textContent = 'Koulutustoiveiden enimmäispituus on 5 000 merkkiä.'; $('[name="feedback"]').focus(); return; }
    pending = {token, idempotencyKey: randomKey(), firstName: name.trim(), feedback, answers: all.map(q => ({questionId:q.id, optionId:answers.get(q.id), teamNeed:Boolean(team.get(q.id))}))};
  }
  busy = true; render(false); next.setAttribute('aria-busy','true');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/kyselyt/api/responses', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pending), signal:controller.signal});
    const data = await response.json();
    if (response.ok && data.saved === true) return saved();
    if (response.status === 409 && data.alreadySaved === true) return saved('Aiempi vastauksesi on tallennettu', 'Muutettuja vastauksia ei tallennettu uudestaan.');
    if ([404,410,413,415,422,429].includes(response.status)) {
      pending = null; busy = false; render(false); error.textContent = data.error || 'Tarkista vastaukset ja yritä uudelleen.';
    } else throw new Error('Unconfirmed');
  } catch {
    busy = false; render(false);
    error.textContent = 'Tallennusta ei voitu vahvistaa. Vastaukset säilyvät tässä näkymässä. Yritä samaa lähetystä uudelleen. Muokkaus on lukittu, kunnes tallennuksen tila selviää. Älä lataa sivua uudelleen.';
  } finally { clearTimeout(timer); next.removeAttribute('aria-busy'); }
});
async function load() {
  try {
    const response = await fetch(`/kyselyt/api/survey/${token}`);
    const data = await response.json();
    if (!response.ok) {
      content.innerHTML = `<h1>${response.status === 410 ? 'Kysely on suljettu' : response.status === 404 ? 'Kyselyä ei löytynyt' : 'Kyselyä ei voida avata'}</h1><p>${escape(data.error || 'Yritä myöhemmin uudelleen.')}</p>`; return;
    }
    definition = data.definition; all = definition.groups.flatMap(g => g.questions); render(false);
  } catch { content.innerHTML = '<h1>Kyselyä ei voitu ladata</h1><p>Tarkista verkkoyhteys ja lataa sivu uudelleen.</p>'; }
}
load();
