/* ============================================================
   PANEL.JS  —  Panel del gerente
   El dueño controla su menú, ve sus pedidos y sus números
   sin depender de nadie.
   ============================================================ */

/*
   Si por lo que sea sync.js no llegara a cargar, el panel tiene que seguir
   funcionando sin nube en vez de quedarse en blanco. Este respaldo garantiza
   que nunca falte nada de lo que el resto del archivo espera encontrar.
*/
const Nube = (typeof Sync !== 'undefined') ? Sync : {
    activo: false,
    haySesion: () => false,
    correoSesion: () => null,
    uidSesion: () => null,
    rolSesion: () => null,
    salir() {},
    escuchar: () => (() => {}),
    guardar: async () => false,
    parchear: async () => false,
    agregar: async () => false,
    leer: async () => null,
    entrar() { throw new Error('sin-configurar'); }
};

let cfgPanel = {};
const dinero = n => (cfgPanel.moneda || '$') + Number(n || 0).toFixed(2);

/* ============================================================
   ACCESO
   ============================================================ */

/*
   La clave no se guarda en el código: solo su huella PBKDF2. Aun así, esto
   frena curiosos, no a alguien decidido — el repositorio es público y todo
   el código se puede leer. La protección de verdad es que el panel no
   controla nada crítico: cada dispositivo trabaja sobre su propia copia.
*/

const SESION       = 'menu_panel_sesion';
const INTENTOS     = 'menu_panel_intentos';
const ITERACIONES  = 200000;          // debe coincidir con scripts/generar-clave.js
const DURA_SESION  = 8 * 60 * 60 * 1000;
const MAX_INTENTOS = 5;
const CASTIGO      = 5 * 60 * 1000;   // 5 minutos de espera al pasarse

/** Convierte la clave escrita en la misma huella que generó el script. */
async function huella(clave, sal) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(sal), iterations: ITERACIONES, hash: 'SHA-256' },
        base, 256
    );
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Comparación en tiempo constante: no revela cuánto coincidía. */
function igual(a, b) {
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
}

function estadoIntentos() {
    try { return JSON.parse(localStorage.getItem(INTENTOS)) || { n: 0, hasta: 0 }; }
    catch (e) { return { n: 0, hasta: 0 }; }
}

function bloqueoRestante() {
    const { hasta } = estadoIntentos();
    return Math.max(0, hasta - Date.now());
}

function registrarFallo() {
    const e = estadoIntentos();
    e.n++;
    if (e.n >= MAX_INTENTOS) { e.hasta = Date.now() + CASTIGO; e.n = 0; }
    localStorage.setItem(INTENTOS, JSON.stringify(e));
}

function mostrarError(texto) {
    const err = document.getElementById('pin-error');
    err.textContent = texto;
    setTimeout(() => { if (err.textContent === texto) err.textContent = ''; }, 4000);
}

/* Los mensajes de Firebase los traduce sync.js, que es el que habla con
   él. Tenerlos aquí también era tener dos verdades que se separan. */

async function intentarEntrar() {
    const campoClave = document.getElementById('pin-input');
    const campoCorreo = document.getElementById('correo-input');
    const boton = document.getElementById('pin-btn');
    const clave = campoClave.value;

    const espera = bloqueoRestante();
    if (espera > 0) {
        mostrarError(`Demasiados intentos. Espera ${Math.ceil(espera / 60000)} min.`);
        return;
    }
    if (!clave) return;

    boton.disabled = true;
    boton.textContent = 'Verificando…';

    try {
        if (Nube.activo) {
            // Con nube: valida Firebase en su servidor, no el navegador
            const correo = (campoCorreo.value || '').trim();
            if (!correo) { mostrarError('Escribe tu correo'); return; }

            try {
                await Nube.entrar(correo, clave);

                /* Entró bien, pero puede ser el asador. Que la cuenta sea
                   del local no la hace la del dueño: se cierra la sesión
                   para no dejarle abierto lo que no le toca. */
                if (!esGerente()) {
                    Nube.salir();
                    mostrarError('Esa cuenta es del local, pero no es la del gerente.');
                    return;
                }

                localStorage.removeItem(INTENTOS);
                abrirPanel();
                return;
            } catch (err) {
                registrarFallo();
                mostrarError(Nube.porQueNoEntro ? Nube.porQueNoEntro(err)
                                                : 'No se pudo entrar');
                return;
            }
        }

        // Sin nube: se compara contra la huella guardada en menu-data.js
        const cfg = Store.getConfig();
        const calculada = await huella(clave, cfg.panelSal);

        if (igual(calculada, cfg.panelHash)) {
            localStorage.removeItem(INTENTOS);
            sessionStorage.setItem(SESION, JSON.stringify({ hasta: Date.now() + DURA_SESION }));
            abrirPanel();
            return;
        }
        registrarFallo();
        mostrarError('Clave incorrecta');
    } catch (e) {
        // crypto.subtle solo existe en HTTPS o en localhost
        mostrarError('Abre el panel por HTTPS para poder validar la clave.');
    } finally {
        campoClave.value = '';
        boton.disabled = false;
        boton.textContent = 'Entrar';
    }
}

