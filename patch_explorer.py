import re, json
P = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\08 Sistemas e Projetos\site-velocita"
h = open(P + r"\index.html", encoding="utf-8").read()

def explorer(group, items, intro):
    tiles = ""
    for i, it in enumerate(items):
        tiles += (f'<button type="button" class="ex-tile{" active" if i == 0 else ""}" data-key="{it["key"]}" aria-pressed="{"true" if i == 0 else "false"}">'
                  f'<img src="assets/marcas/{it["img"]}" alt="{it["name"]}" loading="lazy" /></button>')
    return (f'<div class="explorer" data-group="{group}">'
            f'<p class="ex-hint">{intro}</p>'
            f'<div class="ex-tiles">{tiles}</div>'
            f'<div class="ex-panel" aria-live="polite"></div></div>')

ads = explorer("ads", [
    {"key": "meta", "img": "facebook-ads.png", "name": "Meta Ads"},
    {"key": "google", "img": "google-ads.png", "name": "Google Ads"},
    {"key": "tiktok", "img": "tiktok-shop.png", "name": "TikTok"},
], "Toque numa plataforma para ver como o anúncio funciona")

hub = explorer("hub", [
    {"key": "ml", "img": "mercadolivre.png", "name": "Mercado Livre"},
    {"key": "shopee", "img": "shopee.png", "name": "Shopee"},
    {"key": "amazon", "img": "amazon.png", "name": "Amazon"},
    {"key": "tiktokshop", "img": "tiktok-shop.png", "name": "TikTok Shop"},
], "Toque num canal para ver o que a Velocita faz nele")

def swap(h, cls, new):
    pat = re.compile(r'<div class="stage ' + cls + r'" aria-hidden="true">.*?</svg>\s*</div>', re.S)
    assert pat.search(h), cls
    return pat.sub(lambda m: new, h, count=1)

h = swap(h, "stage-ads", ads)
h = swap(h, "stage-hub", hub)

data = {
  "ads": {
    "meta": {"t": "Meta Ads", "s": "Facebook e Instagram", "d": "Anúncios que aparecem no feed, nos stories e nos reels para quem ainda não conhece a sua marca.",
             "steps": ["Definimos o público e o objetivo", "Criamos os criativos com IA", "Acompanhamos e ajustamos as campanhas"]},
    "google": {"t": "Google Ads", "s": "Pesquisa e Shopping", "d": "Anúncios para quem já está procurando o seu produto, na pesquisa do Google e nas vitrines do Shopping.",
             "steps": ["Escolhemos as palavras que o cliente busca", "Montamos anúncios e vitrine de produtos", "Otimizamos para vender mais com o mesmo investimento"]},
    "tiktok": {"t": "TikTok Ads", "s": "Vídeos curtos", "d": "Vídeos curtos que prendem a atenção e levam direto ao produto, incluindo anúncios que parecem conteúdo do dia a dia.",
             "steps": ["Roteirizamos vídeos curtos com IA", "Publicamos e impulsionamos", "Medimos o que gera interesse e compra"]}
  },
  "hub": {
    "ml": {"t": "Mercado Livre", "s": "Marketplace", "d": "Colocamos o seu catálogo no ar e cuidamos do anúncio até o pedido.",
           "steps": ["Cadastro do catálogo com texto e SEO", "Preço e estoque sempre atualizados", "Pedidos e etiquetas no seu fluxo"]},
    "shopee": {"t": "Shopee", "s": "Marketplace", "d": "Seu catálogo na Shopee, com anúncios organizados e pedidos acompanhados.",
           "steps": ["Cadastro do catálogo com texto e SEO", "Preço e estoque sempre atualizados", "Pedidos e etiquetas no seu fluxo"]},
    "amazon": {"t": "Amazon", "s": "Marketplace", "d": "Presença na Amazon com anúncios bem construídos e operação organizada.",
           "steps": ["Cadastro do catálogo com texto e SEO", "Preço e estoque sempre atualizados", "Pedidos e etiquetas no seu fluxo"]},
    "tiktokshop": {"t": "TikTok Shop", "s": "Venda dentro do vídeo", "d": "Seus produtos vendidos dentro dos vídeos e das lives, com conteúdo e catálogo conectados.",
           "steps": ["Catálogo e vitrine no TikTok Shop", "Conteúdo em vídeo para cada produto", "Pedidos e etiquetas no seu fluxo"]}
  }
}

