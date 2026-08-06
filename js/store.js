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

    /**
     * Lo que ve el comensal. Deja fuera las categorías marcadas como
     * `soloMesero`, que existen pero no se anuncian.
     *
     * El caso real: los juniors son porción de niño y valen menos. Si
     * salen en la carta, un adulto pide el junior — come menos y el
     * local gana menos. Se piden diciéndoselo al mesero, como en
     * cualquier restaurante con menú infantil.
     *
     * El mesero y el gerente sí los ven: ellos usan getMenu().
     */
    function getMenuPublico() {
        return getMenu().filter(c => !c.soloMesero);
    }

    function getPlatosPublicos() {
        return getMenuPublico().flatMap(c => c.platos.map(p => ({ ...p, categoria: c.nombre, catId: c.id })));
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

        /* Ya no se sube a la nube.
           Este registro es del comensal: le sirve para su aviso de "tu
           pedido va en camino" y vive en su propio celular. A la cocina
           lo que le llega es la comanda que el mesero confirma, y el
           panel cuenta esas. Subirlo también aquí llenaba una rama que
           el panel ignoraba a propósito para no contar dos veces el
           mismo pedido: se escribía, se guardaba, y no lo leía nadie. */
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

    /* Lo que este comensal lleva mirado en esta visita, todavía sin mandar.
       Antes cada plato que pasaba por la pantalla era un envío a la nube y
       un registro guardado para siempre: veinte por visita, mil en una
       noche buena, y nada los borraba nunca. El panel se los bajaba todos
       cada vez que se abría, para calcular una sola cosa. */
    let vistasPorMandar = {};

    function registrarVista(platoId) {
        const v = read(K.vistas, {});
        v[platoId] = (v[platoId] || 0) + 1;
        write(K.vistas, v);
        vistasPorMandar[platoId] = (vistasPorMandar[platoId] || 0) + 1;
    }

    /**
     * Manda de una sola vez todo lo que miró este comensal.
     *
     * Se llama cuando se va o cuando pide, no mientras hace scroll: no
     * hay ninguna prisa por este dato y sí la hay por que la red esté
     * libre para lo que sí importa, que es el pedido.
     */
    function enviarVistas() {
        const platos = vistasPorMandar;
        vistasPorMandar = {};
        if (!Object.keys(platos).length) return;
        if (typeof Sync !== 'undefined' && Sync.activo) {
            Sync.agregar('vistas', { platos, cuando: Date.now() });
        }
    }

    /** Suma a las vistas de este aparato las que llegan de la nube. */
    function mezclarVistasRemotas(remotas) {
        const total = Object.assign({}, read(K.vistas, {}));
        Object.values(remotas || {}).forEach(v => {
            if (!v) return;
            // Lo que se guarda hoy: una visita entera en un solo registro
            if (v.platos) {
                Object.keys(v.platos).forEach(id => {
                    total[id] = (total[id] || 0) + (Number(v.platos[id]) || 0);
                });
            // Y lo de antes, un registro por plato. Sigue contando: son
            // meses de datos del local y no hay por qué tirarlos.
            } else if (v.plato) {
                total[v.plato] = (total[v.plato] || 0) + 1;
            }
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

    /* ---------------- EXPORTAR menu-data.js ----------------

       ESTE ARCHIVO TIENE QUE SALIR COMPLETO.

       Antes se escribía campo por campo, a mano: nombre, precio, foto y
       poco más. Servía cuando el menú era solo un menú. Después llegaron
       la estación de cada plato, las siglas, los atajos, los cubiertos,
       las guarniciones y la conexión con la nube — y ninguno de esos
       campos estaba en la lista, así que el archivo generado los
       borraba. Quien lo subiera al sitio se quedaba con el menú del
       comensal funcionando y el sistema de comandas muerto, sin un solo
       mensaje de error, porque el archivo se veía perfecto.

       Por eso ya no hay lista de campos: se copia lo que HAY. El día que
       agregues un campo nuevo, sale solo.
       ---------------- */

    /** Nombre de campo sin comillas cuando se puede, para que se lea bien. */
    const llaveJs = k => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);

    /** Cualquier valor, tal cual, en una sola línea. */
    function valorJs(v, campo) {
        // Los precios se leen mejor con sus dos decimales: 3.50, no 3.5
        if (campo === 'precio' && typeof v === 'number' && !isNaN(v)) return v.toFixed(2);
        if (Array.isArray(v)) return '[' + v.map(x => valorJs(x)).join(', ') + ']';
        if (v && typeof v === 'object') return '{ ' + paresJs(v).join(', ') + ' }';
        return JSON.stringify(v);
    }

    /** Los pares de un objeto, saltándose lo que no tiene valor. */
    const paresJs = obj => Object.keys(obj)
        .filter(k => obj[k] !== undefined)
        .map(k => `${llaveJs(k)}: ${valorJs(obj[k], k)}`);

    /** Un objeto suelto del archivo, con cada campo en su renglón. */
    const bloqueJs = (nombre, obj) =>
        `const ${nombre} = {\n` + paresJs(obj).map(l => '    ' + l).join(',\n') + `\n};\n`;

    /**
     * Genera el contenido de menu-data.js con los cambios del gerente
     * ya incorporados, para dejarlos fijos en el sitio.
     */
    function exportarMenuData() {
        const partes = [
            `/* Generado desde el panel del gerente — ${new Date().toLocaleString('es-EC')}\n` +
            `   Reemplaza con esto el archivo js/menu-data.js del sitio. */\n`,
            bloqueJs('RESTAURANTE', getConfig())
        ];

        /* Se copian tal cual: la lista del equipo, la conexión con la
           nube, los nombres de las guarniciones y las formas de servir.
           Si faltara cualquiera, el sistema de comandas no vuelve a
           arrancar. CAMBIOS es una lista y no un objeto, así que va por
           su lado: bloqueJs escribe llaves y lo dejaría inservible. */
        if (typeof EQUIPO       !== 'undefined') partes.push(bloqueJs('EQUIPO', EQUIPO));
        if (typeof FIREBASE     !== 'undefined') partes.push(bloqueJs('FIREBASE', FIREBASE));
        if (typeof GUARNICIONES !== 'undefined') partes.push(bloqueJs('GUARNICIONES', GUARNICIONES));
        if (typeof CAMBIOS      !== 'undefined')
            partes.push(`const CAMBIOS = ${JSON.stringify(CAMBIOS, null, 4)};\n`);

        const cats = getMenu().map(cat => {
            const { platos, ...resto } = cat;
            return [
                '    {',
                paresJs(resto).map(l => '        ' + l).join(',\n') + ',',
                '        platos: [',
                platos.map(p => '            { ' + paresJs(p).join(', ') + ' }').join(',\n'),
                '        ]',
                '    }'
            ].join('\n');
        }).join(',\n');

        partes.push(`const MENU = [\n${cats}\n];\n`);
        return partes.join('\n');
    }

    return {
        getConfig, saveConfig,
        getMenu, getPlatos, findPlato,
        getMenuPublico, getPlatosPublicos,
        setOverride, resetOverrides, toggleAgotado, getOverrides,
        getCarrito, saveCarrito, limpiarCarrito,
        guardarPedido, getPedidos, getPedidoActivo, cerrarPedidoActivo,
        setEstadoPedido, borrarPedidos,
        registrarVista, enviarVistas, getVistas,
        getStats, exportarMenuData,
        // Puentes con la nube
        aplicarOverridesRemotos, aplicarConfigRemota,
        mezclarPedidosRemotos, mezclarVistasRemotas
    };
})();
