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
6. `manifest.json` y los `manifest-*.json` — nombre y nombre corto de cada
   aplicación instalable.
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
| `servir.html` | Las once mesas de un vistazo: cuántos cubiertos y en qué orden. |
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
| `js/pwa.js` | Registra el ayudante y enciende el botón de instalar. |
| `js/aviso.js` | Apunta el aparato para recibir avisos con la app cerrada. |
| `scripts/avisar.js` | Cifra y firma un aviso. Web Push a mano, sin librerías. |
| `scripts/enviar-aviso.js` | Mandar un aviso a mano, para probar. |
| `sw.js` | El ayudante: deja instalar las pantallas y guarda lo ya bajado. |
| `manifest.json` | El menú del comensal, como aplicación. |
| `manifest-cocina.json` · `-parrilla` · `-comanda` | Una aplicación por pantalla. |
| `firebase-rules.json` | **Quién puede tocar qué.** La seguridad de verdad. |
| `scripts/probar.js` | Comprobaciones antes de subir. `node scripts/probar.js` |

---

## Instalar las pantallas como aplicación

Las tres pantallas de servicio se instalan por separado y cada una abre
la suya. No es un adorno: una pestaña de Chrome se pierde entre las otras
doce, se cierra sin querer y en Android es de las primeras que el sistema
mata cuando le falta memoria. Instalada tiene su icono y el sistema la
trata como la herramienta con la que se trabaja.

**Cómo se instala:** se abre la pantalla en Chrome y sale un botón azul
abajo, *"Instalar la cocina en este aparato"*. Si no sale, Chrome todavía
no considera que se use bastante — está también en el menú de los tres
puntos, como *"Instalar aplicación"*.

Cada una tiene su propio icono y su propio color, porque tres iconos
iguales en la misma pantalla de inicio son tres iconos inservibles:

| Pantalla | Icono | Color |
|---|---|---|
| Cocina | sartén y olla | amarillo |
| Parrilla | llama | naranja |
| Comanda | lápiz | azul |

Los dibuja `python scripts/generar-iconos-app.py` con el mismo símbolo que
lleva la pantalla en su cabecera, sacado de la misma fuente que usa el
sitio. Solo hay que volver a correrlo si cambia un color o un símbolo.

## Avisos que despiertan el celular

El aviso sonoro de la cocina **solo suena con la pantalla encendida y la
aplicación a la vista**. No es un descuido y no se puede arreglar desde la
página: si Android congela la aplicación, no queda nada corriendo que
pueda sonar. Con el celular en el bolsillo, no se entera nadie.

Lo único que despierta un celular dormido es un aviso que llegue de fuera.
Eso lo reparte Google y va cifrado y firmado, para que no lo pueda usar
cualquiera.

### Montarlo (una vez por restaurante)

```bash
node scripts/generar-clave-push.js
```

Imprime dos claves. **La pública** se pega en `js/menu-data.js`, en `PUSH`.
**La privada no va al repositorio**: con ella se puede hacer sonar
cualquier pantalla del local, así que se guarda donde las contraseñas y
solo la tiene quien mande los avisos.

Después hay que **subir las reglas nuevas a Firebase** (`firebase-rules.json`
trae la rama `avisos`). Sin eso, los aparatos no se pueden apuntar.

Si `PUSH.clave` se deja vacío no pasa nada: todo sigue igual que antes,
solo que sin avisar con el celular guardado.

### Apuntar un celular

Se abre la pantalla, se entra con la cuenta, y sale un botón amarillo:
**"Avisarme aunque esté guardado"**. Hay que tocarlo — la página no puede
preguntar sola, porque Chrome le contesta que no automáticamente y ese
"no" ya no se deshace sin ir a los ajustes del sistema.

Cada aparato queda apuntado **bajo el papel de quien entró** (cocina,
parrilla, mesero). Eso es lo que después permite avisar solo a quien le
toca.

### Probar que funciona

```bash
$env:CLAVE_PUSH    = '...'   # la privada
$env:CORREO_PUSH   = '...'   # la cuenta del gerente
$env:CLAVE_GERENTE = '...'

node scripts/enviar-aviso.js --lista    # quién está apuntado
node scripts/enviar-aviso.js cocina     # mandarle uno
```

