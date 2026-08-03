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

function pitar() {
    if (!sonido) return;
    try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();

        // Dos notas cortas: se distingue del ruido de la cocina
        [0, 0.18].forEach((retraso, i) => {
            const osc = audio.createOscillator();
            const vol = audio.createGain();
            osc.type = 'sine';
            osc.frequency.value = i ? 1046 : 784;
            vol.gain.setValueAtTime(0.0001, audio.currentTime + retraso);
            vol.gain.exponentialRampToValueAtTime(0.35, audio.currentTime + retraso + 0.02);
            vol.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + retraso + 0.16);
            osc.connect(vol).connect(audio.destination);
            osc.start(audio.currentTime + retraso);
            osc.stop(audio.currentTime + retraso + 0.18);
        });
    } catch (e) { /* si el navegador no deja sonar, queda el aviso visual */ }
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

function abrirApp() {
    $('lock').hidden = true;
    // La primera pulsación es la que le da permiso al navegador para sonar
    pitar();
    Servicio.limpiarViejo(2);
    Servicio.iniciar(pintar);
    pintar();
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
    if (!Servicio.recibiendo()) {
        el.className = 'srv-red caido';
        el.innerHTML = `<i class="fas fa-plug-circle-xmark"></i> SIN RECIBIR`;
        document.body.classList.add('desconectado');
        return;
    }

    document.body.classList.remove('desconectado');
    el.className = 'srv-red ' + (faltan ? 'caido' : 'ok');
    el.title = faltan ? Servicio.porQueNoSale() : '';
    el.innerHTML = faltan
        ? `<i class="fas fa-triangle-exclamation"></i> ${faltan} sin enviar`
        : `<i class="fas fa-circle"></i>`;
}

/** Hace cuántos minutos entró el pedido. */
const minutosDe = c => Math.floor((Date.now() - c.creado) / 60000);

function pintar() {
    pintarRed();

    const todas = Servicio.comandasDe(ESTACION);

    // La parrilla deja para el final lo que es solo para llevar: así sale
    // caliente cuando el de la mesa ya está comiendo.
    const esDiferido = c => ESTACION === 'asador' && c.items.every(it => it.llevar);

    const activas   = todas.filter(c => !c.sacado && !esDiferido(c));
    const diferidas = todas.filter(c => !c.sacado && esDiferido(c));
    const sacadas   = todas.filter(c => c.sacado);

    // Sonar solo por lo que no habíamos visto
    const nuevas = todas.filter(c => !vistas.has(c.id));
    if (nuevas.length && vistas.size) pitar();
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

    // Lo que el asador ya sacó se pliega abajo, no se borra: si preguntan
    // "¿ya saliste con la mesa 3?", ahí está.
    const caja = $('sacadas-caja');
    if (caja && ESTACION === 'asador') {
        caja.hidden = !sacadas.length;
        $('sacadas-n').textContent = sacadas.length;
        $('sacadas').innerHTML = sacadas.map(tarjeta).join('');
    }
}

/* ---------- Una tarjeta ---------- */

function tarjeta(c) {
    const min  = minutosDe(c);
    const hora = new Date(c.creado).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

    // El color avisa sin que nadie tenga que mirar el reloj
    const urgencia = min >= 25 ? 'roja' : min >= 15 ? 'ambar' : '';

    return `
    <article class="ticket ${urgencia} ${c.sacado ? 'sacada' : ''}" data-id="${c.id}">
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

        <button class="ticket-btn" data-accion="${c.id}">
            ${ESTACION === 'asador'
                ? (c.sacado ? '<i class="fas fa-rotate-left"></i> Devolver' : '<i class="fas fa-check"></i> Ya lo saqué')
                : '<i class="fas fa-check"></i> ENTREGADO'}
        </button>
    </article>`;
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
    const c = Servicio.getComandas()[id];
    if (!c) return;

    if (ESTACION === 'asador') {
        Servicio.marcarSacado(id, !c.sacado);
        toast(c.sacado ? 'Vuelve a la parrilla' : Servicio.etiquetaDe(c) + ' sacado');
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
