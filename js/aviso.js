/* ============================================================
   AVISO.JS  —  Que el celular avise aunque esté guardado

   El aviso sonoro de estacion.js solo suena con la pantalla encendida
   y la aplicación a la vista. No es un descuido: si Android congela la
   aplicación no queda nada corriendo que pueda sonar, y no hay manera
   de arreglarlo desde la página.

   Lo único que despierta un celular dormido es un aviso que llegue de
   fuera. Este archivo hace UNA cosa: que este aparato quede apuntado
   para recibirlos. Mandarlos es otro asunto y no está aquí.

   LO QUE SE GUARDA
   ----------------
   Al aceptar, el navegador entrega tres cosas:

     endpoint  la dirección de buzón que Google le dio a ESTE aparato
     p256dh    su clave pública
     auth      un secreto compartido

   Con las dos últimas se cifra cada aviso, así que ni Google puede
   leer lo que dice. Se guardan en la nube bajo el papel de quien
   entró — cocina, parrilla, mesero — que es lo que después permite
   avisar solo a quien le toca.
   ============================================================ */

const Aviso = (() => {

    const cfg = (typeof PUSH !== 'undefined') ? PUSH : {};

    /** ¿Este local tiene los avisos montados y este navegador sabe? */
    const posible = () => !!(cfg.clave)
        && typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && typeof Notification !== 'undefined';

    /**
     * En qué estado está esto, en una palabra. Lo pinta la pantalla.
     *
     *   no-se-puede   el local no los configuró, o el navegador no sabe
     *   apagado       nunca se han activado en este aparato
     *   bloqueado     se dijo que no. Desde la página ya no se puede
     *                 volver a preguntar: hay que ir a los ajustes.
     *   encendido     activado y apuntado
     */
    function estado() {
        if (!posible()) return 'no-se-puede';
        if (Notification.permission === 'denied')  return 'bloqueado';
        if (Notification.permission === 'granted') return apuntado ? 'encendido' : 'apagado';
        return 'apagado';
    }

    let apuntado = false;

    /* La clave viaja como texto y el navegador la quiere en bytes. */
    function aBytes(base64url) {
        const relleno = '='.repeat((4 - base64url.length % 4) % 4);
        const normal = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
        const crudo = atob(normal);
        return Uint8Array.from(crudo, c => c.charCodeAt(0));
    }

    const aTexto = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    /**
     * Un nombre corto y estable para este aparato.
     *
     * Sale de la propia dirección del buzón, así que el mismo celular
     * cae siempre en el mismo sitio: reactivar los avisos lo pisa en vez
     * de dejar dos apuntes del mismo aparato. Con dos, la cocina sonaría
     * dos veces por cada pedido.
     */
    async function nombreDe(endpoint) {
        const datos = new TextEncoder().encode(endpoint);
        const resumen = await crypto.subtle.digest('SHA-256', datos);
        return [...new Uint8Array(resumen)].slice(0, 12)
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /** Para saber después qué aparato es sin tener que adivinarlo. */
    function comoEsteAparato() {
        const ua = navigator.userAgent || '';
        const sistema = /Android/i.test(ua) ? 'Android'
                      : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone'
                      : /Windows/i.test(ua) ? 'Windows'
                      : /Mac/i.test(ua) ? 'Mac' : 'otro';
        const instalada = window.matchMedia
            && window.matchMedia('(display-mode: standalone)').matches;
        return sistema + (instalada ? ' (instalada)' : ' (navegador)');
    }

    /* ============================================================
       ACTIVARLOS
       ============================================================ */

    /**
     * Pide permiso y apunta este aparato.
     *
     * Hay que llamarlo DESDE UN TOQUE. El navegador no deja preguntar
     * por las buenas: una página que pregunta sola al abrirse recibe un
     * "no" automático en Chrome, y ese "no" ya no se puede deshacer sin
     * ir a los ajustes del sistema. Por eso solo se llama desde el botón.
     *
     * Devuelve { ok, motivo }.
     */
    async function activar(rol) {
        if (!posible()) {
            return { ok: false, motivo: 'Este local todavía no tiene los avisos montados.' };
        }

        if (Notification.permission === 'denied') {
            return { ok: false, motivo:
                'Este aparato tiene los avisos bloqueados. Hay que permitirlos ' +
                'en los ajustes del navegador — desde aquí ya no se puede preguntar.' };
        }

        if (Notification.permission !== 'granted') {
            const respuesta = await Notification.requestPermission();
            if (respuesta !== 'granted') {
                return { ok: false, motivo: 'Sin permiso no hay avisos. Se puede volver a intentar.' };
            }
        }

        let registro;
        try {
            registro = await navigator.serviceWorker.ready;
        } catch (e) {
            return { ok: false, motivo: 'La aplicación no terminó de instalarse. Recarga y vuelve a probar.' };
        }

        let suscripcion;
        try {
            /* `userVisibleOnly` es obligatorio y significa "cada aviso que
               reciba lo voy a enseñar". No es una formalidad: si el
               programa recibiera avisos sin mostrar nada, sería una forma
               de seguir a la gente por detrás, y por eso los navegadores
               no lo permiten. Aquí se cumple de verdad. */
            suscripcion = await registro.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: aBytes(cfg.clave)
            });
        } catch (e) {
            /* Casi siempre es que la clave del local cambió: la de antes
               sigue apuntada en este aparato y no coinciden. Se borra la
               vieja y se vuelve a pedir una con la nueva. */
            try {
                const previa = await registro.pushManager.getSubscription();
                if (previa) await previa.unsubscribe();
                suscripcion = await registro.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: aBytes(cfg.clave)
                });
            } catch (e2) {
                return { ok: false, motivo: 'El navegador no dejó apuntar este aparato: ' + e2.message };
            }
        }

        const guardado = await guardar(suscripcion, rol);
        if (!guardado.ok) return guardado;

        apuntado = true;
        return { ok: true, motivo: '' };
    }

    /** Lo apunta en la nube, bajo el papel de quien entró. */
    async function guardar(suscripcion, rol) {
        const cruda = suscripcion.toJSON();
        const nombre = await nombreDe(suscripcion.endpoint);

        const apunte = {
            endpoint: suscripcion.endpoint,
            p256dh: (cruda.keys || {}).p256dh || aTexto(suscripcion.getKey('p256dh')),
            auth:   (cruda.keys || {}).auth   || aTexto(suscripcion.getKey('auth')),
            rol: rol || 'otro',
            correo: (typeof Sync !== 'undefined' && Sync.correoSesion && Sync.correoSesion()) || '',
            aparato: comoEsteAparato(),
            creado: Date.now()
        };

        if (typeof Sync === 'undefined' || !Sync.activo) {
            return { ok: false, motivo: 'Este local no tiene la nube conectada.' };
        }

        const r = await Sync.enviar(`avisos/${apunte.rol}/${nombre}`, apunte, 'PUT');
        if (!r.ok) {
            return { ok: false, motivo:
                'No se pudo apuntar este aparato en la nube. ' + (Sync.fallo() || '') };
        }
        return { ok: true, motivo: '' };
    }

    /**
     * ¿Sigue apuntado este aparato?
     *
     * Se mira al abrir la pantalla, porque el navegador puede soltar la
     * suscripción por su cuenta —al limpiar datos, al actualizarse— sin
     * decirle nada a nadie. Si se soltó, se vuelve a apuntar sin
     * molestar: el permiso ya está dado y no hay que preguntar otra vez.
     */
    async function revisar(rol) {
        if (!posible() || Notification.permission !== 'granted') { apuntado = false; return false; }

        try {
            const registro = await navigator.serviceWorker.ready;
            const suscripcion = await registro.pushManager.getSubscription();
            if (!suscripcion) { apuntado = false; return false; }

            await guardar(suscripcion, rol);
            apuntado = true;
            return true;
        } catch (e) {
            apuntado = false;
            return false;
        }
    }

    /** Dejar de recibirlos en este aparato. */
    async function apagar() {
        try {
            const registro = await navigator.serviceWorker.ready;
            const suscripcion = await registro.pushManager.getSubscription();
            if (!suscripcion) { apuntado = false; return true; }

            const nombre = await nombreDe(suscripcion.endpoint);
            const rol = (typeof Sync !== 'undefined' && Sync.rolSesion && Sync.rolSesion()) || 'otro';

            await suscripcion.unsubscribe();
            if (typeof Sync !== 'undefined' && Sync.activo) {
                await Sync.enviar(`avisos/${rol}/${nombre}`, null, 'PUT');
            }
            apuntado = false;
            return true;
        } catch (e) {
            return false;
        }
    }

    return { posible, estado, activar, revisar, apagar, nombreDe };

})();


