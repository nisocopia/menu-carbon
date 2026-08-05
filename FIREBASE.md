# Activar la sincronización en vivo

Con esto, cuando el gerente marca un plato como **agotado**, desaparece del
menú de todos los celulares en segundos. Y los pedidos que hacen los comensales
le llegan al panel en vivo.

Es gratis: un restaurante de este tamaño no llega ni al 1 % del plan sin costo,
y Firebase no pide tarjeta para usarlo.

**El QR no cambia.** El sitio se sigue publicando igual en GitHub Pages.

---

## Los 5 pasos (unos 10 minutos, una sola vez)

### 1. Crear el proyecto

Entra a **console.firebase.google.com** con tu cuenta de Google y pulsa
**"Crear un proyecto"**.

- Nombre: por ejemplo `menu-carbon`
- **Desactiva Google Analytics** (no hace falta y ahorra pasos)

### 2. Crear la base de datos

En la barra lateral: **Bases de datos y almacenamiento → Realtime Database →
Crear base de datos**.

> La consola de Firebase cambia de organización cada tanto. Si no ves esa
> categoría, busca **Realtime Database** en el buscador de productos de arriba.

- Ubicación: **`us-central1`** (la más cercana a Ecuador)
- Al preguntar por las reglas, elige **"Comenzar en modo bloqueado"**

> Cuidado: tiene que ser **Realtime Database**, no *Firestore*. Son dos
> productos distintos y este menú usa el primero.

Cuando termine, arriba te muestra una dirección así:

```
https://menu-carbon-default-rtdb.firebaseio.com
```

**Cópiala**, la vas a necesitar.

### 3. Poner las reglas de seguridad

En esa misma pantalla, pestaña **Reglas**. Borra lo que haya y pega **todo**
el contenido del archivo `firebase-rules.json` que está en este proyecto.
Pulsa **Publicar**.

Esas reglas hacen que:

- Cualquiera pueda **leer** el menú y los agotados (lo necesita el comensal)
- Solo el gerente, con su cuenta, pueda **cambiarlos**
- Los comensales puedan **crear** pedidos pero no leer los de otros
- Nadie pueda borrar ni modificar pedidos ajenos
- **Cada cuenta del local solo pueda tocar lo suyo**: el asador su
  "Ya lo saqué", la cocina su "ENTREGADO", el mesero las comandas y los
  cobros. Y **solo el gerente pueda borrar el servicio**

Esto es seguridad de verdad: la valida el servidor de Google, no el navegador.

> **Los uid van escritos dentro de las reglas.** Tal como está el archivo
> lleva los de este local. Para otro restaurante hay que reemplazarlos —
> ver el paso 4.

### 4. Crear las cuentas del local

Barra lateral: **Seguridad → Authentication → Comenzar**.

- En **Sign-in method**, activa **Correo electrónico/contraseña**
- En la pestaña **Users**, pulsa **Agregar usuario**

Crea **una cuenta por celular**, no una compartida. Así, si alguien se va del
local, se le borra la suya y nadie más tiene que cambiar de clave:

| Celular | Correo de ejemplo | Manda en | Puede mirar |
|---|---|---|---|
| El tuyo | `gerente@carbon.local` | todo | — |
| El del mesero | `mesa@carbon.local` | `comanda.html` | parrilla y cocina |
| El del asador | `parrilla@carbon.local` | `parrilla.html` | cocina |
| El de la cocina | `cocina@carbon.local` | `cocina.html` | parrilla |

Los correos no tienen que existir de verdad; Firebase no manda ningún mensaje.
Las claves **no van en el código**: Firebase las guarda cifradas.

#### Decirle al sistema quién es quién

Las cuatro cuentas son válidas para Firebase. Lo que las distingue es su
**User UID**, y hay que escribirlo en dos sitios.

1. En **Authentication → Users**, copia el **User UID** de cada una
   (usa el icono de copiar: seleccionar con el mouse corta el texto)