/**
 * ¿La cuenta que entró es la del dueño?
 *
 * El asador, la cocina y el mesero tienen cuentas válidas del local:
 * las necesitan para trabajar el servicio. Pero "tener cuenta" no es
 * "ser el gerente". Sin esta comprobación, cualquiera de ellos escribía
 * la dirección del panel y veía la venta del día — o peor, cambiaba los
 * precios.
 *
 * Las sesiones guardadas antes de que esto existiera no tienen el uid.
 * En ese caso se pide entrar de nuevo, que es lo seguro: dar por bueno
 * lo que no se puede comprobar es justo el error que se está corrigiendo.
 */
function esGerente() {
    const cfg = Store.getConfig();
    const uid = Nube.uidSesion ? Nube.uidSesion() : null;
    if (!uid || !cfg.gerenteUid) return false;
    return uid === cfg.gerenteUid;
}

function sesionValida() {
    if (Nube.activo) return Nube.haySesion() && esGerente();
    try {
        const s = JSON.parse(sessionStorage.getItem(SESION));
        return !!(s && s.hasta > Date.now());
    } catch (e) { return false; }
}

function abrirPanel() {
    document.getElementById('lock-screen').style.display = 'none';
    document.getElementById('panel-app').hidden = false;

    // Si algo del dibujado fallara, la conexión en vivo tiene que arrancar
    // igual: es lo que hace que los agotados y los pedidos funcionen.
    try { renderTodo(); } catch (e) { console.error('Error al dibujar el panel:', e); }
    try { escucharNube(); } catch (e) { console.error('Error al conectar con la nube:', e); }
}

function cerrarSesion() {
    sessionStorage.removeItem(SESION);
    if (Nube.activo) Nube.salir();
    location.reload();
}

/* ============================================================
   DATOS EN VIVO
   ============================================================ */

let pedidosNube = {};
let vistasNube  = {};

/** ¿Está andando el sistema de comandas? Si sí, los números salen de ahí. */
const hayServicio = () => typeof Servicio !== 'undefined' && Nube.activo;

/**
 * Las comandas que tomó el mesero son la venta real del local. Los
 * pedidos que manda el comensal desde su celular pasan por la bandeja
 * y se convierten en comanda al confirmarse, así que contarlos también
 * sería contarlos dos veces.
 */
function pedidosParaMostrar() {
    if (hayServicio()) return Servicio.comandasComoPedidos();
    return Nube.activo ? Store.mezclarPedidosRemotos(pedidosNube) : Store.getPedidos();
}

function statsParaMostrar() {
    const vistas = Nube.activo ? Store.mezclarVistasRemotas(vistasNube) : Store.getVistas();
    return Store.getStats(pedidosParaMostrar(), vistas);
}

/** Las mesas atendidas en un rango: una mesa con tres tandas es un cliente. */
function mesasEntre(desde, hasta) {
    if (!hayServicio()) return null;
    return Servicio.sesionesEntre(desde, hasta).length;
}

