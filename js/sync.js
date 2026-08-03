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

        const r = await fetch(`${LOGIN}?key=${cfg.apiKey}`, {
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

    /** Devuelve un token válido, renovándolo si ya venció. */
    async function token() {
        if (!sesion) cargarSesion();
        if (!sesion) return null;
        if (Date.now() < sesion.expira) return sesion.idToken;

        try {
            const r = await fetch(`${RENUEVA}?key=${cfg.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(sesion.refreshToken)}`
            });
            const d = await r.json();
            if (!r.ok) { salir(); return null; }

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

    function correoSesion() {
        return sesion ? sesion.correo : null;
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

    /* ---------------- LECTURA EN VIVO ---------------- */

    /**
     * En qué anda cada rama que se está escuchando. Sin esto, una
     * pantalla de cocina cuyo canal se murió se queda mostrando
     * "Todo al día" y el cocinero le cree.
     */
    const estados = {};

    /** ¿La rama está recibiendo en este momento? */
    const ramaViva = rama => !!(estados[rama] && estados[rama].abierta);

    /** Hace cuánto que no se sabe nada de esa rama, en milisegundos. */
    const desdeUltimoContacto = rama =>
        estados[rama] && estados[rama].ultimo ? Date.now() - estados[rama].ultimo : Infinity;

    /**
     * Escucha una rama de la base y avisa cada vez que cambia.
     * Devuelve una función para dejar de escuchar.
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

            const aplicar = e => {
                latir();
                try {
                    const m = JSON.parse(e.data);
                    // Firebase manda la ruta relativa y el dato nuevo
                    alCambiar(m.data, m.path);
                } catch (err) { /* mensaje de control, se ignora */ }
            };

            fuente.addEventListener('put', aplicar);
            fuente.addEventListener('patch', aplicar);
            // Firebase manda esto cada tanto solo para decir "sigo aquí"
            fuente.addEventListener('keep-alive', latir);

            fuente.onerror = () => {
                estados[rama].abierta = false;
                fuente.close();
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
    async function leer(rama, conSesion) {
        if (!activo) return null;
        let url = `${BD}/${rama}.json`;
        if (conSesion) {
            const t = await token();
            if (!t) return null;
            url += `?auth=${encodeURIComponent(t)}`;
        }
        try {
            const r = await fetch(url);
            return r.ok ? await r.json() : null;
        } catch (e) { return null; }
    }

    /* ---------------- ESCRITURA ---------------- */

    async function escribir(rama, valor, metodo, conSesion) {
        if (!activo) return false;

        let url = `${BD}/${rama}.json`;
        if (conSesion !== false) {
            const t = await token();
            if (!t) return false;
            url += `?auth=${encodeURIComponent(t)}`;
        }

        try {
            const r = await fetch(url, {
                method: metodo,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(valor)
            });
            return r.ok;
        } catch (e) { return false; }
    }

    /** Reemplaza el contenido de una rama (requiere ser el gerente). */
    const guardar = (rama, valor) => escribir(rama, valor, 'PUT', true);

    /** Agrega un elemento nuevo sin pisar los demás (lo usa el comensal). */
    const agregar = (rama, valor) => escribir(rama, valor, 'POST', false);

    return {
        activo,
        entrar, salir, haySesion, correoSesion, uidSesion, token,
        escuchar, leer, guardar, agregar,
        ramaViva, desdeUltimoContacto
    };
})();
