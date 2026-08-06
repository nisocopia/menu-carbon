/* ============================================================
   ESTACION.JS  —  Las dos pantallas de preparación

   Es el mismo archivo para la parrilla y para la cocina porque hacen
   lo mismo con distinta información:

     PARRILLA  ve solo las proteínas. No necesita saber cuántos
               cubiertos van ni qué guarnición se quitó.
     COCINA    ve todo el pedido, porque es la que emplata. Esta
               pantalla también la lee el que sirve los platos: por
               eso la mesa y los cubiertos van en grande y no hay
               que tocar nada para verlos.

   Las tarjetas van del más viejo al más nuevo. La mesa que llegó
   primero se sirve primero, igual que con el papel.
   ============================================================ */

let ESTACION = 'cocina';

/* ------------------------------------------------------------
   QUÉ SE HA AVISADO Y QUÉ NO

   Son DOS listas y no una, y esa es la corrección más importante de
   todas. Antes había una sola —"las que ya vi"— y se rellenaba justo
   después de mandar el pitido, mirara o no si el pitido había sonado.
   Como el navegador puede negarse a sonar sin avisar de nada, un
   pedido se daba por anunciado sin que nadie lo hubiera oído, y ya no
   volvía a intentarse nunca. Cualquier tropiezo de un segundo se
   convertía en un pedido perdido para toda la noche.

   Ahora lo pendiente sigue pendiente hasta que de verdad suene.

   La marca guardada es la hora de la última corrección: si el mesero
   cambia un pollo por una chuleta, la marca cambia y vuelve a sonar.
   Un pedido corregido es un aviso nuevo, no el mismo de antes.       */

let avisadas = new Map();    // id -> marca ya anunciada
let porAvisar = new Map();   // id -> marca esperando sonar

/** Con qué marca se conoce un pedido. Cambia al corregirlo. */
const marcaDe = c => c.editado || 0;

const TITULO = document.title;

/* ¿Esta cuenta manda en esta pantalla o solo la está mirando?
   La cocina puede ver cómo va la parrilla y la parrilla cómo va la
   cocina — saber si la carne ya salió le sirve a los dos. Lo que no
   pueden es tocar el botón del otro: dos manos sobre el mismo pedido
   es como se pierde un plato. */
let PUEDE = true;

const $ = id => document.getElementById(id);

function toast(texto) {
    const t = $('toast');
    if (!t) return;
    t.textContent = texto;
    t.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('visible'), 2400);
}

/* ============================================================
   AVISO DE PEDIDO NUEVO

   El tono se genera aquí mismo, sin descargar ningún archivo: la
   pantalla tiene que sonar aunque la señal esté floja.
   ============================================================ */

let audio = null;

/**
 * El aviso tiene que ganarle al ruido de una cocina: campana, extractor,
 * gente hablando. Ese ruido es sobre todo grave, así que el pitido va
 * agudo — cerca de donde el oído es más sensible — y alternando dos
 * tonos, que se reconoce como alarma y no se confunde con el ambiente.
 */
const PATRON = [
    { f: 2600, t: 0.00, d: 0.14 },
    { f: 1950, t: 0.17, d: 0.14 },
    { f: 2600, t: 0.34, d: 0.14 },
    { f: 1950, t: 0.51, d: 0.14 },
    { f: 2600, t: 0.68, d: 0.26 }
];

const VOLUMEN = 0.85;

/** ¿El navegador ya nos deja sonar? */
const audioListo = () => !!audio && audio.state === 'running';

/**
 * Los navegadores no dejan sonar hasta que alguien toca la pantalla.
 * Como estas pantallas arrancan solas al abrirlas, el audio se quedaba
 * bloqueado y el aviso no sonaba nunca — sin que nadie se enterara.
 *
 * Por eso se intenta desbloquear en cada toque, y se avisa en pantalla
 * mientras siga bloqueado.
 */
let salida = null;   // por donde pasa todo antes de llegar al parlante

/**
 * Entre las notas y el parlante van dos cosas:
 *
 *   un filtro   quita los armónicos altísimos de la onda cuadrada. No
 *               aportan volumen util y son los que suenan a chicharra.
 *   un limitador impide que la señal se pase de rango. Si entran dos
 *               pedidos casi juntos, los dos avisos se suman; sin esto
 *               la suma se recorta y distorsiona, que es lo unico que
 *               de verdad maltrata un parlante pequeño.
 */
function armarSalida() {
    if (salida || !audio) return;

    const filtro = audio.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 6500;

    const limite = audio.createDynamicsCompressor();
    limite.threshold.value = -6;
    limite.knee.value = 0;
    limite.ratio.value = 20;
    limite.attack.value = 0.002;
    limite.release.value = 0.1;

    filtro.connect(limite).connect(audio.destination);
    salida = filtro;
}

async function prepararAudio() {
    try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') await audio.resume();
        armarSalida();
    } catch (e) { /* el navegador no lo permite todavía */ }
    prepararRespaldo();
    pintarAvisoSonido();
    return audioListo();
}

/**
 * Un toque en la pantalla. Es la única ocasión en que el navegador deja
 * abrir el audio, así que también es el momento de saldar lo que se
 * quedó sin sonar mientras estaba cerrado.
 *
 * Se reintenta SIEMPRE que haya algo esperando, sin mirar antes si el
 * contexto se abrió: hay dos vías para sonar y la segunda puede
 * funcionar cuando la primera no. Quien sabe si se pudo o no es el que
 * lo intenta, no el que abre la puerta.
 */
