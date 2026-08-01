# Menú Virtual + Panel del Gerente

Menú digital para restaurantes. El cliente pide desde su celular, el mesero
solo se acerca a leer la comanda en pantalla, y el dueño controla todo
desde su propio panel.

Sin servidor, sin base de datos, sin costo mensual de hosting.
El sitio completo pesa **1.7 MB**.

---

## Cómo venderlo a otro restaurante

Solo se tocan dos cosas:

1. **`js/menu-data.js`** — nombre del local, horario, WhatsApp, número de mesas,
   categorías, platos y precios.
2. **`img/productos/`** — las fotos de los platos.

Nada más. El resto del sistema (carrito, comanda, panel, juegos, tracker) se
adapta solo a los datos nuevos.

### Comprimir las fotos del cliente nuevo

Las fotos que manda un restaurante suelen pesar 2–3 MB cada una. Hay que bajarlas
o el menú no carga con datos móviles:

```bash
python scripts/comprimir-fotos.py
```

Convierte todo a WebP a 1000 px. En este proyecto bajó de 30.67 MB a 1.52 MB
(95 % menos) sin diferencia visible en pantalla.

Además deja **todas las fotos de plato en 4:3**, que es la proporción de las
tarjetas. Cuando una foto viene más panorámica, en vez de recortarla le estira
el borde del fondo: así no se pierde el bol de ensalada ni los patacones de las
orillas, que es justo lo que se cortaba antes.

---

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El menú. Se dibuja solo desde los datos. |
| `panel.html` | Panel privado del dueño. |
| `js/menu-data.js` | **Lo único que se edita por restaurante.** |
| `js/store.js` | Guarda pedidos, cambios de precio y estadísticas. |
| `js/app.js` | Dibuja el menú, el carrito y la comanda. |
| `js/panel.js` | Lógica del panel del gerente. |
| `js/tracker.js` | Aviso de "tu pedido va en camino". |
| `js/games.js` | Juegos para la espera. |

---

## El flujo del pedido

1. El cliente arma su pedido desde la mesa.
2. Antes de cerrar, el menú le sugiere acompañantes (**esto sube el ticket**).
3. Confirma.
4. Aparece una **comanda en pantalla** con el código del pedido (#A47), los
   platos y el total, en letra grande y fondo claro para leerse de lejos.
5. El mesero se acerca, la lee y la anota.
6. Al cliente le queda corriendo el aviso de progreso de su plato.

No se le pregunta el número de mesa: el mesero ya está parado frente a ella
cuando lee la pantalla, así que era fricción de más.

Si el restaurante configura un número de WhatsApp en `menu-data.js`,
además aparece un botón para enviar el pedido ya escrito.

---

## El panel del gerente

Se entra en `panel.html` con la clave definida en `pinPanel`.

- **Pedidos** — pedidos del día con su estado (Nuevo → En cocina → Entregado).
- **Menú** — cambiar precios y nombres, marcar **Agotado** de un toque,
  destacar el plato estrella. Los cambios se aplican al instante.
- **Números** — pedidos, vendido, ticket promedio, y el dato que más vale:
  **qué platos mira mucha gente pero nadie pide** (casi siempre les falta foto).
- **Local** — nombre, horario, dirección, WhatsApp, mesas, clave.

### Para dejar los cambios fijos

El botón **Descargar menu-data.js** genera el archivo con todo lo editado.
Se reemplaza `js/menu-data.js` en el sitio y los cambios quedan permanentes
para todos los clientes.

---

## Límite importante que hay que saber

Todo se guarda en el navegador de cada dispositivo (`localStorage`). Eso es lo
que permite que no haya servidor ni costo mensual, pero significa que:

- Los **agotados y precios** que el dueño cambia en el panel se ven en **su**
  dispositivo. Para que los vean todos los clientes hay que descargar
  `menu-data.js` y reemplazarlo en el sitio.
- Los **pedidos que hacen los clientes en sus propios celulares** no llegan
  al panel del dueño. Por eso el flujo es que el mesero lee la comanda en la
  mesa, que es como funciona de verdad en un local pequeño.

Si un cliente quiere que los agotados se actualicen solos en todos los celulares
y que los pedidos lleguen a una pantalla en cocina, se conecta una base de datos
gratuita (Firebase free tier alcanza de sobra) y se cobra como plan superior.

## La clave del panel

La clave **no** se guarda en el código. En `menu-data.js` solo va su huella
(PBKDF2-SHA256, 200.000 iteraciones, con sal). Para cambiarla:

```bash
node scripts/generar-clave.js "LaNuevaClave"
```

y se pegan en `menu-data.js` las dos líneas que imprime. Usa una frase de 12
caracteres o más: como el repositorio es público, cualquiera puede tomar la
huella y probar combinaciones en su propia computadora, y 4 dígitos son solo
10.000 posibilidades.

Además: 5 intentos fallidos bloquean 5 minutos, la sesión caduca a las 8 horas,
y el panel está fuera de Google (`robots.txt` + `noindex`).

### Hasta dónde protege

Esto frena a un curioso, no a alguien decidido. En un sitio estático todo el
código es visible y cualquier validación se puede saltar editando el navegador.

Lo que de verdad protege hoy es que **el panel no controla nada crítico**: como
cada dispositivo trabaja sobre su propia copia, un extraño que entrara solo
vería y editaría lo suyo. No puede cambiar el menú real, ni ver pedidos, ni
tocar precios para los demás.

Eso cambia el día que se conecte una base de datos compartida. Ahí el panel sí
pasa a mandar sobre lo que ven todos, y la validación tiene que hacerse del lado
del servidor (reglas de Firebase), no en el navegador.
