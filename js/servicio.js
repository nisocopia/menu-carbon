/* ============================================================
   SERVICIO.JS  —  El sistema de comandas

   Reemplaza el cuaderno y los dos papeles (el del asador y el de la
   cocina) por una sola verdad compartida entre los celulares.

   VOCABULARIO
   - sesión:  una mesa ocupada desde que se sienta la gente hasta que
              paga. Si esa misma mesa se vuelve a ocupar en la noche,
              es una sesión nueva.
   - comanda: una tanda. Lo que en el cuaderno era un renglón. La
              primera de la mesa 3 es "M3", la segunda "M3b".
   - ítem:    una línea de la comanda. Dos pollos con distinta
              modificación son dos ítems, no uno de cantidad 2.

   SIN INTERNET NO SE PARA: todo se guarda primero en este celular y
   se reenvía solo cuando vuelve la señal. Lo que todavía no salió se
   ve en rojo, para que nadie crea que la cocina ya lo tiene.
   ============================================================ */

const Servicio = (() => {

    const NS = 'srv_';
    const K = {
        comandas: NS + 'comandas',
        pagos:    NS + 'pagos',
        sesiones: NS + 'sesiones',
        cola:     NS + 'cola',        // lo que falta subir
        extras:   NS + 'extras'       // bebidas sueltas que se fueron aprendiendo
    };

    /* Un dispositivo puede quedarse sin nube (sync.js no cargó o el
       restaurante no la configuró) y aun así tiene que tomar pedidos. */
    const Red = (typeof Sync !== 'undefined') ? Sync : {
        activo: false, haySesion: () => false,
        escuchar: () => (() => {}), leer: async () => null,
        guardar: async () => false, agregar: async () => false,
        ramaViva: () => true, desdeUltimoContacto: () => 0
    };

    let alCambiar = () => {};
    let enLinea   = true;

    /* ============================================================
       ALMACÉN LOCAL
       ============================================================ */

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
    }

    function write(key, valor) {
        try { localStorage.setItem(key, JSON.stringify(valor)); }
        catch (e) { /* almacenamiento lleno: la pantalla sigue funcionando */ }
    }

    const getComandas = () => read(K.comandas, {});
    const getPagos    = () => read(K.pagos, {});
    const getSesiones = () => read(K.sesiones, {});

    /** Identificador que no se repite aunque dos celulares escriban a la vez. */
    function nuevoId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /* ============================================================
       LA COLA: lo que todavía no llegó a la nube
       ============================================================ */

    function encolar(rama, valor) {
        /* Si el local no tiene nube, no hay a dónde mandarlo y todo vive
           en este celular. Encolarlo dejaría la alarma roja prendida para
           siempre diciendo que algo no salió, cuando no hay nada que
           sacar: el aviso solo sirve si es verdad. */
        if (!Red.activo) return;

        const cola = read(K.cola, []);
        cola.push({ rama, valor, intentos: 0 });
        write(K.cola, cola);
        vaciarCola();
    }

    let vaciando = false;

    async function vaciarCola() {
        if (vaciando || !Red.activo) return;
        vaciando = true;

        try {
            let cola = read(K.cola, []);
            while (cola.length) {
                const tarea = cola[0];
                const ok = await Red.guardar(tarea.rama, tarea.valor);
                if (!ok) {
                    // Se queda en la cola y se reintenta más tarde. Que no se
                    // pierda es más importante que que llegue ya.
                    marcarLinea(false);
                    break;
                }
                cola = read(K.cola, []).slice(1);
                write(K.cola, cola);
                marcarLinea(true);
            }
        } finally {
            vaciando = false;
        }
    }

    function marcarLinea(ok) {
        if (enLinea === ok) return;
        enLinea = ok;
        alCambiar();
    }

    /** Cuántas cosas están esperando salir. Si es > 0, se muestra en rojo. */
    const pendientes = () => read(K.cola, []).length;
    const hayLinea   = () => enLinea && pendientes() === 0;

    /**
     * ¿Está llegando lo que mandan los otros celulares?
     *
     * Es distinto de la cola: la cola dice si lo MÍO salió, esto dice si
     * lo de los DEMÁS entra. Una pantalla de cocina con el canal muerto
     * no muestra pedidos y parece que no hay ninguno — hay que decirlo.
     *
     * Se da un margen antes de alarmar: reconectar tarda unos segundos y
     * no tiene sentido asustar a nadie por eso.
     */
    function recibiendo() {
        if (!Red.activo) return true;
        if (Red.ramaViva('servicio/comandas')) return true;
        return Red.desdeUltimoContacto('servicio/comandas') < 20000;
    }

    // Reintento periódico y al recuperar la red del sistema
    setInterval(vaciarCola, 8000);
    window.addEventListener('online', vaciarCola);

    /* ============================================================
       PLATOS, ESTACIONES Y SIGLAS
       ============================================================ */

    /** La categoría a la que pertenece un plato, con sus reglas. */
    function categoriaDe(platoId) {
        return Store.getMenu().find(c => c.platos.some(p => p.id === platoId)) || null;
    }

    /**
     * Quién prepara el plato. El plato puede traer su propia estación
     * (la porción de chancho sale del horno aunque esté entre las de
     * parrilla); si no, manda la de la categoría.
     */
    function estacionDe(platoId) {
        // Las bebidas aprendidas de la tienda de al lado no están en el menú
        // y siempre son de barra: no las prepara nadie.
        if (String(platoId).startsWith('x')) return 'barra';

        const p = Store.findPlato(platoId);
        if (p && p.estacion) return p.estacion;
        const cat = categoriaDe(platoId);
        return (cat && cat.estacion) || 'cocina';
    }

    /**
     * Qué acompañantes trae el plato, para poder quitárselos. Manda la
     * del plato si la tiene: los juniors están todos en una categoría
     * pero unos vienen con menestra y plátano y otros con patacones.
     */
    function guarnicionDe(platoId) {
        const p = Store.findPlato(platoId);
        if (p && p.guarnicion) return p.guarnicion;
        const cat = categoriaDe(platoId);
        return (cat && cat.guarnicion) || [];
    }

    /** Nombre corto para el código: "Camarón al Ajillo" → "Camarón Ajillo". */
    function nombreCorto(nombre) {
        return String(nombre || '').replace(/\s+(al|a la|de|con)\s+/gi, ' ');
    }

    /* ============================================================
       EL CÓDIGO DEL PEDIDO

       "M3 · 2PO 1CA"  →  mesa 3, dos pollos, una carne.
       Se lee en voz alta tal cual. La segunda tanda de esa mesa es
       "M3b", la tercera "M3c". Las modificaciones NO van en el código:
       comprimirlas lo volvería ilegible, y van escritas debajo.
       ============================================================ */

    const LETRAS_TANDA = 'bcdefghijklmnopqrstuvwxyz';

    function prefijoMesa(mesa, tanda) {
        const base = mesa ? 'M' + mesa : 'LL';
        return base + (tanda > 0 ? LETRAS_TANDA[tanda - 1] || tanda : '');
    }

    /** Junta los ítems repetidos: el código cuenta platos, no líneas. */
    function resumirItems(items) {
        const porPlato = new Map();
        (items || []).forEach(it => {
            const previo = porPlato.get(it.platoId) || { cantidad: 0, nombre: it.nombre };
            previo.cantidad += it.cantidad;
            porPlato.set(it.platoId, previo);
        });

        return [...porPlato.entries()].map(([platoId, dato]) => {
            const p = Store.findPlato(platoId);

            // Las bebidas de la tienda no están en el menú, pero el ítem
            // trae su nombre: sin esto el código salía "1?" y no se
            // entendía qué se había pedido.
            if (!p) return `${dato.cantidad} ${nombreCorto(dato.nombre || '?')}`;

            return p.sigla
                ? `${dato.cantidad}${p.sigla}`
                : `${dato.cantidad} ${nombreCorto(p.nombre)}`;
        });
    }

    function codigoDe(comanda) {
        const partes = resumirItems(comanda.items);
        return prefijoMesa(comanda.mesa, comanda.tanda) + ' · ' + partes.join(' ');
    }

    /** Solo la parte corta, para cuando no cabe el detalle. */
    const etiquetaDe = comanda => prefijoMesa(comanda.mesa, comanda.tanda);

    /* ============================================================
       CUBIERTOS

       No se preguntan ni se escriben: son los platos que se sirven en
       la mesa. Si alguien pide dos pollos y uno es para llevar, es un
       solo cubierto — el de llevar no se sienta a comer.
       ============================================================ */

    function cubiertosDe(items) {
        return (items || []).reduce((suma, it) => {
            if (it.llevar) return suma;
            const cat = categoriaDe(it.platoId);
            return cat && cat.cubierto ? suma + it.cantidad : suma;
        }, 0);
    }

    /* ============================================================
       SESIONES DE MESA
       ============================================================ */

    /** La sesión abierta de una mesa, o null si la mesa está libre. */
    function sesionDeMesa(mesa) {
        return Object.values(getSesiones())
            .filter(s => s.mesa === mesa && s.abierta)
            .sort((a, b) => b.creado - a.creado)[0] || null;
    }

    function abrirSesion(mesa) {
        const ya = sesionDeMesa(mesa);
        if (ya) return ya;

        const sesion = { id: nuevoId(), mesa, abierta: true, creado: Date.now(), cerrado: null };
        const todas = getSesiones();
        todas[sesion.id] = sesion;
        write(K.sesiones, todas);
        encolar(`servicio/sesiones/${sesion.id}`, sesion);
        return sesion;
    }

    function cerrarSesion(sesionId) {
        const todas = getSesiones();
        const s = todas[sesionId];
        if (!s) return;
        s.abierta = false;
        s.cerrado = Date.now();
        write(K.sesiones, todas);
        encolar(`servicio/sesiones/${sesionId}`, s);
        alCambiar();
    }

    const comandasDeSesion = sesionId =>
        Object.values(getComandas())
            .filter(c => c.sesion === sesionId)
            .sort((a, b) => a.creado - b.creado);

    const pagosDeSesion = sesionId =>
        Object.values(getPagos())
            .filter(p => p.sesion === sesionId)
            .sort((a, b) => a.cuando - b.cuando);

    /* ============================================================
       MANDAR UNA COMANDA

       Es lo único que reemplaza al "escribo en el cuaderno, camino al
       asador, camino a la cocina". Aquí sale a las tres pantallas de
       una vez.
       ============================================================ */

    function enviarComanda({ mesa, items, nota, origen }) {
        if (!items || !items.length) return null;

        const sesion = abrirSesion(mesa);
        const tanda  = comandasDeSesion(sesion.id).length;

        const comanda = {
            id: nuevoId(),
            sesion: sesion.id,
            mesa,
            tanda,
            items: items.map(it => ({
                uid: nuevoId(),
                platoId: it.platoId,
                nombre: it.nombre,
                precio: it.precio,
                cantidad: it.cantidad,
                estacion: estacionDe(it.platoId),
                sin: it.sin || [],           // guarniciones que se quitan
                termino: it.termino || '',
                llevar: !!it.llevar,
                nota: it.nota || '',
                elegidas: it.elegidas || []  // las carnes de un mixto
            })),
            nota: nota || '',
            origen: origen || 'mesero',
            creado: Date.now(),
            estado: 'nuevo',
            sacado: false                    // el asador ya la sacó de la parrilla
        };

        comanda.codigo    = codigoDe(comanda);
        comanda.cubiertos = cubiertosDe(comanda.items);

        const todas = getComandas();
        todas[comanda.id] = comanda;
        write(K.comandas, todas);
        encolar(`servicio/comandas/${comanda.id}`, comanda);
        alCambiar();

        return comanda;
    }

    function parchearComanda(id, patch) {
        const todas = getComandas();
        const c = todas[id];
        if (!c) return null;
        Object.assign(c, patch);
        write(K.comandas, todas);
        encolar(`servicio/comandas/${id}`, c);
        alCambiar();
        return c;
    }

    /** Un solo toque en la cocina: el plato salió y desaparece de todas las pantallas. */
    const marcarEntregado = id => parchearComanda(id, { estado: 'entregado', entregado: Date.now() });

    /** El asador limpia su tarjeta sin tocarle nada a la cocina. */
    const marcarSacado = (id, valor) => parchearComanda(id, { sacado: valor !== false });

    /** Corregir un pedido mal tomado: se anula entero y se vuelve a mandar. */
    const anularComanda = (id, motivo) =>
        parchearComanda(id, { estado: 'anulado', anulado: Date.now(), motivo: motivo || '' });

    /* ============================================================
       LO QUE VE CADA ESTACIÓN

       El asador solo ve proteínas. La cocina ve todo, porque es la que
       emplata y la que pone los cubiertos. Las bebidas no le llegan a
       ninguna: esas las sirve el mesero directo de la nevera.
       ============================================================ */

    function comandasDe(estacion) {
        return Object.values(getComandas())
            .filter(c => c.estado === 'nuevo')
            .map(c => {
                const items = c.items.filter(it =>
                    estacion === 'cocina' ? it.estacion !== 'barra' : it.estacion === estacion);
                return items.length ? { ...c, items } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.creado - b.creado);   // el más viejo primero: se sirve en orden
    }

    /* ============================================================
       LA CUENTA

       Siempre se divide por lo que comió cada uno, nunca en partes
       iguales. Se tocan los platos de esa persona, se cobra, y lo que
       falta se queda abierto en la mesa.
       ============================================================ */

    /** Lo que la mesa pidió, junto y sin repetir, con lo que ya pagó descontado. */
    function cuentaDeSesion(sesionId) {
        const lineas = new Map();

        comandasDeSesion(sesionId)
            .filter(c => c.estado !== 'anulado')
            .forEach(c => c.items.forEach(it => {
                const clave = it.platoId + '|' + it.precio;
                const l = lineas.get(clave) || { platoId: it.platoId, nombre: it.nombre, precio: it.precio, cantidad: 0, pagada: 0 };
                l.cantidad += it.cantidad;
                lineas.set(clave, l);
            }));

        pagosDeSesion(sesionId).forEach(p => (p.lineas || []).forEach(pl => {
            const clave = pl.platoId + '|' + pl.precio;
            const l = lineas.get(clave);
            if (l) l.pagada += pl.cantidad;
        }));

        const items = [...lineas.values()].map(l => ({ ...l, pendiente: l.cantidad - l.pagada }));
        const total    = items.reduce((s, l) => s + l.cantidad * l.precio, 0);
        const cobrado  = items.reduce((s, l) => s + l.pagada   * l.precio, 0);

        return { items, total, cobrado, saldo: total - cobrado };
    }

    function registrarPago({ sesionId, lineas, forma }) {
        const monto = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
        const pago = {
            id: nuevoId(), sesion: sesionId, lineas, monto,
            forma: forma || 'efectivo', cuando: Date.now()
        };

        const todos = getPagos();
        todos[pago.id] = pago;
        write(K.pagos, todos);
        encolar(`servicio/pagos/${pago.id}`, pago);

        // Si ya no queda saldo, la mesa se libera sola
        if (cuentaDeSesion(sesionId).saldo <= 0.001) cerrarSesion(sesionId);
        else alCambiar();

        return pago;
    }

    /* ============================================================
       PEDIDOS QUE MANDA EL COMENSAL DESDE SU CELULAR

       No entran directo a la cocina. Caen en una bandeja y el mesero
       los confirma de un toque. Son dos razones:

       1. El celular del comensal no tiene cuenta del local. Si pudiera
          escribir en las comandas, cualquiera que abra el menú podría
          meterle 20 platos falsos a la parrilla.
       2. Es lo que ya pasa hoy: el comensal levanta la mano, el mesero
          se acerca y confirma. Solo que ahora no hay que escribirlo.
       ============================================================ */

    /** Lo manda el comensal. Va sin sesión porque no tiene cuenta. */
    function enviarEntrante({ mesa, items, nota }) {
        const entrante = {
            id: nuevoId(),
            mesa: mesa || 0,
            items: (items || []).map(it => ({
                platoId: it.platoId || it.id,
                nombre: it.nombre,
                precio: it.precio,
                cantidad: it.cantidad
            })),
            nota: nota || '',
            creado: Date.now()
        };
        // Sin cola: si no sale, el comensal igual tiene la pantalla para
        // mostrársela al mesero, que es como funciona hoy.
        Red.agregar('servicio/entrantes', entrante);
        return entrante;
    }

    let entrantes = {};

    const getEntrantes = () => Object.entries(entrantes)
        .map(([llave, e]) => ({ ...e, llave }))
        .sort((a, b) => a.creado - b.creado);

    /** El mesero lo acepta: recién ahí sale a la parrilla y a la cocina. */
    function confirmarEntrante(llave, mesa) {
        const e = entrantes[llave];
        if (!e) return null;

        const comanda = enviarComanda({
            mesa: mesa != null ? mesa : e.mesa,
            items: e.items,
            nota: e.nota,
            origen: 'cliente'
        });

        descartarEntrante(llave);
        return comanda;
    }

    function descartarEntrante(llave) {
        delete entrantes[llave];
        encolar(`servicio/entrantes/${llave}`, null);
        alCambiar();
    }

    /* ============================================================
       BEBIDAS QUE NO ESTÁN EN LA LISTA

       Las cervezas y las colas salen de la tienda de al lado y son
       demasiadas para tenerlas todas escritas. Se escribe el nombre y
       el precio una vez, y quedan guardadas para la próxima.
       ============================================================ */

    /**
     * Firebase guarda las listas como objeto en cuanto se borra algo del
     * medio, así que lo que vuelve de la nube no siempre es un arreglo.
     * Sin esto, un día cualquiera desaparecerían todas las bebidas
     * guardadas y nadie sabría por qué.
     */
    function getExtras() {
        const guardado = read(K.extras, []);
        if (Array.isArray(guardado)) return guardado;
        return Object.values(guardado || {}).filter(Boolean);
    }

    function guardarExtra(nombre, precio) {
        const extras = getExtras();
        const clave  = nombre.trim().toLowerCase();
        const previo = extras.find(e => e.nombre.toLowerCase() === clave);

        if (previo) previo.precio = precio;
        else extras.push({ id: 'x' + nuevoId(), nombre: nombre.trim(), precio, estacion: 'barra' });

        extras.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        write(K.extras, extras);
        if (Red.activo) encolar('servicio/extras', extras);
        return previo || extras[extras.length - 1];
    }

    /* ============================================================
       ESCUCHAR A LOS OTROS CELULARES
       ============================================================ */

    function mezclar(clave, remotos) {
        if (!remotos) return;
        const propios = read(clave, {});
        // Lo que llega de la nube manda: es lo que ya vieron los demás
        write(clave, Object.assign({}, propios, remotos));
    }

    function iniciar(cb) {
        alCambiar = cb || (() => {});
        vaciarCola();

        if (!Red.activo) return;

        Red.escuchar('servicio/comandas', datos => { mezclar(K.comandas, datos); alCambiar(); }, true);
        Red.escuchar('servicio/pagos',    datos => { mezclar(K.pagos, datos);    alCambiar(); }, true);
        Red.escuchar('servicio/sesiones', datos => { mezclar(K.sesiones, datos); alCambiar(); }, true);
        Red.escuchar('servicio/extras',   datos => { if (datos) write(K.extras, datos); }, true);

        // La bandeja de lo que mandan los comensales no se guarda en este
        // celular: vive solo mientras el mesero la tiene en pantalla.
        Red.escuchar('servicio/entrantes', datos => { entrantes = datos || {}; alCambiar(); }, true);
    }

    /* ============================================================
       LO QUE LEE EL PANEL DEL GERENTE

       El panel calculaba sus números con los pedidos que mandaban los
       comensales desde su celular. Como la mayoría de los pedidos los
       toma el mesero, esos números se quedaban cortos. Aquí se le
       entregan las comandas de verdad, en el formato que ya sabe leer.
       ============================================================ */

    const totalDe = items => (items || []).reduce((s, it) => s + it.precio * it.cantidad, 0);

    function comandasComoPedidos() {
        return Object.values(getComandas())
            .filter(c => c.estado !== 'anulado')
            .map(c => ({
                id: c.id,
                codigo: c.codigo || codigoDe(c),
                mesa: c.mesa,
                sesion: c.sesion,
                creado: c.creado,
                estado: c.estado,
                origen: c.origen,
                nota: c.nota,
                cubiertos: c.cubiertos,
                // El panel espera 'id' donde la comanda guarda 'platoId'
                items: (c.items || []).map(it => ({
                    id: it.platoId, nombre: it.nombre, precio: it.precio,
                    cantidad: it.cantidad, llevar: it.llevar, sin: it.sin, termino: it.termino
                })),
                total: totalDe(c.items)
            }))
            .sort((a, b) => b.creado - a.creado);
    }

    /**
     * Cuántas mesas se atendieron. Es el número que de verdad importa:
     * una mesa con tres tandas es un cliente, no tres.
     */
    function sesionesEntre(desde, hasta) {
        return Object.values(getSesiones())
            .filter(s => s.creado >= (desde || 0) && s.creado <= (hasta || Infinity));
    }

    /* ============================================================
       LIMPIEZA DE FIN DE NOCHE
       ============================================================ */

    /**
     * Borra TODO el servicio, en este celular y en la nube: comandas,
     * mesas y cobros. Es para dejar limpio después de un ensayo, no
     * para usar durante el servicio.
     *
     * No borra el menú, los precios ni las bebidas aprendidas.
     */
    async function vaciarTodo() {
        write(K.comandas, {});
        write(K.sesiones, {});
        write(K.pagos, {});
        entrantes = {};

        if (!Red.activo) { alCambiar(); return true; }

        const ramas = ['servicio/comandas', 'servicio/sesiones', 'servicio/pagos', 'servicio/entrantes'];
        const hechos = await Promise.all(ramas.map(r => Red.guardar(r, null)));
        alCambiar();
        return hechos.every(Boolean);
    }

    /** Borra lo entregado y pagado de días anteriores para no llenar el celular. */
    function limpiarViejo(dias) {
        const corte = Date.now() - (dias || 2) * 24 * 3600 * 1000;

        const comandas = getComandas();
        Object.keys(comandas).forEach(k => {
            if (comandas[k].creado < corte && comandas[k].estado !== 'nuevo') delete comandas[k];
        });
        write(K.comandas, comandas);

        const sesiones = getSesiones();
        Object.keys(sesiones).forEach(k => {
            if (sesiones[k].creado < corte && !sesiones[k].abierta) delete sesiones[k];
        });
        write(K.sesiones, sesiones);
    }

    return {
        // consultar
        getComandas, getSesiones, getPagos, comandasDe, comandasDeSesion,
        sesionDeMesa, cuentaDeSesion, pagosDeSesion,
        estacionDe, guarnicionDe, categoriaDe, codigoDe, etiquetaDe,
        cubiertosDe, nombreCorto, resumirItems,
        // hacer
        enviarComanda, marcarEntregado, marcarSacado, anularComanda,
        abrirSesion, cerrarSesion, registrarPago,
        getExtras, guardarExtra,
        // lo que manda el comensal
        enviarEntrante, getEntrantes, confirmarEntrante, descartarEntrante,
        // para el panel del gerente
        comandasComoPedidos, sesionesEntre,
        // estado del sistema
        iniciar, hayLinea, pendientes, recibiendo, vaciarCola,
        limpiarViejo, vaciarTodo, nuevoId
    };
})();
