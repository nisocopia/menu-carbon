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

/* ------------------------------------------------------------
   LO QUE QUEDA

   Este celular NO puede contar. Para saber cuántos pollos quedan hay
   que restar lo que se pidió, y lo pedido son las comandas de las
   mesas: pedidos de otra gente, que no le tocan a un desconocido.

   Así que lee un espejo. El celular del que toma el pedido publica
   cuántos quedan y aquí solo se muestra. Si el espejo se atrasa no se
   vende de más: este pedido pasa por el mesero, y el mesero sí tiene la
   cuenta buena.
   ------------------------------------------------------------ */

const quedanDe = p => {
    const espejo = Store.getEspejo();
    const producto = p.usa || p.id;
    return typeof espejo[producto] === 'number' ? espejo[producto] : null;
};

const sePuedePedir = p => !p.agotado && quedanDe(p) !== 0;

/**
 * "Quedan 3", y solo desde 5 hacia abajo.
 *
 * Más arriba no es información, es ruido — y además le estaría contando
 * al comensal cuánto compró el local. Con cinco o menos sí sirve: es
 * cuando una mesa de cuatro tiene que decidir rápido.
 */
function quedanPocos(p) {
    const q = quedanDe(p);
    return q !== null && q > 0 && q <= 5
        ? `<span class="quedan-pocos">Quedan ${q}</span>` : '';
}

/* ============================================================
   1. DIBUJAR EL MENÚ DESDE LOS DATOS
   ============================================================ */

function renderNav(menu) {
    document.getElementById('menu-nav').innerHTML = menu
        .filter(c => c.platos.length)
        .map(c => `<a href="#${c.id}"><i class="fas ${c.icono}"></i> ${c.nombre}</a>`)
        .join('');
}

/**
 * Lo que va en lugar de la foto cuando el plato no la tiene, o cuando
 * la foto no llegó. Lleva el icono de su categoría: un recuadro vacío
 * en medio de fotos de platos parece un menú roto.
 */
const sinFoto = icono =>
    `<div class="image-placeholder"><i class="fas ${icono || 'fa-utensils'}"></i><span>Foto próximamente</span></div>`;

const imgPlato = (src, alt, icono) =>
    `<img src="${src}" alt="${alt}" loading="lazy" decoding="async" data-icono="${icono || ''}">`;

/**
 * Varias fotos del mismo plato, una al lado de otra. Se pasan con el
 * dedo (el navegador hace el deslizamiento y el encaje) y, con ratón,
 * con las flechas o los puntos. No cambian solas: la foto la elige
 * quien está mirando.
 */
function carruselFotos(p, fotos, icono) {
    const n = fotos.length;
    return `
        <div class="fotos-pista">${fotos.map((src, i) => imgPlato(src, `${p.nombre} — foto ${i + 1} de ${n}`, icono)).join('')}</div>
        <button class="foto-flecha ant" data-foto="ant" aria-label="Foto anterior"><i class="fas fa-chevron-left"></i></button>
        <button class="foto-flecha sig" data-foto="sig" aria-label="Foto siguiente"><i class="fas fa-chevron-right"></i></button>
        <div class="fotos-puntos">${fotos.map((_, i) =>
            `<button data-foto="${i}" class="${i ? '' : 'activa'}" aria-label="Ver foto ${i + 1} de ${n}"></button>`).join('')}</div>`;
}

/** Lleva el carrusel a la foto pedida: 'ant', 'sig' o su número. */
function pasarFoto(boton) {
    const pista = boton.closest('.product-image').querySelector('.fotos-pista');
    const total = pista.children.length;
    const actual = Math.round(pista.scrollLeft / pista.clientWidth);
    const pedida = boton.dataset.foto;
    const destino = pedida === 'sig' ? (actual + 1) % total
                  : pedida === 'ant' ? (actual - 1 + total) % total
                  : Number(pedida);
    pista.scrollTo({ left: destino * pista.clientWidth, behavior: 'smooth' });
}

