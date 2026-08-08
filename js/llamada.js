/* ============================================================
   LLAMADA.JS  —  Cuando la cocina o el asador te llaman

   Va en las dos pantallas que ANDAN: la del mesero y la del que sirve.
   Las de la cocina y la parrilla no lo cargan — ellas llaman, no las
   llaman a ellas.

   TIENE QUE SONAR CON EL CELULAR EN EL BOLSILLO. La primera versión de
   este archivo solo tenía AudioContext, y eso no alcanza: en Android el
   contexto se duerme al cambiar de aplicación. Al pedido de la cocina sí
   le sonaba porque estacion.js lleva DOS vías, y esa segunda —un
   elemento <audio> con un WAV fabricado aquí mismo— sigue sonando
   cuando la primera ya está dormida.

   Aquí va la misma máquina, con el tono de la llamada. Se repite en vez
   de compartirse con estacion.js a propósito: esa alarma costó varias
   noches de servicio dejarla fina y no se toca. Sesenta líneas repetidas
   valen menos que una noche sin oír los pedidos.

   NADIE APAGA LA LLAMADA. Se guarda cuándo se llamó y se da por viva
   mientras sea reciente.
   ============================================================ */

const Llamada = (() => {

    /* El tono. TIENE que sonar distinto al de un pedido nuevo, o el
       mesero mira la pantalla creyendo que entró un pedido y pierde el
       viaje. El de la cocina es agudo y CAE (2600 → 1950); este es más
       grave y SUBE, en pares lentos. Se reconoce sin pensarlo.

       Onda cuadrada: son los armónicos los que atraviesan el ruido del
       local, y un pitido suave aquí no se oiría. */
    const PATRON = [];
    for (let i = 0; i < 5; i++) {
        PATRON.push({ f: 1150, t: i, d: 0.16 });
        PATRON.push({ f: 1720, t: i + 0.2, d: 0.30 });
    }
    const DURA = 5;                 // segundos, como los pidió el dueño
    const VOLUMEN = 0.85;

    /* ------------------------------------------------------------
       PRIMERA VÍA: el AudioContext. Es la que mejor suena.
       ------------------------------------------------------------ */

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
        prepararRespaldo();
        return listo();
    }

    /* ------------------------------------------------------------
       SEGUNDA VÍA: un <audio> con el tono ya fabricado.

       Es la que salva la situación que importa. El AudioContext se
       duerme cuando el celular se bloquea o se cambia de aplicación; el
       elemento <audio>, una vez soltado, sigue sonando. El archivo se
       fabrica aquí mismo, byte a byte, porque la pantalla tiene que
       sonar aunque no haya red para descargar nada.
       ------------------------------------------------------------ */

    let respaldo = null;

    function fabricarWav() {
        const HZ = 44100;
        const n = Math.floor(HZ * (DURA + 0.1));
        const buf = new ArrayBuffer(44 + n * 2);
        const v = new DataView(buf);
        const texto = (pos, s) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); };

        texto(0, 'RIFF');      v.setUint32(4, 36 + n * 2, true);
        texto(8, 'WAVEfmt ');  v.setUint32(16, 16, true);
        v.setUint16(20, 1, true);         // PCM sin comprimir
        v.setUint16(22, 1, true);         // mono
        v.setUint32(24, HZ, true);
        v.setUint32(28, HZ * 2, true);
        v.setUint16(32, 2, true);
        v.setUint16(34, 16, true);
        texto(36, 'data');     v.setUint32(40, n * 2, true);

        for (let i = 0; i < n; i++) {
            const t = i / HZ;
            const nota = PATRON.find(p => t >= p.t && t < p.t + p.d);
            let m = 0;
            if (nota) {
                /* Los bordes se suben y se bajan en unos milisegundos.
                   Cortar una onda cuadrada en seco mete un chasquido que
                   se oye más que la propia nota. */
                const dentro = t - nota.t;
                const sobre = Math.min(1, dentro / 0.006, (nota.d - dentro) / 0.006);
                m = (Math.sin(2 * Math.PI * nota.f * t) >= 0 ? 1 : -1) * VOLUMEN * sobre;
            }
            v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, m)) * 32767, true);
        }
        return new Blob([buf], { type: 'audio/wav' });
    }

    function prepararRespaldo() {
        if (respaldo) return;
        try {
            respaldo = new Audio(URL.createObjectURL(fabricarWav()));
            respaldo.preload = 'auto';
        } catch (e) { respaldo = null; }
    }

    function sonarRespaldo() {
        if (!respaldo) return Promise.resolve(false);
        try {
            respaldo.currentTime = 0;
            const p = respaldo.play();
            return (p && p.then) ? p.then(() => true, () => false) : Promise.resolve(true);
        } catch (e) { return Promise.resolve(false); }
    }

    /**
     * Suelta el tono por donde se pueda. Devuelve si de verdad SONÓ — no
     * si se intentó. Esa diferencia es la que decide si la llamada se da
     * por avisada o sigue esperando.
     */
    async function sonar() {
        if (!listo()) await preparar();

        if (listo()) {
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
            } catch (e) { /* se prueba por la otra vía */ }
        }

        const sono = await sonarRespaldo();
        if (sono) yaSono = true;
        return sono;
    }

    /** Si el celular está en el bolsillo o boca abajo, la vibración avisa igual. */
    function vibrar() {
        try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]); } catch (e) {}
    }

    /* ------------------------------------------------------------
       LO QUE QUEDÓ SIN SONAR NO SE PIERDE

       Si el navegador no dejó sonar, la llamada NO se da por avisada: se
       queda esperando y se reintenta sola, y también en cuanto alguien
       toque la pantalla o vuelva a ella. Sin esto, una llamada que
       llegara con el audio bloqueado desaparecía en silencio.
       ------------------------------------------------------------ */

    let pendiente = null;          // la marca de la llamada que falta anunciar
    const yaSonadas = new Set();
    let avisando = false;
    let reintento = null;

    function volverAIntentar(dentroDe) {
        clearTimeout(reintento);
        reintento = setTimeout(intentarAvisar, Math.max(300, dentroDe));
    }

    async function intentarAvisar() {
        if (!pendiente || avisando) return;

        // La vibración no la puede apagar ningún permiso: va primero
        vibrar();

        const anunciando = pendiente;
        avisando = true;
        let sono = false;
        try { sono = await sonar(); } finally { avisando = false; }

        if (!sono) { volverAIntentar(3000); return; }

        // Si mientras sonaba entró otra llamada, esa sigue pendiente
        if (pendiente === anunciando) pendiente = null;
        yaSonadas.add(anunciando);
        if (pendiente) volverAIntentar(1500);
    }

    /* ------------------------------------------------------------
       LO QUE SE VE

       El sonido dura cinco segundos; el cartel se queda mientras la
       llamada esté viva. Si solo sonara, el mesero oye el pitido con las
       manos ocupadas, no llega a mirar, y ya no sabe quién lo llamaba.
       ------------------------------------------------------------ */

    let caja = null;

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
     * llamando, lo enseña, y lo anuncia UNA vez.
     */
    function revisar(quienSoy) {
        /* La ventana LARGA: si nunca la oyó, tiene derecho a enterarse
           aunque hayan pasado los 90 segundos. Con el celular dormido,
           Android puede tardar minutos en entregar el aviso — y llegar a
           una llamada ya vencida era quedarse mudo justo en el único
           caso donde el sonido hacía falta de verdad. */
        const l = Servicio.llamadaSinOir(quienSoy);
        const cont = cajaHtml();

        if (!l) { cont.hidden = true; return; }

        const quien = l.de === 'parrilla' ? 'La parrilla' : 'La cocina';
        const hace = Math.floor((Date.now() - l.cuando) / 60000);

        cont.hidden = false;
        cont.innerHTML = `
            <i class="fas fa-bell fa-shake"></i>
            <span class="llamada-quien">${quien} te ${hace < 2
                ? 'llama' : `llamó hace ${hace} min`}</span>
            <span class="llamada-toca">toca para quitarlo</span>`;

        /* Una llamada suena una sola vez. Se reconoce por su hora, así
           que volver a llamar vuelve a sonar. */
        const marca = quienSoy + ':' + l.cuando;
        if (yaSonadas.has(marca) || pendiente === marca) return;
        pendiente = marca;
        intentarAvisar();
    }

    /* Cualquier toque sirve para desbloquear el sonido, y al
       desbloquearlo suena lo que se hubiera quedado esperando. El
       celular también duerme el audio al cambiar de aplicación, así que
       se vuelve a intentar al regresar a la pantalla. */
    const despertar = async () => { await preparar(); intentarAvisar(); };

    ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
        window.addEventListener(ev, despertar, { passive: true }));

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) despertar();
    });

    return { revisar, preparar, sonar, DURA, puedeSonar: () => listo() || yaSono };
})();