async function desbloquear() {
    const listo = await prepararAudio();
    if (porAvisar.size) await intentarAvisar();
    return listo;
}

/* ------------------------------------------------------------
   SEGUNDA VÍA POR SI LA PRIMERA NO ABRE

   El AudioContext es lo que mejor suena, pero el navegador lo puede
   dejar dormido y desde el código no hay forma de despertarlo. Un
   elemento <audio> se bloquea por reglas parecidas, pero no siempre a
   la vez: en Android el contexto se duerme al cambiar de aplicación y
   el elemento, una vez soltado, sigue sonando.

   Tener las dos vías es la diferencia entre "no sonó" y "sonó por la
   otra". El archivo se fabrica aquí mismo, igual que el tono, porque
   la pantalla tiene que sonar aunque no haya red para descargar nada.
   ------------------------------------------------------------ */

let respaldo = null;

function fabricarWav() {
    const HZ = 44100;
    const n = Math.floor(HZ * 1.05);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const texto = (pos, s) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };

    texto(0, 'RIFF');      v.setUint32(4, 36 + n * 2, true);
    texto(8, 'WAVEfmt ');  v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);         // PCM sin comprimir
    v.setUint16(22, 1, true);         // mono
    v.setUint32(24, HZ, true);
    v.setUint32(28, HZ * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    texto(36, 'data');     v.setUint32(40, n * 2, true);

    for (let i = 0; i < n; i++) {
        const t = i / HZ;
        const nota = PATRON.find(p => t >= p.t && t < p.t + p.d);
        let m = 0;
        if (nota) {
            /* Los bordes se suben y se bajan en unos milisegundos. Cortar
               una onda cuadrada en seco mete un chasquido que se oye más
               que la propia nota. */
            const dentro = t - nota.t;
            const sobre = Math.min(1, dentro / 0.006, (nota.d - dentro) / 0.006);
            m = (Math.sin(2 * Math.PI * nota.f * t) >= 0 ? 1 : -1) * VOLUMEN * sobre;
        }
        v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, m)) * 32767, true);
    }

    return new Blob([buf], { type: 'audio/wav' });
}

function prepararRespaldo() {
    if (respaldo) return;
    try {
        respaldo = new Audio(URL.createObjectURL(fabricarWav()));
        respaldo.preload = 'auto';
    } catch (e) { respaldo = null; }
}

function sonarRespaldo() {
    if (!respaldo) return Promise.resolve(false);
    try {
        respaldo.currentTime = 0;
        const p = respaldo.play();
        return (p && p.then) ? p.then(() => true, () => false) : Promise.resolve(true);
    } catch (e) { return Promise.resolve(false); }
}

/* Si alguna vez se consiguió sonar, el navegador ya nos deja y el cartel
   de "toca para activar" sobra — aunque el contexto se haya vuelto a
   dormir por un cambio de aplicación. */
let yaSono = false;
const puedeSonar = () => audioListo() || yaSono;

/**
 * Suelta el tono por donde se pueda. Devuelve si de verdad sonó — no si
 * se intentó. Esa diferencia es la que decide si el pedido se da por
 * anunciado o sigue esperando.
 */
async function sonar() {
    if (!audioListo()) await prepararAudio();

    if (audioListo()) {
        try {
            /* Un pelín de margen y no `currentTime` a secas: programar una
               nota para el instante exacto en que se pide deja al navegador
               sin tiempo de prepararla y el primer golpe sale recortado. */
            const ahora = audio.currentTime + 0.05;

            PATRON.forEach(nota => {
                const osc = audio.createOscillator();
                const vol = audio.createGain();

                /* Onda cuadrada y no senoidal: tiene armónicos, y son los
                   armónicos los que atraviesan el ruido de una cocina. A igual
                   volumen se oye mucho más que un pitido suave. */
                osc.type = 'square';
                osc.frequency.value = nota.f;

                const desde = ahora + nota.t;
                vol.gain.setValueAtTime(0.0001, desde);
                vol.gain.exponentialRampToValueAtTime(VOLUMEN, desde + 0.008);
                vol.gain.setValueAtTime(VOLUMEN, desde + nota.d - 0.02);
                vol.gain.exponentialRampToValueAtTime(0.0001, desde + nota.d);

                osc.connect(vol).connect(salida || audio.destination);
                osc.start(desde);
                osc.stop(desde + nota.d + 0.02);
            });
            yaSono = true;
            return true;
        } catch (e) { /* se prueba por la otra vía */ }
    }

    const sono = await sonarRespaldo();
    if (sono) yaSono = true;
    return sono;
}

/** Si el celular está en el bolsillo o boca abajo, la vibración avisa igual. */
function vibrar() {
    try { if (navigator.vibrate) navigator.vibrate([220, 90, 220, 90, 320]); } catch (e) {}
}

/* ------------------------------------------------------------
   DAR EL AVISO

   Las tres vías —ver, vibrar y sonar— van POR SEPARADO, y antes iban
   una detrás de otra. Como la vibración estaba después del sonido, en
   cuanto el navegador no dejaba sonar se saltaba también la vibración:
   la pantalla se quedaba muda, quieta y sin decir nada. Ahora lo que se
   puede hacer se hace, y lo que no se pudo queda pendiente.
   ------------------------------------------------------------ */

const PAUSA = 1200;          // entre una alarma y la siguiente

let sonandoHasta = 0;
let avisando = false;
let reintento = null;

function volverAIntentar(dentroDe) {
    clearTimeout(reintento);
    reintento = setTimeout(intentarAvisar, Math.max(300, dentroDe));
}