/* ============================================================
   EL BOTÓN, EN LAS TRES PANTALLAS

   Va aquí y no en estacion.js ni en comanda.js porque es exactamente
   el mismo en las tres. Se engancha solo: la pantalla no tiene que
   saber que esto existe.
   ============================================================ */

(() => {

    const boton = () => document.getElementById('btn-avisos');

    /** El papel de quien entró. Sin sesión no hay nada que ofrecer. */
    const papel = () =>
        (typeof Sync !== 'undefined' && Sync.rolSesion) ? Sync.rolSesion() : null;

    const TEXTOS = {
        apagado: {
            clase: 'ofrece',
            html: '<i class="fas fa-bell"></i> Avisarme aunque esté guardado' +
                  '<span>Suena aunque la pantalla esté apagada o el celular en el bolsillo</span>'
        },
        encendido: {
            clase: 'puesto',
            html: '<i class="fas fa-bell"></i> Este aparato ya recibe avisos' +
                  '<span>Toca si quieres dejar de recibirlos aquí</span>'
        },
        bloqueado: {
            clase: 'trabado',
            html: '<i class="fas fa-ban"></i> Los avisos están bloqueados en este aparato' +
                  '<span>Hay que permitirlos en los ajustes del navegador — desde aquí ya no se puede pedir</span>'
        }
    };

    let ocupado = false;

    function pintar() {
        const b = boton();
        if (!b) return;

        const cual = Aviso.estado();

        /* Sin sesión no se ofrece: preguntar antes de saber quién entró
           dejaría el aparato apuntado con el papel equivocado, y después
           sonaría la cocina por un pedido de parrilla. */
        if (cual === 'no-se-puede' || !papel()) { b.hidden = true; return; }

        const t = TEXTOS[cual] || TEXTOS.apagado;
        b.hidden = false;
        b.className = 'srv-avisos ' + t.clase;
        b.innerHTML = t.html;
        b.disabled = ocupado || cual === 'bloqueado';
    }

    async function tocar() {
        if (ocupado) return;
        const rol = papel();
        if (!rol) return;

        ocupado = true;
        pintar();

        try {
            if (Aviso.estado() === 'encendido') {
                if (confirm('¿Dejar de recibir avisos en este aparato?')) {
                    await Aviso.apagar();
                    if (typeof toast === 'function') toast('Este aparato ya no recibe avisos');
                }
            } else {
                const r = await Aviso.activar(rol);
                if (typeof toast === 'function') {
                    toast(r.ok ? 'Listo: este aparato ya recibe avisos' : r.motivo);
                } else if (!r.ok) {
                    alert(r.motivo);
                }
            }
        } finally {
            ocupado = false;
            pintar();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const b = boton();
        if (!b) return;
        b.addEventListener('click', tocar);

        /* Se revisa al abrir y al volver a la pantalla. El navegador
           puede soltar la suscripción por su cuenta —al limpiar datos, al
           actualizarse— sin decírselo a nadie; si se soltó, se vuelve a
           apuntar sin molestar, porque el permiso ya está dado. */
        const revisar = () => {
            const rol = papel();
            if (rol) Aviso.revisar(rol).then(pintar);
            else pintar();
        };

        revisar();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });

        /* Y de tanto en tanto, porque entrar con correo y clave no avisa
           a nadie: hasta que no hay sesión no se sabe qué papel tiene
           este aparato, y el botón no puede salir antes. */
        setInterval(pintar, 4000);
    });

})();
