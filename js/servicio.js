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
        tomados:  NS + 'tomados',     // pedidos del comensal que este celular ya pasó a comanda
        apartado: NS + 'apartado'     // lo que la nube rechaza y nunca va a salir
    };

    /* Un dispositivo puede quedarse sin nube (sync.js no cargó o el
       restaurante no la configuró) y aun así tiene que tomar pedidos. */
    const Red = (typeof Sync !== 'undefined') ? Sync : {
        activo: false, haySesion: () => false, rolSesion: () => 'gerente',
        escuchar: () => (() => {}), leer: async () => null,
        guardar: async () => false, parchear: async () => false,
        agregar: async () => false, reclamar: async () => ({ ok: false, status: 0 }),
        enviar: async () => ({ ok: false, status: 0 }),
        ramaViva: () => true, desdeUltimoContacto: () => 0, fallo: () => ''
    };

    /* ============================================================
       QUIÉN PUEDE QUÉ

       Cada celular entra con su cuenta y esa cuenta manda una sola
       pantalla. Las otras las puede mirar, porque saber si la carne ya
       salió sirve a todos, pero no tocarlas: dos manos sobre el mismo
       botón es como se pierde un plato.

         todo    manda en esa pantalla
         anotar  puede tomar pedidos, pero no toca el dinero
         ver     la abre y la lee, pero no puede tocar nada
         no      ni siquiera la abre

       Esto ordena las pantallas. La seguridad de verdad son las reglas
       de Firebase, que revisan lo mismo del lado del servidor: aquí se
       podría hacer trampa editando el navegador, allá no.
       ============================================================ */

    const PERMISOS = {
        gerente:  { comanda: 'todo',   cocina: 'todo', parrilla: 'todo' },
        mesero:   { comanda: 'todo',   cocina: 'ver',  parrilla: 'ver'  },
        cocina:   { comanda: 'no',     cocina: 'todo', parrilla: 'ver'  },
        /* Al asador le llegan pedidos directos y tiene que poder
           anotarlos sin ir a buscar al mesero. Cobrar es otra cosa: el
           dinero se queda donde estaba. */
        parrilla: { comanda: 'anotar', cocina: 'ver',  parrilla: 'todo' }
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

    /** ¿Puede entrar a la comanda, aunque sea solo a anotar? */
    const puedeAnotar = () => ['todo', 'anotar'].includes(permisoEn('comanda'));

    /** ¿Puede cobrar y cerrar mesas? El asador anota, pero no toca el dinero. */
    const puedeCobrar = () => permisoEn('comanda') === 'todo';

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
        const ultima = cola[cola.length - 1];

        /* Marcar ocho platos seguidos son ocho envíos, y con la red del
           local van llegando cuando quieren. Si lo último que espera va
           al mismo sitio y también es un retoque, se le añade encima y
           sale todo junto: ocho toques, un envío.

           Solo se toca lo que aún no ha salido. La tarea de arriba puede
           estar en el aire ahora mismo y añadirle algo sería mandarlo a
           ninguna parte. */
        const enElAire = vaciando && cola.length === 1;
        const mismoSitio = ultima && !enElAire &&
                           metodo === 'PATCH' && ultima.metodo === 'PATCH' && ultima.rama === rama;

        if (mismoSitio) ultima.valor = Object.assign({}, ultima.valor, valor);
        else cola.push({ rama, valor, metodo: metodo || 'PUT', intentos: 0 });

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
                const r = await Red.enviar(tarea.rama, tarea.valor, tarea.metodo);

                if (!r.ok && r.status !== 401 && r.status !== 403) {
                    // El wifi o la nube. Se queda en la cola y se reintenta
                    // más tarde: que no se pierda es más importante que que
                    // llegue ya.
                    marcarLinea(false);
                    break;
                }

                /* Permiso denegado. Esto NO se arregla reintentando: con
                   esta cuenta no va a salir nunca. Antes se reintentaba
                   igual y, como iba primero, tapaba todo lo que venía
                   detrás — la pantalla se quedaba en rojo para siempre y
                   los pedidos buenos no salían tampoco.

                   Se aparta y se sigue. No se borra: queda a un lado,
                   contado y a la vista, para decidirlo a mano. */
                if (!r.ok) apartar(tarea);

                cola = read(K.cola, []).slice(1);
                write(K.cola, cola);
                marcarLinea(true);
            }
        } finally {
            vaciando = false;
        }
    }

    /* ------------------------------------------------------------
       LO QUE LA NUBE RECHAZA

       Casi siempre es de una cuenta que ya no puede hacer eso: pedidos
       anotados desde el celular de la cocina, por ejemplo. Se aparta
       para que no trabe lo demás, pero no se tira a la basura sin que
       nadie lo vea: se cuenta, se muestra y se descarta a mano.
       ------------------------------------------------------------ */

    function apartar(tarea) {
        const fuera = read(K.apartado, []);
        fuera.push({ rama: tarea.rama, valor: tarea.valor, metodo: tarea.metodo,
                     motivo: porQueNoSale(), cuando: Date.now() });
        // Solo las últimas 50: esto es para mirarlo, no un archivo histórico
        write(K.apartado, fuera.slice(-50));
    }

    const apartadas = () => read(K.apartado, []).length;

    /** Qué es lo apartado, en palabras, para poder decidir si importa. */
    function detalleApartado() {
        return read(K.apartado, []).map(t => {
            const id = String(t.rama).split('/').pop();
            const c = getComandas()[id];
            return c ? (c.codigo || codigoDe(c)) : t.rama;
        });
    }

    function descartarApartado() {
        write(K.apartado, []);
        alCambiar();
    }

    /** Volver a intentarlo, por si se entró con la cuenta que sí puede. */
    function reintentarApartado() {
        const fuera = read(K.apartado, []);
        if (!fuera.length) return;
        write(K.cola, read(K.cola, []).concat(
            fuera.map(t => ({ rama: t.rama, valor: t.valor, metodo: t.metodo, intentos: 0 }))));
        write(K.apartado, []);
        vaciarCola();
        alCambiar();
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

    /* ------------------------------------------------------------
       CUÁNTO ARROZ HAY QUE TENER LISTO

       El problema de siempre: las proteínas salen y el arroz sigue
       crudo. Nadie sabe cuánto rinde una olla, así que no se puede
       avisar "quedan tres porciones" sin inventárselo.

       Lo que sí es un hecho: cuántas porciones están pedidas y todavía
       no han salido. Eso no hay que estimarlo, se cuenta. Sube cuando
       entra un pedido grande —que es justo cuando hay que poner la
       olla— y baja cuando la cocina marca entregado.

       Se cuenta por la guarnición que ya declara cada categoría en
       menu-data.js, así que un plato pedido "sin arroz" no cuenta, y el
       arroz suelto de porciones sí.
       ------------------------------------------------------------ */

    const llevaArroz = it =>
        guarnicionDe(it.platoId).includes('arroz') && !(it.sin || []).includes('arroz');

    function arrozPendiente() {
        return Object.values(getComandas())
            .filter(c => c.estado === 'nuevo')
            .reduce((total, c) => total + (c.items || [])
                .reduce((n, it) => n + (llevaArroz(it) ? it.cantidad : 0), 0), 0);
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
       LA TARRINA

       Lo que se lleva a la casa va en tarrina, y la tarrina cuesta. El
       mesero no tiene por qué acordarse ni sacar la cuenta con seis
       mesas esperando: se agrega sola, una por unidad, y se ve en el
       total mientras todavía se está armando el pedido.

       No es un recargo escondido: es un plato más de la carta interna
       (menu-data.js, categoría "extras"). Sale con su nombre en la
       cuenta, así el comensal ve por qué paga 25 centavos más.
       ============================================================ */

    const TARRINA = 't1';

    /** ¿A este plato hay que ponerle tarrina si se lo llevan? */
    function llevaTarrina(platoId) {
        const p = Store.findPlato(platoId);
        if (p && p.tarrina !== undefined) return !!p.tarrina;
        const cat = categoriaDe(platoId);
        return !!(cat && cat.tarrina);
    }

    /** Cuántas tarrinas necesita esta lista. Solo cuenta lo que se llevan. */
    const tarrinasDe = items => (items || []).reduce((n, it) =>
        (it.llevar && it.platoId !== TARRINA && llevaTarrina(it.platoId)) ? n + it.cantidad : n, 0);

    /**
     * Deja la línea de tarrinas al día dentro de una lista de ítems.
     *
     * Se recalcula entera en vez de ir sumando y restando: así no
     * importa por dónde se llegó —agregar un pollo, marcar "para
     * llevar", quitar una unidad— y nunca queda descuadrada.
     *
     * Devuelve true si algo cambió, para no repintar de más.
     */
    function ajustarTarrinas(items) {
        if (!items) return false;
        const plato = Store.findPlato(TARRINA);
        if (!plato) return false;                 // el local no cobra tarrina

        const hacen = tarrinasDe(items);
        const i = items.findIndex(it => it.platoId === TARRINA);
        const tiene = i >= 0 ? items[i].cantidad : 0;
        if (hacen === tiene) return false;

        if (i >= 0) items.splice(i, 1);
        if (hacen > 0) {
            items.push({
                uid: nuevoId(), platoId: TARRINA, nombre: plato.nombre,
                precio: plato.precio, cantidad: hacen,
                sin: [], termino: '', llevar: true, nota: '', elegidas: [], automatico: true
            });
        }
        return true;
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

    /* ------------------------------------------------------------
       PEDIDOS PARA LLEVAR

       Antes todos compartían la mesa 0, o sea una sola cuenta para
       todos: el de Carlos y el de Uber caían en el mismo saco y no
       había forma de cobrar uno sin el otro. Peor todavía, como el cero
       no cuenta como mesa, la pantalla ni siquiera los dibujaba — el
       pedido se mandaba y desaparecía.

       Ahora cada pedido para llevar es su propia cuenta y lo que la
       distingue es el nombre de quien lo va a recoger. Es lo mismo que
       hace cualquiera con un papelito pegado a la funda.
       ------------------------------------------------------------ */

    /** "  Carlos " y "carlos" son el mismo pedido. */
    const claveNombre = n => String(n || '').trim().toLowerCase();

    const esLlevar = s => !s.mesa;

    /** Los pedidos para llevar que todavía no se han cobrado. */
    const llevarAbiertos = () => Object.values(getSesiones())
        .filter(s => esLlevar(s) && s.abierta)
        .sort((a, b) => a.creado - b.creado);

    const llevarPorNombre = nombre =>
        llevarAbiertos().find(s => claveNombre(s.nombre) === claveNombre(nombre)) || null;

    /* ------------------------------------------------------------
       UNA CUENTA ES LO QUE SE COBRA JUNTO

       Puede ser una mesa —con sus sesiones, que a veces son dos— o un
       pedido para llevar. Todo lo que sigue trabaja con una referencia,
       `{ mesa: 3 }` o `{ sesion: 'abc' }`, y no le importa cuál sea:
       así la pantalla de cobrar, la de tandas previas y la cuenta son
       las mismas para los dos casos, no dos copias que se desincronizan.
       ------------------------------------------------------------ */

    function sesionesDe(ref) {
        if (!ref) return [];
        if (ref.sesion) {
            const s = getSesiones()[ref.sesion];
            return s ? [s] : [];
        }
        return sesionesAbiertasDeMesa(ref.mesa);
    }

    /** Cómo se llama esta cuenta en pantalla: "Mesa 3" o "Carlos". */
    function nombreDeCuenta(ref) {
        const ses = sesionesDe(ref);
        if (!ses.length) return ref && ref.mesa ? 'Mesa ' + ref.mesa : 'Para llevar';
        return esLlevar(ses[0]) ? (ses[0].nombre || 'Para llevar') : 'Mesa ' + ses[0].mesa;
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

    /**
     * La cuenta con la que anotar. Para una mesa, la suya. Para llevar,
     * la que tenga ese nombre — y si no existe, una nueva.
     */
    function abrirSesion(mesa, nombre) {
        const ya = mesa ? sesionDeMesa(mesa) : (nombre ? llevarPorNombre(nombre) : null);
        if (ya) return ya;

        const sesion = {
            id: nuevoId(), mesa: mesa || 0, nombre: String(nombre || '').trim(),
            abierta: true, creado: Date.now(), cerrado: null
        };
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

    /** La cuenta quedó pagada: se liberan todas sus sesiones, no solo una. */
    function cerrarCuenta(ref) {
        sesionesDe(ref).forEach(s => cerrarSesion(s.id));
        alCambiar();
    }

    const cerrarMesa = mesa => cerrarCuenta({ mesa });

    const comandasDeSesion = sesionId =>
        Object.values(getComandas())
            .filter(c => c.sesion === sesionId)
            .sort((a, b) => a.creado - b.creado);

    /** Las tandas de una cuenta, en el orden en que se pidieron. */
    function tandasDe(ref) {
        const ids = new Set(sesionesDe(ref).map(s => s.id));
        return Object.values(getComandas())
            .filter(c => ids.has(c.sesion))
            .sort((a, b) => a.creado - b.creado);
    }

    const comandasDeMesa = mesa => tandasDe({ mesa });

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

    /**
     * Deja los ítems como los guarda una comanda: cada uno con su
     * identificador propio y con la estación ya resuelta.
     *
     * Se usa al mandar y al editar. Cuando eran dos copias, editar una
     * comanda le borraba la estación a los platos y el pedido dejaba de
     * aparecer en la parrilla.
     */
    const normalizarItems = items => (items || []).map(it => ({
        uid: it.uid || nuevoId(),
        platoId: it.platoId,
        nombre: it.nombre,
        precio: it.precio,
        cantidad: it.cantidad,
        estacion: estacionDe(it.platoId),
        sin: it.sin || [],               // guarniciones que se quitan
        termino: it.termino || '',
        llevar: !!it.llevar,
        nota: it.nota || '',
        elegidas: it.elegidas || [],     // las carnes de un mixto
        automatico: !!it.automatico      // la tarrina, que se puso sola
    }));

    function enviarComanda({ mesa, nombre, items, nota, origen, sesion: sesionId }) {
        if (!items || !items.length) return null;

        /* Lo que se agrega a una tanda ya servida se pega a la cuenta de
           ESA tanda, no a "la sesión de esa mesa": si la mesa tiene dos
           cuentas abiertas se le cobraría a la equivocada. */
        const sesion = (sesionId && getSesiones()[sesionId]) || abrirSesion(mesa, nombre);
        // La letra se cuenta sobre la CUENTA: si la mesa quedó con dos
        // sesiones abiertas, sus tandas siguen siendo M3, M3b, M3c y no
        // dos series que empiezan de cero y se pisan.
        const ref    = mesa ? { mesa } : { sesion: sesion.id };
        const tanda  = tandasDe(ref).length;

        const copia = normalizarItems(items);
        ajustarTarrinas(copia);

        const comanda = {
            id: nuevoId(),
            sesion: sesion.id,
            mesa: mesa || 0,
            // El nombre de quien recoge. Va también en la comanda y no
            // solo en la sesión, porque la parrilla y la cocina reciben
            // comandas sueltas: no leen las sesiones.
            nombre: sesion.nombre || '',
            tanda,
            items: copia,
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
     *
     * Y "de verdad" hay que tomárselo en serio: un campo que se manda
     * con el mismo valor que ya tenía sigue pidiendo permiso sobre él.
     * El mesero corregía una bebida y de paso reenviaba la nota sin
     * tocarla; como la nota no era suya, Firebase rechazaba el envío
     * ENTERO —es todo o nada— y la corrección se quedaba apartada
     * diciendo "con esa cuenta no va a salir". Lo que no cambió no se
     * manda, así que tampoco hace falta poder tocarlo.
     */
    function parchearComanda(id, patch) {
        const todas = getComandas();
        const c = todas[id];
        if (!c) return null;

        const cambios = {};
        Object.keys(patch).forEach(campo => {
            /* null es "bórralo de la nube": se manda siempre, porque aquí
               puede constar vacío y allá seguir estando. */
            const igual = patch[campo] !== null &&
                          JSON.stringify(patch[campo]) === JSON.stringify(c[campo]);
            if (!igual) cambios[campo] = patch[campo];
        });

        if (!Object.keys(cambios).length) return c;   // nada que contar

        Object.assign(c, cambios);
        write(K.comandas, todas);
        encolar(`servicio/comandas/${id}`, cambios, 'PATCH');
        alCambiar();
        return c;
    }

    /** Un solo toque en la cocina: el plato salió y desaparece de todas las pantallas. */
    const marcarEntregado = id => parchearComanda(id, { estado: 'entregado', entregado: Date.now() });

    /** Deshacer un toque de más: vuelve a la cola como si nada. */
    const devolverANuevo = id => parchearComanda(id, { estado: 'nuevo', entregado: null });

    /** El asador limpia su tarjeta sin tocarle nada a la cocina. */
    const marcarSacado = (id, valor) => parchearComanda(id, { sacado: valor !== false });

    /* ============================================================
       PLATO POR PLATO

       Un pedido de tres cosas se entregaba de un solo toque, así que
       bastaba con despistarse para que saliera la mesa sin la chuleta.
       Ahora cada unidad se marca aparte y ENTREGADO no se enciende
       hasta que estén todas: la pantalla no deja cerrar lo que no está.

       Se guarda como { uid del ítem: cuántas unidades van listas }, y se
       manda solo esa rama. Así la cocina no necesita permiso sobre nada
       más de la comanda.
       ============================================================ */

    function marcarListo(comandaId, uid, cuantos) {
        const todas = getComandas();
        const c = todas[comandaId];
        if (!c) return null;

        const it = (c.items || []).find(x => x.uid === uid);
        const tope = it ? it.cantidad : 0;
        const n = Math.max(0, Math.min(tope, cuantos));

        c.listos = Object.assign({}, c.listos);
        if (n > 0) c.listos[uid] = n;
        else delete c.listos[uid];

        write(K.comandas, todas);
        encolar(`servicio/comandas/${comandaId}/listos`, { [uid]: n > 0 ? n : null }, 'PATCH');
        alCambiar();
        return c;
    }

    /** Cuántas unidades de ese ítem están marcadas. */
    const listasDe = (c, uid) => ((c && c.listos) || {})[uid] || 0;

    /**
     * ¿Está todo marcado? Se le pasan los ítems que esa pantalla ve, no
     * los de la comanda: la cocina no ve las bebidas, y esperar a que
     * alguien marque una cola que nunca le llegó dejaría el botón
     * apagado para siempre.
     */
    const todoListo = (c, items) =>
        (items || (c && c.items) || []).every(it => listasDe(c, it.uid) >= it.cantidad);

    /* ============================================================
       CAMBIAR DE MESA

       La gente se cambia de mesa a mitad de la comida y hasta ahora eso
       obligaba a cobrar y volver a anotar todo. Se mueve la cuenta
       entera —sesiones, tandas y cobros van pegados a ella— y se
       reescribe el código de cada tanda, porque un papel que dice M5
       encima de la mesa 2 es peor que no tener papel.
       ============================================================ */

    function moverMesa(origen, destino) {
        if (!destino || origen === destino) return { ok: false, motivo: 'Escoge una mesa distinta.' };

        const sesiones = sesionesAbiertasDeMesa(origen);
        if (!sesiones.length) return { ok: false, motivo: `La mesa ${origen} está libre.` };

        if (sesionesAbiertasDeMesa(destino).length) {
            return { ok: false, motivo: `La mesa ${destino} está ocupada. Cóbrala primero o escoge otra.` };
        }

        const todas = getSesiones();
        sesiones.forEach(s => {
            todas[s.id].mesa = destino;
            todas[s.id].movida = Date.now();
        });
        write(K.sesiones, todas);
        sesiones.forEach(s => encolar(`servicio/sesiones/${s.id}`, todas[s.id]));

        // El código se rehace con la mesa nueva, conservando la letra:
        // M5b pasa a ser M2b y sigue siendo la segunda tanda.
        tandasDe({ mesa: destino }).forEach(c => {
            parchearComanda(c.id, { mesa: destino, codigo: codigoDe({ ...c, mesa: destino }) });
        });

        alCambiar();
        return { ok: true, motivo: '' };
    }

    /** Corregir un pedido mal tomado: se anula entero y se vuelve a mandar. */
    const anularComanda = (id, motivo) =>
        parchearComanda(id, { estado: 'anulado', anulado: Date.now(), motivo: motivo || '' });

    /* ============================================================
       HASTA CUÁNDO SE PUEDE TOCAR UNA TANDA

       El error de tomar el pedido se descubre enseguida: "era chuleta,
       no pollo". Para eso hay un minuto de gracia en el que se puede
       cambiar todo. Pasado ese minuto la carne ya está en la parrilla y
       cambiarla es como no haberla pedido nunca — pero la gente sigue
       pidiendo colas y porciones a mitad de la comida, y eso no le
       cuesta nada a nadie.

       Por eso son dos permisos distintos, no uno:

         todo       el minuto de gracia: se cambia lo que sea
         agregados  después: solo lo que no se cocina (ver menu-data.js,
                    campo editableSiempre)
         no         ya se pagó, ya se entregó, o está anulada
       ============================================================ */

    const MINUTO_DE_GRACIA = 60000;

    /** Lo que queda del minuto de gracia, en segundos. 0 si ya pasó. */
    const graciaRestante = c =>
        Math.max(0, Math.ceil((MINUTO_DE_GRACIA - (Date.now() - c.creado)) / 1000));

    function edicionDe(c) {
        if (!c || c.estado === 'anulado' || c.estado === 'entregado') return 'no';

        const s = getSesiones()[c.sesion];
        if (!s || !s.abierta) return 'no';          // ya se cobró y se cerró

        // Si el asador ya la sacó, la proteína existe: no hay nada que cambiar
        if (c.sacado) return 'agregados';

        return graciaRestante(c) > 0 ? 'todo' : 'agregados';
    }

    /**
     * ¿Este plato se puede seguir tocando pasado el minuto?
     *
     * Lo decide menu-data.js y por omisión es NO, que es lo seguro: un
     * plato nuevo que alguien agregue mañana queda bloqueado hasta que
     * se diga lo contrario, en vez de quedar abierto sin que nadie lo note.
     */
    function editableSiempre(platoId) {
        if (String(platoId).startsWith('x')) return true;   // bebidas de la tienda
        const p = Store.findPlato(platoId);
        if (p && p.editableSiempre !== undefined) return !!p.editableSiempre;
        const cat = categoriaDe(platoId);
        return !!(cat && cat.editableSiempre);
    }

    /**
     * Si se puede anular, y si no, por qué.
     *
     * El motivo importa tanto como la respuesta: "no se puede" a secas
     * hace que el mesero lo intente tres veces y termine yendo a la
     * cocina igual. Decirle quién ya tocó el pedido lo manda directo a
     * hablar con la persona correcta.
     */
    function puedeAnular(c) {
        if (!c)                        return { ok: false, motivo: 'Esa tanda ya no existe.' };
        if (c.estado === 'anulado')    return { ok: false, motivo: 'Ya está anulada.' };
        if (c.estado === 'entregado')  return { ok: false, motivo: 'La cocina ya la entregó. Habla con la cocina.' };
        if (c.sacado)                  return { ok: false, motivo: 'El asador ya la sacó de la parrilla. Habla con él.' };
        return { ok: true, motivo: '' };
    }

    /**
     * Guarda una tanda editada. Conserva el identificador y el número de
     * tanda: para la cocina sigue siendo el mismo pedido, corregido, no
     * uno nuevo que aparece de la nada mientras el otro desaparece.
     */
    function editarComanda(id, items, nota) {
        const c = getComandas()[id];
        if (!c || !items || !items.length) return null;

        const copia = normalizarItems(items);
        ajustarTarrinas(copia);

        const patch = {
            items: copia,
            cubiertos: cubiertosDe(copia),
            codigo: codigoDe({ ...c, items: copia })
        };

        /* La nota solo va si de verdad se escribió algo distinto. La
           pantalla llama sin nota cuando solo se corrigen platos, y
           rellenarla con la de antes obligaba a pedir un permiso que esa
           corrección no necesitaba. */
        const notaNueva = nota != null ? nota : (c.nota || '');
        if (notaNueva !== (c.nota || '')) patch.nota = notaNueva;

        /* Abrir una tanda, mirarla y cerrarla no es corregirla. Sin esto
           la hora de "editado" cambiaba sola y se mandaba un aviso a
           todos los celulares por no haber hecho nada. */
        const hayCambio = Object.keys(patch)
            .some(k => JSON.stringify(patch[k]) !== JSON.stringify(c[k]));
        if (!hayCambio) return c;

        patch.editado = Date.now();
        return parchearComanda(id, patch);
    }

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
    function sumarCuenta(sesionIds) {
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

    const cuentaDeSesion = sesionId => sumarCuenta([sesionId]);

    /**
     * La cuenta que se cobra. Da igual si es una mesa o un pedido para
     * llevar: es lo mismo, y por eso la pantalla de cobrar es una sola.
     *
     * Si una mesa quedó con dos sesiones abiertas, aquí salen las dos
     * juntas y no hay platos escondidos.
     */
    const cuentaDe = ref => sumarCuenta(sesionesDe(ref).map(s => s.id));

    const cuentaDeMesa = mesa => cuentaDe({ mesa });

    function registrarPago({ mesa, sesion, lineas, forma }) {
        const ref = sesion ? { sesion } : { mesa };
        const abiertas = sesionesDe(ref);
        if (!abiertas.length) return null;

        const monto = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
        const pago = {
            // El cobro se anota en la sesión con la que se viene
            // anotando todo lo de esa cuenta, para que quede junto.
            id: nuevoId(), sesion: abiertas[0].id, mesa: abiertas[0].mesa || 0,
            lineas, monto, forma: forma || 'efectivo', cuando: Date.now()
        };

        const todos = getPagos();
        todos[pago.id] = pago;
        write(K.pagos, todos);
        encolar(`servicio/pagos/${pago.id}`, pago);

        // Si ya no queda saldo, la cuenta se libera sola — entera
        if (cuentaDe(ref).saldo <= 0.001) cerrarCuenta(ref);
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
     *
     * Y falta la mitad del asunto: `esRetoque` distingue el aviso de
     * "esto es todo lo que hay aqui" del de "solo cambiaron estos
     * campos". Los dos llegan con la misma pinta —una ruta y un objeto—
     * pero el segundo hay que MEZCLARLO. Metiendolo tal cual se borraba
     * todo lo que la nube no repitio en el aviso:
     *
     *   la cocina marca el pollo    -> se manda { i1: 1 }
     *   la nube lo repite de vuelta -> listos pasaba a valer { i1: 1 }
     *   la cocina marca la chuleta  -> se manda { i2: 1 }
     *   la nube lo repite de vuelta -> listos pasaba a valer { i2: 1 }
     *
     * y el visto del pollo se apagaba solo, sin que nadie lo tocara.
     */
    function aplicarEnRuta(clave, ruta, dato, esRetoque) {
        const partes = String(ruta || '/').split('/').filter(Boolean);

        // Llego la rama entera
        if (!partes.length && !esRetoque) { mezclar(clave, dato); return; }

        const todo = read(clave, {});
        let nodo = todo;

        /* Un retoque nombra el sitio ENTERO en su ruta y trae dentro los
           campos; un dato completo nombra en la ruta el campo que se
           reemplaza. Por eso uno baja un escalon mas que el otro. */
        const hasta = esRetoque ? partes.length : partes.length - 1;
        for (let i = 0; i < hasta; i++) {
            if (!nodo[partes[i]] || typeof nodo[partes[i]] !== 'object') nodo[partes[i]] = {};
            nodo = nodo[partes[i]];
        }

        if (esRetoque) {
            // Campo a campo: lo que no viene en el aviso se queda como estaba
            Object.keys(dato || {}).forEach(k => {
                if (dato[k] === null) delete nodo[k];
                else nodo[k] = dato[k];
            });
        } else {
            const ultima = partes[partes.length - 1];
            if (dato === null || dato === undefined) delete nodo[ultima];
            else nodo[ultima] = dato;
        }

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
        Red.escuchar('servicio/comandas', (datos, ruta, esRetoque) => {
            aplicarEnRuta(K.comandas, ruta, datos, esRetoque);
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
        /* También lo que este celular tenía sin mandar. Si no, "dejar
           limpio" dejaba la cola llena de cosas que se refieren a
           comandas que ya no existen. */
        write(K.cola, []);
        write(K.apartado, []);
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
        estacionDe, guarnicionDe, arrozPendiente, categoriaDe, codigoDe, etiquetaDe,
        cubiertosDe, nombreCorto, resumirItems,
        // una cuenta: una mesa o un pedido para llevar
        sesionesDe, tandasDe, cuentaDe, nombreDeCuenta, llevarAbiertos, llevarPorNombre,
        // reglas de lo que todavía se puede tocar
        edicionDe, graciaRestante, editableSiempre, puedeAnular,
        // la tarrina, que se pone sola
        ajustarTarrinas, tarrinasDe, llevaTarrina,
        // plato por plato en la cocina
        marcarListo, listasDe, todoListo,
        // quién puede qué
        rol, permisoEn, puedeTocar, puedeAnotar, puedeCobrar,
        // hacer
        enviarComanda, editarComanda, marcarEntregado, devolverANuevo, marcarSacado, anularComanda,
        abrirSesion, cerrarSesion, cerrarMesa, cerrarCuenta, moverMesa, registrarPago,
        getExtras, guardarExtra,
        // lo que manda el comensal
        enviarEntrante, getEntrantes, confirmarEntrante, descartarEntrante,
        // para el panel del gerente
        comandasComoPedidos, sesionesEntre,
        // estado del sistema
        iniciar, hayLinea, pendientes, porQueNoSale, recibiendo, vaciarCola,
        apartadas, detalleApartado, descartarApartado, reintentarApartado,
        limpiarViejo, vaciarTodo, nuevoId
    };
})();
