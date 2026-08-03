# Menú Virtual + Panel del Gerente

Menú digital para restaurantes. El cliente pide desde su celular, el mesero
solo se acerca a leer la comanda en pantalla, y el dueño controla todo
desde su propio panel.

Sin servidor, sin base de datos, sin costo mensual de hosting.
El sitio completo pesa **1.7 MB**.

---

## Cómo venderlo a otro restaurante

1. **`js/menu-data.js`** — nombre del local, horario, WhatsApp, categorías,
   platos y precios.
2. **`img/productos/`** — las fotos de los platos, y luego:
   ```bash
   python scripts/comprimir-fotos.py
   ```
3. **La clave del panel:**
   ```bash
   node scripts/generar-clave.js "LaClaveDelCliente"
   ```
   y se pegan en `menu-data.js` las dos líneas que imprime.
4. **La vista previa y los iconos:**
   ```bash
   python scripts/generar-imagenes-sociales.py
   ```
5. **Las etiquetas de `index.html`** — título, descripción y las URL absolutas
   de `og:url`, `og:image` y `canonical`. **Esto es lo único que hay que editar
   a mano**, porque los buscadores y WhatsApp no ejecutan JavaScript y no
   pueden leer `menu-data.js`. Si se olvida, el link compartido mostrará el
   nombre del restaurante anterior.
6. `manifest.json` — nombre y nombre corto de la app.

El resto (carrito, comanda, panel, juegos, tracker) se adapta solo.

### El sitio no depende de nadie

La fuente y los iconos se sirven desde el propio sitio, no desde Google ni
Cloudflare. Font Awesome completo son ~250 KB; recortado a los 34 iconos que
este menú usa son 6.9 KB. Ver la primera pantalla del menú cuesta **119 KB**,
y las fotos bajan solas a medida que el comensal hace scroll.

Si algún día agregas un icono nuevo, hay que volver a generar el recorte —
si no, no se va a ver.

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
| `comanda.html` | **Tomar pedido y cobrar.** El celular del mesero. |
| `parrilla.html` | Lo que ve el asador: solo proteínas. |
| `cocina.html` | Lo que ve la cocina: el pedido entero y los cubiertos. |
| `panel.html` | Panel privado del dueño. |
| `js/menu-data.js` | **Lo único que se edita por restaurante.** |
| `js/servicio.js` | El sistema de comandas: mesas, tandas, códigos, cuenta. |
| `js/comanda.js` | Lógica de la pantalla de tomar pedido. |
| `js/estacion.js` | Lógica compartida de la parrilla y la cocina. |
| `js/store.js` | Guarda cambios de precio y estadísticas. |
| `js/app.js` | Dibuja el menú y el carrito del comensal. |
| `js/panel.js` | Lógica del panel del gerente. |
| `js/tracker.js` | Aviso de "tu pedido va en camino". |
| `js/games.js` | Juegos para la espera. |

---

## El sistema de comandas

Reemplaza el cuaderno y los dos papeles (el del asador y el de la cocina).
Lo que se escribe una vez sale al mismo tiempo a las tres pantallas.

### El código del pedido

```
   M3 · 2PO 1CA
   │    └──────┴─  lo que se pidió
   └───────────── mesa 3

   se lee: "mesa tres, dos pollo, una carne"
```

Solo la parrilla lleva abreviatura, que es lo que más se pide y lo que el
asador lee con las manos ocupadas:

```
   PO  Pollo asado      X2   Mixto 2 carnes      JPO  Junior de pollo
   CA  Carne asada      X2E  Mixto 2 especial    JCA  Junior de carne
   CH  Chuleta          X3   Mixto 3 carnes      JCH  Junior de chuleta
   CO  Costilla         X3E  Mixto 3 especial
   MA  Matambre
```

`M3 · 2PO 2JPO` es una familia: dos pollos y dos juniors. El junior de
hornada y los apanados no llevan sigla porque no son de parrilla — salen con
su nombre.

Los platos de cocina salen con su nombre (`M6 · 1 Camarón Ajillo`): nadie va a
decir "un ka-jota" en voz alta.

**Cada tanda tiene su código**, igual que cada renglón nuevo del cuaderno. La
primera de la mesa 3 es `M3`, la segunda `M3b`, la tercera `M3c`. Todas se
suman a la misma cuenta. Así el código nunca queda mintiendo cuando el pedido
crece a mitad de comida.

Las modificaciones **no** van dentro del código — comprimirlas lo volvería
ilegible. Van escritas debajo, en palabras.

### Quién ve qué

| Pantalla | Ve |
|---|---|
| **Parrilla** | Solo proteínas. El término y el "para llevar". Nada de guarniciones: no cambian nada en la parrilla. |
| **Cocina** | El pedido entero, los cubiertos en grande y lo que se le quitó al plato. Esta pantalla también la lee el que sirve. |
| **Comanda** | Todo, más la cuenta. |

