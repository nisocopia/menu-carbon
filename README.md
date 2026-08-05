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
7. **Las cuentas del local** — una por celular, y sus identificadores en
   `js/menu-data.js` (lista `EQUIPO`) y en `firebase-rules.json`. Es lo que
   hace que la cocina no pueda tomar pedidos ni el asador ver la venta del
   día. Los pasos están en [FIREBASE.md](FIREBASE.md).

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
| `firebase-rules.json` | **Quién puede tocar qué.** La seguridad de verdad. |
| `scripts/probar.js` | Comprobaciones antes de subir. `node scripts/probar.js` |

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

### Lo que no se anuncia

Los **juniors no salen en el menú del comensal**. Son porción de niño y
valen menos: puestos en la carta, un adulto pide el junior, come menos y el
local gana menos. Se piden diciéndoselo al mesero, como en cualquier
restaurante con menú infantil.

Se hace con `soloMesero: true` en la categoría. Esa categoría se puede pedir
desde la comanda y el gerente le edita el precio en el panel, pero no aparece
en la carta ni en la ruleta de "¿Qué pido hoy?". Sirve para cualquier cosa que
exista pero no se anuncie.

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

### Quién puede tocar qué

Cada celular entra con su propia cuenta, y cada cuenta manda en **una**
pantalla. Las otras las puede mirar — saber si la carne ya salió le sirve
a todos — pero no tocarlas. Dos manos sobre el mismo botón es como se
pierde un plato.

| Cuenta | Comanda | Parrilla | Cocina | Panel |
|---|---|---|---|---|
| **Gerente** | manda | manda | manda | manda |
| **Mesero** | manda | mira | mira | — |
| **Asador** | — | manda | mira | — |
| **Cocina** | — | mira | manda | — |

Cuando una cuenta solo mira, la pantalla se abre con una franja azul
arriba y las tarjetas salen **sin botón**. No hay nada roto: es la
pantalla de otro.

Esto no se sostiene en el navegador, donde cualquiera podría editarlo.
Cada pantalla manda a la nube **solo su campo** — el asador únicamente
`sacado`, la cocina únicamente `estado` — y las reglas de Firebase lo
comprueban del lado del servidor. Los detalles están en
[FIREBASE.md](FIREBASE.md) y las cuentas de este local en `CUENTAS.md`.

### Quién borra qué

| Toca | Pasa |
|---|---|
| **Asador: "Ya lo saqué"** | Limpia **solo su** tarjeta, y queda plegada abajo por si preguntan. La cocina todavía tiene que emplatar y servir. |
| **Cocina: ENTREGADO** | El plato salió: desaparece de **las dos** pantallas y queda plegado abajo, en "entregadas". |

Cada pantalla solo atenúa lo que ella misma resolvió: que el asador saque
la carne no apaga nada en la cocina, donde el plato todavía está por
emplatar. Y un toque de más se deshace: en lo plegado, el botón dice
**Devolver** y el pedido vuelve al tablero.

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

**Vaciar el servicio** borra las comandas, las mesas y los cobros de todo
el local. Hay que escribir `BORRAR` a mano, y **solo lo puede hacer el
gerente**: las reglas de Firebase se lo niegan a las demás cuentas.

### Para dejar los cambios fijos

Con Firebase configurado no hace falta: lo que el gerente cambia se aplica
al instante en todos los celulares y se queda guardado en la nube. Por eso
este bloque solo aparece en un local **sin** nube.

Ahí el botón **Descargar menu-data.js** genera el archivo con todo lo
editado. Se reemplaza `js/menu-data.js` en el sitio y los cambios quedan
permanentes.

> Ese archivo se genera copiando **todo** lo que hay, no una lista escrita
> a mano de campos. Antes era una lista, y cada campo nuevo del sistema de
> comandas (la estación de cada plato, las siglas, los atajos, las cuentas
> de la nube) se quedaba fuera: el archivo se veía perfecto y dejaba el
> local con el menú funcionando y las comandas muertas. `scripts/probar.js`
> compara el archivo generado contra el original plato por plato.

**Deshacer todos mis cambios** devuelve precios y agotados a como estaban
en el archivo. Está siempre disponible, con nube o sin ella.

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

**Con Firebase configurado** —que es como está este local— la clave del
panel ya no se usa: se entra con la cuenta del dueño, y quien decide qué
puede hacer cada cuenta son las **reglas de Firebase**. Eso lo revisa el
servidor de Google contra un token firmado, así que no se puede saltar
editando el navegador. Cambiar precios, ver la venta del día y vaciar el
servicio son del gerente y de nadie más.

La pantalla de bloqueo del panel sigue ahí, pero es cortesía: sirve para
que el asador que escribe la dirección a mano reciba un mensaje claro en
vez de un panel vacío. Aunque alguien se la saltara, no podría escribir
nada — la nube se lo negaría igual.

**Sin Firebase**, la clave con huella PBKDF2 es todo lo que hay, y frena a
un curioso, no a alguien decidido: en un sitio estático el código es
visible y cualquier validación del navegador se puede saltar. Lo que
protege en ese caso es que no hay nada compartido que romper — cada
dispositivo trabaja sobre su propia copia.

---

## Antes de subir cambios

```bash
node scripts/probar.js     # comprueba lo que no se ve mirando la pantalla
python scripts/version.py  # obliga a los celulares a bajar el CSS y el JS nuevos
```

`probar.js` revisa las cosas que, si se rompen, no dan ningún error y se
descubren en hora pico: que el archivo que descarga el gerente no pierda
campos, que la cuenta de una mesa junte todas sus sesiones, que un pedido
del comensal no se pueda confirmar dos veces, que cada pantalla escriba
solo su campo y que cada cuenta llegue solo hasta donde le toca.

> **Sube con el local cerrado y sin nada en rojo.** Lo que un celular dejó
> encolado se manda con las reglas que había cuando se anotó. Si cambias
> los permisos con pedidos todavía sin salir, esos pueden quedarse
> rebotando y el contador rojo no se apaga. Antes de subir, mira que las
> tres pantallas tengan el punto verde.