**La prueba de verdad es con la pantalla apagada y el celular en el
bolsillo.** Si suena así, funciona.

### Por qué está escrito a mano

Hay una librería de Google que hace esto, pero son ~150 KB que habría que
traer de su CDN — y este sitio no le pide nada a nadie: la fuente, los
iconos y hasta el acceso a Firebase están hechos aquí.

Resulta que no hace falta. Un aviso a Chrome en Android llega **por FCM de
todas formas**; la librería solo cambia cómo se habla con esa tubería. Con
el estándar Web Push, que el navegador ya trae, el resultado es idéntico,
no hay nada que configurar en la consola de Firebase y el sitio no crece
ni un byte.

`scripts/avisar.js` implementa los tres RFC (8188, 8291, 8292) en unas cien
líneas, y está **comprobado byte por byte contra el ejemplo oficial del RFC
8291**. Esa prueba importa más de lo que parece: si el cifrado se desviara
aunque fuera un byte, Google aceptaría el aviso y contestaría que todo
bien, pero el celular no lo podría abrir y lo tiraría sin decir nada.

### Qué hace y qué NO hace el ayudante

`sw.js` guarda lo que ya se bajó para que una pantalla abierta sobreviva a
un corte de wifi. Guarda cada cosa distinto:

- **el HTML, siempre por red** — una tablet con el código de hace tres
  semanas es peor que una que tarda medio segundo más;
- **los `.css` y `.js` marcados con `?v=`, de lo guardado** — no pueden
  cambiar sin cambiar de dirección;
- **las fotos y las fuentes, lo guardado ahora y lo nuevo para la próxima.**

**Lo que no toca, y es lo más importante: nada que vaya a Firebase.** Ni
los pedidos, ni la sesión, ni el canal por el que llegan las comandas. Ese
canal es una conexión que se queda abierta horas; un ayudante que
intentara guardarla dejaría a la cocina sin recibir pedidos y sin un solo
mensaje de error. `probar.js` lo comprueba en cada corrida.

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

### Dos nombres para el mismo plato

En la carta se vende **Mixto 2 Carnes**, que es lo que el comensal entiende.
Puertas adentro ese mismo plato es **Mixto 2 Proteínas**, que es como se habla
en la cocina. Se declara con `interno` en `menu-data.js` y lo usan la comanda,
la cocina, la parrilla, servir y el panel — **la carta del comensal no**.

Un plato sin `interno` se llama igual en los dos lados, así que no hay que
declarar nada para los otros cuarenta y pico.

Se resuelve **por el plato y no por lo que quedó escrito en la comanda**: el
nombre se guarda tal como estaba el día del pedido, y si el gerente lo cambia,
lo viejo seguiría diciendo lo de antes. El de repuesto es ese texto guardado,
para lo que ya no está en el menú — las bebidas de la tienda, por ejemplo.

### Fiar

Muy poca gente, pero la hay: se lleva el plato y paga después. En la pantalla
de cobrar, debajo de Efectivo y Transferencia, un botón chico y punteado —
**Fiar, paga después**. Pide el nombre y **sin nombre no pasa**: un "debe
$7.50" sin dueño no se puede cobrar nunca.

**Fiar es un cobro con otra forma de pago.** La mesa se cierra y queda libre
—la gente se fue, negarlo sería mentirle a la pantalla— y la venta se anota el
día que pasó, que es cuando salió la comida de la cocina. Lo que queda aparte
es la deuda, con nombre, con lo que se comió y con **quién la autorizó**: en
tres semanas nadie se acuerda, y sin eso la única salida es preguntar a todos.

El mesero puede fiar; **la lista de quién debe la lee solo el gerente**. Cuando
pagan, la deuda desaparece — la venta ya estaba contada, así que no se suma
otra vez.

La deuda **no se borra al vaciar el servicio**: `servicio/fiados` no está entre
las ramas que se limpian.

### La contabilidad no se borra

Los pedidos son pesados y temporales; la cuenta es diminuta y para siempre:

```
   una mesa completa, con notas y horas ...... 1 200 bytes
   lo que aporta a la contabilidad ..........     ~30 bytes
```

