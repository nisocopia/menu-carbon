/* ============================================================
   COMANDA.JS  —  La pantalla del que toma el pedido

   Reemplaza el cuaderno. Lo que se escribe aquí sale al mismo tiempo
   a la parrilla y a la cocina, sin caminar hasta ninguna de las dos.

   Está pensada para escribir, no para tocar: "3p 2c" es un pedido de
   3 pollos y 2 carnes. Tocar botones también funciona, pero es el
   camino lento, y el papel se gana por velocidad o no se gana.
   ============================================================ */

let CFG = {};
let mesaActual  = null;      // número de mesa, o 0 si es para llevar
let borrador    = [];        // la tanda que se está armando
let editando    = null;      // uid del ítem abierto en la hoja
let seleccion   = new Map(); // lo que se va a cobrar

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
    if (Servicio.permisoEn('comanda') !== 'todo') { negarPaso(); return; }

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
        const cuenta = sesion ? Servicio.cuentaDeMesa(n) : null;
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
}

/* ============================================================
   4. VISTA: TOMAR EL PEDIDO
   ============================================================ */

function verMesa(n) {
    mesaActual = n;
    borrador = [];
    mostrarVista('mesa');
    $('titulo').textContent = n ? 'Mesa ' + n : 'Para llevar';
    $('volver').hidden = false;
    pintarRapidos();
    pintarTodoElMenu();
    pintarMesa();
    $('tecleo').value = '';
    $('tecleo-lectura').innerHTML = '';
}

function pintarMesa() {
    pintarTandasPrevias();
    pintarBorrador();
}

/* ---------- Lo que esta mesa ya mandó ---------- */

function pintarTandasPrevias() {
    const cont = $('tandas-previas');
    const sesion = mesaActual ? Servicio.sesionDeMesa(mesaActual) : null;

    if (!sesion) { cont.innerHTML = ''; return; }

    const tandas = Servicio.comandasDeMesa(mesaActual).filter(c => c.estado !== 'anulado');
    const cuenta = Servicio.cuentaDeMesa(mesaActual);

    if (!tandas.length) { cont.innerHTML = ''; return; }

    cont.innerHTML = `
        <div class="previas">
            ${tandas.map(c => `
                <div class="previa ${c.estado === 'entregado' ? 'entregada' : ''}">
                    <div class="previa-top">
                        <strong>${c.codigo || Servicio.codigoDe(c)}</strong>
                        <span class="previa-estado">${c.estado === 'entregado' ? 'Entregado' : 'En preparación'}</span>
                    </div>
                    <div class="previa-items">${c.items.map(lineaCorta).join(' · ')}</div>
                    ${c.estado !== 'entregado'
                        ? `<button class="previa-anular" data-anular="${c.id}">Anular</button>` : ''}
                </div>`).join('')}

            <div class="previa-cuenta">
                <span>Cuenta de la mesa</span>
                <strong>${money(cuenta.saldo)}</strong>
                <button class="btn-cobrar-abrir" data-cobrar="${mesaActual}">
                    <i class="fas fa-cash-register"></i> Cobrar
                </button>
            </div>
        </div>`;
}

const lineaCorta = it => `${it.cantidad} ${it.nombre}${it.llevar ? ' 🥡' : ''}`;

/* ---------- Escritura rápida ---------- */

/** Busca el plato que el mesero quiso escribir. */
function buscarPlato(clave) {
    const platos = Store.getPlatos().filter(p => !p.agotado && tienePrecio(p));
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
        return plato ? { token, plato, cantidad } : { token, error: true };
    });
}