function escucharNube() {
    if (!Nube.activo) return;

    marcarEstadoNube('conectando');

    /* La rama "pedidos" ya no se escucha: es de cuando el comensal
       pedía directo y no existían las comandas. Hoy los números salen
       de las comandas del mesero, y el panel ignoraba esa rama a
       propósito para no contar dos veces el mismo pedido. Escucharla
       solo gastaba una de las pocas conexiones que da el navegador. */

    // Las comandas del mesero: son la venta real del local
    if (typeof Servicio !== 'undefined') {
        Servicio.iniciar(() => {
            marcarEstadoNube('en-vivo');
            renderResumenDia();
            renderPedidos();
            renderNumeros();
        });
    }

    /* Solo el recuento completo. Cada visita de un comensal llega como un
       aviso suelto de UNA vista, y tomarlo por el total dejaba el contador
       marcando 1 hasta recargar. Aquí no hace falta que sea al segundo:
       es un número para mirar, no para trabajar. */
    Nube.escuchar('vistas', (datos, ruta) => {
        if (ruta && ruta !== '/') return;
        vistasNube = datos || {};
        podarVistas(datos);
        renderNumeros();
    }, true);

    // Si otro dispositivo del local cambia el menú, este panel se entera
    Nube.escuchar('menu/overrides', datos => {
        Store.aplicarOverridesRemotos(datos);
        renderEditorMenu();
    });

    /* Lo que hay hoy también viaja: si el gerente lo pone desde el
       celular, el panel de la caja se entera sin recargar. */
    Nube.escuchar('menu/stock', datos => {
        Store.aplicarStockRemoto(datos);
        renderStock();
        renderEditorMenu();
    });
}

/* ------------------------------------------------------------
   BARRER LAS MIRADAS VIEJAS

   Cada visita al menú deja constancia de qué platos miró el comensal.
   Es el dato que dice "esto lo mira mucha gente y no lo pide nadie", y
   vale — pero nada lo borraba nunca, y el panel se baja la rama entera
   cada vez que se abre. En un año eso es una pestaña que tarda medio
   minuto en un celular con datos móviles.

   Lo de hace tres meses ya no dice nada del menú de hoy. Se barre una
   vez por sesión y solo lo hace el gerente, que es el único con
   permiso para borrar ahí.
   ------------------------------------------------------------ */

const DIAS_VISTAS = 90;
let vistasPodadas = false;

function podarVistas(datos) {
    if (vistasPodadas || !datos) return;
    vistasPodadas = true;

    const corte = Date.now() - DIAS_VISTAS * 24 * 3600 * 1000;
    const borrar = {};
    Object.keys(datos).forEach(k => {
        const v = datos[k];
        if (v && typeof v.cuando === 'number' && v.cuando < corte) borrar[k] = null;
    });

    if (Object.keys(borrar).length) Nube.parchear('vistas', borrar);
}

function marcarEstadoNube(estado) {
    const el = document.getElementById('estado-nube');
    if (!el) return;
    el.className = 'estado-nube ' + estado;
    el.innerHTML = estado === 'en-vivo'
        ? '<span class="punto-vivo"></span> En vivo'
        : '<i class="fas fa-clock"></i> Conectando…';
}

/* ============================================================
   PESTAÑAS
   ============================================================ */

function conectarTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(b => b.classList.remove('activo'));
            document.querySelectorAll('.panel-vista').forEach(v => v.classList.remove('activa'));
            btn.classList.add('activo');
            document.getElementById('vista-' + btn.dataset.tab).classList.add('activa');
            window.scrollTo({ top: 0 });
        });
    });
}

/* ============================================================
   PEDIDOS
   ============================================================ */

const ESTADOS = {
    nuevo:     { texto: 'Nuevo',      clase: 'e-nuevo',   siguiente: 'cocina'    },
    cocina:    { texto: 'En cocina',  clase: 'e-cocina',  siguiente: 'entregado' },
    entregado: { texto: 'Entregado',  clase: 'e-listo',   siguiente: 'nuevo'     }
};

function esDeHoy(ts) {
    const d = new Date(ts), h = new Date();
    return d.toDateString() === h.toDateString();
}

