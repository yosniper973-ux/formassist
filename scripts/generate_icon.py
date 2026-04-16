"""
Génère les icônes FormAssist dans src-tauri/icons/ :
  - Fond dégradé violet → rose
  - Coins arrondis
  - Lettre "F" blanche au centre

Produit : 32x32.png, 128x128.png, 128x128@2x.png, icon.ico (multi-résolution)
"""

import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join("src-tauri", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

# Couleurs FormAssist — mêmes teintes que l'UI (Tailwind)
COLOR_TOP = (124, 58, 237)    # purple-600
COLOR_BOT = (236, 72, 153)    # pink-500


def find_bold_font():
    """Cherche une police bold disponible selon l'OS."""
    candidates = [
        "C:\\Windows\\Fonts\\arialbd.ttf",               # Windows bold
        "C:\\Windows\\Fonts\\arial.ttf",                 # Windows régulier
        "/System/Library/Fonts/Helvetica.ttc",           # macOS
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def create_icon(size: int) -> Image.Image:
    """Crée une icône carrée de taille donnée avec le design FormAssist."""
    # Fond dégradé vertical violet → rose
    bg = Image.new("RGBA", (size, size), COLOR_TOP + (255,))
    draw = ImageDraw.Draw(bg)
    for y in range(size):
        ratio = y / max(size - 1, 1)
        r = int(COLOR_TOP[0] + (COLOR_BOT[0] - COLOR_TOP[0]) * ratio)
        g = int(COLOR_TOP[1] + (COLOR_BOT[1] - COLOR_TOP[1]) * ratio)
        b = int(COLOR_TOP[2] + (COLOR_BOT[2] - COLOR_TOP[2]) * ratio)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Coins arrondis
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle(
        [(0, 0), (size, size)], radius=int(size * 0.22), fill=255
    )

    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    # Lettre "F" blanche
    font_path = find_bold_font()
    font_size = int(size * 0.62)
    try:
        font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    draw = ImageDraw.Draw(icon)
    text = "F"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - int(size * 0.02)  # léger décalage visuel
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    return icon


def main() -> None:
    print(f"Génération dans {OUT_DIR}/")

    # PNG aux différentes tailles Tauri
    sizes = [(32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png")]
    for size, filename in sizes:
        img = create_icon(size)
        img.save(os.path.join(OUT_DIR, filename))
        print(f"  ✅ {filename} ({size}x{size})")

    # ICO multi-résolution (Windows)
    master = create_icon(256)
    master.save(
        os.path.join(OUT_DIR, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("  ✅ icon.ico (multi-résolution)")

    # Image source haute définition (pour usages ultérieurs)
    hd = create_icon(512)
    hd.save(os.path.join(OUT_DIR, "icon.png"))
    print("  ✅ icon.png (512x512)")

    print("✅ Icônes FormAssist générées")


if __name__ == "__main__":
    main()
