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

En el menú de la izquierda: **Compilación → Realtime Database → Crear base de datos**.

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

Esto es seguridad de verdad: la valida el servidor de Google, no el navegador.

### 4. Crear la cuenta del gerente

Menú izquierdo: **Compilación → Authentication → Comenzar**.

- En **Sign-in method**, activa **Correo electrónico/contraseña**
- En la pestaña **Users**, pulsa **Agregar usuario**
- Pon el correo del dueño y una clave

Esa es la clave con la que entrará al panel. **No hay que ponerla en el código**:
Firebase la guarda cifrada.

### 5. Copiar la configuración al menú

En **Configuración del proyecto** (el engranaje, arriba a la izquierda), baja
hasta **Tus apps** y pulsa el icono **`</>`** (Web). Ponle cualquier nombre y
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