function inicioDeHoy() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function renderResumenDia() {
    const pedidos = pedidosParaMostrar().filter(p => esDeHoy(p.creado));
    const ventas  = pedidos.reduce((s, p) => s + (p.total || 0), 0);
    const platos  = pedidos.reduce((s, p) => s + (p.items || []).reduce((a, i) => a + i.cantidad, 0), 0);
    const mesas   = mesasEntre(inicioDeHoy(), Date.now());

    document.getElementById('resumen-dia').innerHTML = `
        <div class="mini-kpi"><span>${mesas != null ? mesas : pedidos.length}</span>
             <small>${mesas != null ? 'mesas hoy' : 'pedidos hoy'}</small></div>
        <div class="mini-kpi"><span>${dinero(ventas)}</span><small>vendido hoy</small></div>
        <div class="mini-kpi"><span>${platos}</span><small>platos servidos</small></div>`;
}

function renderPedidos() {
    const lista = pedidosParaMostrar();
    const cont = document.getElementById('lista-pedidos');

    if (!lista.length) {
        cont.innerHTML = `<p class="vacio">Todavía no hay pedidos. Cuando un cliente pida desde el menú, aparecerá aquí.</p>`;
        return;
    }

    cont.innerHTML = lista.slice(0, 40).map(p => {
        const est = ESTADOS[p.estado] || ESTADOS.nuevo;
        const hora = new Date(p.creado).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
        const fecha = esDeHoy(p.creado) ? 'Hoy' : new Date(p.creado).toLocaleDateString('es-EC');

        /* Con el sistema de comandas andando, el estado lo pone la cocina
           cuando entrega. Que el panel fuera un segundo lugar donde
           cambiarlo solo serviría para que los dos digan cosas distintas. */
        const estado = hayServicio()
            ? `<span class="estado ${est.clase}">${est.texto}</span>`
            : `<button class="estado ${est.clase}" data-estado="${p.id}">${est.texto}</button>`;

        return `
        <div class="pedido-card">
            <div class="pedido-top">
                <div>
                    <strong class="pedido-mesa">${p.codigo || '#' + p.id}</strong>
                </div>
                ${estado}
            </div>
            <div class="pedido-hora">
                ${fecha} · ${hora}${p.origen === 'cliente' ? ' · pidió desde su celular' : ''}
            </div>
            <ul class="pedido-items">
                ${(p.items || []).map(i => `
                    <li>
                        <span>${i.cantidad}×</span> ${i.nombre}
                        ${i.llevar ? ' 🥡' : ''}
                        ${i.cambio ? `<em>${Servicio.comoSeSirve(i)}</em>` : ''}
                        ${(i.sin && i.sin.length) ? `<em>sin ${i.sin.map(g => GUARNICIONES[g] || g).join(', ')}</em>` : ''}
                    </li>`).join('')}
            </ul>
            ${p.nota ? `<div class="pedido-nota"><i class="fas fa-note-sticky"></i> ${p.nota}</div>` : ''}
            <div class="pedido-total">${dinero(p.total)}</div>
        </div>`;
    }).join('');
}

/* ============================================================
   EDITOR DEL MENÚ
   ============================================================ */

/* ============================================================
   LO QUE HAY HOY

   Se cuenta POR PRODUCTO. Del mismo pollo salen el asado, el apanado,
   el junior y la porción: si se ponen cuatro números sueltos, el
   sistema deja vender cuatro veces el mismo pollo.

   Es otra cosa que el botón Agotado de abajo. Ese apaga UN plato — se
   acabó la apanadura y cae el apanado, pero el pollo asado sigue
   vendiéndose. Los dos conviven.
   ============================================================ */

/** Qué platos comen de cada producto, para poder decírselo al gerente. */
function platosDelProducto(producto) {
    return Store.getPlatos()
        .filter(p => (p.usa || p.id) === producto)
        .map(p => p.nombre);
}

