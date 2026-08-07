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
        apartado: NS + 'apartado',    // lo que la nube rechaza y nunca va a salir
        llamadas: NS + 'llamadas',    // la cocina o el asador llamando al salón
        misLlam:  NS + 'mis_llamadas' // cuándo llamó ESTE aparato, para el freno
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
        gerente:  { comanda: 'todo',   cocina: 'todo', parrilla: 'todo', servir: 'ver' },
        mesero:   { comanda: 'todo',   cocina: 'ver',  parrilla: 'ver',  servir: 'ver' },
        cocina:   { comanda: 'no',     cocina: 'todo', parrilla: 'ver',  servir: 'ver' },
        /* Al asador le llegan pedidos directos y tiene que poder
           anotarlos sin ir a buscar al mesero. Cobrar es otra cosa: el
           dinero se queda donde estaba. */
        parrilla: { comanda: 'anotar', cocina: 'ver',  parrilla: 'todo', servir: 'ver' },
        /* El que pone los cubiertos y lleva los platos. Su pantalla es
           de puro leer: no hay un solo botón que cambie nada, porque
           lleva las manos ocupadas y porque el pedido no es suyo. */
        servir:   { comanda: 'no',     cocina: 'no',   parrilla: 'no',   servir: 'ver' }
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

    /* ============================================================
       LO QUE HAY EN LA NEVERA

       El gerente pone "hoy hay 12 pollos" y de ahí sale todo. Cuántos
       quedan NO se guarda en ningún lado: se resta contra las comandas
       cada vez que se pregunta.

           quedan  =  lo que puso el gerente  −  lo que se pidió desde
                      que lo puso

       Por qué restar y no llevar un contador:

         · Cinco celulares bajando un número a la vez terminan mintiendo
           la noche que dos meseros toquen al mismo tiempo. Una resta da
           igual en los cinco.
         · Anular un pedido devuelve el pollo solo, sin escribir nada.
         · Las reglas de la nube no dejan otra cosa: el menú solo lo
           escribe el gerente. Y así debe ser — un mesero no puede andar
           cambiando el menú del local.
       ============================================================ */

    /** De qué producto sale el plato. El que no lo dice es el suyo propio. */
    function productoDe(platoId) {
        const p = Store.findPlato(platoId);
        return (p && p.usa) || platoId;
    }

    /** Cómo se llama el producto, para escribirlo en pantalla. */
    function nombreProducto(producto) {
        if (typeof PRODUCTOS !== 'undefined' && PRODUCTOS[producto]) return PRODUCTOS[producto];
        const p = Store.findPlato(producto);
        return p ? p.nombre : producto;
    }

    /**
     * Qué se lleva de la nevera un renglón del pedido.
     *
     * Un mixto no gasta "un mixto": gasta las carnes que el mesero
     * escogió. Un mixto de pollo y costilla saca un pollo y una costilla,
     * y si son dos mixtos, dos de cada una.
     */
    function consumoDe(it) {
        const p = Store.findPlato(it.platoId);
        const cuenta = {};

        if (p && p.elegir) {
            (it.elegidas || []).forEach(id => {
                const k = productoDe(id);
                cuenta[k] = (cuenta[k] || 0) + (it.cantidad || 1);
            });
            return cuenta;
        }

        cuenta[productoDe(it.platoId)] = it.cantidad || 1;
        return cuenta;
    }

    /** Cuánto se ha pedido de un producto desde que el gerente puso el número. */
    function gastadoDe(producto, desde) {
        return Object.values(getComandas())
            .filter(c => c.estado !== 'anulado' && (c.creado || 0) >= desde)
            .reduce((total, c) => total + (c.items || [])
                .reduce((n, it) => n + (consumoDe(it)[producto] || 0), 0), 0);
    }

    const mismoDia = (a, b) => {
        const x = new Date(a), y = new Date(b);
        return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth()
            && x.getDate() === y.getDate();
    };

    /**
     * Cuántos quedan. `null` = sin límite, que es como funciona todo
     * mientras el gerente no ponga un número.
     *
     * EL NÚMERO DE AYER NO VALE HOY. Si no se vuelve a poner, el stock
     * vence y el plato se vende normal. Al revés —arrastrarlo— el local
     * abriría un jueves con el sistema diciendo que no quedan pollos
     * porque el domingo se acabaron, y nadie entendería por qué no se
     * puede vender.
     */
    function quedanDe(producto) {
        const s = Store.getStock()[producto];
        if (!s || typeof s.hay !== 'number') return null;
        if (!mismoDia(s.puesto, Date.now())) return null;
        return Math.max(0, s.hay - gastadoDe(producto, s.puesto));
    }

    /** Cuántos quedan de este plato. Un mixto no tiene un número solo. */
    function quedanDePlato(platoId) {
        const p = Store.findPlato(platoId);
        if (p && p.elegir) return null;
        return quedanDe(productoDe(platoId));
    }

    /**
     * ¿Se puede pedir?
     *
     * Dos candados independientes, que fue lo que pidió el dueño:
     *   · el producto se acabó   -> caen todos los platos que lo usan
     *   · el plato está apagado  -> cae solo ese (se acabó la apanadura)
     *
     * Un mixto vive mientras le quede alguna carne que escoger.
     */
    function sePuedePedir(platoId) {
        const p = Store.findPlato(platoId);

        /* OJO: que un plato no esté en el menú NO quiere decir que se
           haya acabado. Las bebidas de la tienda de al lado se crean al
           vuelo con id 'x…' y no viven en menu-data.js — se les preguntó
           por su stock, no lo tenían, y se las daba por agotadas. En el
           salón salía "Se acabó el xmsdwl45nppiz7", que además no le
           dice nada a nadie. Lo que no está en el menú no tiene nevera:
           se vende siempre. */
        if (p && p.agotado) return false;
        if (p && p.elegir)  return p.elegir.entre.some(id => sePuedePedir(id));

        const q = quedanDe(productoDe(platoId));
        return q === null || q > 0;
    }

    /**
     * Lo que se publica para la carta del comensal: cuántos quedan de
     * cada producto que tenga número. Su celular no puede leer las
     * comandas, así que no puede restar — lo publica quien sí puede.
     */
    function quedanTodos() {
        const fuera = {};
        Object.keys(Store.getStock()).forEach(prod => {
            const q = quedanDe(prod);
            if (q !== null) fuera[prod] = q;
        });
        return fuera;
    }

    /* ------------------------------------------------------------
       LA ÚLTIMA PREGUNTA, JUSTO ANTES DE MANDAR

       El agujero que encontró el dueño: el mesero y el asador toman
       pedido a la vez, los dos ven 6 costillas, los dos anotan 6 y los
       dos envían. Salen 12 a la parrilla y solo hay 6.

       Y los dos celulares tenían razón. Un pedido a medio escribir no
       existe para nadie más —ni debe existir, el cliente todavía está
       decidiendo— así que ninguno podía ver al otro. La resta protege
       del error de UNA persona, no de dos a la vez.

       Lo que faltaba era preguntar al final. Antes de escribir nada se
       le pide a la nube lo último que hayan mandado los demás, se
       vuelve a contar y SE RECORTA lo que ya no existe.

       Se recorta y no se rechaza el pedido entero: las bebidas y el
       pollo del mismo pedido no tienen la culpa, y la mesa no puede
       quedarse sin nada porque faltara una costilla.

       Queda un hueco de milisegundos —si los dos tocan Enviar en el
       mismo instante— que solo se cerraría apartando la costilla en la
       nube. Se decidió no hacerlo: cuesta otra vuelta a Firebase en cada
       envío y el caso real es el de los minutos, no el del instante.
       ------------------------------------------------------------ */

    async function revisarStock(items) {
        const vacio = { items, recortes: [] };
        if (!items || !items.length) return vacio;
        if (!Object.keys(Store.getStock()).length) return vacio;   // local sin stock

        /* Sin línea no se puede preguntar. Se manda igual: quedarse sin
           tomar el pedido por no poder comprobar sería peor que el
           riesgo, y la pantalla ya avisa cuando no hay conexión. */
        if (Red.activo && Red.haySesion()) {
            const frescas = await Red.leer('servicio/comandas', true);
            if (frescas !== undefined) mezclar(K.comandas, frescas);
        }

        const restante = {};
        const queda = prod => {
            if (!(prod in restante)) {
                const q = quedanDe(prod);
                restante[prod] = (q === null) ? Infinity : q;
            }
            return restante[prod];
        };

        const salida = [];
        const recortes = [];

        items.forEach(it => {
            const consumo = consumoDe(it);
            const pedidos = it.cantidad || 1;
            const productos = Object.keys(consumo);

            if (!productos.length) { salida.push(it); return; }

            /* Cuántas unidades caben. Un mixto gasta de dos neveras a la
               vez, así que manda la más corta de las dos. */
            let caben = pedidos;
            productos.forEach(prod => {
                const porUnidad = consumo[prod] / pedidos;
                if (porUnidad > 0) caben = Math.min(caben, Math.floor(queda(prod) / porUnidad));
            });
            caben = Math.max(0, caben);

            productos.forEach(prod => { restante[prod] -= consumo[prod] / pedidos * caben; });

            if (caben > 0) salida.push(caben === pedidos ? it : { ...it, cantidad: caben });
            if (caben < pedidos) {
                recortes.push({
                    nombre: it.nombre,
                    pedidos,
                    entraron: caben,
                    producto: nombreProducto(productos[0])
                });
            }
        });

        return { items: salida, recortes };
    }

    /**
     * Publicar el espejo. Solo lo hace quien toma pedidos: la cocina, la
     * parrilla y el que sirve no tienen por qué escribir en el menú, y
     * un local que no usa stock no escribe nada.
     */
    function publicarStock() {
        if (!Object.keys(Store.getStock()).length) return;
        if (permisoEn('comanda') === 'no') return;
        Store.publicarEspejo(quedanTodos());
    }

    /* ------------------------------------------------------------
       SERVIR EL PLATO DE OTRA FORMA

       "Solo patacones y ensalada" no se puede armar quitando: en una
       parrillada los patacones no están para quitarlos, hay que
       ponerlos. Por eso el cambio se guarda como lo que el plato queda
       llevando, y de ahí sale todo lo demás.
       ------------------------------------------------------------ */

    const listaCambios = () => (typeof CAMBIOS !== 'undefined' && CAMBIOS) || [];

    const cambioPorId = id => listaCambios().find(c => c.id === id) || null;

    /**
     * Las formas de servir que de verdad cambian algo en ESTE plato.
     *
     * Se piden tres cosas, y cada una quita un botón que no serviría:
     *
     *   - Que sea un plato que se arma. Una porción de patacones tiene
     *     guarnición —ella misma— pero "solo patacones y ensalada" en
     *     una porción de patacones no quiere decir nada. Por eso se pide
     *     el mismo 'cubierto' que ya marca los platos que alguien se
     *     sienta a comer.
     *   - Que traiga acompañantes. Una porción de pollo o una cola no.
     *   - Que el cambio no sea lo que el plato ya trae.
     */
    function cambiosDe(platoId) {
        const base = guarnicionDe(platoId);
        const cat  = categoriaDe(platoId);
        if (!base.length || !(cat && cat.cubierto)) return [];

        const iguales = (a, b) =>
            a.length === b.length && a.every(x => b.includes(x));

        return listaCambios().filter(c => !iguales(c.deja, base));
    }

    /**
     * Con qué se sirve el plato al final, ya contando lo que se le quitó
     * o la forma en que se pidió. Es lo que la cocina tiene que emplatar.
     */
    function guarnicionFinal(it) {
        const cam = it.cambio && cambioPorId(it.cambio);
        if (cam) return cam.deja.slice();
        return guarnicionDe(it.platoId).filter(g => !(it.sin || []).includes(g));
    }

    /** La frase que lee la cocina. Vacía si el plato va como siempre. */
    function comoSeSirve(it) {
        const cam = it.cambio && cambioPorId(it.cambio);
        return cam ? cam.etiqueta : '';
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

       Se cuenta por la guarnición con la que el plato SALE, así que un
       plato pedido "sin arroz" —o servido solo con patacones y
       ensalada— no cuenta, y el arroz suelto de porciones sí.
       ------------------------------------------------------------ */

    const llevaArroz = it => guarnicionFinal(it).includes('arroz');

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

    /**
     * Cómo se le dice al plato PUERTAS ADENTRO.
     *
     * En la carta se vende "Mixto 2 Carnes", que es lo que el comensal
     * entiende. En la cocina se habla de proteínas, y ahí ese mismo
     * plato es "Mixto 2 Proteínas". Son dos nombres para lo mismo y
     * cada uno vale en su sitio.
     *
     * Se resuelve POR EL PLATO y no por lo que quedó escrito en la
     * comanda: el nombre se guarda tal como estaba el día del pedido, y
     * si el gerente lo cambia, lo viejo seguiría diciendo lo de antes.
     * El de repuesto es ese texto guardado, para lo que ya no está en el
     * menú — las bebidas de la tienda, por ejemplo.
     */
    function nombreInterno(platoId, deRepuesto) {
        const p = Store.findPlato(platoId);
        if (p && p.interno) return p.interno;
        return deRepuesto || (p && p.nombre) || '';
    }

    /** Igual, pero recibiendo el ítem de una comanda. */
    const nombreDeItem = it => nombreInterno(it.platoId || it.id, it.nombre);

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

    /** Todos los cubiertos que lleva esa mesa, sumando sus tandas. */
    const cubiertosDeSesion = sesionId =>
        comandasDeSesion(sesionId)
            .filter(c => c.estado !== 'anulado')
            .reduce((suma, c) => suma + (c.cubiertos || 0), 0);

    /**
     * El turno de cada mesa: en qué orden se fueron ocupando.
     *
     * Es lo que usa el que sirve para saber por dónde va. Si está en el
     * ⑧, del ① al ⑦ ya tienen sus cubiertos puestos, sin que nadie haya
     * tenido que marcar nada.
     *
     * El número NO se recalcula cuando una mesa se va: si la ① paga, la
     * ② sigue siendo la ②. Renumerar seria peor que no numerar — el que
     * sirve perderia la referencia a mitad del servicio.
     *
     * Vuelve a ① cuando el local se queda vacío, para que cada noche
     * empiece en uno y no se termine en el treinta.
     */
    function turnosDeSesion() {
        const sesiones = Object.values(getSesiones()).sort((a, b) => a.creado - b.creado);
        const turnos = {};
        let n = 0;

        sesiones.forEach(s => {
            const habiaOtraAbierta = sesiones.some(o =>
                o.id !== s.id &&
                o.creado <= s.creado &&
                (!o.cerrado || o.cerrado > s.creado));

            n = habiaOtraAbierta ? n + 1 : 1;
            turnos[s.id] = n;
        });

        return turnos;
    }

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
        cambio: it.cambio || '',         // servido de otra forma (solo patacones y ensalada)
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
        publicarStock();

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
        /* Anular o corregir una tanda devuelve lo que llevaba: como los
           que quedan se restan y no se descuentan, no hay que sumar
           nada a mano — pero el espejo del comensal sí hay que volver a
           publicarlo. */
        publicarStock();
        return c;
    }

    /* ============================================================
       LLAMAR AL SALÓN

       La cocina y el asador no pueden salir de su sitio, así que hasta
       ahora gritaban. El gerente pidió un botón.

       EL BOTÓN VA EN LA CABECERA, junto al punto de la conexión, y no en
       cada tarjeta. Lo decidió el dueño y tenía razón por un motivo que
       yo no había visto: en la cabecera el botón está SIEMPRE. Puesto en
       las tarjetas, una cocina con el tablero vacío se quedaba sin poder
       llamar — que es justo cuando hay que pedir cubiertos.

       El precio de eso es que la llamada no dice de qué mesa es. Se
       acepta: un timbre en la cocina significa "ven a la cocina", que es
       lo que ya quería decir el grito al que reemplaza.

       NADIE TIENE QUE APAGARLA. Se guarda cuándo se llamó y se da por
       viva mientras sea reciente: al minuto y medio desaparece sola. Un
       aviso que hay que apagar es un aviso que alguien se olvida de
       apagar, y el de al lado ya no sabe si es de ahora o de hace media
       hora.
       ============================================================ */

    const DURA_LLAMADA = 90 * 1000;

    /* EL FRENO.

       Sin él, un cocinero apurado toca el botón seis veces y al mesero
       le suenan seis alarmas seguidas — y a la séptima ya no las mira.
       Un timbre que se abusa deja de ser un timbre.

       Dos topes, los que pidió el dueño: uno cada 5 segundos y no más de
       4 en un minuto. El primero corta el dedo nervioso; el segundo, la
       insistencia. Y se cuentan POR APARATO: es su propio freno, no una
       cuota que se pelee con la parrilla.

       Se guardan en el celular y no en la nube: son cuatro números y
       nadie más necesita saberlos. */
    const ESPERA_LLAMADA  = 5 * 1000;
    const TOPE_POR_MINUTO = 4;

    const getLlamadas = () => read(K.llamadas, {});

    const misLlamadas = aQuien => {
        const ahora = Date.now();
        const todas = read(K.misLlam, {});
        return (todas[aQuien] || []).filter(t => ahora - t < 60000);
    };

    /**
     * ¿Puedo llamar ahora? Y si no, cuántos segundos faltan.
     *
     * Devuelve también POR QUÉ, porque no es lo mismo "acabas de
     * llamar" que "ya llamaste cuatro veces este minuto": el segundo
     * quiere decir que al mesero le pasa algo, y hay que ir a buscarlo.
     */
    function puedeLlamar(aQuien) {
        const ahora = Date.now();
        const h = misLlamadas(aQuien);

        if (h.length) {
            const desdeLaUltima = ahora - h[h.length - 1];
            if (desdeLaUltima < ESPERA_LLAMADA) {
                return { ok: false, motivo: 'recien',
                         faltan: Math.ceil((ESPERA_LLAMADA - desdeLaUltima) / 1000) };
            }
        }
        if (h.length >= TOPE_POR_MINUTO) {
            return { ok: false, motivo: 'tope',
                     faltan: Math.ceil((60000 - (ahora - h[0])) / 1000) };
        }
        return { ok: true, motivo: '', faltan: 0 };
    }

    function apuntarMiLlamada(aQuien) {
        const todas = read(K.misLlam, {});
        todas[aQuien] = misLlamadas(aQuien).concat(Date.now());
        write(K.misLlam, todas);
    }

    /**
     * La cocina o el asador llaman al mesero o al que sirve.
     *
     * NO SE ENCOLA. Todo lo demás en este sistema se guarda y se
     * reintenta hasta que sale, porque un pedido no se puede perder.
     * Un timbre es al revés: si llega cuando vuelve el internet, diez
     * minutos tarde, el mesero camina hasta la cocina y ya nadie se
     * acuerda de para qué lo llamaron. Si no sale ahora, no sale — y se
     * le dice al que llamó, para que grite como toda la vida.
     */
    async function llamar(aQuien) {
        // El freno manda: aquí, y no solo en el botón, porque al botón se
        // puede llegar por más de un camino.
        if (!puedeLlamar(aQuien).ok) return false;
        apuntarMiLlamada(aQuien);

        const dato = { cuando: Date.now(), de: rol() };
        const todas = getLlamadas();
        todas[aQuien] = dato;
        write(K.llamadas, todas);
        alCambiar();

        const salio = (Red.activo && Red.haySesion())
            ? await Red.guardar(`servicio/llamadas/${aQuien}`, dato)
            : false;

        /* Si no salió se borra también de aquí. Dejarla puesta encendería
           el botón igual, y el cocinero se quedaría esperando a alguien
           a quien nunca le llegó nada. */
        if (!salio) {
            const t = getLlamadas();
            delete t[aQuien];
            write(K.llamadas, t);

            /* Y no gasta cupo: una llamada que no salió no es una
               llamada. Cobrarle los 5 segundos de espera por algo que
               nadie oyó sería castigarlo por un fallo que no es suyo. */
            const mias = read(K.misLlam, {});
            mias[aQuien] = (mias[aQuien] || []).slice(0, -1);
            write(K.misLlam, mias);

            alCambiar();
        }
        return salio;
    }

    /** ¿Me están llamando a mí ahora mismo? Devuelve quién, o null. */
    function llamadaPara(quien) {
        const l = getLlamadas()[quien];
        if (!l || Date.now() - (l.cuando || 0) >= DURA_LLAMADA) return null;
        return l;
    }

    /** Lo mismo, para pintar el botón encendido en la estación que llamó. */
    const llamadaViva = quien => !!llamadaPara(quien);

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

    /**
     * ¿Se puede cambiar el tipo de servicio de esta cuenta?
     *
     * Cambiar de mesa a mesa se puede siempre: la comida es la misma y
     * solo cambia dónde se sienta. Cambiar el TIPO es otra cosa, porque
     * mueve el dinero — lo que se lleva va en tarrina y la tarrina se
     * cobra. Por eso aquí sí hay dos puertas cerradas.
     */
    function puedeCambiarServicio(ref) {
        const ses = sesionesDe(ref).filter(s => s.abierta);
        if (!ses.length) return { ok: false, motivo: 'Esta cuenta ya está cerrada.' };

        /* Con dinero ya cobrado no se toca: el total cambiaría después de
           que alguien pagó su parte, y lo que faltara habría que
           reclamárselo a los que quedan en la mesa. */
        if (cuentaDe(ref).cobrado > 0) {
            return { ok: false, motivo: 'Ya se cobró parte de esta cuenta. Cambiar el tipo movería el total.' };
        }

        /* Lo que ya salió de la cocina, salió. Si la mesa quiere llevarse
           lo que le queda, eso son platos sueltos y para eso ya está el
           marcarlos "para llevar" uno por uno. */
        const servida = tandasDe(ref).find(c => c.estado === 'entregado');
        if (servida) {
            return { ok: false, motivo: `${servida.codigo || codigoDe(servida)} ya se entregó. ` +
                                        `Para llevarse lo que falta, marca esos platos como "para llevar".` };
        }

        return { ok: true, motivo: '' };
    }

    /**
     * Mueve una cuenta entera —sus sesiones y todas sus tandas— a otro
     * sitio: otra mesa, o "para llevar" a nombre de alguien.
     *
     *     moverCuenta({ mesa: 5 },       { mesa: 2 })
     *     moverCuenta({ mesa: 5 },       { llevar: true, nombre: 'Carlos' })
     *     moverCuenta({ sesion: 'abc' }, { mesa: 7 })
     *
     * Es UNA función y no dos parecidas porque en los datos el tipo de
     * servicio no es un campo aparte: un pedido para llevar es una
     * cuenta con mesa 0 y un nombre. Cambiar de mesa y cambiar de tipo
     * son literalmente el mismo movimiento.
     */
    function moverCuenta(ref, destino) {
        const ses = sesionesDe(ref).filter(s => s.abierta);
        if (!ses.length) return { ok: false, motivo: 'Esta cuenta ya no está abierta.' };

        const aLlevar     = !!(destino && destino.llevar);
        const mesaNueva   = aLlevar ? 0 : Number((destino || {}).mesa) || 0;
        const nombreNuevo = aLlevar ? String((destino || {}).nombre || '').trim() : '';

        if (!aLlevar && !mesaNueva)  return { ok: false, motivo: 'Escoge una mesa.' };
        if (aLlevar && !nombreNuevo) return { ok: false, motivo: 'Escribe a nombre de quién va el pedido.' };

        const eraLlevar = esLlevar(ses[0]);

        if (!aLlevar && !eraLlevar && ses[0].mesa === mesaNueva) {
            return { ok: false, motivo: 'Escoge una mesa distinta.' };
        }
        if (aLlevar && eraLlevar && claveNombre(ses[0].nombre) === claveNombre(nombreNuevo)) {
            return { ok: false, motivo: 'Ese pedido ya va a ese nombre.' };
        }

        /* El sitio al que va tiene que estar libre, o se mezclarían dos
           cuentas distintas en una sola y se cobrarían juntas. */
        const mias = new Set(ses.map(s => s.id));

        if (!aLlevar && sesionesAbiertasDeMesa(mesaNueva).some(s => !mias.has(s.id))) {
            return { ok: false, motivo: `La mesa ${mesaNueva} está ocupada. Cóbrala primero o escoge otra.` };
        }

        const otro = aLlevar ? llevarPorNombre(nombreNuevo) : null;
        if (otro && !mias.has(otro.id)) {
            return { ok: false, motivo: `Ya hay un pedido abierto a nombre de ${otro.nombre}. Usa otro nombre.` };
        }

        const cambiaTipo = aLlevar !== eraLlevar;
        if (cambiaTipo) {
            const puede = puedeCambiarServicio(ref);
            if (!puede.ok) return puede;
        }

        const todas = getSesiones();
        ses.forEach(s => {
            todas[s.id].mesa   = mesaNueva;
            todas[s.id].nombre = nombreNuevo;
            todas[s.id].movida = Date.now();
        });
        write(K.sesiones, todas);
        ses.forEach(s => encolar(`servicio/sesiones/${s.id}`, todas[s.id]));

        /* Las tandas se buscan por su sesión y no por la mesa: la mesa
           acaba de cambiar y buscar por ella no encontraría ninguna.
           El código se rehace conservando la letra — M5b pasa a ser M2b,
           o LLb, y sigue siendo la segunda tanda. */
        ses.forEach(s => tandasDe({ sesion: s.id })
            .filter(c => c.estado !== 'anulado')
            .forEach(c => {
                const patch = { mesa: mesaNueva };

                if (cambiaTipo) {
                    /* Todo lo de la cuenta pasa al tipo nuevo, incluso lo
                       que ya iba marcado suelto: la cuenta entera se va,
                       no media. Y con eso se rehacen solas la tarrina y
                       los cubiertos, que es de donde sale el total. */
                    const items = (c.items || []).map(it => ({ ...it, llevar: aLlevar }));
                    ajustarTarrinas(items);
                    patch.items     = items;
                    patch.cubiertos = cubiertosDe(items);
                    patch.nombre    = nombreNuevo;
                }

                patch.codigo = codigoDe({ ...c, mesa: mesaNueva, items: patch.items || c.items });
                parchearComanda(c.id, patch);
            }));

        alCambiar();
        return { ok: true, motivo: '' };
    }

    /** Cambiar de mesa es un caso de lo anterior, no una función aparte. */
    const moverMesa = (origen, destino) => moverCuenta({ mesa: origen }, { mesa: destino });

    /**
     * Qué le pasaría al total si esta cuenta cambiara de tipo.
     *
     * Se calcula con la MISMA regla que luego lo aplica, así que no
     * puede prometer un número y cobrar otro. Sirve para enseñárselo al
     * mesero antes de confirmar: la cuenta sube o baja por las tarrinas
     * y eso no se puede descubrir después.
     */
    function efectoDeCambiarServicio(ref, aLlevar) {
        let antes = 0, despues = 0;

        tandasDe(ref).filter(c => c.estado !== 'anulado').forEach(c => {
            const items = (c.items || []).map(it => ({ ...it, llevar: !!aLlevar }));
            ajustarTarrinas(items);
            antes   += totalDe(c.items);
            despues += totalDe(items);
        });

        return { antes, despues, diferencia: despues - antes };
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
        if (!c || c.estado === 'anulado') return 'no';

        const s = getSesiones()[c.sesion];
        if (!s || !s.abierta) return 'no';          // ya se cobró y se cerró

        /* SERVIDA NO ES CERRADA.

           Pasó en el salón: cuatro pollos y dos jugos, la cocina marca
           entregado, y cuando el mesero va a llevar los jugos la mesa le
           cambia uno por una cola. No lo dejaba, porque la tanda estaba
           entregada — y la mesa se quedaba con la bebida que ya no
           quería o había que anotarla en un papel.

           La comida sí está cerrada: ya se cocinó y ya salió. Pero la
           bebida y las porciones se piden y se cambian hasta que se
           paga, que es como come la gente. Por eso pasa a 'agregados',
           que es el modo que ya bloquea lo que hay que cocinar y deja
           tocar solo lo marcado 'editableSiempre' en menu-data.js —
           bebidas, porciones y extras. Las porciones de proteína no lo
           están, así que siguen sin poder tocarse. */
        if (c.estado === 'entregado') return 'agregados';

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

    /**
     * UN VACÍO TAMBIÉN ES UNA NOTICIA.
     *
     * Antes esto empezaba con `if (!remotos) return;` — o sea, "si no
     * viene nada, no hagas nada". Suena prudente y estaba mal, porque
     * hay alguien que sí vacía la rama a propósito: el gerente, con el
     * botón "Vaciar el servicio".
     *
     * El panel borraba la nube, se limpiaba a sí mismo y decía
     * "Servicio vaciado". Pero las pantallas del salón recibían ese
     * vacío, lo tomaban por "no hay novedades" y se quedaban con las
     * mesas ocupadas para siempre. Desde el salón, el botón no borraba
     * nada.
     *
     * Ojo con la diferencia, que es la misma de siempre: `undefined` es
     * "no se pudo leer" y lo filtra quien llama; `null` es "esto está
     * vacío" y hay que obedecerlo.
     */
    function mezclar(clave, remotos) {
        if (remotos == null) { vaciarSegunNube(clave); return; }
        const propios = read(clave, {});
        // Lo que llega de la nube manda: es lo que ya vieron los demás
        write(clave, Object.assign({}, propios, remotos));
    }

    /**
     * La nube dice que esta rama quedó vacía.
     *
     * Se obedece, PERO no se tira lo que este celular todavía no ha
     * conseguido mandar. Si el mesero anotó una mesa sin señal y en ese
     * momento el gerente vacía el servicio, ese pedido no puede
     * desaparecer: nadie más lo ha visto todavía, así que no es algo
     * que el gerente estuviera borrando.
     */
    function vaciarSegunNube(clave) {
        const pendientes = new Set(
            read(K.cola, [])
                .map(t => String(t.rama || '').split('/')[2])
                .filter(Boolean));

        if (!pendientes.size) { write(clave, {}); return; }

        const propios = read(clave, {});
        const quedan = {};
        Object.keys(propios).forEach(id => { if (pendientes.has(id)) quedan[id] = propios[id]; });
        write(clave, quedan);
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

        /* Las llamadas van por su propio canal y no dentro de la comanda,
           porque el botón está en la cabecera y no en una tarjeta. Es la
           segunda conexión de esta pantalla y la última: el navegador
           permite unas seis por sitio y quedarse sin ninguna libre para
           enviar fue lo que obligaba a actualizar tres veces.

           Va en vivo y no en la ronda de cada seis segundos a propósito:
           un timbre que llega seis segundos tarde es un timbre que el de
           la cocina cree que no funcionó, y va a tocarlo otra vez. */
        Red.escuchar('servicio/llamadas', (datos, ruta, esRetoque) => {
            aplicarEnRuta(K.llamadas, ruta, datos, esRetoque);
            alCambiar();
        }, true);

        // La parrilla y la cocina no necesitan nada más que las comandas
        if (modo === 'estacion') return;

        // El que sirve necesita además las mesas, pero ni cobros ni bandeja
        const soloMesas = modo === 'servir';
        if (!soloMesas) Red.leer('servicio/extras', true).then(x => { if (x) write(K.extras, x); });

        refrescarResto(soloMesas);
        setInterval(() => refrescarResto(soloMesas), 6000);
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
                    cantidad: it.cantidad, llevar: it.llevar, sin: it.sin,
                    cambio: it.cambio, termino: it.termino
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
        write(K.llamadas, {});
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
                       'servicio/entrantes', 'servicio/tomados', 'servicio/llamadas'];
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
        cubiertosDeSesion, turnosDeSesion,
        estacionDe, guarnicionDe, arrozPendiente, categoriaDe, codigoDe, etiquetaDe,
        cambiosDe, guarnicionFinal, comoSeSirve,
        productoDe, nombreProducto, consumoDe, quedanDe, quedanDePlato,
        sePuedePedir, quedanTodos, revisarStock,
        cubiertosDe, nombreCorto, resumirItems, nombreInterno, nombreDeItem,
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
        // llamar al salón desde la cocina o la parrilla
        llamar, llamadaPara, llamadaViva, getLlamadas, puedeLlamar,
        abrirSesion, cerrarSesion, cerrarMesa, cerrarCuenta, registrarPago,
        // mover una cuenta: de mesa, o entre servirse y llevar
        moverMesa, moverCuenta, puedeCambiarServicio, efectoDeCambiarServicio,
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