async function intentarAvisar() {
    if (!porAvisar.size) return;

    /* Lo que ningún permiso del navegador puede apagar va primero y
       siempre, incluso si ya se está anunciando otra cosa: el borde
       tiene que encenderse en el momento, no cuando acabe el tono. */
    pintarPendiente();

    if (avisando) return;
    vibrar();

    /* Dos alarmas encima suenan a ruido, no a aviso, así que hay una
       pausa entre una y otra. Pero esperar no es descartar: antes aquí
       había un `return` y el segundo pedido de una tanda doble no sonaba
       nunca. Lo pendiente sigue en la lista y se reintenta al terminar. */
    if (Date.now() < sonandoHasta) { volverAIntentar(sonandoHasta - Date.now()); return; }

    /* Se aparta ANTES de sonar lo que este pitido va a cubrir.

       Sonar tarda, y en ese rato puede entrar otro pedido. Si al
       terminar se diera por avisado todo lo que hay en la lista, el
       que entró a mitad quedaría anunciado por un pitido que sonó
       antes de que existiera — y volveríamos a perder pedidos
       exactamente igual que antes, solo que por otra puerta. */
    const anunciando = [...porAvisar];

    avisando = true;
    let sono = false;
    try { sono = await sonar(); } finally { avisando = false; }

    /* No sonó: casi siempre es que todavía nadie ha tocado la pantalla.
       No se da nada por avisado y se vuelve a probar solo — en cuanto
       alguien la toque, sonará lo que quedó esperando. */
    if (!sono) { volverAIntentar(3000); return; }

    sonandoHasta = Date.now() + PAUSA;

    anunciando.forEach(([id, marca]) => {
        // Si lo corrigieron mientras sonaba, la marca ya no es la misma
        // y sigue pendiente: esa corrección todavía no la ha oído nadie.
        if (porAvisar.get(id) === marca) {
            avisadas.set(id, marca);
            porAvisar.delete(id);
        }
    });

    pintarPendiente();
    if (porAvisar.size) volverAIntentar(PAUSA);
}

/**
 * Lo que llegó y todavía no se ha anunciado.
 *
 * Se compara contra lo ya avisado en vez de mirar el reloj. Antes había
 * un plazo —"lo que llegue en los primeros cuatro segundos no suena"—
 * para que al abrir la pantalla no sonara todo lo que ya estaba; el
 * problema es que un pedido que entrara justo en esos cuatro segundos
 * desaparecía sin dejar rastro.
 */
function revisarNovedades() {
    Servicio.comandasDe(ESTACION).forEach(c => {
        const marca = marcaDe(c);
        if (avisadas.get(c.id) !== marca) porAvisar.set(c.id, marca);
    });
    return porAvisar.size ? intentarAvisar() : Promise.resolve();
}

/**
 * El aviso que no depende de nada.
 *
 * Mientras quede algo sin anunciar, la pantalla lo dice y no se calla.
 * Es la única vía que el navegador no puede bloquear, así que es la que
 * tiene que sobrevivir cuando fallan las otras dos.
 */
function pintarPendiente() {
    const n = porAvisar.size;
    document.body.classList.toggle('hay-nuevo', n > 0);
    document.title = n ? `(${n}) ${TITULO}` : TITULO;
    pintarAvisoSonido();
}

/** Mientras el sonido esté bloqueado hay que decirlo, no callarlo. */
function pintarAvisoSonido() {
    const el = $('sin-sonido');
    if (!el) return;

    const n = porAvisar.size;
    const puede = puedeSonar();

    // El cartel solo estorba cuando no hace falta
    el.hidden = puede && !n;
    if (el.hidden) return;

    const cuantos = `${n} pedido${n > 1 ? 's' : ''} nuevo${n > 1 ? 's' : ''}`;

    /* "No suena" es una molestia. "No suena y tienes tres pedidos
       esperando" es otra cosa, y hay que decirlo con el número. */
    el.innerHTML = !puede
        ? `<i class="fas fa-volume-xmark"></i> ${n
              ? `${cuantos} — el navegador no deja sonar. TOCA AQUÍ`
              : 'Toca aquí para activar el aviso sonoro'}`
        : `<i class="fas fa-bell"></i> ${cuantos}`;
}

/** Tocar el cartel activa el sonido y suelta lo que estuviera esperando. */
async function activarSonido() {
    if (porAvisar.size) { await desbloquear(); return; }

    await prepararAudio();
    if (await sonar()) toast('Aviso activado');
    else toast('El navegador todavía no deja sonar. Toca la pantalla otra vez.');
}

/* ------------------------------------------------------------
   QUE LA PANTALLA NO SE DUERMA

   Una tablet apoyada en la repisa apaga la pantalla al minuto, y con
   la pantalla apagada no hay aviso que valga: el navegador duerme el
   audio y congela los relojes. Se le pide al sistema que la mantenga
   encendida mientras esta pantalla esté a la vista.

   El sistema suelta el permiso solo al cambiar de aplicación, así que
   se vuelve a pedir al regresar. Si el navegador no sabe hacer esto,
   no pasa nada: todo sigue funcionando igual que antes.
   ------------------------------------------------------------ */

let candado = null;

async function mantenerPantallaViva() {
    if (!navigator.wakeLock || document.hidden || candado) return;
    try {
        candado = await navigator.wakeLock.request('screen');
        candado.addEventListener('release', () => { candado = null; });
    } catch (e) { candado = null; }
}

/* ============================================================
   ENTRAR
   ============================================================ */