function leerTecleo() {
    const texto = $('tecleo').value;
    const cont = $('tecleo-lectura');

    if (!texto.trim()) { cont.innerHTML = ''; return; }

    cont.innerHTML = interpretar(texto).map(r => r.error
        ? `<span class="lee mal">“${r.token}” no existe</span>`
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
        .filter(p => !p.agotado && tienePrecio(p));

    const jugos = Store.getPlatos().filter(p => p.destacado && p.id.startsWith('b') && !p.agotado);

    $('rapidos').innerHTML =
        [...platos, ...jugos].map(p => `
            <button class="rapido" data-plato="${p.id}">
                <span class="rapido-nom">${p.nombre}</span>
                <span class="rapido-pre">${money(p.precio)}</span>
            </button>`).join('') +
        `<button class="rapido otra" id="btn-otra-bebida">
            <span class="rapido-nom"><i class="fas fa-plus"></i> Otra bebida</span>
            <span class="rapido-pre">de la tienda</span>
         </button>`;
}

function pintarTodoElMenu() {
    $('todo-menu-lista').innerHTML = Store.getMenu().map(cat => {
        const platos = cat.platos.filter(p => !p.agotado && tienePrecio(p));
        if (!platos.length) return '';
        return `
            <div class="tm-cat">
                <h3>${cat.nombre}</h3>
                ${platos.map(p => `
                    <button class="tm-plato" data-plato="${p.id}">
                        <span>${p.nombre}</span>
                        <span class="tm-pre">${money(p.precio)}</span>
                    </button>`).join('')}
            </div>`;
    }).join('');
}

/* ---------- El borrador ---------- */

function agregarAlBorrador(plato, cantidad) {
    // Si ya está y nadie lo modificó, se suma en la misma línea
    const igual = borrador.find(i => i.platoId === plato.id && !i.sin.length &&
                                     !i.termino && !i.llevar && !i.nota && !i.elegidas.length);
    if (igual) {
        igual.cantidad += (cantidad || 1);
    } else {
        borrador.push({
            uid: Servicio.nuevoId(),
            platoId: plato.id,
            nombre: plato.nombre,
            precio: plato.precio,
            cantidad: cantidad || 1,
            sin: [], termino: '', llevar: false, nota: '', elegidas: []
        });
    }
    pintarBorrador();
}

function pintarBorrador() {
    const cont = $('borrador');

    if (!borrador.length) {
        cont.innerHTML = '';
        $('pie-mesa').hidden = true;
        return;
    }

    cont.innerHTML = `
        <h2 class="borrador-titulo">Esta tanda</h2>
        ${borrador.map(it => {
            const p = Store.findPlato(it.platoId);
            const faltaElegir = p && p.elegir && it.elegidas.length !== p.elegir.cuantas;
            return `
            <div class="bitem ${faltaElegir ? 'incompleto' : ''}" data-uid="${it.uid}">
                <div class="bitem-cant">
                    <button data-menos="${it.uid}" aria-label="Quitar uno">−</button>
                    <span>${it.cantidad}</span>
                    <button data-mas="${it.uid}" aria-label="Agregar uno">+</button>
                </div>
                <div class="bitem-info" data-mod="${it.uid}">
                    <span class="bitem-nom">${it.nombre}</span>
                    ${detalleItem(it, faltaElegir)}
                </div>
                <span class="bitem-pre">${money(it.precio * it.cantidad)}</span>
            </div>`;
        }).join('')}`;

    const total = borrador.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const n = borrador.reduce((s, i) => s + i.cantidad, 0);
    $('borrador-resumen').textContent = n === 1 ? '1 plato' : n + ' platos';
    $('borrador-total').textContent = money(total);
    $('pie-mesa').hidden = false;
}

/** La línea chica de abajo: lo que se le quitó, el término, si es para llevar. */
function detalleItem(it, faltaElegir) {
    const partes = [];
    if (it.elegidas.length) partes.push(it.elegidas.map(id => (Store.findPlato(id) || {}).nombre).join(' + '));
    if (faltaElegir)        partes.push('<b class="falta">falta elegir las carnes</b>');
    if (it.sin.length)      partes.push(it.sin.map(g => 'sin ' + (GUARNICIONES[g] || g)).join(' · '));
    if (it.termino)         partes.push(it.termino);
    if (it.llevar)          partes.push('🥡 para llevar');
    if (it.nota)            partes.push(it.nota);

    return partes.length ? `<span class="bitem-det">${partes.join(' · ')}</span>` : '';
}

/* ---------- Hoja de modificaciones ---------- */

function abrirMod(uid) {
    const it = borrador.find(i => i.uid === uid);
    if (!it) return;
    editando = uid;

    const plato = Store.findPlato(it.platoId);
    const guarnicion = Servicio.guarnicionDe(it.platoId);

    $('hoja-titulo').textContent = it.nombre;

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
                        return `<button class="chip ${veces ? 'on' : ''}" data-elegir="${id}">
                                    ${c ? c.nombre : id}${veces > 1 ? ` ×${veces}` : ''}
                                </button>`;
                    }).join('')}
                </div>
            </div>`);
    }

    if (guarnicion.length) {
        bloques.push(`
            <div class="mod-bloque">
                <h3>Quitar</h3>
                <div class="mod-chips">
                    ${guarnicion.map(g => `
                        <button class="chip ${it.sin.includes(g) ? 'on' : ''}" data-sin="${g}">
                            sin ${GUARNICIONES[g] || g}
                        </button>`).join('')}
                </div>
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

