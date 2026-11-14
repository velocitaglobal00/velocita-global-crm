P = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\08 Sistemas e Projetos\site-velocita"
URL = "https://rememberinc.onrender.com"
h = open(P + r"\index.html", encoding="utf-8").read()

section = f'''  <!-- remember -->
  <section id="remember" class="remember">
    <div class="wrap rem-grid">
      <div class="rem-copy">
        <p class="eyebrow">Parceiro</p>
        <h2>Remember: seus posts planejados, agendados e escritos com IA</h2>
        <p class="lead">Uma ferramenta de apoio para quem precisa manter as redes sociais ativas sem perder tempo: crie marcas, agende para várias redes de uma vez e deixe a IA sugerir as legendas.</p>
        <ul class="rem-list">
          <li><span aria-hidden="true"></span>Várias marcas num só lugar, cada uma com logo e cores próprias</li>
          <li><span aria-hidden="true"></span>Calendário de posts com agendamento para várias redes ao mesmo tempo</li>
          <li><span aria-hidden="true"></span>Legendas geradas por IA a partir de um briefing de uma linha</li>
          <li><span aria-hidden="true"></span>Piloto automático: a IA mantém a linha editorial e agenda os posts</li>
        </ul>
        <div class="rem-actions">
          <a class="btn btn-primary" href="{URL}" target="_blank" rel="noopener">Conhecer a Remember</a>
          <a class="btn btn-ghost" href="#contato" data-interest="Quero uma conversa">Falar com a Velocita</a>
        </div>
      </div>
      <a class="rem-card" href="{URL}" target="_blank" rel="noopener" aria-label="Abrir o site da Remember">
        <img src="assets/marcas/remember.svg" alt="Remember" width="166" height="40" />
        <div class="rem-mock" aria-hidden="true">
          <div class="rem-row"><i></i><b></b><em></em></div>
          <div class="rem-row"><i></i><b></b><em></em></div>
          <div class="rem-row"><i></i><b></b><em></em></div>
        </div>
        <span class="rem-go">Abrir o site <span aria-hidden="true">&rarr;</span></span>
      </a>
    </div>
  </section>

'''
assert h.count('id="remember"') == 0
anchor = "  <!-- como funciona -->"
assert h.count(anchor) == 1
h = h.replace(anchor, section + anchor, 1)

# logo do parceiro na faixa de plataformas também leva ao site
old = '<div class="plat"><img src="assets/marcas/remember.svg" alt="Remember" width="166" height="40" /></div>'
assert h.count(old) == 1
h = h.replace(old, f'<a class="plat" href="{URL}" target="_blank" rel="noopener" aria-label="Abrir o site da Remember"><img src="assets/marcas/remember.svg" alt="Remember" width="166" height="40" /></a>')

# menu
nav_old = '<a href="#como-funciona">Como funciona</a>'
assert h.count(nav_old) == 1
h = h.replace(nav_old, '<a href="#remember">Remember</a>\n      ' + nav_old, 1)

# revelação ao rolar
h = h.replace(".ops-card, .media-card, .ops2-card'", ".ops-card, .media-card, .ops2-card, .rem-copy, .rem-card'")
open(P + r"\index.html", "w", encoding="utf-8").write(h)

css = """
/* ===== Remember ===== */
.remember { background: radial-gradient(60% 70% at 80% 40%, rgba(13,148,136,.18), transparent 70%); }
.rem-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 56px; align-items: center; }
.rem-list { list-style: none; margin: 26px 0 32px; display: grid; gap: 12px; }
.rem-list li { display: flex; gap: 14px; align-items: flex-start; color: #fff; font-size: 15.5px; }
.rem-list li span {
  flex: 0 0 22px; height: 22px; border-radius: 50%; margin-top: 2px; background-color: rgba(45,212,191,.18);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232dd4bf' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  background-size: 12px; background-position: center; background-repeat: no-repeat;
}
.rem-actions { display: flex; flex-wrap: wrap; gap: 14px; }
.rem-card {
  display: block; text-decoration: none; padding: 34px; border-radius: 26px; background: #f4f6fa;
  box-shadow: 0 30px 60px rgba(0,0,0,.4); transition: transform .3s cubic-bezier(.2,.7,.2,1), box-shadow .3s;
}
.rem-card:hover { transform: translateY(-6px); box-shadow: 0 40px 70px rgba(13,148,136,.28); }
.rem-card img { height: 40px; width: 166px; max-width: 100%; margin-bottom: 26px; }
.rem-mock { display: grid; gap: 12px; padding: 18px; border-radius: 16px; background: #fff; border: 1px solid #e4e9f1; }
.rem-row { display: grid; grid-template-columns: 34px 1fr 54px; gap: 12px; align-items: center; }
.rem-row i { height: 34px; border-radius: 10px; background: linear-gradient(135deg, #2dd4bf, #0d9488); }
.rem-row b { height: 10px; border-radius: 5px; background: #d7dfeb; }
.rem-row em { height: 22px; border-radius: 999px; background: #e6f7f5; }
.rem-row:nth-child(2) b { width: 72%; }
.rem-row:nth-child(3) b { width: 56%; }
.rem-go { display: inline-block; margin-top: 22px; font: 600 14px 'Poppins', sans-serif; color: #0d9488; }
.rem-card:hover .rem-go { text-decoration: underline; }
.plat { text-decoration: none; }
@media (max-width: 900px) { .rem-grid { grid-template-columns: 1fr; gap: 40px; } }
"""
open(P + r"\styles.css", "a", encoding="utf-8").write(css)
print("ok")