async function entrar() {
    const correo = $('lock-correo').value.trim();
    const clave  = $('lock-clave').value;
    const error  = $('lock-error');

    if (!correo || !clave) { error.textContent = 'Falta el correo o la clave.'; return; }

    $('lock-entrar').disabled = true;
    try {
        await Sync.entrar(correo, clave);
        abrirApp();
    } catch (e) {
        error.textContent = Sync.porQueNoEntro(e);
    } finally {
        $('lock-entrar').disabled = false;
    }
}

/**
 * Esta cuenta no tiene nada que hacer aquí. Se le dice con nombre y
 * apellido cuál es la suya, porque a las siete de la noche "acceso
 * denegado" no le sirve a nadie.
 */
function negarPaso() {
    const quien = Sync.correoSesion ? Sync.correoSesion() : '';
    Sync.salir();
    $('lock').hidden = false;
    $('lock-error').textContent = quien
        ? `${quien} no es la cuenta de esta pantalla. Entra con la que le toca.`
        : 'Esa cuenta no está en la lista del equipo del local.';
}

function abrirApp() {
    const permiso = Servicio.permisoEn(ESTACION);
    if (permiso === 'no') { negarPaso(); return; }
    PUEDE = permiso === 'todo';

    $('lock').hidden = true;

    /* Lo que ya estaba aquí al abrir no es nuevo: es lo de antes, y se
       da por avisado sin sonar. Tiene que hacerse ANTES de ponerse a
       escuchar, o el primer envío de la nube llegaría como si fueran
       todos pedidos recién entrados. */
    Servicio.comandasDe(ESTACION).forEach(c => avisadas.set(c.id, marcaDe(c)));

    // Si se entro tocando el boton, este es el momento en que el
    // navegador nos deja empezar a sonar
    desbloquear();
    mantenerPantallaViva();
    ajustarSegunPermiso();
    Servicio.limpiarViejo(2);
    Servicio.iniciar(alLlegarDatos, 'estacion');
    pintar();
}

/**
 * Llega algo de la nube.
 *
 * Primero el aviso y después el dibujo, no al revés. El aviso vivía
 * dentro de `pintar()` y a mitad de camino, así que cualquier fallo
 * dibujando el tablero se llevaba la alarma por delante sin que nadie
 * se enterara. Avisar no puede depender de que el dibujo salga bien.
 */
function alLlegarDatos() {
    const aviso = revisarNovedades();
    pintar();
    return aviso;
}

/**
 * Deja la pantalla acorde con lo que puede hacer quien entró: el aviso
 * de solo lectura arriba, y fuera los enlaces a pantallas que esa
 * cuenta no puede abrir. Un enlace que siempre rebota solo enseña a
 * desconfiar de la pantalla.
 */
function ajustarSegunPermiso() {
    const aviso = $('solover');
    if (aviso) {
        aviso.hidden = PUEDE;
        aviso.innerHTML = `<i class="fas fa-eye"></i> Estás mirando ${
            ESTACION === 'asador' ? 'la parrilla' : 'la cocina'
        }. Aquí no puedes marcar nada — solo quien la atiende.`;
    }

    document.querySelectorAll('.srv-links a[href]').forEach(a => {
        const destino = a.getAttribute('href') || '';
        const pantalla = destino.includes('comanda')  ? 'comanda'
                       : destino.includes('parrilla') ? 'asador'
                       : destino.includes('cocina')   ? 'cocina' : null;
        if (pantalla) a.hidden = Servicio.permisoEn(pantalla) === 'no';
    });
}

/* ============================================================
   PINTAR EL TABLERO
   ============================================================ */

function pintarRed() {
    const el = $('red');
    if (!el) return;

    const faltan = Servicio.pendientes();

    /* Que no esté llegando nada es lo peor que le puede pasar a esta
       pantalla: se ve igual de vacía que cuando no hay pedidos, y el
       cocinero le cree. Por eso manda sobre cualquier otro aviso. */
    const recibiendo = Servicio.recibiendo();

    if (!recibiendo) {
        el.className = 'srv-red caido';
        el.innerHTML = `<i class="fas fa-plug-circle-xmark"></i> SIN RECIBIR`;
        document.body.classList.add('desconectado');
    } else {
        document.body.classList.remove('desconectado');
        el.className = 'srv-red ' + (faltan ? 'caido' : 'ok');
        el.innerHTML = faltan
            ? `<i class="fas fa-triangle-exclamation"></i> ${faltan} sin enviar`
            : `<i class="fas fa-circle"></i>`;
    }

    pintarAlarma(recibiendo, faltan);
}

/**
 * El motivo va a la vista, no escondido detrás de un toque. En una
 * cocina nadie va a ponerse a investigar por qué la pantalla está roja.
 */
function pintarAlarma(recibiendo, faltan) {
    const caja = $('alarma');
    if (!caja) return;

    const rechazadas = Servicio.apartadas();
    if (recibiendo && !faltan && !rechazadas) { caja.hidden = true; return; }

    const quien = (typeof Sync !== 'undefined' && Sync.correoSesion) ? Sync.correoSesion() : '';
    const motivo = Servicio.porQueNoSale();

    caja.hidden = false;

    if (!recibiendo || faltan) {
        caja.innerHTML = `
            <strong><i class="fas fa-triangle-exclamation"></i>
                ${!recibiendo ? 'No está llegando nada' : faltan + ' sin enviar'}</strong>
            ${motivo ? `<span>${motivo}</span>` : ''}
            ${!recibiendo && !motivo
                ? '<span>No se pudo abrir el canal con la nube. Suele ser el wifi o el permiso de la cuenta.</span>' : ''}
            ${quien ? `<small>Entraste como ${quien}</small>` : ''}`;
        return;
    }

    caja.innerHTML = avisoRechazadas(rechazadas, quien);
}

