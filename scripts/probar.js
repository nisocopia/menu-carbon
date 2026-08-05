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
const nubeLimpia = () => { nube = { entrantes: {}, reclamados: new Set(), prohibido: null }; };

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
        /* La cola manda por aquí. `nube.prohibido` deja simular que las
           reglas rechazan algo, que es lo que pasa cuando un celular
           tiene encolado lo que anotó con otra cuenta. */
        enviar: async (rama, valor, metodo) => {
            if (nube.prohibido && nube.prohibido(rama, valor, metodo)) return { ok: false, status: 401 };
            propio.enviado.push({ metodo: metodo || 'PUT', rama, valor });
            return { ok: true, status: 200 };
        },
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

/* ============================================================
   LO QUE LA NUBE RECHAZA NO PUEDE TRABAR LA COLA

   Pasó de verdad: el celular tomó pedidos en comanda.html con la cuenta
   de la cocina, y esa cola vive en el navegador, no en la pantalla. Al
   abrir parrilla.html —mismo navegador, misma cola— la nube rechazaba
   esos pedidos una y otra vez. Como iban primeros, tapaban todo lo que
   venía detrás y la pantalla se quedaba en rojo para siempre.
   ============================================================ */

async function probarColaTrabada() {
    console.log('\n--- Algo que la nube rechaza, encolado antes que lo bueno ---');
    nubeLimpia();

    // Se rechaza lo que se refiera a esta comanda concreta
    nube.prohibido = rama => rama.indexOf('servicio/comandas/veneno') === 0;

    const A = celular('parrilla');
    A.corre(`localStorage.setItem('srv_cola', JSON.stringify([
        { rama:'servicio/comandas/veneno', valor:{ id:'veneno' }, metodo:'PUT', intentos:0 },
        { rama:'servicio/comandas/bueno',  valor:{ sacado:true }, metodo:'PATCH', intentos:0 }
    ]))`);

    A.corre('Servicio.vaciarCola()');
    await respirar();

    comprobar('la cola queda vacía, no trabada',      A.corre('Servicio.pendientes()'), 0);
    comprobar('lo bueno de atrás sí salió',
        A.propio.enviado.map(e => e.rama), ['servicio/comandas/bueno']);
    comprobar('lo rechazado se aparta, no se pierde',  A.corre('Servicio.apartadas()'), 1);
    comprobar('la pantalla puede volver a decir verde', A.corre('Servicio.hayLinea()'), true);

    // Y se puede resolver desde el celular
    A.corre('Servicio.descartarApartado()');
    comprobar('descartarlo lo deja en cero', A.corre('Servicio.apartadas()'), 0);

    // Sin permiso de por medio, un fallo de red SIGUE reintentándose
    nubeLimpia();
    nube.prohibido = () => false;
    const B = celular('mesero');
    B.corre(`localStorage.setItem('srv_cola', JSON.stringify([
        { rama:'servicio/comandas/x1', valor:{ id:'x1' }, metodo:'PUT', intentos:0 } ]))`);
    nube.prohibido = null;
    B.corre('Servicio.vaciarCola()');
    await respirar();
    comprobar('lo que sí puede salir, sale', B.corre('Servicio.pendientes()'), 0);
}

function probarPermisos() {
    console.log('\n--- Quién puede qué ---');
    nubeLimpia();
    const esperado = {
        gerente:  ['todo',   'todo', 'todo'],
        mesero:   ['todo',   'ver',  'ver' ],
        cocina:   ['no',     'todo', 'ver' ],
        parrilla: ['anotar', 'ver',  'todo'],   // anota pedidos, pero no cobra
        intruso:  ['no',     'no',   'no'  ]    // una cuenta que no está en EQUIPO
    };
    Object.keys(esperado).forEach(rol => {
        const { corre } = celular(rol);
        comprobar(`${rol}: comanda / cocina / parrilla`,
            corre(`[Servicio.permisoEn('comanda'), Servicio.permisoEn('cocina'), Servicio.permisoEn('asador')]`),
            esperado[rol]);
    });

    const A = celular('parrilla');
    comprobar('el asador puede anotar pero no cobrar',
        A.corre('[Servicio.puedeAnotar(), Servicio.puedeCobrar()]'), [true, false]);

    const B = celular('cocina');
    comprobar('la cocina no anota ni cobra',
        B.corre('[Servicio.puedeAnotar(), Servicio.puedeCobrar()]'), [false, false]);
}

/* ============================================================
   PEDIDOS PARA LLEVAR CON NOMBRE
   ============================================================ */

