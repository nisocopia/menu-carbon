/**
 * PROBAR.JS  —  Comprobaciones antes de subir
 *
 *     node scripts/probar.js
 *
 * No hay que instalar nada: usa el Node que ya tienes para generar la
 * clave del panel.
 *
 * Revisa las cosas que, si se rompen, NO se notan mirando la pantalla y
 * se descubren en hora pico con seis mesas esperando:
 *
 *   - que el menu-data.js que genera el panel no pierda ningún campo
 *   - que la cuenta de una mesa junte todas sus sesiones
 *   - que un pedido del comensal no se pueda confirmar dos veces
 *   - que cada pantalla escriba en la nube solo su campo
 *   - que cada cuenta llegue solo hasta donde le toca
 *
 * Si termina diciendo "Todo bien", se puede subir.
 */

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const fuente = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let fallos = 0;
function comprobar(titulo, real, esperado) {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log((ok ? 'OK    ' : 'FALLA ') + titulo +
        (ok ? '' : `\n         esperaba ${JSON.stringify(esperado)}  y salió ${JSON.stringify(real)}`));
}

/* ============================================================
   PARTE 1 — EL ARCHIVO QUE GENERA EL PANEL

   El botón "Descargar menu-data.js" escribe el archivo que se sube al
   sitio. Si se le olvida un campo, el menú del comensal sigue viéndose
   bien y el sistema de comandas se muere en silencio. Por eso se
   compara campo por campo contra el original.
   ============================================================ */

function probarExportacion() {
    console.log('\n--- El menu-data.js que descarga el gerente ---');

    const guardado = {};
    const ctx = vm.createContext({
        console, Date,
        localStorage: {
            getItem: k => (k in guardado ? guardado[k] : null),
            setItem: (k, v) => { guardado[k] = String(v); },
            removeItem: k => { delete guardado[k]; }
        }
    });
    ['js/menu-data.js', 'js/store.js'].forEach(f => vm.runInContext(fuente(f), ctx));

    const salida = vm.runInContext('Store.exportarMenuData()', ctx);

    // ¿Es JavaScript válido? Se ejecuta en un contexto limpio.
    const ctx2 = vm.createContext({ console });
    try {
        vm.runInContext(salida, ctx2);
        comprobar('el archivo generado se ejecuta sin errores', true, true);
    } catch (e) {
        comprobar('el archivo generado se ejecuta sin errores', e.message, true);
        return;
    }

    // Sin cualquiera de estos, el sistema de comandas no vuelve a arrancar
    ['RESTAURANTE', 'EQUIPO', 'FIREBASE', 'GUARNICIONES', 'MENU'].forEach(n =>
        comprobar('lleva ' + n, vm.runInContext(`typeof ${n} !== 'undefined'`, ctx2), true));

    const viejo = { R: vm.runInContext('Store.getConfig()', ctx), M: vm.runInContext('MENU', ctx) };
    const nuevo = { R: vm.runInContext('RESTAURANTE', ctx2),      M: vm.runInContext('MENU', ctx2) };

    const perdidos = [];
    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    Object.keys(viejo.R).forEach(k => {
        if (!igual(viejo.R[k], nuevo.R[k])) perdidos.push('RESTAURANTE.' + k);
    });

    let platos = 0;
    viejo.M.forEach((cat, i) => {
        const cat2 = nuevo.M[i];
        if (!cat2) { perdidos.push('categoría ' + cat.id); return; }
        Object.keys(cat).forEach(k => {
            if (k !== 'platos' && !igual(cat[k], cat2[k])) perdidos.push(`${cat.id}.${k}`);
        });
        cat.platos.forEach((p, j) => {
            platos++;
            const p2 = (cat2.platos || [])[j];
            if (!p2) { perdidos.push('plato ' + p.id); return; }
            Object.keys(p).forEach(k => {
                if (!igual(p[k], p2[k])) perdidos.push(`${cat.id}/${p.id}.${k}`);
            });
        });
    });

    comprobar(`no se pierde ningún campo (${platos} platos comparados)`, perdidos, []);
}

/* ============================================================
   PARTE 2 — LA LÓGICA DEL SERVICIO

   Se levantan varios "celulares", cada uno con su propio almacén y su
   propia cuenta, hablando contra una misma nube de mentira.
   ============================================================ */

let nube;
const nubeLimpia = () => { nube = { entrantes: {}, reclamados: new Set() }; };