/**
 * Lo que la nube rechazó y ya no se reintenta.
 *
 * Casi siempre es de cuando esta pantalla se usaba con otra cuenta.
 * Se muestra con nombre y apellido —el código del pedido, no una ruta
 * de la base de datos— porque quien lo lee tiene que poder decidir si
 * eso importa o es basura de una prueba.
 */
function avisoRechazadas(cuantas, quien) {
    const cuales = Servicio.detalleApartado().slice(0, 6).join(' · ');
    return `
        <strong><i class="fas fa-ban"></i> ${cuantas} que la nube rechaza</strong>
        <span>No van a salir con esta cuenta, y ya no traban lo demás.
              Casi siempre son de cuando este celular se usó con otro correo.</span>
        ${cuales ? `<span>${cuales}</span>` : ''}
        ${quien ? `<small>Entraste como ${quien}</small>` : ''}
        <span class="srv-alarma-btns">
            <button data-rechazadas="descartar">Descartar</button>
            <button data-rechazadas="reintentar">Reintentar</button>
        </span>`;
}

/** Hace cuántos minutos entró el pedido. */
const minutosDe = c => Math.floor((Date.now() - c.creado) / 60000);

function pintar() {
    pintarRed();

    const todas = Servicio.comandasDe(ESTACION);

    /* UNA SOLA COLA, POR HORA DE ENTRADA.

       La parrilla dejaba para el final lo que era solo para llevar, con
       la idea de que saliera caliente cuando el de la mesa ya estuviera
       comiendo. En la práctica rompía la única regla que todo el mundo
       en el local entiende sin explicación: el primero que entra es el
       primero que sale. Con dos listas nadie sabía qué iba antes.

       El tipo de servicio ya no decide el orden: solo se distingue con
       un cartel en la tarjeta. */
    const yaLoSaco = c => ESTACION === 'asador' && c.sacado;

    const activas = todas.filter(c => !yaLoSaco(c));
    /* Abajo, plegado, lo que ya se resolvió en esta pantalla:
       en el asador lo que salió de la parrilla, en la cocina lo ya
       entregado. No estorba el tablero y sirve para responder
       "¿ya salió la mesa 5?" sin preguntarle a nadie. */
    const plegadas = ESTACION === 'asador'
        ? todas.filter(c => c.sacado)
        : Servicio.comandasDe('cocina', 'entregado')
                  .sort((a, b) => (b.entregado || 0) - (a.entregado || 0))
                  .slice(0, 20);

    pintarArroz();

    const tablero = $('tablero');

    if (!activas.length) {
        /* "Todo al día" solo se puede decir si de verdad se está
           escuchando. Si el canal está caído, la pantalla vacía no
           significa que no haya pedidos: significa que no los vemos. */
        tablero.innerHTML = Servicio.recibiendo() ? `
            <div class="vacio">
                <i class="fas fa-check"></i>
                <p>Todo al día</p>
            </div>` : `
            <div class="vacio sin-senal">
                <i class="fas fa-plug-circle-xmark"></i>
                <p>No se está recibiendo</p>
                <small>Puede haber pedidos que esta pantalla no ve.
                       Pregunta antes de dar por hecho que no hay nada.</small>
            </div>`;
    } else {
        tablero.innerHTML = activas.map((c, i) => tarjeta(c, i + 1)).join('');
    }

    const caja = $('sacadas-caja');
    if (caja) {
        caja.hidden = !plegadas.length;
        $('sacadas-n').textContent = plegadas.length;
        // Lo ya resuelto no lleva número: ahí el orden ya no importa
        $('sacadas').innerHTML = plegadas.map(c => tarjeta(c, 0)).join('');
    }
}

/**
 * El arroz que hay pedido y todavía no ha salido.
 *
 * El problema no era contar, era enterarse tarde: las proteínas salían
 * y el arroz seguía crudo. Nadie sabe cuánto rinde una olla, así que
 * decir "quedan tres porciones" sería inventárselo. Lo que sí es un
 * hecho es cuánto está pedido y sin servir, y ese número sube en el
 * momento exacto en que entra el pedido grande — que es cuando hay que
 * poner la olla, no cuando ya falta.
 *
 * Solo en la cocina: la parrilla no sirve arroz.
 */
function pintarArroz() {
    const el = $('arroz');
    if (!el) return;

    const n = Servicio.arrozPendiente();
    el.hidden = !n;
    if (!n) return;

    el.innerHTML = `<i class="fas fa-bowl-rice"></i>
        <b>${n}</b> ${n === 1 ? 'porción de arroz pedida' : 'porciones de arroz pedidas'}
        <span>sin servir todavía</span>`;
}

/* ---------- Una tarjeta ----------

   `turno` es el puesto en la fila: 1 es el que va ahora. Antes solo
   estaban ordenadas por hora y en una tablet, con cuatro tarjetas del
   mismo tamaño una al lado de otra, no había forma de saber cuál seguía
   sin ponerse a comparar relojes. El número lo dice de lejos.          */

