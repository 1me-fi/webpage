"""Build a self-contained, explicitly non-persistent UI review from production assets."""
import base64
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
css = (root / 'assets/survey.css').read_text()
js = (root / 'assets/survey.js').read_text()
logo = base64.b64encode((root / 'assets/1me-logo.svg').read_bytes()).decode('ascii')
logo_url = 'data:image/svg+xml;base64,' + logo
data = json.dumps(json.loads((root / 'tests/example.json').read_text()), ensure_ascii=False).replace('<', '\\u003c')
js = js.replace("const token = location.pathname.split('/').filter(Boolean).at(-1);", "const token = 'preview';")
js = js.replace("await fetch(", "await previewRequest(")
js = js.replace("return saved();", "return saved('Esikatselu valmis', 'Vastauksia ei lähetetty eikä tallennettu.');")
js = js.replace("'Lähetä vastaukset'", "'Päätä esikatselu'")
js = 'async function previewRequest(url) { return {ok:true,status:200,json:async()=>url.includes("/responses")?{saved:true}:{definition:' + data + '}}; }\n' + js
document = '''<!doctype html><html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Kyselyt – UI-esikatselu</title><link rel="icon" type="image/svg+xml" href="''' + logo_url + '''"><style>''' + css + '''</style></head><body><div id="survey"><header class="k-top"><div class="k-brand"><img class="k-logo" src="''' + logo_url + '''" alt="" aria-hidden="true"><span class="k-wordmark">1ME</span><span>Koulutustarvekysely</span></div><span class="k-muted">UI-esikatselu · Vastauksia ei tallenneta</span></header>
<div class="k-layout"><aside class="k-sidebar"><p class="k-eyebrow">Kyselyn aiheet</p><nav class="k-nav" aria-label="Kyselyn osiot"></nav></aside><main><div class="k-progress-label"><span id="k-step"></span><span id="k-count" aria-live="polite"></span></div><progress id="k-progress" max="1" value="0" aria-label="Vastatut kysymykset"></progress><div id="k-content"></div><p class="k-error" id="k-error" role="alert"></p><div class="k-footer" hidden><button type="button" class="k-action" id="k-prev">Edellinen</button><button type="button" class="k-action k-primary" id="k-next">Seuraava aihe</button></div></main></div><footer class="k-bottom"><span>TSI Finland Oy</span><span>Esikatselu – ei palvelinyhteyttä</span></footer></div><script>''' + js + '</script></body></html>'
assert 'await fetch(' not in document
Path(sys.argv[1]).write_text(document)
print(sys.argv[1])