function tarjetaPlato(p, icono) {
    const fotos = [p.img, ...(p.masFotos || [])].filter(Boolean);
    const foto = fotos.length > 1 ? carruselFotos(p, fotos, icono)
               : fotos.length     ? imgPlato(fotos[0], p.nombre, icono)
               : sinFoto(icono);

    const sello = p.destacado && sePuedePedir(p)
        ? `<span class="badge-destacado"><i class="fas fa-star"></i> El más pedido</span>` : '';

    const boton = !sePuedePedir(p)
        ? `<button class="btn-agregar agotado" disabled>Agotado hoy</button>`
        : tienePrecio(p)
            ? `<button class="btn-agregar" data-add="${p.id}"><i class="fas fa-plus"></i> Agregar</button>`
            : `<button class="btn-agregar agotado" disabled>Pregunta al mesero</button>`;

    const precio = tienePrecio(p)
        ? `<div class="product-price">${money(p.precio)}</div>`
        : `<div class="product-price sin-precio">Consultar</div>`;

    return `
    <div class="product-card ${sePuedePedir(p) ? '' : 'is-agotado'}" data-plato="${p.id}">
        <div class="product-image">${foto}${sello}${quedanPocos(p)}</div>
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
    const boton = !sePuedePedir(p)
        ? `<span class="lista-agotado">Agotado</span>`
        : tienePrecio(p)
            ? `<button class="btn-mini" data-add="${p.id}" aria-label="Agregar ${p.nombre}"><i class="fas fa-plus"></i></button>`
            : '';

    const precio = tienePrecio(p)
        ? `<span class="portion-price">${money(p.precio)}</span>`
        : `<span class="portion-price sin-precio">Consultar</span>`;

    return `
    <div class="portion-item ${sePuedePedir(p) ? '' : 'is-agotado'}" data-plato="${p.id}">
        <span class="portion-name">${p.nombre} ${quedanPocos(p)}</span>
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
                : `<div class="products-grid">${cat.platos.map(p => tarjetaPlato(p, cat.icono)).join('')}</div>`}
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
    if (!p || !sePuedePedir(p) || !tienePrecio(p)) return;

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
        .filter(p => sePuedePedir(p) && tienePrecio(p) && !yaPedido.has(p.id))
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

    /* EL HORARIO SE MIRA ANTES DE PREGUNTAR LA MESA. Hacerle elegir
       mesa para después decirle que está cerrado es hacerle perder el
       tiempo dos veces. Esto es la cortesía; quien de verdad lo impide
       son las reglas de Firebase, que miran la hora del servidor. */
    const hora = (typeof Servicio !== 'undefined') ? Servicio.horaDePedir() : { ok: true };
    if (!hora.ok) {
        avisar(`Los pedidos desde el celular se toman de ${horaEnLetras(hora.desde)} a ` +
               `${horaEnLetras(hora.hasta)}. Llama al mesero y con gusto te atiende.`, 9);
        return;
    }

    // La librería del código se va bajando mientras el comensal elige
    if (Nube.activo) cargarQR();

    /* A domicilio no hay mesa ni mesero delante: va a su formulario.
       Y si el enlace ya no sirve, se le dice ANTES de que escriba su
       dirección para nada. */
    if (DOMICILIO) {
        if (enlaceDomicilio && enlaceDomicilio.estado !== 'ok' && enlaceDomicilio.estado !== 'sin-red') {
            avisar(MOTIVO_ENLACE[enlaceDomicilio.estado] || MOTIVO_ENLACE.invalido, 9);
            return;
        }
        abrirDomicilio();
        return;
    }

    /* Sin nube no hay código que escanear: el comensal le enseña la
       pantalla al mesero, como antes de todo esto. */
    pintarPaso(Nube.activo ? 'como' : 'mesa');
    document.getElementById('mesa-modal').classList.add('open');
}

/**
 * El panel de "¿cómo lo quieres?" en sus tres pasos. Es un solo panel
 * que cambia de contenido: tres ventanas una encima de otra confunden a
 * quien no está acostumbrado a pedir por el celular.
 */
function pintarPaso(paso) {
    const panel = document.getElementById('mesa-panel');
    const volver = Nube.activo && paso !== 'como'
        ? `<button class="mesa-cancelar" data-paso="como">Volver</button>`
        : `<button class="mesa-cancelar" data-cerrar-mesa>Volver</button>`;

    if (paso === 'como') {
        panel.innerHTML = `
            <h2><i class="fas fa-receipt"></i> ¿Cómo lo quieres?</h2>
            <p>Te damos un código para que se lo muestres al mesero.</p>
            <div class="como-opciones">
                <button class="como-btn" data-paso="mesa">
                    <i class="fas fa-utensils"></i> Para comer aquí
                </button>
                <button class="como-btn" data-paso="llevar">
                    <i class="fas fa-bag-shopping"></i> Para llevar
                </button>
            </div>
            ${volver}`;
        return;
    }

    if (paso === 'llevar') {
        panel.innerHTML = `
            <h2><i class="fas fa-bag-shopping"></i> ¿A nombre de quién?</h2>
            <p>Para entregarte tu pedido cuando esté listo.</p>
            <label class="campo"><span>Tu nombre</span>
                <input id="llevar-nombre" maxlength="30" autocomplete="given-name" autocapitalize="words"></label>
            <button class="btn-confirmar como-enviar" data-enviar-llevar>
                <i class="fas fa-paper-plane"></i> Enviar pedido
            </button>
            ${volver}`;
        const campo = document.getElementById('llevar-nombre');
        try { campo.value = localStorage.getItem('menu_mi_nombre') || ''; } catch (e) {}
        campo.focus();
        return;
    }

    const total = Number(CFG.mesas) || 11;
    panel.innerHTML = `
        <h2><i class="fas fa-location-dot"></i> ¿En qué mesa estás?</h2>
        <p>${Nube.activo ? 'El mesero la confirma al escanear tu código.'
                         : 'Para que tu pedido llegue a tu mesa y no a otra.'}</p>
        <div class="mesa-botones" id="mesa-botones">
            ${Array.from({ length: total }, (_, i) => i + 1)
                .map(n => `<button class="mesa-btn" data-mesa="${n}">${n}</button>`).join('')}
        </div>
        ${volver}`;
}

