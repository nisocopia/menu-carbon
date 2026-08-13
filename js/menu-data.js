/* ============================================================
   MENU-DATA.JS  —  ÚNICO ARCHIVO QUE SE EDITA POR RESTAURANTE
   ------------------------------------------------------------
   Para vender este menú a otro restaurante solo se cambia
   este archivo (y las fotos en img/productos/).
   El resto del sistema no se toca.
   ============================================================ */

const RESTAURANTE = {
    nombre:     'Carbon Restaurant',
    lema:       'Comida al carbón preparada al momento',
    frase:      'Lo bueno toma su tiempo. Gracias por esperar.',
    horario:    'Jue · Vie · Sáb · Dom · Lun  |  6:20 pm – 10:30 pm',
    direccion:  'Dirección del restaurante',
    telefono:   'Teléfono',
    whatsapp:   '',            // Ej: '593991234567' (sin + ni espacios). Vacío = se oculta el botón.
    moneda:     '$',

    // Cuántas mesas tiene el local. El comensal toca la suya antes de
    // mandar el pedido, porque el QR de la mesa no lleva el número dentro.
    mesas:      11,

    /* A QUÉ HORA SE PUEDE PEDIR DESDE EL CELULAR DEL COMENSAL.

       Fuera de esta franja el botón de pedir se apaga y explica por qué.
       Pero lo que de verdad manda son las reglas de Firebase, que
       comparan contra la hora del SERVIDOR: un celular con el reloj
       cambiado no se salta nada.

       Se cuenta con el huso del local y no con el del teléfono, para
       que los dos lados digan lo mismo aunque el comensal traiga el
       celular en otra hora. Ecuador es UTC-5 todo el año y no cambia en
       verano, así que un número fijo vale.

       SI CAMBIAS ESTO, cámbialo también en firebase-rules.json — hay una
       comprobación que falla si los dos no dicen lo mismo. */
    pedirDesde: '18:00',
    pedirHasta: '22:30',
    husoLocal:  -5,

    /* Quién es el dueño. Se saca de Firebase → Authentication → Users,
       columna User UID.

       Hace falta porque todas las cuentas del local (mesero, asador,
       cocina) son cuentas válidas de Firebase: sin esto, cualquiera de
       ellas abría el panel y veía la venta del día.

       No es una clave y no sirve para entrar: es solo un nombre. Quien
       de verdad manda son las reglas de Firebase, que comparan contra
       el token firmado y no se pueden engañar desde el navegador. */
    gerenteUid: 'fbdIzi6tOwhwJwQR6xY0MLUz4UE3',

    // Clave del panel del gerente. Nunca se escribe aquí en texto plano:
    // se guarda solo su huella. Para cambiarla:
    //     node scripts/generar-clave.js "LaNuevaClave"
    // y se pegan aquí las dos líneas que imprime.
    panelSal:   'ed3839803c6bde984a134117a585eca0',
    panelHash:  '657ead722569b25b0772b0511642c4e68d306115518d63a12bfe924fd71d7fd1',
    // Minutos de respaldo cuando un plato no tiene tiempo propio (se usa en el tracker)
    tiempoPromedio: 22
};

/* ------------------------------------------------------------
   QUIÉN ES QUIÉN EN EL LOCAL

   Cada celular entra con su propia cuenta, y cada cuenta hace una
   sola cosa. Antes bastaba con tener cuenta del local: con el correo
   de la cocina se podía abrir la comanda y tomar pedidos.

   Los identificadores se sacan de Firebase → Authentication → Users,
   columna User UID. No son claves y no sirven para entrar: son
   nombres. Quien de verdad manda son las reglas de Firebase, que
   comparan contra el token firmado y no se pueden engañar desde el
   navegador. Por eso los mismos uid van escritos también en
   firebase-rules.json — si cambias uno, cámbialo en los dos lados.

   Los roles válidos son: 'gerente', 'mesero', 'cocina', 'parrilla'
   y 'servir' (el que pone los cubiertos y lleva los platos a la mesa).

   SI SE DEJA VACÍO, cualquier cuenta del local puede todo, como
   antes. Así un restaurante que todavía no ha repartido las cuentas
   no se queda con el personal afuera.
   ------------------------------------------------------------ */

