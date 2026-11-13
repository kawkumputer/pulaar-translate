# -*- coding: utf-8 -*-
"""Fabrique l'image de prévisualisation partagée sur WhatsApp, Facebook, X.

Format imposé par ces plateformes : 1200x630 px, PNG. Elle doit rester lisible
une fois réduite à la taille d'une vignette de conversation, donc peu de texte
et un contraste franc.

Les caractères ɓ ɗ ŋ ñ ƴ sont mis en évidence : ce sont eux qui signalent
immédiatement qu'il s'agit du pulaar du Fuuta Tooro et non d'une autre langue.
Segoe UI les rend correctement (vérifié), contrairement à beaucoup de polices
web courantes.

    python tools/og-image.py
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

LARGEUR, HAUTEUR = 1200, 630
SORTIE = 'public/og-image.png'

# Charte « Indigo nuit » (la même que les apps et le site) : l'indigo nuit, l'or du
# pulaar, et le dégradé de l'icône, de l'indigo vers l'or, adouci pour le fond.
ENCRE = (20, 27, 45)
ACCENT = (47, 58, 150)
INDIGO_FONCE = (33, 41, 105)
OR = (233, 177, 64)
DOUX = (85, 91, 107)
FOND_HAUT = (230, 230, 237)
FOND_BAS = (237, 228, 218)
SPECIAUX = ['ɓ', 'ɗ', 'ŋ', 'ñ', 'ƴ']
ICONE = 'public/icone-192.png'


def police(nom, taille):
    return ImageFont.truetype(f'C:/Windows/Fonts/{nom}', taille)


def largeur_texte(d, texte, font):
    a, _, b, _ = d.textbbox((0, 0), texte, font=font)
    return b - a


def main():
    img = Image.new('RGB', (LARGEUR, HAUTEUR), FOND_HAUT)
    d = ImageDraw.Draw(img)
    for y in range(HAUTEUR):
        k = y / (HAUTEUR - 1)
        d.line([(0, y), (LARGEUR, y)], fill=tuple(round(a + (b - a) * k) for a, b in zip(FOND_HAUT, FOND_BAS)))

    # bande d'accent a gauche, pour que la vignette reste identifiable meme
    # tres reduite
    d.rectangle([0, 0, 18, HAUTEUR], fill=ACCENT)

    f_titre = police('segoeuib.ttf', 84)
    f_sous = police('segoeui.ttf', 42)
    f_note = police('segoeui.ttf', 30)
    f_spec = police('seguisb.ttf', 50)

    x = 92
    d.text((x, 138), 'Pulaar-Translate', font=f_titre, fill=ENCRE)
    d.text((x, 258), 'Traducteur Français ↔ Pulaar', font=f_sous, fill=ACCENT)
    d.text((x, 324), 'Dialecte Fuuta Tooro', font=f_note, fill=DOUX)

    # filet de separation
    d.rectangle([x, 402, x + 150, 405], fill=ACCENT)

    # les lettres du pulaar en or, comme les touches de l'app et du site
    cx = x
    for c in SPECIAUX:
        d.rounded_rectangle([cx, 432, cx + 70, 502], radius=16, fill=OR)
        d.text((cx + 35, 466), c, font=f_spec, fill=INDIGO_FONCE, anchor='mm')
        cx += 84
    d.text((x, 536), 'Gratuit · pulaar-translate.com', font=f_note, fill=DOUX)

    # l'icone de l'app, a droite
    taille = 300
    ic = Image.open(ICONE).convert('RGB').resize((taille, taille), Image.LANCZOS)
    masque = Image.new('L', (taille, taille), 0)
    ImageDraw.Draw(masque).rounded_rectangle([0, 0, taille, taille], radius=68, fill=255)
    ombre = Image.new('RGBA', (LARGEUR, HAUTEUR), (0, 0, 0, 0))
    ox, oy = 820, 165
    ImageDraw.Draw(ombre).rounded_rectangle([ox, oy + 10, ox + taille, oy + 10 + taille], radius=68, fill=(20, 27, 45, 55))
    ombre = ombre.filter(ImageFilter.GaussianBlur(14))
    img.paste(Image.alpha_composite(img.convert('RGBA'), ombre).convert('RGB'))
    img.paste(ic, (ox, oy), masque)

    img.save(SORTIE, 'PNG', optimize=True)

    from os import path
    ko = path.getsize(SORTIE) / 1024
    print(f'{SORTIE} — {LARGEUR}x{HAUTEUR}, {ko:.0f} Ko')
    # garde-fou : au-dela de ~300 Ko certaines messageries ne chargent pas
    # l'apercu
    if ko > 300:
        print('ATTENTION : image lourde, certaines messageries ignoreront l apercu')


if __name__ == '__main__':
    main()