/* ---------- Enviar ---------- */

function enviar() {
    if (!borrador.length) return;

    // Un mixto sin carnes escogidas no se puede mandar: el asador no
    // sabría qué poner en la parrilla.
    const incompleto = borrador.find(it => {
        const p = Store.findPlato(it.platoId);
        return p && p.elegir && it.elegidas.length !== p.elegir.cuantas;
    });
    if (incompleto) { toast('Falta escoger las carnes del ' + incompleto.nombre); abrirMod(incompleto.uid); return; }

    const comanda = Servicio.enviarComanda({
        mesa: mesaActual,
        items: borrador,
        origen: 'mesero'
    });

    borrador = [];
    pintarMesa();
    avisarEnviada(comanda);
}

/* ============================================================
   5. VISTA: COBRAR
   ============================================================ */

/* Se cobra la MESA, no una sesión suelta: es lo que el mesero tiene
   delante y es lo único que garantiza que no queden platos sin cobrar
   en una segunda sesión que nadie está mirando. */
let mesaCobrando = null;

function verCobrar(mesa) {
    mesaCobrando = mesa;
    seleccion = new Map();
    mostrarVista('cobrar');
    $('titulo').textContent = 'Cobrar';
    $('volver').hidden = false;
    pintarCobrar();
}

function pintarCobrar() {
    const cuenta = Servicio.cuentaDeMesa(mesaCobrando);

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

    Servicio.registrarPago({ mesa: mesaCobrando, lineas, forma });

    const cuenta = Servicio.cuentaDeMesa(mesaCobrando);
    if (cuenta.saldo <= 0.001) { toast('Mesa cerrada'); verMesas(); }
    else { seleccion = new Map(); pintarCobrar(); toast('Cobrado · faltan ' + money(cuenta.saldo)); }
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
    if (!$('vista-mesas').hidden) { pintarEntrantes(); pintarMesas(); }
    if (!$('vista-mesa').hidden)  pintarTandasPrevias();
    if (!$('vista-cobrar').hidden) pintarCobrar();
}

function conectarEventos() {
    $('lock-entrar').addEventListener('click', entrar);
    $('lock-clave').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });

    $('volver').addEventListener('click', () => {
        if (!$('vista-cobrar').hidden && mesaActual) verMesa(mesaActual);
        else verMesas();
    });

    /* Sin esto no habia forma de cambiar de cuenta ni de recuperarse de
       una sesion rota: habia que borrar los datos del navegador. */
    const btnSalir = $('btn-salir');
    if (btnSalir) btnSalir.addEventListener('click', () => {
        if (confirm('Cerrar sesion en este celular?')) { Sync.salir(); location.reload(); }
    });

    $('btn-llevar').addEventListener('click', () => verMesa(0));
    $('tecleo').addEventListener('input', leerTecleo);
    $('tecleo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarDesdeTecleo(); } });
    $('tecleo-add').addEventListener('click', agregarDesdeTecleo);
    $('btn-enviar').addEventListener('click', enviar);

    $('hoja-close').addEventListener('click', cerrarMod);
    $('hoja-listo').addEventListener('click', cerrarMod);
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

        const anular = t.closest('[data-anular]');
        if (anular) {
            if (confirm('¿Anular esta tanda? Desaparece de la parrilla y de la cocina.')) {
                Servicio.anularComanda(anular.dataset.anular);
                toast('Tanda anulada');
            }
            return;
        }

        const abrirCobro = t.closest('[data-cobrar]');
        if (abrirCobro) return verCobrar(Number(abrirCobro.dataset.cobrar));

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
            Servicio.cuentaDeMesa(mesaCobrando).items.forEach(l => {
                if (l.pendiente > 0) seleccion.set(l.platoId + '|' + l.precio, l.pendiente);
            });
            pintarCobrar();
            return;
        }

        const forma = t.closest('[data-forma]');
        if (forma) return cobrar(forma.dataset.forma);
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
    if (!it) return;
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

    // Los agotados que marca el gerente también valen aquí
    if (Sync.activo) {
        Sync.escuchar('menu/overrides', datos => {
            Store.aplicarOverridesRemotos(datos);
            if (!$('vista-mesa').hidden) { pintarRapidos(); pintarTodoElMenu(); }
        });
    }
}

document.addEventListener('DOMContentLoaded', iniciar);
