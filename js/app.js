/* ============================================================
   APP.JS  —  Dibuja el menú, maneja el pedido y la comanda
   ============================================================ */

/*
   Si por lo que sea sync.js no llegara a cargar, el menú tiene que seguir
   mostrándose y aceptando pedidos en vez de quedarse en blanco. Este
   respaldo garantiza que nunca falte nada de lo que el resto espera.
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

let CFG = {};
let carrito = [];

const money = n => CFG.moneda + Number(n || 0).toFixed(2);

/** Un plato sin precio se muestra pero no se puede pedir (ej: bebidas por consultar). */
const tienePrecio = p => typeof p.precio === 'number' && !isNaN(p.precio);

/* ============================================================
   1. DIBUJAR EL MENÚ DESDE LOS DATOS
   ============================================================ */

function renderNav(menu) {
    document.getElementById('menu-nav').innerHTML = menu
        .filter(c => c.platos.length)
        .map(c => `<a href="#${c.id}"><i class="fas ${c.icono}"></i> ${c.nombre}</a>`)
        .join('');
}

function tarjetaPlato(p) {
    const foto = p.img
        ? `<img src="${p.img}" alt="${p.nombre}" loading="lazy">`
        : `<div class="image-placeholder">📷 <span>Próximamente</span></div>`;

    const sello = p.destacado && !p.agotado
        ? `<span class="badge-destacado"><i class="fas fa-star"></i> El más pedido</span>` : '';

    const boton = p.agotado
        ? `<button class="btn-agregar agotado" disabled>Agotado hoy</button>`
        : tienePrecio(p)
            ? `<button class="btn-agregar" data-add="${p.id}"><i class="fas fa-plus"></i> Agregar</button>`
            : `<button class="btn-agregar agotado" disabled>Pregunta al mesero</button>`;

    const precio = tienePrecio(p)
        ? `<div class="product-price">${money(p.precio)}</div>`
        : `<div class="product-price sin-precio">Consultar</div>`;

    return `
    <div class="product-card ${p.agotado ? 'is-agotado' : ''}" data-plato="${p.id}">
        <div class="product-image">${foto}${sello}</div>
        <div class="product-content">
            <div class="product-header">
                <h3 class="product-title">${p.nombre}</h3>
                ${precio}
            </div>
            ${p.descripcion ? `<p class="product-description">${p.descripcion}</p>` : ''}
            ${boton}
        </div>
    </div>`;
}

function filaLista(p) {
    const boton = p.agotado
        ? `<span class="lista-agotado">Agotado</span>`
        : tienePrecio(p)
            ? `<button class="btn-mini" data-add="${p.id}" aria-label="Agregar ${p.nombre}"><i class="fas fa-plus"></i></button>`
            : '';

    const precio = tienePrecio(p)
        ? `<span class="portion-price">${money(p.precio)}</span>`
        : `<span class="portion-price sin-precio">Consultar</span>`;

    return `
    <div class="portion-item ${p.agotado ? 'is-agotado' : ''}" data-plato="${p.id}">
        <span class="portion-name">${p.nombre}</span>
        <span class="portion-right">
            ${precio}
            ${boton}
        </span>
    </div>`;
}

function renderMenu(menu) {
    document.getElementById('menu-body').innerHTML = menu
        .filter(c => c.platos.length)
        .map(cat => `
        <section id="${cat.id}">
            <h2 class="section-title"><i class="fas ${cat.icono}"></i> ${cat.nombre}</h2>
            ${cat.descripcion ? `<p class="section-description">${cat.descripcion}</p>` : ''}
            ${cat.estilo === 'lista'
                ? `<div class="portion-list">${cat.platos.map(filaLista).join('')}</div>`
                : `<div class="products-grid">${cat.platos.map(tarjetaPlato).join('')}</div>`}
        </section>`).join('');
}

function renderInfoLocal() {
    document.getElementById('frase-espera').textContent = CFG.frase;
    document.title = CFG.nombre;

    // El nombre y el lema solo se escriben si la plantilla los tiene: este
    // menú los quitó de arriba porque ya salen en el banner, pero otro
    // restaurante puede querer volver a ponerlos.
    const nombre = document.getElementById('rest-nombre');
    const lema   = document.getElementById('rest-lema');
    if (nombre) nombre.textContent = CFG.nombre;
    if (lema)   lema.textContent   = CFG.lema;

    document.getElementById('footer-info').innerHTML = `
        <h3>${CFG.nombre}</h3>
        <p>${CFG.lema}</p>
        <p>🕐 ${CFG.horario}</p>
        <p>📍 ${CFG.direccion}</p>
        <p>📞 ${CFG.telefono}</p>
        <p class="footer-legal">© ${new Date().getFullYear()} Todos los derechos reservados</p>`;
}

