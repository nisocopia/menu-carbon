/* ============================================================
   SYNC.JS  —  Sincronización en tiempo real (opcional)

   Conecta el menú y el panel a una base de datos compartida para que
   un agotado que marca el gerente lo vean todos los celulares al
   instante, y los pedidos lleguen al panel en vivo.

   SI NO ESTÁ CONFIGURADO, NO PASA NADA: el sitio sigue funcionando
   exactamente igual que antes, guardando todo en cada dispositivo.

   No usa la librería de Firebase: habla directo con su API. Así el
   menú no vuelve a depender de que cargue un servidor externo.
   ============================================================ */

const Sync = (() => {

    const cfg = (typeof FIREBASE !== 'undefined') ? FIREBASE : {};
    const activo = !!(cfg.databaseURL && cfg.apiKey);

    const BD    = (cfg.databaseURL || '').replace(/\/$/, '');
    const LOGIN = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
    const RENUEVA = 'https://securetoken.googleapis.com/v1/token';
    const CLAVE_SESION = 'menu_sync_sesion';

    let sesion = null;   // { idToken, refreshToken, expira, email }

    /**
     * Una petición que no responde nunca es peor que una que falla: la
     * que falla se reintenta, la que se cuelga deja la cola trabada para
     * siempre y sin un solo mensaje de error. En un celular con wifi
     * flojo pasa, y el sistema se queda mudo con los pedidos dentro.
     *
     * Por eso todo lo que sale de aquí tiene plazo.
     */
    const PLAZO = 12000;

    async function pedir(url, opciones) {
        const corte = new AbortController();
        const reloj = setTimeout(() => corte.abort(), PLAZO);
        try {
            return await fetch(url, Object.assign({ signal: corte.signal }, opciones || {}));
        } finally {
            clearTimeout(reloj);
        }
    }

    /* ---------------- SESIÓN DEL GERENTE ---------------- */

    function cargarSesion() {
        try { sesion = JSON.parse(localStorage.getItem(CLAVE_SESION)); }
        catch (e) { sesion = null; }
        return sesion;
    }

    function guardarSesion(s) {
        sesion = s;
        if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
        else   localStorage.removeItem(CLAVE_SESION);
    }

    /** Entra con el correo y la clave del gerente. */
    async function entrar(correo, clave) {
        if (!activo) throw new Error('sin-configurar');

        const r = await pedir(`${LOGIN}?key=${cfg.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: correo, password: clave, returnSecureToken: true })
        });
        const datos = await r.json();

        if (!r.ok) {
            const motivo = (datos.error && datos.error.message) || 'ERROR';
            throw new Error(motivo);
        }

        guardarSesion({
            idToken: datos.idToken,
            refreshToken: datos.refreshToken,
            expira: Date.now() + (Number(datos.expiresIn) - 60) * 1000,
            correo: datos.email,
            // Quién entró. Sin esto no hay forma de distinguir al gerente
            // del asador, y las dos cuentas son del mismo local.
            uid: datos.localId
        });
        return sesion;
    }

    function salir() { guardarSesion(null); }

    /* ---------------- POR QUE NO ENTRO ---------------- */

    /* Firebase contesta con codigos. Decirle a todo "correo o clave
       incorrectos" es mentir la mitad de las veces: si el correo no
       existe, si la cuenta esta desactivada o si hay demasiados
       intentos, uno se queda probando la clave contra una pared. */
    const MOTIVOS = {
        EMAIL_NOT_FOUND:             'Ese correo no esta registrado en el local',
        INVALID_PASSWORD:            'Clave incorrecta',
        INVALID_LOGIN_CREDENTIALS:   'Correo o clave incorrectos',
        USER_DISABLED:               'Esa cuenta esta desactivada',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Espera unos minutos.',
        MISSING_PASSWORD:            'Falta la clave',
        MISSING_EMAIL:               'Falta el correo',
        INVALID_EMAIL:               'Ese correo esta mal escrito',
        OPERATION_NOT_ALLOWED:       'Falta activar correo y clave en Firebase',
        'sin-configurar':            'Este local todavia no tiene la nube conectada'
    };

    /**
     * Por que no dejo entrar, dicho en cristiano.
     *
     * Si el codigo no esta en la lista se muestra tal cual: un mensaje
     * raro pero exacto sirve mas que uno bonito y falso.
     */
    function porQueNoEntro(e) {
        const codigo = String((e && e.message) || '').split(/[ :]/)[0];
        return MOTIVOS[codigo] || ('No se pudo entrar — ' + (codigo || 'sin detalle'));
    }

    /** Devuelve un token válido, renovándolo si ya venció. */
    async function token() {
        if (!sesion) cargarSesion();
        if (!sesion) return null;
        if (Date.now() < sesion.expira) return sesion.idToken;

        try {
            const r = await pedir(`${RENUEVA}?key=${cfg.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(sesion.refreshToken)}`
            });
            const d = await r.json();
            if (!r.ok) {
                /* Solo se cierra la sesión si Firebase dice que el permiso
                   ya no vale. Antes se cerraba ante cualquier fallo — un
                   parpadeo de red bastaba para dejar el celular sin sesión
                   y con todos los pedidos atorados, sin avisar de nada. */
                const motivo = (d.error && (d.error.message || d.error)) || '';
                if (String(motivo).match(/TOKEN|USER_(NOT_FOUND|DISABLED)|INVALID/i)) salir();
                return null;
            }

            guardarSesion({
                idToken: d.id_token,
                refreshToken: d.refresh_token,
                expira: Date.now() + (Number(d.expires_in) - 60) * 1000,
                correo: sesion.correo,
                uid: d.user_id || sesion.uid
            });
            return sesion.idToken;
        } catch (e) {
            return null;
        }
    }

    function haySesion() {
        if (!sesion) cargarSesion();
        return !!sesion;
    }

    /**
     * El correo con el que se entró.
     *
     * Carga la sesión si todavía no está en memoria, igual que hace
     * uidSesion(). Sin eso, quien preguntara antes de que algo llamara
     * a haySesion() recibía null teniendo sesión abierta — y hay cosas
     * que se FIRMAN con este correo (quién autorizó un fiado, quién
     * anotó un gasto), así que un null aquí no es un hueco en la
     * pantalla: es un dato que sale mal escrito y que la nube rechaza.
     */
    function correoSesion() {
        if (!sesion) cargarSesion();
        return (sesion && sesion.correo) || null;
    }

    /**
     * El identificador de quien entro. Las sesiones guardadas antes de
     * que esto existiera no lo tienen: en ese caso devuelve null y quien
     * lo consulte debe pedir que entre de nuevo, no dar por bueno.
     */
    function uidSesion() {
        if (!sesion) cargarSesion();
        return (sesion && sesion.uid) || null;
    }

    /**
     * Qué papel tiene la cuenta que entró: 'gerente', 'mesero', 'cocina'
     * o 'parrilla'. Sale de la lista EQUIPO de menu-data.js.
     *
     * Si el local no llenó esa lista, devuelve 'gerente' para todos: es
     * como funcionaba antes y así nadie se queda afuera por no haberla
     * configurado todavía. En cambio, si la lista existe y la cuenta no
     * está en ella, devuelve null — y quien pregunte debe negarle el
     * paso, no dejarlo entrar por si acaso.
     *
     * Esto ordena las pantallas; NO es la seguridad. La seguridad son
     * las reglas de Firebase, que revisan lo mismo del lado del servidor.
     */
    function rolSesion() {
        const equipo = (typeof EQUIPO !== 'undefined' && EQUIPO) ? EQUIPO : {};
        if (!Object.keys(equipo).length) return haySesion() ? 'gerente' : null;
        const uid = uidSesion();
        return (uid && equipo[uid]) || null;
    }

    /* ---------------- LECTURA EN VIVO ---------------- */

    /**
     * En qué anda cada rama que se está escuchando. Sin esto, una
     * pantalla de cocina cuyo canal se murió se queda mostrando
     * "Todo al día" y el cocinero le cree.
     */
    const estados = {};

    /* Por qué falló lo último. Sin esto la pantalla solo puede decir "no
       salió", y a las 8 de la noche eso no alcanza para saber si es la
       red, el permiso o el dato. */
    let ultimoFallo = '';
    const fallo = () => ultimoFallo;

    /** ¿La rama está recibiendo en este momento? */
    const ramaViva = rama => !!(estados[rama] && estados[rama].abierta);

    /**
     * Cuando se cae el canal de lectura, EventSource no dice por qué:
     * solo avisa "error". Así que se pregunta lo mismo por la vía normal,
     * que sí devuelve el motivo, y se guarda para poder mostrarlo.
     *
     * Se hace de tanto en tanto, no en cada reintento, para no llenar la
     * red de preguntas mientras el wifi está caído.
     */
    let ultimaAveriguacion = 0;

    async function averiguarPorQue(rama, conSesion) {
        if (Date.now() - ultimaAveriguacion < 10000) return;
        ultimaAveriguacion = Date.now();

        try {
            let url = `${BD}/${rama}.json?shallow=true`;
            if (conSesion) {
                const t = await token();
                if (!t) {
                    ultimoFallo = 'No hay sesión válida. Toca Salir y vuelve a entrar.';
                    return;
                }
                url += `&auth=${encodeURIComponent(t)}`;
            }
            const r = await pedir(url);
            if (r.ok) { ultimoFallo = ''; return; }

            const detalle = await r.text().catch(() => '');
            ultimoFallo = r.status === 401
                ? `Permiso denegado al leer "${rama}". Revisa las reglas de Firebase.`
                : `Error ${r.status} al leer "${rama}". ${String(detalle).slice(0, 120)}`;
        } catch (e) {
            ultimoFallo = 'Sin conexión con la nube';
        }
    }

    /** Hace cuánto que no se sabe nada de esa rama, en milisegundos. */
    const desdeUltimoContacto = rama =>
        estados[rama] && estados[rama].ultimo ? Date.now() - estados[rama].ultimo : Infinity;

    /**
     * Escucha una rama de la base y avisa cada vez que cambia.
     * Devuelve una función para dejar de escuchar.
     *
     * Se llama `alCambiar(dato, ruta, esRetoque)`. Firebase avisa de dos
     * maneras y confundirlas cuesta caro:
     *
     *   put    el dato es TODO lo que hay en esa ruta; lo de antes se tira
     *   patch  el dato son SOLO los campos que cambiaron; el resto sigue ahí
     *
     * Tratar un patch como un put borra lo que no venía en el aviso.
     */
    function escuchar(rama, alCambiar, conSesion) {
        if (!activo) return () => {};

        let fuente = null;
        let cerrado = false;
        let reintento = 1000;

        /* Se arranca el reloj desde ya, no desde el primer dato: conectar
           tarda un momento y sin esto la pantalla gritaría "sin recibir"
           durante los primeros segundos de cada carga. Un aviso que sale
           cuando todo está bien deja de creerse. */
        estados[rama] = { abierta: false, ultimo: Date.now() };

        function reintentar() {
            if (cerrado) return;
            setTimeout(conectar, reintento);
            reintento = Math.min(reintento * 2, 30000);
        }

        async function conectar() {
            if (cerrado) return;

            let url = `${BD}/${rama}.json`;
            if (conSesion) {
                const t = await token();
                if (!t) {
                    /* No se pudo renovar el token: casi siempre es la red,
                       no que le hayan quitado el permiso. Antes se dejaba
                       de escuchar para siempre y la pantalla se quedaba
                       muda hasta que alguien la recargara — justo lo que
                       no puede pasar en plena cocina. */
                    estados[rama].abierta = false;
                    reintentar();
                    return;
                }
                url += `?auth=${encodeURIComponent(t)}`;
            }

            fuente = new EventSource(url);

            const latir = () => {
                estados[rama].abierta = true;
                estados[rama].ultimo  = Date.now();
                reintento = 1000;
            };

            fuente.onopen = latir;

            const aplicar = esRetoque => e => {
                latir();
                try {
                    const m = JSON.parse(e.data);
                    // Firebase manda la ruta relativa y el dato nuevo
                    alCambiar(m.data, m.path, esRetoque);
                } catch (err) { /* mensaje de control, se ignora */ }
            };

            fuente.addEventListener('put',   aplicar(false));
            fuente.addEventListener('patch', aplicar(true));
            // Firebase manda esto cada tanto solo para decir "sigo aquí"
            fuente.addEventListener('keep-alive', latir);

            fuente.onerror = () => {
                estados[rama].abierta = false;
                fuente.close();
                averiguarPorQue(rama, conSesion);
                reintentar();          // se reconecta solo, esperando cada vez un poco más
            };
        }

        conectar();
        return () => {
            cerrado = true;
            delete estados[rama];
            if (fuente) fuente.close();
        };
    }

    /** Lectura puntual, sin quedarse escuchando. */
    /**
     * Lectura puntual.
     *
     * Devuelve `undefined` si no se pudo leer y `null` si se leyó y estaba
     * vacío. La diferencia importa: si no se distinguen, un fallo de red
     * se confunde con "no hay nada" y la pantalla borra lo que sí había.
     */
    async function leer(rama, conSesion) {
        if (!activo) return undefined;
        let url = `${BD}/${rama}.json`;
        if (conSesion) {
            const t = await token();
            if (!t) { ultimoFallo = 'No hay sesión válida. Toca Salir y vuelve a entrar.'; return undefined; }
            url += `?auth=${encodeURIComponent(t)}`;
        }
        try {
            const r = await pedir(url);
            if (r.ok) { ultimoFallo = ''; return await r.json(); }

            ultimoFallo = r.status === 401
                ? `Permiso denegado al leer "${rama}". Revisa las reglas de Firebase.`
                : `Error ${r.status} al leer "${rama}".`;
            return undefined;
        } catch (e) {
            ultimoFallo = (e && e.name === 'AbortError')
                ? 'La nube no respondió a tiempo. Se reintenta solo.'
                : 'Sin conexión con la nube';
            return undefined;
        }
    }

    /* ---------------- ESCRITURA ---------------- */

    /**
     * Devuelve `{ ok, status }`, no solo un sí o un no.
     *
     * El motivo importa: "no salió porque no hay wifi" se reintenta, y
     * "no salió porque el permiso lo prohíbe" nunca va a salir por más
     * que se reintente. Sin el número de estado no se pueden distinguir,
     * y el que decide qué celular se queda con un pedido necesita saber
     * exactamente esa diferencia. `status: 0` es que ni siquiera hubo
     * respuesta.
     */
    async function escribir(rama, valor, metodo, conSesion) {
        if (!activo) { ultimoFallo = 'Este local no tiene nube configurada'; return { ok: false, status: 0 }; }

        let url = `${BD}/${rama}.json`;
        if (conSesion !== false) {
            const t = await token();
            if (!t) {
                ultimoFallo = 'No hay sesión válida. Vuelve a entrar con tu correo y clave.';
                return { ok: false, status: 0 };
            }
            url += `?auth=${encodeURIComponent(t)}`;
        }

        try {
            const r = await pedir(url, {
                method: metodo,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(valor)
            });

            if (r.ok) { ultimoFallo = ''; return { ok: true, status: r.status }; }

            const detalle = await r.text().catch(() => '');
            ultimoFallo = (r.status === 401 || r.status === 403)
                ? `Permiso denegado en "${rama}". Revisa las reglas de Firebase.`
                : `Error ${r.status} en "${rama}". ${String(detalle).slice(0, 120)}`;
            return { ok: false, status: r.status };
        } catch (e) {
            ultimoFallo = (e && e.name === 'AbortError')
                ? 'La nube no respondió a tiempo. Se reintenta solo.'
                : 'Sin conexión con la nube';
            return { ok: false, status: 0 };
        }
    }

    /** Reemplaza el contenido de una rama. */
    const guardar = async (rama, valor) => (await escribir(rama, valor, 'PUT', true)).ok;

    /**
     * Cambia solo los campos que se le pasan y deja el resto quieto.
     *
     * Hace falta para que cada pantalla pueda tener permiso sobre lo
     * suyo y nada más: si el asador mandara la comanda entera cada vez
     * que toca "Ya lo saqué", necesitaría permiso para escribir todos
     * los campos, y entonces el permiso no separaría nada.
     */
    const parchear = async (rama, valor) => (await escribir(rama, valor, 'PATCH', true)).ok;

    /** Agrega un elemento nuevo sin pisar los demás (lo usa el comensal). */
    const agregar = async (rama, valor) => (await escribir(rama, valor, 'POST', false)).ok;

    /**
     * VARIAS RAMAS DE UNA SOLA VEZ, Y O ENTRAN TODAS O NO ENTRA NINGUNA.
     *
     * Firebase revisa cada ruta por separado, pero aplica el conjunto
     * entero o nada. Eso es justo lo que hace falta para el pedido del
     * comensal, que son dos cosas que no pueden separarse: el pedido en
     * la bandeja y el cerrojo de su mesa.
     *
     * Si se mandaran sueltas habría dos formas de quedar mal, y las dos
     * malas: el pedido sin cerrojo deja pedir otra vez y llena la
     * bandeja; el cerrojo sin pedido deja la mesa sin poder pedir por
     * algo que nunca llegó.
     *
     * Va SIN CUENTA, como el resto de lo del comensal: su celular no
     * tiene login. Y devuelve el estado, no un sí o un no, porque la
     * diferencia importa — un 401 aquí no es un fallo de red, es la
     * nube diciendo "esta mesa ya tiene un pedido esperando".
     */
    const todoONada = async rutas => escribir('', rutas, 'PATCH', false);

    /**
     * Escribe con el detalle del fallo a la vista. Se usa para reclamar
     * algo que solo puede ser de uno: las reglas dejan crear el nodo
     * únicamente si todavía no existe, así que el primer celular que
     * llega recibe ok y el segundo recibe 401. Ese 401 es la respuesta,
     * no un error.
     */
    const reclamar = (rama, valor) => escribir(rama, valor, 'PUT', true);

    /**
     * Igual que guardar o parchear, pero diciendo POR QUÉ no salió.
     *
     * Lo usa la cola. Sin el motivo, "no salió por el wifi" y "no salió
     * porque el permiso lo prohíbe" se tratan igual, y el segundo se
     * reintenta para siempre — tapando todo lo que viene detrás.
     */
    const enviar = (rama, valor, metodo) => escribir(rama, valor, metodo || 'PUT', true);

    return {
        activo,
        entrar, salir, porQueNoEntro, haySesion, correoSesion, uidSesion, rolSesion, token,
        escuchar, leer, guardar, parchear, agregar, todoONada, reclamar, enviar,
        ramaViva, desdeUltimoContacto, fallo
    };
})();