Un día resumido pesa unos 2 KB; diez años son 7 MB. Por eso `/contabilidad`
guarda **un resumen por día** que no se borra nunca, aunque el servicio se
vacíe cada noche.

**La regla que lo hace correcto:** una comanda está *viva* o está *contada*,
nunca las dos cosas. Vaciar el servicio es el momento exacto en que pasa de una
a otra, así que no se puede contar dos veces ni aunque se vacíe tres veces en
un día.

Y un candado: **si no se pudo apuntar, no se borra nada.** Es la única función
del sistema que se niega a hacer su trabajo. Perder la contabilidad de una
noche por un wifi flojo no tiene arreglo después.

### Contabilidad de platos

Pestaña del panel con **lo que salió de la cocina y de la parrilla**, contado
plato por plato y agrupado por categoría. Hoy, dos días o la semana.

**No cuenta las bebidas ni las porciones de guarnición** —arroz, menestra,
patacones, plátano—. No es un descuido: meter cuarenta colas en la misma tabla
esconde justo lo que se quiere mirar. Las porciones de **proteína** sí entran,
y los juniors también.

**Día por día.** Los totales dicen cuánto se vendió; la lista de días dice
*cuándo*. Es la que contesta "¿por qué el martes fue flojo?", y esa pregunta
solo se puede hacer con los días separados. Tocar un día deja la pantalla
mirando solo ese, con un cartel que lo avisa y la salida al lado.

Debajo, las **proteínas desarmadas**: un mixto es un plato pero son dos o tres
proteínas, y de la nevera salieron dos o tres. Las dos cuentas son verdad y
responden preguntas distintas — cuánto se vendió, y cuánto hay que comprar.

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

### Lo que hay en la nevera

El gerente pone en el panel **"hoy hay 12 pollos"** y de ahí sale todo. Se
cuenta **por producto, no por plato**: del mismo pollo salen el asado, el
apanado, el junior y la porción. Puesto plato por plato, cuatro números de 12
dejarían vender 48 pollos que no existen.

Un plato que comparte producto lo dice con `usa` en `menu-data.js`. El que no
dice nada **es su propio producto**, así que se le puede poner número a
cualquier cosa de la carta sin declarar nada. Los mixtos no lo llevan: sus
carnes se escogen al tomar el pedido, así que descuentan de lo que el mesero
eligió.

**Cuántos quedan no se guarda en ningún lado — se resta.**

```
   quedan  =  lo que puso el gerente  −  lo pedido desde que lo puso
```

Tres razones, y las tres importan:

- Un contador que bajan cinco celulares a la vez miente la noche que dos
  meseros toquen al mismo tiempo. Una resta da igual en los cinco.
- **Anular un pedido devuelve el pollo solo**, sin código que lo sume.
- Las reglas de la nube no dejan otra cosa: `/menu` solo lo escribe el
  gerente, y así debe ser.

**El número de ayer no vale hoy.** Si no se vuelve a poner, el stock vence y
todo se vende sin límite. Al revés, el local abriría un jueves sin poder
vender pollo porque el domingo se acabó, y nadie entendería por qué.

**Son dos candados independientes**, que es lo que hacía falta:

| Pasa esto | Cae |
|---|---|
| Quedan 0 pollos | El asado, el apanado, el junior y la porción |
| Se acabó la apanadura (botón **Agotado**) | Solo el pollo apanado |

**El borrador aparta.** Con tres pollos y dos ya escritos en el pedido, queda
uno — aunque todavía no se haya enviado. El cliente ya los pidió.

**Lo que se acabó no se esconde, se apaga.** Un botón que desaparece deja al
mesero buscándolo; uno apagado le contesta lo que le acaban de preguntar en
la mesa.

#### Dos tomando pedido a la vez

El agujero que encontró el dueño probando: el mesero y el asador ven 6 costillas
cada uno, los dos anotan 6, los dos envían. Salían **12 a la parrilla existiendo
6**.

Y los dos celulares tenían razón. Un pedido a medio escribir no existe para
nadie más —ni debe: el cliente todavía está decidiendo— así que ninguno podía
ver al otro. **La resta protege del error de una persona, no de dos a la vez.**