function tarjeta(c, turno) {
    const min  = minutosDe(c);
    const hora = new Date(c.creado).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

    // El color avisa sin que nadie tenga que mirar el reloj
    const urgencia = min >= 25 ? 'roja' : min >= 15 ? 'ambar' : '';
    const ahora    = turno === 1;

    /* La escalera: el primero encendido, el segundo un punto menos, el
       tercero otro punto. Del cuarto en adelante todos igual — más
       escalones no se distinguirían y solo apagarían el tablero. */
    const escalon = turno >= 1 ? 'turno-' + Math.min(turno, 4) : '';

    // Para llevar, el nombre manda: es lo que se grita al entregar
    const quien = c.mesa ? 'Mesa ' + c.mesa
                : c.nombre ? c.nombre
                : 'LLEVAR';

    return `
    <article class="ticket ${urgencia} ${escalon} ${apagada(c) ? 'sacada' : ''} ${ahora ? 'ahora' : ''}"
             data-id="${c.id}">
        <div class="ticket-top">
            ${turno ? `<span class="ticket-turno">${turno}</span>` : ''}
            <span class="ticket-mesa ${c.mesa ? '' : 'llevar'}">${quien}</span>
            <span class="ticket-hora">${hora} · ${min} min</span>
        </div>

        ${ahora ? '<div class="ticket-ahora">EMPIEZA POR ESTE</div>' : ''}

        <!-- Ya no va al final de la fila, así que el tipo de servicio
             tiene que decirse aquí y de lejos. En un pedido mixto no
             sale este cartel: la mesa sigue siendo mesa, y lo que se
             lleva va marcado plato por plato. -->
        ${c.mesa ? '' : '<div class="ticket-llevar">📦 PARA LLEVAR</div>'}

        <!-- El código guardado, no uno recalculado con lo que ve esta
             pantalla: si el asador dijera "M9 · 2PO" y la cocina
             "M9 · 2PO 2 Jugo", serían dos nombres para el mismo pedido
             y no habría forma de cantarlo en voz alta. -->
        <div class="ticket-codigo">
            ${c.codigo || Servicio.codigoDe(c)}
            ${!c.mesa && c.nombre ? `<b class="ticket-nombre">${c.nombre}</b>` : ''}
        </div>

        ${ESTACION === 'cocina' && c.cubiertos
            ? `<div class="ticket-cubiertos">
                   <i class="fas fa-utensils"></i> ${c.cubiertos} cubierto${c.cubiertos > 1 ? 's' : ''}
               </div>` : ''}

        <ul class="ticket-items">
            ${itemsDeLaVista(c).map(it => itemHtml(it, c)).join('')}
        </ul>

        ${c.nota ? `<div class="ticket-nota"><i class="fas fa-note-sticky"></i> ${c.nota}</div>` : ''}

        ${PUEDE ? botonDe(c) : ''}
    </article>`;
}

/**
 * El botón de cerrar el pedido, distinto en cada pantalla.
 *
 * En la cocina no se enciende hasta que todos los platos estén
 * marcados: la pantalla no deja cerrar lo que no está hecho, que es
 * justo lo que se olvidaba.
 *
 * En la parrilla hay que mantenerlo apretado un segundo. Un toque
 * suelto en una pantalla llena de grasa sacaba pedidos que seguían en
 * el fuego, y deshacerlo obligaba a ir a buscar la tarjeta plegada.
 */
function botonDe(c) {
    if (ESTACION === 'asador') {
        return c.sacado
            ? `<button class="ticket-btn" data-accion="${c.id}">
                   <i class="fas fa-rotate-left"></i> Devolver
               </button>`
            : `<button class="ticket-btn largo" data-largo="${c.id}">
                   <span class="ticket-btn-progreso"></span>
                   <span class="ticket-btn-texto">
                       <i class="fas fa-check"></i> Mantén ${SOSTENER / 1000}s — Ya lo saqué
                   </span>
               </button>`;
    }

    if (c.estado === 'entregado') {
        return `<button class="ticket-btn" data-accion="${c.id}">
                    <i class="fas fa-rotate-left"></i> Devolver
                </button>`;
    }

    const faltan = c.items.reduce((n, it) => n + (it.cantidad - Servicio.listasDe(c, it.uid)), 0);
    return faltan
        ? `<button class="ticket-btn pendiente" disabled>
               Faltan ${faltan} por marcar
           </button>`
        : `<button class="ticket-btn" data-accion="${c.id}">
               <i class="fas fa-check"></i> ENTREGADO
           </button>`;
}

/**
 * Una tarjeta se ve apagada solo cuando ya se resolvio EN ESTA pantalla.
 * Que el asador saque la carne no apaga nada en la cocina: alli el plato
 * todavia esta por emplatar y servir.
 */
function apagada(c) {
    return ESTACION === 'asador' ? !!c.sacado : c.estado === 'entregado';
}

function detallesDe(it) {
    const detalles = [];

    // Al asador solo le importan el término y si es para llevar.
    // La guarnición que se quitó no cambia nada en la parrilla.
    if (it.elegidas && it.elegidas.length) {
        detalles.push(it.elegidas.map(id => (Store.findPlato(id) || {}).nombre).join(' + '));
    }
    if (it.termino) detalles.push(`<b class="det-fuerte">${it.termino}</b>`);

    /* La forma de servir es de la cocina, que es la que emplata. Al
       asador no le cambia nada: él saca la proteína igual. Va en negrita
       porque no es quitar una cosa, es un plato armado distinto. */
    if (ESTACION === 'cocina' && it.cambio) {
        detalles.push(`<b class="det-fuerte">${Servicio.comoSeSirve(it).toUpperCase()}</b>`);
    }
    if (ESTACION === 'cocina' && it.sin && it.sin.length) {
        detalles.push(it.sin.map(g => 'sin ' + (GUARNICIONES[g] || g)).join(' · '));
    }
    if (it.nota) detalles.push(it.nota);

    return detalles;
}

