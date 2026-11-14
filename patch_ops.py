import re
S = r"C:\Users\isabe\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\scratch-workspaces\bb80013e-f90d-4cfc-b2c3-871cfd095b31\3792b1e7-52e3-4ff2-b24c-5aa567b02f61\scratch-2026-09-18-4cd09c"
P = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\08 Sistemas e Projetos\site-velocita"

sec = open(S + r"\ops_section.html", encoding="utf-8").read()
# funil: gotas que descem (animadas por CSS)
sec = re.sub(r'<g class="f-dots">.*?</g>',
             '<circle class="dot d1" cx="160" cy="14" r="4.5"/><circle class="dot d2" cx="160" cy="14" r="4.5"/><circle class="dot d3" cx="160" cy="14" r="4.5"/>',
             sec, flags=re.S)
sec = sec.replace('<text class="pkg-tip" x="0" y="0">venda</text>\n', '')
sec = sec.replace(' fill: url(#none);', '')

html = open(P + r"\index.html", encoding="utf-8").read()
assert html.count("  <!-- como funciona -->") == 1
html = html.replace("  <!-- como funciona -->", sec + "\n  <!-- como funciona -->", 1)
assert html.count(".metric', ") == 0
html = html.replace(".metric').forEach", ".metric, .ops-card').forEach") if ".metric').forEach" in html else html
html = html.replace("'.lead-form, .metric'", "'.lead-form, .metric, .ops-card'")
open(P + r"\index.html", "w", encoding="utf-8").write(html)

css = open(S + r"\ops.css", encoding="utf-8").read()
open(P + r"\styles.css", "a", encoding="utf-8").write(css)
print("ok", html.count("ops-card"), "metric, .ops-card" in html or "ops-card" in html)
