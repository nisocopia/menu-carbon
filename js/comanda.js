/* ============================================================
   COMANDA.JS  —  La pantalla del que toma el pedido

   Reemplaza el cuaderno. Lo que se escribe aquí sale al mismo tiempo
   a la parrilla y a la cocina, sin caminar hasta ninguna de las dos.

   Está pensada para escribir, no para tocar: "3p 2c" es un pedido de
   3 pollos y 2 carnes. Tocar botones también funciona, pero es el
   camino lento, y el papel se gana por velocidad o no se gana.
   ============================================================ */

let CFG = {};

/**
 * En qué cuenta se está trabajando. Una cuenta es lo que se cobra
 * junto, y puede ser de dos clases:
 *
 *     { mesa: 3 }              una mesa
 *     { sesion: 'abc' }        un pedido para llevar que ya tiene nombre
 *     { nuevoLlevar: true }    uno que se está armando y todavía no lo tiene
 *
 * Todo lo de abajo trabaja con esta referencia y no pregunta de qué
 * clase es. Por eso la pantalla de cobrar, las tandas previas y la
 * cuenta son las mismas para la mesa y para el pedido de Carlos.
 */
let refActual    = null;
let nombreLlevar = '';       // lo que se está escribiendo en "nombre del pedido"

let borrador    = [];        // la tanda que se está armando
let editando    = null;      // uid del ítem abierto en la hoja de modificar
let editandoTanda = null;    // { id, modo } cuando se está corrigiendo una tanda ya enviada
let seleccion   = new Map(); // lo que se va a cobrar

/** La referencia que entiende Servicio; null mientras el pedido no tenga nombre. */
const ref = () => (refActual && !refActual.nuevoLlevar) ? refActual : null;

const esLlevar = () => !!(refActual && (refActual.sesion || refActual.nuevoLlevar));

const money = n => (CFG.moneda || '$') + Number(n || 0).toFixed(2);
const tienePrecio = p => typeof p.precio === 'number' && !isNaN(p.precio);
/** Sin tildes y en minúscula: "camarón" y "camaron" tienen que encontrarse igual. */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const $ = id => document.getElementById(id);

function toast(texto) {
    const t = $('toast');
    t.textContent = texto;
    t.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('visible'), 2600);
}

/**
 * Avisa que una comanda salió, pero solo si de verdad salió. Decir
 * "enviado" cuando está atorada en la cola sería lo peor que puede
 * hacer este sistema: uno se queda tranquilo y la cocina nunca se
 * entera.
 */
function avisarEnviada(comanda) {
    const codigo = comanda.codigo || Servicio.codigoDe(comanda);
    toast(Servicio.hayLinea()
        ? codigo + ' enviado'
        : codigo + ' anotado — SIN RED, la cocina todavía no lo ve');
}

/* ============================================================
   1. ENTRAR
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
 * Tomar pedidos y cobrar es del mesero y del gerente. La cocina y la
 * parrilla tienen cuenta del local, pero eso no las hace meseros: con
 * el correo de la cocina se entraba aquí y se podía anotar y cobrar.
 *
 * Se le dice cuál es su pantalla, no solo que no puede.
 */
function negarPaso() {
    const quien = Sync.correoSesion ? Sync.correoSesion() : '';
    const suya = { cocina: 'cocina.html', parrilla: 'parrilla.html' }[Servicio.rol()];
    Sync.salir();
    $('lock').hidden = false;
    $('lock-error').textContent = quien
        ? `${quien} no toma pedidos.` + (suya ? ` Tu pantalla es ${suya}.` : '')
        : 'Esa cuenta no está en la lista del equipo del local.';
}

function abrirApp() {
    /* El asador entra a anotar: le llegan pedidos directos y tiene que
       poder tomarlos sin ir a buscar al mesero. Cobrar es otra cosa —
       eso lo filtra puedeCobrar() en cada botón de dinero. */
    if (!Servicio.puedeAnotar()) { negarPaso(); return; }

    $('lock').hidden = true;
    ajustarSegunPermiso();
    Servicio.limpiarViejo(2);
    Servicio.iniciar(redibujar);
    verMesas();
}

/** Fuera los enlaces a pantallas que esta cuenta no puede abrir. */
function ajustarSegunPermiso() {
    document.querySelectorAll('.srv-links a[href]').forEach(a => {
        const destino = a.getAttribute('href') || '';
        if (destino.includes('panel')) { a.hidden = Servicio.rol() !== 'gerente'; return; }
        const pantalla = destino.includes('parrilla') ? 'asador'
                       : destino.includes('cocina')   ? 'cocina' : null;
        if (pantalla) a.hidden = Servicio.permisoEn(pantalla) === 'no';
    });
}

/* ============================================================
   2. ESTADO DE LA CONEXIÓN

   Si algo no salió, se ve en rojo con la cuenta de lo que falta.
   Nadie debe poder creer que la cocina ya lo tiene cuando no.
   ============================================================ */

