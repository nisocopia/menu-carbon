/* ============================================================
   STORE.JS  —  Capa de datos
   Guarda cambios del gerente, pedidos y estadísticas.
   Todo vive en el navegador (localStorage): cero servidor,
   cero costo mensual de hosting.
   ============================================================ */

const Store = (() => {

    const NS = 'menu_';
    const K = {
        overrides: NS + 'overrides',   // cambios de precio / agotados hechos por el gerente
        config:    NS + 'config',      // datos del local editados desde el panel
        pedidos:   NS + 'pedidos',     // historial de pedidos
        vistas:    NS + 'vistas',      // cuántas veces se vio cada plato
        pedidoAct: NS + 'pedido_activo',
        carrito:   NS + 'carrito'
    };

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* almacenamiento lleno o modo privado: la página sigue funcionando */
        }
    }

    /* ---------------- CONFIGURACIÓN DEL LOCAL ---------------- */

    function getConfig() {
        return Object.assign({}, RESTAURANTE, read(K.config, {}));
    }

    function saveConfig(patch) {
        const nueva = Object.assign(read(K.config, {}), patch);
        write(K.config, nueva);
        if (typeof Sync !== 'undefined' && Sync.activo && Sync.haySesion()) {
            Sync.guardar('config', nueva);
        }
    }

    /* ---------------- MENÚ CON CAMBIOS APLICADOS ---------------- */

    function getOverrides() {
        return read(K.overrides, {});
    }

    /** Devuelve el MENÚ base con los cambios del gerente ya aplicados. */
    function getMenu() {
        const ov = getOverrides();
        return MENU.map(cat => ({
            ...cat,
            platos: cat.platos.map(p => ({ ...p, ...(ov[p.id] || {}) }))
        }));
    }

    /** Lista plana de todos los platos (ya con cambios aplicados). */
    function getPlatos() {
        return getMenu().flatMap(c => c.platos.map(p => ({ ...p, categoria: c.nombre, catId: c.id })));
    }

    function findPlato(id) {
        return getPlatos().find(p => p.id === id) || null;
    }

    function setOverride(platoId, patch) {
        const ov = getOverrides();
        ov[platoId] = Object.assign(ov[platoId] || {}, patch);
        write(K.overrides, ov);
        subirOverrides(ov);
    }

    function resetOverrides() {
        localStorage.removeItem(K.overrides);
        subirOverrides({});
    }

    /** Publica los cambios para todos los celulares (si hay nube). */
    function subirOverrides(ov) {
        if (typeof Sync !== 'undefined' && Sync.activo && Sync.haySesion()) {
            Sync.guardar('menu/overrides', ov);
        }
    }

    /**
     * Guarda los cambios que llegan de la nube sin volver a subirlos,
     * para no entrar en un ciclo.
     */
    function aplicarOverridesRemotos(ov) {
        write(K.overrides, ov || {});
    }

    function aplicarConfigRemota(c) {
        if (c) write(K.config, c);
    }

    function toggleAgotado(platoId) {
        const p = findPlato(platoId);
        if (!p) return false;
        const nuevo = !p.agotado;
        setOverride(platoId, { agotado: nuevo });
        return nuevo;
    }

    /* ---------------- CARRITO ---------------- */

    function getCarrito()      { return read(K.carrito, []); }
    function saveCarrito(c)    { write(K.carrito, c); }
    function limpiarCarrito()  { localStorage.removeItem(K.carrito); }

    /* ---------------- PEDIDOS ---------------- */

    function getPedidos() {
        return read(K.pedidos, []);
    }

    /** Código corto y legible para que el mesero lo cante en cocina. */
    function nuevoCodigo() {
        const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        return letras[Math.floor(Math.random() * letras.length)] +
               String(Math.floor(Math.random() * 90) + 10);
    }

    function guardarPedido(pedido) {
        const lista = getPedidos();
        const registro = {
            ...pedido,
            id: Date.now(),
            codigo: nuevoCodigo(),
            creado: Date.now(),
            estado: 'nuevo'
        };
        lista.unshift(registro);
        // Se conservan los últimos 300 pedidos para no llenar el almacenamiento
        write(K.pedidos, lista.slice(0, 300));
        write(K.pedidoAct, registro);

        // Que le llegue al panel del gerente aunque el comensal esté en su
        // propio celular. Si falla la red, el pedido igual quedó en pantalla.
        if (typeof Sync !== 'undefined' && Sync.activo) {
            Sync.agregar('pedidos', registro);
        }
        return registro;
    }

    /** Mezcla los pedidos que llegan de la nube con los de este aparato. */
    function mezclarPedidosRemotos(remotos) {
        const propios = getPedidos();
        const porId = new Map(propios.map(p => [p.id, p]));

        Object.entries(remotos || {}).forEach(([llave, ped]) => {
            if (!ped || !ped.id) return;
            const previo = porId.get(ped.id);
            // El estado que puso el gerente manda sobre el que venía del pedido
            porId.set(ped.id, Object.assign({}, ped, previo ? { estado: previo.estado } : {}, { llaveNube: llave }));
        });

        return [...porId.values()].sort((a, b) => b.creado - a.creado);
    }

    function getPedidoActivo() {
        return read(K.pedidoAct, null);
    }

    function cerrarPedidoActivo() {
        localStorage.removeItem(K.pedidoAct);
    }

    function setEstadoPedido(id, estado) {
        const lista = getPedidos();
        const p = lista.find(x => x.id === id);
        if (p) { p.estado = estado; write(K.pedidos, lista); }
    }

    function borrarPedidos() {
        localStorage.removeItem(K.pedidos);
        localStorage.removeItem(K.pedidoAct);
    }

    /* ---------------- VISTAS (para las estadísticas) ---------------- */

    function registrarVista(platoId) {
        const v = read(K.vistas, {});
        v[platoId] = (v[platoId] || 0) + 1;
        write(K.vistas, v);
        if (typeof Sync !== 'undefined' && Sync.activo) {
            Sync.agregar('vistas', { plato: platoId, cuando: Date.now() });
        }
    }

    /** Suma a las vistas de este aparato las que llegan de la nube. */
    function mezclarVistasRemotas(remotas) {
        const total = Object.assign({}, read(K.vistas, {}));
        Object.values(remotas || {}).forEach(v => {
            if (v && v.plato) total[v.plato] = (total[v.plato] || 0) + 1;
        });
        return total;
    }

    function getVistas() { return read(K.vistas, {}); }

    /* ---------------- ESTADÍSTICAS ---------------- */

    /**
     * Si se le pasan pedidos y vistas ya mezclados con los de la nube,
     * calcula sobre esos; si no, sobre los de este aparato.
     */
    function getStats(pedidosDados, vistasDadas) {
        const pedidos = pedidosDados || getPedidos();
        const vistas  = vistasDadas  || getVistas();
        const platos  = getPlatos();

        const vendidos = {};   // platoId -> { cantidad, total }
        let ingresos = 0;
        let conSugerencia = 0;

        pedidos.forEach(ped => {
            ingresos += ped.total || 0;
            if (ped.aceptoSugerencia) conSugerencia++;
            (ped.items || []).forEach(it => {
                if (!vendidos[it.id]) vendidos[it.id] = { cantidad: 0, total: 0 };
                vendidos[it.id].cantidad += it.cantidad;
                vendidos[it.id].total    += it.cantidad * it.precio;
            });
        });

        const ranking = platos.map(p => {
            const v = vendidos[p.id] || { cantidad: 0, total: 0 };
            return {
                id: p.id,
                nombre: p.nombre,
                categoria: p.categoria,
                precio: p.precio,
                vistas: vistas[p.id] || 0,
                vendidos: v.cantidad,
                ingreso: v.total,
                // Interés sin ventas = la señal más útil para el dueño
                conversion: vistas[p.id] ? (v.cantidad / vistas[p.id]) : null
            };
        }).sort((a, b) => b.vendidos - a.vendidos || b.vistas - a.vistas);

        return {
            totalPedidos: pedidos.length,
            ingresos,
            ticketPromedio: pedidos.length ? ingresos / pedidos.length : 0,
            tasaSugerencia: pedidos.length ? conSugerencia / pedidos.length : 0,
            ranking
        };
    }

    /* ---------------- EXPORTAR menu-data.js ---------------- */

    /**
     * Genera el contenido de menu-data.js con los cambios del gerente
     * ya incorporados, para dejarlos fijos en el sitio.
     */
    function exportarMenuData() {
        const cfg = getConfig();
        const menu = getMenu();

        const cfgLineas = [
            `    nombre:     ${JSON.stringify(cfg.nombre)},`,
            `    lema:       ${JSON.stringify(cfg.lema)},`,
            `    frase:      ${JSON.stringify(cfg.frase)},`,
            `    horario:    ${JSON.stringify(cfg.horario)},`,
            `    direccion:  ${JSON.stringify(cfg.direccion)},`,
            `    telefono:   ${JSON.stringify(cfg.telefono)},`,
            `    whatsapp:   ${JSON.stringify(cfg.whatsapp || '')},`,
            `    moneda:     ${JSON.stringify(cfg.moneda)},`,
            `    panelSal:   ${JSON.stringify(cfg.panelSal)},`,
            `    panelHash:  ${JSON.stringify(cfg.panelHash)},`,
            `    tiempoPromedio: ${cfg.tiempoPromedio}`
        ].join('\n');

        const cats = menu.map(cat => {
            const platos = cat.platos.map(p => {
                const campos = [`id: ${JSON.stringify(p.id)}`, `nombre: ${JSON.stringify(p.nombre)}`];
                // Un plato puede quedarse sin precio a propósito (se muestra "Consultar")
                if (typeof p.precio === 'number' && !isNaN(p.precio)) campos.push(`precio: ${p.precio.toFixed(2)}`);
                if (p.img)         campos.push(`img: ${JSON.stringify(p.img)}`);
                if (p.descripcion) campos.push(`descripcion: ${JSON.stringify(p.descripcion)}`);
                if (p.destacado)   campos.push('destacado: true');
                if (p.agotado)     campos.push('agotado: true');
                return `            { ${campos.join(', ')} }`;
            }).join(',\n');

            return [
                '    {',
                `        id: ${JSON.stringify(cat.id)},`,
                `        nombre: ${JSON.stringify(cat.nombre)},`,
                `        icono: ${JSON.stringify(cat.icono)},`,
                `        descripcion: ${JSON.stringify(cat.descripcion || '')},`,
                `        estilo: ${JSON.stringify(cat.estilo)},`,
                cat.sugerible ? '        sugerible: true,' : null,
                '        platos: [',
                platos,
                '        ]',
                '    }'
            ].filter(Boolean).join('\n');
        }).join(',\n');

        return `/* Generado desde el panel del gerente — ${new Date().toLocaleString('es-EC')} */\n\n` +
               `const RESTAURANTE = {\n${cfgLineas}\n};\n\n` +
               `const MENU = [\n${cats}\n];\n`;
    }

    return {
        getConfig, saveConfig,
        getMenu, getPlatos, findPlato,
        setOverride, resetOverrides, toggleAgotado, getOverrides,
        getCarrito, saveCarrito, limpiarCarrito,
        guardarPedido, getPedidos, getPedidoActivo, cerrarPedidoActivo,
        setEstadoPedido, borrarPedidos,
        registrarVista, getVistas,
        getStats, exportarMenuData,
        // Puentes con la nube
        aplicarOverridesRemotos, aplicarConfigRemota,
        mezclarPedidosRemotos, mezclarVistasRemotas
    };
})();