function renderStock() {
    const caja = document.getElementById('stock-hoy');
    if (!caja) return;

    const guardado = Store.getStock();
    const productos = typeof PRODUCTOS !== 'undefined' ? PRODUCTOS : {};

    const fila = (clave, titulo, comen) => {
        const s = guardado[clave];
        const quedan = Servicio.quedanDe(clave);
        const hay = s && typeof s.hay === 'number' ? s.hay : '';

        /* Un número puesto ayer no vale hoy: si no se vuelve a poner, el
           plato se vende sin límite. Al revés, el local abriría el jueves
           sin poder vender pollo porque el domingo se acabó. */
        const vencido = s && quedan === null;

        const estado = vencido  ? '<span class="stock-vencido">el de ayer venció</span>'
                     : quedan === null ? '<span class="stock-libre">sin límite</span>'
                     : quedan === 0    ? '<span class="stock-cero">se acabó</span>'
                     : `<span class="stock-quedan">quedan ${quedan}</span>`;

        return `
            <div class="fila-stock ${quedan === 0 ? 'en-cero' : ''}">
                <div class="stock-nom">
                    ${titulo}
                    ${comen.length > 1 ? `<em>${comen.join(' · ')}</em>` : ''}
                </div>
                <div class="stock-der">
                    ${estado}
                    <input class="in-stock" type="number" min="0" step="1" placeholder="—"
                           value="${hay}" data-stock="${clave}">
                </div>
            </div>`;
    };

    // Primero los productos compartidos, que son los que importan
    const compartidos = Object.keys(productos)
        .map(k => fila(k, productos[k], platosDelProducto(k)))
        .join('');

    /* Y cualquier otro plato al que ya se le haya puesto un número. Los
       demás se le ponen desde su propia fila, más abajo en el editor. */
    const sueltos = Object.keys(guardado)
        .filter(k => !productos[k])
        .map(k => {
            const p = Store.findPlato(k);
            return fila(k, p ? p.nombre : k, []);
        }).join('');

    caja.innerHTML = `
        <div class="bloque">
            <div class="bloque-head">
                <h2>Lo que hay hoy</h2>
                <button class="btn-texto" id="btn-borrar-stock">Quitar todos los números</button>
            </div>
            <p class="ayuda">
                Pon un número solo en lo que esté escaso. Lo que dejes vacío se vende
                sin límite, como siempre. Del mismo pollo salen el asado, el apanado,
                el junior y la porción: por eso el número es uno solo para los cuatro.
                <b>Al día siguiente hay que ponerlo de nuevo</b> — un número viejo
                dejaría el local sin poder vender sin que nadie sepa por qué.
            </p>
            ${compartidos}${sueltos}
        </div>`;
}

function conectarStock() {
    const caja = document.getElementById('stock-hoy');
    if (!caja) return;

    caja.addEventListener('change', e => {
        const campo = e.target.closest('[data-stock]');
        if (!campo) return;
        Store.setStock(campo.dataset.stock, campo.value === '' ? null : campo.value);
        publicarStockDelPanel();
        renderStock();
        renderEditorMenu();
    });

    caja.addEventListener('click', e => {
        if (!e.target.closest('#btn-borrar-stock')) return;
        if (!confirm('¿Quitar todos los números? Todo vuelve a venderse sin límite.')) return;
        Object.keys(Store.getStock()).forEach(k => Store.setStock(k, null));
        publicarStockDelPanel();
        renderStock();
        renderEditorMenu();
    });
}

/** El número que ve la carta del comensal, que no puede restar sola. */
function publicarStockDelPanel() {
    Store.publicarEspejo(Servicio.quedanTodos());
}

/**
 * El renglón chico bajo el nombre del plato.
 *
 * Un plato que comparte producto no lleva su propio número: se lo pone
 * arriba, en "Lo que hay hoy". Hay que decirlo, o el gerente va a buscar
 * la casilla del pollo asado y no la va a encontrar.
 */
function pistaDeStock(p) {
    if (!p.usa) return '';
    const quedan = Servicio.quedanDe(p.usa);
    const nombre = Servicio.nombreProducto(p.usa);
    return quedan === null
        ? `<span class="plato-stock">sale del ${nombre.toLowerCase()}</span>`
        : `<span class="plato-stock ${quedan === 0 ? 'en-cero' : 'con-poco'}">
               ${nombre.toLowerCase()}: ${quedan === 0 ? 'se acabó' : 'quedan ' + quedan}
           </span>`;
}