function celular(rol) {
    const guardado = {};
    const propio = { enviado: [] };

    const SyncFalso = {
        activo: true,
        haySesion: () => true,
        correoSesion: () => rol + '@gmail.com',
        uidSesion: () => 'uid-' + rol,
        rolSesion: () => rol,
        escuchar: () => (() => {}),
        /* Copia y no el mismo objeto: cada celular recibe su propia
           respuesta, y lo que borra uno no desaparece del otro hasta
           que la nube se lo diga. Ahí es donde está la carrera. */
        leer: async rama =>
            (rama === 'servicio/entrantes' ? JSON.parse(JSON.stringify(nube.entrantes)) : undefined),
        guardar:  async (rama, valor) => { propio.enviado.push({ metodo: 'PUT',   rama, valor }); return true; },
        parchear: async (rama, valor) => { propio.enviado.push({ metodo: 'PATCH', rama, valor }); return true; },
        agregar:  async (rama, valor) => { propio.enviado.push({ metodo: 'POST',  rama, valor }); return true; },
        /* Lo que de verdad decide quién se queda con un pedido: las
           reglas solo dejan crear el nodo si todavía no existe. */
        reclamar: async rama => {
            if (nube.reclamados.has(rama)) return { ok: false, status: 401 };
            nube.reclamados.add(rama);
            return { ok: true, status: 200 };
        },
        ramaViva: () => true,
        desdeUltimoContacto: () => 0,
        fallo: () => ''
    };

    const ctx = vm.createContext({
        console, Date, Math, JSON, Promise,
        Sync: SyncFalso,
        setInterval: () => 0,
        setTimeout: (f, ms) => setTimeout(f, ms),
        clearTimeout: () => {},
        window: { addEventListener: () => {} },
        localStorage: {
            getItem: k => (k in guardado ? guardado[k] : null),
            setItem: (k, v) => { guardado[k] = String(v); },
            removeItem: k => { delete guardado[k]; }
        }
    });
    ['js/menu-data.js', 'js/store.js', 'js/servicio.js'].forEach(f => vm.runInContext(fuente(f), ctx));

    return { propio, corre: expr => vm.runInContext(expr, ctx) };
}

const respirar = () => new Promise(r => setTimeout(r, 20));