Faltaba preguntar al final. Antes de escribir nada, `revisarStock()` le pide a
la nube lo último que hayan mandado los demás, vuelve a contar y **recorta lo
que ya no existe**.

Se recorta, no se rechaza el pedido entero: las bebidas y el pollo del mismo
pedido no tienen la culpa, y la mesa no puede quedarse sin nada porque faltara
una costilla. Lo que se cayó sale en un aviso que **no se va solo** — hay que
volver a la mesa a decirlo.

Queda un hueco de milisegundos, si los dos tocan Enviar en el mismo instante.
Cerrarlo pedía apartar la costilla en la nube, con otra vuelta a Firebase en
cada envío; se decidió no hacerlo, porque el caso real es el de los minutos.

Y si no hay línea se manda igual: quedarse sin tomar el pedido por no poder
comprobar sería peor que el riesgo, y la pantalla ya avisa cuando está sin
conexión.

#### El espejo del comensal

El celular del cliente **no puede contar**: para restar habría que leer las
comandas, que son los pedidos de las otras mesas. Así que el celular del que
toma el pedido publica cuántos quedan en `/stock` —público de leer, escribible
solo por quien toma pedidos— y la carta lo muestra: `Quedan 3`, y solo de 5
para abajo. Si el espejo se atrasa no se vende de más, porque el pedido del
comensal pasa igual por el mesero.

### Servir el plato de otra forma

Quitar no alcanzaba. El comensal puede pedir su plato **solo con patacones y
ensalada**, y eso en una parrillada no se puede armar quitando: los patacones
no están ahí para quitarlos, hay que ponerlos.

Se declara en `menu-data.js`, lista `CAMBIOS`, **por el resultado** y no por
lo que se quita ni por lo que se pone:

```js
{ id: 'pat', etiqueta: 'Solo patacones y ensalada', deja: ['patacones', 'ensalada'] }
```

Así una sola línea sirve para toda la carta: a una costilla se le van el
arroz, la menestra y el plátano y entran los patacones; a un pescado, que ya
viene con patacones y ensalada, solo se le va el arroz. Otra forma de servir
mañana es una línea más, no código nuevo.

Solo se ofrece en platos que alguien se sienta a comer (`cubierto: true`) y
que traigan acompañantes — una porción de patacones no puede venir "solo con
patacones y ensalada".

Es **excluyente** con las fichas de "sin ...": o se le quita algo a como
viene el plato, o se sirve de otra forma. Tocar una apaga la otra, para que a
la cocina no le lleguen pedidos a medio armar.

**El precio no cambia.** Una costilla con patacón y ensalada se cobra $5.50,
igual que la normal. Es decisión del local, y cuesta: los patacones valen más
que el arroz y la menestra que reemplazan.

En la parrilla no se muestra. Al asador no le cambia nada — él saca la
proteína igual. La que necesita leerlo es la cocina, que es la que emplata.

### Llamar al salón

La cocina y el asador no pueden salir de su sitio, así que gritaban. Ahora
tienen dos botones —**Mesero** y **Cubiertos**— y suena en el celular de quien
les toca.

**Van en la cabecera**, entre el título y el punto de la conexión. No en cada
tarjeta: ahí estarían solo cuando hay pedidos, y un tablero vacío es justo
cuando hace falta pedir cubiertos. Además quedan lejos del **ENTREGADO**, que
vive al fondo de cada tarjeta y es el único botón grande y lleno de la
pantalla — un dedo con prisa no los confunde.

El precio de tenerlos ahí es que la llamada **no dice de qué mesa es**. Se
acepta: un timbre en la cocina significa "ven a la cocina", que es lo que ya
quería decir el grito al que reemplaza.

**El botón tiene freno**, y vuelve solo. Después de tocarlo se queda cinco
segundos apagado contando atrás —*Llamado 3s*— y luego vuelve a decir *Mesero*.
Pasadas cuatro llamadas en un minuto se frena hasta que se libere una, y ahí lo
dice distinto: *Espera 34s*, apagado en vez de encendido. No es lo mismo "ya
avisé" que "deja de tocar y anda a buscarlo".

Sin eso, un cocinero apurado toca seis veces y al mesero le suenan seis alarmas
seguidas — y a la séptima ya no las mira. Un timbre que se abusa deja de ser un
timbre. El cupo es **por aparato y por botón**: llamar al mesero y pedir
cubiertos no se quitan turnos.

