"""
Dibuja el icono de cada pantalla instalable.

    pip install pillow fonttools brotli
    python scripts/generar-iconos-app.py

CUÁNDO CORRERLO: casi nunca. Solo si cambia el color o el símbolo de una
pantalla, o si se agrega una pantalla instalable nueva. Los archivos que
genera van al repositorio, así que no hace falta correrlo para publicar.

POR QUÉ EXISTE
--------------
Con tres pantallas instaladas en el mismo celular, tres iconos iguales
son tres iconos inservibles: el mesero abre la cocina, la cocina abre la
comanda, y a las ocho de la noche nadie tiene tiempo de leer el nombre
debajo. Cada pantalla necesita verse distinta desde lejos.

El símbolo NO se inventa: es exactamente el mismo que la pantalla ya
lleva en su cabecera, sacado de la misma fuente recortada que usa el
sitio (fonts/fa-solid-900.woff2). Así el icono del escritorio y el
título de la pantalla son la misma cosa, y no dos parecidas.

SOBRE EL RECORTE DE ANDROID
---------------------------
Android recorta los iconos a la forma que tenga el celular: círculo,
cuadrado redondeado, gota. Solo garantiza que se vea el 80% central.
Por eso aquí el color llena el cuadro entero —recorte donde recorte,
sale color y no un borde blanco— y el símbolo se queda holgado dentro
de ese 80%. El mismo archivo sirve como icono normal y como recortable.
"""

import io
import os

try:
    from PIL import Image, ImageDraw, ImageFont
    from fontTools.ttLib import TTFont
except ImportError:
    raise SystemExit("Faltan dependencias. Instálalas con:  pip install pillow fonttools brotli")

PROY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(PROY, "fonts", "fa-solid-900.woff2")
DESTINO = os.path.join(PROY, "img", "app")

# Los dos tamaños que Chrome pide para dejar instalar una aplicación.
TAMANOS = [192, 512]

# El símbolo es el mismo que lleva la pantalla en su cabecera.
#
# Los colores no son decoración: son la forma de distinguirlas de un
# vistazo en la pantalla de inicio. Van saturados y bien separados entre
# sí, porque a 48 píxeles el matiz es lo único que queda.
PANTALLAS = [
    # nombre        glifo   fondo      símbolo
    ("cocina",      0xE51A, "#FFC107", "#141414"),   # fa-kitchen-set
    ("parrilla",    0xF06D, "#D84315", "#FFFFFF"),   # fa-fire
    ("comanda",     0xF044, "#1565C0", "#FFFFFF"),   # fa-pen-to-square
]

# Cuánto del cuadro ocupa el símbolo. El recorte de Android respeta el
# 80% central; 46% deja el símbolo cómodo dentro de ese margen incluso
# con el recorte más agresivo, que es el circular.
PROPORCION = 0.46


def fuente_utilizable():
    """
    Pillow no sabe leer woff2, pero fontTools sí y puede volver a
    escribirlo como ttf. Así el icono se dibuja con la MISMA fuente que
    usa el sitio y no hace falta traer nada de fuera ni depender de las
    fuentes que tenga instalado quien corra esto.
    """
    fa = TTFont(FUENTE)
    fa.flavor = None                  # de woff2 a ttf plano
    memoria = io.BytesIO()
    fa.save(memoria)
    memoria.seek(0)
    return memoria


def dibujar(lado, glifo, fondo, tinta, ttf):
    img = Image.new("RGBA", (lado, lado), fondo)
    lienzo = ImageDraw.Draw(img)

    fuente = ImageFont.truetype(ttf, int(lado * PROPORCION))
    ttf.seek(0)

    # Se centra por la caja real del dibujo y no por la del renglón: las
    # fuentes de iconos dejan un hueco de línea de texto arriba y abajo,
    # y centrar por ahí deja el símbolo visiblemente alto.
    caja = lienzo.textbbox((0, 0), chr(glifo), font=fuente)
    ancho, alto = caja[2] - caja[0], caja[3] - caja[1]
    lienzo.text(((lado - ancho) / 2 - caja[0], (lado - alto) / 2 - caja[1]),
                chr(glifo), font=fuente, fill=tinta)

    return img


def menu_del_comensal():
    """
    El icono del menú público es una foto hecha a mano, no un símbolo
    dibujado aquí. Lo único que se saca de ella son los dos tamaños que
    le faltaban:

      192   Chrome no ofrece instalar nada sin un icono de 192 o más.
      recortable  la foto llega hasta el borde, así que si Android la
            recorta a un círculo se come el marco. Se encoge al 80% y
            se apoya en el fondo de la aplicación, que es el hueco que
            el recorte respeta siempre.
    """
    origen = os.path.join(PROY, "img", "icono-512.png")
    if not os.path.exists(origen):
        print("  (no está img/icono-512.png, me lo salto)")
        return

    foto = Image.open(origen).convert("RGBA")

    def guardar(img, ruta):
        """
        Se guarda con paleta, igual que los iconos que ya había. Una foto
        en color verdadero pesa tres veces más y en un icono de 192
        píxeles no se distingue: son kilobytes que el celular del
        comensal baja por la red del local para nada.
        """
        img.convert("RGB").quantize(colors=256, method=Image.MEDIANCUT).save(ruta, optimize=True)
        print(f"  {os.path.relpath(ruta, PROY).replace(os.sep, '/')}".ljust(34) +
              f"{os.path.getsize(ruta) / 1024:5.1f} KB")

    guardar(foto.resize((192, 192), Image.LANCZOS), os.path.join(PROY, "img", "icono-192.png"))

    for lado in TAMANOS:
        fondo = Image.new("RGBA", (lado, lado), "#111111")
        dentro = int(lado * 0.8)
        encogida = foto.resize((dentro, dentro), Image.LANCZOS)
        hueco = (lado - dentro) // 2
        fondo.paste(encogida, (hueco, hueco), encogida)
        guardar(fondo, os.path.join(PROY, "img", f"icono-recortable-{lado}.png"))


def main():
    os.makedirs(DESTINO, exist_ok=True)
    ttf = fuente_utilizable()

    for nombre, glifo, fondo, tinta in PANTALLAS:
        for lado in TAMANOS:
            img = dibujar(lado, glifo, fondo, tinta, ttf)
            ruta = os.path.join(DESTINO, f"{nombre}-{lado}.png")
            img.save(ruta, optimize=True)
            print(f"  img/app/{nombre}-{lado}.png".ljust(34) +
                  f"{os.path.getsize(ruta) / 1024:5.1f} KB")

    menu_del_comensal()

    print("\nListo. Sirven como icono normal y como recortable de Android.")


if __name__ == "__main__":
    main()
