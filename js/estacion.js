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
let sonido   = true;
let vistas   = new Set();     // para no volver a sonar por lo mismo
let abiertoEn = Date.now();   // lo que ya estaba al abrir no suena

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
    pintarAvisoSonido();
    return audioListo();
}

let sonandoHasta = 0;

async function pitar() {
    if (!sonido) return;

    /* Un aviso a la vez. Si entran dos pedidos casi juntos, encadenarlos
       en vez de superponerlos: sumados se pasan de rango y distorsionan,
       y ademas dos alarmas encima suenan a ruido, no a aviso. */
    if (Date.now() < sonandoHasta) return;
    sonandoHasta = Date.now() + 1100;

    // Antes se llamaba a resume() sin esperarlo y las notas se programaban
    // sobre un audio todavía dormido: no sonaba nada y no fallaba nada.
    if (!audioListo()) await prepararAudio();
    if (!audioListo()) return;

    try {
        const ahora = audio.currentTime;

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
    } catch (e) { /* si el navegador no deja sonar, queda el aviso visual */ }

    // Si el celular está en el bolsillo o boca abajo, la vibración avisa igual
    try { if (navigator.vibrate) navigator.vibrate([220, 90, 220, 90, 320]); } catch (e) {}
}

/** Mientras el sonido esté bloqueado hay que decirlo, no callarlo. */
function pintarAvisoSonido() {
    const el = $('sin-sonido');
    if (el) el.hidden = audioListo();
}

/** Tocar el cartel amarillo activa el sonido y lo hace sonar de muestra. */
function activarSonido() {
    prepararAudio().then(listo => { if (listo) pitar(); });
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
        error.textContent = e.message === 'sin-configurar'
            ? 'Este local todavía no tiene la nube conectada.'
            : 'Correo o clave incorrectos.';
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
    abiertoEn = Date.now();
    // Si se entro tocando el boton, este es el momento en que el
    // navegador nos deja empezar a sonar
    prepararAudio();
    ajustarSegunPermiso();
    Servicio.limpiarViejo(2);
    Servicio.iniciar(pintar, 'estacion');
    pintar();
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

    if (recibiendo && !faltan) { caja.hidden = true; return; }

    const quien = (typeof Sync !== 'undefined' && Sync.correoSesion) ? Sync.correoSesion() : '';
    const motivo = Servicio.porQueNoSale();

    caja.hidden = false;
    caja.innerHTML = `
        <strong><i class="fas fa-triangle-exclamation"></i>
            ${!recibiendo ? 'No está llegando nada' : faltan + ' sin enviar'}</strong>
        ${motivo ? `<span>${motivo}</span>` : ''}
        ${!recibiendo && !motivo
            ? '<span>No se pudo abrir el canal con la nube. Suele ser el wifi o el permiso de la cuenta.</span>' : ''}
        ${quien ? `<small>Entraste como ${quien}</small>` : ''}`;
}

/** Hace cuántos minutos entró el pedido. */
const minutosDe = c => Math.floor((Date.now() - c.creado) / 60000);

function pintar() {
    pintarRed();

    const todas = Servicio.comandasDe(ESTACION);

    // La parrilla deja para el final lo que es solo para llevar: así sale
    // caliente cuando el de la mesa ya está comiendo.
    const esDiferido = c => ESTACION === 'asador' && c.items.every(it => it.llevar);

    /* "Ya lo saqué" es solo del asador: limpia SU tarjeta cuando la carne
       sale de la parrilla. La cocina todavía tiene que emplatar y servir,
       así que su tarjeta se queda hasta que ella misma marque ENTREGADO
       — eso sí las borra de las dos pantallas, porque el plato ya salió. */
    const yaLoSaco = c => ESTACION === 'asador' && c.sacado;

    const activas   = todas.filter(c => !yaLoSaco(c) && !esDiferido(c));
    const diferidas = todas.filter(c => !yaLoSaco(c) && esDiferido(c));
    /* Abajo, plegado, lo que ya se resolvió en esta pantalla:
       en el asador lo que salió de la parrilla, en la cocina lo ya
       entregado. No estorba el tablero y sirve para responder
       "¿ya salió la mesa 5?" sin preguntarle a nadie. */
    const plegadas = ESTACION === 'asador'
        ? todas.filter(c => c.sacado)
        : Servicio.comandasDe('cocina', 'entregado')
                  .sort((a, b) => (b.entregado || 0) - (a.entregado || 0))
                  .slice(0, 20);

    /* Suena lo que no habiamos visto, salvo lo que ya estaba al abrir
       la pantalla.

       Antes la condicion era "y ya habiamos visto algo", asi que si la
       pantalla abria con el tablero VACIO el primer pedido no sonaba
       nunca. De ahi que a veces sonara y a veces no. Ahora se mira el
       reloj: lo que llega pasados unos segundos de abrir, suena. */
    const nuevas = todas.filter(c => !vistas.has(c.id));
    if (nuevas.length && Date.now() - abiertoEn > 4000) pitar();
    todas.forEach(c => vistas.add(c.id));

    const tablero = $('tablero');

    if (!activas.length && !diferidas.length) {
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
        tablero.innerHTML =
            activas.map(tarjeta).join('') +
            (diferidas.length ? `
                <div class="separador-llevar">
                    <i class="fas fa-bag-shopping"></i> Para llevar — al final
                </div>` + diferidas.map(tarjeta).join('') : '');
    }

    const caja = $('sacadas-caja');
    if (caja) {
        caja.hidden = !plegadas.length;
        $('sacadas-n').textContent = plegadas.length;
        $('sacadas').innerHTML = plegadas.map(tarjeta).join('');
    }
}

/* ---------- Una tarjeta ---------- */