function renderEditorMenu() {
    const menu = Store.getMenu();

    document.getElementById('editor-menu').innerHTML = menu.map(cat => `
        <div class="bloque">
            <h2><i class="fas ${cat.icono}"></i> ${cat.nombre}</h2>
            ${cat.platos.map(p => `
                <div class="fila-plato ${p.agotado ? 'agotado' : ''}">
                    <input class="in-nombre" type="text" value="${p.nombre.replace(/"/g, '&quot;')}"
                           data-campo="nombre" data-id="${p.id}">
                    ${pistaDeStock(p)}
                    <div class="fila-acciones">
                        <div class="in-precio-wrap">
                            <span>${cfgPanel.moneda || '$'}</span>
                            <input class="in-precio" type="number" step="0.25" min="0" placeholder="—"
                                   value="${typeof p.precio === 'number' && !isNaN(p.precio) ? Number(p.precio).toFixed(2) : ''}"
                                   data-campo="precio" data-id="${p.id}">
                        </div>
                        <button class="btn-agotado ${p.agotado ? 'on' : ''}" data-agotado="${p.id}">
                            ${p.agotado ? 'Agotado' : 'Disponible'}
                        </button>
                        <button class="btn-estrella ${p.destacado ? 'on' : ''}" data-destacado="${p.id}"
                                title="Marcar como el más pedido">
                            <i class="fas fa-star"></i>
                        </button>
                    </div>
                </div>`).join('')}
        </div>`).join('');
}

function conectarEditor() {
    const cont = document.getElementById('editor-menu');

    cont.addEventListener('click', e => {
        const ag = e.target.closest('[data-agotado]');
        if (ag) {
            Store.toggleAgotado(ag.dataset.agotado);
            renderEditorMenu();
            return;
        }
        const des = e.target.closest('[data-destacado]');
        if (des) {
            const p = Store.findPlato(des.dataset.destacado);
            Store.setOverride(des.dataset.destacado, { destacado: !p.destacado });
            renderEditorMenu();
        }
    });

    cont.addEventListener('change', e => {
        const campo = e.target.dataset.campo;
        if (!campo) return;
        const id = e.target.dataset.id;

        if (campo === 'precio') {
            const valor = parseFloat(e.target.value);
            if (isNaN(valor) || valor < 0) { renderEditorMenu(); return; }
            Store.setOverride(id, { precio: valor });
        } else {
            const texto = e.target.value.trim();
            if (!texto) { renderEditorMenu(); return; }
            Store.setOverride(id, { nombre: texto });
        }
        avisar('Cambio guardado');
    });
}

