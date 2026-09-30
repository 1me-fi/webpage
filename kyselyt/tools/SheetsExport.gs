/** Add as a separate Apps Script file. Does not replace onOpen or Forms functions. */
function Kyselyt_lisaaValikko() {
  SpreadsheetApp.getUi().createMenu('Kyselypalvelu')
    .addItem('Vie aktiivinen kyselypohja JSONina', 'Kyselyt_vieJson').addToUi();
}

function Kyselyt_vieJson() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const result = Kyselyt_muodosta(sheet.getName(), sheet.getDataRange().getValues());
  const encoded = Utilities.base64Encode(JSON.stringify(result, null, 2), Utilities.Charset.UTF_8);
  const html = '<!doctype html><html lang="fi"><meta charset="utf-8"><body style="font:16px Arial;padding:20px">' +
    '<p>JSON sisältää vain valitut kysymykset. Tuo tiedosto kyselypalvelun hallintaan.</p>' +
    '<a download="kysely.json" href="data:application/json;charset=utf-8;base64,' + encoded + '">Lataa kysely.json</a></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(440).setHeight(190), 'Kyselyn JSON-vienti');
}

function Kyselyt_muodosta(sheetName, rows) {
  const norm = v => String(v ?? '').trim().toLocaleLowerCase('fi').replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const tight = norm(sheetName) === 'aut-kupi - tiivis kysely';
  const detailed = norm(sheetName) === 'aut-kupi - kysymyspohja';
  if (!tight && !detailed) throw new Error('Valitse AUT-KuPi – tiivis kysely tai AUT-KuPi – kysymyspohja. Alkuperäistä AUT-KuPi-välilehteä ei muuteta.');
  if (rows.length < 7) throw new Error('Pohjalta puuttuvat otsakerivi 6 ja kysymysrivit.');
  const headers = rows[5].map(norm);
  // Fail closed if the template has changed; no silent column guessing.
  if (!/val|mukaan|sisälly|kysely/.test(headers[0] || '') || !/aihealue|aihe|kokonaisuus/.test(headers[1] || '') || !/taito|kysymys|osaaminen/.test(headers[2] || '')) {
    throw new Error('Rivin 6 otsakkeet A–C eivät vastaa kyselypohjaa. Tarkista vienti pohjan nykyistä rakennetta vasten.');
  }
  if (tight && !/selite|kuvaus/.test(headers[3] || '')) throw new Error('Tiiviin pohjan D-sarakkeen pitää sisältää vastaajan selite.');
  if (detailed && !/tarkennus|ylläpito|kuvaus/.test(headers[3] || '')) throw new Error('Tarkan pohjan D-sarakkeen ylläpitotarkennusta ei tunnistettu.');
  const ids = {1:'not_needed', 2:'basics', 3:'refresh', 4:'sufficient', 5:'unsure'};
  const semantics = {1:/en tarvitse|ei tarvitse/, 2:/perus/, 3:/kertau|syvent/, 4:/riitt/, 5:/en osaa|epävarm/};
  const seen = new Set(); let teamFound = false;
  for (const row of rows) {
    const numeric = String(row[7] ?? '').trim().match(/^([1-5])(?:[.)])?$/);
    if (numeric) {
      const n = numeric[1];
      if (seen.has(n) || !semantics[n].test(norm(row[8]))) throw new Error('H–I-sarakkeiden vastausvaihtoehto ' + n + ' ei vastaa sovittua merkitystä.');
      seen.add(n);
    }
    if (/tiimi/.test(norm(row[7]) + ' ' + norm(row[8])) && /koulutustar/.test(norm(row[7]) + ' ' + norm(row[8]))) teamFound = true;
  }
  if (seen.size !== 5 || !teamFound) throw new Error('H–I-sarakkeista ei löytynyt viittä numeroitua vaihtoehtoa ja erillistä tiimihavaintoa. Tarkista nykyinen pohja.');
  const labels = {basics:'Tarvitsen peruskoulutusta', refresh:'Tarvitsen kertausta tai syventämistä', sufficient:'Osaamiseni riittää työssäni', not_needed:'En tarvitse tätä työssäni', unsure:'En osaa arvioida koulutustarvettani'};
  const title = String(rows[0][0] ?? '').trim();
  if (!title) throw new Error('A1: kyselyn otsikko puuttuu.');
  const groups = [], byGroup = new Map(), duplicates = new Set(); let count = 0;
  for (let r = 6; r < rows.length; r++) {
    const row = rows[r];
    if (row[0] !== true && String(row[0]).toUpperCase() !== 'TRUE') continue;
    const groupTitle = String(row[1] ?? '').trim(), questionTitle = String(row[2] ?? '').trim();
    if (!groupTitle || !questionTitle) throw new Error('Rivi ' + (r+1) + ': aihealue tai kysymys puuttuu.');
    if (detailed && row.slice(1,6).some(v => /täsmennettävä/i.test(String(v)))) throw new Error('Rivi ' + (r+1) + ' on merkitty täsmennettäväksi.');
    const duplicate = norm(groupTitle) + '\0' + norm(questionTitle);
    if (duplicates.has(duplicate)) throw new Error('Rivi ' + (r+1) + ': saman aihealueen kysymys toistuu.');
    duplicates.add(duplicate);
    if (++count > 300) throw new Error('Valitse enintään 300 kysymystä.');
    const groupKey = norm(groupTitle);
    if (!byGroup.has(groupKey)) {
      const group = {id:'group-' + (groups.length+1), title:groupTitle, description:'', questions:[]};
      byGroup.set(groupKey, group); groups.push(group);
    }
    const description = tight ? String(row[3] ?? '').trim() : '';
    if (tight && !description) throw new Error('Rivi ' + (r+1) + ': vastaajalle näkyvä selite puuttuu.');
    byGroup.get(groupKey).questions.push({id:'question-' + count, title:questionTitle, description, required:true});
  }
  if (!count) throw new Error('Valitse vähintään yksi kysymys A-sarakkeesta.');
  const result = {schemaVersion:1,title,description:String(rows[1][0] ?? '').trim(),instructions:String(rows[2][0] ?? '').trim(),options:Object.entries(labels).map(([id,label]) => ({id,label})),teamOption:{label:'Myös tiimissämme on koulutustarvetta tässä aiheessa.',required:false},groups};
  if (TextEncoderFallback(JSON.stringify(result)).length > 1048576) throw new Error('Vienti ylittää 1 MiB:n rajan.');
  return result;
}

// Apps Script V8 has no browser TextEncoder. Count UTF-8 without external APIs.
function TextEncoderFallback(value) { return unescape(encodeURIComponent(value)); }