const EQUIPO = {
    'fbdIzi6tOwhwJwQR6xY0MLUz4UE3': 'gerente',    // eduardolino78@gmail.com
    'YHeMmcUbMFdsPQrIcvT561FDunt1': 'mesero',     // mesa@gmail.com
    'rgi36tpn1KNHeDEqJN17dpbWguy2': 'cocina',     // cocina@gmail.com
    '0elTDMQYcHSZYZHHyZ4i3RFPQEo1': 'parrilla',    // asador@gmail.com
    'eYL6FEUszadeWbFcVLSVLDswWVs2': 'servir'      // servir@gmail.com
};

/* ------------------------------------------------------------
   SINCRONIZACIÓN EN VIVO  (opcional)

   Con esto configurado, cuando el gerente marca un plato como agotado
   desaparece del menú de TODOS los celulares en segundos, y los pedidos
   le llegan al panel en vivo.

   Si se deja vacío, el menú funciona igual que siempre, pero cada
   dispositivo guarda lo suyo por separado.

   Los pasos para llenarlo están en FIREBASE.md
   ------------------------------------------------------------ */

const FIREBASE = {
    apiKey:      'AIzaSyCXjLYIY3KkhGeUiXmnijbdubSmi7NyTh4',
    databaseURL: 'https://menu-carbon-default-rtdb.firebaseio.com'
};

/* ------------------------------------------------------------
   AVISOS QUE DESPIERTAN EL CELULAR

   El aviso sonoro de las pantallas solo suena con la pantalla
   encendida y la aplicación a la vista. Con el celular en el bolsillo
   o la tablet apagada no suena nada, y no hay forma de arreglarlo
   desde la página: si el sistema congela la aplicación, no queda nada
   corriendo que pueda sonar.

   Lo único que despierta un celular dormido es un aviso que llegue de
   fuera. Eso lo reparte Google, y para que no lo pueda usar cualquiera
   va firmado con una clave que es de este local.

   CÓMO SE LLENA:

       node scripts/generar-clave-push.js

   imprime dos claves. La PÚBLICA se pega aquí abajo. La PRIVADA NO va
   al repositorio: se guarda aparte y solo la tiene quien manda los
   avisos.

   SI SE DEJA VACÍO no pasa nada: las pantallas siguen sonando como
   hasta ahora, solo que sin avisar con el celular guardado.
   ------------------------------------------------------------ */

const PUSH = {
    clave: '',

    /* A quién escribirle si un aviso da problemas. Lo exige el estándar
       y lo lee una persona de Google, no un programa. */
    contacto: 'mailto:eduardolino78@gmail.com'
};

/* ------------------------------------------------------------
   GUARNICIONES QUE SE PUEDEN QUITAR

   El comensal pide "una carne solo con plátano y ensalada". El precio
   NO cambia: no se está quitando comida, se está reemplazando por más
   de lo otro, y la cocina ya sabe cuánto aumentar. Por eso a la cocina
   solo le llega lo que se quita.
   ------------------------------------------------------------ */

const GUARNICIONES = {
    arroz:    'arroz',
    menestra: 'menestra',
    ensalada: 'ensalada',
    platano:  'plátano',
    patacones:'patacones'
};