function cerrarMesaModal() {
    document.getElementById('mesa-modal').classList.remove('open');
}

/* ============================================================
   EL PEDIDO CON SU CÓDIGO QR

   Desde el celular del comensal el pedido no le llega solo a nadie. Se
   guarda en la nube bajo un código al azar y se le enseña como QR: el
   mesero lo escanea en la mesa, delante de quien pidió, y solo entonces
   lo ve y lo acepta. Así, quien guardó la dirección del menú y pide
   desde su casa no llega a ninguna pantalla.

   La mesa que se toca aquí es una sugerencia: la pone el mesero, que
   está parado delante de ella.
   ============================================================ */

const LLAVE_QR = 'menu_pedido_qr';       // el pedido que espera, en ESTE celular
const LLAVE_INTENTO = 'menu_qr_intento';  // el código de un envío que no se sabe si salió

const leerLocal = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const guardarLocal = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/**
 * La librería que dibuja el QR, solo cuando hace falta: son 58 KB que
 * el que mira el menú sin pedir no tiene por qué bajar. Lleva la misma
 * marca de versión que este archivo, así que el ayudante la guarda.
 */
let cargandoQR = null;
function cargarQR() {
    if (typeof qrcode !== 'undefined') return Promise.resolve(true);
    if (cargandoQR) return cargandoQR;
    cargandoQR = new Promise(res => {
        const yo = document.querySelector('script[src*="js/app.js"]');
        const s = document.createElement('script');
        s.src = yo ? yo.getAttribute('src').replace('js/app.js', 'js/qrcode.js') : 'js/qrcode.js';
        s.onload = () => res(true);
        s.onerror = () => { cargandoQR = null; res(false); };
        document.head.appendChild(s);
    });
    return cargandoQR;
}

/** Lo que identifica un envío: el mismo pedido reintentado lleva el mismo código. */
const firmaDe = datos => JSON.stringify([datos.tipo, datos.mesa || 0, datos.nombre || '',
    carrito.map(i => [i.id, i.cantidad]), document.getElementById('pedido-nota').value.trim()]);

let enviandoQR = false;

async function enviarConQR(datos) {
    if (!carrito.length || enviandoQR) return;
    enviandoQR = true;

    const boton = document.querySelector('#mesa-panel .como-enviar, #mesa-panel .mesa-btn');
    const panel = document.getElementById('mesa-panel');
    panel.classList.add('enviando');

    /* SI SE CORTA A MEDIAS, EL REINTENTO NO DUPLICA. El código se apunta
       antes de mandar; si el mismo pedido se vuelve a mandar, sale con el
       mismo código, y la nube solo deja crearlo una vez. */
    const firma = firmaDe(datos);
    const intento = leerLocal(LLAVE_INTENTO, null);
    const codigo = intento && intento.firma === firma ? intento.codigo : Servicio.codigoSeguro(16);
    guardarLocal(LLAVE_INTENTO, { firma, codigo });

    const nota = document.getElementById('pedido-nota').value.trim();
    const items = carrito.map(i => ({ ...i, platoId: i.id }));

    let r;
    try {
        r = await Servicio.crearPedidoQR({ codigo, tipo: datos.tipo, mesa: datos.mesa,
                                           nombre: datos.nombre, items, nota });
    } catch (e) {
        r = { ok: false, motivo: 'no-salio' };
    } finally {
        enviandoQR = false;
        panel.classList.remove('enviando');
    }
    void boton;

    if (!r.ok) {
        const hora = Servicio.horaDePedir();
        avisar(r.motivo === 'negado'
            ? `Ahora no se toman pedidos desde el celular (de ${horaEnLetras(hora.desde)} a ` +
              `${horaEnLetras(hora.hasta)}). Llama al mesero y con gusto te atiende.`
            : 'No se pudo enviar el pedido. Revisa tu conexión e inténtalo otra vez.', 10);
        return;                                   // el carrito se queda como estaba
    }

    guardarLocal(LLAVE_INTENTO, null);
    if (datos.nombre) { try { localStorage.setItem('menu_mi_nombre', datos.nombre); } catch (e) {} }

    guardarLocal(LLAVE_QR, {
        clase: 'qr', codigo: r.codigo, tipo: datos.tipo, mesa: datos.mesa || 0,
        nombre: datos.nombre || '', items: carrito.map(i => ({ ...i })), nota,
        total: totalCarrito(), sugerencia: sugerenciaAceptada,
        enviado: Date.now(), estado: 'pendiente'
    });

    vaciarCarrito();
    cerrarMesaModal();
    mostrarQR();
    seguirElPedido();
}