function probarParaLlevar() {
    console.log('\n--- Pedidos para llevar ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    const c1 = corre(`Servicio.enviarComanda({ mesa: 0, nombre: 'Carlos',
        items: [{ platoId:'p5', nombre:'Pollo Asado', precio:3.5, cantidad:2, llevar:true }] })`);
    const c2 = corre(`Servicio.enviarComanda({ mesa: 0, nombre: 'Luis',
        items: [{ platoId:'p1', nombre:'Carne Asada', precio:3.5, cantidad:1, llevar:true }] })`);

    comprobar('cada nombre abre su propia cuenta', c1.sesion !== c2.sesion, true);
    comprobar('los dos siguen abiertos y con su nombre',
        corre(`Servicio.llevarAbiertos().map(s => s.nombre)`), ['Carlos', 'Luis']);

    // Antes todos caían en la misma cuenta: la de Carlos traía lo de Luis
    comprobar('la cuenta de Carlos NO incluye lo de Luis',
        corre(`Servicio.cuentaDe({ sesion: '${c1.sesion}' }).total`), 7.5);   // 2 pollos + 2 tarrinas

    comprobar('la segunda tanda de Carlos va a su cuenta',
        corre(`Servicio.enviarComanda({ mesa: 0, nombre: 'carlos',
            items: [{ platoId:'b3', nombre:'Cola personal', precio:0.5, cantidad:1 }] }).sesion`),
        c1.sesion);

    comprobar('y su código sigue la serie', corre(`Servicio.tandasDe({ sesion: '${c1.sesion}' })[1].codigo`),
        'LLb · 1 Cola personal');

    comprobar('el nombre viaja en la comanda, no solo en la sesión', c1.nombre, 'Carlos');

    // Cobrar uno no toca al otro
    corre(`(() => { const c = Servicio.cuentaDe({ sesion: '${c1.sesion}' });
        Servicio.registrarPago({ sesion: '${c1.sesion}', forma:'efectivo',
            lineas: c.items.map(l => ({ platoId:l.platoId, precio:l.precio, cantidad:l.pendiente })) }); })()`);

    comprobar('cobrar a Carlos deja a Luis abierto',
        corre(`Servicio.llevarAbiertos().map(s => s.nombre)`), ['Luis']);
}

/* ============================================================
   LA TARRINA
   ============================================================ */

function probarTarrina() {
    console.log('\n--- La tarrina se pone sola ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    const total = its => corre(`(() => {
        const it = ${JSON.stringify(its)};
        Servicio.ajustarTarrinas(it);
        return [it.reduce((s,x) => s + x.precio*x.cantidad, 0), Servicio.tarrinasDe(it)];
    })()`);

    comprobar('2 pollos para llevar: 2 tarrinas',
        total([{ platoId: 'p5', nombre: 'Pollo', precio: 3.5, cantidad: 2, llevar: true }]), [7.5, 2]);

    comprobar('en la mesa no se cobra tarrina',
        total([{ platoId: 'p5', nombre: 'Pollo', precio: 3.5, cantidad: 2, llevar: false }]), [7, 0]);

    comprobar('la chuleta no lleva tarrina, aunque se la lleven',
        total([{ platoId: 'p2', nombre: 'Chuleta', precio: 4, cantidad: 1, llevar: true }]), [4, 0]);

    comprobar('el junior sí lleva',
        total([{ platoId: 'j1', nombre: 'Junior de Pollo', precio: 2.5, cantidad: 1, llevar: true }]), [2.75, 1]);

    comprobar('una cola para llevar no lleva tarrina',
        total([{ platoId: 'b3', nombre: 'Cola', precio: 0.5, cantidad: 3, llevar: true }]), [1.5, 0]);

    // Recalcular no debe acumular: es el error clásico de sumar en vez de rehacer
    const dosVeces = corre(`(() => {
        const it = [{ platoId:'p5', nombre:'Pollo', precio:3.5, cantidad:1, llevar:true }];
        Servicio.ajustarTarrinas(it); Servicio.ajustarTarrinas(it); Servicio.ajustarTarrinas(it);
        return it.filter(x => x.platoId === 't1').length;
    })()`);
    comprobar('recalcular tres veces deja UNA línea de tarrina', dosVeces, 1);

    // Y la tarrina no le llega a ninguna estación
    comprobar('la tarrina no va a la parrilla ni a la cocina',
        corre(`Servicio.estacionDe('t1')`), 'barra');
}

/* ============================================================
   EL MINUTO DE GRACIA Y LA ANULACIÓN
   ============================================================ */

function probarEdicion() {
    console.log('\n--- Hasta cuándo se puede tocar una tanda ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    const c = corre(`Servicio.enviarComanda({ mesa: 4, items: [
        { platoId:'p5', nombre:'Pollo Asado', precio:3.5, cantidad:1 }] })`);

    comprobar('recién enviada se puede tocar entera', corre(`Servicio.edicionDe(Servicio.getComandas()['${c.id}'])`), 'todo');
    comprobar('y queda cuenta regresiva', corre(`Servicio.graciaRestante(Servicio.getComandas()['${c.id}']) > 55`), true);

    // Se envejece la comanda a mano: pasó el minuto
    corre(`(() => { const t = Servicio.getComandas();
        t['${c.id}'].creado = Date.now() - 90000;
        localStorage.setItem('srv_comandas', JSON.stringify(t)); })()`);

    comprobar('pasado el minuto, solo agregados',
        corre(`Servicio.edicionDe(Servicio.getComandas()['${c.id}'])`), 'agregados');

    comprobar('la cola se puede agregar siempre',      corre(`Servicio.editableSiempre('b3')`), true);
    comprobar('el arroz suelto también',               corre(`Servicio.editableSiempre('r1')`), true);
    comprobar('la porción de proteína NO',             corre(`Servicio.editableSiempre('q1')`), false);
    comprobar('el pollo asado NO',                     corre(`Servicio.editableSiempre('p5')`), false);
    comprobar('una bebida de la tienda sí',            corre(`Servicio.editableSiempre('x123')`), true);

    // Anular: se puede hasta que alguien la toque
    comprobar('todavía se puede anular', corre(`Servicio.puedeAnular(Servicio.getComandas()['${c.id}']).ok`), true);

    corre(`Servicio.marcarSacado('${c.id}', true)`);
    const bloqueada = corre(`Servicio.puedeAnular(Servicio.getComandas()['${c.id}'])`);
    comprobar('si el asador ya la sacó, no se anula', bloqueada.ok, false);
    comprobar('y dice con quién hablar', /asador/i.test(bloqueada.motivo), true);

    corre(`Servicio.marcarSacado('${c.id}', false)`);
    corre(`Servicio.marcarEntregado('${c.id}')`);
    comprobar('si la cocina ya entregó, tampoco',
        corre(`Servicio.puedeAnular(Servicio.getComandas()['${c.id}']).ok`), false);

    // Editar conserva identidad
    nubeLimpia();
    const B = celular('mesero');
    const c2 = B.corre(`Servicio.enviarComanda({ mesa: 6, items: [
        { platoId:'p5', nombre:'Pollo Asado', precio:3.5, cantidad:1 }] })`);
    const editada = B.corre(`Servicio.editarComanda('${c2.id}', [
        { platoId:'p2', nombre:'Chuleta', precio:4, cantidad:2 }])`);

    comprobar('editar conserva el id',      editada.id, c2.id);
    comprobar('editar conserva la tanda',   editada.tanda, c2.tanda);
    comprobar('y rehace el código',         editada.codigo, 'M6 · 2CH');
    comprobar('los platos nuevos traen su estación',
        editada.items.map(i => i.estacion), ['asador']);
}

/* ============================================================
   CAMBIO DE MESA
   ============================================================ */

function probarMoverMesa() {
    console.log('\n--- Cambiar de mesa ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    corre(`Servicio.enviarComanda({ mesa: 5, items: [{ platoId:'p5', nombre:'Pollo', precio:3.5, cantidad:2 }] })`);
    corre(`Servicio.enviarComanda({ mesa: 5, items: [{ platoId:'r1', nombre:'Arroz', precio:1.5, cantidad:1 }] })`);

    comprobar('la mesa 5 tiene dos tandas', corre(`Servicio.tandasDe({ mesa: 5 }).length`), 2);

    const ocupada = corre(`(() => { Servicio.enviarComanda({ mesa: 2,
        items: [{ platoId:'p1', nombre:'Carne', precio:3.5, cantidad:1 }] });
        return Servicio.moverMesa(5, 2); })()`);
    comprobar('no deja mover a una mesa ocupada', ocupada.ok, false);
    comprobar('y explica por qué', /ocupada/i.test(ocupada.motivo), true);

    comprobar('mover a una libre funciona', corre(`Servicio.moverMesa(5, 9).ok`), true);
    comprobar('la 5 queda libre',           corre(`Servicio.sesionDeMesa(5)`), null);
    comprobar('la cuenta se fue entera',    corre(`Servicio.cuentaDe({ mesa: 9 }).total`), 8.5);
    // El pollo lleva sigla (PO); el arroz no, y sale con su nombre
    comprobar('los códigos se rehacen',     corre(`Servicio.tandasDe({ mesa: 9 }).map(c => c.codigo)`),
        ['M9 · 2PO', 'M9b · 1 Arroz']);
    comprobar('sin perder ninguna tanda',   corre(`Servicio.tandasDe({ mesa: 9 }).length`), 2);
}

/* ============================================================
   LA COCINA MARCA PLATO POR PLATO
   ============================================================ */

function probarChecklist() {
    console.log('\n--- La cocina marca plato por plato ---');
    nubeLimpia();
    const { corre, propio } = celular('cocina');

    // Se mete una comanda como si hubiera llegado de la nube
    corre(`localStorage.setItem('srv_comandas', JSON.stringify({ k1: {
        id:'k1', sesion:'s1', mesa:3, tanda:0, creado: Date.now(), estado:'nuevo', sacado:false,
        codigo:'M3 · 1PO 4CH',
        items: [
            { uid:'i1', platoId:'p5', nombre:'Pollo Asado', cantidad:1, precio:3.5, estacion:'asador' },
            { uid:'i2', platoId:'p2', nombre:'Chuleta',     cantidad:4, precio:4,   estacion:'asador' }
        ] } }))`);

    const c = () => corre(`Servicio.getComandas()['k1']`);

    comprobar('al principio no está listo',   corre(`Servicio.todoListo(Servicio.getComandas()['k1'])`), false);

    corre(`Servicio.marcarListo('k1', 'i1', 1)`);
    comprobar('el pollo queda marcado',       corre(`Servicio.listasDe(Servicio.getComandas()['k1'], 'i1')`), 1);
    comprobar('pero la chuleta falta',        corre(`Servicio.todoListo(Servicio.getComandas()['k1'])`), false);

    corre(`Servicio.marcarListo('k1', 'i2', 3)`);
    comprobar('3 de 4 chuletas: aún no',      corre(`Servicio.todoListo(Servicio.getComandas()['k1'])`), false);

    corre(`Servicio.marcarListo('k1', 'i2', 4)`);
    comprobar('con las 4, ya está todo',      corre(`Servicio.todoListo(Servicio.getComandas()['k1'])`), true);

    // Destocar vuelve atrás
    corre(`Servicio.marcarListo('k1', 'i2', 2)`);
    comprobar('destocar vuelve a bloquear',   corre(`Servicio.todoListo(Servicio.getComandas()['k1'])`), false);

    comprobar('no se puede marcar más de lo que hay',
        corre(`(() => { Servicio.marcarListo('k1','i2', 99);
                        return Servicio.listasDe(Servicio.getComandas()['k1'],'i2'); })()`), 4);

    comprobar('a la nube solo va la rama listos',
        [...new Set(propio.enviado.map(e => e.rama))], ['servicio/comandas/k1/listos']);
    comprobar('y siempre por PATCH',
        [...new Set(propio.enviado.map(e => e.metodo))], ['PATCH']);
}

/* ============================================================
   LA PANTALLA DE TOMAR PEDIDO

   Hasta ahora solo se probaba la lógica. Esta parte levanta comanda.js
   con un DOM de mentira y repite los toques del mesero, porque el peor
   fallo que ha tenido este sistema no estaba en las cuentas sino en el
   dibujo: la línea de la tarrina se sacaba y se volvía a poner al final
   en cada plato nuevo, así que las filas de abajo subían un renglón
   justo mientras el dedo bajaba — y el toque terminaba en el "−" de
   otro plato, que lo borraba.

   Lo que se comprueba es simple y es lo que importa: que una fila que
   ya está NUNCA se mueva de sitio.
   ============================================================ */

function pantallaComanda() {
    const guardado = {};
    const elementos = {};

    const nodo = id => elementos[id] || (elementos[id] = {
        id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
        dataset: {}, style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {}, focus() {}, closest: () => null, querySelectorAll: () => []
    });

    const ctx = vm.createContext({
        console, Date, Math, JSON, Promise, Number, String, Array, Object, isNaN, parseFloat, parseInt,
        Sync: {
            activo: true, haySesion: () => true, correoSesion: () => 'mesa@gmail.com',
            uidSesion: () => 'u', rolSesion: () => 'mesero',
            escuchar: () => (() => {}), leer: async () => undefined,
            guardar: async () => true, parchear: async () => true, agregar: async () => true,
            reclamar: async () => ({ ok: true, status: 200 }),
            enviar: async () => ({ ok: true, status: 200 }),
            ramaViva: () => true, desdeUltimoContacto: () => 0, fallo: () => '',
            salir() {}, entrar: async () => ({})
        },
        document: { getElementById: nodo, addEventListener() {}, querySelectorAll: () => [],
                    createElement: () => nodo('tmp') },
        window: { addEventListener() {}, scrollTo() {} },
        setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
        confirm: () => true, alert() {}, prompt: () => '',
        localStorage: {
            getItem: k => (k in guardado ? guardado[k] : null),
            setItem: (k, v) => { guardado[k] = String(v); },
            removeItem: k => { delete guardado[k]; }
        }
    });

    ['js/menu-data.js', 'js/store.js', 'js/servicio.js', 'js/comanda.js']
        .forEach(f => vm.runInContext(fuente(f), ctx));
    vm.runInContext('CFG = Store.getConfig()', ctx);

    return { nodo, corre: e => vm.runInContext(e, ctx) };
}

function probarTomarPedido() {
    console.log('\n--- Tomando un pedido para llevar en la pantalla ---');
    const { nodo, corre } = pantallaComanda();

    corre('verLlevarNuevo()');

    comprobar('el pie sale de una, para poder escribir el nombre', nodo('pie-mesa').hidden, false);
    comprobar('y pide el nombre antes que nada',
        /Escribe el nombre/.test(nodo('btn-enviar').innerHTML), true);

    const filas = () => corre(`borrador.map(i => i.nombre)`);
    const platos = ['p5', 'p1', 'p2', 'p3', 'b3', 'r1'];
    const esperado = [];
    let estable = true;

    platos.forEach(id => {
        const antes = filas();
        corre(`agregarAlBorrador(Store.findPlato('${id}'), 1)`);
        const ahora = filas();
        // Lo que ya estaba tiene que seguir en el mismo orden y sitio
        if (JSON.stringify(ahora.slice(0, antes.length)) !== JSON.stringify(antes)) estable = false;
        esperado.push(Store_nombre(corre, id));
    });

    comprobar('ninguna fila se mueve de sitio al agregar', estable, true);
    comprobar('están los 6 platos y ninguno se borró', filas().length, 6);
    comprobar('en el orden en que se tocaron', filas(), esperado);

    // La tarrina se ve pero no vive en el borrador: si viviera, volvería
    // a reordenar la lista en cada plato nuevo.
    comprobar('la tarrina NO está en el borrador',
        corre(`borrador.some(i => i.platoId === 't1')`), false);
    comprobar('pero sí se ve en la lista',
        /Tarrina/.test(nodo('borrador').innerHTML), true);

    // 1 pollo (0.25) + 1 carne (0.25) = 2 tarrinas. El resto no lleva.
    const suma = 3.5 + 3.5 + 4 + 5.5 + 0.5 + 1.5 + 0.5;
    comprobar('y sí se cobra en el total', nodo('borrador-total').textContent, '$' + suma.toFixed(2));

    comprobar('sin nombre no deja enviar', nodo('btn-enviar').disabled, true);
    corre(`nombreLlevar = 'Carlos'; pintarPie()`);
    comprobar('con nombre ya dice Enviar',
        /Enviar/.test(nodo('btn-enviar').innerHTML) && !nodo('btn-enviar').disabled, true);

    corre('enviar()');
    const c = corre('Object.values(Servicio.getComandas())[0]');
    comprobar('la comanda sale con el nombre', c.nombre, 'Carlos');
    comprobar('y con sus 2 tarrinas',
        (c.items.find(i => i.platoId === 't1') || {}).cantidad, 2);
    comprobar('todo lo del pedido va marcado para llevar',
        c.items.every(i => i.llevar), true);
}

const Store_nombre = (corre, id) => corre(`Store.findPlato('${id}').nombre`);

async function main() {
    probarExportacion();
    probarMesaConDosSesiones();
    await probarDobleConfirmacion();
    await probarEscrituras();
    await probarColaTrabada();
    probarPermisos();
    probarParaLlevar();
    probarTarrina();
    probarEdicion();
    probarMoverMesa();
    probarChecklist();
    probarTomarPedido();

    console.log(fallos ? `\n${fallos} comprobación(es) FALLARON. No subas todavía.` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
}

main();