js = """
  // painéis interativos: escolher a plataforma mostra como funciona
  const EXPLORER = %s;
  document.querySelectorAll('.explorer').forEach((ex) => {
    const group = ex.dataset.group;
    const panel = ex.querySelector('.ex-panel');
    const show = (key) => {
      const d = EXPLORER[group][key];
      ex.querySelectorAll('.ex-tile').forEach((t) => {
        const on = t.dataset.key === key;
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', String(on));
      });
      panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
      panel.innerHTML = '<h4>' + d.t + ' <small>' + d.s + '</small></h4><p>' + d.d + '</p>' +
        '<ol class="ex-steps">' + d.steps.map((s, i) => '<li style="--i:' + i + '"><span>' + (i + 1) + '</span>' + s + '</li>').join('') + '</ol>';
    };
    ex.querySelectorAll('.ex-tile').forEach((t) => t.addEventListener('click', () => show(t.dataset.key)));
    show(ex.querySelector('.ex-tile').dataset.key);
  });
""" % json.dumps(data, ensure_ascii=False)

assert "const EXPLORER" not in h
h = h.replace("  // menu no celular", js + "\n  // menu no celular", 1)
open(P + r"\index.html", "w", encoding="utf-8").write(h)

css = """
/* ===== painéis interativos (anúncios e canais) ===== */
.explorer { margin-top: 16px; }
.ex-hint { font-size: 13px; color: var(--muted); margin-bottom: 12px; }
.ex-tiles { display: flex; flex-wrap: wrap; gap: 10px; }
.ex-tile {
  flex: 1 1 0; min-width: 84px; height: 72px; display: grid; place-items: center; cursor: pointer;
  background: #fff; border: 2px solid transparent; border-radius: 14px; padding: 8px; opacity: .72;
  transition: transform .2s, opacity .2s, border-color .2s, box-shadow .2s;
}
.ex-tile img { max-height: 52px; max-width: 100%; width: auto; object-fit: contain; }
.ex-tile:hover { opacity: 1; transform: translateY(-2px); }
.ex-tile.active { opacity: 1; border-color: var(--orange); box-shadow: 0 0 0 4px rgba(244,130,31,.22); }
.ex-tile:focus-visible { outline: 3px solid var(--orange); outline-offset: 3px; }
.ex-panel { margin-top: 14px; padding: 18px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); min-height: 214px; }
.ex-panel.swap { animation: exIn .4s cubic-bezier(.2,.7,.2,1); }
.ex-panel h4 { font-family: 'Poppins', sans-serif; font-size: 1.02rem; color: #fff; }
.ex-panel h4 small { font-weight: 500; font-size: 12px; color: var(--orange-bright); margin-left: 6px; }
.ex-panel > p { font-size: 14px; margin-top: 8px; color: #b9c3d9; }
.ex-steps { list-style: none; margin-top: 14px; display: grid; gap: 10px; }
.ex-steps li {
  display: flex; align-items: center; gap: 12px; font-size: 14px; color: #fff; opacity: 0; transform: translateX(-8px);
  animation: exStep .5s cubic-bezier(.2,.7,.2,1) forwards; animation-delay: calc(var(--i) * .14s + .12s);
}
.ex-steps li span {
  flex: 0 0 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 12px 'Poppins', sans-serif;
  color: #111c36; background: linear-gradient(135deg, var(--orange-bright), var(--orange));
}
@keyframes exIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes exStep { to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ex-panel.swap, .ex-steps li { animation: none !important; opacity: 1; transform: none; } }
"""
open(P + r"\styles.css", "a", encoding="utf-8").write(css)
print("ok")
