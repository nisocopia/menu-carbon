/* ============================================================
   SW.JS  —  El ayudante que corre por detrás del sitio

   Hace dos cosas y ninguna más:

     1. Deja INSTALAR las pantallas como aplicación. El navegador no
        ofrece instalar nada si no encuentra uno de estos.
     2. Guarda lo que ya se bajó, para que una pantalla abierta sobreviva
        a un corte de wifi sin quedarse en blanco.

   LO QUE NO HACE, Y ES LO MÁS IMPORTANTE
   --------------------------------------
   No toca NADA que vaya a Firebase. Ni los pedidos, ni la sesión, ni el
   canal por el que llegan las comandas. Todo eso es de otro dominio y
   aquí se deja pasar sin mirarlo siquiera.

   Ese canal es un EventSource: una conexión que se abre y se queda
   abierta horas, soltando cada comanda según entra. Un ayudante que
   intentara guardarla se quedaría esperando un final que no llega, y la
   cocina dejaría de recibir pedidos sin un solo mensaje de error. Por
   eso la primera regla de aquí abajo es salirse.
   ============================================================ */

/* Lo reescribe scripts/version.py en cada publicación. Al cambiar,
   cambia el nombre de la caja y la anterior se tira entera: así una
   pantalla nunca mezcla el HTML nuevo con el JavaScript viejo. */
const VERSION = '202608051718';

const CAJA = 'carbon-' + VERSION;

self.addEventListener('install', () => {
    /* Sin lista de archivos que precargar. Se guarda lo que se vaya
       usando y ya está.

       Una lista habría que mantenerla a mano, y el día que se olvide un
       archivo la pantalla se instala rota — que es peor que no estar
       instalada. Lo que sí hace falta es haberla abierto una vez con
       señal, y eso pasa siempre: hay que entrar con correo y clave. */
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        const cajas = await caches.keys();
        await Promise.all(cajas.filter(c => c !== CAJA).map(c => caches.delete(c)));
        await self.clients.claim();
    })());
});

/** Lo que trae ?v= no cambia nunca sin cambiar de dirección. */
const esVersionado = url => url.search.includes('v=');

const esPagina = (req, url) =>
    req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');

/**
 * Primero la red. Lo guardado es solo el paracaídas.
 *
 * Va así para el HTML porque una pantalla de cocina con el código de
 * antes es peor que una pantalla que tarda medio segundo más: los
 * arreglos no llegarían nunca a la tablet que más los necesita.
 */
async function primeroLaRed(req) {
    const caja = await caches.open(CAJA);
    try {
        const r = await fetch(req);
        if (r && r.ok && r.type === 'basic') caja.put(req, r.clone());
        return r;
    } catch (e) {
        const guardada = await caja.match(req);
        if (guardada) return guardada;
        throw e;
    }
}

/**
 * Primero lo guardado, y ya no se pregunta más.
 *
 * Solo para lo que NO PUEDE cambiar sin cambiar de dirección: los css y
 * js marcados con ?v=. Cuando se publica algo nuevo, la marca cambia, la
 * dirección es otra y por definición no está guardada.
 */
async function primeroLoGuardado(req) {
    const caja = await caches.open(CAJA);
    const guardada = await caja.match(req);
    if (guardada) return guardada;

    const r = await fetch(req);
    if (r && r.ok && r.type === 'basic') caja.put(req, r.clone());
    return r;
}

/**
 * Lo guardado ahora, lo nuevo para la próxima.
 *
 * Las fotos de los platos y las fuentes no llevan marca de versión, así
 * que ninguna de las dos reglas de arriba les sirve: por red cada vez
 * sería pagar medio mega de fotos en cada carga, y guardadas para
 * siempre significaría que el gerente cambia la foto de un plato y no la
 * ve nunca. Se responde al momento con lo que hay y se baja lo nuevo por
 * detrás, para la carga siguiente.
 */
async function deLaCajaYRefrescar(req) {
    const caja = await caches.open(CAJA);
    const guardada = await caja.match(req);

    const bajando = fetch(req).then(r => {
        if (r && r.ok && r.type === 'basic') caja.put(req, r.clone());
        return r;
    });

    // Si no había nada guardado hay que esperar; si había, no.
    if (!guardada) return bajando;
    bajando.catch(() => {});     // sin señal no pasa nada: ya se respondió
    return guardada;
}

const esFoto   = url => /\.(png|jpe?g|webp|svg|ico|gif)$/i.test(url.pathname);
const esFuente = url => /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname);

self.addEventListener('fetch', e => {
    const req = e.request;

    /* FUERA DE AQUÍ, POR ORDEN DE IMPORTANCIA:

       - Todo lo que no sea de este sitio. Ahí viven Firebase, el canal
         de las comandas y el inicio de sesión, y ninguno se guarda ni
         se retrasa.
       - Todo lo que no sea una lectura. Mandar un pedido es un POST o
         un PUT: eso va a la red y a ningún otro sitio. */
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== location.origin) return;

    if (esPagina(req, url))              e.respondWith(primeroLaRed(req));
    else if (esVersionado(url))          e.respondWith(primeroLoGuardado(req));
    else if (esFoto(url) || esFuente(url)) e.respondWith(deLaCajaYRefrescar(req));
    else                                 e.respondWith(primeroLaRed(req));
});