Y se redibuja **cada segundo**, que es lo que hace que vuelva solo. Sin eso se
quedaba en campana para siempre: la espera se acababa por reloj, pero nada
volvía a dibujar el botón hasta que llegara algo de la nube — y en una cocina
tranquila eso es nunca.

**Nadie tiene que apagar la llamada.** Se guarda cuándo se llamó y se da por
viva mientras sea reciente; al minuto y medio desaparece sola. Un aviso que hay que
apagar es un aviso que alguien se olvida de apagar, y el de al lado ya no sabe
si es de ahora o de hace media hora.

**No se encola.** Todo lo demás se guarda y se reintenta hasta que sale,
porque un pedido no se puede perder. Un timbre es al revés: si llega diez
minutos tarde, el mesero camina hasta la cocina y ya nadie se acuerda de para
qué lo llamaron. Si no sale ahora no sale, el botón no se queda encendido
mintiendo, y se le dice al que llamó — para que grite como toda la vida.

**El tono es distinto** al del pedido nuevo: el de la cocina es agudo y cae
(2600 → 1950 Hz); este es más grave y sube, en pares lentos, durante **cinco
segundos**. Si sonaran igual, el mesero miraría la pantalla creyendo que entró
un pedido.

#### Cuántas conexiones abre cada pantalla

El navegador solo permite unas **seis por sitio**. Cuando el sistema abría una
por rama no quedaba ninguna libre para *enviar*, y el pedido esperaba turno
hasta agotar el plazo — fue lo de "actualiza tres veces". Por eso se cuentan:

| Pantalla | Conexiones | Cuáles |
|---|---|---|
| Cocina · Parrilla | 2 | comandas, llamadas |
| Servir | 2 | comandas, llamadas |
| Comanda | 2 | comandas, llamadas |

Al agregar el timbre, la comanda **bajó** de 3 a 2: los agotados y el stock
dejaron de escucharse en vivo y pasaron a preguntarse cada seis segundos, de
un solo tirón (la rama `menu` trae los dos). Un plato agotado puede tardar
seis segundos en avisarse; un timbre que tarda seis segundos es un timbre que
el de la cocina cree que no funcionó, y lo toca otra vez.

`scripts/probar.js` cuenta las conexiones en cada cambio, para que esto no
vuelva a crecer sin que nadie se dé cuenta.

### Quién ve qué

| Pantalla | Ve |
|---|---|
| **Parrilla** | Solo proteínas. El término y el "para llevar". Nada de guarniciones: no cambian nada en la parrilla. |
| **Cocina** | El pedido entero, los cubiertos en grande, cómo se sirve el plato y lo que se le quitó. Esta pantalla también la lee el que sirve. |
| **Comanda** | Todo, más la cuenta. |
| **Servir** | Las once mesas, los cubiertos de cada una y el turno. No escribe en la nube; marca en azul y verde lo que ya entregó, y esa marca no sale de su celular. |

### La pantalla del que sirve

El que pone los cubiertos y lleva los platos se había quedado fuera: la
pantalla de la cocina le queda a tres metros y es un celular, no se lee.

Su pantalla es la única que **no manda un solo dato a la nube** — lleva las
manos ocupadas y el pedido no es suyo. Ve las once mesas, los cubiertos de
cada una, y un **turno** en la esquina: el orden en que se fueron ocupando.

Ese turno reemplaza a marcar los cubiertos uno por uno. Si va por el ⑧, del
① al ⑦ ya están puestos, sin decírselo al sistema. Y **no se renumera**
cuando una mesa se va: si la ① paga, la ② sigue siendo la ②. Renumerar le
haría perder la referencia a mitad del servicio.

Vuelve a ① cuando el local se queda vacío, para que cada noche empiece en
uno. Tocar una mesa muestra lo que pidió, solo para mirar.

Debajo de la rejilla van los **pedidos para llevar**, en azul para que no
se confundan con las mesas. No tienen mesa y por eso no caben arriba, pero
también llevan cubiertos y aderezos: antes se los encontraba de sorpresa.
Van en la **misma fila de turnos** que las mesas — es el mismo trabajo y
el mismo viaje a la gaveta — y así dejan de faltar números: cuando una
funda se llevaba el ②, en la rejilla se veía el ① y el ③ sin nada en medio.

