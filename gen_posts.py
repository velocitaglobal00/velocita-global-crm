import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SITE = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\08 Sistemas e Projetos\site-velocita"
OUT = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\06 Marketing e Redes Sociais\Posts Novembro 2026"
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1350
B = r"C:\Windows\Fonts\segoeuib.ttf"
R = r"C:\Windows\Fonts\segoeui.ttf"
F = lambda p, s: ImageFont.truetype(p, s)
LOGO = Image.open(SITE + r"\assets\logo-oficial.png").convert("RGBA")

THEMES = {
    "dark":   dict(bg=(12, 21, 40), glow1=(125, 64, 16), glow2=(26, 44, 110), grid=(22, 32, 54), title=(255, 255, 255), accent=(255, 154, 61), sub=(200, 209, 228), foot=(255, 255, 255)),
    "orange": dict(bg=(244, 130, 31), glow1=(255, 176, 96), glow2=(200, 90, 10), grid=(236, 120, 22), title=(17, 28, 54), accent=(255, 255, 255), sub=(40, 28, 20), foot=(17, 28, 54)),
    "light":  dict(bg=(244, 246, 250), glow1=(255, 226, 196), glow2=(214, 224, 244), grid=(232, 236, 244), title=(17, 28, 54), accent=(244, 130, 31), sub=(76, 88, 112), foot=(17, 28, 54)),
}

def background(theme):
    t = THEMES[theme]
    img = Image.new("RGB", (W, H), t["bg"])
    g = Image.new("RGB", (W, H), t["bg"]); d = ImageDraw.Draw(g)
    d.ellipse((420, -260, 1300, 560), fill=t["glow1"]); d.ellipse((-340, 820, 460, 1560), fill=t["glow2"])
    g = g.filter(ImageFilter.GaussianBlur(170)); img = Image.blend(img, g, .92)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 60): d.line((x, 0, x, H), fill=t["grid"])
    for y in range(0, H, 60): d.line((0, y, W, y), fill=t["grid"])
    return img

def wrap(d, text, font, maxw):
    out, cur = [], ""
    for w in text.split():
        test = (cur + " " + w).strip()
        if d.textlength(test, font=font) <= maxw: cur = test
        else: out.append(cur); cur = w
    if cur: out.append(cur)
    return out

def fit(d, text, path, maxw, maxlines, start, minsize=48):
    s = start
    while s >= minsize:
        f = F(path, s); lines = wrap(d, text, f, maxw)
        if len(lines) <= maxlines and all(d.textlength(l, font=f) <= maxw for l in lines): return f, lines
        s -= 4
    f = F(path, minsize); return f, wrap(d, text, f, maxw)

def footer(img, theme, idx=None, total=None, cue=False):
    d = ImageDraw.Draw(img); t = THEMES[theme]
    d.text((70, H - 96), "velocitaglobal.com.br", font=F(B, 34), fill=t["foot"])
    d.rectangle((0, H - 14, W, H), fill=(244, 130, 31))
    if idx:
        txt = f"{idx}/{total}"; w = d.textlength(txt, font=F(B, 30)); d.text((W - 70 - w, 84), txt, font=F(B, 30), fill=t["accent"])
    if cue:
        txt = "Arraste  \u2192"; w = d.textlength(txt, font=F(B, 32)); d.text((W - 70 - w, H - 96), txt, font=F(B, 32), fill=t["accent"])

def header(img, theme):
    l = LOGO.copy(); l.thumbnail((112, 112)); img.paste(l, (66, 54), l)
    d = ImageDraw.Draw(img); t = THEMES[theme]
    d.text((190, 66), "VELOCITA", font=F(B, 38), fill=t["title"]); d.text((192, 112), "G L O B A L", font=F(B, 17), fill=t["accent"])

