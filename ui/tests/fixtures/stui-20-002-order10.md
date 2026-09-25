# STUI-20-002 order 10 revision packages

These two files were exported by the current Playground and Studio UIs on branch `cursor/stui-feedback-suggestion-dc63`. They were not assembled by hand. The order 07 return file `stui-20-002-playground-return.json` is the old shape: `modelVersion` stays `baseline` even when `behavior.transpose` is true. It is not proof that a new revision was created.

| File | Role | SHA-256 | `modelVersion` | `lineage.source` | `basedOnModelVersion` | `behavior.transpose` |
|---|---|---|---|---|---|---|
| `stui-20-002-order10-source.json` | Untransposed starting export | `1b09997aa84744f3b2a3cfeb810cab094ed6013ed83af11c92f826fd39ac1589` | `baseline` | `studio-baseline` | null | false |
| `stui-20-002-order10-playground-transpose.json` | Playground export after transpose | `6017f311fdd7aa818e418222e7909b927b227789d98ffe807567eed2405557c0` | `baseline-af17fc85` | `studio-export` | `baseline` | true |

Studio re-export of the adopted Playground file kept the same SHA-256. Row `r1` stays `A1`.

## Owner retest of the changed points

Use the updated Studio #147 preview. The published SHA is in the order 10 report.

1. Open UI Lab `studio/lists/studio-configurable-table-v1`.
2. Export. The file is the starting model `baseline`, `transpose` false. Keep it.
3. Click **Transponoi rivit ja sarakkeet**. The identity line stays `käytössä · baseline` (or `perusmalli · baseline` if nothing is adopted). A separate preview line names `baseline-af17fc85` and says the export still uses the active model.
4. Export again before **Ota käyttöön**. The file is still `baseline` / `transpose` false. The status says the preview is not in the file.
5. Click **Ota käyttöön**. Identity becomes `käytössä · baseline-af17fc85`.
6. Export. `modelVersion` is `baseline-af17fc85`, `lineage.source` is `studio-export`, `basedOnModelVersion` is `baseline`, `behavior.transpose` is true.
7. **Palaa aiempaan**. Identity and the next export return to `baseline` / `transpose` false.
8. Import `stui-20-002-order10-playground-transpose.json` only after step 2 if you want the Playground file. Adopt it, export, and compare the SHA-256 above. Then revert.
9. Do not use `stui-20-002-playground-return.json` as the new revision. Importing it still says `Voidaan ottaa käyttöön.` and keeps `modelVersion` `baseline`.
10. On the published dev backend, **Luo kehitysehdotus** or **Raportoi** may still fail. The failure text must be `Palaute ei tallentunut. Palvelin ei vielä tue tämän näkymän palautetietoja.` The description stays and the button can be used again.
