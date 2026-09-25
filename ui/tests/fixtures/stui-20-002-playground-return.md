# STUI-20-002 Playground return package

Bytes are the file produced by Playground **Vie muokattu paketti** after the parent-page control **Transponoi rivit ja sarakkeet**. The file was not assembled by hand.

| Field | Value |
|---|---|
| File | `stui-20-002-playground-return.json` |
| SHA-256 | `b5f7aa899cf08f68d58b99120b611fa9862bf2703540eb811307272238db7b38` |
| Webpage commit | `47f8e778a08232ff39d3158cd9b90d4440b99b0f` |
| Origin | Studio-shaped baseline (`lineage.source` `studio-baseline`, `behavior.transpose` false, row `r1` value `A1`) imported in Playground, then transposed with the parent control |
| Bundle `schemaVersion` | `1` (Playground bundle). This is not the model version. |
| `packageVersion` | `1` |
| `stuiId` | `STUI-20-002` |
| Alternative | `baseline` |
| `modelVersion` | `baseline` |
| Version label in the Playground tree | `v1` |
| `behavior.transpose` | `true` |
| Row | `r1` / `A1` |

There is no isolated webpage preview channel. Do not publish this to `1me.fi/ui/`. Local Playground is `http://127.0.0.1:4187/ui/` from this branch.

## Owner steps on Studio preview

Preview: `https://oneme-preview-studio--pr-145-67dqlnh4.web.app/#/ui-lab/studio/lists/studio-configurable-table-v1`

Expected banner SHA: `7aab36ad0c2f56faf580d3ff581e50f1dd4ce428`  
Channel: `pr-145`  
Branch: `cursor/stui-20-002-playground-pilot-66cb`

1. Open UI Lab. The STUI-20-002 mark is visible.
2. Export. The status names the file model and version. That export is the known previous model; keep it.
3. Import this JSON. The verdict is `Voidaan ottaa käyttöön.`
4. Preview shows the transposed model. `r1` and `A1` stay.
5. Adopt that model version.
6. Export again. The new file keeps transpose and the same identity fields.
7. Palaa aiempaan restores the model from step 2, not column visibility, order, or widths. The status must say so.
8. In a normal Studio view the mark is hidden. UI Lab → Näytä STUI-tunnisteet käyttönäkymissä shows and hides it. The switch does not grant permissions.
9. Return the trial to the starting model.
