/* ============================================================
   PWA.JS  —  Instalar la pantalla como aplicación

   Son tres líneas de trabajo y un botón. Lo que importa está en sw.js;
   aquí solo se le dice al navegador que existe.

   POR QUÉ INSTALARLA CAMBIA ALGO
   ------------------------------
   Una pestaña de Chrome se pierde entre las otras doce que tiene
   abiertas el celular, se cierra sin querer al limpiar, y en Android es
   de las primeras que el sistema mata cuando le falta memoria. Una
   aplicación instalada tiene su icono, se abre sola de un toque y el
   sistema la trata como lo que es: la herramienta con la que se
   trabaja, no una página que alguien miró.
   ============================================================ */

(() => {

    if ('serviceWorker' in navigator) {
        /* Al terminar de cargar y no antes: registrar el ayudante compite
           por la red con el css, las fuentes y —lo que de verdad importa—
           con abrir el canal de las comandas. */
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => {
                /* Se puede quedar sin instalar y no pasa nada: la pantalla
                   funciona igual. No se avisa de esto porque no hay nada
                   que quien la está usando pueda hacer al respecto. */
            });
        });
    }

    /* ------------------------------------------------------------
       EL BOTÓN DE INSTALAR

       Chrome decide cuándo ofrecer la instalación y a veces no la
       ofrece nunca — depende de cuánto se haya usado el sitio. Cuando
       avisa de que ya se puede, se guarda el aviso y se enciende un
       botón propio, porque el del navegador está escondido en un menú
       que nadie encuentra.
       ------------------------------------------------------------ */

    let aviso = null;
    const boton = () => document.getElementById('btn-instalar');

    const pintar = () => {
        const b = boton();
        if (b) b.hidden = !aviso;
    };

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();          // el de Chrome no, el nuestro
        aviso = e;
        pintar();
    });

    window.addEventListener('appinstalled', () => {
        aviso = null;
        pintar();
    });

    document.addEventListener('DOMContentLoaded', () => {
        pintar();
        const b = boton();
        if (!b) return;

        b.addEventListener('click', async () => {
            if (!aviso) return;
            aviso.prompt();
            await aviso.userChoice;
            /* El aviso sirve una sola vez. Si se dijo que no, Chrome
               manda otro más adelante por su cuenta. */
            aviso = null;
            pintar();
        });
    });

})();