Las bebidas no le llegan a ninguna estación: las sirve el mesero directo.

### Cosas que se calculan solas

- **Los cubiertos.** Son los platos que se sientan a comer. Si alguien pide dos
  pollos y uno es para llevar, es **un** cubierto.
- **La mesa se abre y se cierra sola.** Se abre con la primera tanda y se libera
  cuando el saldo llega a cero.
- **El "para llevar" se atrasa.** En la parrilla, un pedido que es solo para
  llevar baja a una sección aparte, para que salga caliente cuando el de la
  mesa ya está comiendo.

### Tomar el pedido

Se escribe, no se toca: `3p 2c` son 3 pollos y 2 carnes. Rayar eso en el
cuaderno y teclearlo cuestan lo mismo — pero teclearlo ya llegó al asador y a
la cocina. Los atajos de cada plato están en `menu-data.js`, campo `atajo`.

Tocar botones también funciona, pero es el camino lento.

### Cobrar

Siempre por lo que comió cada uno, nunca en partes iguales. Se tocan los platos
de esa persona, se cobra en efectivo o transferencia, y lo que falta se queda
abierto en la mesa.

Las bebidas que no están en la lista (las de la tienda de al lado) se agregan
con **"Otra bebida"**. Como el precio sale de preguntar el costo en la tienda y
subirle 25 o 50 centavos, se escribe lo que costó y el precio de venta sale
solo. Queda guardada, así que la segunda vez ya es un toque.

---

## El flujo del comensal

1. El cliente arma su pedido desde la mesa.
2. Antes de cerrar, el menú le sugiere acompañantes (**esto sube el ticket**).
3. Toca **en qué mesa está** — el QR no lleva el número dentro.
4. Aparece una **comanda en pantalla** con el código (`M3 · 2PO 1CA`), los
   platos y el total, en letra grande y fondo claro para leerse de lejos.
5. El pedido cae en la **bandeja del mesero**, que lo confirma de un toque.
   Recién ahí sale a la parrilla y a la cocina.
6. Al cliente le queda corriendo el aviso de progreso de su plato.

Ese paso 5 no es burocracia: el celular del comensal no tiene cuenta del local,
y si pudiera escribir directo en las comandas, cualquiera que abra el menú
podría meterle 20 platos falsos a la parrilla.

Si el restaurante configura un número de WhatsApp en `menu-data.js`,
además aparece un botón para enviar el pedido ya escrito.

---

## Límite importante que hay que saber

**El sistema de comandas necesita Firebase.** Sin él, cada celular trabajaría
con su propia copia y la cocina nunca vería lo que escribe el mesero — que es
justamente el problema que este sistema resuelve. Los pasos están en
[FIREBASE.md](FIREBASE.md) y es gratis en este volumen.

El menú del comensal sí sigue funcionando sin Firebase, como antes.

### Si se cae el internet a mitad del servicio

Nada se para. Cada celular guarda lo suyo y lo reenvía solo cuando vuelve la
señal. Pero como eso puede tardar, el sistema lo dice sin rodeos:

- Arriba a la derecha aparece en rojo **"N sin enviar"**, parpadeando
- El aviso al mandar una comanda cambia a **"anotado — SIN RED, la cocina
  todavía no lo ve"**

Nunca dice "enviado" cuando no salió. Si el rojo no se apaga, hay que ir a
decirlo a mano o sacar el cuaderno.

---

## El panel del gerente

Se entra en `panel.html` con la cuenta del dueño.

- **Pedidos** — las comandas del local, con su código, su mesa y su estado.
  Es de solo lectura: el estado lo pone la cocina cuando entrega, y tener un
  segundo lugar donde cambiarlo solo serviría para que los dos digan cosas
  distintas.
- **Menú** — cambiar precios y nombres, marcar **Agotado** de un toque,
  destacar el plato estrella. Los cambios se aplican al instante en todos los
  celulares.
- **Números** — mesas atendidas, vendido, **ticket por mesa** y tandas. Más el
  dato que más vale: **qué platos mira mucha gente pero nadie pide** (casi
  siempre les falta foto).
- **Local** — nombre, horario, dirección, WhatsApp, mesas, clave.

El ticket se mide **por mesa, no por tanda**. Una mesa que pidió tres veces es
un cliente que gastó una vez, no tres clientes chicos: medirlo por tanda hacía
parecer que el ticket bajaba justo cuando la gente pedía más.

### Para dejar los cambios fijos

El botón **Descargar menu-data.js** genera el archivo con todo lo editado.
Se reemplaza `js/menu-data.js` en el sitio y los cambios quedan permanentes
para todos los clientes.

---

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