function probarMesaConDosSesiones() {
    console.log('\n--- Dos celulares abren la mesa 3 a la vez ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    corre(`localStorage.setItem('srv_sesiones', JSON.stringify({
        aaa: { id:'aaa', mesa:3, abierta:true, creado:1000, cerrado:null },
        zzz: { id:'zzz', mesa:3, abierta:true, creado:1005, cerrado:null } }));`);

    corre(`localStorage.setItem('srv_comandas', JSON.stringify({
        c1: { id:'c1', sesion:'aaa', mesa:3, tanda:0, creado:2000, estado:'nuevo',
              items:[{uid:'i1',platoId:'p5',nombre:'Pollo Asado',precio:3.5,cantidad:1,estacion:'asador'}] },
        c2: { id:'c2', sesion:'zzz', mesa:3, tanda:0, creado:2100, estado:'nuevo',
              items:[{uid:'i2',platoId:'p1',nombre:'Carne Asada',precio:3.5,cantidad:1,estacion:'asador'}] } }));`);

    comprobar('la cuenta de la mesa suma las dos sesiones', corre('Servicio.cuentaDeMesa(3).total'), 7);
    comprobar('se anota siempre en la sesión más vieja',    corre('Servicio.sesionDeMesa(3).id'), 'aaa');
    comprobar('la mesa reconoce sus dos sesiones',          corre('Servicio.sesionesAbiertasDeMesa(3).length'), 2);

    comprobar('la tanda nueva sigue la serie de la MESA',
        corre(`Servicio.enviarComanda({ mesa:3, items:[{platoId:'r1',nombre:'Arroz',precio:1.5,cantidad:1}] }).codigo`),
        'M3c · 1 Arroz');

    corre(`(() => { const c = Servicio.cuentaDeMesa(3);
        Servicio.registrarPago({ mesa:3, forma:'efectivo',
            lineas: c.items.map(l => ({ platoId:l.platoId, precio:l.precio, cantidad:l.pendiente })) }); })()`);

    comprobar('al pagar se cierran TODAS las sesiones', corre('Servicio.sesionesAbiertasDeMesa(3).length'), 0);
    comprobar('la mesa queda libre',                    corre('Servicio.sesionDeMesa(3)'), null);
}

async function probarDobleConfirmacion() {
    console.log('\n--- Dos celulares confirman el mismo pedido del comensal ---');
    nubeLimpia();
    nube.entrantes = { k1: { mesa: 5, creado: 1000, nota: '',
        items: [{ platoId: 'p5', nombre: 'Pollo Asado', precio: 3.5, cantidad: 2 }] } };

    const A = celular('mesero');
    const B = celular('gerente');
    A.corre('Servicio.iniciar(() => {})');
    B.corre('Servicio.iniciar(() => {})');
    await respirar();

    comprobar('los dos ven el pedido en la bandeja',
        [A.corre('Servicio.getEntrantes().length'), B.corre('Servicio.getEntrantes().length')], [1, 1]);

    const rA = await A.corre(`Servicio.confirmarEntrante('k1')`);
    const rB = await B.corre(`Servicio.confirmarEntrante('k1')`);

    comprobar('el primero crea la comanda',       !!(rA && rA.codigo), true);
    comprobar('al segundo le rebota, no duplica', !!(rB && rB.ocupado), true);
    comprobar('existe UNA sola comanda en total',
        [A.corre('Object.keys(Servicio.getComandas()).length'),
         B.corre('Object.keys(Servicio.getComandas()).length')], [1, 0]);
    comprobar('el pedido salió de las dos bandejas',
        [A.corre('Servicio.getEntrantes().length'), B.corre('Servicio.getEntrantes().length')], [0, 0]);

    console.log('\n--- Un celular toca Confirmar dos veces (la nube va lenta) ---');
    nubeLimpia();
    nube.entrantes = { k9: { mesa: 2, creado: 1000, nota: '',
        items: [{ platoId: 'p1', nombre: 'Carne Asada', precio: 3.5, cantidad: 1 }] } };

    const C = celular('mesero');
    C.corre('Servicio.iniciar(() => {})');
    await respirar();
    await C.corre(`Servicio.confirmarEntrante('k9')`);

    // La nube todavía no borró nada y vuelve a mandar el mismo pedido
    C.corre('Servicio.iniciar(() => {})');
    await respirar();

    comprobar('confirmado, ya no reaparece en la bandeja', C.corre('Servicio.getEntrantes().length'), 0);
    comprobar('el segundo toque no hace nada', await C.corre(`Servicio.confirmarEntrante('k9')`), null);
    comprobar('sigue habiendo una sola comanda', C.corre('Object.keys(Servicio.getComandas()).length'), 1);
}

async function probarEscrituras() {
    console.log('\n--- Lo que cada pantalla manda a la nube ---');
    nubeLimpia();
    const A = celular('mesero');
    A.corre(`Servicio.enviarComanda({ mesa:7, items:[{platoId:'p1',nombre:'Carne Asada',precio:3.5,cantidad:2}] })`);
    await respirar();

    const id = A.corre('Object.keys(Servicio.getComandas())[0]');
    comprobar('crear la comanda va como PUT del objeto entero',
        A.propio.enviado.filter(e => e.rama.indexOf('servicio/comandas') === 0).map(e => e.metodo), ['PUT']);

    const soloEsto = (accion, campos) => {
        A.propio.enviado.length = 0;
        A.corre(accion);
        return respirar().then(() => comprobar(
            accion.replace(/Servicio\.|\(.*/g, '') + ' manda solo ' + campos.join(' + '),
            A.propio.enviado.map(e => [e.metodo, Object.keys(e.valor).sort()]),
            [['PATCH', campos]]));
    };

    await soloEsto(`Servicio.marcarSacado('${id}', true)`, ['sacado']);
    await soloEsto(`Servicio.marcarEntregado('${id}')`,    ['entregado', 'estado']);
    await soloEsto(`Servicio.anularComanda('${id}', '')`,  ['anulado', 'estado', 'motivo']);
}

function probarPermisos() {
    console.log('\n--- Quién puede qué ---');
    nubeLimpia();
    const esperado = {
        gerente:  ['todo', 'todo', 'todo'],
        mesero:   ['todo', 'ver',  'ver' ],
        cocina:   ['no',   'todo', 'ver' ],
        parrilla: ['no',   'ver',  'todo'],
        intruso:  ['no',   'no',   'no'  ]     // una cuenta que no está en EQUIPO
    };
    Object.keys(esperado).forEach(rol => {
        const { corre } = celular(rol);
        comprobar(`${rol}: comanda / cocina / parrilla`,
            corre(`[Servicio.permisoEn('comanda'), Servicio.permisoEn('cocina'), Servicio.permisoEn('asador')]`),
            esperado[rol]);
    });
}

async function main() {
    probarExportacion();
    probarMesaConDosSesiones();
    await probarDobleConfirmacion();
    await probarEscrituras();
    probarPermisos();

    console.log(fallos ? `\n${fallos} comprobación(es) FALLARON. No subas todavía.` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
}

main();