def card(name, title, sub=None, theme="dark", idx=None, total=None, cue=False, logos=None, kicker=None, big=False):
    img = background(theme); header(img, theme); d = ImageDraw.Draw(img); t = THEMES[theme]
    f, lines = fit(d, title, B, W - 140, 5, 128 if big else 108, 56)
    lh = int(f.size * 1.14)
    f2, l2 = fit(d, sub, R, W - 140, 4, 50, 30) if sub else (None, [])
    block = (70 if kicker else 0) + len(lines) * lh + (24 + len(l2) * int(f2.size * 1.32) if sub else 0)
    top, bottom = 230, (H - 450 if logos else H - 130)
    y = int(top + (bottom - top - block) / 2)
    if kicker:
        d.text((70, y), kicker.upper(), font=F(B, 32), fill=t["accent"]); y += 70
    for ln in lines:
        d.text((70, y), ln, font=f, fill=t["title"]); y += lh
    y += 24
    for ln in l2:
        d.text((70, y), ln, font=f2, fill=t["sub"]); y += int(f2.size * 1.32)
    if logos:
        x0, yy, tw, th, gap = 70, H - 340, 220, 130, 26
        for i, fn in enumerate(logos):
            x = x0 + i * (tw + gap)
            d.rounded_rectangle((x, yy, x + tw, yy + th), radius=22, fill=(255, 255, 255))
            lg = Image.open(SITE + r"\assets\marcas" + "\\" + fn).convert("RGBA"); lg.thumbnail((tw - 40, th - 34))
            img.paste(lg, (x + (tw - lg.width) // 2, yy + (th - lg.height) // 2), lg)
    footer(img, theme, idx, total, cue)
    img.save(os.path.join(OUT, name), optimize=True)

def carousel(folder, slides, theme="dark"):
    os.makedirs(os.path.join(OUT, folder), exist_ok=True)
    n = len(slides)
    for i, (title, sub) in enumerate(slides, start=1):
        th = theme if i not in (1, n) else ("orange" if theme == "dark" else theme)
        card(os.path.join(folder, f"slide {i:02d}.png"), title, sub, theme=th, idx=i, total=n, cue=(i == 1), kicker=("Passe os slides" if i == 1 else None), big=(i == 1 or i == n))

# ----------------------------- imagens -----------------------------
S = [
 ("11-11 qua 10h - Imagem.png", dict(title="Fornecedor, seu produto merece mais vitrines.", sub="Mercado Livre, Shopee, Amazon e TikTok Shop.", logos=["mercadolivre.png", "shopee.png", "amazon.png", "tiktok-shop.png"], big=True)),
 ("13-11 sex 10h - Imagem.png", dict(title="Produto bom. Lugar errado.", sub="A gente muda o endereço dele.", theme="orange", big=True)),
 ("14-11 sab 11h - Imagem.png", dict(title="Em qual canal você mais vende hoje?", sub="Mercado Livre, Shopee, Amazon ou o seu site? Conta pra gente nos comentários.", theme="light", kicker="Enquete de sábado")),
 ("15-11 dom 11h - Imagem.png", dict(title="Nosso site está no ar.", sub="IA própria, tráfego pago, marketing e e-commerce, tudo em um só lugar.", kicker="Novidade", big=True)),
 ("17-11 ter 10h - Imagem.png", dict(title="Seu cliente não está só em um lugar.", sub="Esteja em todos.", theme="light", big=True)),
 ("20-11 sex 10h - Imagem.png", dict(title="Feriado. O marketplace não fecha.", sub="A busca não para. O seu produto está lá?", kicker="Feriado", big=True)),
 ("21-11 sab 11h - Imagem.png", dict(title="Qual foi o maior desafio nas suas vendas online?", sub="Responde nos comentários. Sua resposta vira o nosso próximo conteúdo.", theme="orange", kicker="Queremos ouvir você")),
 ("22-11 dom 11h - Imagem.png", dict(title="Velocita + Remember.", sub="Redes sociais e anúncios no automático, com inteligência artificial.", kicker="Parceria", big=True)),
 ("24-11 ter 10h - Imagem.png", dict(title="Faltam 3 dias para a Black Friday.", sub="Seu anúncio está pronto?", theme="orange", big=True)),
 ("26-11 qui 10h - Imagem.png", dict(title="Preciso mandar estoque? Não.", sub="O produto fica com você. A gente cuida do cadastro, do anúncio e do acompanhamento.", theme="light", kicker="Pergunta frequente")),
 ("27-11 sex 10h - Imagem.png", dict(title="Black Friday: foco no atendimento.", sub="Responda rápido, venda mais.", kicker="Hoje é o dia", big=True)),
 ("28-11 sab 11h - Imagem.png", dict(title="Obrigado por acompanhar a semana.", sub="E o que vem pela frente?", theme="orange", big=True)),
 ("29-11 dom 11h - Imagem.png", dict(title="Dezembro começa agora.", sub="Planeje antes, venda melhor.", theme="light", big=True)),
]
for name, kw in S:
    card(name, kw.pop("title"), **kw)

# ----------------------------- carrosséis -----------------------------
carousel("12-11 qui 10h - Carrossel", [
    ("5 erros que travam o seu anúncio", "Veja se o seu cai em algum deles."),
    ("1. Título curto demais", "O cliente busca por palavras. Título completo ajuda o anúncio a ser encontrado."),
    ("2. Foto escura ou sem fundo limpo", "A foto é a primeira coisa que o cliente vê. Luz boa e fundo limpo vendem mais."),
    ("3. Ficha técnica incompleta", "Medidas, material e características evitam dúvida e devolução."),
    ("4. Palavras que ninguém busca", "Escreva do jeito que o cliente pesquisa, não do jeito que a fábrica chama."),
    ("5. Anúncio parado", "Anúncio bom é acompanhado e ajustado. Quer revisar o seu? Fale com a gente."),
])
carousel("16-11 seg 10h - Carrossel", [
    ("O que a IA faz pelo seu anúncio", "Tecnologia própria da Velocita, no dia a dia."),
    ("Textos de anúncio", "Títulos e descrições pensados para a busca de cada canal."),
    ("Vídeos e fotos de produto", "Material criado com IA para mostrar o produto do melhor jeito."),
    ("Ajuste das campanhas", "A IA lê os dados e indica o que manter, o que mudar e o que pausar."),
    ("Tecnologia própria. Acompanhamento de perto.", "Fale com a gente e conheça os serviços."),
])
carousel("19-11 qui 10h - Carrossel", [
    ("Black Friday: o que arrumar antes", "Checklist rápido para chegar preparado."),
    ("1. Títulos e fichas revisados", "Confira se estão completos e com as palavras que o cliente busca."),
    ("2. Fotos atualizadas", "Imagens limpas e bem iluminadas em todos os anúncios."),
    ("3. Estoque conferido", "Evite vender o que não pode entregar."),
    ("4. Atendimento preparado", "Respostas rápidas e claras. Defina quem responde e quando."),
    ("Faltam poucos dias. Organize agora.", "Salve este checklist e envie para o seu time."),
])
carousel("23-11 seg 10h - Carrossel", [
    ("Cada plataforma tem o seu papel", "Tráfego pago em Meta, Google e TikTok."),
    ("Meta Ads", "Apresenta a sua marca no feed, nos stories e nos reels."),
    ("Google Ads", "Aparece para quem já está procurando o seu produto."),
    ("TikTok Ads", "Vídeos curtos que prendem a atenção e levam ao produto."),
    ("Juntas, vendem mais.", "Quer montar a combinação certa para a sua marca? Fale com a gente."),
])
carousel("30-11 seg 10h - Carrossel", [
    ("Novembro na Velocita", "Um mês de novidades e muito aprendizado."),
    ("Nosso site no ar", "Serviços, canais e contato em um só lugar: velocitaglobal.com.br."),
    ("Parceria com a Remember", "Redes sociais e anúncios no automático, com inteligência artificial."),
    ("Conteúdos que mais ajudaram", "Dicas de anúncio, checklist de Black Friday e tráfego pago."),
    ("Dezembro vem aí. Vamos juntos?", "Compartilhe com quem merece conhecer a Velocita."),
])
print("ok")