De ellos se muestran **platos y no cubiertos**: en una funda todo va
marcado para llevar, y los cubiertos por definición dejan fuera lo que no
se sienta a comer, así que siempre dirían cero.

Las bebidas no le llegan a ninguna estación: las sirve el mesero directo.

#### Lo que ya entregó: azul y verde

El turno dice por dónde va, pero no aguanta una interrupción. Con seis
mesas seguidas se acuerda; con una llamada a la cocina en medio, no.

**Manteniendo una mesa apretada medio segundo** cambia de color:

| Color | Quiere decir |
|---|---|
| amarillo | todavía no le ha llevado nada |
| **azul** | ya tiene los cubiertos y los aderezos puestos |
| **verde** | ya tiene además los platos: con esa mesa terminó |

Otro medio segundo la deshace y vuelve a amarillo, porque marcar la mesa
de al lado pasa. Arriba va una línea con **cuántas van servidas**: con once
cuadros en pantalla, contar los verdes de un vistazo sale mal.

Medio segundo y no un toque: el toque corto ya abría el pedido de la mesa
y no se le podía quitar. El celular **vibra** al agarrar, para saberlo sin
mirar mientras camina con la bandeja.

**Una mesa verde a la que le llega otra tanda baja sola a azul.** Los
cubiertos ya están puestos y eso no se repite, pero los platos nuevos
siguen en la cocina, y una mesa que dice "servida" con comida esperando es
justo la que se queda olvidada. Una bebida no la baja: el que sirve no
lleva bebidas, y estaría dando falsas alarmas toda la noche.

**El color no sale de ese celular.** Es una libreta suya, no un estado del
pedido: no viaja a la nube, no lo ve el mesero y no lo ve el panel. Y está
bien que sea así — cobrar porque otra pantalla dice "verde" es cobrar de
oído, y el único que sabe si esos platos están en la mesa es el que los
llevó. Por lo mismo, la cuenta del que sirve sigue sin permiso para
escribir nada en Firebase.

Se borra solo: **cuando el mesero cobra**, esa sesión se cierra, la mesa
queda libre y su color se va con ella. La marca se guarda por sesión y no
por número de mesa, así que la gente que se siente después en la 7 no
hereda el verde de los anteriores.

Solo aparece en la cuenta `servir@gmail.com`. Quien entre a mirar esta
pantalla ve las mesas como siempre.

### Quién puede tocar qué

Cada celular entra con su propia cuenta, y cada cuenta manda en **una**
pantalla. Las otras las puede mirar — saber si la carne ya salió le sirve
a todos — pero no tocarlas. Dos manos sobre el mismo botón es como se
pierde un plato.

| Cuenta | Comanda | Parrilla | Cocina | Panel |
|---|---|---|---|---|
| **Gerente** | manda | manda | manda | manda |
| **Mesero** | manda | mira | mira | — |
| **Asador** | **anota** | manda | mira | — |
| **Cocina** | — | mira | manda | — |

**Anota** quiere decir que el asador toma pedidos igual que el mesero
—mesa o para llevar, con el mismo flujo y la misma pantalla— pero **no
cobra**: no le aparece el botón, no cierra mesas y la nube le niega
escribir en los cobros. A veces le llegan pedidos directos y no tiene por
qué ir a buscar a nadie; el dinero se queda donde estaba.

Cuando una cuenta solo mira, la pantalla se abre con una franja azul
arriba y las tarjetas salen **sin botón**. No hay nada roto: es la
pantalla de otro.

Esto no se sostiene en el navegador, donde cualquiera podría editarlo.
Cada pantalla manda a la nube **solo su campo** — el asador únicamente
`sacado`, la cocina únicamente `estado` — y las reglas de Firebase lo
comprueban del lado del servidor. Los detalles están en
[FIREBASE.md](FIREBASE.md) y las cuentas de este local en `CUENTAS.md`.

### Pedidos para llevar

