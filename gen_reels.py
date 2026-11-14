import os, subprocess, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SITE = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\08 Sistemas e Projetos\site-velocita"
OUT = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\06 Marketing e Redes Sociais\Posts Novembro 2026\Reels"
TMP = r"C:\Users\isabe\AppData\Local\Temp\reels_tmp"
MUSIC = r"C:\Users\isabe\AppData\Local\Temp\vgig\music\future_bass.mp3"
FF = r"C:\Users\isabe\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
os.makedirs(OUT, exist_ok=True); shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP)
W, H = 1080, 1920
B = r"C:\Windows\Fonts\segoeuib.ttf"; R = r"C:\Windows\Fonts\segoeui.ttf"
F = lambda p, s: ImageFont.truetype(p, s)
LOGO = Image.open(SITE + r"\assets\logo-oficial.png").convert("RGBA")
THEMES = {
    "dark": dict(bg=(12, 21, 40), g1=(125, 64, 16), g2=(26, 44, 110), grid=(22, 32, 54), t=(255, 255, 255), a=(255, 154, 61), s=(200, 209, 228)),
    "orange": dict(bg=(244, 130, 31), g1=(255, 176, 96), g2=(200, 90, 10), grid=(236, 120, 22), t=(17, 28, 54), a=(255, 255, 255), s=(40, 28, 20)),
}

def bg(theme):
    t = THEMES[theme]
    img = Image.new("RGB", (W, H), t["bg"]); g = Image.new("RGB", (W, H), t["bg"]); d = ImageDraw.Draw(g)
    d.ellipse((380, -400, 1400, 700), fill=t["g1"]); d.ellipse((-460, 1250, 560, 2300), fill=t["g2"])
    g = g.filter(ImageFilter.GaussianBlur(200)); img = Image.blend(img, g, .92); d = ImageDraw.Draw(img)
    for x in range(0, W, 60): d.line((x, 0, x, H), fill=t["grid"])
    for y in range(0, H, 60): d.line((0, y, W, y), fill=t["grid"])
    return img

def wrap(d, text, f, maxw):
    out, cur = [], ""
    for w in text.split():
        test = (cur + " " + w).strip()
        if d.textlength(test, font=f) <= maxw: cur = test
        else: out.append(cur); cur = w
    out.append(cur); return out

def scene(name, kicker, title, sub=None, theme="dark", logos=None, close=False):
    t = THEMES[theme]; img = bg(theme); d = ImageDraw.Draw(img)
    l = LOGO.copy(); l.thumbnail((150, 150)); img.paste(l, (70, 300), l)
    d.text((245, 312), "VELOCITA", font=F(B, 50), fill=t["t"]); d.text((248, 372), "G L O B A L", font=F(B, 24), fill=t["a"])
    f = F(B, 118); lines = wrap(d, title, f, W - 140)
    while len(lines) > 4: f = F(B, f.size - 8); lines = wrap(d, title, f, W - 140)
    lh = int(f.size * 1.14); block = (70 if kicker else 0) + len(lines) * lh + (30 + 140 if sub else 0)
    y = int(560 + (1150 - block) / 2)
    if kicker: d.text((70, y), kicker.upper(), font=F(B, 38), fill=t["a"]); y += 78
    for ln in lines: d.text((70, y), ln, font=f, fill=t["t"]); y += lh
    if sub:
        y += 30; f2 = F(R, 52)
        for ln in wrap(d, sub, f2, W - 140): d.text((70, y), ln, font=f2, fill=t["s"]); y += 70
    if logos:
        x0, yy, tw, th, gap = 70, 1500, 220, 140, 26
        for i, fn in enumerate(logos):
            x = x0 + i * (tw + gap)
            d.rounded_rectangle((x, yy, x + tw, yy + th), radius=24, fill=(255, 255, 255))
            lg = Image.open(SITE + r"\assets\marcas" + "\\" + fn).convert("RGBA"); lg.thumbnail((tw - 40, th - 36))
            img.paste(lg, (x + (tw - lg.width) // 2, yy + (th - lg.height) // 2), lg)
    if close:
        d.text((70, 1500), "velocitaglobal.com.br", font=F(B, 56), fill=t["t"])
        d.text((70, 1580), "WhatsApp (16) 3362-4507", font=F(B, 48), fill=t["a"])
    d.rectangle((0, H - 18, W, H), fill=(244, 130, 31))
    p = os.path.join(TMP, name + ".png"); img.save(p); return p

def make_reel(fname, scenes, secs=4.0, fade=0.6):
    n = len(scenes); total = secs * n - fade * (n - 1)
    cmd = [FF, "-v", "error", "-y"]
    for s in scenes: cmd += ["-loop", "1", "-t", f"{secs + fade:.2f}", "-i", s]
    cmd += ["-ss", "11", "-i", MUSIC]
    parts = []
    for i in range(n):
        parts.append(f"[{i}:v]zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int((secs + fade) * 30)}:s={W}x{H}:fps=30,format=yuv420p[v{i}]")
    cur = "v0"
    for i in range(1, n):
        off = i * (secs - fade)
        parts.append(f"[{cur}][v{i}]xfade=transition=slideleft:duration={fade}:offset={off:.2f}[x{i}]"); cur = f"x{i}"
    filt = ";".join(parts)
    cmd += ["-filter_complex", filt, "-map", f"[{cur}]", "-map", f"{n}:a", "-t", f"{total:.2f}",
            "-af", f"afade=t=in:d=0.5,afade=t=out:st={total - 1.5:.2f}:d=1.5,volume=0.5",
            "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", os.path.join(OUT, fname)]
    subprocess.run(cmd, check=True)

# Reel 1: do catálogo ao anúncio no ar (18/11)
r1 = [
    scene("a1", "Bastidores", "Do catálogo ao anúncio no ar.", "Veja como o seu produto chega aos marketplaces."),
    scene("a2", "Passo 1", "Seu catálogo chega.", "Produtos, fotos e informações organizados.", theme="orange"),
    scene("a3", "Passo 2", "A IA cria os anúncios.", "Textos, fotos e vídeos com tecnologia própria."),
    scene("a4", "Passo 3", "Anúncio no ar.", "Em vários canais ao mesmo tempo.", theme="orange", logos=["mercadolivre.png", "shopee.png", "amazon.png", "tiktok-shop.png"]),
    scene("a5", "Fale com a gente", "Vamos acelerar a sua marca?", None, close=True),
]
make_reel("Reel 18-11 - Do catalogo ao anuncio.mp4", r1)
# Reel 2: 3 ajustes antes da Black Friday (25/11)
r2 = [
    scene("b1", "Black Friday", "3 ajustes rápidos antes da Black Friday.", "Faça hoje, em poucos minutos."),
    scene("b2", "Ajuste 1", "Título completo.", "Use as palavras que o cliente pesquisa.", theme="orange"),
    scene("b3", "Ajuste 2", "Foto principal limpa.", "Boa luz e fundo limpo vendem mais."),
    scene("b4", "Ajuste 3", "Ficha técnica completa.", "Medidas, material e características.", theme="orange"),
    scene("b5", "Fale com a gente", "Quer ajuda para preparar o seu?", None, close=True),
]
make_reel("Reel 25-11 - 3 ajustes Black Friday.mp4", r2)
print("ok")