/**
 * Dos renglones que se ven exactamente igual tienen que ser uno solo.
 *
 * El mesero manda "1 chuleta sin arroz" y "1 chuleta sin plátano". Lo
 * que se quita es cosa de la cocina y en la parrilla no se muestra, así
 * que al asador le llegaban dos renglones idénticos:
 *
 *     1 Chuleta
 *     1 Chuleta        <- este se lo saltó
 *     2 Pollo
 *
 * Pasó en el servicio de verdad: llevó una chuleta y dejó la otra. Se
 * juntan por lo que SE VE, no por lo que trae el ítem: si en pantalla
 * no hay nada que las distinga, no pueden ser dos líneas. Lo que sí
 * cambia el trabajo —el término, las carnes de un mixto, si va para
 * llevar— sí se ve, así que sigue separando.
 *
 * En la cocina no se juntan: ahí cada unidad es una casilla que se
 * marca, y las casillas van pegadas a su ítem.
 */
function juntarIguales(items) {
    const filas = new Map();

    items.forEach(it => {
        const seVe = JSON.stringify([it.nombre, !!it.llevar, detallesDe(it)]);
        const ya = filas.get(seVe);
        if (ya) ya.cantidad += it.cantidad;
        else filas.set(seVe, { ...it });
    });

    return [...filas.values()];
}

const itemsDeLaVista = c =>
    ESTACION === 'asador' ? juntarIguales(c.items) : c.items;

/**
 * En la parrilla, una línea por ítem con su cantidad delante.
 *
 * En la cocina, UNA LÍNEA POR UNIDAD. "4x Chuleta" se lee de un vistazo
 * y se olvida igual de rápido: se emplatan tres y la cuarta se queda en
 * la plancha. Cuatro casillas no se pueden despachar de un toque, y la
 * que falta se ve desde la puerta.
 */
function itemHtml(it, c) {
    const detalles = detallesDe(it);
    const cola = `
        ${it.llevar ? '<span class="ti-llevar">🥡 llevar</span>' : ''}
        ${detalles.length ? `<span class="ti-det">${detalles.join(' · ')}</span>` : ''}`;

    if (ESTACION !== 'cocina' || !PUEDE) {
        return `
        <li class="ticket-item ${it.llevar ? 'llevar' : ''}">
            <span class="ti-cant">${it.cantidad}</span>
            <span class="ti-nom">${it.nombre}${cola}</span>
        </li>`;
    }

    const listas = Servicio.listasDe(c, it.uid);

    /* Cada unidad se marca sola. Tocar la número 3 marca de la 1 a la 3
       y destocarla las deja en 2: así seguir el orden natural —de
       izquierda a derecha— siempre hace lo esperado, y corregirse es un
       solo toque en vez de deshacer una por una. */
    return Array.from({ length: it.cantidad }, (_, i) => {
        const hecha = i < listas;
        return `
        <li class="ticket-item tarea ${hecha ? 'hecha' : ''} ${it.llevar ? 'llevar' : ''}"
            data-tarea="${c.id}" data-uid="${it.uid}" data-n="${hecha ? i : i + 1}">
            <span class="ti-caja">${hecha ? '<i class="fas fa-check"></i>' : ''}</span>
            <span class="ti-nom">
                ${it.nombre}${it.cantidad > 1 ? ` <em class="ti-de">${i + 1} de ${it.cantidad}</em>` : ''}
                ${cola}
            </span>
        </li>`;
    }).join('');
}

/* ============================================================
   ACCIONES
   ============================================================ */

/**
 * Qué hacer con lo que la nube rechazó.
 *
 * Descartar avisa de lo que se pierde antes de perderlo. Reintentar
 * sirve si mientras tanto se entró con la cuenta que sí puede.
 */
function resolverRechazadas(que) {
    if (que === 'reintentar') {
        Servicio.reintentarApartado();
        toast('Reintentando…');
        return;
    }
    const n = Servicio.apartadas();
    if (!confirm(`Descartar ${n} cosa(s) que la nube rechaza?\n\n` +
                 `Si alguna era un pedido de verdad, la cocina nunca lo vio ` +
                 `y hay que volver a anotarlo desde la comanda.`)) return;
    Servicio.descartarApartado();
    toast('Descartado');
}

/* ============================================================
   MANTENER APRETADO PARA SACAR DE LA PARRILLA

   Un toque suelto sobre una pantalla con las manos ocupadas sacaba
   pedidos que seguían en el fuego. Un segundo no se da por accidente,
   y la barra que avanza dice que algo está pasando — sin ella,
   mantener el dedo parece que la pantalla se colgó.

   Empezó en dos segundos y en la parrilla se hicieron largos: con
   ocho tarjetas que sacar son ocho esperas, y el asador tiene las
   manos en otra cosa.
   ============================================================ */

const SOSTENER = 1000;
let sosteniendo = null;   // { id, reloj, boton }

function empezarSostener(boton) {
    if (sosteniendo) return;
    const id = boton.dataset.largo;

    boton.classList.add('sosteniendo');
    boton.style.setProperty('--duracion', SOSTENER + 'ms');

    sosteniendo = {
        id, boton,
        reloj: setTimeout(() => {
            sosteniendo = null;
            boton.classList.remove('sosteniendo');
            const c = Servicio.getComandas()[id];
            Servicio.marcarSacado(id, true);
            if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
            toast(Servicio.etiquetaDe(c) + ' sacado');
        }, SOSTENER)
    };
}

function soltarSostener() {
    if (!sosteniendo) return;
    clearTimeout(sosteniendo.reloj);
    sosteniendo.boton.classList.remove('sosteniendo');
    sosteniendo = null;
}