function tarjeta(c) {
    const min  = minutosDe(c);
    const hora = new Date(c.creado).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

    // El color avisa sin que nadie tenga que mirar el reloj
    const urgencia = min >= 25 ? 'roja' : min >= 15 ? 'ambar' : '';

    return `
    <article class="ticket ${urgencia} ${apagada(c) ? 'sacada' : ''}" data-id="${c.id}">
        <div class="ticket-top">
            <span class="ticket-mesa">${c.mesa ? 'Mesa ' + c.mesa : 'LLEVAR'}</span>
            <span class="ticket-hora">${hora} · ${min} min</span>
        </div>

        <!-- El código guardado, no uno recalculado con lo que ve esta
             pantalla: si el asador dijera "M9 · 2PO" y la cocina
             "M9 · 2PO 2 Jugo", serían dos nombres para el mismo pedido
             y no habría forma de cantarlo en voz alta. -->
        <div class="ticket-codigo">${c.codigo || Servicio.codigoDe(c)}</div>

        ${ESTACION === 'cocina' && c.cubiertos
            ? `<div class="ticket-cubiertos">
                   <i class="fas fa-utensils"></i> ${c.cubiertos} cubierto${c.cubiertos > 1 ? 's' : ''}
               </div>` : ''}

        <ul class="ticket-items">
            ${c.items.map(itemHtml).join('')}
        </ul>

        ${c.nota ? `<div class="ticket-nota"><i class="fas fa-note-sticky"></i> ${c.nota}</div>` : ''}

        ${PUEDE ? `
        <button class="ticket-btn" data-accion="${c.id}">
            ${ESTACION === 'asador'
                ? (c.sacado ? '<i class="fas fa-rotate-left"></i> Devolver' : '<i class="fas fa-check"></i> Ya lo saqué')
                : (c.estado === 'entregado'
                    ? '<i class="fas fa-rotate-left"></i> Devolver'
                    : '<i class="fas fa-check"></i> ENTREGADO')}
        </button>` : ''}
    </article>`;
}

/**
 * Una tarjeta se ve apagada solo cuando ya se resolvio EN ESTA pantalla.
 * Que el asador saque la carne no apaga nada en la cocina: alli el plato
 * todavia esta por emplatar y servir.
 */
function apagada(c) {
    return ESTACION === 'asador' ? !!c.sacado : c.estado === 'entregado';
}

function itemHtml(it) {
    const detalles = [];

    // Al asador solo le importan el término y si es para llevar.
    // La guarnición que se quitó no cambia nada en la parrilla.
    if (it.elegidas && it.elegidas.length) {
        detalles.push(it.elegidas.map(id => (Store.findPlato(id) || {}).nombre).join(' + '));
    }
    if (it.termino) detalles.push(`<b class="det-fuerte">${it.termino}</b>`);

    if (ESTACION === 'cocina' && it.sin && it.sin.length) {
        detalles.push(it.sin.map(g => 'sin ' + (GUARNICIONES[g] || g)).join(' · '));
    }
    if (it.nota) detalles.push(it.nota);

    return `
    <li class="ticket-item ${it.llevar ? 'llevar' : ''}">
        <span class="ti-cant">${it.cantidad}</span>
        <span class="ti-nom">
            ${it.nombre}
            ${it.llevar ? '<span class="ti-llevar">🥡 llevar</span>' : ''}
            ${detalles.length ? `<span class="ti-det">${detalles.join(' · ')}</span>` : ''}
        </span>
    </li>`;
}

/* ============================================================
   ACCIONES
   ============================================================ */

function accion(id) {
    /* El botón ni se dibuja cuando la cuenta es de mirar, pero la
       comprobación se repite aquí: el dibujo se puede editar desde el
       navegador y la decisión no puede depender de eso. Quien de verdad
       lo impide son las reglas de Firebase. */
    if (!PUEDE) { toast('Esta pantalla no es tuya: solo puedes mirarla'); return; }

    const c = Servicio.getComandas()[id];
    if (!c) return;

    if (ESTACION === 'asador') {
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
            if (audioListo()) { pitar(); toast('Así va a sonar'); }
            else toast('El navegador todavía no deja sonar. Toca la pantalla otra vez.');
        });

        const btnSalir = $('btn-salir');
        if (btnSalir) btnSalir.addEventListener('click', () => {
                if (confirm('Cerrar sesion en este celular?')) { Sync.salir(); location.reload(); }
        });

        document.addEventListener('click', e => {
            const btn = e.target.closest('[data-accion]');
            if (btn) { accion(btn.dataset.accion); return; }

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

        /* Cualquier toque sirve para desbloquear el sonido. El celular
           tambien duerme el audio al cambiar de app, asi que se vuelve a
           intentar al regresar a la pantalla. */
        ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
            window.addEventListener(ev, prepararAudio, { passive: true }));

        const cartel = $('sin-sonido');
        if (cartel) cartel.addEventListener('click', activarSonido);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) prepararAudio();
        });

        // El reloj de cada tarjeta tiene que avanzar aunque no entre nada
        setInterval(pintar, 20000);

        /* La conexión se vigila aparte y más seguido: si se cae, hay que
           decirlo en segundos, no esperar al siguiente repintado. */
        let recibiaAntes = true;
        setInterval(() => {
            const ahora = Servicio.recibiendo();
            if (ahora !== recibiaAntes) { recibiaAntes = ahora; pintar(); }
            else pintarRed();
        }, 3000);

        if (Sync.activo && Sync.haySesion()) abrirApp();
        else if (!Sync.activo) {
            $('lock-msg').textContent = 'Este local todavía no tiene la nube conectada.';
            $('lock-entrar').disabled = true;
        }
    });
}
