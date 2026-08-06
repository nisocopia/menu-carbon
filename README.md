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
| **Servir** | Las once mesas, los cubiertos de cada una y el turno. Solo lectura. |

### La pantalla del que sirve

El que pone los cubiertos y lleva los platos se había quedado fuera: la
pantalla de la cocina le queda a tres metros y es un celular, no se lee.

Su pantalla es la única **sin un solo botón que cambie nada** — lleva las
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