/* ============================================================
   MARCAR PLATO POR PLATO (COCINA)
   ============================================================ */

function marcarTarea(li) {
    if (!PUEDE) return;
    Servicio.marcarListo(li.dataset.tarea, li.dataset.uid, Number(li.dataset.n));
}

function accion(id) {
    /* El botón ni se dibuja cuando la cuenta es de mirar, pero la
       comprobación se repite aquí: el dibujo se puede editar desde el
       navegador y la decisión no puede depender de eso. Quien de verdad
       lo impide son las reglas de Firebase. */
    if (!PUEDE) { toast('Esta pantalla no es tuya: solo puedes mirarla'); return; }

    const c = Servicio.getComandas()[id];
    if (!c) return;

    if (ESTACION === 'asador') {
        // Sacar necesita mantener apretado; devolver es de un toque,
        // porque deshacer no rompe nada.
        Servicio.marcarSacado(id, !c.sacado);
        toast(c.sacado ? 'Vuelve a la parrilla' : Servicio.etiquetaDe(c) + ' sacado');
    } else if (c.estado === 'entregado') {
        // Un toque de más se deshace: vuelve al tablero como si nada
        Servicio.devolverANuevo(id);
        toast(Servicio.etiquetaDe(c) + ' vuelve a la cola');
    } else {
        Servicio.marcarEntregado(id);
        toast(Servicio.etiquetaDe(c) + ' entregado');
    }
}

/* ============================================================
   ARRANQUE
   ============================================================ */

function iniciarEstacion(cual) {
    ESTACION = cual;

    document.addEventListener('DOMContentLoaded', () => {
        $('lock-entrar').addEventListener('click', entrar);
        $('lock-clave').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });

        /* Sin esto no habia forma de cambiar de cuenta ni de recuperarse de
           una sesion rota: habia que borrar los datos del navegador. */
            const btnProbar = $('btn-probar-sonido');
        if (btnProbar) btnProbar.addEventListener('click', async () => {
            // Sirve para dos cosas: desbloquear el audio y comprobar que
            // se oye por encima del ruido, sin esperar a que entre un pedido
            await prepararAudio();
            if (await sonar()) toast('Así va a sonar');
            else toast('El navegador todavía no deja sonar. Toca la pantalla otra vez.');
        });

        const btnSalir = $('btn-salir');
        if (btnSalir) btnSalir.addEventListener('click', () => {
                if (confirm('Cerrar sesion en este celular?')) { Sync.salir(); location.reload(); }
        });

        /* La pulsación larga se escucha con eventos de puntero, no de
           clic: hay que saber cuándo empieza y cuándo se suelta, y si el
           dedo se corre fuera del botón la acción se cancela. */
        document.addEventListener('pointerdown', e => {
            const largo = e.target.closest('[data-largo]');
            if (largo) { e.preventDefault(); empezarSostener(largo); }
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
            document.addEventListener(ev, soltarSostener));
        // Si el dedo se sale del botón sin soltar, tampoco cuenta
        document.addEventListener('pointermove', e => {
            if (sosteniendo && !e.target.closest('[data-largo]')) soltarSostener();
        });

        document.addEventListener('click', e => {
            const tarea = e.target.closest('[data-tarea]');
            if (tarea) { marcarTarea(tarea); return; }

            const btn = e.target.closest('[data-accion]');
            if (btn) { accion(btn.dataset.accion); return; }

            const rech = e.target.closest('[data-rechazadas]');
            if (rech) { resolverRechazadas(rech.dataset.rechazadas); return; }

            // Tocar el aviso rojo dice por que no esta saliendo o entrando
            if (e.target.closest('#red')) {
                const partes = [];
                if (!Servicio.recibiendo()) partes.push('No esta llegando lo que mandan los otros celulares.');
                if (Servicio.pendientes()) partes.push('No salen ' + Servicio.pendientes() + ' cosas de este celular.');
                const motivo = Servicio.porQueNoSale();
                if (motivo) partes.push('', motivo);
                if (partes.length) alert(partes.join(String.fromCharCode(10)));
            }
        });

        /* Cualquier toque sirve para desbloquear el sonido, y al
           desbloquearlo suena lo que se hubiera quedado esperando. El
           celular tambien duerme el audio al cambiar de app, asi que se
           vuelve a intentar al regresar a la pantalla. */
        ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
            window.addEventListener(ev, desbloquear, { passive: true }));

        const cartel = $('sin-sonido');
        if (cartel) cartel.addEventListener('click', activarSonido);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            desbloquear();
            mantenerPantallaViva();
        });

        /* El reloj de cada tarjeta tiene que avanzar aunque no entre nada.
           De paso se revisa si quedó algo sin anunciar: si el canal se
           cayó y volvió sin avisar a nadie, esta es la red de seguridad. */
        setInterval(alLlegarDatos, 20000);

        /* La conexión se vigila aparte y más seguido: si se cae, hay que
           decirlo en segundos, no esperar al siguiente repintado. */
        let recibiaAntes = true;
        setInterval(() => {
            const ahora = Servicio.recibiendo();
            if (ahora !== recibiaAntes) { recibiaAntes = ahora; alLlegarDatos(); }
            else pintarRed();
        }, 3000);

        if (Sync.activo && Sync.haySesion()) abrirApp();
        else if (!Sync.activo) {
            $('lock-msg').textContent = 'Este local todavía no tiene la nube conectada.';
            $('lock-entrar').disabled = true;
        }
    });
}
