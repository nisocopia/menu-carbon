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
   - atajo:     lo que se teclea al tomar el pedido. "3p" = 3 pollos.
   - minutos:   cuánto demora, para decirle la verdad al comensal
   - termino:   true si se le puede pedir el término (solo la carne)
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
            { id: 'p1', nombre: 'Carne Asada',  precio: 3.50, img: 'img/productos/carneasada.webp',    destacado: true, sigla: 'CA', atajo: 'c',  minutos: 8,  termino: true },
            { id: 'p2', nombre: 'Chuleta',      precio: 4.00, img: 'img/productos/chuletaas.webp',                      sigla: 'CH', atajo: 'ch', minutos: 10 },
            { id: 'p3', nombre: 'Costilla',     precio: 5.50, img: 'img/productos/costillaasada.webp',                  sigla: 'CO', atajo: 'co', minutos: 20 },
            { id: 'p4', nombre: 'Matambre',     precio: 5.00, img: '',                                                  sigla: 'MA', atajo: 'ma', minutos: 15 },
            { id: 'p5', nombre: 'Pollo Asado',  precio: 3.50, img: 'img/productos/polloasado.webp',    destacado: true, sigla: 'PO', atajo: 'p',  minutos: 15 }
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
            { id: 'm1', nombre: 'Mixto 2 Carnes',           precio: 6.00,  img: '', sigla: 'X2',  atajo: 'x2',  minutos: 15, descripcion: 'Pollo + Carne o Chuleta',
              elegir: { cuantas: 2, entre: ['p5', 'p1', 'p2'] } },
            { id: 'm2', nombre: 'Mixto 2 Carnes Especial',  precio: 7.00,  img: '', sigla: 'X2E', atajo: 'x2e', minutos: 20, descripcion: 'Costilla o Matambre + Pollo, Carne o Chuleta',
              elegir: { cuantas: 2, entre: ['p3', 'p4', 'p5', 'p1', 'p2'] } },
            { id: 'm3', nombre: 'Mixto 3 Carnes',           precio: 8.00,  img: '', sigla: 'X3',  atajo: 'x3',  minutos: 15, descripcion: 'Pollo + Carne + Chuleta',
              elegir: { cuantas: 3, entre: ['p5', 'p1', 'p2'] } },
            { id: 'm4', nombre: 'Mixto 3 Carnes Especial',  precio: 10.00, img: '', sigla: 'X3E', atajo: 'x3e', minutos: 20, descripcion: 'Costilla, Matambre, Pollo, Carne, Chuleta',
              elegir: { cuantas: 3, entre: ['p3', 'p4', 'p5', 'p1', 'p2'] } }
        ]
    },
    {
        id: 'juniors',
        nombre: 'Juniors',
        icono: 'fa-child',
        descripcion: 'Porción para niños.',
        estilo: 'lista',
        estacion: 'asador',                 // los de parrilla; los otros lo cambian abajo
        cubierto: true,                     // el niño se sienta a comer: cuenta cubierto
        guarnicion: ['arroz', 'menestra', 'ensalada', 'platano'],
        platos: [
            { id: 'j1', nombre: 'Junior de Pollo',   precio: 2.50, sigla: 'JPO', atajo: 'jp',  minutos: 10 },
            // Al junior no se le pide término: es porción de niño y sale como sale
            { id: 'j2', nombre: 'Junior de Carne',   precio: 2.50, sigla: 'JCA', atajo: 'jc',  minutos: 6 },
            { id: 'j3', nombre: 'Junior de Chuleta', precio: 2.50, sigla: 'JCH', atajo: 'jch', minutos: 8 },
            // La hornada sale del horno y los apanados de la sartén: no
            // son de parrilla aunque estén en la misma lista.
            { id: 'j4', nombre: 'Junior de Hornada',        precio: 2.50, atajo: 'jho',
              estacion: 'cocina', guarnicion: ['arroz', 'ensalada', 'patacones'] },
            { id: 'j5', nombre: 'Junior de Pollo Apanado',  precio: 3.00, atajo: 'jap',
              estacion: 'cocina', guarnicion: ['arroz', 'ensalada', 'patacones'] },
            { id: 'j6', nombre: 'Junior de Carne Apanada',  precio: 3.00, atajo: 'jac',
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
            { id: 'h1', nombre: 'Chancho al Horno', precio: 5.00, img: 'img/productos/chanchoalhorno.webp', atajo: 'ho' }
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
            { id: 'a1', nombre: 'Pollo Apanado', precio: 5.00, img: 'img/productos/polloap.webp', atajo: 'ap' },
            { id: 'a2', nombre: 'Carne Apanada', precio: 5.00, img: 'img/productos/carneap.webp', atajo: 'ac' }
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
            { id: 'c1', nombre: 'Camarón Apanado',   precio: 6.00, img: 'img/productos/camaronap.webp',     atajo: 'ka' },
            { id: 'c2', nombre: 'Camarón al Ajillo', precio: 6.00, img: 'img/productos/camaronajillo.webp', atajo: 'kj' }
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
            { id: 'f1', nombre: 'Pescado Apanado',      precio: 5.00, img: 'img/productos/pescadoap.webp',      atajo: 'pa' },
            { id: 'f2', nombre: 'Pescado al Ajillo',    precio: 6.00, img: 'img/productos/pescadoalajillo.webp', atajo: 'pj' },
            { id: 'f3', nombre: 'Pescado a la Plancha', precio: 5.00, img: 'img/productos/pescadoplancha.webp',  atajo: 'pp' }
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
            { id: 'e2', nombre: 'Espagueti de Camarón', precio: 7.00, img: 'img/productos/espagueticamaron.webp', atajo: 'ek' }
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
        platos: [
            { id: 'r1', nombre: 'Arroz',            precio: 1.50, atajo: 'ar' },
            { id: 'r2', nombre: 'Menestra',         precio: 1.00, atajo: 'me' },
            { id: 'r3', nombre: 'Arroz y Menestra', precio: 2.00, atajo: 'am' },
            { id: 'r4', nombre: 'Patacones',        precio: 2.00, atajo: 'pt' }
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
            { id: 'q1', nombre: 'Porción de Pollo',    precio: 2.00, atajo: 'qp',  minutos: 15 },
            { id: 'q2', nombre: 'Porción de Carne',    precio: 2.00, atajo: 'qc',  minutos: 8, termino: true },
            { id: 'q3', nombre: 'Porción de Chuleta',  precio: 2.50, atajo: 'qch', minutos: 10 },
            { id: 'q4', nombre: 'Porción de Matambre', precio: 3.50, atajo: 'qma', minutos: 15 },
            { id: 'q5', nombre: 'Porción de Costilla', precio: 4.00, atajo: 'qco', minutos: 20 },
            // El chancho sale del horno, no de la parrilla
            { id: 'q6', nombre: 'Porción de Chancho',  precio: 3.50, atajo: 'qho', estacion: 'cocina' }
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
    }
];