/* ============================================================
   2. CARRITO
   ============================================================ */

function totalCarrito() {
    return carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
}

function unidadesCarrito() {
    return carrito.reduce((s, i) => s + i.cantidad, 0);
}

function agregarPlato(id, silencioso) {
    const p = Store.findPlato(id);
    if (!p || p.agotado || !tienePrecio(p)) return;

    const existente = carrito.find(i => i.id === id);
    if (existente) existente.cantidad++;
    else carrito.push({ id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1 });

    Store.saveCarrito(carrito);
    actualizarBarra();
    if (!silencioso) volarAlCarrito(id);
}

function cambiarCantidad(id, delta) {
    const item = carrito.find(i => i.id === id);
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) carrito = carrito.filter(i => i.id !== id);
    Store.saveCarrito(carrito);
    actualizarBarra();
    renderCarrito();
}

/** Pequeña animación de confirmación al agregar. */
function volarAlCarrito(id) {
    const card = document.querySelector(`[data-plato="${id}"]`);
    if (card) {
        card.classList.remove('pulse');
        void card.offsetWidth;
        card.classList.add('pulse');
    }
    const barra = document.getElementById('cart-bar');
    barra.classList.remove('bump');
    void barra.offsetWidth;
    barra.classList.add('bump');
}

function actualizarBarra() {
    const barra = document.getElementById('cart-bar');
    const n = unidadesCarrito();

    if (n === 0) {
        barra.classList.remove('visible');
        document.body.classList.remove('cart-active');
        return;
    }
    barra.classList.add('visible');
    document.body.classList.add('cart-active');
    document.getElementById('cart-count').textContent = n === 1 ? '1 plato' : n + ' platos';
    document.getElementById('cart-total').textContent = money(totalCarrito());
}

/* ---------- Modal del pedido ---------- */

function sugerencias() {
    // Acompañantes que el cliente todavía no pidió (esto es lo que sube el ticket)
    const yaPedido = new Set(carrito.map(i => i.id));
    return Store.getMenuPublico()
        .filter(c => c.sugerible)
        .flatMap(c => c.platos)
        .filter(p => !p.agotado && tienePrecio(p) && !yaPedido.has(p.id))
        .slice(0, 4);
}

function renderCarrito() {
    const cuerpo = document.getElementById('cart-items');

    if (!carrito.length) {
        cuerpo.innerHTML = `<p class="cart-vacio">Todavía no has agregado nada.</p>`;
        document.getElementById('cart-modal-total').textContent = money(0);
        document.getElementById('cart-sugerencias').innerHTML = '';
        return;
    }

    cuerpo.innerHTML = carrito.map(i => `
        <div class="cart-item">
            <div class="cart-item-info">
                <span class="cart-item-nombre">${i.nombre}</span>
                <span class="cart-item-precio">${money(i.precio * i.cantidad)}</span>
            </div>
            <div class="cart-qty">
                <button data-qty="${i.id}" data-delta="-1" aria-label="Quitar uno">−</button>
                <span>${i.cantidad}</span>
                <button data-qty="${i.id}" data-delta="1" aria-label="Agregar uno">+</button>
            </div>
        </div>`).join('');

    document.getElementById('cart-modal-total').textContent = money(totalCarrito());

    const sug = sugerencias();
    document.getElementById('cart-sugerencias').innerHTML = sug.length ? `
        <div class="sugerencia-box">
            <p class="sugerencia-titulo"><i class="fas fa-lightbulb"></i> ¿Le agregas algo más?</p>
            <div class="sugerencia-chips">
                ${sug.map(p => `
                    <button class="chip-sugerencia" data-sugerir="${p.id}">
                        ${p.nombre} <strong>+${money(p.precio)}</strong>
                    </button>`).join('')}
            </div>
        </div>` : '';
}

