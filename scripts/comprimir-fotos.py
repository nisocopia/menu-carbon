"""
Comprime las fotos de un restaurante nuevo.

Las fotos que manda un cliente suelen pesar 2-3 MB cada una. Con datos móviles
el menú tarda una eternidad en cargar y el dueño cree que está roto.
Este script las convierte a WebP: se ven igual y pesan ~95% menos.

    pip install Pillow
    python scripts/comprimir-fotos.py

Los archivos originales se mueven a img/_originales/ por si acaso.
"""

import os
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Falta Pillow. Instálalo con:  pip install Pillow")

RAIZ      = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "img")
RESPALDO  = os.path.join(RAIZ, "_originales")
ENTRADAS  = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff")

# Ancho máximo y calidad por tipo de imagen
REGLAS = {
    "productos": (1000, 84),   # tarjetas del menú
    "banner":    (1600, 82),   # imagen de portada
    "otros":     (1200, 84),
}


def peso(n):
    return f"{n/1024:.0f} KB" if n < 1024 * 1024 else f"{n/(1024*1024):.2f} MB"


def normalizar_a_4_3(imagen):
    """
    Deja la foto en proporción 4:3 SIN recortar el plato.

    Las tarjetas del menú son 4:3. Si la foto viene en otra proporción y la
    recortamos, se pierde justo lo de las orillas (el bol de ensalada, los
    patacones). En vez de eso se estira la fila de píxeles del borde para
    rellenar: como el fondo de una foto de plato suele ser una mesa lisa,
    no se nota.
    """
    ancho, alto = imagen.size
    objetivo = 4 / 3

    if abs(ancho / alto - objetivo) < 0.01:
        return imagen

    if ancho / alto > objetivo:          # muy panorámica: se agrega arriba y abajo
        nuevo_alto = round(ancho / objetivo)
        falta = nuevo_alto - alto
        arriba, abajo = falta // 2, falta - falta // 2
        lienzo = Image.new(imagen.mode, (ancho, nuevo_alto))
        lienzo.paste(imagen, (0, arriba))
        if arriba:
            lienzo.paste(imagen.crop((0, 0, ancho, 1)).resize((ancho, arriba), Image.LANCZOS), (0, 0))
        if abajo:
            lienzo.paste(imagen.crop((0, alto - 1, ancho, alto)).resize((ancho, abajo), Image.LANCZOS),
                         (0, arriba + alto))
    else:                                # muy vertical: se agrega a los lados
        nuevo_ancho = round(alto * objetivo)
        falta = nuevo_ancho - ancho
        izq, der = falta // 2, falta - falta // 2
        lienzo = Image.new(imagen.mode, (nuevo_ancho, alto))
        lienzo.paste(imagen, (izq, 0))
        if izq:
            lienzo.paste(imagen.crop((0, 0, 1, alto)).resize((izq, alto), Image.LANCZOS), (0, 0))
        if der:
            lienzo.paste(imagen.crop((ancho - 1, 0, ancho, alto)).resize((der, alto), Image.LANCZOS),
                         (izq + ancho, 0))

    return lienzo


def regla_para(ruta):
    if os.sep + "productos" + os.sep in ruta:
        return REGLAS["productos"]
    if "banner" in os.path.basename(ruta).lower():
        return REGLAS["banner"]
    return REGLAS["otros"]


def comprimir(ruta):
    ancho_max, calidad = regla_para(ruta)
    origen = os.path.getsize(ruta)

    imagen = Image.open(ruta)
    transparente = imagen.mode in ("RGBA", "LA") and imagen.getchannel("A").getextrema()[0] < 255

    imagen = imagen.convert("RGBA" if transparente else "RGB")

    # Las fotos de plato van todas en 4:3 para que las tarjetas queden parejas
    if os.sep + "productos" + os.sep in ruta:
        imagen = normalizar_a_4_3(imagen)

    if imagen.width > ancho_max:
        alto = round(imagen.height * ancho_max / imagen.width)
        imagen = imagen.resize((ancho_max, alto), Image.LANCZOS)

    destino = os.path.splitext(ruta)[0] + ".webp"
    imagen.save(destino, "WEBP", quality=calidad, method=6)
    final = os.path.getsize(destino)

    # El original se guarda, no se borra
    os.makedirs(RESPALDO, exist_ok=True)
    shutil.move(ruta, os.path.join(RESPALDO, os.path.basename(ruta)))

    print(f"  {os.path.basename(ruta):30} {peso(origen):>9} -> {peso(final):>9}   "
          f"({100 - final * 100 / origen:.0f}% menos)")
    return origen, final


def main():
    if not os.path.isdir(RAIZ):
        sys.exit(f"No encuentro la carpeta {RAIZ}")

    pendientes = []
    for carpeta, _, archivos in os.walk(RAIZ):
        if os.path.basename(carpeta) == "_originales":
            continue
        for a in archivos:
            if a.lower().endswith(ENTRADAS):
                pendientes.append(os.path.join(carpeta, a))

    if not pendientes:
        print("No hay nada que comprimir: todas las fotos ya están en WebP.")
        return

    print(f"Comprimiendo {len(pendientes)} imágenes...\n")
    total_antes = total_despues = 0
    for ruta in sorted(pendientes):
        antes, despues = comprimir(ruta)
        total_antes += antes
        total_despues += despues

    print("\n" + "=" * 66)
    print(f"TOTAL: {peso(total_antes)} -> {peso(total_despues)}   "
          f"({100 - total_despues * 100 / total_antes:.1f}% más liviano)")
    print(f"\nLos originales quedaron en {RESPALDO}")
    print("Acuérdate de actualizar las rutas en js/menu-data.js a .webp")


if __name__ == "__main__":
    main()
