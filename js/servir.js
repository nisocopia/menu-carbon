/* ============================================================
   SERVIR.JS  —  La pantalla del que pone los cubiertos y lleva
                 los platos a la mesa

   ESTA PANTALLA NO TOCA EL PEDIDO. Ni uno solo de sus gestos cambia
   una comanda, una mesa o una cuenta. Dos razones:

   1. Lleva las manos ocupadas. Todo lo que le pidas tocar es tiempo
      que no está sirviendo.
   2. El pedido no es suyo. Que pueda mirarlo entero está bien; que
      pueda tocarlo, no.

   Lo único que sí puede marcar son SUS COLORES —azul cuando puso los
   cubiertos, verde cuando llevó los platos— y eso es su libreta: vive
   en este celular, no viaja a la nube y nadie más lo ve. Por eso no
   contradice lo de arriba: apuntar en tu libreta no es tocar el pedido
   de nadie.

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
        error.textContent = Sync.porQueNoEntro(e);
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
    // ¿La cocina o el asador están llamando por los cubiertos?
    if (typeof Llamada !== 'undefined') Llamada.revisar('servir');

    // Las mesas que ya cobró el mesero se llevan su color con ellas
    limpiarMarcas();

    const total  = Number(CFG.mesas) || 11;
    const turnos = Servicio.turnosDeSesion();
    const html   = [];
    let ocupadas = 0;
    let servidas = 0;

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
        /* El color es de la libreta del que sirve. Quien entre a mirar
           esta pantalla ve las mesas como siempre. */
        const paso      = puedeMarcar() ? estadoDe(sesion.id) : 0;

        ocupadas++;
        if (paso === 2) servidas++;

        html.push(`
            <button class="smesa ocupada ${CLASE_MARCA[paso] || ''}" data-mesa="${n}">
                <span class="smesa-turno">${turno || '·'}</span>
                <span class="smesa-num">${n}</span>
                <span class="smesa-cub">${cubiertos} ${cubiertos === 1 ? 'cubierto' : 'cubiertos'}</span>
                ${paso ? `<span class="smesa-marca"><i class="fas fa-${
                    paso === 2 ? 'check' : 'utensils'}"></i></span>` : ''}
            </button>`);
    }

    $('mesas').innerHTML = html.join('');
    pintarAvance(ocupadas, servidas);
    pintarLlevar(turnos);
}

/**
 * Los pedidos hechos con el boton "Pedido para llevar".
 *
 * No tienen mesa, asi que no caben en la rejilla y hasta ahora no se
 * veian por ningun lado — pero tambien llevan cubiertos y aderezos, y
 * el que sirve se los estaba encontrando de sorpresa.
 *
 * Van en la MISMA fila de turnos que las mesas, no en una aparte: es el
 * mismo trabajo y el mismo viaje a la gaveta. Ademas asi dejan de faltar
 * numeros — al llevarse el ② una funda, en la rejilla se veia el ① y el
 * ③ sin nada en medio.
 */
function pintarLlevar(turnos) {
    const caja = $('llevar');
    if (!caja) return;

    const pedidos = Servicio.llevarAbiertos();
    if (!pedidos.length) { caja.hidden = true; return; }

    caja.hidden = false;
    caja.innerHTML = `
        <h2 class="llevar-titulo"><i class="fas fa-bag-shopping"></i> Para llevar</h2>
        <div class="llevar-lista">
            ${pedidos.map(s => {
                const platos = platosDe(s.id);
                return `
                <button class="sllevar" data-sesion="${s.id}">
                    <span class="smesa-turno">${turnos[s.id] || '·'}</span>
                    <span class="sllevar-nom">${s.nombre || 'Sin nombre'}</span>
                    <span class="sllevar-platos">${platos} ${platos === 1 ? 'plato' : 'platos'}</span>
                </button>`;
            }).join('')}
        </div>`;
}

/**
 * Cuantos platos fuertes lleva la cuenta.
 *
 * No se usan los "cubiertos" a proposito: esos dejan fuera lo que va
 * para llevar —el que se lo lleva no se sienta a comer— y en una funda
 * entera darian siempre cero. Aqui lo que hace falta es saber cuanta
 * comida es.
 */
function platosDe(sesionId) {
    return Servicio.comandasDeSesion(sesionId)
        .filter(c => c.estado !== 'anulado')
        .reduce((n, c) => n + c.items.reduce((m, it) => {
            const cat = Servicio.categoriaDe(it.platoId);
            return cat && cat.cubierto ? m + it.cantidad : m;
        }, 0), 0);
}

/* ============================================================
   LO QUE YA ENTREGÓ  —  solo para la cuenta del que sirve

   Esta pantalla no manda nada a la nube y sigue sin mandarlo. Esto es
   una libreta: se guarda en ESTE celular y no lo ve nadie más. No es
   por descuido — es lo correcto. Que el mesero vea "servida" en su
   pantalla lo pondría a cobrar por lo que dice un color, y el color lo
   pone el que tiene las manos llenas de platos.

   Tres estados y se da la vuelta, porque marcar de más pasa:

       gris   todavía no le he llevado nada
       AZUL   ya tiene los cubiertos y los aderezos puestos
       VERDE  ya tiene además los platos: con esa mesa terminé

   Medio segundo apretando, no un toque: el toque corto ya servía para
   abrir el pedido y no se le puede quitar. Además una mesa no se marca
   sin querer con el dedo de paso.

   El único borrado de verdad lo hace el mesero al cobrar: la sesión se
   cierra, la mesa queda libre y su marca se va con ella. Por eso esto
   se guarda por sesión y no por número de mesa — la mesa 3 de la noche
   siguiente no hereda el verde de la de hoy.
   ============================================================ */

const LLAVE_MARCAS = 'srv_entregado';
const ESPERA_MARCA = 500;              // medio segundo, lo que pidió el salón

/* gris → azul → verde → gris */
const CLASE_MARCA = { 1: 'puesta', 2: 'servida' };

let MARCAS = {};

/** Solo la cuenta del que sirve. El gerente entra a mirar, no a marcar. */
const puedeMarcar = () => Servicio.rol() === 'servir';

function leerMarcas() {
    try { return JSON.parse(localStorage.getItem(LLAVE_MARCAS)) || {}; }
    catch (e) { return {}; }
}

function guardarMarcas() {
    try { localStorage.setItem(LLAVE_MARCAS, JSON.stringify(MARCAS)); }
    catch (e) { /* sin sitio para guardar: se pierde al recargar, no se rompe */ }
}

/**
 * En qué va esa mesa AHORA MISMO.
 *
 * El verde no es para siempre: si a una mesa ya servida le llega otra
 * tanda, baja sola a azul. Los cubiertos ya están puestos —eso no se
 * repite— pero los platos nuevos siguen en la cocina, y una mesa en
 * verde con comida esperando es justo la que se queda olvidada.
 *
 * Se calcula al pintar en vez de guardarse: así, cuando la vuelva a
 * marcar verde, se apunta la cuenta nueva de platos y no hay dos
 * verdades que puedan separarse.
 */
function estadoDe(sesionId) {
    const m = MARCAS[sesionId];
    if (!m) return 0;
    if (m.paso === 2 && platosDe(sesionId) > m.platos) return 1;
    return m.paso;
}

function avanzarMarca(sesionId) {
    const paso = (estadoDe(sesionId) + 1) % 3;

    if (!paso) delete MARCAS[sesionId];
    else MARCAS[sesionId] = { paso, platos: platosDe(sesionId), cuando: Date.now() };

    guardarMarcas();
}

/**
 * Las marcas de las mesas que ya se fueron no se quedan ocupando sitio.
 *
 * Aquí es donde ocurre el reseteo: el mesero cobra, la sesión de esa
 * mesa deja de estar abierta, y en el siguiente pintado su color
 * desaparece sin que nadie tenga que apagarlo.
 */
function limpiarMarcas() {
    const sesiones = Servicio.getSesiones();
    let sobra = false;

    Object.keys(MARCAS).forEach(id => {
        const s = sesiones[id];
        if (!s || !s.abierta) { delete MARCAS[id]; sobra = true; }
    });

    if (sobra) guardarMarcas();
}

/* ---------- Medio segundo apretando ---------- */

let pulsacion = null;
/* Al soltar después de marcar, el navegador manda además un click. Sin
   este freno, marcar la mesa abriría el pedido encima. */
let acaboDeMarcar = false;

const soltar = () => {
    if (pulsacion) clearTimeout(pulsacion.reloj);
    pulsacion = null;
};

function empezarPulsacion(e) {
    acaboDeMarcar = false;
    soltar();
    if (!puedeMarcar()) return;

    const caja = e.target.closest('.smesa.ocupada');
    if (!caja) return;

    const sesion = Servicio.sesionDeMesa(Number(caja.dataset.mesa));
    if (!sesion) return;

    pulsacion = {
        x: e.clientX, y: e.clientY,
        reloj: setTimeout(() => {
            pulsacion = null;
            acaboDeMarcar = true;
            avanzarMarca(sesion.id);
            /* Vibra para no tener que mirar: sabe que agarró mientras
               sigue caminando con la bandeja. */
            if (navigator.vibrate) navigator.vibrate(35);
            pintar();
        }, ESPERA_MARCA)
    };
}

/** Si el dedo se fue a desplazar la pantalla, no estaba marcando. */
function moverPulsacion(e) {
    if (!pulsacion) return;
    if (Math.abs(e.clientX - pulsacion.x) > 12 ||
        Math.abs(e.clientY - pulsacion.y) > 12) soltar();
}

/* ---------- Por dónde va la noche ---------- */

/**
 * "4 de 9 mesas servidas", arriba y de una línea.
 *
 * Con once cuadros en pantalla, contar los verdes de un vistazo no sale
 * bien: se cuentan dos veces los de la esquina. Y mientras no haya
 * marcado nada, en vez del contador va la única instrucción que hace
 * falta, que después se quita sola.
 */
function pintarAvance(ocupadas, servidas) {
    const caja = $('avance');
    if (!caja) return;

    if (!puedeMarcar() || !ocupadas) { caja.hidden = true; return; }

    caja.hidden = false;

    if (!Object.keys(MARCAS).length) {
        caja.className = 'srv-avance pista';
        caja.innerHTML = '<i class="fas fa-hand"></i> ' +
            'Mantén presionada una mesa medio segundo: azul cuando pongas los ' +
            'cubiertos, verde cuando lleves los platos.';
        return;
    }

    const listo = servidas === ocupadas;
    caja.className = 'srv-avance' + (listo ? ' listo' : '');
    caja.innerHTML = listo
        ? `<i class="fas fa-check-circle"></i> Las ${ocupadas} mesas ya tienen sus platos`
        : `<b>${servidas}</b> de ${ocupadas} ${ocupadas === 1 ? 'mesa servida' : 'mesas servidas'}`;
}

/* ============================================================
   QUÉ PIDIÓ ESTA MESA  —  solo para mirar
   ============================================================ */

function verMesa(n) {
    const sesion = Servicio.sesionDeMesa(n);
    if (!sesion) return;
    const cubiertos = Servicio.cubiertosDeSesion(sesion.id);
    verCuenta(sesion.id, `Mesa ${n} · ${cubiertos} ${cubiertos === 1 ? 'cubierto' : 'cubiertos'}`);
}

function verLlevar(sesionId) {
    const s = Servicio.llevarAbiertos().find(x => x.id === sesionId);
    if (!s) return;
    const platos = platosDe(sesionId);
    verCuenta(sesionId, `${s.nombre || 'Sin nombre'} · ${platos} ${platos === 1 ? 'plato' : 'platos'}`);
}

function verCuenta(sesionId, titulo) {
    const tandas = Servicio.comandasDeSesion(sesionId).filter(c => c.estado !== 'anulado');

    $('hoja-titulo').textContent = titulo;

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
                            ${Servicio.nombreDeItem(it)}
                            ${it.llevar ? '<em>🥡 para llevar</em>' : ''}
                            ${it.cambio ? `<em>${Servicio.comoSeSirve(it)}</em>` : ''}
                            ${(it.sin && it.sin.length)
                                ? `<em>sin ${it.sin.map(g => GUARNICIONES[g] || g).join(', ')}</em>` : ''}
                            ${it.termino ? `<em>${it.termino}</em>` : ''}
                        </span>
                    </li>`).join('')}
            </ul>
            ${c.nota ? `<div class="vmesa-nota">${c.nota}</div>` : ''}
        </div>`).join('')
        : '<p class="hoja-nota">Todavía no ha pedido nada.</p>';

    $('hoja-mesa').classList.add('open');
}

const cerrarMesa = () => $('hoja-mesa').classList.remove('open');

/* ============================================================
   ARRANQUE
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    CFG = Store.getConfig();
    MARCAS = leerMarcas();

    $('lock-entrar').addEventListener('click', entrar);
    $('lock-clave').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
    $('hoja-close').addEventListener('click', cerrarMesa);
    $('hoja-cerrar').addEventListener('click', cerrarMesa);
    $('hoja-mesa').addEventListener('click', e => { if (e.target.id === 'hoja-mesa') cerrarMesa(); });

    $('btn-salir').addEventListener('click', () => {
        if (confirm('¿Cerrar sesión en este celular?')) { Sync.salir(); location.reload(); }
    });

    /* MEDIO SEGUNDO APRETANDO MARCA LA MESA.

       Se escucha en el documento y no en la rejilla por dos razones.
       Una: los cuadros se vuelven a dibujar enteros con cada cambio, y
       un listener puesto en uno se perdería en el siguiente pintado.
       Dos: el freno del click hay que soltarlo apriete donde apriete.
       Escuchando solo la rejilla, marcar una mesa y después tocar una
       funda se comía ese toque. */
    document.addEventListener('pointerdown', empezarPulsacion);
    document.addEventListener('pointermove', moverPulsacion);
    ['pointerup', 'pointercancel', 'pointerleave']
        .forEach(ev => document.addEventListener(ev, soltar));
    /* Sin esto, al medio segundo el navegador saca su propio menú de
       copiar y compartir justo encima de la mesa que se está marcando. */
    $('mesas').addEventListener('contextmenu', e => { if (puedeMarcar()) e.preventDefault(); });

    document.addEventListener('click', e => {
        // Acaba de marcar: ese click cierra la pulsación, no es un toque
        if (acaboDeMarcar) { acaboDeMarcar = false; return; }

        const mesa = e.target.closest('[data-mesa]');
        if (mesa) return verMesa(Number(mesa.dataset.mesa));

        const llevar = e.target.closest('[data-sesion]');
        if (llevar) verLlevar(llevar.dataset.sesion);
    });

    // La conexión se vigila aunque no cambie nada
    setInterval(pintarRed, 3000);

    if (Sync.activo && Sync.haySesion()) abrirApp();
    else if (!Sync.activo) {
        $('lock-msg').textContent = 'Este local todavía no tiene la nube conectada.';
        $('lock-entrar').disabled = true;
    }
});