/* ------------------------------------------------------------
   PLATOS QUE SE SIRVEN DE OTRA FORMA

   Quitar no alcanzaba. "Solo patacones y ensalada" en una costilla no
   es quitar tres cosas: es que entre algo que ese plato NO trae — los
   patacones son de los platos de cocina, no de la parrilla.

   Se declara POR EL RESULTADO, no por lo que se quita ni por lo que se
   pone. Así la misma línea sirve para todos los platos: en una costilla
   se van el arroz, la menestra y el plátano y entran los patacones; en
   un pescado, que ya viene con patacones y ensalada, solo se va el
   arroz. No hay que escribir la regla dos veces ni acordarse de cuál
   plato trae qué.

   Otra forma de servir mañana —"solo arroz y ensalada"— es una línea
   más aquí, no código nuevo.

   EL PRECIO NO CAMBIA. Una costilla con patacones y ensalada se cobra
   $5.50, igual que la costilla normal. Es decisión del local: los
   patacones cuestan más que el arroz que reemplazan.
   ------------------------------------------------------------ */

const CAMBIOS = [
    {
        id: 'pat',
        etiqueta: 'Solo patacones y ensalada',
        deja: ['patacones', 'ensalada']
    }
];

/* ------------------------------------------------------------
   LO QUE HAY EN LA NEVERA

   El stock NO se cuenta por plato, se cuenta por producto. Es la
   diferencia entre lo que se vende y lo que se acaba:

       quedan 3 pollos  ->  se caen el pollo asado, el pollo apanado,
                            el junior y la porción. Los cuatro salen
                            del mismo pollo.

   Contado por plato habría que poner "3" cuatro veces y el sistema
   dejaría vender doce pollos que no existen.

   CÓMO SE DECLARA: un plato que comparte producto con otros lo dice
   con `usa`. El que no dice nada es su propio producto — así se le
   puede poner número a cualquier plato de la carta sin declarar nada.

   Y ES OTRA COSA QUE EL BOTÓN "AGOTADO" del panel. Ese apaga UN plato:
   se acabó la apanadura y cae el pollo apanado, pero el pollo asado y
   la porción siguen vendiéndose. Los dos caminos conviven: un plato se
   puede pedir si tiene producto Y no está apagado a mano.

   SIN NÚMERO NO HAY LÍMITE. Mientras el gerente no ponga una cantidad,
   todo se vende como hasta ahora. El stock es para las noches en que
   algo escasea, no para llevar inventario.
   ------------------------------------------------------------ */

const PRODUCTOS = {
    pollo:    'Pollo',
    carne:    'Carne',
    chuleta:  'Chuleta',
    costilla: 'Costilla',
    matambre: 'Matambre',
    chancho:  'Chancho',
    camaron:  'Camarón',
    pescado:  'Pescado'
};

/* ------------------------------------------------------------
   CATEGORÍAS Y PLATOS

   - id:        se usa para el enlace del menú (#parrillas)
   - icono:     clase de Font Awesome
   - estilo:    'tarjetas' (con foto) o 'lista' (compacto)
   - agotado:   true lo muestra tachado y no se puede pedir
   - destacado: true le pone el sello "El más pedido"

   PARA EL SISTEMA DE COMANDAS:
   - estacion:  'asador' | 'cocina' | 'barra'
                Manda quién ve el plato en su pantalla. 'barra' no
                aparece en ninguna: esas las sirve el mesero directo.
   - guarnicion: qué acompañantes trae, para poder quitárselos. Se puede
                poner en la categoría o en un plato suelto (los juniors
                están juntos pero no todos llevan lo mismo).
   - cubierto:  true si es un plato fuerte que se sienta a comer. De aquí
                salen los cubiertos que pone el mesero, sin preguntarle a
                nadie: los "para llevar" no cuentan.
   - sigla:     abreviatura que sale en el código del pedido (M3 · 2PO 1CA).
                Solo la lleva la parrilla, que es lo que más se pide y lo
                que el asador lee con las manos ocupadas. El resto sale
                con su nombre: nadie va a decir "un ka-jota".
   - soloMesero: la categoria existe y se puede pedir desde la comanda,
                pero NO aparece en el menu del comensal. Para lo que no
                se anuncia: el menu de ninos, precios especiales.
   - usa:       de qué producto sale, para el stock. Varios platos pueden
                compartirlo: el asado, el apanado, el junior y la porción
                salen todos del mismo pollo. El plato que no lo declara es
                su propio producto. Los mixtos NO lo llevan: sus carnes se
                escogen al tomar el pedido, así que se descuentan de lo que
                el mesero eligió.
   - interno:   cómo se le dice al plato PUERTAS ADENTRO. El comensal ve
                "Mixto 2 Carnes" en la carta, que es como se vende; el
                personal lo ve como "Mixto 2 Proteínas", que es como se
                habla en la cocina. Sin este campo, los dos ven lo mismo.
   - atajo:     lo que se teclea al tomar el pedido. "3p" = 3 pollos.
   - minutos:   cuánto demora, para decirle la verdad al comensal
   - termino:   true si se le puede pedir el término (solo la carne)
   - tarrina:   true si al llevárselo hay que ponerle tarrina. Se cobra
                sola, una por unidad: el mesero no hace cuentas.
   - editableSiempre: true deja seguir tocando ese plato después del
                minuto de gracia. Es para lo que no se cocina —bebidas y
                porciones sueltas—, que se piden a mitad de la comida.
                Lo que NO lo lleva queda bloqueado pasado el minuto, que
                es lo seguro: cuando la proteína ya está en la parrilla,
                cambiarla es como no haberla pedido.
   ------------------------------------------------------------ */

