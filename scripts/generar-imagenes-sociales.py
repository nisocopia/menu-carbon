"""
Genera la imagen que se ve al compartir el menú y los iconos de la app.

    python scripts/generar-imagenes-sociales.py

Produce:
  img/og-image.jpg        lo que aparece al pegar el link en WhatsApp
  img/icono-180.png       icono al guardar el menú en la pantalla de inicio
  img/icono-512.png       icono grande
  img/favicon.png         icono de la pestaña del navegador

Lee el nombre del restaurante desde js/menu-data.js, así que sirve igual
para el próximo cliente sin tocar nada.
"""

import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    sys.exit("Falta Pillow. Instálalo con:  pip install Pillow")

PROY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG  = os.path.join(PROY, "img")

# Fuentes gruesas disponibles en Windows, en orden de preferencia
CANDIDATAS = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
]

AMARILLO = (255, 193, 7)


def leer_datos():
    """Saca el nombre y el lema del menú sin ejecutar el JavaScript."""
    ruta = os.path.join(PROY, "js", "menu-data.js")
    with open(ruta, encoding="utf-8") as f:
        codigo = f.read()

    def campo(clave, defecto):
        m = re.search(rf"{clave}\s*:\s*'([^']*)'", codigo)
        return m.group(1) if m else defecto

    foto = None
    m = re.search(r"img:\s*'(img/productos/[^']+)'", codigo)
    if m:
        candidata = os.path.join(PROY, m.group(1))
        if os.path.exists(candidata):
            foto = candidata

    return campo("nombre", "Menú"), campo("lema", ""), foto


def cargar_fuente(tam):
    for ruta in CANDIDATAS:
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, tam)
    return ImageFont.load_default()


def hacer_og(nombre, lema, foto):
    """1200x630 es la medida que esperan WhatsApp, Facebook y Google."""
    A, H = 1200, 630
    lienzo = Image.new("RGB", (A, H), (17, 17, 17))

    if foto:
        base = Image.open(foto).convert("RGB")
        # Recorte central que llene los 1200x630
        escala = max(A / base.width, H / base.height)
        base = base.resize((round(base.width * escala), round(base.height * escala)), Image.LANCZOS)
        izq = (base.width - A) // 2
        arr = (base.height - H) // 2
        lienzo.paste(base.crop((izq, arr, izq + A, arr + H)), (0, 0))

    # Oscurecido de abajo hacia arriba para que el texto se lea siempre
    velo = Image.new("L", (1, H))
    for y in range(H):
        # transparente arriba, casi opaco abajo
        velo.putpixel((0, y), int(245 * (max(0, y - H * 0.30) / (H * 0.70)) ** 1.3))
    velo = velo.resize((A, H))
    lienzo = Image.composite(Image.new("RGB", (A, H), (10, 10, 10)), lienzo, velo)

    dib = ImageDraw.Draw(lienzo)

    # El nombre se achica solo si es muy largo, para que nunca se corte
    tam = 88
    fuente = cargar_fuente(tam)
    while dib.textlength(nombre, font=fuente) > A - 130 and tam > 40:
        tam -= 4
        fuente = cargar_fuente(tam)

    y = H - 190
    dib.text((65, y), nombre, font=fuente, fill=(255, 255, 255))

    if lema:
        f_lema = cargar_fuente(34)
        recorte = lema if dib.textlength(lema, font=f_lema) < A - 130 else lema[:60] + "…"
        dib.text((68, y + tam + 18), recorte, font=f_lema, fill=(214, 214, 214))

    # Franja amarilla de marca
    dib.rectangle([0, H - 14, A, H], fill=AMARILLO)

    destino = os.path.join(IMG, "og-image.jpg")
    lienzo.save(destino, "JPEG", quality=88, optimize=True)
    print(f"  og-image.jpg      {os.path.getsize(destino)/1024:5.1f} KB   1200x630")


def hacer_iconos():
    """Iconos cuadrados a partir del logo."""
    origen = os.path.join(IMG, "logo.webp")
    if not os.path.exists(origen):
        print("  (sin img/logo.webp, me salto los iconos)")
        return

    logo = Image.open(origen).convert("RGB")

    # Recorte cuadrado centrado
    lado = min(logo.size)
    izq = (logo.width - lado) // 2
    arr = (logo.height - lado) // 2
    cuadrado = logo.crop((izq, arr, izq + lado, arr + lado))

    for tam, nombre in [(512, "icono-512.png"), (180, "icono-180.png"), (64, "favicon.png")]:
        destino = os.path.join(IMG, nombre)
        icono = cuadrado.resize((tam, tam), Image.LANCZOS)
        # Un logo con foto en PNG pesa muchísimo; con 256 colores se ve igual
        # a este tamaño y baja a una fracción.
        icono = icono.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
        icono.save(destino, "PNG", optimize=True)
        print(f"  {nombre:17} {os.path.getsize(destino)/1024:5.1f} KB   {tam}x{tam}")


def main():
    nombre, lema, foto = leer_datos()
    print(f"Restaurante: {nombre}")
    print(f"Foto de fondo: {os.path.basename(foto) if foto else '(ninguna)'}\n")
    hacer_og(nombre, lema, foto)
    hacer_iconos()
    print("\nListo. Acuérdate de que el link de WhatsApp cachea la vista previa:")
    print("si la cambias, tarda un rato en actualizarse.")


if __name__ == "__main__":
    main()
