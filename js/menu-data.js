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

    // Clave del panel del gerente. Nunca se escribe aquí en texto plano:
    // se guarda solo su huella. Para cambiarla:
    //     node scripts/generar-clave.js "LaNuevaClave"
    // y se pegan aquí las dos líneas que imprime.
    panelSal:   'ed3839803c6bde984a134117a585eca0',
    panelHash:  '657ead722569b25b0772b0511642c4e68d306115518d63a12bfe924fd71d7fd1',
    // Minutos estimados de cada etapa del pedido (se usa en el tracker)
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
    apiKey:      '',
    databaseURL: ''
};

/* ------------------------------------------------------------
   CATEGORÍAS Y PLATOS
   - id:        se usa para el enlace del menú (#parrillas)
   - icono:     clase de Font Awesome
   - estilo:    'tarjetas' (con foto) o 'lista' (compacto)
   - agotado:   true lo muestra tachado y no se puede pedir
   - destacado: true le pone el sello "El más pedido"
   ------------------------------------------------------------ */

const MENU = [
    {
        id: 'parrillas',
        nombre: 'Parrillas',
        icono: 'fa-fire',
        descripcion: 'Incluyen arroz, menestra, ensalada y plátano.',
        estilo: 'tarjetas',
        platos: [
            { id: 'p1', nombre: 'Carne Asada',  precio: 3.50, img: 'img/productos/carneasada.webp',    destacado: true },
            { id: 'p2', nombre: 'Chuleta',      precio: 4.00, img: 'img/productos/chuletaas.webp' },
            { id: 'p3', nombre: 'Costilla',     precio: 5.50, img: 'img/productos/costillaasada.webp' },
            { id: 'p4', nombre: 'Matambre',     precio: 5.00, img: '' },
            { id: 'p5', nombre: 'Pollo Asado',  precio: 3.50, img: 'img/productos/polloasado.webp',    destacado: true }
        ]
    },
    {
        id: 'mixtos',
        nombre: 'Mixtos',
        icono: 'fa-utensils',
        descripcion: 'Incluyen arroz, menestra, ensalada y plátano.',
        estilo: 'tarjetas',
        platos: [
            { id: 'm1', nombre: 'Mixto 2 Carnes',           precio: 6.00,  img: '', descripcion: 'Pollo + Carne o Chuleta' },
            { id: 'm2', nombre: 'Mixto 2 Carnes Especial',  precio: 7.00,  img: '', descripcion: 'Costilla o Matambre + Pollo, Carne o Chuleta' },
            { id: 'm3', nombre: 'Mixto 3 Carnes',           precio: 8.00,  img: '', descripcion: 'Pollo + Carne + Chuleta' },
            { id: 'm4', nombre: 'Mixto 3 Carnes Especial',  precio: 10.00, img: '', descripcion: 'Costilla, Matambre, Pollo, Carne, Chuleta' }
        ]
    },
    {
        id: 'horno',
        nombre: 'Al Horno',
        icono: 'fa-fire-burner',
        descripcion: 'Incluye arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        platos: [
            { id: 'h1', nombre: 'Chancho al Horno', precio: 5.00, img: 'img/productos/chanchoalhorno.webp' }
        ]
    },
    {
        id: 'apanados',
        nombre: 'Apanados',
        icono: 'fa-drumstick-bite',
        descripcion: 'Incluyen arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        platos: [
            { id: 'a1', nombre: 'Pollo Apanado', precio: 5.00, img: 'img/productos/polloap.webp' },
            { id: 'a2', nombre: 'Carne Apanada', precio: 5.00, img: 'img/productos/carneap.webp' }
        ]
    },
    {
        id: 'camarones',
        nombre: 'Camarones',
        icono: 'fa-shrimp',
        descripcion: 'Incluyen arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        platos: [
            { id: 'c1', nombre: 'Camarón Apanado',  precio: 6.00, img: 'img/productos/camaronap.webp' },
            { id: 'c2', nombre: 'Camarón al Ajillo', precio: 6.00, img: 'img/productos/camaronajillo.webp' }
        ]
    },
    {
        id: 'pescados',
        nombre: 'Pescados',
        icono: 'fa-fish',
        descripcion: 'Incluyen arroz, ensalada y patacones.',
        estilo: 'tarjetas',
        platos: [
            { id: 'f1', nombre: 'Pescado Apanado',     precio: 5.00, img: 'img/productos/pescadoap.webp' },
            { id: 'f2', nombre: 'Pescado al Ajillo',   precio: 6.00, img: 'img/productos/pescadoalajillo.webp' },
            { id: 'f3', nombre: 'Pescado a la Plancha', precio: 5.00, img: 'img/productos/pescadoplancha.webp' }
        ]
    },
    {
        id: 'espaguetis',
        nombre: 'Espaguetis',
        icono: 'fa-bowl-food',
        descripcion: '',
        estilo: 'tarjetas',
        platos: [
            { id: 'e1', nombre: 'Carbonara',            precio: 7.00, img: '' },
            { id: 'e2', nombre: 'Espagueti de Camarón', precio: 7.00, img: 'img/productos/espagueticamaron.webp' }
        ]
    },
    {
        id: 'porciones',
        nombre: 'Porciones',
        icono: 'fa-cube',
        descripcion: 'Para acompañar tu plato.',
        estilo: 'lista',
        sugerible: true,          // <- estas aparecen como sugerencia al cerrar el pedido
        platos: [
            { id: 'r1', nombre: 'Arroz',             precio: 1.50 },
            { id: 'r2', nombre: 'Menestra',          precio: 1.00 },
            { id: 'r3', nombre: 'Arroz y Menestra',  precio: 2.00 },
            { id: 'r4', nombre: 'Patacones',         precio: 2.00 }
        ]
    },
    {
        id: 'bebidas',
        nombre: 'Bebidas',
        icono: 'fa-wine-glass',
        descripcion: '',
        estilo: 'lista',
        sugerible: true,
        platos: [
            // OJO: estos precios son de ejemplo, ajústalos desde el panel del gerente.
            { id: 'b1', nombre: 'Agua',      },
            { id: 'b2', nombre: 'Cola',      },
            { id: 'b3', nombre: 'Jugos',     },
            { id: 'b4', nombre: 'Cervezas',   }
        ]
    }
];