Cada uno es **su propia cuenta**, y lo que la distingue es el nombre de
quien va a recoger: `Carlos`, `Uber`, `Luis`. Antes todos compartían la
mesa 0, así que el de Carlos y el de Uber caían en el mismo saco y no
había forma de cobrar uno sin el otro.

El botón de enviar **no dice Enviar hasta que hay nombre**. Un pedido para
llevar sin nombre es una funda sin dueño.

El nombre no reemplaza al código: `LL · 2PO` sigue siendo el código, y el
nombre va al lado, en grande, en la parrilla y en la cocina. Los que
siguen sin cobrar se ven en la pantalla de mesas, debajo del botón, como
si fueran mesas — porque para el mesero son exactamente eso.

### La tarrina se cobra sola

Lo que se llevan va en tarrina, y la tarrina cuesta **$0.25**. Se agrega
sola, una por unidad, en el pollo asado, la carne asada y los juniors. El
mesero no saca cuentas y el total se ve mientras todavía se está armando
el pedido.

No es un recargo escondido: la tarrina es un plato más de la carta
interna, así que sale con su nombre en la cuenta y el gerente le cambia
el precio desde el panel el día que suban.

### Hasta cuándo se puede corregir

Al enviar una tanda arranca **un minuto de gracia**. Durante ese minuto
se puede cambiar todo: era chuleta, no pollo. La pantalla muestra la
cuenta regresiva.

Pasado el minuto, la carne ya está en la parrilla. Ahí solo se pueden
**agregar bebidas y porciones** — lo que no se cocina — y los platos que
ya estaban se ven pero no se tocan. Las porciones de proteína cuentan
como proteína: también se bloquean.

**Anular** se puede hasta que alguien la haya tocado. Si el asador ya
marcó "Ya lo saqué" o la cocina ya marcó ENTREGADO, no se anula y en el
lugar del botón se lee con quién hay que hablar.

### Cambiar de mesa

Los clientes se pasan de la 5 a la 2 y se mueve la cuenta entera:
tandas, cobros y lo que falta. Los códigos se rehacen (`M5b` pasa a ser
`M2b`), porque un papel que dice M5 encima de la mesa 2 es peor que no
tener papel. Solo se ofrecen las mesas libres.

### Quién borra qué

| Toca | Pasa |
|---|---|
| **Asador: "Ya lo saqué"** | Hay que **mantener apretado 2 segundos**, con una barra que avanza. Limpia **solo su** tarjeta, y queda plegada abajo por si preguntan. La cocina todavía tiene que emplatar y servir. |
| **Cocina: marca cada plato** | Cada unidad es una casilla. `4 Chuletas` son cuatro renglones, no "4x Chuleta". |
| **Cocina: ENTREGADO** | **No se enciende hasta que todo esté marcado.** Después, el plato salió: desaparece de **las dos** pantallas y queda plegado abajo. |

Los dos gestos que cierran un pedido cuestan trabajo a propósito. Un
toque suelto en una pantalla con las manos ocupadas sacaba carne que
seguía en el fuego, y un solo toque para entregar hacía que se olvidara
la cuarta chuleta. La pantalla ya no deja cerrar lo que no está hecho.

### El orden se ve, no se deduce

Cada tarjeta lleva su **puesto en la fila** en un círculo grande: 1, 2,
3. El primero va marcado **EMPIEZA POR ESTE** y, en tablet o PC, ocupa el
ancho entero mientras el resto va en rejilla. Ordenar por hora no
alcanzaba: con cuatro tarjetas iguales una al lado de otra había que
comparar relojes.

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
solo su campo, que cada cuenta llegue solo hasta donde le toca, que un
aviso que no sonó siga pendiente y que el ayudante no se meta con los
pedidos.

`version.py` marca los `.css` y `.js` de las páginas **y también la caja
del ayudante**, que es lo que hace que la anterior se tire al publicar.
Si se olvidara, una tablet podría quedarse con el JavaScript viejo dentro
— y eso ya no se arregla recargando.

> **Sube con el local cerrado y sin nada en rojo.** Lo que un celular dejó
> encolado se manda con las reglas que había cuando se anotó. Si cambias
> los permisos con pedidos todavía sin salir, esos pueden quedarse
> rebotando y el contador rojo no se apaga. Antes de subir, mira que las
> tres pantallas tengan el punto verde.