function exportarArchivo() {
    const contenido = Store.exportarMenuData();
    const blob = new Blob([contenido], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ============================================================
   NÚMEROS
   ============================================================ */

function renderNumeros() {
    const s = statsParaMostrar();
    const pedidos = pedidosParaMostrar();

    /* El ticket se mide por mesa, no por tanda: una mesa que pidió tres
       veces es un cliente que gastó una vez, no tres clientes chicos.
       Medirlo por tanda hacía parecer que el ticket bajaba justo cuando
       la gente pedía más. */
    const mesas = new Set(pedidos.map(p => p.sesion).filter(Boolean)).size;
    const porMesa = mesas ? s.ingresos / mesas : s.ticketPromedio;

    document.getElementById('kpi-grid').innerHTML = `
        <div class="kpi"><span class="kpi-valor">${mesas || s.totalPedidos}</span>
             <span class="kpi-label">${mesas ? 'Mesas atendidas' : 'Pedidos'}</span></div>
        <div class="kpi"><span class="kpi-valor">${dinero(s.ingresos)}</span><span class="kpi-label">Vendido</span></div>
        <div class="kpi"><span class="kpi-valor">${dinero(porMesa)}</span>
             <span class="kpi-label">${mesas ? 'Ticket por mesa' : 'Ticket promedio'}</span></div>
        <div class="kpi"><span class="kpi-valor">${s.totalPedidos}</span><span class="kpi-label">Tandas</span></div>`;

    // La joya del panel: platos con mucho interés y pocas ventas
    const oportunidades = s.ranking
        .filter(p => p.vistas >= 3 && p.vendidos === 0)
        .slice(0, 5);

    document.getElementById('bloque-oportunidad').innerHTML = oportunidades.length ? `
        <h2><i class="fas fa-lightbulb"></i> Dinero que se te está escapando</h2>
        <p class="ayuda">Estos platos los está mirando bastante gente pero nadie los pide. Casi siempre es porque les falta una buena foto o el precio no convence.</p>
        <ul class="oportunidad-lista">
            ${oportunidades.map(p => `
                <li>
                    <span class="op-nombre">${p.nombre}</span>
                    <span class="op-dato">${p.vistas} miradas · 0 pedidos</span>
                </li>`).join('')}
        </ul>` : `
        <h2><i class="fas fa-lightbulb"></i> Dinero que se te está escapando</h2>
        <p class="vacio">Todavía no hay suficientes datos. Cuando los clientes usen el menú, aquí te vamos a mostrar qué platos miran pero no piden.</p>`;

    document.querySelector('#tabla-platos tbody').innerHTML = s.ranking.map(p => `
        <tr>
            <td>${p.nombre}<small>${p.categoria}</small></td>
            <td>${p.vistas}</td>
            <td><strong>${p.vendidos}</strong></td>
            <td>${dinero(p.ingreso)}</td>
        </tr>`).join('');
}

/* ============================================================
   DATOS DEL LOCAL
   ============================================================ */

const CAMPOS_LOCAL = [
    { k: 'nombre',    label: 'Nombre del restaurante' },
    { k: 'lema',      label: 'Frase corta (debajo del nombre)' },
    { k: 'frase',     label: 'Mensaje de espera' },
    { k: 'horario',   label: 'Horario de atención' },
    { k: 'direccion', label: 'Dirección' },
    { k: 'telefono',  label: 'Teléfono' },
    { k: 'whatsapp',  label: 'WhatsApp para pedidos', ayuda: 'Solo números con código de país. Ej: 593991234567. Déjalo vacío si no lo quieres.' },
    { k: 'tiempoPromedio', label: 'Minutos que demora un plato', tipo: 'number', ayuda: 'Se usa para el aviso de "tu pedido va en camino".' }
];

function renderFormLocal() {
    const c = Store.getConfig();
    document.getElementById('form-local').innerHTML = CAMPOS_LOCAL.map(f => `
        <label class="campo-panel">
            <span>${f.label}</span>
            <input type="${f.tipo || 'text'}" id="cfg-${f.k}" value="${String(c[f.k] ?? '').replace(/"/g, '&quot;')}">
            ${f.ayuda ? `<em>${f.ayuda}</em>` : ''}
        </label>`).join('');
}

function guardarLocal() {
    const patch = {};
    CAMPOS_LOCAL.forEach(f => {
        const el = document.getElementById('cfg-' + f.k);
        patch[f.k] = f.tipo === 'number' ? Number(el.value) || 0 : el.value.trim();
    });
    Store.saveConfig(patch);
    cfgPanel = Store.getConfig();
    renderCabecera();
    avisar('Datos guardados');
}

/* ============================================================
   UTILIDADES
   ============================================================ */

function avisar(texto) {
    const el = document.getElementById('aviso-guardado');
    if (!el) return;
    el.textContent = '✓ ' + texto;
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => el.textContent = '', 2200);
}

function renderCabecera() {
    document.getElementById('panel-titulo').textContent = cfgPanel.nombre;
    document.getElementById('panel-fecha').textContent =
        new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** El texto de ayuda cambia según haya nube o no, para no confundir al dueño. */
function ajustarTextosSegunNube() {
    const ayuda = document.getElementById('ayuda-menu');
    const bloque = document.getElementById('bloque-exportar');
    if (!ayuda) return;

    if (Nube.activo) {
        ayuda.innerHTML = 'Toca <strong>Agotado</strong> y el plato desaparece del menú de ' +
            '<strong>todos los celulares</strong> en segundos. Lo mismo al cambiar un precio. ' +
            'No hay que hacer nada más.';
        if (bloque) bloque.hidden = true;
    } else {
        ayuda.innerHTML = 'Toca <strong>Agotado</strong> para sacar un plato del menú, o edita ' +
            'el precio y el nombre. Ojo: estos cambios <strong>solo se ven en este aparato</strong>. ' +
            'Para que los vean tus clientes, descarga el archivo de abajo y súbelo al sitio.';
        if (bloque) bloque.hidden = false;
    }
}

function renderTodo() {
    cfgPanel = Store.getConfig();
    ajustarTextosSegunNube();
    renderCabecera();
    renderResumenDia();
    renderPedidos();
    renderStock();
    renderEditorMenu();
    renderNumeros();
    renderFormLocal();
}

/* ============================================================
   ARRANQUE
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    conectarTabs();
    conectarEditor();
    conectarStock();

    // Con nube se entra con correo y clave; sin nube, solo con la clave
    if (Nube.activo) {
        document.getElementById('correo-input').hidden = false;
        document.getElementById('estado-nube').hidden = false;
    }

    document.getElementById('pin-btn').addEventListener('click', intentarEntrar);
    document.getElementById('pin-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') intentarEntrar();
    });

    document.getElementById('btn-exportar').addEventListener('click', exportarArchivo);
    document.getElementById('btn-guardar-local').addEventListener('click', guardarLocal);

    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm('¿Deshacer todos los cambios de precios y agotados? El menú vuelve a como estaba.')) {
            Store.resetOverrides();
            renderTodo();
        }
    });

    document.getElementById('btn-limpiar-pedidos').addEventListener('click', () => {
        /* Con el sistema de comandas andando esto borra el servicio del
           LOCAL ENTERO, no la copia de este celular. Sirve para dejar
           limpio después de un ensayo. Por eso hay que escribir la
           palabra: un toque de más en hora pico le borraría la noche a
           la cocina. */
        if (hayServicio()) {
            const abiertas = Object.values(Servicio.getSesiones()).filter(s => s.abierta).length;

            const aviso =
                'Esto borra TODO el servicio del local: las comandas, las mesas\n' +
                'abiertas y los cobros. En todos los celulares, no solo en este.\n\n' +
                (abiertas ? `⚠ AHORA MISMO HAY ${abiertas} MESA(S) ABIERTA(S).\n\n` : '') +
                'El menú, los precios y las bebidas guardadas no se tocan.\n\n' +
                'Escribe BORRAR para confirmar:';

            if ((prompt(aviso) || '').trim().toUpperCase() !== 'BORRAR') return;

            Servicio.vaciarTodo().then(ok => {
                renderTodo();
                avisar(ok ? 'Servicio vaciado' : 'Se vació aquí, pero la nube no respondió');
            });
            return;
        }

        if (confirm('¿Borrar el historial de pedidos? Los números también se reinician.')) {
            Store.borrarPedidos();
            renderTodo();
        }
    });

    // Cambiar el estado de un pedido con un toque
    document.getElementById('lista-pedidos').addEventListener('click', e => {
        const btn = e.target.closest('[data-estado]');
        if (!btn) return;
        const id = Number(btn.dataset.estado);
        const pedido = pedidosParaMostrar().find(p => p.id === id);
        if (!pedido) return;

        const nuevo = (ESTADOS[pedido.estado] || ESTADOS.nuevo).siguiente;
        Store.setEstadoPedido(id, nuevo);

        // Si el pedido vino de otro celular, el estado se guarda en la nube
        // para que cualquier aparato del local lo vea igual.
        if (Nube.activo && pedido.llaveNube) {
            pedidosNube[pedido.llaveNube] = Object.assign({}, pedido, { estado: nuevo });
            Nube.guardar(`pedidos/${pedido.llaveNube}/estado`, nuevo);
        }
        renderPedidos();
    });

    document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

    if (sesionValida()) abrirPanel();
    else document.getElementById('pin-input').focus();
});
