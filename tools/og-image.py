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
from PIL import Image, ImageDraw, ImageFont

LARGEUR, HAUTEUR = 1200, 630
SORTIE = 'public/og-image.png'

ENCRE = (20, 27, 45)
ACCENT = (76, 88, 212)
DOUX = (110, 120, 145)
FOND = (251, 252, 254)
SPECIAUX = 'ɓ  ɗ  ŋ  ñ  ƴ'


def police(nom, taille):
    return ImageFont.truetype(f'C:/Windows/Fonts/{nom}', taille)


def largeur_texte(d, texte, font):
    a, _, b, _ = d.textbbox((0, 0), texte, font=font)
    return b - a


def main():
    img = Image.new('RGB', (LARGEUR, HAUTEUR), FOND)
    d = ImageDraw.Draw(img)

    # bande d'accent a gauche, pour que la vignette reste identifiable meme
    # tres reduite
    d.rectangle([0, 0, 18, HAUTEUR], fill=ACCENT)

    f_titre = police('segoeuib.ttf', 84)
    f_sous = police('segoeui.ttf', 42)
    f_note = police('segoeui.ttf', 30)
    f_spec = police('seguisb.ttf', 58)

    x = 92
    d.text((x, 138), 'Pulaar-Translate', font=f_titre, fill=ENCRE)
    d.text((x, 258), 'Traducteur Français ↔ Pulaar', font=f_sous, fill=ACCENT)
    d.text((x, 324), 'Dialecte Fuuta Tooro', font=f_note, fill=DOUX)

    # filet de separation
    d.rectangle([x, 402, x + 150, 405], fill=ACCENT)

    d.text((x, 444), SPECIAUX, font=f_spec, fill=ENCRE)
    d.text((x, 536), 'Gratuit · pulaar-translate.com', font=f_note, fill=DOUX)

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