const MENU = [
    {
        id: 'parrillas',
        nombre: 'Parrillas',
        icono: 'fa-fire',
        descripcion: 'Incluyen arroz, menestra, ensalada y plátano.',
        estilo: 'tarjetas',
        estacion: 'asador',
        cubierto: true,
        guarnicion: ['arroz', 'menestra', 'ensalada', 'platano'],
        platos: [
            { id: 'p1', usa: 'carne', nombre: 'Carne Asada',  precio: 3.50, img: 'img/productos/carneasada.webp',    destacado: true, sigla: 'CA', atajo: 'c',  minutos: 8,  termino: true, tarrina: true },
            { id: 'p2', usa: 'chuleta', nombre: 'Chuleta',      precio: 4.00, img: 'img/productos/chuletaas.webp',                      sigla: 'CH', atajo: 'ch', minutos: 10 },
            { id: 'p3', usa: 'costilla', nombre: 'Costilla',     precio: 5.50, img: 'img/productos/costillaasada.webp',                  sigla: 'CO', atajo: 'co', minutos: 20 },
            { id: 'p4', usa: 'matambre', nombre: 'Matambre',     precio: 5.00, img: '',                                                  sigla: 'MA', atajo: 'ma', minutos: 15 },
            { id: 'p5', usa: 'pollo', nombre: 'Pollo Asado',  precio: 3.50, img: 'img/productos/polloasado.webp',    destacado: true, sigla: 'PO', atajo: 'p',  minutos: 15, tarrina: true }
        ]
    },
    {
        id: 'mixtos',
        nombre: 'Mixtos',
        icono: 'fa-utensils',
        descripcion: 'Incluyen arroz, menestra, ensalada y plátano.',
        estilo: 'tarjetas',
        estacion: 'asador',
        cubierto: true,
        guarnicion: ['arroz', 'menestra', 'ensalada', 'platano'],
        // El mixto llega entero al asador ("Mixto: pollo + carne"), no
        // desarmado en proteínas sueltas: sus dos carnes salen juntas.
        platos: [
            { id: 'm1', nombre: 'Mixto 2 Carnes',           interno: 'Mixto 2 Proteínas',          precio: 6.00,  img: '', sigla: 'X2',  atajo: 'x2',  minutos: 15, descripcion: 'Pollo + Carne o Chuleta',
              elegir: { cuantas: 2, entre: ['p5', 'p1', 'p2'] } },
            { id: 'm2', nombre: 'Mixto 2 Carnes Especial',  interno: 'Mixto 2 Proteínas Especial', precio: 7.00,  img: '', sigla: 'X2E', atajo: 'x2e', minutos: 20, descripcion: 'Costilla o Matambre + Pollo, Carne o Chuleta',
              elegir: { cuantas: 2, entre: ['p3', 'p4', 'p5', 'p1', 'p2'] } },
            { id: 'm3', nombre: 'Mixto 3 Carnes',           interno: 'Mixto 3 Proteínas',          precio: 8.00,  img: '', sigla: 'X3',  atajo: 'x3',  minutos: 15, descripcion: 'Pollo + Carne + Chuleta',
              elegir: { cuantas: 3, entre: ['p5', 'p1', 'p2'] } },
            { id: 'm4', nombre: 'Mixto 3 Carnes Especial',  interno: 'Mixto 3 Proteínas Especial', precio: 10.00, img: '', sigla: 'X3E', atajo: 'x3e', minutos: 20, descripcion: 'Costilla, Matambre, Pollo, Carne, Chuleta',
              elegir: { cuantas: 3, entre: ['p3', 'p4', 'p5', 'p1', 'p2'] } }
        ]
    },
    {
        id: 'juniors',
        nombre: 'Juniors',
        icono: 'fa-child',
        descripcion: 'Porción para niños.',
        estilo: 'lista',
        /* No sale en el menú del comensal: se pide diciéndoselo al mesero.
           Es porción de niño y vale menos, así que puesta en la carta un
           adulto pide el junior — come menos y el local gana menos. Los
           restaurantes con menú infantil lo manejan igual. */
        soloMesero: true,
        estacion: 'asador',                 // los de parrilla; los otros lo cambian abajo
        cubierto: true,                     // el niño se sienta a comer: cuenta cubierto
        tarrina: true,                      // porción de niño, pero si se la llevan va en tarrina
        guarnicion: ['arroz', 'menestra', 'ensalada', 'platano'],
        platos: [
            { id: 'j1', usa: 'pollo', nombre: 'Junior de Pollo',   precio: 2.50, sigla: 'JPO', atajo: 'jp',  minutos: 10 },
            // Al junior no se le pide término: es porción de niño y sale como sale
            { id: 'j2', usa: 'carne', nombre: 'Junior de Carne',   precio: 2.50, sigla: 'JCA', atajo: 'jc',  minutos: 6 },
            { id: 'j3', usa: 'chuleta', nombre: 'Junior de Chuleta', precio: 2.50, sigla: 'JCH', atajo: 'jch', minutos: 8 },
            // La hornada sale del horno y los apanados de la sartén: no
            // son de parrilla aunque estén en la misma lista.
            { id: 'j4', usa: 'chancho', nombre: 'Junior de Hornada',        precio: 2.50, atajo: 'jho',
              estacion: 'cocina', guarnicion: ['arroz', 'ensalada', 'patacones'] },
            { id: 'j5', usa: 'pollo', nombre: 'Junior de Pollo Apanado',  precio: 3.00, atajo: 'jap',
              estacion: 'cocina', guarnicion: ['arroz', 'ensalada', 'patacones'] },
            { id: 'j6', usa: 'carne', nombre: 'Junior de Carne Apanada',  precio: 3.00, atajo: 'jac',
              estacion: 'cocina', guarnicion: ['arroz', 'ensalada', 'patacones'] }
        ]
    },
    {
        id: 'horno',
        nombre: 'Al Horno',
        icono: 'fa-fire-burner',
        descripcion: 'Incluye arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        estacion: 'cocina',
        cubierto: true,
        guarnicion: ['arroz', 'ensalada', 'patacones'],
        platos: [
            { id: 'h1', usa: 'chancho', nombre: 'Chancho al Horno', precio: 5.00, img: 'img/productos/chanchoalhorno.webp', atajo: 'ho' }
        ]
    },
    {
        id: 'apanados',
        nombre: 'Apanados',
        icono: 'fa-drumstick-bite',
        descripcion: 'Incluyen arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        estacion: 'cocina',
        cubierto: true,
        guarnicion: ['arroz', 'ensalada', 'patacones'],
        platos: [
            { id: 'a1', usa: 'pollo', nombre: 'Pollo Apanado', precio: 5.00, img: 'img/productos/polloap.webp', atajo: 'ap' },
            { id: 'a2', usa: 'carne', nombre: 'Carne Apanada', precio: 5.00, img: 'img/productos/carneap.webp', atajo: 'ac' }
        ]
    },
    {
        id: 'camarones',
        nombre: 'Camarones',
        icono: 'fa-shrimp',
        descripcion: 'Incluyen arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        estacion: 'cocina',
        cubierto: true,
        guarnicion: ['arroz', 'ensalada', 'patacones'],
        platos: [
            { id: 'c1', usa: 'camaron', nombre: 'Camarón Apanado',   precio: 6.00, img: 'img/productos/camaronap.webp',     atajo: 'ka' },
            { id: 'c2', usa: 'camaron', nombre: 'Camarón al Ajillo', precio: 6.00, img: 'img/productos/camaronajillo.webp', atajo: 'kj' }
        ]
    },
    {
        id: 'pescados',
        nombre: 'Pescados',
        icono: 'fa-fish',
        descripcion: 'Incluyen arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        estacion: 'cocina',
        cubierto: true,
        guarnicion: ['arroz', 'ensalada', 'patacones'],
        platos: [
            { id: 'f1', usa: 'pescado', nombre: 'Pescado Apanado',      precio: 5.00, img: 'img/productos/pescadoap.webp',      atajo: 'pa' },
            { id: 'f2', usa: 'pescado', nombre: 'Pescado al Ajillo',    precio: 6.00, img: 'img/productos/pescadoalajillo.webp', atajo: 'pj' },
            { id: 'f3', usa: 'pescado', nombre: 'Pescado a la Plancha', precio: 5.00, img: 'img/productos/pescadoplancha.webp',  atajo: 'pp' }
        ]
    },
    {
        id: 'espaguetis',
        nombre: 'Espaguetis',
        icono: 'fa-bowl-food',
        descripcion: '',
        estilo: 'tarjetas',
        estacion: 'cocina',
        cubierto: true,
        platos: [
            { id: 'e1', nombre: 'Carbonara',            precio: 7.00, img: '',                                   atajo: 'cb' },
            { id: 'e2', usa: 'camaron', nombre: 'Espagueti de Camarón', precio: 7.00, img: 'img/productos/espagueticamaron.webp', atajo: 'ek' }
        ]
    },
    {
        id: 'porciones',
        nombre: 'Porciones',
        icono: 'fa-cube',
        descripcion: 'Para acompañar tu plato.',
        estilo: 'lista',
        estacion: 'cocina',
        sugerible: true,          // <- estas aparecen como sugerencia al cerrar el pedido
        // Se piden a mitad de la comida, cuando el plato fuerte ya lleva
        // rato en la parrilla. Por eso siguen siendo editables después
        // del minuto de gracia.
        editableSiempre: true,
        /* La guarnición de una porción es ella misma. Se declara porque
           la cocina cuenta con esto el arroz que tiene pedido y todavía
           no ha salido: un arroz suelto gasta olla igual que el de un
           plato fuerte. */
        platos: [
            { id: 'r1', nombre: 'Arroz',            precio: 1.50, atajo: 'ar', guarnicion: ['arroz'] },
            { id: 'r2', nombre: 'Menestra',         precio: 1.00, atajo: 'me', guarnicion: ['menestra'] },
            { id: 'r3', nombre: 'Arroz y Menestra', precio: 2.00, atajo: 'am', guarnicion: ['arroz', 'menestra'] },
            { id: 'r4', nombre: 'Patacones',        precio: 2.00, atajo: 'pt', guarnicion: ['patacones'] },
            { id: 'r5', nombre: 'Plátano',          precio: 2.00, atajo: 'pl', guarnicion: ['platano'] }
        ]
    },
    {
        id: 'proteina',
        nombre: 'Porciones de Proteína',
        icono: 'fa-bacon',
        descripcion: 'Solo la carne, sin acompañantes.',
        estilo: 'lista',
        estacion: 'asador',       // estas sí van a la parrilla
        platos: [
            { id: 'q1', usa: 'pollo', nombre: 'Porción de Pollo',    precio: 2.00, atajo: 'qp',  minutos: 15 },
            { id: 'q2', usa: 'carne', nombre: 'Porción de Carne',    precio: 2.00, atajo: 'qc',  minutos: 8, termino: true },
            { id: 'q3', usa: 'chuleta', nombre: 'Porción de Chuleta',  precio: 2.50, atajo: 'qch', minutos: 10 },
            { id: 'q4', usa: 'matambre', nombre: 'Porción de Matambre', precio: 3.50, atajo: 'qma', minutos: 15 },
            { id: 'q5', usa: 'costilla', nombre: 'Porción de Costilla', precio: 4.00, atajo: 'qco', minutos: 20 },
            // El chancho sale del horno, no de la parrilla
            { id: 'q6', usa: 'chancho', nombre: 'Porción de Chancho',  precio: 3.50, atajo: 'qho', estacion: 'cocina' }
        ]
    },
    {
        id: 'bebidas',
        nombre: 'Bebidas',
        icono: 'fa-wine-glass',
        descripcion: '',
        estilo: 'lista',
        estacion: 'barra',        // no van a ninguna pantalla: las sirve el mesero
        sugerible: true,
        editableSiempre: true,    // una cola se pide en cualquier momento
        platos: [
            // Los jugos son del propio negocio, por eso van destacados arriba
            { id: 'b1', nombre: 'Jugo de Maracuyá',  precio: 1.00, atajo: 'jma', destacado: true },
            { id: 'b2', nombre: 'Jugo de Mora',      precio: 1.00, atajo: 'jmo', destacado: true },
            { id: 'b3', nombre: 'Cola personal',     precio: 0.50, atajo: 'cp' },
            { id: 'b4', nombre: 'Cola 1 L',          precio: 1.50, atajo: 'c1' },
            { id: 'b5', nombre: 'Cola 2 L',          precio: 2.50, atajo: 'c2' },
            { id: 'b6', nombre: 'Cola flaca de sabor', precio: 1.50, atajo: 'cf' },
            { id: 'b7', nombre: 'Coca-Cola flaca',   precio: 2.00, atajo: 'cc' },
            { id: 'b8', nombre: 'Fuze Tea personal', precio: 1.00, atajo: 'fz' },
            { id: 'b9', nombre: 'Fuze Tea 1 L',      precio: 1.50, atajo: 'f1' },
            // Sin precio = el menú muestra "Pregunta al mesero". Las cervezas y
            // el agua salen de la tienda de al lado y cambian mucho: se cobran
            // con el botón "Otra bebida" de la comanda, que las va guardando.
            { id: 'b10', nombre: 'Cervezas' },
            { id: 'b11', nombre: 'Agua' }
        ]
    },
    {
        /* LA TARRINA ES UN PLATO, NO UNA CUENTA APARTE.

           Podría haberse sumado a mano al total, escondida en el código.
           Puesta aquí, entra por el camino que ya existe: sale en la
           cuenta con su nombre, el comensal ve por qué paga 25 centavos
           más, y el gerente le cambia el precio desde el panel el día
           que suban las tarrinas. Nada de eso hubo que programarlo.

           'barra' para que no le llegue a la parrilla ni a la cocina —
           nadie la prepara — y soloMesero para que no salga en la carta:
           no es algo que se pida, es algo que se cobra. */
        id: 'extras',
        nombre: 'Extras',
        icono: 'fa-box',
        descripcion: 'Se agregan solos cuando hacen falta.',
        estilo: 'lista',
        estacion: 'barra',
        soloMesero: true,
        editableSiempre: true,
        platos: [
            { id: 't1', nombre: 'Tarrina', precio: 0.25, atajo: 'ta' }
        ]
    }
];
