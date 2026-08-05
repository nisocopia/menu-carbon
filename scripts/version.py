"""
Marca los CSS y JS con un número de versión para que los navegadores
no sigan usando los archivos viejos que tienen guardados.

    python scripts/version.py

CUÁNDO CORRERLO: **siempre, justo antes de hacer push**, si tocaste algún
archivo .css o .js.

Por qué hace falta: el navegador de un comensal que ya escaneó el QR guarda
el CSS y el JS. Si subes cambios sin marcar la versión, ese teléfono puede
mezclar el HTML nuevo con el CSS viejo, y el menú se ve roto (fotos con
zoom, botones encima de las fotos). Cambiar el ?v= hace que la dirección
del archivo sea distinta, así que el navegador está obligado a bajarlo.
"""

import glob
import os
import re
import time

PROY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Todas las páginas del proyecto, no una lista escrita a mano.
#
# Antes eran solo index.html y panel.html. Al agregar las pantallas de
# comanda, parrilla y cocina, sus CSS y JS dejaron de marcarse: el
# servidor tenía lo nuevo pero los celulares seguían usando lo viejo
# guardado, y el fallo parecía del sistema y no del caché. Buscarlas
# solas evita que vuelva a pasar con la próxima página que se agregue.
PAGINAS = sorted(os.path.basename(p) for p in glob.glob(os.path.join(PROY, "*.html")))

# Marca de tiempo: siempre distinta y además dice cuándo se publicó
VERSION = time.strftime("%Y%m%d%H%M")


def versionar(html):
    """Agrega o actualiza ?v= en los href/src de archivos propios."""
    def cambiar(m):
        atributo, ruta = m.group(1), m.group(2)
        if ruta.startswith(("http://", "https://", "//")):
            return m.group(0)                      # recursos externos, no se tocan
        limpia = ruta.split("?")[0]
        if not limpia.endswith((".css", ".js")):
            return m.group(0)
        return f'{atributo}="{limpia}?v={VERSION}"'

    return re.sub(r'\b(href|src)="([^"]+)"', cambiar, html)


def versionar_ayudante():
    """
    Marca también sw.js, el ayudante que guarda los archivos.

    Guarda lo que se baja en una caja con nombre. Al cambiar el nombre,
    la caja anterior se tira entera en cuanto el ayudante nuevo arranca.
    Sin esto la caja se llamaría siempre igual y una tablet podría
    quedarse con el JavaScript de hace tres semanas dentro, sirviéndolo
    con toda confianza: exactamente el problema que este script existe
    para evitar, pero más difícil de ver porque ya no se arregla
    recargando.
    """
    ruta = os.path.join(PROY, "sw.js")
    if not os.path.exists(ruta):
        return

    with open(ruta, encoding="utf-8") as f:
        original = f.read()

    nuevo, cuantos = re.subn(r"(const VERSION = ')[^']*(')",
                             rf"\g<1>{VERSION}\g<2>", original, count=1)
    if not cuantos:
        print("  sw.js          AVISO: no encontré la línea de VERSION")
        return

    if nuevo != original:
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(nuevo)
    print(f"  {'sw.js':14} caja marcada")


def main():
    total = 0
    for pagina in PAGINAS:
        ruta = os.path.join(PROY, pagina)
        if not os.path.exists(ruta):
            continue

        with open(ruta, encoding="utf-8") as f:
            original = f.read()

        nuevo = versionar(original)
        if nuevo != original:
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(nuevo)

        marcados = len(re.findall(rf"\?v={VERSION}", nuevo))
        total += marcados
        print(f"  {pagina:14} {marcados} archivos marcados")

    versionar_ayudante()

    print(f"\nVersión: {VERSION}   ({total} referencias)")
    print("Ahora sí puedes hacer commit y push: los celulares bajarán lo nuevo.")


if __name__ == "__main__":
    main()