function pintarRed() {
    const el = $('red');
    const faltan = Servicio.pendientes();

    if (faltan) {
        el.className = 'srv-red caido';
        el.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${faltan} sin enviar`;
    } else {
        el.className = 'srv-red ok';
        el.innerHTML = `<i class="fas fa-circle"></i>`;
    }

    pintarAlarma(faltan);
}

/**
 * El motivo va a la vista, no escondido detrás de un toque. Cuando algo
 * no sale hay que poder leer por qué sin buscarlo: al que está de pie
 * con la cocina esperando no se le puede pedir que investigue.
 */
function pintarAlarma(faltan) {
    const caja = $('alarma');
    if (!caja) return;

    const rechazadas = Servicio.apartadas();
    if (!faltan && !rechazadas) { caja.hidden = true; return; }

    const quien = (typeof Sync !== 'undefined' && Sync.correoSesion) ? Sync.correoSesion() : '';
    caja.hidden = false;

    if (faltan) {
        caja.innerHTML = `
            <strong><i class="fas fa-triangle-exclamation"></i> ${faltan} sin enviar</strong>
            <span>${Servicio.porQueNoSale() || 'Sin detalle todavía.'}</span>
            ${quien ? `<small>Entraste como ${quien}</small>` : ''}
            <small>Lo que anotaste no se pierde: sale solo en cuanto se resuelva.</small>`;
        return;
    }

    /* Lo que la nube rechazó ya no se reintenta y no traba lo demás,
       pero tampoco se tira sin que nadie lo vea. */
    const cuales = Servicio.detalleApartado().slice(0, 6).join(' · ');
    caja.innerHTML = `
        <strong><i class="fas fa-ban"></i> ${rechazadas} que la nube rechaza</strong>
        <span>No van a salir con esta cuenta. Casi siempre son de cuando
              este celular se usó con otro correo.</span>
        ${cuales ? `<span>${cuales}</span>` : ''}
        ${quien ? `<small>Entraste como ${quien}</small>` : ''}
        <span class="srv-alarma-btns">
            <button data-rechazadas="descartar">Descartar</button>
            <button data-rechazadas="reintentar">Reintentar</button>
        </span>`;
}

function resolverRechazadas(que) {
    if (que === 'reintentar') { Servicio.reintentarApartado(); toast('Reintentando…'); return; }
    const n = Servicio.apartadas();
    if (!confirm(`¿Descartar ${n} cosa(s) que la nube rechaza?\n\n` +
                 `Si alguna era un pedido de verdad, la cocina nunca lo vio ` +
                 `y hay que volver a anotarlo.`)) return;
    Servicio.descartarApartado();
    toast('Descartado');
}

/* ============================================================
   3. VISTA: LAS MESAS
   ============================================================ */

function verMesas() {
    mostrarVista('mesas');
    $('titulo').textContent = 'Mesas';
    $('volver').hidden = true;
    pintarEntrantes();
    pintarMesas();
}

/**
 * Los pedidos que mandaron los comensales desde su celular.
 * Se confirman de un toque: recién ahí salen a la parrilla y a la
 * cocina. Es el mismo gesto de hoy, cuando el comensal levanta la
 * mano y uno se acerca — solo que ya no hay que escribirlo.
 */
function pintarEntrantes() {
    const lista = Servicio.getEntrantes();
    const cont = $('entrantes');

    if (!lista.length) { cont.innerHTML = ''; return; }

    cont.innerHTML = `
        <div class="entrantes">
            <h2 class="entrantes-titulo">
                <i class="fas fa-hand"></i>
                ${lista.length} pedido${lista.length > 1 ? 's' : ''} desde la mesa
            </h2>
            ${lista.map(e => {
                const total = e.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
                const espera = Math.round((Date.now() - e.creado) / 60000);
                return `
                <div class="entrante">
                    <div class="entrante-top">
                        <strong>${e.mesa ? 'Mesa ' + e.mesa : 'Sin mesa'}</strong>
                        <span>hace ${espera} min · ${money(total)}</span>
                    </div>
                    <div class="entrante-items">
                        ${e.items.map(i => `${i.cantidad} ${i.nombre}`).join(' · ')}
                    </div>
                    ${e.nota ? `<div class="entrante-nota">${e.nota}</div>` : ''}
                    <div class="entrante-btns">
                        <button class="btn-descartar" data-descartar="${e.llave}">Descartar</button>
                        <button class="btn-confirmar-e" data-confirmar="${e.llave}">
                            <i class="fas fa-check"></i> Confirmar y enviar
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

function pintarMesas() {
    const total = Number(CFG.mesas) || 11;
    const html = [];

    for (let n = 1; n <= total; n++) {
        const sesion = Servicio.sesionDeMesa(n);
        // La cuenta es de la MESA: si por lo que sea quedó con dos
        // sesiones abiertas, aquí salen las dos sumadas y no se pierde
        // de vista lo que comió nadie.
        const cuenta = sesion ? Servicio.cuentaDe({ mesa: n }) : null;
        const ocupada = !!sesion;

        // Cuánto lleva sentada la mesa: ayuda a saber a quién atender
        const desde = sesion ? Math.round((Date.now() - sesion.creado) / 60000) : 0;

        html.push(`
            <button class="mesa ${ocupada ? 'ocupada' : ''}" data-mesa="${n}">
                <span class="mesa-num">${n}</span>
                ${ocupada
                    ? `<span class="mesa-saldo">${money(cuenta.saldo)}</span>
                       <span class="mesa-tiempo">${desde} min</span>`
                    : `<span class="mesa-libre">libre</span>`}
            </button>`);
    }

    $('mesas-grid').innerHTML = html.join('');
    pintarLlevar();
}

/**
 * Los pedidos para llevar que están en marcha, justo debajo del botón
 * de "Para llevar".
 *
 * Antes no se veían por ninguna parte: se mandaban y desaparecían de la
 * pantalla, así que nadie podía responder "¿el de Carlos ya salió?" sin
 * ir a preguntar a la cocina. Ahora se leen como mesas, porque para el
 * mesero son exactamente eso: cuentas abiertas que hay que cerrar.
 */
function pintarLlevar() {
    const cont = $('llevar-abiertos');
    if (!cont) return;

    const abiertos = Servicio.llevarAbiertos();
    if (!abiertos.length) { cont.innerHTML = ''; return; }

    cont.innerHTML = `
        <h2 class="llevar-titulo">
            <i class="fas fa-bag-shopping"></i>
            ${abiertos.length} para llevar sin cobrar
        </h2>
        <div class="llevar-lista">
            ${abiertos.map(s => {
                const cuenta = Servicio.cuentaDe({ sesion: s.id });
                const desde  = Math.round((Date.now() - s.creado) / 60000);
                return `
                <button class="llevar-card" data-sesion="${s.id}">
                    <span class="llevar-nombre">${s.nombre || 'Sin nombre'}</span>
                    <span class="llevar-saldo">${money(cuenta.saldo)}</span>
                    <span class="llevar-tiempo">${desde} min</span>
                </button>`;
            }).join('')}
        </div>`;
}

/* ============================================================
   4. VISTA: TOMAR EL PEDIDO
   ============================================================ */

function abrirCuenta(nueva) {
    refActual = nueva;
    borrador = [];
    editandoTanda = null;
    if (nueva.nuevoLlevar) nombreLlevar = '';

    mostrarVista('mesa');
    $('titulo').textContent = nueva.nuevoLlevar ? 'Para llevar' : Servicio.nombreDeCuenta(nueva);
    $('volver').hidden = false;
    pintarRapidos();
    pintarTodoElMenu();
    pintarMesa();
    $('tecleo').value = '';
    $('tecleo-lectura').innerHTML = '';
}

const verMesa       = n  => abrirCuenta({ mesa: n });
const verLlevar     = id => abrirCuenta({ sesion: id });
const verLlevarNuevo = () => abrirCuenta({ nuevoLlevar: true });

function pintarMesa() {
    pintarTandasPrevias();
    pintarBorrador();
}

/* ---------- Lo que esta cuenta ya mandó ---------- */

function pintarTandasPrevias() {
    const cont = $('tandas-previas');
    const r = ref();

    if (!r || !Servicio.sesionesDe(r).length) { cont.innerHTML = ''; return; }

    const tandas = Servicio.tandasDe(r).filter(c => c.estado !== 'anulado');
    const cuenta = Servicio.cuentaDe(r);

    if (!tandas.length) { cont.innerHTML = ''; return; }

    const esMesa = !!r.mesa;

    cont.innerHTML = `
        <div class="previas">
            ${tandas.map(previaHtml).join('')}

            <div class="previa-cuenta">
                <span>${esMesa ? 'Cuenta de la mesa' : 'Cuenta de ' + Servicio.nombreDeCuenta(r)}</span>
                <strong>${money(cuenta.saldo)}</strong>
                ${Servicio.puedeCobrar() ? `
                    <button class="btn-cobrar-abrir" data-cobrar="1">
                        <i class="fas fa-cash-register"></i> Cobrar
                    </button>` : ''}
            </div>

            ${Servicio.puedeCobrar() ? `
                ${esMesa ? `
                    <button class="btn-mover" data-mover="${r.mesa}">
                        <i class="fas fa-right-left"></i> Cambiar de mesa
                    </button>` : ''}
                <button class="btn-mover" data-tipo="1">
                    <i class="fas fa-${esMesa ? 'box' : 'chair'}"></i>
                    ${esMesa ? 'Pasarlo a para llevar' : 'Sentarlo en una mesa'}
                </button>` : ''}
        </div>`;
}

/**
 * Una tanda ya enviada, con lo que todavía se le puede hacer.
 *
 * Los botones no aparecen "por si acaso": si el asador ya sacó la
 * carne, el de anular no se dibuja y en su lugar se lee por qué. Un
 * botón que rebota enseña a desconfiar de la pantalla.
 */
function previaHtml(c) {
    const modo   = Servicio.edicionDe(c);
    const quedan = Servicio.graciaRestante(c);
    const anular = Servicio.puedeAnular(c);

    return `
        <div class="previa ${c.estado === 'entregado' ? 'entregada' : ''}">
            <div class="previa-top">
                <strong>${c.codigo || Servicio.codigoDe(c)}</strong>
                <span class="previa-estado">
                    ${c.estado === 'entregado' ? 'Entregado' : c.sacado ? 'Ya salió' : 'En preparación'}
                </span>
            </div>
            <div class="previa-items">${c.items.map(lineaCorta).join(' · ')}</div>

            ${modo === 'todo' ? `
                <div class="previa-gracia">
                    <i class="fas fa-stopwatch"></i>
                    Se puede corregir entero <b>${quedan}s</b>
                </div>` : ''}

            <div class="previa-btns">
                ${modo !== 'no' ? `
                    <button class="previa-editar" data-editar="${c.id}">
                        <i class="fas fa-pen"></i>
                        ${modo === 'todo' ? 'Editar'
                          /* Ya servida: lo que se puede es CAMBIAR la bebida que
                             la mesa ya no quiere, no solo sumar otra. */
                          : c.estado === 'entregado' ? 'Cambiar bebida o porción'
                          : 'Agregar bebida o porción'}
                    </button>` : ''}
                ${anular.ok
                    ? `<button class="previa-anular" data-anular="${c.id}">Anular</button>`
                    : (c.estado !== 'entregado'
                        ? `<span class="previa-nopuede">${anular.motivo}</span>` : '')}
            </div>
        </div>`;
}

const lineaCorta = it =>
    `${it.cantidad} ${Servicio.nombreDeItem(it)}${it.llevar ? ' 🥡' : ''}`;

/* ---------- Escritura rápida ---------- */

/* ---------- Lo que hay ----------

   Un plato se puede pedir si tiene producto en la nevera Y no lo apagó
   el gerente a mano. Se pregunta en un solo sitio para que las cuatro
   listas de esta pantalla digan lo mismo. */

/**
 * Lo que el pedido a medio escribir ya tiene apartado.
 *
 * Sin esto, con tres pollos en la nevera el mesero podía escribir "5p"
 * y el sistema lo dejaba: los pollos no se descuentan hasta enviar. El
 * borrador tiene que contar como si ya estuviera mandado — el cliente ya
 * lo pidió, aunque el papel todavía no haya salido.
 */
function apartadoEnBorrador() {
    const m = {};
    const sumar = (it, signo) => {
        const c = Servicio.consumoDe(it);
        Object.keys(c).forEach(k => { m[k] = (m[k] || 0) + signo * c[k]; });
    };

    borrador.forEach(it => sumar(it, +1));

    /* Lo que ya venía en la tanda que se está corrigiendo ya está
       contado en las comandas. Sin descontarlo, abrir una tanda de tres
       pollos para cambiarle una nota dejaría el pollo en cero. */
    if (editandoTanda) {
        const c = Servicio.getComandas()[editandoTanda.id];
        (c && c.items ? c.items : []).forEach(it => sumar(it, -1));
    }
    return m;
}

/** Cuántos quedan de verdad: los de la nevera menos los del borrador. */
function quedanDe(p) {
    const base = Servicio.quedanDePlato(p.id);
    if (base === null) return null;
    return Math.max(0, base - (apartadoEnBorrador()[Servicio.productoDe(p.id)] || 0));
}

const seVende = p =>
    tienePrecio(p) && Servicio.sePuedePedir(p.id) && quedanDe(p) !== 0;

/**
 * El aviso de "va quedando poco", para que el mesero lo diga en la mesa
 * antes de que el cliente se ilusione. Desde 5 hacia abajo: más arriba
 * es ruido, y en una mesa de seis un "quedan 5" ya es una conversación.
 */
function avisoDeStock(p) {
    const q = quedanDe(p);
    if (q === null || q > 5) return '';
    return q === 0
        ? '<span class="poco agotado-ya">se acabó</span>'
        : `<span class="poco">quedan ${q}</span>`;
}

/** Busca el plato que el mesero quiso escribir. */
function buscarPlato(clave) {
    const platos = Store.getPlatos().filter(p => tienePrecio(p));
    const c = norm(clave);

    return platos.find(p => p.atajo === c)
        || platos.find(p => p.atajo && p.atajo.startsWith(c))
        || platos.find(p => norm(p.nombre).startsWith(c))
        || platos.find(p => norm(p.nombre).split(/\s+/).some(w => w.startsWith(c)))
        || platos.find(p => norm(p.nombre).includes(c))
        || null;
}

/**
 * "3p 2c" → 3 Pollo Asado + 2 Carne Asada.
 * El número va adelante; sin número es uno solo.
 */
function interpretar(texto) {
    return String(texto).trim().split(/[\s,.+]+/).filter(Boolean).map(token => {
        const m = token.match(/^(\d*)(.*)$/);
        const cantidad = m[1] ? parseInt(m[1], 10) : 1;
        const clave = m[2];

        if (!clave || cantidad < 1 || cantidad > 50) return { token, error: true };
        const plato = buscarPlato(clave);
        if (!plato) return { token, error: true };

        /* Se acabó no es lo mismo que no existe. Al mesero hay que
           decirle cuál de las dos cosas es: una la arregla escribiendo
           bien, la otra no la arregla nadie. */
        if (!seVende(plato)) return { token, plato, cantidad, sinStock: true };

        /* Y si pide más de los que hay, se avisa MIENTRAS ESCRIBE. Leer
           "2 × Pollo Apanado" y que después entre uno solo es peor que
           no haber leído nada. */
        const hay = quedanDe(plato);
        if (hay !== null && cantidad > hay) return { token, plato, cantidad, tope: hay };

        return { token, plato, cantidad };
    });
}

function leerTecleo() {
    const texto = $('tecleo').value;
    const cont = $('tecleo-lectura');

    if (!texto.trim()) { cont.innerHTML = ''; return; }

    cont.innerHTML = interpretar(texto).map(r => r.error
        ? `<span class="lee mal">“${r.token}” no existe</span>`
        : r.sinStock
            ? `<span class="lee mal">${r.plato.nombre}: se acabó</span>`
            : r.tope !== undefined
                ? `<span class="lee mal">${r.plato.nombre}: solo quedan ${r.tope}</span>`
                : `<span class="lee bien">${r.cantidad} × ${r.plato.nombre}</span>`
    ).join('');
}

function agregarDesdeTecleo() {
    const texto = $('tecleo').value;
    if (!texto.trim()) return;

    const leido = interpretar(texto);
    const malos = leido.filter(r => r.error);

    if (malos.length) {
        toast('No entendí: ' + malos.map(m => m.token).join(', '));
        return;
    }

    const sinStock = leido.filter(r => r.sinStock);
    if (sinStock.length) {
        toast('Se acabó: ' + sinStock.map(m => m.plato.nombre).join(', '));
        return;
    }

    leido.forEach(r => agregarAlBorrador(r.plato, r.cantidad));
    $('tecleo').value = '';
    $('tecleo-lectura').innerHTML = '';
    $('tecleo').focus();
}

/* ---------- Botones ---------- */

function pintarRapidos() {
    // Lo que más sale: la parrilla entera y los jugos de la casa
    const platos = Store.getMenu()
        .filter(c => c.id === 'parrillas' || c.id === 'mixtos')
        .flatMap(c => c.platos)
        .filter(p => tienePrecio(p) && !p.agotado);

    const jugos = Store.getPlatos().filter(p => p.destacado && p.id.startsWith('b') && !p.agotado);

    /* Lo que se acabó NO se esconde: se apaga. Un botón que desaparece
       deja al mesero buscándolo en la lista larga; uno apagado le dice
       en la mesa que ya no hay, que es lo que tiene que contestar. */
    $('rapidos').innerHTML =
        [...platos, ...jugos].map(p => `
            <button class="rapido ${seVende(p) ? '' : 'sin-stock'}" data-plato="${p.id}"
                    ${seVende(p) ? '' : 'disabled'}>
                <span class="rapido-nom">${Servicio.nombreInterno(p.id, p.nombre)}</span>
                <span class="rapido-pre">${avisoDeStock(p) || money(p.precio)}</span>
            </button>`).join('') +
        `<button class="rapido otra" id="btn-otra-bebida">
            <span class="rapido-nom"><i class="fas fa-plus"></i> Otra bebida</span>
            <span class="rapido-pre">de la tienda</span>
         </button>`;
}

function pintarTodoElMenu() {
    $('todo-menu-lista').innerHTML = Store.getMenu().map(cat => {
        const platos = cat.platos.filter(p => tienePrecio(p) && !p.agotado);
        if (!platos.length) return '';
        return `
            <div class="tm-cat">
                <h3>${cat.nombre}</h3>
                ${platos.map(p => `
                    <button class="tm-plato ${seVende(p) ? '' : 'sin-stock'}" data-plato="${p.id}"
                            ${seVende(p) ? '' : 'disabled'}>
                        <span>${Servicio.nombreInterno(p.id, p.nombre)}</span>
                        <span class="tm-pre">${avisoDeStock(p) || money(p.precio)}</span>
                    </button>`).join('')}
            </div>`;
    }).join('');
}

/* ---------- El borrador ---------- */

/* Antes, pasado el minuto, aquí solo se dejaban meter bebidas y
   porciones: cualquier otra cosa se rechazaba con un aviso. Era lo
   único que se podía hacer mientras un agregado se guardaba encima del
   ticket que la cocina ya tenía. Ahora lo que hay que cocinar sale como
   tanda nueva y hace su turno, así que se puede pedir de todo a
   cualquier hora — que es lo que pasa en el salón. */

function agregarAlBorrador(plato, cantidad) {
    /* El último candado. Los botones ya salen apagados, pero al pedido
       se llega por cuatro caminos —tecleo, botón rápido, menú largo,
       sugerencia— y este es el único por el que pasan todos.

       SE PONE LO QUE HAYA, no se rechaza el renglón entero. Pedir 2 con
       uno disponible dejaba el pedido igual que estaba: el mesero tocaba
       y no pasaba nada, y el aviso se iba solo antes de que lo leyera.
       Ahora entra el que hay y se dice en voz alta cuántos entraron. */
    let piden = cantidad || 1;
    const quedan = quedanDe(plato);
    const producto = Servicio.nombreProducto(Servicio.productoDe(plato.id)).toLowerCase();

    if (!Servicio.sePuedePedir(plato.id) || quedan === 0) {
        toast(`Se acabó el ${producto}. No queda ninguno.`);
        return;
    }

    if (quedan !== null && piden > quedan) {
        toast(`Solo quedaba ${quedan} de ${producto}: puse ${quedan}, no ${piden}.`);
        piden = quedan;
    }
    cantidad = piden;

    // En un pedido para llevar todo va para llevar. Marcarlo plato por
    // plato era pedirle al mesero que repita lo que ya dijo al entrar,
    // y de ahí salían las tarrinas que no se cobraban.
    const paraLlevar = esLlevar();

    /* Si ya está y nadie lo modificó, se suma en la misma línea.
       Salvo una cosa: en una tanda ya en marcha, un arroz más no se le
       suma al arroz que la cocina ya tiene contado — hace su propia
       línea, y esa saldrá como tanda aparte. */
    const igual = borrador.find(i => i.platoId === plato.id && !i.bloqueado && !i.sin.length &&
                                     !i.cambio && !i.termino && i.llevar === paraLlevar &&
                                     !i.nota && !i.elegidas.length &&
                                     !(saleAparte(plato.id) && yaVenia(i)));
    if (igual) {
        igual.cantidad += (cantidad || 1);
    } else {
        borrador.push({
            uid: Servicio.nuevoId(),
            platoId: plato.id,
            nombre: plato.nombre,
            precio: plato.precio,
            cantidad: cantidad || 1,
            sin: [], cambio: '', termino: '', llevar: paraLlevar, nota: '', elegidas: []
        });
    }
    pintarBorrador();
}

/**
 * La tarrina que le tocaría a lo que hay en el borrador.
 *
 * Se CALCULA para mostrarla; no se mete en el borrador. Cuando se metía,
 * cada plato nuevo la sacaba de su fila y la volvía a poner al final, así
 * que las filas de abajo subían un renglón justo mientras el mesero
 * estaba tocando — y el dedo terminaba cayendo en el "−" de otro plato,
 * que lo bajaba a cero y lo borraba.
 *
 * Al enviar la agrega Servicio, que es donde tiene que estar.
 */
function tarrinaDelBorrador() {
    const plato = Store.findPlato('t1');
    const cuantas = plato ? Servicio.tarrinasDe(borrador) : 0;
    return cuantas ? { plato, cuantas, importe: cuantas * plato.precio } : null;
}

function pintarBorrador() {
    const cont = $('borrador');
    const tarrina = tarrinaDelBorrador();

    // El pie se queda a la vista aunque no haya nada todavía, porque en
    // un pedido para llevar ahí está el campo del nombre: si se
    // escondiera, no habría dónde escribirlo hasta agregar un plato.
    const pideNombre = !!(refActual && refActual.nuevoLlevar);

    if (!borrador.length) {
        cont.innerHTML = '';
        $('borrador-resumen').textContent = '0 platos';
        $('borrador-total').textContent = money(0);
        $('pie-mesa').hidden = !pideNombre;
        pintarPie();
        refrescarStock();
        return;
    }

    cont.innerHTML = `
        ${editandoTanda ? `
            <div class="editando-aviso">
                <i class="fas fa-pen"></i>
                Corrigiendo <b>${editandoTanda.codigo}</b>
                ${editandoTanda.modo !== 'agregados' ? ''
                  /* "Ya está en marcha" no vale para una tanda servida: la
                     comida no está en marcha, está en la mesa. */
                  : editandoTanda.entregado
                    ? '— ya se sirvió. Solo se puede tocar la bebida y las porciones; lo que agregues para cocinar sale como tanda nueva.'
                    : '— lo de arriba ya está en marcha. Lo que agregues para cocinar sale como tanda nueva y hace su turno.'}
            </div>` : ''}
        <h2 class="borrador-titulo">${editandoTanda ? 'Cómo queda la tanda' : 'Esta tanda'}</h2>
        ${borrador.map(bitemHtml).join('')}
        ${tarrina ? filaTarrina(tarrina) : ''}`;

    const total = borrador.reduce((s, i) => s + i.precio * i.cantidad, 0)
                + (tarrina ? tarrina.importe : 0);
    const n = borrador.reduce((s, i) => s + i.cantidad, 0);
    $('borrador-resumen').textContent = n === 1 ? '1 plato' : n + ' platos';
    $('borrador-total').textContent = money(total);
    $('pie-mesa').hidden = false;
    pintarPie();
    refrescarStock();
}

/**
 * Poner al dia lo que dicen los botones cuando cambia el borrador.
 *
 * Hace falta porque el borrador APARTA: con tres pollos y dos ya
 * escritos queda uno, y el boton seguia diciendo tres. El mesero leia
 * un numero que ya no era verdad justo cuando lo estaba usando.
 *
 * No se vuelven a dibujar las listas: se tocan los botones que ya estan.
 * Redibujarlas mueve las filas de sitio mientras el dedo va bajando, y
 * eso ya costo un plato borrado una vez.
 */
function refrescarStock() {
    if (!Object.keys(Store.getStock()).length) return;   // local sin stock: nada que hacer

    document.querySelectorAll('.rapido[data-plato], .tm-plato[data-plato]').forEach(b => {
        const p = Store.findPlato(b.dataset.plato);
        if (!p) return;

        const hay = seVende(p);
        b.disabled = !hay;
        b.classList.toggle('sin-stock', !hay);

        const etiqueta = b.querySelector('.rapido-pre, .tm-pre');
        if (etiqueta) etiqueta.innerHTML = avisoDeStock(p) || money(p.precio);
    });
}

/** Va siempre al final y no se toca: es para ver de dónde salen los centavos. */
const filaTarrina = t => `
    <div class="bitem automatico">
        <div class="bitem-cant"><span>${t.cuantas}</span></div>
        <div class="bitem-info">
            <span class="bitem-nom">${t.plato.nombre}</span>
            <span class="bitem-det">se agrega sola para lo que se llevan</span>
        </div>
        <span class="bitem-pre">${money(t.importe)}</span>
    </div>`;

function bitemHtml(it) {
    const p = Store.findPlato(it.platoId);
    const faltaElegir = p && p.elegir && it.elegidas.length !== p.elegir.cuantas;

    // Lo que ya estaba en la tanda cuando pasó el minuto: se ve, no se toca
    if (it.bloqueado) {
        return `
        <div class="bitem bloqueado">
            <div class="bitem-cant"><span>${it.cantidad}</span></div>
            <div class="bitem-info">
                <span class="bitem-nom">${Servicio.nombreDeItem(it)}</span>
                ${detalleItem(it, false) || '<span class="bitem-det">ya está en la parrilla</span>'}
            </div>
            <span class="bitem-pre">${money(it.precio * it.cantidad)}</span>
        </div>`;
    }

    // Lo que se le suma a una tanda ya cerrada y hay que cocinar: se
    // avisa aquí, antes de enviar, no después con un código raro.
    const aparte = vaAparte(it);

    return `
        <div class="bitem ${faltaElegir ? 'incompleto' : ''} ${aparte ? 'aparte' : ''}" data-uid="${it.uid}">
            <div class="bitem-cant">
                <button data-menos="${it.uid}" aria-label="Quitar uno">−</button>
                <span>${it.cantidad}</span>
                <button data-mas="${it.uid}" aria-label="Agregar uno">+</button>
            </div>
            <div class="bitem-info" data-mod="${it.uid}">
                <span class="bitem-nom">${Servicio.nombreDeItem(it)}</span>
                ${aparte ? '<span class="bitem-aparte">tanda nueva</span>' : ''}
                ${detalleItem(it, faltaElegir)}
            </div>
            <span class="bitem-pre">${money(it.precio * it.cantidad)}</span>
        </div>`;
}

/* ---------- El pie: el nombre del pedido y el botón ----------

   Un pedido para llevar sin nombre es una funda sin dueño. Por eso el
   botón de enviar no existe hasta que hay nombre: no se apaga ni avisa
   después, sencillamente todavía no es el momento de enviar. El campo
   ocupa su lugar y dice qué falta.                                   */

function pintarPie() {
    const campo = $('pie-nombre');
    const boton = $('btn-enviar');
    if (!campo || !boton) return;

    const pideNombre = refActual && refActual.nuevoLlevar;
    campo.hidden = !pideNombre;

    if (!pideNombre) {
        boton.disabled = false;
        boton.innerHTML = editandoTanda
            ? '<i class="fas fa-check"></i> Guardar cambios'
            : '<i class="fas fa-paper-plane"></i> Enviar';
        return;
    }

    /* Dos cosas pueden faltar y hay que decir cuál, no un "no" a secas:
       el nombre, o los platos. */
    const hayNombre = !!nombreLlevar.trim();
    const hayPlatos = borrador.length > 0;

    boton.disabled = !(hayNombre && hayPlatos);
    boton.innerHTML = !hayNombre ? '<i class="fas fa-user-pen"></i> Escribe el nombre'
                    : !hayPlatos ? '<i class="fas fa-utensils"></i> Agrega los platos'
                    : '<i class="fas fa-paper-plane"></i> Enviar';
}

/** La línea chica de abajo: lo que se le quitó, el término, si es para llevar. */
function detalleItem(it, faltaElegir) {
    const partes = [];
    if (it.elegidas.length) partes.push(it.elegidas.map(id => (Store.findPlato(id) || {}).nombre).join(' + '));
    if (faltaElegir)        partes.push('<b class="falta">falta elegir las carnes</b>');
    if (it.cambio)          partes.push(Servicio.comoSeSirve(it));
    if (it.sin.length)      partes.push(it.sin.map(g => 'sin ' + (GUARNICIONES[g] || g)).join(' · '));
    if (it.termino)         partes.push(it.termino);
    if (it.llevar)          partes.push('🥡 para llevar');
    if (it.nota)            partes.push(it.nota);

    return partes.length ? `<span class="bitem-det">${partes.join(' · ')}</span>` : '';
}

/* ---------- Hoja de modificaciones ---------- */

function abrirMod(uid) {
    const it = borrador.find(i => i.uid === uid);
    if (!it || it.bloqueado || it.automatico) return;
    editando = uid;

    const plato = Store.findPlato(it.platoId);
    const guarnicion = Servicio.guarnicionDe(it.platoId);

    $('hoja-titulo').textContent = Servicio.nombreDeItem(it);

    const bloques = [];

    // Las carnes de un mixto: hay que escogerlas sí o sí
    if (plato && plato.elegir) {
        bloques.push(`
            <div class="mod-bloque">
                <h3>Carnes <em>(escoge ${plato.elegir.cuantas})</em></h3>
                <div class="mod-chips">
                    ${plato.elegir.entre.map(id => {
                        const c = Store.findPlato(id);
                        const veces = it.elegidas.filter(e => e === id).length;
                        /* Una carne que se acabó no se puede escoger dentro
                           de un mixto: el mixto sigue vivo mientras le quede
                           alguna, pero esa no. */
                        const hay = c && seVende(c);
                        return `<button class="chip ${veces ? 'on' : ''} ${hay ? '' : 'sin-stock'}"
                                        data-elegir="${id}" ${hay ? '' : 'disabled'}>
                                    ${c ? c.nombre : id}${veces > 1 ? ` ×${veces}` : ''}
                                    ${hay ? '' : ' <em>se acabó</em>'}
                                </button>`;
                    }).join('')}
                </div>
            </div>`);
    }

    if (guarnicion.length) {
        /* Las dos formas de tocar el acompañante van juntas y son
           excluyentes: o se le quita algo a como viene, o se sirve de
           otra forma. Mezclarlas dejaba pedidos a medio armar —"sin
           arroz" más "solo patacones y ensalada"— que la cocina tenía
           que adivinar. Tocar una apaga la otra. */
        const cambios = Servicio.cambiosDe(it.platoId);

        bloques.push(`
            <div class="mod-bloque">
                <h3>Acompañantes</h3>
                <div class="mod-chips">
                    ${guarnicion.map(g => `
                        <button class="chip ${it.sin.includes(g) ? 'on' : ''}" data-sin="${g}">
                            sin ${GUARNICIONES[g] || g}
                        </button>`).join('')}
                </div>
                ${cambios.length ? `
                    <div class="mod-chips">
                        ${cambios.map(c => `
                            <button class="chip grande forma ${it.cambio === c.id ? 'on' : ''}" data-cambio="${c.id}">
                                ${c.etiqueta}
                            </button>`).join('')}
                    </div>` : ''}
                <p class="mod-nota">El precio no cambia: la cocina aumenta lo demás.</p>
            </div>`);
    }

    if (plato && plato.termino) {
        bloques.push(`
            <div class="mod-bloque">
                <h3>Término</h3>
                <div class="mod-chips">
                    ${['término medio', 'bien cocida', 'jugosa'].map(t => `
                        <button class="chip ${it.termino === t ? 'on' : ''}" data-termino="${t}">${t}</button>`).join('')}
                </div>
            </div>`);
    }

    bloques.push(`
        <div class="mod-bloque">
            <div class="mod-chips">
                <button class="chip grande ${it.llevar ? 'on' : ''}" data-llevar="1">
                    🥡 Para llevar
                </button>
            </div>
            <p class="mod-nota">El asador lo deja para el final, para que salga caliente.</p>
        </div>
        <label class="campo-srv">
            <span>Nota para la cocina</span>
            <input type="text" id="mod-nota" value="${(it.nota || '').replace(/"/g, '&quot;')}"
                   placeholder="Ej: bien jugosa" autocomplete="off">
        </label>`);

    $('hoja-cuerpo').innerHTML = bloques.join('');
    $('hoja-mod').classList.add('open');
}

function cerrarMod() {
    const it = borrador.find(i => i.uid === editando);
    if (it) {
        const campo = $('mod-nota');
        if (campo) it.nota = campo.value.trim();
    }
    editando = null;
    $('hoja-mod').classList.remove('open');
    pintarBorrador();
}

/* ---------- Otra bebida ---------- */

let margenBebida = 0.50;   // lo que se le sube a lo que costó en la tienda

function abrirOtraBebida() {
    const extras = Servicio.getExtras();
    $('bebida-guardadas').innerHTML = extras.length
        ? `<div class="mod-chips">${extras.map(e => `
              <button class="chip" data-extra="${e.id}">${e.nombre} <b>${money(e.precio)}</b></button>`).join('')}
           </div>`
        : '';
    $('bebida-nombre').value = '';
    $('bebida-costo').value = '';
    $('bebida-precio').value = '';
    $('hoja-bebida').classList.add('open');
}

/** Escribes lo que costó en la tienda y sale solo lo que se cobra. */
function calcularPrecioBebida() {
    const costo = parseFloat($('bebida-costo').value);
    if (isNaN(costo) || costo < 0) return;
    $('bebida-precio').value = (costo + margenBebida).toFixed(2);
}

function elegirMargen(valor) {
    margenBebida = valor;
    document.querySelectorAll('[data-margen]').forEach(b =>
        b.classList.toggle('on', Number(b.dataset.margen) === valor));
    calcularPrecioBebida();
}

function agregarBebidaNueva() {
    const nombre = $('bebida-nombre').value.trim();
    const precio = parseFloat($('bebida-precio').value);

    if (!nombre || isNaN(precio) || precio < 0) { toast('Falta el nombre o el precio.'); return; }

    const extra = Servicio.guardarExtra(nombre, precio);
    agregarAlBorrador({ id: extra.id, nombre: extra.nombre, precio: extra.precio }, 1);
    $('hoja-bebida').classList.remove('open');
}

/* ---------- Corregir una tanda ya enviada ---------- */

/**
 * Reabre una tanda para arreglarla.
 *
 * Dentro del minuto de gracia se puede tocar todo. Después, lo que ya
 * está cocinándose entra al borrador marcado como bloqueado: se ve,
 * suma en el total, pero no se puede cambiar. Así el mesero mira la
 * tanda completa mientras le agrega la cola, en vez de trabajar a
 * ciegas sobre un pedido que no ve.
 */
function abrirEdicion(id) {
    const c = Servicio.getComandas()[id];
    if (!c) return;

    const modo = Servicio.edicionDe(c);
    if (modo === 'no') { toast('Esta tanda ya no se puede tocar'); return; }

    /* Se apunta qué había ya en la tanda. Lo que se agregue encima se
       reconoce por no estar en esta lista, y si hay que cocinarlo sale
       como tanda nueva en vez de colarse en el ticket que la cocina
       tiene en la mano. */
    editandoTanda = {
        id, modo,
        codigo: c.codigo || Servicio.codigoDe(c),
        sesion: c.sesion,
        mesa: c.mesa,
        entregado: c.estado === 'entregado',
        previos: c.items.map(it => it.uid)
    };
    borrador = c.items
        .filter(it => !it.automatico)          // la tarrina se recalcula sola
        .map(it => ({
            ...it,
            sin: it.sin || [], cambio: it.cambio || '', elegidas: it.elegidas || [],
            bloqueado: modo === 'agregados' && !Servicio.editableSiempre(it.platoId)
        }));

    pintarBorrador();
    window.scrollTo(0, 0);
}

function cancelarEdicion() {
    editandoTanda = null;
    borrador = [];
    pintarMesa();
}

/**
 * ¿Este plato del borrador es un agregado que hay que cocinar?
 *
 * Lo que se le suma a una tanda ya cerrada NO puede meterse en el
 * ticket que la parrilla o la cocina tienen delante: ese ticket ya lo
 * contaron, y a media faena le crecería una línea. Sale como tanda
 * nueva —M4b— y hace su turno al final, igual que en el cuaderno:
 * primero en entrar, primero en salir.
 *
 * Las bebidas no pasan por ninguna pantalla, así que esas se quedan en
 * su tanda: abrir una M4b por una cola solo sería un código más que
 * leer.
 */
const saleAparte = platoId =>
    !!editandoTanda &&
    editandoTanda.modo === 'agregados' &&
    Servicio.estacionDe(platoId) !== 'barra';

/** ¿Esta línea ya venía en la tanda, o se agregó en esta corrección? */
const yaVenia = it => !!editandoTanda && editandoTanda.previos.includes(it.uid);

const vaAparte = it => saleAparte(it.platoId) && !yaVenia(it);

/**
 * Guarda lo que se corrigió. Puede salir en dos partes: la corrección
 * encima de la tanda de siempre, y lo agregado como tanda nueva.
 */
function guardarEdicion() {
    const aparte = borrador.filter(vaAparte);
    const encima = borrador.filter(it => !aparte.includes(it));

    const dicho = [];

    if (encima.length) {
        // Si no cambió nada, editarComanda no manda nada y no hay qué anunciar
        const antes = (Servicio.getComandas()[editandoTanda.id] || {}).editado;
        const c = Servicio.editarComanda(editandoTanda.id, encima);
        if (c && c.editado !== antes) dicho.push((c.codigo || '') + ' corregido');
    }

    if (aparte.length) {
        const nueva = Servicio.enviarComanda({
            mesa: editandoTanda.mesa || 0,
            sesion: editandoTanda.sesion,
            items: aparte,
            origen: 'mesero'
        });
        if (nueva) dicho.push((nueva.codigo || '') + ' a la cola');
    }

    editandoTanda = null;
    borrador = [];
    pintarMesa();
    toast(dicho.length ? dicho.join(' · ') : 'Sin cambios');
}

/* ---------- Enviar ---------- */

/**
 * Lo que otro se llevó mientras este pedido se escribía.
 *
 * No es un aviso que se va solo: hay que volver a la mesa a decirlo. Se
 * queda en pantalla hasta que lo toquen, y dice las dos cosas por
 * separado —lo que SÍ salió y lo que no— porque lo primero que va a
 * preguntar el cliente es "¿entonces qué me van a traer?".
 */
function avisarRecorte(recortes, quedoAlgo) {
    const nada  = recortes.filter(r => r.entraron === 0);
    const medio = recortes.filter(r => r.entraron > 0);

    $('recorte-cuerpo').innerHTML = `
        <p class="recorte-por">
            Otro celular acaba de tomar
            ${[...new Set(recortes.map(r => r.producto.toLowerCase()))].join(' y ')}
            mientras escribías este pedido.
        </p>

        <div class="recorte-bloque malo">
            <h3>NO se mandó</h3>
            <ul>
                ${nada.map(r => `<li>${r.pedidos} ${r.nombre}</li>`).join('')}
                ${medio.map(r => `<li>${r.pedidos - r.entraron} de ${r.pedidos} ${r.nombre}</li>`).join('')}
            </ul>
        </div>

        ${quedoAlgo
            ? `<p class="recorte-nota">El resto del pedido ya salió a la cocina.</p>`
            : `<p class="recorte-nota">No salió nada: era lo único que llevaba el pedido.</p>`}

        <p class="recorte-nota fuerte">Anda a la mesa y diles antes de que lo esperen.</p>`;

    $('hoja-recorte').classList.add('open');
}

async function enviar() {
    if (!borrador.length) return;

    // Un mixto sin carnes escogidas no se puede mandar: el asador no
    // sabría qué poner en la parrilla.
    const incompleto = borrador.find(it => {
        const p = Store.findPlato(it.platoId);
        return p && p.elegir && it.elegidas.length !== p.elegir.cuantas;
    });
    if (incompleto) { toast('Falta escoger las carnes del ' + incompleto.nombre); abrirMod(incompleto.uid); return; }

    if (editandoTanda) { guardarEdicion(); return; }

    if (refActual.nuevoLlevar && !nombreLlevar.trim()) {
        toast('Escribe a nombre de quién va el pedido');
        return;
    }

    /* LA ÚLTIMA PREGUNTA. Entre que este pedido se empezó a escribir y
       ahora, otro celular pudo haberse llevado las últimas costillas.
       Se le pregunta a la nube y se recorta lo que ya no existe, para
       que a la cocina nunca le llegue más de lo que hay. */
    const boton = $('btn-enviar');
    if (boton) boton.disabled = true;

    let aMandar = borrador, recortes = [];
    try {
        const revisado = await Servicio.revisarStock(borrador);
        aMandar  = revisado.items;
        recortes = revisado.recortes;
    } catch (e) {
        // Si no se pudo preguntar, se manda lo que hay: dejar a la mesa
        // sin pedido por no poder comprobar es peor que el riesgo.
    }
    if (boton) boton.disabled = false;

    if (!aMandar.length) {
        avisarRecorte(recortes, false);
        borrador = [];
        pintarMesa();
        return;
    }

    const comanda = Servicio.enviarComanda({
        mesa: refActual.mesa || 0,
        nombre: refActual.mesa ? '' : (nombreLlevar || Servicio.nombreDeCuenta(refActual)),
        items: aMandar,
        origen: 'mesero'
    });

    // El pedido para llevar ya tiene cuenta propia: se sigue trabajando
    // sobre ella, para poder agregarle otra tanda o cobrarla sin salir.
    if (comanda && refActual.nuevoLlevar) {
        refActual = { sesion: comanda.sesion };
        $('titulo').textContent = Servicio.nombreDeCuenta(refActual);
    }

    borrador = [];
    pintarMesa();

    /* Si hubo recorte manda el aviso grande, no el "enviado" de siempre:
       lo segundo lo dejaría tranquilo justo cuando tiene que moverse. */
    if (recortes.length) avisarRecorte(recortes, true);
    else avisarEnviada(comanda);
}

/* ============================================================
   5. VISTA: COBRAR
   ============================================================ */

/* Se cobra la CUENTA entera —la mesa con todas sus sesiones, o el
   pedido para llevar— porque es lo que el mesero tiene delante y es lo
   único que garantiza que no queden platos sin cobrar en una segunda
   sesión que nadie está mirando. */
let refCobrando = null;

function verCobrar(r) {
    refCobrando = r;
    seleccion = new Map();
    mostrarVista('cobrar');
    $('titulo').textContent = 'Cobrar · ' + Servicio.nombreDeCuenta(r);
    $('volver').hidden = false;
    pintarCobrar();
}

function pintarCobrar() {
    const cuenta = Servicio.cuentaDe(refCobrando);

    $('cobrar-lista').innerHTML = cuenta.items.filter(l => l.pendiente > 0).map(l => {
        const clave = l.platoId + '|' + l.precio;
        const puestas = seleccion.get(clave) || 0;
        return `
            <div class="clinea ${puestas ? 'activa' : ''}" data-linea="${clave}">
                <div class="clinea-info">
                    <span class="clinea-nom">${l.nombre}</span>
                    <span class="clinea-pre">${money(l.precio)} · quedan ${l.pendiente}</span>
                </div>
                <div class="clinea-cant">
                    <button data-cmenos="${clave}" aria-label="Menos">−</button>
                    <span>${puestas}</span>
                    <button data-cmas="${clave}" data-max="${l.pendiente}" aria-label="Más">+</button>
                </div>
            </div>`;
    }).join('') + `
        <button class="btn-todo" id="cobrar-todo">
            <i class="fas fa-check-double"></i> Seleccionar todo lo que falta (${money(cuenta.saldo)})
        </button>`;

    $('cobrar-total').textContent = money(totalSeleccionado());
}

function totalSeleccionado() {
    let total = 0;
    seleccion.forEach((cant, clave) => { total += cant * parseFloat(clave.split('|')[1]); });
    return total;
}

function cobrar(forma) {
    const lineas = [];
    seleccion.forEach((cantidad, clave) => {
        if (cantidad > 0) lineas.push({ platoId: clave.split('|')[0], precio: parseFloat(clave.split('|')[1]), cantidad });
    });

    if (!lineas.length) { toast('Toca primero lo que se va a cobrar.'); return; }

    Servicio.registrarPago(Object.assign({ lineas, forma }, refCobrando));

    const cuenta = Servicio.cuentaDe(refCobrando);
    if (cuenta.saldo <= 0.001) { toast(refCobrando.mesa ? 'Mesa cerrada' : 'Pedido cobrado'); verMesas(); }
    else { seleccion = new Map(); pintarCobrar(); toast('Cobrado · faltan ' + money(cuenta.saldo)); }
}

/**
 * Se lo lleva ahora y paga después.
 *
 * SIN NOMBRE NO HAY FIADO. Un "debe $12" sin dueño no se puede cobrar
 * nunca, y dentro de tres semanas nadie se acuerda. Por eso se pregunta
 * antes de cerrar nada, y si no lo escriben no pasa.
 *
 * La mesa se libera igual que con cualquier cobro: la gente se fue y la
 * mesa está vacía. Lo que queda pendiente es la plata, no el sitio.
 */
function fiar() {
    const lineas = [];
    seleccion.forEach((cantidad, clave) => {
        if (cantidad > 0) lineas.push({ platoId: clave.split('|')[0], precio: parseFloat(clave.split('|')[1]), cantidad });
    });

    if (!lineas.length) { toast('Toca primero lo que se lleva fiado.'); return; }

    const monto = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
    const nombre = (prompt(
        `Va fiado ${money(monto)}.\n\n` +
        '¿A nombre de quién? Sin nombre no se puede cobrar después.'
    ) || '').trim();

    if (!nombre) { toast('Sin nombre no se puede fiar.'); return; }

    const deuda = Servicio.fiar(Object.assign({ lineas, nombre }, refCobrando));
    if (!deuda) { toast('No se pudo anotar el fiado.'); return; }

    const cuenta = Servicio.cuentaDe(refCobrando);
    if (cuenta.saldo <= 0.001) { toast(`Fiado a ${nombre} · ${money(monto)}`); verMesas(); }
    else { seleccion = new Map(); pintarCobrar(); toast(`Fiado ${money(monto)} · faltan ` + money(cuenta.saldo)); }
}

/* ============================================================
   CAMBIAR DE MESA

   La gente se cambia de mesa a mitad de la comida. Hasta ahora eso
   obligaba a cobrar y volver a anotar todo desde cero. Se mueve la
   cuenta entera y solo se ofrecen las mesas libres: escoger una
   ocupada y que rebote no le sirve a nadie.
   ============================================================ */

function abrirMover(desde) {
    const total = Number(CFG.mesas) || 11;
    const libres = [];
    for (let n = 1; n <= total; n++) {
        if (n !== desde && !Servicio.sesionDeMesa(n)) libres.push(n);
    }

    $('mover-titulo').textContent = 'Mover la mesa ' + desde;
    $('mover-cuerpo').innerHTML = libres.length
        ? `<p class="mod-nota">Se lleva todo: las tandas, la cuenta y lo que falta cobrar.</p>
           <div class="mover-grid">
               ${libres.map(n => `<button class="mover-mesa" data-destino="${n}">${n}</button>`).join('')}
           </div>`
        : `<p class="mod-nota">No hay ninguna mesa libre ahora mismo.</p>`;

    $('hoja-mover').classList.add('open');
}

function moverA(destino) {
    const desde = refActual && refActual.mesa;
    if (!desde) return;

    const r = Servicio.moverMesa(desde, destino);
    $('hoja-mover').classList.remove('open');

    if (!r.ok) { alert(r.motivo); return; }

    abrirCuenta({ mesa: destino });
    toast(`Mesa ${desde} → mesa ${destino}`);
}

/* ------------------------------------------------------------
   PASAR DE SERVIRSE A LLEVAR, Y AL REVÉS

   El cliente cambia de idea a mitad del pedido y hasta ahora eso
   obligaba a anular todo y volver a anotarlo. Es el mismo movimiento
   que cambiar de mesa —la cuenta entera se va a otro sitio— así que
   usa la misma hoja y la misma función de abajo.

   Lo que sí es distinto: esto mueve el total, porque lo que se lleva
   va en tarrina. El número nuevo se enseña ANTES de confirmar.
   ------------------------------------------------------------ */

function abrirTipo() {
    const r = ref();
    if (!r) return;

    const esMesa  = !!r.mesa;
    const aLlevar = esMesa;                 // se va al contrario de lo que es
    const puede   = Servicio.puedeCambiarServicio(r);

    $('mover-titulo').textContent = esMesa ? 'Pasarlo a para llevar' : 'Sentarlo en una mesa';

    /* Si no se puede, se dice por qué y no se dibuja ningún botón. Un
       botón que rebota enseña a desconfiar de la pantalla. */
    if (!puede.ok) {
        $('mover-cuerpo').innerHTML = `<p class="mod-nota bloqueo">${puede.motivo}</p>`;
        $('hoja-mover').classList.add('open');
        return;
    }

    const efecto = Servicio.efectoDeCambiarServicio(r, aLlevar);
    const aviso = efecto.diferencia ? `
        <p class="mod-nota cambia-total">
            La cuenta pasa de ${money(efecto.antes)} a <b>${money(efecto.despues)}</b>
            ${efecto.diferencia > 0 ? '— lo que se lleva va en tarrina' : '— ya no hacen falta las tarrinas'}
        </p>` : '';

    if (esMesa) {
        $('mover-cuerpo').innerHTML = `
            <p class="mod-nota">Se va todo: las tandas, la cuenta y lo que falta cobrar.</p>
            ${aviso}
            <label class="pie-nombre">
                <span>¿A nombre de quién?</span>
                <input id="tipo-nombre" maxlength="30" autocomplete="off" placeholder="Carlos">
            </label>
            <button class="mover-confirmar" data-tipo-ok="1">Pasarlo a para llevar</button>`;
        $('hoja-mover').classList.add('open');
        const campo = $('tipo-nombre');
        if (campo) campo.focus();
        return;
    }

    const total = Number(CFG.mesas) || 11;
    const libres = [];
    for (let n = 1; n <= total; n++) if (!Servicio.sesionDeMesa(n)) libres.push(n);

    $('mover-cuerpo').innerHTML = libres.length
        ? `<p class="mod-nota">Se sienta en la mesa que escojas y deja de ser para llevar.</p>
           ${aviso}
           <div class="mover-grid">
               ${libres.map(n => `<button class="mover-mesa" data-tipo-mesa="${n}">${n}</button>`).join('')}
           </div>`
        : `<p class="mod-nota">No hay ninguna mesa libre ahora mismo.</p>`;

    $('hoja-mover').classList.add('open');
}

function cambiarTipoA(destino) {
    const r = ref();
    if (!r) return;

    const antes = Servicio.nombreDeCuenta(r);

    /* La sesión se apunta ANTES de mover. Después no habría de dónde
       sacarla: si la cuenta era { mesa: 3 }, esa mesa acaba de quedar
       libre y preguntar por ella no devuelve nada. El id de la sesión
       es lo único que no cambia al moverse. */
    const sesionId = (Servicio.sesionesDe(r)[0] || {}).id;

    const res = Servicio.moverCuenta(r, destino);
    if (!res.ok) { alert(res.motivo); return; }

    $('hoja-mover').classList.remove('open');
    abrirCuenta(destino.llevar ? { sesion: sesionId } : { mesa: destino.mesa });
    toast(`${antes} → ${Servicio.nombreDeCuenta(ref())}`);
}

/* ============================================================
   6. NAVEGACIÓN Y EVENTOS
   ============================================================ */

function mostrarVista(cual) {
    ['mesas', 'mesa', 'cobrar'].forEach(v => { $('vista-' + v).hidden = (v !== cual); });
    window.scrollTo(0, 0);
}

function redibujar() {
    pintarRed();
    /* ¿La cocina o el asador están llamando? Va fuera de los "if" de
       abajo a propósito: el mesero puede estar en cualquier vista
       —tomando un pedido, cobrando— y el timbre tiene que llegarle
       igual. */
    if (typeof Llamada !== 'undefined') Llamada.revisar('mesero');

    if (!$('vista-mesas').hidden) { pintarEntrantes(); pintarMesas(); }
    if (!$('vista-mesa').hidden)  pintarTandasPrevias();
    if (!$('vista-cobrar').hidden) pintarCobrar();
}

function conectarEventos() {
    $('lock-entrar').addEventListener('click', entrar);
    $('lock-clave').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });

    $('volver').addEventListener('click', () => {
        // Salir de una corrección a medias no debe salir de la cuenta:
        // lo primero que uno quiere es volver a ver la tanda entera.
        if (editandoTanda) return cancelarEdicion();
        if (!$('vista-cobrar').hidden && ref()) return abrirCuenta(ref());
        verMesas();
    });

    /* Sin esto no habia forma de cambiar de cuenta ni de recuperarse de
       una sesion rota: habia que borrar los datos del navegador. */
    const btnSalir = $('btn-salir');
    if (btnSalir) btnSalir.addEventListener('click', () => {
        if (confirm('Cerrar sesion en este celular?')) { Sync.salir(); location.reload(); }
    });

    $('btn-llevar').addEventListener('click', verLlevarNuevo);

    // El botón de enviar aparece en cuanto hay nombre, sin tocar nada más
    const campoNombre = $('nombre-llevar');
    if (campoNombre) {
        campoNombre.addEventListener('input', e => { nombreLlevar = e.target.value; pintarPie(); });
        campoNombre.addEventListener('keydown', e => {
            if (e.key === 'Enter' && nombreLlevar.trim()) { e.preventDefault(); enviar(); }
        });
    }

    $('tecleo').addEventListener('input', leerTecleo);
    $('tecleo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarDesdeTecleo(); } });
    $('tecleo-add').addEventListener('click', agregarDesdeTecleo);
    $('btn-enviar').addEventListener('click', enviar);

    $('hoja-close').addEventListener('click', cerrarMod);
    $('hoja-listo').addEventListener('click', cerrarMod);
    $('recorte-listo').addEventListener('click',
        () => $('hoja-recorte').classList.remove('open'));
    $('bebida-close').addEventListener('click', () => $('hoja-bebida').classList.remove('open'));
    $('bebida-add').addEventListener('click', agregarBebidaNueva);
    $('bebida-costo').addEventListener('input', calcularPrecioBebida);

    // Tocar el aviso rojo dice por qué no está saliendo
    $('red').addEventListener('click', () => {
        if (!Servicio.pendientes()) return;
        const motivo = Servicio.porQueNoSale() || 'Sin detalle todavía.';
        alert([
            'No están saliendo ' + Servicio.pendientes() + ' cosas.',
            '',
            motivo,
            '',
            'Lo que tomaste NO se pierde: se manda solo en cuanto se resuelva.'
        ].join('\n'));
    });

    document.addEventListener('click', e => {
        const t = e.target;

        const rech = t.closest('[data-rechazadas]');
        if (rech) return resolverRechazadas(rech.dataset.rechazadas);

        const mesa = t.closest('[data-mesa]');
        if (mesa) return verMesa(Number(mesa.dataset.mesa));

        const llevar = t.closest('[data-sesion]');
        if (llevar) return verLlevar(llevar.dataset.sesion);

        const plato = t.closest('[data-plato]');
        if (plato) {
            const p = Store.findPlato(plato.dataset.plato);
            if (p) agregarAlBorrador(p, 1);
            return;
        }

        if (t.closest('#btn-otra-bebida')) return abrirOtraBebida();

        const margen = t.closest('[data-margen]');
        if (margen) return elegirMargen(Number(margen.dataset.margen));

        const extra = t.closest('[data-extra]');
        if (extra) {
            const e2 = Servicio.getExtras().find(x => x.id === extra.dataset.extra);
            if (e2) { agregarAlBorrador(e2, 1); $('hoja-bebida').classList.remove('open'); }
            return;
        }

        const mas = t.closest('[data-mas]');
        if (mas) { cambiarCantidad(mas.dataset.mas, 1); return; }

        const menos = t.closest('[data-menos]');
        if (menos) { cambiarCantidad(menos.dataset.menos, -1); return; }

        const mod = t.closest('[data-mod]');
        if (mod) return abrirMod(mod.dataset.mod);

        const editar = t.closest('[data-editar]');
        if (editar) return abrirEdicion(editar.dataset.editar);

        const anular = t.closest('[data-anular]');
        if (anular) {
            const c = Servicio.getComandas()[anular.dataset.anular];
            const puede = Servicio.puedeAnular(c);
            // Se vuelve a preguntar aquí y no solo al dibujar: entre que
            // se pintó el botón y el dedo llegó, el asador pudo haberla
            // sacado. Un segundo basta.
            if (!puede.ok) { alert('No se puede anular.\n\n' + puede.motivo); redibujar(); return; }

            if (confirm('¿Anular esta tanda? Desaparece de la parrilla y de la cocina.')) {
                Servicio.anularComanda(anular.dataset.anular);
                toast('Tanda anulada');
            }
            return;
        }

        const mover = t.closest('[data-mover]');
        if (mover) return abrirMover(Number(mover.dataset.mover));

        const destino = t.closest('[data-destino]');
        if (destino) return moverA(Number(destino.dataset.destino));

        if (t.closest('[data-tipo]')) return abrirTipo();

        const aMesa = t.closest('[data-tipo-mesa]');
        if (aMesa) return cambiarTipoA({ mesa: Number(aMesa.dataset.tipoMesa) });

        if (t.closest('[data-tipo-ok]')) {
            const nombre = ($('tipo-nombre') || {}).value || '';
            if (!nombre.trim()) { toast('Escribe a nombre de quién va el pedido'); return; }
            return cambiarTipoA({ llevar: true, nombre });
        }

        if (t.closest('#mover-cerrar')) return $('hoja-mover').classList.remove('open');

        const abrirCobro = t.closest('[data-cobrar]');
        if (abrirCobro) return verCobrar(ref());

        const confirmar = t.closest('[data-confirmar]');
        if (confirmar) {
            /* Se apaga el botón mientras se resuelve. Confirmar pide
               permiso a la nube antes de crear nada, y ese viaje deja
               una rendija para tocar dos veces — que es justo lo que se
               está evitando. */
            confirmar.disabled = true;
            Servicio.confirmarEntrante(confirmar.dataset.confirmar).then(c => {
                if (!c) return;
                if (c.ocupado) { toast('Ese pedido ya lo confirmó otro celular'); return; }
                avisarEnviada(c);
            }).catch(() => {
                confirmar.disabled = false;
                toast('No se pudo confirmar. Inténtalo otra vez.');
            });
            return;
        }

        const descartar = t.closest('[data-descartar]');
        if (descartar) {
            if (confirm('¿Descartar este pedido? No le llega a nadie.')) {
                Servicio.descartarEntrante(descartar.dataset.descartar);
            }
            return;
        }

        // --- dentro de la hoja de modificaciones ---
        const it = borrador.find(i => i.uid === editando);

        const sin = t.closest('[data-sin]');
        if (sin && it) {
            const g = sin.dataset.sin;
            it.sin = it.sin.includes(g) ? it.sin.filter(x => x !== g) : [...it.sin, g];
            it.cambio = '';                       // o se quita, o se sirve de otra forma
            abrirMod(editando);
            return;
        }

        const cambio = t.closest('[data-cambio]');
        if (cambio && it) {
            it.cambio = (it.cambio === cambio.dataset.cambio) ? '' : cambio.dataset.cambio;
            if (it.cambio) it.sin = [];
            abrirMod(editando);
            return;
        }

        const term = t.closest('[data-termino]');
        if (term && it) {
            it.termino = (it.termino === term.dataset.termino) ? '' : term.dataset.termino;
            abrirMod(editando);
            return;
        }

        if (t.closest('[data-llevar]') && it) { it.llevar = !it.llevar; abrirMod(editando); return; }

        const eleg = t.closest('[data-elegir]');
        if (eleg && it) {
            const plato2 = Store.findPlato(it.platoId);
            const tope = plato2.elegir.cuantas;
            const id = eleg.dataset.elegir;
            // Se puede repetir la misma carne (dos pollos en un mixto de 2)
            if (it.elegidas.length >= tope) it.elegidas = [id];
            else it.elegidas = [...it.elegidas, id];
            abrirMod(editando);
            return;
        }

        // --- cobrar ---
        const cmas = t.closest('[data-cmas]');
        if (cmas) {
            const clave = cmas.dataset.cmas;
            const tope = Number(cmas.dataset.max);
            seleccion.set(clave, Math.min(tope, (seleccion.get(clave) || 0) + 1));
            pintarCobrar();
            return;
        }

        const cmenos = t.closest('[data-cmenos]');
        if (cmenos) {
            const clave = cmenos.dataset.cmenos;
            seleccion.set(clave, Math.max(0, (seleccion.get(clave) || 0) - 1));
            pintarCobrar();
            return;
        }

        if (t.closest('#cobrar-todo')) {
            Servicio.cuentaDe(refCobrando).items.forEach(l => {
                if (l.pendiente > 0) seleccion.set(l.platoId + '|' + l.precio, l.pendiente);
            });
            pintarCobrar();
            return;
        }

        const forma = t.closest('[data-forma]');
        if (forma) return cobrar(forma.dataset.forma);

        if (t.closest('#btn-fiar')) return fiar();
    });

    // Cerrar las hojas tocando el fondo
    ['hoja-mod', 'hoja-bebida'].forEach(id => {
        $(id).addEventListener('click', e => {
            if (e.target.id !== id) return;
            if (id === 'hoja-mod') cerrarMod(); else $(id).classList.remove('open');
        });
    });
}

function cambiarCantidad(uid, delta) {
    const it = borrador.find(i => i.uid === uid);
    if (!it || it.bloqueado || it.automatico) return;
    it.cantidad += delta;
    if (it.cantidad <= 0) borrador = borrador.filter(i => i.uid !== uid);
    pintarBorrador();
}

/* ============================================================
   7. ARRANQUE
   ============================================================ */

function iniciar() {
    CFG = Store.getConfig();
    conectarEventos();
    pintarRed();
    setInterval(pintarRed, 4000);

    if (Sync.activo && Sync.haySesion()) abrirApp();
    else if (!Sync.activo) {
        $('lock-msg').textContent = 'Este local todavía no tiene la nube conectada.';
        $('lock-entrar').disabled = true;
    }

    /* Los agotados y el stock que pone el gerente valen aquí también.
       Se PREGUNTAN cada seis segundos en vez de escucharlos en vivo, y
       de un solo tirón: la rama 'menu' trae los dos dentro.

       El motivo es contar conexiones. El navegador permite unas seis por
       sitio; esta pantalla tenía tres abiertas y con la de las llamadas
       serían cuatro, dejando dos para enviar — que es el barrio donde ya
       nos quedamos una vez sin poder mandar un pedido. Un plato que se
       agota puede tardar seis segundos en avisarse; un timbre, no. Así
       que el timbre se queda con la conexión y el menú pasa a la ronda. */
    if (Sync.activo) {
        const mirarElMenu = async () => {
            const m = await Sync.leer('menu');

            /* OJO CON LA DIFERENCIA: `undefined` es "no se pudo leer" y
               `null` es "no hay nada puesto". Tratarlos igual dejaba el
               último agotado pegado para siempre — al destildarlo, la
               rama se queda vacía, Firebase la borra, y si eso se lee
               como "no se pudo", el celular del mesero se queda con el
               plato agotado hasta que alguien recargue. */
            if (m === undefined) return;

            Store.aplicarOverridesRemotos(m && m.overrides);
            Store.aplicarStockRemoto(m && m.stock);
            if (!$('vista-mesa').hidden) { pintarRapidos(); pintarTodoElMenu(); }
        };
        mirarElMenu();
        setInterval(mirarElMenu, 6000);
    }
}

document.addEventListener('DOMContentLoaded', iniciar);
