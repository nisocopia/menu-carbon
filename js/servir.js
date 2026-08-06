/* ============================================================
   SERVIR.JS  —  La pantalla del que pone los cubiertos y lleva
                 los platos a la mesa

   Es la única pantalla del sistema que NO TIENE UN SOLO BOTÓN QUE
   CAMBIE ALGO. Dos razones:

   1. Lleva las manos ocupadas. Todo lo que le pidas tocar es tiempo
      que no está sirviendo.
   2. El pedido no es suyo. Que pueda mirarlo entero está bien; que
      pueda tocarlo, no.

   Lo que sí necesita es leerse de lejos: la pantalla de la cocina le
   quedaba a tres metros y es un celular. Por eso las once mesas caben
   de un vistazo y los números son grandes.

   EL TURNO reemplaza a marcar los cubiertos. Si va por el ⑧, del ① al
   ⑦ ya están puestos — sin decírselo al sistema. Y no se renumera
   cuando una mesa se va: si la ① paga, la ② sigue siendo la ②.
   ============================================================ */

let CFG = {};

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

function negarPaso() {
    const quien = Sync.correoSesion ? Sync.correoSesion() : '';
    Sync.salir();
    $('lock').hidden = false;
    $('lock-error').textContent = quien
        ? `${quien} no es la cuenta de esta pantalla. Entra con la que le toca.`
        : 'Esa cuenta no está en la lista del equipo del local.';
}

function abrirApp() {
    if (Servicio.permisoEn('servir') === 'no') { negarPaso(); return; }

    $('lock').hidden = true;
    Servicio.limpiarViejo(2);
    Servicio.iniciar(pintar, 'servir');
    pintar();
    ocultarLoQueNoPuede();
}

/** Los enlaces a pantallas que su cuenta no puede abrir se esconden. */
function ocultarLoQueNoPuede() {
    document.querySelectorAll('.srv-links a').forEach(a => {
        const destino = a.getAttribute('href') || '';
        const pantalla = destino.includes('comanda')  ? 'comanda'
                       : destino.includes('parrilla') ? 'asador'
                       : destino.includes('cocina')   ? 'cocina' : null;
        if (pantalla) a.hidden = Servicio.permisoEn(pantalla) === 'no';
    });
}

/* ============================================================
   ESTADO DE LA CONEXIÓN
   ============================================================ */

function pintarRed() {
    const el = $('red');
    if (!el) return;

    const recibiendo = Servicio.recibiendo();
    el.className = 'srv-red ' + (recibiendo ? 'ok' : 'caido');
    el.innerHTML = recibiendo
        ? '<i class="fas fa-circle"></i>'
        : '<i class="fas fa-plug-circle-xmark"></i> SIN RECIBIR';

    document.body.classList.toggle('desconectado', !recibiendo);

    /* Una pantalla desconectada se ve igual que un local vacío: todas
       las mesas libres. Hay que decirlo o le va a creer. */
    const caja = $('alarma');
    if (!caja) return;

    if (recibiendo) { caja.hidden = true; return; }

    caja.hidden = false;
    caja.innerHTML = `
        <strong><i class="fas fa-triangle-exclamation"></i> No está llegando nada</strong>
        <span>${Servicio.porQueNoSale() ||
            'Puede haber mesas ocupadas que esta pantalla no ve. Pregunta antes de dar por hecho que están libres.'}</span>`;
}

/* ============================================================
   LAS ONCE MESAS
   ============================================================ */

function pintar() {
    pintarRed();

    const total  = Number(CFG.mesas) || 11;
    const turnos = Servicio.turnosDeSesion();
    const html   = [];

    for (let n = 1; n <= total; n++) {
        const sesion = Servicio.sesionDeMesa(n);

        if (!sesion) {
            html.push(`
                <div class="smesa">
                    <span class="smesa-num">${n}</span>
                    <span class="smesa-libre">libre</span>
                </div>`);
            continue;
        }

        const cubiertos = Servicio.cubiertosDeSesion(sesion.id);
        const turno     = turnos[sesion.id];

        html.push(`
            <button class="smesa ocupada" data-mesa="${n}">
                <span class="smesa-turno">${turno || '·'}</span>
                <span class="smesa-num">${n}</span>
                <span class="smesa-cub">${cubiertos} ${cubiertos === 1 ? 'cubierto' : 'cubiertos'}</span>
            </button>`);
    }

    $('mesas').innerHTML = html.join('');
}

/* ============================================================
   QUÉ PIDIÓ ESTA MESA  —  solo para mirar
   ============================================================ */

function verMesa(n) {
    const sesion = Servicio.sesionDeMesa(n);
    if (!sesion) return;

    const tandas = Servicio.comandasDeSesion(sesion.id).filter(c => c.estado !== 'anulado');
    const cubiertos = Servicio.cubiertosDeSesion(sesion.id);

    $('hoja-titulo').textContent = `Mesa ${n} · ${cubiertos} ${cubiertos === 1 ? 'cubierto' : 'cubiertos'}`;

    $('hoja-cuerpo').innerHTML = tandas.length ? tandas.map(c => `
        <div class="vmesa-tanda ${c.estado === 'entregado' ? 'servida' : ''}">
            <div class="vmesa-top">
                <strong>${c.codigo || Servicio.codigoDe(c)}</strong>
                <span>${c.estado === 'entregado' ? 'ya salió' : 'en preparación'}</span>
            </div>
            <ul class="vmesa-items">
                ${c.items.map(it => `
                    <li>
                        <span class="vmesa-cant">${it.cantidad}</span>
                        <span>
                            ${it.nombre}
                            ${it.llevar ? '<em>🥡 para llevar</em>' : ''}
                            ${(it.sin && it.sin.length)
                                ? `<em>sin ${it.sin.map(g => GUARNICIONES[g] || g).join(', ')}</em>` : ''}
                            ${it.termino ? `<em>${it.termino}</em>` : ''}
                        </span>
                    </li>`).join('')}
            </ul>
            ${c.nota ? `<div class="vmesa-nota">${c.nota}</div>` : ''}
        </div>`).join('')
        : '<p class="hoja-nota">Esta mesa todavía no ha pedido nada.</p>';

    $('hoja-mesa').classList.add('open');
}

const cerrarMesa = () => $('hoja-mesa').classList.remove('open');

/* ============================================================
   ARRANQUE
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    CFG = Store.getConfig();

    $('lock-entrar').addEventListener('click', entrar);
    $('lock-clave').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
    $('hoja-close').addEventListener('click', cerrarMesa);
    $('hoja-cerrar').addEventListener('click', cerrarMesa);
    $('hoja-mesa').addEventListener('click', e => { if (e.target.id === 'hoja-mesa') cerrarMesa(); });

    $('btn-salir').addEventListener('click', () => {
        if (confirm('¿Cerrar sesión en este celular?')) { Sync.salir(); location.reload(); }
    });

    document.addEventListener('click', e => {
        const mesa = e.target.closest('[data-mesa]');
        if (mesa) verMesa(Number(mesa.dataset.mesa));
    });

    // La conexión se vigila aunque no cambie nada
    setInterval(pintarRed, 3000);

    if (Sync.activo && Sync.haySesion()) abrirApp();
    else if (!Sync.activo) {
        $('lock-msg').textContent = 'Este local todavía no tiene la nube conectada.';
        $('lock-entrar').disabled = true;
    }
});
