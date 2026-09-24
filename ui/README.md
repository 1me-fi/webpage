# 1ME UI Playground

Playground on julkinen UI-ideoiden kokeilupaikka osoitteessa `/ui/`.

Se ei ole Studio, STUI-standardi eikä tuotannon LMS. Se ei lue eikä kirjoita oikeaa projektidataa.

## Mistä tiedot tulevat

- Prototyyppilista: oletuksena Backendin julkinen `uiPlaygroundPublicHttp/catalog` API
- Varaluettelo: `ui/data/prototypes.json`, vain kun julkinen API ei ole verkkotasolla tavoitettavissa
- LMS-fixture: `ui/data/fixtures/lms-course.json`

API-kanta voidaan vaihtaa kehitystä varten `ui-playground-api-base`-meta-tagilla,
`window.__UIPLAYGROUND_API_BASE__`-arvolla tai URL:n `?apiBase=`-parametrilla.
Katalogi näyttää jokaisen immutable-version omana rivinään. Haku kohdistuu nimeen
ja kuvaukseen, ja tekijäsuodatin muodostetaan ladatusta datasta.

Julkinen katalogi ei pyydä `includeArchived`- tai roskakoriparametreja. Backendin
julkinen API on roskakorin auktoriteetti; selain myös ohittaa puolustavasti
`trashed`-tilaan merkityt rivit. HTTP-virhe (esim. 5xx) ei avaa staattista
varaluetteloa, jottei poistettu Backend-malli voi palata näkyviin. Staattinen
varaluettelo avataan vain `TypeError`-verkkovirheessä (API tavoittamaton).

Eksplisiittinen version URL (`view.html?prototypeId=&version=`) lataa juuri
pyydetyn version. Jos pyyntö epäonnistuu, näytetään “ei saatavilla” ilman
automaattista vaihtoa toiseen versioon. Onnistunut version GET näytetään myös
silloin, kun juurimalli on roskakorissa (Backend sallii lukemisen).

## Publisher-rooli

Publisher-hallinta (juurimallin `trash_prototype` / `restore_prototype`) näkyy
vain, kun sivulle on asetettu lyhytikäinen MCP access token. Versiotason
roskakoria ei ole.

### DEV harness (ei tuotantokirjautuminen)

Kehitystä varten voi injektoida tokenin ennen `playground.mjs`-latausta:

```html
<script>
  // DEV ONLY — ei OAuth; ei URL-parametria; ei localStorage/sessionStorage.
  window.__UIPLAYGROUND_PUBLISHER_ACCESS_TOKEN__ = "pgac_…";
</script>
```

Ilman tokenia publisher-kontrollit pysyvät piilossa.

### First-party OAuth — ei toteutettu tällä sivustolla

Backend tukee rajattua Playground OAuthia (PKCE S256, public client, CIMD).
Selainkirjautumista ei silti kytketä tähän staattiseen sivustoon ilman erillistä
tuote-/turvallisuuspäätöstä. Estävät kohdat:

1. CIMD `client_id` pitää olla absoluuttinen **https**-URL, joka vastaa
   metadata-dokumentin osoitetta. Backendin valmiit clientit
   (`emulator`, `hosted-smoke`) hyväksyvät vain redirectin
   `http://127.0.0.1:4178/oauth/callback` — ei webpage-polkuja.
2. Staattisen sivuston first-party CIMD + redirect-URI -joukko (kanoninen
   tuotanto-origin) on Platform-/Backend-päätös, ei paikallinen improvisaatio.
3. Nykyinen OAuth write-työkalulista / MCP-pinta ei vielä sisällä
   `trash_prototype` / `restore_prototype` (rinnakkainen Backend-työ).

API-julkaisut avautuvat `view.html`-viewerissä. Viewer suorittaa prototyypin
vain `sandbox="allow-scripts"`-iframe-kehyksessä; AI-tuotettua HTML:ää ei lisätä
Playgroundin parent-dokumenttiin. Vanhat staattiset prototyyppipolut avautuvat
edelleen suoraan, kun API-varaluettelo on käytössä.

Fixture on synteettinen. Sen kurssi, moduulit, päivät, materiaalit, tehtävät, kokeet ja osallistujat noudattavat platformin LMS Studio MVP -mallia (`docs/data/lms-studio-mvp-data-model-v1.md`, päivän `contentItems`: `docs/domain/lms-day-content-order-v1.md`).

`fixtureMeta` on vain tämän paketin kuori. UI lukee entiteetit `ui/fixtureView.mjs`-adapterilla eikä muuta fixturea helpommaksi rinnakkaiseksi malliksi.

Älä yhdistä Playground-dataa oikeaan projektiin. Älä laita fixtureen oikeita käyttäjiä, henkilötietoja, Firebase-tunnisteita tai salaisuuksia.

## Uusi prototyyppi

1. Tee hakemisto `ui/prototypes/<aihe>/<tekijä>/v1/`.
2. Lisää sinne oma `index.html` ja tarvittaessa oma CSS/JS.
3. Kehityksen staattiseen varaluetteloon lisää rivi `ui/data/prototypes.json`-tiedostoon. Pakolliset kentät: `id`, `name`, `author`, `version`, `createdAt`, `updatedAt`, `description`, `href`.
4. Avaa proto suoralla polulla ja linkitä takaisin Playground-etusivulle.

Virheellinen rivi ohitetaan. Yksi rikkoutunut proto ei tyhjennä koko listaa.

## Uusi versio

Kopioi edellinen versio uudeksi hakemistoksi, esimerkiksi `v2/`. Päivitä vain uusi kopio ja lisää sille oma rivi luetteloon. Vanhaa versiota ei muuteta eikä poisteta, ellei sitä erikseen arkistoida myöhemmässä työssä.

## Vanhat versiot

Jätä vanha hakemisto ja sen luettelorivi paikalleen. Suora URL säilyy.

## Hosting

`.mjs`-moduulit tarvitsevat MIME-tyypin `text/javascript`. Se on asetettu repon juuren `.htaccess`-tiedostossa. Ilman sitä selain jättää Playgroundin JavaScriptin ajamatta, jos palvelin tarjoaa `.mjs`-tiedostot muodossa `application/octet-stream`.

## Tarkistus

```bash
node --test ui/tests/playground.test.mjs
```

Paikallinen katselu repon juuresta:

```bash
python -m http.server 4187
```

- Nykyinen sivu: `http://127.0.0.1:4187/`
- Playground: `http://127.0.0.1:4187/ui/`
