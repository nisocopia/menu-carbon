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
        extras:   NS + 'extras',      // bebidas sueltas que se fueron aprendiendo
        tomados:  NS + 'tomados'      // pedidos del comensal que este celular ya pasó a comanda
    };

    /* Un dispositivo puede quedarse sin nube (sync.js no cargó o el
       restaurante no la configuró) y aun así tiene que tomar pedidos. */
    const Red = (typeof Sync !== 'undefined') ? Sync : {
        activo: false, haySesion: () => false, rolSesion: () => 'gerente',
        escuchar: () => (() => {}), leer: async () => null,
        guardar: async () => false, parchear: async () => false,
        agregar: async () => false, reclamar: async () => ({ ok: false, status: 0 }),
        ramaViva: () => true, desdeUltimoContacto: () => 0, fallo: () => ''
    };

    /* ============================================================
       QUIÉN PUEDE QUÉ

       Cada celular entra con su cuenta y esa cuenta manda una sola
       pantalla. Las otras las puede mirar, porque saber si la carne ya
       salió sirve a todos, pero no tocarlas: dos manos sobre el mismo
       botón es como se pierde un plato.

         todo  manda en esa pantalla
         ver   la abre y la lee, pero no puede tocar nada
         no    ni siquiera la abre

       Esto ordena las pantallas. La seguridad de verdad son las reglas
       de Firebase, que revisan lo mismo del lado del servidor: aquí se
       podría hacer trampa editando el navegador, allá no.
       ============================================================ */

    const PERMISOS = {
        gerente:  { comanda: 'todo', cocina: 'todo', parrilla: 'todo' },
        mesero:   { comanda: 'todo', cocina: 'ver',  parrilla: 'ver'  },
        cocina:   { comanda: 'no',   cocina: 'todo', parrilla: 'ver'  },
        parrilla: { comanda: 'no',   cocina: 'ver',  parrilla: 'todo' }
    };

    /** El rol de quien entró en este celular, o null si no entró nadie. */
    const rol = () => (Red.rolSesion ? Red.rolSesion() : 'gerente');

    /**
     * Qué puede hacer quien entró en la pantalla que se le pregunte.
     * La parrilla se llama 'asador' en los datos de los platos y
     * 'parrilla' en los permisos: es la misma.
     */
    function permisoEn(pantalla) {
        const cual = pantalla === 'asador' ? 'parrilla' : pantalla;
        const quien = rol();
        if (!quien) return 'no';
        const reglas = PERMISOS[quien];
        // Un rol escrito con un error de dedo en menu-data.js no debe
        // abrirlo todo: se niega y la pantalla dice qué revisar.
        if (!reglas) return 'no';
        return reglas[cual] || 'no';
    }

    const puedeTocar = pantalla => permisoEn(pantalla) === 'todo';

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

    /**
     * @param metodo 'PUT' manda el objeto entero (crear), 'PATCH' manda
     *        solo los campos que cambiaron (corregir). Lo viejo que haya
     *        quedado en la cola sin método se sigue tratando como PUT.
     */
    function encolar(rama, valor, metodo) {
        /* Si el local no tiene nube, no hay a dónde mandarlo y todo vive
           en este celular. Encolarlo dejaría la alarma roja prendida para
           siempre diciendo que algo no salió, cuando no hay nada que
           sacar: el aviso solo sirve si es verdad. */
        if (!Red.activo) return;

        const cola = read(K.cola, []);
        cola.push({ rama, valor, metodo: metodo || 'PUT', intentos: 0 });
        write(K.cola, cola);
        vaciarCola();
    }

    let vaciando = false;
    let vaciandoDesde = 0;

    async function vaciarCola() {
        if (!Red.activo) return;

        /* Si un intento anterior se quedó colgado, la bandera nunca volvía
           a bajar y esta función salía por la puerta de atrás para siempre:
           los pedidos se acumulaban sin que nadie lo intentara de nuevo y
           sin un solo mensaje de error, porque nunca llegaba a fallar.
           Pasado un rato se da por perdido y se vuelve a intentar. */
        if (vaciando && Date.now() - vaciandoDesde < 40000) return;

        vaciando = true;
        vaciandoDesde = Date.now();

        try {
            let cola = read(K.cola, []);
            while (cola.length) {
                const tarea = cola[0];
                const ok = tarea.metodo === 'PATCH'
                    ? await Red.parchear(tarea.rama, tarea.valor)
                    : await Red.guardar(tarea.rama, tarea.valor);
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

    /** Por que no salio lo ultimo. Lo muestra la pantalla al tocar el aviso. */
    const porQueNoSale = () => (Red.fallo && Red.fallo()) || '';
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

    /**
     * TODAS las sesiones abiertas de una mesa.
     *
     * Normalmente es una. Son dos cuando dos celulares sientan a la
     * misma mesa en el mismo momento: ninguno alcanzó a ver la del
     * otro y cada uno abrió la suya. Eso pasa y no se puede evitar sin
     * un servidor que reparta turnos.
     *
     * Lo que sí se puede es que no importe: de aquí en adelante la
     * cuenta es de la MESA y suma todas sus sesiones. Antes se mostraba
     * solo la más nueva, así que los platos de la otra existían pero no
     * los veía nadie — y nadie los cobraba.
     */
    function sesionesAbiertasDeMesa(mesa) {
        return Object.values(getSesiones())
            .filter(s => s.mesa === mesa && s.abierta)
            .sort((a, b) => a.creado - b.creado || String(a.id).localeCompare(String(b.id)));
    }

    /**
     * La sesión con la que se anota lo nuevo de esa mesa: la más vieja.
     *
     * Que sea la más vieja y no la más nueva no es un detalle: es un
     * orden que los dos celulares calculan igual sin hablarse, así que
     * los dos terminan escribiendo en la misma y el desdoble se cierra
     * solo en cuanto se ven.
     */
    const sesionDeMesa = mesa => sesionesAbiertasDeMesa(mesa)[0] || null;

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
        if (!s || !s.abierta) return;
        s.abierta = false;
        s.cerrado = Date.now();
        write(K.sesiones, todas);
        encolar(`servicio/sesiones/${sesionId}`, s);
    }

    /** La mesa quedó pagada: se liberan todas sus sesiones, no solo una. */
    function cerrarMesa(mesa) {
        sesionesAbiertasDeMesa(mesa).forEach(s => cerrarSesion(s.id));
        alCambiar();
    }

    const comandasDeSesion = sesionId =>
        Object.values(getComandas())
            .filter(c => c.sesion === sesionId)
            .sort((a, b) => a.creado - b.creado);

    /** Lo que pidió la mesa, venga de la sesión que venga. */
    function comandasDeMesa(mesa) {
        const ids = new Set(sesionesAbiertasDeMesa(mesa).map(s => s.id));
        return Object.values(getComandas())
            .filter(c => ids.has(c.sesion))
            .sort((a, b) => a.creado - b.creado);
    }

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
        // La letra se cuenta sobre la MESA: si la mesa quedó con dos
        // sesiones abiertas, sus tandas siguen siendo M3, M3b, M3c y no
        // dos series que empiezan de cero y se pisan.
        const tanda  = comandasDeMesa(mesa).length;

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

    /**
     * Cambia unos campos de una comanda y manda a la nube SOLO esos.
     *
     * Antes se reenviaba la comanda entera. Además de pesar de más,
     * obligaba a que el asador tuviera permiso sobre todos los campos
     * para poder tocar el suyo — y con eso el permiso ya no separaba
     * nada. Mandando solo el campo, cada pantalla necesita permiso
     * únicamente sobre lo que de verdad cambia.
     */
    function parchearComanda(id, patch) {
        const todas = getComandas();
        const c = todas[id];
        if (!c) return null;
        Object.assign(c, patch);
        write(K.comandas, todas);
        encolar(`servicio/comandas/${id}`, patch, 'PATCH');
        alCambiar();
        return c;
    }

    /** Un solo toque en la cocina: el plato salió y desaparece de todas las pantallas. */
    const marcarEntregado = id => parchearComanda(id, { estado: 'entregado', entregado: Date.now() });

    /** Deshacer un toque de más: vuelve a la cola como si nada. */
    const devolverANuevo = id => parchearComanda(id, { estado: 'nuevo', entregado: null });

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

    function comandasDe(estacion, estado) {
        return Object.values(getComandas())
            .filter(c => c.estado === (estado || 'nuevo'))
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

    /** Junta lo pedido en varias sesiones y le descuenta lo ya pagado. */
    function cuentaDe(sesionIds) {
        const ids = new Set(sesionIds);
        const lineas = new Map();

        Object.values(getComandas())
            .filter(c => ids.has(c.sesion) && c.estado !== 'anulado')
            .forEach(c => c.items.forEach(it => {
                const clave = it.platoId + '|' + it.precio;
                const l = lineas.get(clave) || { platoId: it.platoId, nombre: it.nombre, precio: it.precio, cantidad: 0, pagada: 0 };
                l.cantidad += it.cantidad;
                lineas.set(clave, l);
            }));

        Object.values(getPagos())
            .filter(p => ids.has(p.sesion))
            .forEach(p => (p.lineas || []).forEach(pl => {
                const clave = pl.platoId + '|' + pl.precio;
                const l = lineas.get(clave);
                if (l) l.pagada += pl.cantidad;
            }));

        const items = [...lineas.values()].map(l => ({ ...l, pendiente: l.cantidad - l.pagada }));
        const total    = items.reduce((s, l) => s + l.cantidad * l.precio, 0);
        const cobrado  = items.reduce((s, l) => s + l.pagada   * l.precio, 0);

        return { items, total, cobrado, saldo: total - cobrado };
    }

    const cuentaDeSesion = sesionId => cuentaDe([sesionId]);

    /**
     * La cuenta que se cobra: la de la MESA entera.
     *
     * Es la que ve el mesero y la que decide cuándo se libera la mesa.
     * Si la mesa quedó con dos sesiones abiertas, aquí salen las dos
     * juntas y no hay platos escondidos.
     */
    const cuentaDeMesa = mesa => cuentaDe(sesionesAbiertasDeMesa(mesa).map(s => s.id));

    function registrarPago({ mesa, lineas, forma }) {
        const abiertas = sesionesAbiertasDeMesa(mesa);
        if (!abiertas.length) return null;

        const monto = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
        const pago = {
            // El cobro se anota en la sesión con la que se viene
            // anotando todo lo de esa mesa, para que quede junto.
            id: nuevoId(), sesion: abiertas[0].id, mesa, lineas, monto,
            forma: forma || 'efectivo', cuando: Date.now()
        };

        const todos = getPagos();
        todos[pago.id] = pago;
        write(K.pagos, todos);
        encolar(`servicio/pagos/${pago.id}`, pago);

        // Si ya no queda saldo, la mesa se libera sola — entera
        if (cuentaDeMesa(mesa).saldo <= 0.001) cerrarMesa(mesa);
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

    /* ------------------------------------------------------------
       QUE NO SE CONFIRME DOS VECES

       Confirmar un pedido lo borra de la bandeja, pero ese borrado
       viaja por la red y tarda. Mientras tanto la bandeja se vuelve a
       preguntar cada pocos segundos, y lo que contesta la nube pisa lo
       que sabe el celular: el pedido reaparecía como si nadie lo
       hubiera tocado. Uno lo confirmaba otra vez y a la parrilla le
       llegaba dos veces el mismo plato, con la cuenta doblada.

       Se cierra por los dos lados:

       1. ESTE celular anota qué pedidos ya pasó a comanda. Aunque la
          nube se los devuelva, no los vuelve a mostrar.
       2. Entre celulares no alcanza con anotar, porque cada uno anota
          lo suyo. Ahí se reclama el pedido en la nube: las reglas solo
          dejan crear la marca si todavía no existe, así que el primero
          que llega la crea y al segundo le rebota. Un solo ganador.
       ------------------------------------------------------------ */

    const getTomados = () => read(K.tomados, {});
    const yaTomado   = llave => !!getTomados()[llave];

    function marcarTomado(llave) {
        const t = getTomados();
        t[llave] = Date.now();
        write(K.tomados, t);
    }

    /** Se olvida de lo que ya no está en la bandeja: no hay nada que tapar. */
    function limpiarTomados() {
        const t = getTomados();
        let cambio = false;
        Object.keys(t).forEach(k => {
            if (!entrantes[k] || Date.now() - t[k] > 6 * 3600 * 1000) { delete t[k]; cambio = true; }
        });
        if (cambio) write(K.tomados, t);
    }

    const getEntrantes = () => Object.entries(entrantes)
        .filter(([llave]) => !yaTomado(llave))
        .map(([llave, e]) => ({ ...e, llave }))
        .sort((a, b) => a.creado - b.creado);

    /**
     * El mesero lo acepta: recién ahí sale a la parrilla y a la cocina.
     *
     * Devuelve la comanda creada, `{ ocupado: true }` si otro celular se
     * le adelantó, o null si ya no había nada que confirmar.
     */
    async function confirmarEntrante(llave, mesa) {
        const e = entrantes[llave];
        if (!e || yaTomado(llave)) return null;

        // Primero se anota aquí: así un doble toque nervioso ya no pasa,
        // aunque la red esté lenta y todavía no se sepa nada de nadie.
        marcarTomado(llave);
        alCambiar();

        if (Red.activo) {
            const r = await Red.reclamar(`servicio/tomados/${llave}`,
                { por: (Red.correoSesion && Red.correoSesion()) || '', cuando: Date.now() });

            /* Rebotó porque otro ya lo tenía. No es un error de red: es la
               respuesta. Se sale sin crear nada. */
            if (!r.ok && (r.status === 401 || r.status === 403)) {
                delete entrantes[llave];
                alCambiar();
                return { ocupado: true };
            }

            /* Si no hubo respuesta (status 0) seguimos adelante. Sin red
               no se puede saber si alguien más lo tomó, y entre perder un
               pedido y arriesgar un duplicado raro, se prefiere que la
               comida salga: el duplicado se ve y se anula, el pedido que
               nunca entró no lo ve nadie. */
        }

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

    /**
     * Guarda lo que llega del canal en vivo.
     *
     * Firebase avisa de dos formas y hay que tratarlas distinto:
     *
     *   ruta "/"          al conectar, con TODAS las comandas de una vez
     *   ruta "/abc123"    despues, con la UNA que acaba de cambiar
     *   ruta "/abc123/estado"  cuando solo cambio un campo
     *
     * Antes se ignoraba la ruta y las tres se metian igual. La primera
     * salia bien y las otras dos metian los campos sueltos de la comanda
     * en la raiz del almacen, asi que el pedido nuevo no aparecia por
     * ningun lado: solo se veia al recargar, que es cuando vuelve a
     * llegar la ruta "/" con todo. De ahi lo de tener que actualizar en
     * la cocina.
     */
    function aplicarEnRuta(clave, ruta, dato) {
        const partes = String(ruta || '/').split('/').filter(Boolean);

        // Llego la rama entera
        if (!partes.length) { mezclar(clave, dato); return; }

        const todo = read(clave, {});
        let nodo = todo;
        for (let i = 0; i < partes.length - 1; i++) {
            if (!nodo[partes[i]] || typeof nodo[partes[i]] !== 'object') nodo[partes[i]] = {};
            nodo = nodo[partes[i]];
        }

        const ultima = partes[partes.length - 1];
        if (dato === null || dato === undefined) delete nodo[ultima];
        else nodo[ultima] = dato;

        write(clave, todo);
    }

    /**
     * Lo que no necesita ser instantáneo se consulta cada tanto, en vez de
     * tener su propia conexión abierta. Que una mesa tarde unos segundos
     * en aparecer abierta no le cambia la vida a nadie; que un pedido no
     * salga, sí.
     *
     * Nunca se borra lo local con una lectura fallida: `leer` devuelve
     * undefined cuando no pudo, y null cuando de verdad no había nada.
     */
    async function refrescarResto() {
        if (!Red.activo) return;

        const [ses, pag, ent] = await Promise.all([
            Red.leer('servicio/sesiones',  true),
            Red.leer('servicio/pagos',     true),
            Red.leer('servicio/entrantes', true)
        ]);

        if (ses !== undefined) mezclar(K.sesiones, ses);
        if (pag !== undefined) mezclar(K.pagos, pag);
        if (ent !== undefined) { entrantes = ent || {}; limpiarTomados(); }

        alCambiar();
    }

    function iniciar(cb, modo) {
        alCambiar = cb || (() => {});
        vaciarCola();

        if (!Red.activo) return;

        /* UNA SOLA CONEXIÓN PERMANENTE, Y SOLO PARA LAS COMANDAS.

           Antes se abría una por rama: cinco, más la del menú. El
           navegador permite unas seis por servidor, así que no quedaba
           ninguna libre para ENVIAR y el pedido esperaba turno hasta
           agotar el plazo. Recargar lo "arreglaba" porque liberaba un
           hueco — de ahí lo de actualizar tres veces.

           Escuchar "servicio" entero de una vez no sirve: en Firebase el
           permiso no sube de las hijas al padre, así que pedir la rama
           completa da permiso denegado aunque cada hija sí se pueda leer. */
        Red.escuchar('servicio/comandas', (datos, ruta) => {
            aplicarEnRuta(K.comandas, ruta, datos);
            alCambiar();
        }, true);

        // La parrilla y la cocina no necesitan nada más que las comandas
        if (modo === 'estacion') return;

        Red.leer('servicio/extras', true).then(x => { if (x) write(K.extras, x); });
        refrescarResto();
        setInterval(refrescarResto, 6000);
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
        write(K.tomados, {});
        entrantes = {};

        if (!Red.activo) { alCambiar(); return true; }

        /* Las reglas de Firebase solo le dejan borrar estas ramas al
           gerente. Si lo intenta otra cuenta, la nube dice que no y aquí
           se devuelve false para que la pantalla no mienta. */
        const ramas = ['servicio/comandas', 'servicio/sesiones', 'servicio/pagos',
                       'servicio/entrantes', 'servicio/tomados'];
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
        getComandas, getSesiones, getPagos, comandasDe, comandasDeSesion, comandasDeMesa,
        sesionDeMesa, sesionesAbiertasDeMesa, cuentaDeSesion, cuentaDeMesa, pagosDeSesion,
        estacionDe, guarnicionDe, categoriaDe, codigoDe, etiquetaDe,
        cubiertosDe, nombreCorto, resumirItems,
        // quién puede qué
        rol, permisoEn, puedeTocar,
        // hacer
        enviarComanda, marcarEntregado, devolverANuevo, marcarSacado, anularComanda,
        abrirSesion, cerrarSesion, cerrarMesa, registrarPago,
        getExtras, guardarExtra,
        // lo que manda el comensal
        enviarEntrante, getEntrantes, confirmarEntrante, descartarEntrante,
        // para el panel del gerente
        comandasComoPedidos, sesionesEntre,
        // estado del sistema
        iniciar, hayLinea, pendientes, porQueNoSale, recibiendo, vaciarCola,
        limpiarViejo, vaciarTodo, nuevoId
    };
})();