/** El pedido salió: el carrito se vacía, como se vaciaba antes. */
function vaciarCarrito() {
    carrito = [];
    Store.limpiarCarrito();
    sugerenciaAceptada = false;
    document.getElementById('pedido-nota').value = '';
    actualizarBarra();
    cerrarCarrito();
    Store.enviarVistas();
}

/* ---------- La pantalla del código y del estado ---------- */

const TEXTOS_QR = {
    pendiente: ['Tu pedido fue enviado', 'Muestra este código QR al mesero para confirmar tu pedido.'],
    aceptado:  ['Tu pedido fue aceptado', 'Ya está en la cocina. Te avisamos aquí cómo va.'],
    rechazado: ['El mesero no aceptó este pedido', 'Pregúntale qué pasó. Puedes volver a armarlo.'],
    vencido:   ['Este código venció', 'Nadie lo escaneó a tiempo. Vuelve a enviar tu pedido.']
};

const TEXTOS_DOMI = {
    pendiente: ['Tu pedido fue enviado al restaurante', 'Tu pedido está pendiente de aceptación por el restaurante.'],
    aceptado:  ['Tu pedido fue aceptado', 'Ya lo estamos preparando para llevártelo.'],
    rechazado: ['El restaurante no pudo aceptar tu pedido', 'Escríbenos por WhatsApp para saber qué pasó.'],
    vencido:   ['Tu pedido no se confirmó a tiempo', 'Escríbenos por WhatsApp para saber qué pasó.']
};

