"""
Deja en el proyecto solo los iconos de Font Awesome que el menú usa de verdad,
más la fuente Poppins. Nada se pide a servidores externos.

    pip install fonttools brotli
    python scripts/actualizar-iconos.py

CUÁNDO HAY QUE VOLVER A CORRERLO: cada vez que agregues un icono nuevo
(cualquier clase fa-loquesea) en el HTML o en el JavaScript. Si no lo corres,
ese icono no se va a ver, porque la fuente recortada no lo contiene.

La librería completa son ~250 KB entre CSS y fuentes. Recortada a los iconos
en uso baja a unos 7 KB.
"""
import re, os, io, glob, urllib.request

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:
    raise SystemExit("Faltan dependencias. Instálalas con:  pip install fonttools brotli")

PROY  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(PROY, "fonts")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
PESOS_POPPINS = [300, 400, 500, 600, 700]
VER   = "6.4.0"
BASE  = f"https://cdnjs.cloudflare.com/ajax/libs/font-awesome/{VER}"


def traer(url):
    return urllib.request.urlopen(url, timeout=60).read()


# 1. Qué iconos usa el proyecto
usados = set()
for patron in ("*.html", "js/*.js"):
    for ruta in glob.glob(os.path.join(PROY, patron)):
        with open(ruta, encoding="utf-8") as f:
            usados |= set(re.findall(r"\bfa-([a-z0-9-]+)", f.read()))

usados -= {"solid", "brands", "regular"}
print(f"Iconos en uso: {len(usados)}")

# 2. Sus códigos, según el CSS oficial.
# Font Awesome agrupa los alias en una sola regla:
#   .fa-concierge-bell:before,.fa-bell-concierge:before{content:"\f562"}
# así que hay que leer la lista completa de selectores, no solo el último.
css = traer(f"{BASE}/css/all.min.css").decode("utf-8")
codigos = {}
for selectores, codigo in re.findall(
        r"((?:\.fa-[a-z0-9-]+:before\s*,?\s*)+)\{content:\"\\([0-9a-f]+)\"\}", css):
    for nombre in re.findall(r"\.fa-([a-z0-9-]+):before", selectores):
        codigos[nombre] = codigo

faltan = sorted(i for i in usados if i not in codigos)
if faltan:
    print(f"  Sin código (revisar): {faltan}")

# 3. Cuáles son marca (brands) y cuáles sólidos
marcas = set(re.findall(r"\.fa-([a-z0-9-]+):before", css.split(".fab,")[-1])) if ".fab," in css else set()
BRANDS = {"whatsapp", "facebook", "instagram", "tiktok", "x-twitter"}
solidos = {i: codigos[i] for i in usados if i in codigos and i not in BRANDS}
marca   = {i: codigos[i] for i in usados if i in codigos and i in BRANDS}
print(f"  sólidos: {len(solidos)}   marcas: {len(marca)}")

os.makedirs(FONTS, exist_ok=True)
reglas = []


def recortar(archivo, mapa, salida):
    """Deja en la fuente únicamente los glifos de los iconos usados."""
    crudo = traer(f"{BASE}/webfonts/{archivo}")
    antes = len(crudo)

    fuente = TTFont(io.BytesIO(crudo))
    opciones = subset.Options()
    opciones.layout_features = []
    opciones.notdef_outline = True
    opciones.desubroutinize = True
    recortador = subset.Subsetter(options=opciones)
    recortador.populate(unicodes=[int(c, 16) for c in mapa.values()])
    recortador.subset(fuente)

    fuente.flavor = "woff2"
    destino = os.path.join(FONTS, salida)
    fuente.save(destino)
    despues = os.path.getsize(destino)
    print(f"  {salida:24} {antes/1024:6.1f} KB -> {despues/1024:5.1f} KB")
    return despues


total = 0
if solidos:
    total += recortar("fa-solid-900.woff2", solidos, "fa-solid-900.woff2")
    reglas += [f'.fa-{n}:before{{content:"\\{c}"}}' for n, c in sorted(solidos.items())]
if marca:
    total += recortar("fa-brands-400.woff2", marca, "fa-brands-400.woff2")
    reglas += [f'.fa-{n}:before{{content:"\\{c}"}}' for n, c in sorted(marca.items())]

# 4. CSS mínimo, con el mismo marcado de siempre (<i class="fas fa-fire">)
hoja = f"""/* Font Awesome {VER} recortado a los {len(solidos)+len(marca)} iconos que usa este menú.
   Se sirve desde el propio sitio: no depende de ningún servidor externo. */

@font-face {{
    font-family: 'Font Awesome 6 Free';
    font-style: normal;
    font-weight: 900;
    font-display: block;
    src: url('../fonts/fa-solid-900.woff2') format('woff2');
}}

@font-face {{
    font-family: 'Font Awesome 6 Brands';
    font-style: normal;
    font-weight: 400;
    font-display: block;
    src: url('../fonts/fa-brands-400.woff2') format('woff2');
}}

.fas, .fa-solid, .fab, .fa-brands {{
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    display: inline-block;
    font-style: normal;
    font-variant: normal;
    line-height: 1;
    text-rendering: auto;
}}

.fas, .fa-solid  {{ font-family: 'Font Awesome 6 Free'; font-weight: 900; }}
.fab, .fa-brands {{ font-family: 'Font Awesome 6 Brands'; font-weight: 400; }}

{chr(10).join(reglas)}
"""

ruta_css = os.path.join(PROY, "css", "iconos.css")
with open(ruta_css, "w", encoding="utf-8") as f:
    f.write(hoja)

print(f"  css/iconos.css           {os.path.getsize(ruta_css)/1024:5.1f} KB")
print(f"\nTotal iconos: {(total + os.path.getsize(ruta_css))/1024:.1f} KB  (antes ~250 KB desde el CDN)")


# 5. Poppins, solo el subconjunto latino (cubre todo el español)
def bajar_poppins():
    print("\nFuente Poppins:")
    suma = 0
    for peso in PESOS_POPPINS:
        pedido = urllib.request.Request(
            f"https://fonts.googleapis.com/css2?family=Poppins:wght@{peso}&display=swap",
            headers={"User-Agent": UA})
        hoja_css = urllib.request.urlopen(pedido, timeout=30).read().decode()

        bloques = re.split(r"/\*\s*([\w-]+)\s*\*/", hoja_css)
        enlace = None
        for i in range(1, len(bloques), 2):
            if bloques[i] == "latin":
                m = re.search(r"src:\s*url\((https://[^)]+\.woff2)\)", bloques[i + 1])
                if m:
                    enlace = m.group(1)
                break
        if not enlace:
            print(f"  peso {peso}: no encontré el subconjunto latino")
            continue

        datos = urllib.request.urlopen(
            urllib.request.Request(enlace, headers={"User-Agent": UA}), timeout=30).read()
        destino = os.path.join(FONTS, f"poppins-{peso}.woff2")
        with open(destino, "wb") as f:
            f.write(datos)
        suma += len(datos)
        print(f"  poppins-{peso}.woff2        {len(datos)/1024:5.1f} KB")
    print(f"\nTotal fuente: {suma/1024:.1f} KB")


bajar_poppins()
print("\nListo. Si agregaste un icono nuevo, ya quedó incluido.")
