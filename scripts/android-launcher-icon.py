#!/usr/bin/env python3
"""The Android app's launcher icon: the logo layer of its adaptive icon, made from the
website's app icon (public/icons/sellio-pwa-512.png) so both show the same logo.

Android draws an adaptive icon from two 108dp layers (a white background,
values/ic_launcher_background.xml, and this logo on a transparent layer) and shows the
middle 72dp through the phone's mask: a circle, a rounded square or another shape. The logo
is 15% larger than in Base44's build of the app (Alvin's choice, 4 Nov 2026): every part of
it stays within 32.7dp of the middle, inside the 33dp circle Android keeps clear on every
mask shape, so no mask cuts into the lettering.

Run from the repository: python3 scripts/android-launcher-icon.py
(needs Pillow, NumPy and SciPy). It writes ic_launcher_foreground.png at each density.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SOURCE = 'public/icons/sellio-pwa-512.png'
RES = 'android/app/src/main/res'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
LAYER_DP = 108
FARTHEST_DP = 32.7  # where the farthest bit of the logo reaches, from the middle (15% over Base44's)


def cut_out(rgb):
    """The logo on transparency: the white around it goes, the white inside it stays."""
    ink = (255 - rgb).max(axis=2)
    near_white = ink < 32
    labels, _ = ndimage.label(near_white)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    outside = np.isin(labels, edge[edge > 0])
    # The outside and a 2 px band into the logo's edge: colour to alpha against white, so the
    # logo looks exactly as before on white and its edge stays smooth on anything else.
    band = ndimage.binary_dilation(outside, iterations=2)
    alpha = np.ones(ink.shape)
    a = ink / 255.0
    alpha[band] = a[band]
    colour = rgb.astype(float)
    soft = band & (a > 0)
    colour[soft] = 255 - (255 - colour[soft]) / a[soft][:, None]
    rgba = np.dstack([np.clip(colour, 0, 255), alpha * 255]).round().astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), ~outside & (ink >= 32)


def main():
    rgb = np.array(Image.open(SOURCE).convert('RGB')).astype(int)
    logo, ink = cut_out(rgb)
    size = rgb.shape[1]
    ys, xs = np.nonzero(ink)
    centre = (size - 1) / 2
    reach = np.hypot(xs - centre, ys - centre).max() / size  # of the source's width
    fraction = FARTHEST_DP / (LAYER_DP * reach)  # of the layer the source's square takes
    print(f'logo reaches {reach:.4f} of its square from the middle; square = {fraction:.3f} of the layer')
    premultiplied = logo.convert('RGBa')
    for name, scale in DENSITIES.items():
        layer_px = round(LAYER_DP * scale)
        logo_px = round(layer_px * fraction)
        scaled = premultiplied.resize((logo_px, logo_px), Image.LANCZOS).convert('RGBA')
        layer = Image.new('RGBA', (layer_px, layer_px), (0, 0, 0, 0))
        offset = (layer_px - logo_px) // 2
        layer.alpha_composite(scaled, (offset, offset))
        path = os.path.join(RES, f'mipmap-{name}', 'ic_launcher_foreground.png')
        layer.save(path, optimize=True)
        print(f'{path}: {layer_px} px, logo square {logo_px} px')
    return 0


if __name__ == '__main__':
    sys.exit(main())