function mostrarQR() {
    const a = leerLocal(LLAVE_QR, null);
    if (!a) return;

    pintarQR(a);
    document.getElementById('qr-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    pintarPastilla();
}

function cerrarQR() {
    document.getElementById('qr-modal').classList.remove('open');
    document.body.style.overflow = '';
    const a = leerLocal(LLAVE_QR, null);
    // Lo resuelto ya se leyó: se va. Lo que espera sigue en la pastilla.
    if (a && a.estado !== 'pendiente' && a.estado !== 'enviando') guardarLocal(LLAVE_QR, null);
    pintarPastilla();
}

async function pintarQR(a) {
    const domicilio = a.clase === 'domicilio';
    const [titulo, texto] = (domicilio ? TEXTOS_DOMI : TEXTOS_QR)[a.estado] || TEXTOS_QR.pendiente;
    const conCodigo = !domicilio && a.estado === 'pendiente';

    const quien = domicilio ? 'A domicilio · ' + a.nombre
                : a.tipo === 'llevar' ? 'Para llevar · ' + a.nombre
                : 'Mesa ' + a.mesa;

    document.getElementById('qr-papel').innerHTML = `
        <div class="qr-estado ${a.estado}">
            <strong>${titulo}</strong>
            <span>${texto}</span>
        </div>
        ${conCodigo ? `<div class="qr-codigo" id="qr-codigo"></div>
                       <p class="qr-espera"><span class="qr-punto"></span> Tu pedido está esperando confirmación</p>` : ''}
        ${domicilio && a.estado === 'pendiente'
            ? `<p class="qr-espera"><span class="qr-punto"></span> Esperando que el restaurante lo acepte</p>` : ''}
        <div class="qr-resumen">
            <div class="qr-quien">${escapar(quien)}</div>
            ${a.items.map(i => `<div class="qr-linea"><span>${i.cantidad} ${escapar(i.nombre)}</span>
                                <span>${money(i.precio * i.cantidad)}</span></div>`).join('')}
            ${a.nota ? `<div class="qr-nota">${escapar(a.nota)}</div>` : ''}
            <div class="qr-linea qr-total"><span>Total</span><span>${money(a.total)}</span></div>
        </div>`;

    const otraVez = a.estado === 'rechazado' || a.estado === 'vencido';
    document.getElementById('qr-acciones').innerHTML = `
        ${otraVez ? `<button class="btn-confirmar" data-qr-otra-vez><i class="fas fa-rotate-left"></i> Volver a armar el pedido</button>` : ''}
        ${domicilio && otraVez && CFG.whatsapp ? `<a class="btn-wa" target="_blank" rel="noopener"
            href="https://wa.me/${CFG.whatsapp}"><i class="fab fa-whatsapp"></i> Escribir por WhatsApp</a>` : ''}
        <button class="btn-cerrar-comanda" data-qr-cerrar>${a.estado === 'pendiente' ? 'Seguir viendo el menú' : 'Listo'}</button>`;

    if (!conCodigo) return;

    // El QR es un enlace a la comanda: el escáner de la app lo lee, y la
    // cámara normal del celular también lo abre
    const caja = document.getElementById('qr-codigo');
    const hay = await cargarQR();
    if (!hay || typeof qrcode === 'undefined') {
        caja.innerHTML = `<p class="qr-sin">No se pudo dibujar el código. Revisa tu conexión y vuelve a abrir esta pantalla.</p>`;
        return;
    }
    const q = qrcode(0, 'M');
    q.addData(enlaceDelCodigo(a.codigo));
    q.make();
    caja.innerHTML = q.createSvgTag(6, 3);
}

/** A dónde lleva el QR: a la comanda del mesero, con el pedido ya abierto. */
const enlaceDelCodigo = codigo =>
    location.href.split(/[?#]/)[0].replace(/[^/]*$/, '') + 'comanda.html?qr=' + codigo;

/** Lo que escribe el comensal no puede pintar HTML en ninguna pantalla. */
const escapar = t => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** El botón chico que queda abajo mientras el pedido espera. */
function pintarPastilla() {
    const p = document.getElementById('qr-pill');
    const a = leerLocal(LLAVE_QR, null);
    const abierto = document.getElementById('qr-modal').classList.contains('open');
    if (!a || abierto) { p.hidden = true; document.body.classList.remove('qr-esperando'); return; }

    p.hidden = false;
    document.body.classList.add('qr-esperando');
    p.className = 'qr-pill ' + a.estado;
    p.innerHTML = a.estado === 'pendiente'
        ? (a.clase === 'domicilio'
            ? '<i class="fas fa-clock"></i> Tu pedido espera aceptación · Ver'
            : '<i class="fas fa-receipt"></i> Tu pedido espera · Ver mi código')
        : a.estado === 'aceptado' ? '<i class="fas fa-check"></i> Tu pedido fue aceptado · Ver'
        : '<i class="fas fa-circle-exclamation"></i> Tu pedido no se aceptó · Ver';
}

/* ---------- Seguirle la pista ---------- */

let siguiendo = null;

/**
 * Pregunta cada pocos segundos en qué va el pedido. Es una pregunta
 * suelta y no un canal abierto: el comensal no tiene cuenta, y en cuanto
 * el pedido se resuelve deja de preguntar.
 */
function seguirElPedido() {
    clearTimeout(siguiendo);
    const a = leerLocal(LLAVE_QR, null);
    if (!a || a.estado !== 'pendiente') return;

    siguiendo = setTimeout(async () => {
        if (document.hidden) { seguirElPedido(); return; }      // se retoma al volver
        let estado;
        try {
            estado = a.clase === 'domicilio'
                ? await Servicio.estadoDomicilio(a.enlace, a.id)
                : await Servicio.estadoPedidoQR(a.codigo);
        } catch (e) { estado = undefined; }

        const ahora = leerLocal(LLAVE_QR, null);
        if (!ahora || ahora.enviado !== a.enviado) return;     // ya es otro pedido
        if (estado && estado !== 'no-existe' && estado !== ahora.estado) {
            ahora.estado = estado;
            guardarLocal(LLAVE_QR, ahora);
            alResolverse(ahora);
            if (document.getElementById('qr-modal').classList.contains('open')) pintarQR(ahora);
            pintarPastilla();
        }
        seguirElPedido();
    }, 4000);
}

/** Aceptado: arranca el aviso de "tu pedido va en camino", como antes. */
function alResolverse(a) {
    if (a.estado !== 'aceptado') return;
    const pedido = Store.guardarPedido({
        items: a.items, total: a.total, mesa: a.mesa || 0, nota: a.nota,
        aceptoSugerencia: !!a.sugerencia
    });
    if (typeof iniciarTracker === 'function') iniciarTracker(pedido);
}

/** Rechazado o vencido: lo que había elegido vuelve al carrito. */
function volverAArmar() {
    const a = leerLocal(LLAVE_QR, null);
    if (!a) return;
    carrito = a.items
        .map(i => Object.assign({}, i))
        .filter(i => { const p = Store.findPlato(i.id); return p && sePuedePedir(p); });
    Store.saveCarrito(carrito);
    document.getElementById('pedido-nota').value = a.nota || '';
    guardarLocal(LLAVE_QR, null);
    cerrarQR();
    actualizarBarra();
    if (carrito.length) abrirCarrito();
}

/* ============================================================
   A DOMICILIO

   Se entra por un enlace que manda el restaurante por WhatsApp
   (index.html?d=…). El enlace caduca, se puede apagar y admite los
   pedidos que diga el gerente: lo cumplen las reglas de la nube, no
   esta página.
   ============================================================ */

const DOMICILIO = (() => {
    try { return new URLSearchParams(location.search).get('d') || ''; } catch (e) { return ''; }
})();

let enlaceDomicilio = null;

const MOTIVO_ENLACE = {
    invalido: 'Este enlace no es válido. Pídele uno nuevo al restaurante.',
    revocado: 'Este enlace ya no está activo. Solicita uno nuevo al restaurante.',
    vencido:  'Este enlace ha expirado. Solicita uno nuevo al restaurante.',
    agotado:  'Este enlace ya se usó. Solicita uno nuevo al restaurante.',
    espera:   'Acabas de enviar un pedido. Espera unos segundos antes de mandar otro.',
    'sin-red': 'No se pudo comprobar el enlace. Revisa tu conexión.',
    'no-salio': 'No se pudo enviar el pedido. Revisa tu conexión e inténtalo otra vez.'
};

async function revisarEnlace() {
    if (!DOMICILIO || typeof Servicio === 'undefined') return;
    const banner = document.getElementById('domi-banner');
    document.body.classList.add('modo-domicilio');
    document.getElementById('cart-confirmar').innerHTML =
        '<i class="fas fa-location-dot"></i> Continuar con la dirección';

    enlaceDomicilio = await Servicio.leerEnlace(DOMICILIO);
    const ok = enlaceDomicilio.estado === 'ok' || enlaceDomicilio.estado === 'sin-red';
    banner.hidden = false;
    banner.className = 'domi-banner' + (ok ? '' : ' cerrado');
    banner.innerHTML = ok
        ? '<i class="fas fa-location-dot"></i> <span>Estás haciendo un <b>pedido a domicilio</b></span>'
        : `<i class="fas fa-circle-exclamation"></i> <span>${MOTIVO_ENLACE[enlaceDomicilio.estado] || MOTIVO_ENLACE.invalido}</span>`;
}

const CAMPOS_DOMI = ['nombre', 'telefono', 'maps', 'ciudad', 'sector', 'calle', 'numero', 'referencia'];

function abrirDomicilio() {
    /* Lo que escribió la vez anterior, en este mismo celular: el cliente
       que repite no tiene por qué volver a teclear su casa. */
    const antes = leerLocal('menu_mi_direccion', {});
    CAMPOS_DOMI.forEach(k => {
        const c = document.getElementById('domi-' + k);
        if (c && !c.value) c.value = antes[k] || '';
    });
    document.getElementById('domi-error').textContent = '';
    document.getElementById('domi-modal').classList.add('open');
}

const cerrarDomicilio = () => document.getElementById('domi-modal').classList.remove('open');

/**
 * Del texto que pegó, el enlace. Google Maps comparte "Mi ubicación
 * https://maps.app.goo.gl/…" y la gente lo pega entero.
 */
function enlaceDeMaps(texto) {
    const t = String(texto || '').trim();
    if (!t) return '';
    const m = t.match(/https?:\/\/\S+/i);
    if (m) return m[0].replace(/^http:/i, 'https:');
    if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.)/i.test(t)) return 'https://' + t;
    return null;                      // escribió algo, pero no es un enlace
}

function ubicarme() {
    const boton = document.getElementById('domi-ubicarme');
    if (!navigator.geolocation) { avisar('Este celular no deja usar la ubicación. Pega el enlace o escribe tu dirección.', 8); return; }
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-clock"></i> Buscando dónde estás…';
    navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        document.getElementById('domi-maps').value =
            `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        boton.disabled = false;
        boton.innerHTML = '<i class="fas fa-check"></i> Ubicación puesta';
    }, () => {
        boton.disabled = false;
        boton.innerHTML = '<i class="fas fa-location-dot"></i> Usar mi ubicación de ahora';
        avisar('No se pudo tomar tu ubicación. Pega el enlace de Google Maps o escribe tu dirección.', 8);
    }, { enableHighAccuracy: true, timeout: 15000 });
}

let enviandoDomi = false;

async function enviarDomicilio() {
    if (!carrito.length || enviandoDomi) return;
    const v = {};
    CAMPOS_DOMI.forEach(k => { v[k] = (document.getElementById('domi-' + k).value || '').trim(); });
    const error = document.getElementById('domi-error');

    const maps = enlaceDeMaps(v.maps);
    if (!v.nombre) { error.textContent = 'Escribe tu nombre.'; return; }
    if (!/^[0-9 +()-]{7,20}$/.test(v.telefono)) { error.textContent = 'Escribe un teléfono válido, solo números.'; return; }
    if (maps === null) { error.textContent = 'Eso no parece un enlace de Google Maps. Bórralo o pega el enlace completo.'; return; }
    if (!maps && !v.calle) { error.textContent = 'Pon tu ubicación o escribe al menos la calle.'; return; }
    error.textContent = '';

    enviandoDomi = true;
    const boton = document.getElementById('domi-enviar');
    boton.disabled = true;

    // El mismo pedido reintentado lleva el mismo número, y entra una sola vez
    const firma = JSON.stringify([DOMICILIO, carrito.map(i => [i.id, i.cantidad]), v]);
    const intento = leerLocal(LLAVE_INTENTO, null);
    const id = intento && intento.firma === firma ? intento.codigo : Servicio.codigoSeguro(12);
    guardarLocal(LLAVE_INTENTO, { firma, codigo: id });

    const nota = document.getElementById('pedido-nota').value.trim();
    let r;
    try {
        r = await Servicio.enviarDomicilio({
            enlace: DOMICILIO, id, nombre: v.nombre, telefono: v.telefono,
            direccion: { ciudad: v.ciudad, sector: v.sector, calle: v.calle, numero: v.numero },
            maps, referencia: v.referencia,
            items: carrito.map(i => ({ ...i, platoId: i.id })), nota
        });
    } catch (e) {
        r = { ok: false, motivo: 'no-salio' };
    } finally {
        enviandoDomi = false;
        boton.disabled = false;
    }

    if (!r.ok) {
        error.textContent = MOTIVO_ENLACE[r.motivo] || MOTIVO_ENLACE['no-salio'];
        if (['invalido', 'revocado', 'vencido', 'agotado'].includes(r.motivo)) {
            enlaceDomicilio = { estado: r.motivo };
            revisarEnlace();
        }
        return;
    }

    guardarLocal(LLAVE_INTENTO, null);
    guardarLocal('menu_mi_direccion', v);
    guardarLocal(LLAVE_QR, {
        clase: 'domicilio', enlace: DOMICILIO, id, nombre: v.nombre,
        items: carrito.map(i => ({ ...i })), nota, total: totalCarrito(),
        sugerencia: sugerenciaAceptada, enviado: Date.now(), estado: 'pendiente'
    });

    vaciarCarrito();
    cerrarDomicilio();
    mostrarQR();
    seguirElPedido();
}

/* ============================================================
   SIN NUBE: la comanda en pantalla, como antes
   ============================================================ */

async function enviarPedido(mesa) {
    if (!carrito.length) return;

    // Con nube, la mesa es solo una sugerencia que viaja con el código
    if (Nube.activo) { enviarConQR({ tipo: 'mesa', mesa }); return; }

    cerrarMesaModal();

    const nota = document.getElementById('pedido-nota').value.trim();
    const items = carrito.map(i => ({ ...i, platoId: i.id }));

    /* El pedido no entra directo a la cocina: cae en la bandeja del
       mesero, que lo confirma de un toque. Así nadie puede meterle
       platos falsos a la parrilla desde el celular.

       Y AHORA SE ESPERA LA RESPUESTA. Antes se mandaba y se seguía sin
       mirar, así que un pedido rechazado por la nube desaparecía en
       silencio: al comensal se le vaciaba el carrito y se le enseñaba
       su comanda como si todo hubiera ido bien. Si no salió, lo que
       eligió TIENE que seguir donde estaba. */
    if (typeof Servicio !== 'undefined') {
        const r = await Servicio.enviarEntrante({ mesa, items, nota });

        if (!r || !r.ok) {
            avisar(r && r.motivo === 'ya-pidio'
                ? 'Ya hiciste tu pedido y está esperando a que el mesero lo acepte. ' +
                  'Si quieres más platos, espera a que te acepte los primeros.'
                : 'No se pudo enviar el pedido. Llama al mesero y muéstrale la pantalla.', 10);
            return;                       // el carrito se queda como estaba
        }
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

        const foto = e.target.closest('[data-foto]');
        if (foto) { pasarFoto(foto); return; }

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

        // ¿Cómo lo quieres? — aquí, para llevar, y volver
        const paso = e.target.closest('[data-paso]');
        if (paso) { pintarPaso(paso.dataset.paso); return; }

        if (e.target.closest('[data-enviar-llevar]')) { enviarLlevar(); return; }
        if (e.target.closest('[data-cerrar-mesa]')) { cerrarMesaModal(); return; }

        // La pantalla del código
        if (e.target.closest('[data-qr-cerrar]')) { cerrarQR(); return; }
        if (e.target.closest('[data-qr-otra-vez]')) { volverAArmar(); return; }
        if (e.target.closest('#qr-pill')) { mostrarQR(); return; }

        // A domicilio
        if (e.target.closest('[data-cerrar-domi]')) { cerrarDomicilio(); return; }
        if (e.target.closest('#domi-enviar')) { enviarDomicilio(); return; }
        if (e.target.closest('#domi-ubicarme')) { ubicarme(); return; }
    });

    // El nombre del pedido para llevar se manda también con la tecla Enter
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target && e.target.id === 'llevar-nombre') { e.preventDefault(); enviarLlevar(); }
    });

    // Una foto que no llega (mal escrita, borrada, sin señal) deja en su
    // lugar el mismo recuadro de los platos sin foto, no un icono roto.
    // 'error' no burbujea: por eso se escucha en la captura.
    document.addEventListener('error', e => {
        const img = e.target;
        if (img.tagName === 'IMG' && img.closest('.product-image'))
            img.outerHTML = sinFoto(img.dataset.icono);
    }, true);

    // El punto encendido sigue a la foto que se ve, se llegue a ella con
    // el dedo, con la flecha o con el punto. Tampoco burbujea el scroll.
    document.addEventListener('scroll', e => {
        const pista = e.target;
        if (!pista.classList || !pista.classList.contains('fotos-pista')) return;
        const actual = Math.round(pista.scrollLeft / pista.clientWidth);
        pista.parentElement.querySelectorAll('.fotos-puntos button')
            .forEach((b, i) => b.classList.toggle('activa', i === actual));
    }, { capture: true, passive: true });

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
        else seguirElPedido();          // de vuelta: en qué va el pedido
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
        return p && sePuedePedir(p);
    });
    if (carrito.length !== antes) {
        Store.saveCarrito(carrito);
        avisarAgotado();
    }
    actualizarBarra();
    if (document.getElementById('cart-modal').classList.contains('open')) renderCarrito();
}

/**
 * La cinta roja de arriba, que ahora dice lo que haga falta.
 *
 * Era solo para "se agotó un plato" y llevaba el texto escrito en el
 * HTML. Los avisos del pedido —fuera de hora, o ya hay uno esperando—
 * tienen que salir por el mismo sitio: es donde el comensal ya está
 * acostumbrado a que le hablen, y meterle una ventana encima cuando
 * acaba de tocar "pedir" es una interrupción de más.
 */
function avisar(texto, segundos) {
    const aviso = document.getElementById('aviso-agotado');
    if (!aviso) return;

    const span = aviso.querySelector('span');
    if (span && texto) span.textContent = texto;

    aviso.classList.add('visible');
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => aviso.classList.remove('visible'), (segundos || 6) * 1000);
}

function avisarAgotado() {
    avisar('Se acaba de agotar un plato de tu pedido. Disculpa.');
}

/** "18:00" -> "6:00 pm", que es como se lee la hora aquí. */
function horaEnLetras(hhmm) {
    const p = String(hhmm || '').split(':');
    const h = Number(p[0]) || 0;
    const m = p[1] || '00';
    const doce = h % 12 === 0 ? 12 : h % 12;
    return `${doce}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** Se engancha a la nube, si el restaurante la tiene configurada. */
function escucharCambiosDelLocal() {
    if (!Nube.activo) return;

    /* LA RUTA Y EL TIPO DE AVISO SE PASAN TAL CUAL. Firebase manda la
       rama entera al conectar, pero después solo el hijo que cambió: si
       se guarda ese hijo como si fuera la rama, se borra todo lo demás.
       Un solo plato agotado dejaba la carta sin ningún otro agotado. */
    Nube.escuchar('menu/overrides', (datos, ruta, esRetoque) => {
        Store.aplicarOverridesRemotos(datos, ruta, esRetoque);
        redibujarMenu();
    });

    /* Cuántos quedan. Lo publica el celular del que toma el pedido:
       este no puede contarlo solo. */
    Nube.escuchar('stock', (datos, ruta, esRetoque) => {
        Store.aplicarEspejoRemoto(datos, ruta, esRetoque);
        redibujarMenu();
    });

    Nube.escuchar('config', (datos, ruta, esRetoque) => {
        Store.aplicarConfigRemota(datos, ruta, esRetoque);
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
        return p && sePuedePedir(p);   // si algo se agotó mientras tanto, sale del carrito
    });
    Store.saveCarrito(carrito);

    conectarEventos();
    actualizarBarra();
    observarVistas();
    marcarCategoriaActiva();
    escucharCambiosDelLocal();

    /* Un pedido que se mandó y todavía espera sigue a la vista, aunque
       se haya cerrado la página entre medio. */
    pintarPastilla();
    seguirElPedido();
    revisarEnlace();
}

/** Para llevar: sin nombre no sale, igual que en la comanda del mesero. */
function enviarLlevar() {
    const campo = document.getElementById('llevar-nombre');
    const nombre = campo ? campo.value.trim() : '';
    if (!nombre) { if (campo) { campo.focus(); campo.classList.add('error'); } return; }
    enviarConQR({ tipo: 'llevar', nombre });
}

document.addEventListener('DOMContentLoaded', iniciarApp);