2. En `js/menu-data.js`, lista `EQUIPO` — esto ordena las pantallas:

   ```js
   const EQUIPO = {
       'uid-del-gerente': 'gerente',
       'uid-del-mesero':  'mesero',
       'uid-de-cocina':   'cocina',
       'uid-del-asador':  'parrilla'
   };
   ```

   Además, en el mismo archivo, pon el uid del dueño en `gerenteUid`.

3. En `firebase-rules.json`, reemplaza los uid que ya vienen escritos por
   los de este local. Es un buscar-y-reemplazar por cada uno.

4. Vuelve a publicar las reglas.

**Los dos archivos tienen que decir lo mismo.** El primero decide qué
pantalla abre cada quien; el segundo es el que de verdad lo impide,
porque lo revisa el servidor de Google contra el token firmado.

Desde ese momento:

- el personal toma pedidos y marca entregados, pero **no** puede cambiar
  el menú ni ver la venta del día
- la cocina y la parrilla **no** entran a la comanda
- **solo el gerente** puede vaciar el servicio

> **Si dejas `EQUIPO` vacío**, cualquier cuenta del local puede todo,
> como funcionaba antes. Así un local que todavía no repartió las cuentas
> no se queda con el personal afuera.

Que los uid queden a la vista en el repositorio no es un descuido: **un
uid no es una clave y no sirve para entrar**. Es solo un nombre.

### 5. Copiar la configuración al menú

En **Configuración** (arriba en la barra lateral, bajo "Descripción general
del proyecto"), baja hasta **Tus apps** y pulsa el icono **`</>`** (Web). Ponle cualquier nombre y
registra la app.

Te va a mostrar un bloque con `apiKey`, `databaseURL` y más cosas.
**Solo hacen falta dos.** Ábrelas en `js/menu-data.js`:

```js
const FIREBASE = {
    apiKey:      'AIzaSy...............',
    databaseURL: 'https://menu-carbon-default-rtdb.firebaseio.com'
};
```

Y publica:

```bash
python scripts/version.py
git add -A
git commit -m "Activar sincronización en vivo"
git push
```

---

## Cómo comprobar que quedó funcionando

1. Abre el **panel** en tu celular y entra con el correo y la clave
2. Arriba, bajo la fecha, debe aparecer **"En vivo"** con un punto verde
3. Abre el **menú** en otro celular (o en una pestaña de incógnito)
4. En el panel, marca la **Costilla** como agotada
5. En el otro celular, **sin recargar**, la Costilla debe tacharse sola

Si eso pasa, está listo.

---

## Preguntas que te van a hacer

**¿Y si se cae el internet del local?**
El menú sigue funcionando: muestra los platos y deja pedir, porque todo está
guardado en el celular. Solo deja de actualizarse en vivo hasta que vuelva la
señal, y se reconecta solo.

En las pantallas de servicio (comanda, parrilla, cocina) pasa lo mismo pero con
un aviso: puedes seguir tomando pedidos, se guardan en tu celular y se mandan
solos cuando vuelve la señal. Mientras tanto, arriba a la derecha aparece en
rojo **"N sin enviar"** y el aviso al mandar una comanda dice *"anotado — SIN
RED, la cocina todavía no lo ve"*, para que sepas que tienes que ir a decirlo
a mano. Si el rojo no se apaga, saca el cuaderno.

**¿Cuánto cuesta?**
Nada en este volumen. El plan gratuito de Firebase da 1 GB de almacenamiento y
10 GB de descarga al mes. Un pedido pesa medio kilobyte.

**¿Y si no configuro Firebase?**
El menú funciona igual que siempre. Los agotados y los pedidos se quedan en
cada dispositivo, como antes. No se rompe nada.

---

## Para el siguiente restaurante

Cada cliente necesita **su propio proyecto de Firebase**, si no compartirían el
mismo menú y los mismos pedidos. Son los mismos 5 pasos y las mismas reglas.

La clave del panel de cada dueño se crea en el paso 4, desde la consola de
Firebase. Ya no hace falta `scripts/generar-clave.js`: ese script solo se usa
cuando **no** hay Firebase configurado.
