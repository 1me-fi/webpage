# STUI-20-002 yhteensopimaton testipaketti

Tiedosto: `stui-20-002-incompatible-rowpin.json`

Paketti on muuten baseline (`modelVersion` `baseline`, `lineage.source` `studio-baseline`). Ainoa yhteensopimaton kenttä on `behavior.rowPin: true`.

Studio-previewssä, UI Labissa `#/ui-lab/studio/lists/studio-configurable-table-v1`:

1. Tuo tämä tiedosto. Tila on `Vaatii Studio-kehityksen.` ja se nimeää `behavior.rowPin`. Käyttöönotto ei tapahdu.
2. `Luo kehitysehdotus` näkyy vasta eston jälkeen. Se ei lähetä mitään ennen painallusta.
3. Julkaistu dev-backend ei hyväksy `stuiContext`-kenttää. Painallus ei ole onnistunut tallennustesti sitä backendia vasten. Kenttää ei poisteta eikä sille ole hiljaista varapolkua.
4. Onnistunut tallennus on todennettu vain Auth-, Functions- ja Firestore-emulaattoreissa backend-haaran `createFeedbackReport`-toteutuksella.

Baseline-paketti ilman `rowPin` säilyy tuotavana. Muokattu vienti saa uuden `modelVersion`-revision ja `lineage.source` `studio-export`.
