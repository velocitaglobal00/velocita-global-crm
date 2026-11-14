from PIL import Image, ImageDraw, ImageFont
import os
D = 'C:/Users/isabe/AppData/Local/Temp/pen/'
OUT = os.path.dirname(os.path.abspath(__file__)) + '/'
PX_MM = 40
W_MM, H_MM = 76, 33
W, H = W_MM * PX_MM, H_MM * PX_MM          # 3040 x 1320
ORANGE = (244, 130, 31, 255); NAVY = (27, 42, 78, 255)
WHITE = (244, 247, 252, 255); BLACK = (16, 20, 30, 255)

def font(size, var):
    f = ImageFont.truetype('C:/Windows/Fonts/bahnschrift.ttf', size)
    try: f.set_variation_by_name(var)
    except Exception: pass
    return f

def tracked(draw, xy, text, f, fill, tracking=0, anchor='ls'):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill, anchor=anchor)
        x += f.getlength(ch) + tracking
    return x

def width_tracked(text, f, tracking):
    return sum(f.getlength(c) for c in text) + tracking * (len(text) - 1)

def build(mode):
    """mode: color | white | black"""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if mode == 'color':
        c_main, c_acc, c_soft, logo = WHITE, ORANGE, (244, 247, 252, 200), 'reversed'
    elif mode == 'white':
        c_main = c_acc = c_soft = WHITE; logo = 'mono_white'
    else:
        c_main = c_acc = c_soft = BLACK; logo = 'mono_black'
    lp = D + f'logo_{logo}.png'
    if logo == 'mono_black':
        base = Image.open(D + 'logo_mono_white.png')
        px = base.load()
        for y in range(base.height):
            for x in range(base.width):
                r, g, b, a = px[x, y]; px[x, y] = (16, 20, 30, a)
        base.save(lp)
    logo_img = Image.open(lp)

    def paste_logo(h, cx, cy):
        w = round(logo_img.width * h / logo_img.height)
        t = logo_img.resize((w, h), Image.LANCZOS)
        img.alpha_composite(t, (round(cx - w / 2), round(cy - h / 2)))
        return w

    A, B = 330, 990        # centro vertical das duas faces
    # ---- Face A: logo + marca + slogan
    lw = paste_logo(420, 330, A)
    x0 = 330 + lw / 2 + 120
    f1, f2 = font(190, 'Bold'), font(190, 'Light')
    xe = tracked(d, (x0, A + 10), 'VELOCITA', f1, c_main, tracking=26)
    tracked(d, (xe + 70, A + 10), 'GLOBAL', f2, c_main, tracking=26)
    # linha fina + slogan
    f3 = font(66, 'SemiBold')
    tag = 'ACELERAÇÃO B2B & E-COMMERCE'
    d.rectangle([x0, A + 55, x0 + 220, A + 63], fill=c_acc)
    tracked(d, (x0, A + 160), tag, f3, c_acc, tracking=14)
    # ---- anéis "órbita" (envolvem o corpo da caneta)
    rx = 2640
    d.rectangle([rx, 0, rx + 46, H], fill=c_acc)
    d.rectangle([rx + 86, 0, rx + 100, H], fill=c_main)
    d.rectangle([rx + 140, 0, rx + 148, H], fill=c_main)
    # ---- Face B: serviços + telefone
    paste_logo(300, 2850, B)
    f4 = font(78, 'SemiBold')
    t4 = 'SOLUÇÕES  ·  OPERAÇÃO  ·  BI & IA'
    tracked(d, (300, B - 60), t4, f4, c_main, tracking=16)
    f5 = font(150, 'Bold')
    tracked(d, (300, B + 130), '+55 16 3362-4507', f5, c_acc, tracking=10)
    return img

for m in ('color', 'white', 'black'):
    im = build(m)
    im.save(OUT + f'arte_impressao_{m}.png', dpi=(1016, 1016))
    print(m, im.size)