function abrirCarrito() {
    renderCarrito();
    document.getElementById('cart-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function cerrarCarrito() {
    document.getElementById('cart-modal').classList.remove('open');
    document.body.style.overflow = '';
}

/* ============================================================
   3. CONFIRMAR PEDIDO → COMANDA PARA EL MESERO
   ============================================================ */

let sugerenciaAceptada = false;

/**
 * Antes de mandar nada hay que saber la mesa. El QR pega en la mesa
 * pero manda al menú sin decir cuál es, así que se pregunta con un
 * toque. Sin esto la comida puede terminar en la mesa equivocada.
 */
function confirmarPedido() {
    if (!carrito.length) return;

    const total = Number(CFG.mesas) || 11;
    document.getElementById('mesa-botones').innerHTML =
        Array.from({ length: total }, (_, i) => i + 1)
             .map(n => `<button class="mesa-btn" data-mesa="${n}">${n}</button>`).join('');

    document.getElementById('mesa-modal').classList.add('open');
}

function cerrarMesaModal() {
    document.getElementById('mesa-modal').classList.remove('open');
}

function enviarPedido(mesa) {
    if (!carrito.length) return;
    cerrarMesaModal();

    const nota = document.getElementById('pedido-nota').value.trim();
    const items = carrito.map(i => ({ ...i, platoId: i.id }));

    /* El pedido no entra directo a la cocina: cae en la bandeja del
       mesero, que lo confirma de un toque. Así nadie puede meterle
       platos falsos a la parrilla desde el celular. */
    if (typeof Servicio !== 'undefined') {
        Servicio.enviarEntrante({ mesa, items, nota });
    }

    // Se guarda también aquí para el aviso de progreso y las estadísticas
    const pedido = Store.guardarPedido({
        items: carrito.map(i => ({ ...i })),
        total: totalCarrito(),
        mesa,
        nota,
        aceptoSugerencia: sugerenciaAceptada
    });

    // El código se arma con lo que el comensal ya sabe: su mesa y sus
    // platos. "M3 · 2PO 1CA" se lee en voz alta tal cual.
    pedido.codigo = (typeof Servicio !== 'undefined')
        ? Servicio.codigoDe({ mesa, tanda: 0, items })
        : pedido.codigo;

    carrito = [];
    Store.limpiarCarrito();
    sugerenciaAceptada = false;
    document.getElementById('pedido-nota').value = '';   // que no se arrastre al siguiente pedido
    actualizarBarra();
    cerrarCarrito();
    // Buen momento para mandar lo que miró: ya decidió y la pantalla
    // se queda quieta en la comanda.
    Store.enviarVistas();
    mostrarComanda(pedido);

    if (typeof iniciarTracker === 'function') iniciarTracker(pedido);
}

function mostrarComanda(pedido) {
    const cont = document.getElementById('comanda-contenido');
    const hora = new Date(pedido.creado).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

    cont.innerHTML = `
        <div class="comanda-top">
            <div>
                <div class="comanda-etiqueta">${pedido.mesa ? 'Mesa ' + pedido.mesa : 'Pedido'}</div>
                <div class="comanda-mesa">${pedido.codigo}</div>
            </div>
            <div class="comanda-codigo">${hora}</div>
        </div>
        <div class="comanda-hora">${CFG.nombre}</div>
        <div class="comanda-sep"></div>
        <table class="comanda-items">
            ${pedido.items.map(i => `
                <tr>
                    <td class="c-cant">${i.cantidad}</td>
                    <td class="c-nom">${i.nombre}</td>
                    <td class="c-pre">${money(i.precio * i.cantidad)}</td>
                </tr>`).join('')}
        </table>
        ${pedido.nota ? `<div class="comanda-nota"><strong>Nota:</strong> ${pedido.nota}</div>` : ''}
        <div class="comanda-sep"></div>
        <div class="comanda-total">
            <span>TOTAL</span>
            <span>${money(pedido.total)}</span>
        </div>`;

    document.getElementById('comanda-modal').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Enlace de WhatsApp solo si el restaurante configuró un número
    const waBtn = document.getElementById('comanda-whatsapp');
    if (CFG.whatsapp) {
        const texto = encodeURIComponent(
            `*PEDIDO #${pedido.codigo}*\n` +
            pedido.items.map(i => `${i.cantidad}x ${i.nombre} — ${money(i.precio * i.cantidad)}`).join('\n') +
            (pedido.nota ? `\nNota: ${pedido.nota}` : '') +
            `\n*TOTAL: ${money(pedido.total)}*`
        );
        waBtn.href = `https://wa.me/${CFG.whatsapp}?text=${texto}`;
        waBtn.style.display = '';
    } else {
        waBtn.style.display = 'none';
    }
}

function cerrarComanda() {
    document.getElementById('comanda-modal').classList.remove('open');
    document.body.style.overflow = '';
}

/* ============================================================
   4. ESTADÍSTICAS DE INTERÉS (qué miran los clientes)
   ============================================================ */

function observarVistas() {
    if (!('IntersectionObserver' in window)) return;
    const vistos = new Set();

    const obs = new IntersectionObserver(entradas => {
        entradas.forEach(e => {
            const id = e.target.dataset.plato;
            if (e.isIntersecting && id && !vistos.has(id)) {
                vistos.add(id);
                Store.registrarVista(id);
            }
        });
    }, { threshold: 0.6 });

    document.querySelectorAll('[data-plato]').forEach(el => obs.observe(el));
}

/* ============================================================
   5. NAVEGACIÓN Y ARRANQUE
   ============================================================ */

function marcarCategoriaActiva() {
    const nav = document.getElementById('menu-nav');
    const secciones = [...document.querySelectorAll('#menu-body section')];
    if (!secciones.length) return;

    const obs = new IntersectionObserver(entradas => {
        entradas.forEach(e => {
            if (!e.isIntersecting) return;
            const enlace = nav.querySelector(`a[href="#${e.target.id}"]`);
            if (!enlace) return;
            nav.querySelectorAll('a').forEach(a => a.classList.remove('activo'));
            enlace.classList.add('activo');
            enlace.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    secciones.forEach(s => obs.observe(s));
}

function conectarEventos() {
    // Delegación: un solo listener para todo el menú
    document.addEventListener('click', e => {
        const add = e.target.closest('[data-add]');
        if (add) { agregarPlato(add.dataset.add); return; }

        const qty = e.target.closest('[data-qty]');
        if (qty) { cambiarCantidad(qty.dataset.qty, Number(qty.dataset.delta)); return; }

        const sug = e.target.closest('[data-sugerir]');
        if (sug) {
            sugerenciaAceptada = true;
            agregarPlato(sug.dataset.sugerir, true);
            renderCarrito();
            return;
        }

        const mesa = e.target.closest('[data-mesa]');
        if (mesa) { enviarPedido(Number(mesa.dataset.mesa)); return; }
    });

    document.getElementById('mesa-cancelar').addEventListener('click', cerrarMesaModal);
    document.getElementById('mesa-modal').addEventListener('click', e => {
        if (e.target.id === 'mesa-modal') cerrarMesaModal();
    });

    document.getElementById('cart-bar').addEventListener('click', abrirCarrito);
    document.getElementById('cart-close').addEventListener('click', cerrarCarrito);
    document.getElementById('cart-confirmar').addEventListener('click', confirmarPedido);
    document.getElementById('comanda-close').addEventListener('click', cerrarComanda);

    document.getElementById('cart-modal').addEventListener('click', e => {
        if (e.target.id === 'cart-modal') cerrarCarrito();
    });

    /* Lo que el comensal miró se manda de una sola vez cuando se va o
       cambia de app, no plato por plato mientras hace scroll: no corre
       ninguna prisa y así la red queda libre para lo que sí importa. */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) Store.enviarVistas();
    });
    window.addEventListener('pagehide', () => Store.enviarVistas());
}

/**
 * Vuelve a dibujar el menú conservando lo que el comensal ya tenía en
 * el carrito. Se usa cuando el gerente cambia algo desde el panel.
 */
function redibujarMenu() {
    const menu = Store.getMenuPublico();
    CFG = Store.getConfig();

    renderInfoLocal();
    renderNav(menu);
    renderMenu(menu);
    observarVistas();
    marcarCategoriaActiva();

    // Si algo del carrito se acaba de agotar, sale y se le avisa
    const antes = carrito.length;
    carrito = carrito.filter(i => {
        const p = Store.findPlato(i.id);
        return p && !p.agotado;
    });
    if (carrito.length !== antes) {
        Store.saveCarrito(carrito);
        avisarAgotado();
    }
    actualizarBarra();
    if (document.getElementById('cart-modal').classList.contains('open')) renderCarrito();
}

function avisarAgotado() {
    const aviso = document.getElementById('aviso-agotado');
    if (!aviso) return;
    aviso.classList.add('visible');
    clearTimeout(avisarAgotado._t);
    avisarAgotado._t = setTimeout(() => aviso.classList.remove('visible'), 6000);
}

/** Se engancha a la nube, si el restaurante la tiene configurada. */
function escucharCambiosDelLocal() {
    if (!Nube.activo) return;

    Nube.escuchar('menu/overrides', datos => {
        Store.aplicarOverridesRemotos(datos);
        redibujarMenu();
    });

    Nube.escuchar('config', datos => {
        Store.aplicarConfigRemota(datos);
        CFG = Store.getConfig();
        renderInfoLocal();
    });
}

function iniciarApp() {
    CFG = Store.getConfig();
    const menu = Store.getMenuPublico();

    renderInfoLocal();
    renderNav(menu);
    renderMenu(menu);

    carrito = Store.getCarrito().filter(i => {
        const p = Store.findPlato(i.id);
        return p && !p.agotado;   // si algo se agotó mientras tanto, sale del carrito
    });
    Store.saveCarrito(carrito);

    conectarEventos();
    actualizarBarra();
    observarVistas();
    marcarCategoriaActiva();
    escucharCambiosDelLocal();
}

document.addEventListener('DOMContentLoaded', iniciarApp);
