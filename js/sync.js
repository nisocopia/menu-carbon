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
            correo: datos.email
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
                correo: sesion.correo
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

    /* ---------------- LECTURA EN VIVO ---------------- */

    /**
     * Escucha una rama de la base y avisa cada vez que cambia.
     * Devuelve una función para dejar de escuchar.
     */
    function escuchar(rama, alCambiar, conSesion) {
        if (!activo) return () => {};

        let fuente = null;
        let cerrado = false;
        let reintento = 1000;

        async function conectar() {
            if (cerrado) return;

            let url = `${BD}/${rama}.json`;
            if (conSesion) {
                const t = await token();
                if (!t) return;                    // sin permiso: no se intenta
                url += `?auth=${encodeURIComponent(t)}`;
            }

            fuente = new EventSource(url);

            const aplicar = e => {
                try {
                    const m = JSON.parse(e.data);
                    // Firebase manda la ruta relativa y el dato nuevo
                    alCambiar(m.data, m.path);
                    reintento = 1000;
                } catch (err) { /* mensaje de control, se ignora */ }
            };

            fuente.addEventListener('put', aplicar);
            fuente.addEventListener('patch', aplicar);

            fuente.onerror = () => {
                fuente.close();
                if (cerrado) return;
                // Se reconecta solo, esperando cada vez un poco más
                setTimeout(conectar, reintento);
                reintento = Math.min(reintento * 2, 30000);
            };
        }

        conectar();
        return () => { cerrado = true; if (fuente) fuente.close(); };
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
        entrar, salir, haySesion, correoSesion, token,
        escuchar, leer, guardar, agregar
    };
})();
