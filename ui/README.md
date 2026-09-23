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
`trashed`-tilaan merkityt rivit. HTTP-virhe ei avaa staattista varaluetteloa,
jottei poistettu Backend-malli voi palata näkyviin. Staattinen varaluettelo
sisältää vain tämän repon perinteiset staattiset prototyypit.

## Publisher-rooli

Publisher-hallinta näkyy vain, kun host-sivu kytkee lyhytikäisen MCP access tokenin
arvoon `window.__UIPLAYGROUND_PUBLISHER_ACCESS_TOKEN__`. Se käyttää
`uiPlaygroundMcpHttp`-päätepistettä ja Backendin työkaluja
`trash_prototype`, `trash_version`, `restore_prototype` ja
`restore_version`; työkalunimet voi tarvittaessa konfiguroida
`window.__UIPLAYGROUND_PUBLISHER_TOOLS__`-JSON-arvolla.

Tässä staattisessa sivustossa ei ole kirjautumisvirtaa eikä tokenin hankintaa.
Live-käyttöönotto vaatii turvallisen publisher OAuth -kirjautumisen, joka asettaa
tokenin muistiin (ei URL:iin eikä pysyvään selainvarastoon), sekä Backendin
roskakori-/palautustyökalujen julkaisemisen.

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
