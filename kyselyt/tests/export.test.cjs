const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname + '/../tools/SheetsExport.gs','utf8'), context);
function fixture() {
  const rows = Array.from({length:12}, () => Array(9).fill(''));
  rows[0][0]='Kysely';rows[1][0]='Kuvaus';rows[2][0]='Ohje';
  rows[5]=['Valittu','Aihealue','Arvioitava taito','Selite','','','','',''];
  const labels=['En tarvitse tätä työssäni','Tarvitsen peruskoulutusta','Tarvitsen kertausta','Osaamiseni riittää','En osaa arvioida'];
  labels.forEach((v,i)=>{rows[i][7]=i+1;rows[i][8]=v});
  rows[6]=[true,'Moottorit','Suojaus','Vastaajan selite','','','','Tiimihavainto','Myös tiimissämme on koulutustarvetta'];
  rows[7]=[false,'Moottorit','Ei mukaan','Pois'];
  rows[8]=[true,'Anturit','Mittaus','Mittauksen selite'];return rows;
}
test('selected rows and semantic IDs, order and brief descriptions',()=>{
  const out=context.Kyselyt_muodosta('AUT-KuPi – tiivis kysely',fixture());
  assert.equal(out.groups.length,2);assert.equal(out.groups[0].questions[0].description,'Vastaajan selite');
  assert.equal(out.options[0].id,'basics');assert.equal(out.options[3].id,'not_needed');
});
test('detailed notes are never exposed',()=>{
  const rows=fixture();rows[5][3]='Ylläpidon tarkennus';rows[6][3]='PRIVATE';
  const out=context.Kyselyt_muodosta('AUT-KuPi – kysymyspohja',rows);
  assert.equal(JSON.stringify(out).includes('PRIVATE'),false);
});
test('reject duplicates, blank selected rows, unclear detailed topics and missing option map',()=>{
  let rows=fixture();rows[8]=rows[6].slice();assert.throws(()=>context.Kyselyt_muodosta('AUT-KuPi – tiivis kysely',rows));
  rows=fixture();rows[6][2]='';assert.throws(()=>context.Kyselyt_muodosta('AUT-KuPi – tiivis kysely',rows));
  rows=fixture();rows[5][3]='Ylläpidon tarkennus';rows[6][3]='täsmennettävä';assert.throws(()=>context.Kyselyt_muodosta('AUT-KuPi – kysymyspohja',rows));
  rows=fixture();rows[0][8]='Väärä';assert.throws(()=>context.Kyselyt_muodosta('AUT-KuPi – tiivis kysely',rows));
});
