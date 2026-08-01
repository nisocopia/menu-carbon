/* ============================================================
   PANEL.JS  —  Panel del gerente
   El dueño controla su menú, ve sus pedidos y sus números
   sin depender de nadie.
   ============================================================ */

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

async function intentarEntrar() {
    const campo = document.getElementById('pin-input');
    const boton = document.getElementById('pin-btn');
    const clave = campo.value;

    const espera = bloqueoRestante();
    if (espera > 0) {
        mostrarError(`Demasiados intentos. Espera ${Math.ceil(espera / 60000)} min.`);
        return;
    }
    if (!clave) return;

    boton.disabled = true;
    boton.textContent = 'Verificando…';

    try {
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
        campo.value = '';
        boton.disabled = false;
        boton.textContent = 'Entrar';
    }
}

function sesionValida() {
    try {
        const s = JSON.parse(sessionStorage.getItem(SESION));
        return s && s.hasta > Date.now();
    } catch (e) { return false; }
}

function abrirPanel() {
    document.getElementById('lock-screen').style.display = 'none';
    document.getElementById('panel-app').hidden = false;
    renderTodo();
}

function cerrarSesion() {
    sessionStorage.removeItem(SESION);
    location.reload();
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

function renderResumenDia() {
    const pedidos = Store.getPedidos().filter(p => esDeHoy(p.creado));
    const ventas  = pedidos.reduce((s, p) => s + (p.total || 0), 0);
    const platos  = pedidos.reduce((s, p) => s + (p.items || []).reduce((a, i) => a + i.cantidad, 0), 0);

    document.getElementById('resumen-dia').innerHTML = `
        <div class="mini-kpi"><span>${pedidos.length}</span><small>pedidos hoy</small></div>
        <div class="mini-kpi"><span>${dinero(ventas)}</span><small>vendido hoy</small></div>
        <div class="mini-kpi"><span>${platos}</span><small>platos servidos</small></div>`;
}

function renderPedidos() {
    const lista = Store.getPedidos();
    const cont = document.getElementById('lista-pedidos');

    if (!lista.length) {
        cont.innerHTML = `<p class="vacio">Todavía no hay pedidos. Cuando un cliente pida desde el menú, aparecerá aquí.</p>`;
        return;
    }

    cont.innerHTML = lista.slice(0, 40).map(p => {
        const est = ESTADOS[p.estado] || ESTADOS.nuevo;
        const hora = new Date(p.creado).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
        const fecha = esDeHoy(p.creado) ? 'Hoy' : new Date(p.creado).toLocaleDateString('es-EC');

        return `
        <div class="pedido-card">
            <div class="pedido-top">
                <div>
                    <strong class="pedido-mesa">#${p.codigo}</strong>
                </div>
                <button class="estado ${est.clase}" data-estado="${p.id}">${est.texto}</button>
            </div>
            <div class="pedido-hora">${fecha} · ${hora}</div>
            <ul class="pedido-items">
                ${(p.items || []).map(i => `<li><span>${i.cantidad}×</span> ${i.nombre}</li>`).join('')}
            </ul>
            ${p.nota ? `<div class="pedido-nota"><i class="fas fa-note-sticky"></i> ${p.nota}</div>` : ''}
            <div class="pedido-total">${dinero(p.total)}</div>
        </div>`;
    }).join('');
}

/* ============================================================
   EDITOR DEL MENÚ
   ============================================================ */

function renderEditorMenu() {
    const menu = Store.getMenu();

    document.getElementById('editor-menu').innerHTML = menu.map(cat => `
        <div class="bloque">
            <h2><i class="fas ${cat.icono}"></i> ${cat.nombre}</h2>
            ${cat.platos.map(p => `
                <div class="fila-plato ${p.agotado ? 'agotado' : ''}">
                    <input class="in-nombre" type="text" value="${p.nombre.replace(/"/g, '&quot;')}"
                           data-campo="nombre" data-id="${p.id}">
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
    const s = Store.getStats();

    document.getElementById('kpi-grid').innerHTML = `
        <div class="kpi"><span class="kpi-valor">${s.totalPedidos}</span><span class="kpi-label">Pedidos</span></div>
        <div class="kpi"><span class="kpi-valor">${dinero(s.ingresos)}</span><span class="kpi-label">Vendido</span></div>
        <div class="kpi"><span class="kpi-valor">${dinero(s.ticketPromedio)}</span><span class="kpi-label">Ticket promedio</span></div>
        <div class="kpi"><span class="kpi-valor">${Math.round(s.tasaSugerencia * 100)}%</span><span class="kpi-label">Aceptó un extra</span></div>`;

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

function renderTodo() {
    cfgPanel = Store.getConfig();
    renderCabecera();
    renderResumenDia();
    renderPedidos();
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
        const pedido = Store.getPedidos().find(p => p.id === id);
        if (!pedido) return;
        Store.setEstadoPedido(id, (ESTADOS[pedido.estado] || ESTADOS.nuevo).siguiente);
        renderPedidos();
    });

    document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

    if (sesionValida()) abrirPanel();
    else document.getElementById('pin-input').focus();
});
