#!/usr/bin/env python3
"""Genera los recursos gráficos propios de T-Max para Roku (clients/roku/images).

Todo se dibuja aquí desde cero: esquinas redondeadas en formato 9-patch (Roku las estira
sin deformar) e íconos de línea blancos que la app tiñe con blendColor.
Uso: python3 scripts/roku-images.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "clients" / "roku" / "images"
S = 4  # sobremuestreo para bordes suaves


def nine_patch(name, size, radius, stroke=None):
    big = Image.new("RGBA", (size * S, size * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    box = [0, 0, size * S - 1, size * S - 1]
    if stroke:
        d.rounded_rectangle(box, radius=radius * S, outline=(255, 255, 255, 255), width=stroke * S)
    else:
        d.rounded_rectangle(box, radius=radius * S, fill=(255, 255, 255, 255))
    img = big.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size + 2, size + 2), (0, 0, 0, 0))
    out.paste(img, (1, 1))
    px = out.load()
    a, b = radius + 2, size - radius - 1  # zona estirable: el centro, fuera de las esquinas
    for i in range(a, b + 1):
        px[i, 0] = (0, 0, 0, 255)
        px[0, i] = (0, 0, 0, 255)
    out.save(OUT / name)


def icon(name, draw_fn, size=64):
    big = Image.new("RGBA", (size * S, size * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    w = 5 * S
    draw_fn(d, lambda v: v * S, w)
    big.resize((size, size), Image.LANCZOS).save(OUT / name)


WHITE = (255, 255, 255, 255)


def tv(d, s, w):
    d.rounded_rectangle([s(6), s(16), s(58), s(52)], radius=s(7), outline=WHITE, width=w)
    d.line([s(22), s(4), s(32), s(15)], fill=WHITE, width=w)
    d.line([s(42), s(4), s(32), s(15)], fill=WHITE, width=w)
    d.line([s(22), s(60), s(42), s(60)], fill=WHITE, width=w)


def film(d, s, w):
    d.rounded_rectangle([s(10), s(6), s(54), s(58)], radius=s(6), outline=WHITE, width=w)
    d.line([s(21), s(6), s(21), s(58)], fill=WHITE, width=w)
    d.line([s(43), s(6), s(43), s(58)], fill=WHITE, width=w)
    for y in (20, 32, 44):
        d.line([s(10), s(y), s(21), s(y)], fill=WHITE, width=w)
        d.line([s(43), s(y), s(54), s(y)], fill=WHITE, width=w)


def layers(d, s, w):
    d.polygon([s(32), s(6), s(58), s(20), s(32), s(34), s(6), s(20)], outline=WHITE, width=w)
    d.line([s(6), s(32), s(32), s(46), s(58), s(32)], fill=WHITE, width=w, joint="curve")
    d.line([s(6), s(44), s(32), s(58), s(58), s(44)], fill=WHITE, width=w, joint="curve")


def sliders(d, s, w):
    for y, x in ((14, 40), (32, 22), (50, 46)):
        d.line([s(6), s(y), s(58), s(y)], fill=WHITE, width=w)
        d.ellipse([s(x - 7), s(y - 7), s(x + 7), s(y + 7)], fill=(0, 0, 0, 0), outline=WHITE, width=w)


def star(d, s, w):
    import math
    pts = []
    for i in range(10):
        r = 28 if i % 2 == 0 else 12
        a = math.pi / 2 + i * math.pi / 5
        pts.append((s(32 + r * math.cos(a)), s(34 - r * math.sin(a))))
    d.polygon(pts, fill=WHITE)


def check(d, s, w):
    d.line([s(10), s(34), s(26), s(50), s(56), s(16)], fill=WHITE, width=int(w * 1.4), joint="curve")


def play(d, s, w):
    d.polygon([s(16), s(8), s(56), s(32), s(16), s(56)], fill=WHITE)


def search(d, s, w):
    d.ellipse([s(8), s(8), s(42), s(42)], outline=WHITE, width=w)
    d.line([s(38), s(38), s(56), s(56)], fill=WHITE, width=int(w * 1.3))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    nine_patch("round.9.png", 48, 16)
    nine_patch("round_sm.9.png", 24, 8)
    nine_patch("ring.9.png", 64, 22, stroke=5)
    icon("ic_live.png", tv)
    icon("ic_movies.png", film)
    icon("ic_series.png", layers)
    icon("ic_settings.png", sliders)
    icon("ic_star.png", star)
    icon("ic_check.png", check)
    icon("ic_play.png", play)
    icon("ic_search.png", search)
    print("Listo:", OUT)
