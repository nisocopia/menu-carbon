/* ============================================================
   LLAMADA.JS  —  Cuando la cocina o el asador te llaman

   Va en las dos pantallas que ANDAN: la del mesero y la del que sirve.
   Las de la cocina y la parrilla no lo cargan — ellas llaman, no las
   llaman a ellas.

   POR QUÉ TIENE SU PROPIO MOTOR DE SONIDO Y NO USA EL DE LA COCINA:
   el de estacion.js está entrelazado con su alarma de pedidos —los
   reintentos, lo que quedó sin sonar, el cartel de "toca para
   activar"— y esa parte costó varias noches de servicio dejarla fina.
   Sacarla de ahí para compartirla es tocar lo que funciona. Aquí hace
   falta mucho menos: un tono y ya.

   NADIE APAGA LA LLAMADA. Se guarda cuándo se llamó y se da por viva
   mientras sea reciente. Un aviso que hay que apagar es un aviso que
   alguien se olvida de apagar.
   ============================================================ */

const Llamada = (() => {

    /* El tono. TIENE que sonar distinto al de un pedido nuevo, o el
       mesero mira la pantalla creyendo que entró un pedido y pierde el
       viaje. El de la cocina es agudo y cae (2600 → 1950); este es más
       grave y SUBE, en pares lentos. Se reconoce sin pensarlo.

       Sigue siendo onda cuadrada: son los armónicos los que atraviesan
       el ruido del local, y un pitido suave aquí no se oiría. */
    const PATRON = [];
    for (let i = 0; i < 5; i++) {
        PATRON.push({ f: 1150, t: i, d: 0.16 });
        PATRON.push({ f: 1720, t: i + 0.2, d: 0.30 });
    }
    const DURA = 5;                 // segundos, como los pidió el dueño
    const VOLUMEN = 0.85;

    let audio = null, salida = null, yaSono = false;

    const listo = () => !!audio && audio.state === 'running';

    function armarSalida() {
        if (salida || !audio) return;
        const filtro = audio.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 6500;

        // Sin esto, cinco segundos de onda cuadrada a todo volumen
        // recortan en el altavoz de un celular y suenan a rasgado.
        const limite = audio.createDynamicsCompressor();
        limite.threshold.value = -6;
        limite.knee.value = 0;
        limite.ratio.value = 20;
        limite.attack.value = 0.002;
        limite.release.value = 0.1;

        filtro.connect(limite).connect(audio.destination);
        salida = filtro;
    }

    async function preparar() {
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') await audio.resume();
            armarSalida();
        } catch (e) { /* el navegador todavía no deja */ }
        return listo();
    }

    async function sonar() {
        if (!listo()) await preparar();
        if (!listo()) return false;

        try {
            const ahora = audio.currentTime + 0.05;
            PATRON.forEach(nota => {
                const osc = audio.createOscillator();
                const vol = audio.createGain();
                osc.type = 'square';
                osc.frequency.value = nota.f;

                const desde = ahora + nota.t;
                vol.gain.setValueAtTime(0.0001, desde);
                vol.gain.exponentialRampToValueAtTime(VOLUMEN, desde + 0.008);
                vol.gain.setValueAtTime(VOLUMEN, desde + nota.d - 0.02);
                vol.gain.exponentialRampToValueAtTime(0.0001, desde + nota.d);

                osc.connect(vol).connect(salida || audio.destination);
                osc.start(desde);
                osc.stop(desde + nota.d + 0.02);
            });
            yaSono = true;
            return true;
        } catch (e) { return false; }
    }

    function vibrar() {
        try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]); } catch (e) {}
    }

    /* ------------------------------------------------------------
       LO QUE SE VE

       El sonido dura cinco segundos; el cartel se queda mientras la
       llamada esté viva. Si solo sonara, el mesero oye el pitido con
       las manos ocupadas, no llega a mirar, y ya no sabe qué mesa era.
       ------------------------------------------------------------ */

    let caja = null;
    const yaSonadas = new Set();

    function cajaHtml() {
        if (caja) return caja;
        caja = document.createElement('div');
        caja.className = 'llamada-caja';
        caja.hidden = true;
        /* Tocarlo la quita de la vista. No apaga nada en la cocina —no
           hay nada que apagar— pero deja al mesero limpiar la pantalla
           cuando ya va para allá. */
        caja.addEventListener('click', () => { caja.hidden = true; });
        document.body.appendChild(caja);
        return caja;
    }

    /**
     * Se llama en cada repintado de la pantalla. Mira si me están
     * llamando, lo enseña, y suena UNA vez por llamada.
     */
    function revisar(quienSoy) {
        const l = Servicio.llamadaPara(quienSoy);
        const cont = cajaHtml();

        if (!l) { cont.hidden = true; return; }

        const quien = l.de === 'parrilla' ? 'La parrilla' : 'La cocina';
        cont.hidden = false;
        cont.innerHTML = `
            <i class="fas fa-bell fa-shake"></i>
            <span class="llamada-quien">${quien} te llama</span>
            <span class="llamada-toca">toca para quitarlo</span>`;

        /* Suena una sola vez por llamada. Se reconoce por su hora, así
           que volver a llamar vuelve a sonar. */
        const marca = quienSoy + ':' + l.cuando;
        if (yaSonadas.has(marca)) return;
        yaSonadas.add(marca);
        sonar();
        vibrar();
    }

    /* El navegador no deja sonar hasta que alguien toca la pantalla. Se
       intenta en cada toque, que es gratis y no se nota. */
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
        window.addEventListener(ev, preparar, { passive: true }));

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) preparar();
    });

    return { revisar, preparar, sonar, DURA };
})();
