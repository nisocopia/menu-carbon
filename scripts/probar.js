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
const existe = f => fs.existsSync(path.join(RAIZ, f));

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
const nubeLimpia = () => {
    nube = { entrantes: {}, reclamados: new Set(), prohibido: null, caida: false };
};

function celular(rol) {
    const guardado = {};
    const propio = { enviado: [] };

    const SyncFalso = {
        activo: true,
        haySesion: () => true,
        correoSesion: () => rol + '@gmail.com',
        uidSesion: () => 'uid-' + rol,
        rolSesion: () => rol,
        /* Se guarda el aviso para poder devolverle el eco: la nube repite
           a todos —incluido a quien escribió— lo que se acaba de guardar,
           y ahí es donde se rompían los vistos de la cocina. Sin esto las
           pruebas nunca veían la mitad de la conversación. */
        escuchar: (rama, avisar) => { propio.avisar = avisar; return () => {}; },
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
            // Sin señal: no es que no se pueda, es que no llega. Se reintenta.
            if (nube.caida) return { ok: false, status: 0 };
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

    const corre = expr => vm.runInContext(expr, ctx);

    /**
     * Lo que la nube le grita de vuelta a este celular.
     *
     *   eco('/k1/listos', { i1: 1 }, true)   solo cambió eso  (patch)
     *   eco('/k1', {...}, false)             esto es todo lo que hay (put)
     */
    const eco = (ruta, dato, esRetoque) => {
        if (propio.avisar) propio.avisar(dato, ruta, esRetoque);
    };

    return { propio, corre, eco };
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
        gerente:  ['todo',   'todo', 'todo', 'ver'],
        mesero:   ['todo',   'ver',  'ver',  'ver'],
        cocina:   ['no',     'todo', 'ver',  'ver'],
        parrilla: ['anotar', 'ver',  'todo', 'ver'],  // anota pedidos, pero no cobra
        // El que sirve entra a la suya y a ninguna otra: lleva las manos
        // ocupadas y el pedido no es suyo.
        servir:   ['no',     'no',   'no',   'ver'],
        intruso:  ['no',     'no',   'no',   'no' ]   // una cuenta que no está en EQUIPO
    };
    Object.keys(esperado).forEach(rol => {
        const { corre } = celular(rol);
        comprobar(`${rol}: comanda / cocina / parrilla / servir`,
            corre(`[Servicio.permisoEn('comanda'), Servicio.permisoEn('cocina'),
                    Servicio.permisoEn('asador'), Servicio.permisoEn('servir')]`),
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

/**
 * Deja en el celular una comanda de la mesa 3 —1 pollo y 4 chuletas—
 * como si hubiera llegado de la nube. Son 15,50 en total.
 */
function sembrarComanda(corre, extra) {
    const comandas = { k1: Object.assign({
        id: 'k1', sesion: 's1', mesa: 3, tanda: 0, creado: Date.now(),
        estado: 'nuevo', sacado: false, codigo: 'M3 · 1PO 4CH',
        items: [
            { uid: 'i1', platoId: 'p5', nombre: 'Pollo Asado', cantidad: 1, precio: 3.5, estacion: 'asador' },
            { uid: 'i2', platoId: 'p2', nombre: 'Chuleta',     cantidad: 4, precio: 4,   estacion: 'asador' }
        ] }, extra || {}) };
    corre(`localStorage.setItem('srv_comandas', ${JSON.stringify(JSON.stringify(comandas))})`);
}

function probarChecklist() {
    console.log('\n--- La cocina marca plato por plato ---');
    nubeLimpia();
    const { corre, propio } = celular('cocina');
    sembrarComanda(corre);

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
   AGREGARLE ALGO A UNA TANDA QUE YA ESTÁ EN MARCHA

   Pasado el minuto, el ticket ya lo contaron en la parrilla y en la
   cocina. Meterle una línea encima es hacer crecer un papel que alguien
   tiene en la mano a media faena. Sale como tanda nueva y hace su turno
   al final, como en el cuaderno: primero en entrar, primero en salir.

   El caso de la casa: la mesa 5 pide 4 chuletas, la mesa 4 pide 2
   pollos, y la mesa 5 llama para una chuleta más. Esa chuleta va
   tercera, y va sola.
   ============================================================ */

async function probarAgregarATandaEnMarcha() {
    console.log('\n--- Una chuleta más para la mesa 5, con la parrilla ya trabajando ---');
    const { corre } = pantallaComanda();

    corre(`verMesa(5)`);
    corre(`agregarAlBorrador(Store.findPlato('p2'), 4)`);   // 4 chuletas
    corre(`agregarAlBorrador(Store.findPlato('r1'), 1)`);   // y un arroz
    await corre.esperando(`enviar()`);

    corre(`verMesa(4)`);
    corre(`agregarAlBorrador(Store.findPlato('p5'), 2)`);   // 2 pollos
    await corre.esperando(`enviar()`);

    // Se envejecen las dos: ya pasó el minuto de gracia de las dos
    corre(`(() => {
        const t = Servicio.getComandas();
        Object.values(t).forEach(c => { c.creado = Date.now() - (c.mesa === 5 ? 180000 : 120000); });
        localStorage.setItem('srv_comandas', JSON.stringify(t));
    })()`);

    const idMesa5 = corre(`Object.values(Servicio.getComandas()).find(c => c.mesa === 5).id`);

    corre(`verMesa(5)`);
    corre(`abrirEdicion('${idMesa5}')`);
    comprobar('la tanda en marcha se abre para agregar, no para rehacer',
        corre(`editandoTanda.modo`), 'agregados');

    corre(`agregarAlBorrador(Store.findPlato('p2'), 1)`);   // la chuleta que llamaron a pedir
    comprobar('y se avisa en la pantalla antes de enviar',
        corre(`vaAparte(borrador[borrador.length - 1])`), true);

    await corre.esperando(`enviar()`);

    const cola = corre(`Servicio.comandasDe('asador')
        .map((c, i) => (i + 1) + '. ' + c.codigo)`);
    comprobar('la parrilla las ve en el orden en que entraron', cola,
        ['1. M5 · 4CH 1 Arroz', '2. M4 · 2PO', '3. M5b · 1CH']);

    const deMesa5 = corre(`Servicio.tandasDe({ mesa: 5 })
        .map(c => c.codigo + ': ' + c.items.map(i => i.cantidad + ' ' + i.nombre).join(' + '))`);
    comprobar('la tanda de antes se queda como estaba', deMesa5[0], 'M5 · 4CH 1 Arroz: 4 Chuleta + 1 Arroz');
    comprobar('y la nueva lleva solo lo que se agregó', deMesa5[1], 'M5b · 1CH: 1 Chuleta');

    comprobar('las dos se cobran en la misma cuenta',
        corre(`Servicio.cuentaDe({ mesa: 5 }).total`), 21.5);

    /* Un arroz más no se le suma al arroz que la cocina ya tiene contado:
       ese ticket está en la mano de alguien. Hace su propia línea. */
    corre(`abrirEdicion('${idMesa5}')`);
    corre(`agregarAlBorrador(Store.findPlato('r1'), 1)`);
    comprobar('un arroz más no engorda el que ya está cocinándose',
        corre(`borrador.filter(i => i.platoId === 'r1').map(i => i.cantidad)`), [1, 1]);
    comprobar('y también sale como tanda nueva',
        corre(`vaAparte(borrador[borrador.length - 1])`), true);
    corre(`cancelarEdicion()`);

    /* Una bebida no pasa por ninguna pantalla: abrirle una tanda nueva
       solo sería un código más que leer. Se queda donde está. */
    corre(`abrirEdicion('${idMesa5}')`);
    corre(`agregarAlBorrador(Store.findPlato('b3'), 1)`);   // cola personal
    comprobar('una bebida no abre tanda nueva',
        corre(`vaAparte(borrador[borrador.length - 1])`), false);
    await corre.esperando(`enviar()`);

    comprobar('la cola entra en la tanda de siempre',
        corre(`Servicio.tandasDe({ mesa: 5 }).length`), 2);
    comprobar('y se cobra igual',
        corre(`Servicio.cuentaDe({ mesa: 5 }).total`), 22);

    // Abrir una tanda, mirarla y cerrarla no es corregirla
    const antes = corre(`Servicio.getComandas()['${idMesa5}'].editado`);
    corre(`abrirEdicion('${idMesa5}')`);
    await corre.esperando(`enviar()`);
    comprobar('mirar una tanda sin tocarla no la marca como corregida',
        corre(`Servicio.getComandas()['${idMesa5}'].editado`), antes);
}

/* ============================================================
   CADA CAMPO CON SU LLAVE

   En Firebase el permiso no baja del padre a las hijas, pero un campo
   SIN regla propia acaba pidiendo la del padre — y la del padre, en una
   comanda que ya existe, es solo del gerente. Como un envío es todo o
   nada, basta un campo sin llave para tumbar la corrección entera.

   Eso le pasaba al mesero: corregía una bebida, se reenviaba la nota
   sin haberla tocado, y le salía "con esa cuenta no va a salir".

   Aquí se leen las reglas de verdad, campo por campo, y se comprueba
   que quien manda cada uno pueda mandarlo. Los uid salen de EQUIPO en
   menu-data.js, que ya los tiene: no se repiten aquí.
   ============================================================ */

function llavesDeComanda() {
    const campos = JSON.parse(fuente('firebase-rules.json'))
                       .rules.servicio.comandas.$comanda;

    const ctx = vm.createContext({ console });
    vm.runInContext(fuente('js/menu-data.js'), ctx);
    const equipo = vm.runInContext('EQUIPO', ctx);            // uid -> rol
    const uidDe = rol => Object.keys(equipo).find(u => equipo[u] === rol);

    return (campo, rol) => {
        const regla = (campos[campo] && campos[campo]['.write']) || '';
        return regla.includes(uidDe(rol));
    };
}

/** Qué manda cada pantalla sobre una comanda que YA existe. */
const MANDA = {
    items:     ['mesero', 'parrilla'],              // corregir los platos
    cubiertos: ['mesero', 'parrilla'],
    codigo:    ['mesero', 'parrilla'],
    editado:   ['mesero', 'parrilla'],
    nota:      ['mesero', 'parrilla'],
    mesa:      ['mesero'],                          // cambio de mesa
    nombre:    ['mesero'],                          // al pasar a para llevar
    anulado:   ['mesero', 'parrilla'],
    motivo:    ['mesero', 'parrilla'],
    estado:    ['mesero', 'parrilla', 'cocina'],
    entregado: ['cocina'],
    sacado:    ['parrilla'],
    listos:    ['cocina']
};

function probarLlavesDeCampos() {
    console.log('\n--- Cada campo que se manda tiene su llave ---');
    const puede = llavesDeComanda();

    Object.keys(MANDA).forEach(campo => {
        // El gerente manda en todo, siempre
        const sinLlave = ['gerente'].concat(MANDA[campo]).filter(rol => !puede(campo, rol));
        comprobar(`"${campo}" lo puede mandar quien lo manda`, sinLlave, []);
    });
}

/* ============================================================
   EL MESERO CORRIGE UNA TANDA QUE EL ASADOR YA SACÓ
   ============================================================ */

async function probarCorreccionDelMesero() {
    console.log('\n--- El mesero cambia el jugo por una cola ---');
    nubeLimpia();
    const puede = llavesDeComanda();
    const { corre, propio } = celular('mesero');

    // Una tanda con su bebida, y el asador ya la sacó de la parrilla
    sembrarComanda(corre, { sacado: true });
    corre(`(() => {
        const t = Servicio.getComandas();
        t.k1.items.push({ uid:'i3', platoId:'b1', nombre:'Jugo', cantidad:1, precio:1.5, estacion:'barra' });
        localStorage.setItem('srv_comandas', JSON.stringify(t));
    })()`);

    corre(`Servicio.editarComanda('k1', [
        { platoId:'p5', nombre:'Pollo Asado', cantidad:1, precio:3.5 },
        { platoId:'p2', nombre:'Chuleta',     cantidad:4, precio:4   },
        { platoId:'b3', nombre:'Cola 1L',     cantidad:1, precio:2   }
    ])`);
    await respirar();

    comprobar('la corrección sale', propio.enviado.length, 1);

    const mandados = Object.keys((propio.enviado[0] || {}).valor || {});
    comprobar('y no manda ningún campo que no sea suyo',
        mandados.filter(campo => !puede(campo, 'mesero')), []);
    comprobar('la nota no se reenvía sin haberla tocado',
        mandados.includes('nota'), false);

    comprobar('el jugo ya no está',
        corre(`Servicio.getComandas()['k1'].items.some(i => i.nombre === 'Jugo')`), false);
    comprobar('y la cola sí',
        corre(`Servicio.getComandas()['k1'].items.some(i => i.nombre === 'Cola 1L')`), true);
    comprobar('el asador conserva su "ya lo saqué"',
        corre(`Servicio.getComandas()['k1'].sacado`), true);

    // Si de verdad se escribe una nota, esa sí tiene que salir
    corre(`Servicio.editarComanda('k1', Servicio.getComandas()['k1'].items, 'sin cebolla')`);
    await respirar();
    comprobar('pero una nota nueva sí sale',
        Object.keys(propio.enviado[1].valor).includes('nota'), true);
    comprobar('y sigue sin mandar nada ajeno',
        Object.keys(propio.enviado[1].valor).filter(c => !puede(c, 'mesero')), []);
}

/* ============================================================
   EL ECO DE LA NUBE

   Firebase le repite a todo el mundo —al que escribió también— lo que
   se acaba de guardar, y lo hace de dos maneras muy parecidas:

     put    "en este sitio hay ESTO"        lo de antes se tira
     patch  "en este sitio cambió ESTO"     el resto sigue donde estaba

   Se estaban tratando igual, así que cada patch borraba todo lo que la
   nube no repitió en el aviso. Se veía en la cocina: marcabas la
   chuleta y el visto del pollo se apagaba solo, sin que nadie lo
   tocara. Y en silencio pasaba algo peor — al marcar ENTREGADO la
   comanda se quedaba sin platos y sin mesa en el celular del mesero,
   así que esa tanda desaparecía de la cuenta y se cobraba de menos.

   Ninguna prueba lo veía porque la nube de mentira nunca devolvía el
   eco: solo se probaba la mitad de la conversación.
   ============================================================ */

function probarEcoDeLaNube() {
    console.log('\n--- Lo que la nube devuelve no puede borrar lo que ya había ---');
    nubeLimpia();
    const { corre, eco } = celular('cocina');
    sembrarComanda(corre);
    corre(`Servicio.iniciar(() => {}, 'estacion')`);

    const comanda = campo => corre(`JSON.stringify(Servicio.getComandas()['k1'].${campo})`);

    /* La cocina marca, y la nube le devuelve cada marca por separado.
       Ese ir y venir es el orden real de las cosas. */
    corre(`Servicio.marcarListo('k1', 'i1', 1)`);   eco('/k1/listos', { i1: 1 }, true);
    corre(`Servicio.marcarListo('k1', 'i2', 1)`);   eco('/k1/listos', { i2: 1 }, true);
    corre(`Servicio.marcarListo('k1', 'i2', 2)`);   eco('/k1/listos', { i2: 2 }, true);

    comprobar('marcar la chuleta no apaga el pollo',
        JSON.parse(comanda('listos')), { i1: 1, i2: 2 });

    corre(`Servicio.marcarListo('k1', 'i2', 4)`);   eco('/k1/listos', { i2: 4 }, true);
    comprobar('con todo marcado, ENTREGADO se enciende',
        corre(`Servicio.todoListo(Servicio.getComandas()['k1'])`), true);

    // Destocar sí tiene que quitarlo: la nube manda el campo en null
    eco('/k1/listos', { i1: null }, true);
    comprobar('y un visto quitado se quita de verdad',
        JSON.parse(comanda('listos')), { i2: 4 });

    /* ENTREGADO manda dos campos sobre la comanda entera. Antes esto la
       dejaba valiendo solo esos dos campos. */
    eco('/k1', { estado: 'entregado', entregado: 1700000000000 }, true);

    comprobar('al entregar, el estado cambia',      JSON.parse(comanda('estado')), 'entregado');
    comprobar('pero la comanda conserva sus platos', corre(`Servicio.getComandas()['k1'].items.length`), 2);
    comprobar('y su mesa',                           corre(`Servicio.getComandas()['k1'].mesa`), 3);
    comprobar('y sigue pegada a su cuenta',          JSON.parse(comanda('sesion')), 's1');
    comprobar('así que se cobra completa',           corre(`Servicio.cuentaDeSesion('s1').total`), 19.5);

    // Un aviso completo sobre un campo suelto sigue reemplazando ese campo
    eco('/k1/estado', 'nuevo', false);
    comprobar('un aviso completo sí reemplaza',     JSON.parse(comanda('estado')), 'nuevo');
    comprobar('y tampoco se lleva los platos',       corre(`Servicio.getComandas()['k1'].items.length`), 2);

    // Al reconectar llega la rama entera de una vez
    eco('/', { k2: { id: 'k2', sesion: 's2', mesa: 5, estado: 'nuevo', creado: 2, items: [] } }, false);
    comprobar('al reconectar no se pierde lo que había',
        corre(`Object.keys(Servicio.getComandas()).sort().join(',')`), 'k1,k2');
}

/* ============================================================
   OCHO TOQUES, UN ENVÍO

   Cada visto salía en su propio envío. Con la red del local eso son
   ocho viajes que llegan cuando quieren, y basta con que uno se pierda
   para que la pantalla y la nube dejen de contar lo mismo. Si lo que
   aún espera va al mismo sitio, se junta y sale de una vez.
   ============================================================ */

async function probarEnviosJuntos() {
    console.log('\n--- Varios vistos seguidos salen en un solo envío ---');
    nubeLimpia();
    nube.caida = true;                    // sin señal: nada sale, todo espera
    const { corre, propio } = celular('cocina');
    sembrarComanda(corre);

    const toques = [['i1', 1], ['i2', 1], ['i2', 2], ['i2', 3], ['i2', 4]];
    for (const [uid, n] of toques) {
        corre(`Servicio.marcarListo('k1', '${uid}', ${n})`);
        await respirar();                 // una persona tocando, no un bucle
    }

    comprobar('los cinco toques esperan juntos', corre(`Servicio.pendientes()`), 1);
    comprobar('sin señal no salió ninguno',      propio.enviado.length, 0);
    comprobar('pero en pantalla están puestos',
        corre(`Servicio.todoListo(Servicio.getComandas()['k1'])`), true);

    nube.caida = false;                   // vuelve el wifi
    corre(`Servicio.vaciarCola()`);
    await respirar();

    comprobar('al volver la señal sale una sola vez', propio.enviado.length, 1);
    comprobar('con todo lo marcado dentro',           propio.enviado[0].valor, { i1: 1, i2: 4 });
    comprobar('y no queda nada pendiente',            corre(`Servicio.pendientes()`), 0);
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

/* ============================================================
   PASAR DE SERVIRSE A LLEVAR, Y AL REVÉS

   El cliente cambia de idea a mitad del pedido. En los datos el tipo de
   servicio no es un campo aparte: un pedido para llevar es una cuenta
   con mesa 0 y un nombre. Por eso mover de mesa y cambiar de tipo son
   la misma función.

   Lo delicado es el dinero: lo que se lleva va en tarrina y la tarrina
   se cobra, así que el total sube al pasar a llevar y baja al volver.
   ============================================================ */

async function probarCambioDeServicio() {
    console.log('\n--- La mesa 3 decide llevárselo ---');
    const { corre } = pantallaComanda();

    corre(`verMesa(3)`);
    corre(`agregarAlBorrador(Store.findPlato('p5'), 2)`);   // 2 pollos, llevan tarrina
    corre(`agregarAlBorrador(Store.findPlato('p2'), 1)`);   // 1 chuleta, no lleva
    await corre.esperando(`enviar()`);

    const total = () => corre(`Servicio.cuentaDe(ref()).total`);
    comprobar('en la mesa son 2 pollos y una chuleta', total(), 11);

    // Lo que se va a cobrar de más se dice ANTES, no después
    comprobar('se avisa del total nuevo antes de confirmar',
        corre(`Servicio.efectoDeCambiarServicio({ mesa: 3 }, true)`),
        { antes: 11, despues: 11.5, diferencia: 0.5 });

    corre(`refActual = { mesa: 3 }`);
    corre(`cambiarTipoA({ llevar: true, nombre: 'Carlos' })`);

    comprobar('la cuenta ahora es de Carlos',
        corre(`Servicio.nombreDeCuenta(ref())`), 'Carlos');
    comprobar('la mesa 3 queda libre',
        corre(`!!Servicio.sesionDeMesa(3)`), false);
    comprobar('el código deja de decir M3',
        corre(`Servicio.tandasDe(ref())[0].codigo.split(' ')[0]`), 'LL');
    comprobar('y aparecieron las 2 tarrinas de los pollos', total(), 11.5);
    comprobar('todo va marcado para llevar',
        corre(`Servicio.tandasDe(ref())[0].items.every(i => i.llevar)`), true);
    comprobar('y ya no cuenta cubiertos',
        corre(`Servicio.tandasDe(ref())[0].cubiertos`), 0);

    // Y al revés: se arrepiente y se sienta
    corre(`cambiarTipoA({ mesa: 7 })`);
    comprobar('se sienta en la mesa 7',
        corre(`Servicio.nombreDeCuenta(ref())`), 'Mesa 7');
    comprobar('las tarrinas se quitan solas', total(), 11);
    comprobar('el código vuelve a decir la mesa',
        corre(`Servicio.tandasDe(ref())[0].codigo.split(' ')[0]`), 'M7');
    comprobar('y vuelven los cubiertos',
        corre(`Servicio.tandasDe(ref())[0].cubiertos`), 3);

    console.log('\n--- Cuándo NO se deja cambiar ---');

    // Se ocupa la mesa 2 y se espera a que el pedido salga de verdad
    corre(`verMesa(2)`);
    corre(`agregarAlBorrador(Store.findPlato('p2'), 1)`);
    await corre.esperando(`enviar()`);

    comprobar('la mesa ocupada no se puede pisar',
        corre(`Servicio.moverCuenta({ mesa: 7 }, { mesa: 2 }).motivo`),
        'La mesa 2 está ocupada. Cóbrala primero o escoge otra.');

    comprobar('sin nombre no se puede pasar a llevar',
        corre(`Servicio.moverCuenta({ mesa: 7 }, { llevar: true, nombre: '  ' }).motivo`),
        'Escribe a nombre de quién va el pedido.');

    // Ya entregado: eso ya salió de la cocina
    corre(`(() => {
        const c = Servicio.tandasDe({ mesa: 7 })[0];
        Servicio.marcarEntregado(c.id);
    })()`);
    comprobar('lo ya entregado bloquea el cambio',
        corre(`/ya se entregó/.test(Servicio.moverCuenta({ mesa: 7 }, { llevar: true, nombre: 'Ana' }).motivo)`),
        true);
    comprobar('pero cambiar de mesa sigue permitido, que no toca el total',
        corre(`Servicio.moverCuenta({ mesa: 7 }, { mesa: 9 }).ok`), true);

    // Ya cobrado
    corre(`(() => {
        const cuenta = Servicio.cuentaDe({ mesa: 9 });
        Servicio.registrarPago({ mesa: 9, sesion: Servicio.sesionesDe({ mesa: 9 })[0].id,
                                 lineas: [cuenta.items[0]], forma: 'efectivo' });
    })()`);
    comprobar('lo ya cobrado también',
        corre(`/Ya se cobró/.test(Servicio.moverCuenta({ mesa: 9 }, { llevar: true, nombre: 'Ana' }).motivo)`),
        true);
}

/* ============================================================
   EL TABLERO DE LA PARRILLA Y DE LA COCINA

   Aquí pasó el peor error del servicio de verdad: el mesero mandó una
   chuleta sin arroz y otra sin plátano, la parrilla las pintó como dos
   renglones idénticos —lo que se quita no se muestra ahí— y el asador
   leyó el primero, llevó una chuleta y dejó la otra.

   Esta pantalla no tenía ninguna prueba.
   ============================================================ */

function pantallaEstacion(cual) {
    const guardado = {};

    /* Las clases se guardan de verdad y no se tiran: el borde que late
       mientras queda algo sin anunciar es el único aviso que ningún
       permiso del navegador puede apagar, así que hay que poder
       comprobar que se enciende y que se apaga. */
    const nodo = () => {
        const clases = new Set();
        return {
            innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
            dataset: {}, style: { setProperty() {} }, clases,
            classList: {
                add: c => clases.add(c),
                remove: c => clases.delete(c),
                contains: c => clases.has(c),
                toggle: (c, on) => { if (on) clases.add(c); else clases.delete(c); }
            },
            addEventListener() {}, focus() {}, closest: () => null, querySelectorAll: () => []
        };
    };

    /* El mismo id devuelve el mismo nodo. Sin esto no hay forma de mirar
       en qué quedó un cartel después de tocarlo: cada consulta daba un
       nodo recién estrenado y en blanco. */
    const nodos = {};
    const porId = id => (nodos[id] = nodos[id] || nodo());

    const cuerpo = nodo();

    /* EL AUDIO, A MANO.

       Que suene o no es cosa del navegador y no se puede provocar desde
       una prueba. Aquí se decide con un interruptor, porque lo que hay
       que comprobar no es el tono: es qué hace el sistema cuando el
       navegador se niega a soltarlo. */
    const sonadas = [];
    let dejaSonar = false;

    /* Sonar no es instantáneo, y lo que pasa MIENTRAS suena es donde se
       esconden los pedidos perdidos. `retener` deja el tono a medias
       para poder meter otro pedido justo en ese hueco. */
    let reteniendo = false;
    let soltarPlay = null;

    const ctx = vm.createContext({
        console, Date, Math, JSON, Promise, Number, String, Array, Object, Map, Set,
        isNaN, parseFloat, parseInt,
        Blob: class { constructor(partes, op) { this.partes = partes; this.type = op && op.type; } },
        URL: { createObjectURL: () => 'blob:prueba' },
        Audio: class {
            constructor(src) { this.src = src; this.currentTime = 0; }
            play() {
                if (!dejaSonar) return Promise.reject(new Error('bloqueado'));
                sonadas.push(Date.now());
                if (!reteniendo) return Promise.resolve();
                return new Promise(r => { soltarPlay = r; });
            }
        },
        Sync: {
            activo: true, haySesion: () => true, correoSesion: () => cual + '@gmail.com',
            uidSesion: () => 'u', rolSesion: () => (cual === 'asador' ? 'parrilla' : 'cocina'),
            escuchar: () => (() => {}), leer: async () => undefined,
            guardar: async () => true, parchear: async () => true, agregar: async () => true,
            reclamar: async () => ({ ok: true, status: 200 }),
            enviar: async () => ({ ok: true, status: 200 }),
            ramaViva: () => true, desdeUltimoContacto: () => 0, fallo: () => '',
            salir() {}, entrar: async () => ({})
        },
        document: { getElementById: porId, addEventListener() {}, querySelectorAll: () => [],
                    createElement: nodo, hidden: false, title: '', body: cuerpo },
        window: { addEventListener() {}, scrollTo() {} },
        navigator: {},
        setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
        confirm: () => true, alert() {}, prompt: () => '',
        localStorage: {
            getItem: k => (k in guardado ? guardado[k] : null),
            setItem: (k, v) => { guardado[k] = String(v); },
            removeItem: k => { delete guardado[k]; }
        }
    });

    ['js/menu-data.js', 'js/store.js', 'js/servicio.js', 'js/estacion.js']
        .forEach(f => vm.runInContext(fuente(f), ctx));
    vm.runInContext(`ESTACION = '${cual}'; PUEDE = true;`, ctx);

    return {
        corre: e => vm.runInContext(e, ctx),
        nodo: porId,
        cuerpo,
        sonadas: () => sonadas.length,
        dejarSonar: v => { dejaSonar = v; },
        retener: v => { reteniendo = v; },
        soltar: () => { if (soltarPlay) { soltarPlay(); soltarPlay = null; } }
    };
}

/** Una comanda con las dos chuletas que se confundieron, y dos pollos. */
const PEDIDO_CONFUSO = JSON.stringify({
    id: 'x1', sesion: 's1', mesa: 4, tanda: 0, creado: Date.now(),
    estado: 'nuevo', sacado: false, codigo: 'M4 · 2CH 2PO', items: [
        { uid: 'a', platoId: 'p2', nombre: 'Chuleta', cantidad: 1, precio: 4,
          estacion: 'asador', sin: ['arroz'],   elegidas: [], termino: '' },
        { uid: 'b', platoId: 'p2', nombre: 'Chuleta', cantidad: 1, precio: 4,
          estacion: 'asador', sin: ['platano'], elegidas: [], termino: '' },
        { uid: 'c', platoId: 'p5', nombre: 'Pollo Asado', cantidad: 2, precio: 3.5,
          estacion: 'asador', sin: [], elegidas: [], termino: '' }
    ]
});

function probarTableroParrilla() {
    console.log('\n--- La parrilla junta lo que se ve igual ---');
    const { corre } = pantallaEstacion('asador');
    corre(`const C = ${PEDIDO_CONFUSO}`);

    comprobar('las dos chuletas salen en un solo renglón',
        corre(`itemsDeLaVista(C).map(i => i.cantidad + ' ' + i.nombre)`),
        ['2 Chuleta', '2 Pollo Asado']);

    /* La regla, dicha sobre lo que de verdad se dibuja: en la tarjeta
       terminada no puede haber dos renglones iguales. Esto es lo que
       falló en el salón, y se comprueba sobre el HTML, no sobre una
       lista intermedia. */
    const filas = corre(`tarjeta(Object.assign({}, C), 1)`)
        .split('<li').slice(1).map(f => f.replace(/\s+/g, ' ').trim());

    comprobar('la tarjeta dibuja dos renglones, no tres', filas.length, 2);
    comprobar('y ninguno es igual a otro', filas.length, [...new Set(filas)].length);

    // Lo que sí cambia el trabajo sigue separando
    corre(`C.items[0].termino = 'tres cuartos'`);
    comprobar('un término distinto no se junta',
        corre(`itemsDeLaVista(C).map(i => i.cantidad + ' ' + i.nombre)`),
        ['1 Chuleta', '1 Chuleta', '2 Pollo Asado']);
    comprobar('y se ve por qué son dos',
        corre(`detallesDe(itemsDeLaVista(C)[0]).join('')`),
        '<b class="det-fuerte">tres cuartos</b>');

    console.log('\n--- La cocina NO junta: cada casilla es suya ---');
    const cocina = pantallaEstacion('cocina');
    cocina.corre(`const C = ${PEDIDO_CONFUSO}`);
    comprobar('la cocina sigue viendo las dos chuletas por separado',
        cocina.corre(`itemsDeLaVista(C).length`), 3);
    comprobar('porque ahí sí se ve la diferencia',
        cocina.corre(`itemsDeLaVista(C).slice(0,2).map(i => detallesDe(i).join(''))`),
        ['sin arroz', 'sin plátano']);
}

/* ============================================================
   EL ARROZ PEDIDO Y SIN SERVIR

   Las proteínas salían y el arroz seguía crudo. Nadie sabe cuánto
   rinde una olla, así que "quedan tres porciones" sería inventárselo;
   lo que sí es un hecho es cuánto está pedido y sin servir.

   Lo delicado es contarlo bien: un plato pedido SIN arroz no gasta
   olla, y una porción suelta sí. Si el número miente una vez, deja de
   mirarse.
   ============================================================ */

function probarArrozPendiente() {
    console.log('\n--- Cuánto arroz hay pedido y sin servir ---');
    nubeLimpia();
    const { corre } = celular('cocina');

    const pedir = (nombre, comanda) =>
        corre(`(() => {
            const t = Servicio.getComandas();
            t['${nombre}'] = ${JSON.stringify(comanda)};
            localStorage.setItem('srv_comandas', JSON.stringify(t));
        })()`);

    const arroz = () => corre(`Servicio.arrozPendiente()`);

    comprobar('sin pedidos, no hay arroz que contar', arroz(), 0);

    // Los platos fuertes llevan arroz por la guarnición de su categoría
    pedir('n1', { id: 'n1', sesion: 's1', mesa: 3, creado: 1, estado: 'nuevo', items: [
        { uid: 'a', platoId: 'p5', nombre: 'Pollo Asado', cantidad: 2, precio: 3.5, estacion: 'asador' },
        { uid: 'b', platoId: 'p2', nombre: 'Chuleta',     cantidad: 1, precio: 4,   estacion: 'asador' }
    ]});
    comprobar('tres platos fuertes son tres arroces', arroz(), 3);

    // Lo que se pide sin arroz no gasta olla
    pedir('n2', { id: 'n2', sesion: 's2', mesa: 4, creado: 2, estado: 'nuevo', items: [
        { uid: 'c', platoId: 'p2', nombre: 'Chuleta', cantidad: 2, precio: 4,
          estacion: 'asador', sin: ['arroz'] }
    ]});
    comprobar('dos chuletas sin arroz no suman', arroz(), 3);

    // Una porción suelta sí, y "arroz y menestra" también
    pedir('n3', { id: 'n3', sesion: 's3', mesa: 5, creado: 3, estado: 'nuevo', items: [
        { uid: 'd', platoId: 'r1', nombre: 'Arroz',            cantidad: 2, precio: 1.5, estacion: 'cocina' },
        { uid: 'e', platoId: 'r3', nombre: 'Arroz y Menestra', cantidad: 1, precio: 2,   estacion: 'cocina' },
        { uid: 'f', platoId: 'r2', nombre: 'Menestra',         cantidad: 4, precio: 1,   estacion: 'cocina' }
    ]});
    comprobar('las porciones sueltas de arroz también cuentan', arroz(), 6);

    // Una bebida no gasta olla
    pedir('n4', { id: 'n4', sesion: 's4', mesa: 6, creado: 4, estado: 'nuevo', items: [
        { uid: 'g', platoId: 'b3', nombre: 'Cola', cantidad: 5, precio: 0.5, estacion: 'barra' }
    ]});
    comprobar('las bebidas no', arroz(), 6);

    // Al entregar, baja: lo servido ya no está pendiente
    corre(`Servicio.marcarEntregado('n1')`);
    comprobar('lo entregado deja de contar', arroz(), 3);

    corre(`Servicio.anularComanda('n3', 'prueba')`);
    comprobar('y lo anulado tampoco', arroz(), 0);
}

/* ============================================================
   EL AVISO DE PEDIDO NUEVO

   Es lo único que separa "la cocina lo tiene" de "la cocina no se ha
   enterado". Y fallaba de la peor manera posible: en silencio. El
   navegador se negaba a sonar, el pedido se daba por avisado igual, y
   no se volvía a intentar nunca. Nadie podía notarlo hasta que el
   plato salía veinte minutos tarde.

   Por eso lo que más se comprueba aquí no es que suene, sino que lo
   que NO sonó siga esperando.
   ============================================================ */

async function probarAvisoDePedidoNuevo() {
    console.log('\n--- El aviso de pedido nuevo ---');
    const p = pantallaEstacion('cocina');
    const { corre } = p;

    const meter = (id, extra) => corre(`(() => {
        const t = Servicio.getComandas();
        t['${id}'] = Object.assign({
            id: '${id}', sesion: 's', mesa: 3, creado: 1, estado: 'nuevo',
            items: [{ uid: 'u${id}', platoId: 'p5', nombre: 'Pollo Asado',
                      cantidad: 1, precio: 3.5, estacion: 'asador', sin: [] }]
        }, ${JSON.stringify(extra || {})});
        localStorage.setItem('srv_comandas', JSON.stringify(t));
    })()`);

    const pendientes = () => corre('porAvisar.size');
    const avisado    = id => corre(`avisadas.has('${id}')`);
    const parpadea   = () => p.cuerpo.clases.has('hay-nuevo');

    /* Lo que ya estaba en el celular al abrir la pantalla es lo de
       antes, no un pedido que acaba de entrar. */
    meter('vieja');
    corre(`Servicio.comandasDe(ESTACION).forEach(c => avisadas.set(c.id, marcaDe(c)))`);
    p.dejarSonar(true);
    await corre('revisarNovedades()');
    comprobar('lo que ya estaba al abrir no suena', p.sonadas(), 0);

    /* Y un pedido nuevo suena YA. Antes había un plazo de cuatro
       segundos desde que se abría la pantalla, y lo que entraba dentro
       de ese plazo se perdía sin dejar rastro. */
    meter('n1');
    await corre('revisarNovedades()');
    comprobar('un pedido nuevo suena, sin plazos de espera', p.sonadas(), 1);
    comprobar('y queda anunciado', avisado('n1'), true);
    comprobar('sin nada pendiente, la pantalla no parpadea', parpadea(), false);

    /* ---- LO QUE DE VERDAD SE ROMPÍA ---- */
    corre('sonandoHasta = 0; yaSono = false');
    p.dejarSonar(false);
    meter('n2');
    await corre('revisarNovedades()');

    comprobar('si el navegador no deja sonar, NO se da por avisado', avisado('n2'), false);
    comprobar('el pedido sigue esperando su aviso', pendientes(), 1);
    comprobar('y la pantalla lo dice parpadeando', parpadea(), true);
    comprobar('el cartel dice cuántos hay esperando',
        /1 pedido nuevo/.test(p.nodo('sin-sonido').innerHTML) &&
        !p.nodo('sin-sonido').hidden, true);

    // Alguien toca la pantalla: sale lo que se había quedado dentro
    p.dejarSonar(true);
    await corre('desbloquear()');
    comprobar('al tocar la pantalla suena lo que estaba esperando', p.sonadas(), 2);
    comprobar('y recién ahí se da por avisado', avisado('n2'), true);
    comprobar('deja de parpadear', parpadea(), false);
    comprobar('y el cartel se guarda', p.nodo('sin-sonido').hidden, true);

    /* ---- DOS PEDIDOS CASI JUNTOS ----

       Hay una pausa entre alarma y alarma porque dos encima suenan a
       ruido y no a aviso. Antes esa pausa DESCARTABA el segundo pedido;
       ahora solo lo hace esperar. */
    corre('sonandoHasta = Date.now() + 1200');
    meter('n3');
    await corre('revisarNovedades()');
    comprobar('el segundo pedido no suena encima del primero', p.sonadas(), 2);
    comprobar('pero no se pierde: queda esperando', pendientes(), 1);

    corre('sonandoHasta = 0');
    await corre('intentarAvisar()');
    comprobar('y suena en cuanto pasa la pausa', p.sonadas(), 3);
    comprobar('sin dejar nada pendiente', pendientes(), 0);

    /* ---- UN PEDIDO CORREGIDO ES UN AVISO NUEVO ----

       "Era chuleta, no pollo" cambia el trabajo de la cocina tanto como
       un pedido nuevo, y antes llegaba en silencio: la tarjeta cambiaba
       sola y había que darse cuenta mirando. */
    corre('sonandoHasta = 0');
    meter('n1', { editado: 999 });
    await corre('revisarNovedades()');
    comprobar('corregir un pedido vuelve a sonar', p.sonadas(), 4);

    // Pero deshacer un toque de más no es un pedido nuevo
    corre('sonandoHasta = 0');
    corre(`Servicio.marcarEntregado('n1')`);
    await corre('revisarNovedades()');
    corre('sonandoHasta = 0');
    corre(`Servicio.devolverANuevo('n1')`);
    await corre('revisarNovedades()');
    comprobar('deshacer un entregado NO suena como pedido nuevo', p.sonadas(), 4);
}

/* ============================================================
   INSTALAR LA PANTALLA COMO APLICACIÓN

   Lo que se comprueba aquí no es que "se pueda instalar" —eso lo
   decide Chrome y se ve en el celular—, sino las tres cosas que se
   rompen en silencio y no se notan hasta que ya están publicadas:

     1. Que el ayudante NO se meta con Firebase. Si lo hiciera, la
        cocina dejaría de recibir pedidos sin un solo mensaje de error.
     2. Que cada pantalla instale LA SUYA. Un manifiesto copiado y a
        medio cambiar hace que el icono de la cocina abra la comanda,
        y eso solo se descubre instalándolo.
     3. Que los iconos que promete el manifiesto existan de verdad.
   ============================================================ */

/** La marca que lleva ahora el ayudante. */
const versionDelAyudante = () =>
    (fuente('sw.js').match(/const VERSION = '([^']+)'/) || [])[1];

/** Carga sw.js con un navegador de mentira y devuelve sus oyentes. */
function ayudante() {
    const oyentes = {};
    const guardado = new Map();

    const caja = {
        match: async req => guardado.get(String(req.url || req)),
        put: async (req, r) => { guardado.set(String(req.url || req), r); }
    };

    const respuesta = de => ({
        ok: true, status: 200, type: 'basic', de,
        clone() { return this; }
    });

    const pedidas = [];

    /* El service worker es lo único del sitio que corre con la
       aplicación cerrada: cuando llega un aviso, Android lo arranca, le
       entrega el mensaje y lo vuelve a apagar. Aquí se le da un
       registro y unas ventanas de mentira para poder mirar qué enseña. */
    const registro = { showNotification: () => Promise.resolve() };
    const clientes = [];
    const abiertasNuevas = [];

    const ctx = vm.createContext({
        console, Promise, URL, Map, Set, Object, RegExp, String, Array,
        location: { origin: 'https://nisocopia.github.io' },
        self: {
            addEventListener: (ev, fn) => { oyentes[ev] = fn; },
            skipWaiting() {},
            registration: registro,
            clients: {
                claim: async () => {},
                matchAll: async () => clientes,
                openWindow: async u => { abiertasNuevas.push(u); return { url: u }; }
            }
        },
        caches: {
            open: async () => caja,
            /* La caja de ahora se saca del propio sw.js. Escrita a mano
               aquí, esta prueba se rompía cada vez que se publicaba —y
               una prueba que falla por costumbre deja de leerse. */
            keys: async () => ['carbon-vieja', 'carbon-' + versionDelAyudante()],
            delete: async n => { pedidas.push(n); return true; }
        },
        fetch: async req => respuesta('red:' + String(req.url || req))
    });

    vm.runInContext(fuente('sw.js'), ctx);

    /** Lanza un fetch contra el ayudante y dice si lo interceptó. */
    const pedir = async (url, opciones) => {
        const req = Object.assign({ url, method: 'GET', mode: 'no-cors' }, opciones || {});
        let atendido = null;
        oyentes.fetch({ request: req, respondWith: p => { atendido = p; } });
        return atendido ? { atendido: true, r: await atendido } : { atendido: false };
    };

    return { oyentes, pedir, caja, guardado, borradas: pedidas, respuesta,
             registro, clientes, abiertasNuevas };
}

async function probarAyudante() {
    console.log('\n--- El ayudante no se mete con los pedidos ---');
    const a = ayudante();

    /* LO MÁS IMPORTANTE DE TODO EL ARCHIVO.

       El canal de las comandas es una conexión que se abre y se queda
       abierta horas. Un ayudante que intentara guardarla se quedaría
       esperando un final que no llega, y la cocina dejaría de recibir
       pedidos sin que saltara un solo error. */
    const canal = await a.pedir(
        'https://menu-carbon-default-rtdb.firebaseio.com/servicio/comandas.json?auth=xxx');
    comprobar('el canal de las comandas pasa sin que lo toquen', canal.atendido, false);

    const login = await a.pedir(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x',
        { method: 'POST' });
    comprobar('entrar con correo y clave, tampoco', login.atendido, false);

    const mandar = await a.pedir(
        'https://menu-carbon-default-rtdb.firebaseio.com/servicio/comandas/abc.json',
        { method: 'PUT' });
    comprobar('mandar un pedido, tampoco', mandar.atendido, false);

    // Y lo que sí es suyo, sí
    const pagina = await a.pedir('https://nisocopia.github.io/menu-carbon/cocina.html');
    comprobar('la pantalla de la cocina sí la atiende', pagina.atendido, true);

    console.log('\n--- Y guarda cada cosa como le toca ---');

    /* El HTML SIEMPRE por red: una tablet de cocina con el código de
       hace tres semanas es peor que una que tarda medio segundo más. */
    comprobar('la página se pide a la red', pagina.r.de,
        'red:https://nisocopia.github.io/menu-carbon/cocina.html');

    // Lo marcado con ?v= no puede cambiar sin cambiar de dirección
    const js = 'https://nisocopia.github.io/menu-carbon/js/estacion.js?v=202608051718';
    await a.pedir(js);
    a.guardado.set(js, a.respuesta('guardado'));
    const segunda = await a.pedir(js);
    comprobar('el javascript marcado se sirve de lo guardado', segunda.r.de, 'guardado');

    /* Una foto guardada se sirve al momento, pero por detrás se baja la
       nueva: así el gerente cambia la foto de un plato y se ve, sin que
       el comensal pague medio mega en cada carga. */
    const foto = 'https://nisocopia.github.io/menu-carbon/img/productos/polloasado.webp';
    a.guardado.set(foto, a.respuesta('guardado'));
    const conFoto = await a.pedir(foto);
    comprobar('la foto sale de lo guardado, sin esperar', conFoto.r.de, 'guardado');
    await respirar();
    comprobar('y por detrás se baja la nueva', a.guardado.get(foto).de, 'red:' + foto);

    // Al cambiar de versión, la caja anterior se tira entera
    await new Promise(r => a.oyentes.activate({ waitUntil: p => p.then(r, r) }));
    comprobar('al publicar, se tira la caja vieja', a.borradas, ['carbon-vieja']);
}

function probarInstalable() {
    console.log('\n--- Cada pantalla instala la suya ---');

    const PANTALLAS = ['cocina', 'parrilla', 'comanda'];

    PANTALLAS.forEach(n => {
        const m = JSON.parse(fuente(`manifest-${n}.json`));
        const html = fuente(`${n}.html`);

        comprobar(`${n}: abre su propia pantalla`, m.start_url, `${n}.html`);
        comprobar(`${n}: la página enlaza su manifiesto`,
            html.includes(`<link rel="manifest" href="manifest-${n}.json">`), true);

        /* Chrome no ofrece instalar nada sin un icono de 192 y otro de
           512. Es la comprobación aburrida que, si falla, hace que el
           botón de instalar no salga nunca y nadie sepa por qué. */
        const medidas = m.icons.map(i => i.sizes).sort();
        comprobar(`${n}: trae los dos tamaños que Chrome exige`,
            medidas.includes('192x192') && medidas.includes('512x512'), true);

        // Un icono prometido que no existe deja la instalación a medias
        const faltan = m.icons.map(i => i.src).filter(src => !existe(src));
        comprobar(`${n}: todos sus iconos existen`, faltan, []);

        comprobar(`${n}: se abre sin barra de navegador`, m.display, 'standalone');

        /* El color de la barra de arriba tiene que ser el mismo que el
           de la página, o al abrirla se ve una franja de otro color. */
        const enLaPagina = (html.match(/name="theme-color" content="([^"]+)"/) || [])[1];
        comprobar(`${n}: el color de la barra coincide con la página`,
            m.theme_color, enLaPagina);
    });

    // Dos pantallas no pueden compartir icono: en la pantalla de inicio
    // serían tres aplicaciones idénticas y no habría forma de acertar.
    const iconos = PANTALLAS.map(n => JSON.parse(fuente(`manifest-${n}.json`)).icons[0].src);
    comprobar('ninguna repite el icono de otra', iconos.length, new Set(iconos).size);

    console.log('\n--- Y todas registran el ayudante ---');
    ['cocina', 'parrilla', 'comanda', 'index', 'panel'].forEach(n =>
        comprobar(`${n}.html lo registra`, /src="js\/pwa\.js/.test(fuente(`${n}.html`)), true));

    /* La caja del ayudante lleva la misma marca que los archivos de las
       páginas. Si se descuadraran, la caja no se tiraría al publicar y
       una tablet podría quedarse con el javascript viejo dentro —y eso
       ya no se arregla recargando. */
    const enSw = (fuente('sw.js').match(/const VERSION = '([^']+)'/) || [])[1];
    const enHtml = (fuente('cocina.html').match(/\?v=(\d+)/) || [])[1];
    comprobar('la caja del ayudante va a la par de las páginas', enSw, enHtml);
}

/* ============================================================
   LOS AVISOS QUE DESPIERTAN EL CELULAR

   Aquí no se puede comprobar que suene un celular: eso solo se ve con
   el celular en la mano. Lo que sí se comprueba es lo que, si está
   mal, hace que NO suene y no dé ningún error que ayude:

     - que el cifrado sea el del estándar, byte por byte. Si se
       desviara, Google acepta el aviso, contesta 201, y el celular lo
       tira en silencio porque no lo puede descifrar. No hay forma de
       enterarse mirando.
     - que el service worker enseñe algo pase lo que pase. Si un aviso
       llegara sin mostrarse, el navegador deja de repartirlos — sin
       decir por qué.
     - que la nube no deje escribir cualquier cosa en los apuntes.
   ============================================================ */

function probarCifradoDeAvisos() {
    console.log('\n--- El aviso va cifrado como manda el estándar ---');

    const { cifrar, firmar, b64u } = require('./avisar.js');

    /* El ejemplo oficial del RFC 8291. Con la sal y la clave de un solo
       uso fijadas, el resultado tiene que salir idéntico byte por byte.

       Esta es LA prueba de todo esto: si el cifrado se desvía aunque sea
       un byte, Google acepta el aviso y contesta que todo bien, pero el
       celular no lo puede abrir y lo tira sin decir nada. Un fallo así
       no se descubre probando: se descubre cuando la cocina lleva una
       semana sin enterarse de los pedidos. */
    const destino = {
        p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth:   'BTBZMqHH6r4Tts7J_aSIgg'
    };
    const fijas = {
        privada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
        sal:     'DGv6ra1nlYgDCS1FRnbzlw'
    };

    comprobar('coincide con el ejemplo oficial, byte por byte',
        b64u(cifrar(destino, 'When I grow up, I want to be a watermelon', fijas)),
        'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
        'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');

    // Sin sal fija, dos avisos iguales no pueden salir iguales
    const uno = b64u(cifrar(destino, 'hola'));
    const dos = b64u(cifrar(destino, 'hola'));
    comprobar('dos avisos iguales se cifran distinto', uno === dos, false);

    console.log('\n--- Y va firmado, para que Google lo reparta ---');

    const f = firmar('https://fcm.googleapis.com/fcm/send/abc',
                     'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
                     'mailto:x@y.z');

    const [cabeza, cuerpo, firma] = f.jwt.split('.');
    comprobar('la firma es ES256', JSON.parse(Buffer.from(cabeza, 'base64url')).alg, 'ES256');

    /* El destinatario es SOLO el servidor, sin la ruta. Si se colara la
       dirección entera, Google devuelve 401 y no dice cuál de las diez
       cosas del encabezado está mal. */
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url'));
    comprobar('va dirigida al servidor y no a la ruta', d.aud, 'https://fcm.googleapis.com');
    comprobar('y caduca dentro de las 12 horas que se aceptan',
        d.exp - Math.floor(Date.now() / 1000) <= 12 * 3600 + 5, true);

    /* En crudo y no en DER. Es la diferencia entre que salga y que
       rebote con un 401 que no explica nada. */
    comprobar('la firma va en crudo: 64 bytes',
        Buffer.from(firma, 'base64url').length, 64);

    comprobar('la clave pública que se manda son 65 bytes',
        Buffer.from(f.publica, 'base64url').length, 65);
}

async function probarRecepcionDeAvisos() {
    console.log('\n--- El celular siempre enseña lo que le llega ---');

    const a = ayudante();

    const mostradas = [];
    const abiertas = [];
    a.registro.showNotification = (titulo, op) => {
        mostradas.push({ titulo, ...op });
        return Promise.resolve();
    };
    a.clientes.push({ url: 'https://nisocopia.github.io/menu-carbon/cocina.html', focus() { abiertas.push('enfocada'); } });

    const empujar = async datos => {
        mostradas.length = 0;
        let esperando;
        a.oyentes.push({
            data: datos === undefined ? null : { json: () => datos },
            waitUntil: p => { esperando = p; }
        });
        await esperando;
        return mostradas[0];
    };

    const normal = await empujar({ titulo: 'Cocina', cuerpo: 'M4 · 2PO', destino: 'cocina.html' });
    comprobar('enseña el título que le mandan', normal.titulo, 'Cocina');
    comprobar('y el texto', normal.body, 'M4 · 2PO');

    /* LO IMPORTANTE. Al aceptar los avisos se prometió enseñar TODOS.
       Un aviso que llegue vacío o roto no puede quedarse sin mostrar: si
       se incumple, el navegador deja de repartirlos y no dice por qué. */
    const vacio = await empujar(undefined);
    comprobar('un aviso vacío también se enseña', !!vacio, true);
    comprobar('con un texto que sirva de algo', /pedido/i.test(vacio.titulo + vacio.body), true);

    /* Seis mesas seguidas no pueden ser seis avisos apilados: taparían
       la pantalla y el celular tardaría medio minuto en callarse. */
    comprobar('los avisos del mismo tipo se pisan en vez de apilarse', normal.tag, 'pedido');
    comprobar('pero vuelve a sonar en cada uno', normal.renotify, true);

    /* Un aviso que se desvanece a los cinco segundos mientras la cocina
       tiene las manos en la plancha no lo ve nadie. */
    comprobar('no se va solo: espera a que alguien lo toque', normal.requireInteraction, true);
    comprobar('y vibra', Array.isArray(normal.vibrate), true);

    console.log('\n--- Y al tocarlo abre la pantalla que toca ---');

    let cerrada = false;
    let esperando;
    a.oyentes.notificationclick({
        notification: { close: () => { cerrada = true; }, data: { destino: 'cocina.html' } },
        waitUntil: p => { esperando = p; }
    });
    await esperando;

    comprobar('el aviso se cierra al tocarlo', cerrada, true);
    /* Si ya está abierta se trae al frente. Dos pestañas de la misma
       cocina son dos tableros que mirar, y el pedido está en el otro. */
    comprobar('trae al frente la que ya estaba abierta', abiertas, ['enfocada']);
    comprobar('sin abrir una segunda', a.abiertasNuevas, []);
}

function probarPermisosDeAvisos() {
    console.log('\n--- La nube solo deja apuntar lo que es ---');

    const crudo = fuente('firebase-rules.json');

    /* NADA DE COMENTARIOS AQUÍ DENTRO.

       Firebase no lee este archivo como un texto con notas: cada clave
       es el nombre de una rama de la base. Una línea `"//": "explicación"`
       no es un comentario — es una rama que se llama `//`, y su valor
       tendría que ser un objeto. La consola la rechaza entera con
       "Expected '{'" y señalando una línea que no dice nada.

       Ya pasó una vez. Las explicaciones van en FIREBASE.md, que es
       donde se pueden escribir sin romper nada. */
    const comentarios = (crudo.match(/^\s*"\/\/\d*"\s*:/gm) || []).length;
    comprobar('las reglas no llevan comentarios: Firebase los lee como ramas',
        comentarios, 0);

    let reglas = null;
    try { reglas = JSON.parse(crudo); } catch (e) { /* lo dice la comprobación */ }
    comprobar('y son un JSON que se puede guardar tal cual', !!reglas, true);
    if (!reglas) return;

    const avisos = reglas.rules.avisos;
    const aparato = avisos.$rol.$aparato;

    comprobar('existe la rama de los avisos', !!avisos, true);

    /* Leerlos es saber a qué aparatos se puede hacer sonar. Solo el
       gerente, que es con quien entra el que los manda. */
    comprobar('solo el gerente los lee',
        /auth\.uid == 'fbdIzi6tOwhwJwQR6xY0MLUz4UE3'/.test(avisos['.read']), true);

    // Cualquier cuenta del local apunta la suya, pero solo la suya:
    // el nombre del sitio sale de la direccion del buzon, que no se sabe.
    comprobar('cualquier cuenta del local apunta la suya', aparato['.write'], 'auth != null');

    comprobar('un apunte sin buzón no entra',
        /hasChildren\(\['endpoint', 'p256dh', 'auth', 'creado'\]\)/.test(aparato['.validate']), true);
    comprobar('el buzón tiene que ser una dirección segura',
        /beginsWith\('https:\/\/'\)/.test(aparato.endpoint['.validate']), true);

    /* Este es el único sitio donde escribe una cuenta que no es la del
       gerente, así que no puede entrar nada que no esté en la lista. */
    comprobar('un campo que no está en la lista no entra', aparato.$otro['.validate'], false);
}

/**
 * Sonar tarda, y en ese rato puede entrar otro pedido.
 *
 * Es el mismo error de siempre disfrazado: si al terminar el pitido se
 * diera por avisado TODO lo que hay en la lista, el pedido que entró a
 * mitad quedaría anunciado por un tono que sonó antes de que existiera.
 * Nadie lo habría oído y nadie volvería a intentarlo.
 */
async function probarPedidoQueEntraMientrasSuena() {
    console.log('\n--- Un pedido que entra mientras suena el anterior ---');
    const p = pantallaEstacion('cocina');
    const { corre } = p;

    const meter = id => corre(`(() => {
        const t = Servicio.getComandas();
        t['${id}'] = { id: '${id}', sesion: 's', mesa: 3, creado: 1, estado: 'nuevo',
            items: [{ uid: 'u${id}', platoId: 'p5', nombre: 'Pollo Asado',
                      cantidad: 1, precio: 3.5, estacion: 'asador', sin: [] }] };
        localStorage.setItem('srv_comandas', JSON.stringify(t));
    })()`);

    p.dejarSonar(true);
    p.retener(true);

    // Empieza a sonar por el primero y se queda a medias
    meter('a');
    const sonando = corre('revisarNovedades()');
    await respirar();
    comprobar('el primero está sonando', p.sonadas(), 1);

    // Justo en ese hueco entra el segundo
    meter('b');
    corre('revisarNovedades()');
    await respirar();
    comprobar('el segundo no suena encima', p.sonadas(), 1);

    // Termina el primer tono
    p.soltar();
    await sonando;
    await respirar();

    comprobar('el primero queda anunciado', corre(`avisadas.has('a')`), true);
    comprobar('el segundo NO, porque ese tono no era suyo', corre(`avisadas.has('b')`), false);
    comprobar('y sigue esperando su propio aviso', corre('porAvisar.size'), 1);

    // Y lo consigue en cuanto pasa la pausa
    p.retener(false);
    corre('sonandoHasta = 0');
    await corre('intentarAvisar()');
    comprobar('que acaba sonando', p.sonadas(), 2);
    comprobar('sin dejar nada pendiente', corre('porAvisar.size'), 0);
}

/**
 * El aviso vivía dentro de la función que dibuja el tablero, y a mitad
 * de camino. Cualquier fallo dibujando se llevaba la alarma por delante
 * sin que nadie se enterara. Ahora avisar va primero y no depende de
 * que el dibujo salga bien.
 */
async function probarAvisoIndependienteDelDibujo() {
    console.log('\n--- Avisar no depende de que el tablero se dibuje ---');
    const p = pantallaEstacion('cocina');
    const { corre } = p;

    p.dejarSonar(true);
    corre(`(() => {
        const t = Servicio.getComandas();
        t.roto = { id: 'roto', sesion: 's', mesa: 1, creado: 1, estado: 'nuevo',
                   items: [{ uid: 'z', platoId: 'p5', nombre: 'Pollo Asado',
                             cantidad: 1, precio: 3.5, estacion: 'asador', sin: [] }] };
        localStorage.setItem('srv_comandas', JSON.stringify(t));
    })()`);

    // Se rompe el dibujo a propósito
    corre(`pintarRed = () => { throw new Error('tablero roto'); }`);

    let reventó = false;
    try { await corre('alLlegarDatos()'); } catch (e) { reventó = true; }
    await respirar();

    comprobar('el tablero revienta', reventó, true);
    comprobar('pero el aviso salió igual', p.sonadas(), 1);
}

function probarEscaleraDeTurnos() {
    console.log('\n--- El orden se ve de lejos, sin leer el número ---');
    const { corre } = pantallaEstacion('asador');
    corre(`const C = ${PEDIDO_CONFUSO}`);

    const clases = turno =>
        corre(`tarjeta(Object.assign({}, C), ${turno})`)
            .match(/class="ticket ([^"]*)"/)[1].trim().replace(/\s+/g, ' ');

    comprobar('el primero va encendido y avisa',   clases(1), 'turno-1 ahora');
    comprobar('el segundo baja un punto',          clases(2), 'turno-2');
    comprobar('el tercero otro punto',             clases(3), 'turno-3');
    comprobar('del cuarto en adelante, todos igual', clases(4), 'turno-4');
    comprobar('el séptimo también',                clases(7), 'turno-4');

    // Lo ya resuelto se pliega abajo sin puesto en la fila
    comprobar('lo plegado no entra en la escalera', clases(0), '');

    /* Con el reloj no se juega: el CSS le devuelve el brillo entero a lo
       que lleva 25 minutos, esté donde esté en la fila. */
    const css = fuente('css/servicio.css');
    comprobar('y un pedido de 25 minutos nunca se apaga',
        /\.ticket\.roja\s*\{\s*opacity:\s*1;/.test(css), true);
}

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

    const corre = e => vm.runInContext(e, ctx);

    /* Enviar dejó de ser instantáneo: antes de escribir nada le pregunta
       a la nube si las costillas siguen ahí. Una prueba que no espere esa
       vuelta mira el pedido antes de que exista. */
    corre.esperando = async e => {
        const r = corre(e);
        await new Promise(res => setTimeout(res, 20));
        return r;
    };

    return { nodo, corre };
}

async function probarTomarPedido() {
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

    await corre.esperando('enviar()');
    const c = corre('Object.values(Servicio.getComandas())[0]');
    comprobar('la comanda sale con el nombre', c.nombre, 'Carlos');
    comprobar('y con sus 2 tarrinas',
        (c.items.find(i => i.platoId === 't1') || {}).cantidad, 2);
    comprobar('todo lo del pedido va marcado para llevar',
        c.items.every(i => i.llevar), true);
}

const Store_nombre = (corre, id) => corre(`Store.findPlato('${id}').nombre`);


/* ============================================================
   LA PANTALLA DEL QUE SIRVE

   El turno es lo que reemplaza a marcar los cubiertos: si va por el 8,
   del 1 al 7 ya estan puestos. Por eso NO se renumera cuando una mesa
   se va — perderia la referencia a mitad del servicio.
   ============================================================ */

function probarTurnosDeMesa() {
    console.log('\n--- El turno de cada mesa, para el que pone los cubiertos ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    /* Se siembran las mesas tal como quedan tras cobrar: la sesion
       cerrada guarda cuando se cerro, que es lo que decide si el local
       llego a quedarse vacio. */
    const sembrar = ses => corre(
        `localStorage.setItem('srv_sesiones', ${JSON.stringify(JSON.stringify(ses))})`);

    const T = 1000000;
    const ses = (id, mesa, min, cerrado) => ({
        id, mesa, abierta: !cerrado, creado: T + min * 60000,
        cerrado: cerrado ? T + cerrado * 60000 : null
    });

    // Mesa 3 primero, mesa 4 despues
    sembrar({ s3: ses('s3', 3, 0), s4: ses('s4', 4, 5) });
    comprobar('la primera mesa es la 1 y la segunda la 2',
        corre('[Servicio.turnosDeSesion().s3, Servicio.turnosDeSesion().s4]'), [1, 2]);

    // Se cobra la mesa 3: la 4 NO se renumera
    sembrar({ s3: ses('s3', 3, 0, 20), s4: ses('s4', 4, 5) });
    comprobar('al irse la 1, la 2 sigue siendo la 2',
        corre('Servicio.turnosDeSesion().s4'), 2);

    // Entra la mesa 6 con la 4 todavia ocupada
    sembrar({ s3: ses('s3', 3, 0, 20), s4: ses('s4', 4, 5), s6: ses('s6', 6, 25) });
    comprobar('la que entra despues es la 3',
        corre('Servicio.turnosDeSesion().s6'), 3);

    // El local se vacia del todo y entra una mesa nueva
    sembrar({ s3: ses('s3', 3, 0, 10), s4: ses('s4', 4, 2, 12), s7: ses('s7', 7, 30) });
    comprobar('con el local vacio, vuelve a empezar en 1',
        corre('Servicio.turnosDeSesion().s7'), 1);
}

function probarCubiertosDeLaMesa() {
    console.log('\n--- Los cubiertos suben solos cuando la mesa pide mas ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    corre(`Servicio.enviarComanda({ mesa: 4, items: [
        { platoId: 'p5', nombre: 'Pollo Asado', precio: 3.5, cantidad: 2 }] })`);
    const ses = corre('Servicio.sesionDeMesa(4).id');

    comprobar('dos platos, dos cubiertos',
        corre(`Servicio.cubiertosDeSesion('${ses}')`), 2);

    // A mitad de comida piden una chuleta mas
    corre(`Servicio.enviarComanda({ mesa: 4, items: [
        { platoId: 'p2', nombre: 'Chuleta', precio: 4, cantidad: 1 }] })`);

    comprobar('piden una chuleta mas y pasa a tres',
        corre(`Servicio.cubiertosDeSesion('${ses}')`), 3);

    /* Una bebida no se sienta a comer. Si sumara, el que sirve llevaria
       cubiertos de mas cada vez que alguien pide una cola. */
    corre(`Servicio.enviarComanda({ mesa: 4, items: [
        { platoId: 'b3', nombre: 'Cola personal', precio: 0.5, cantidad: 4 }] })`);

    comprobar('pero una bebida no suma cubiertos',
        corre(`Servicio.cubiertosDeSesion('${ses}')`), 3);
}

function probarPantallaDeServir() {
    console.log('\n--- La pantalla del que sirve es de puro mirar ---');

    const js = fuente('js/servir.js');
    comprobar('no cambia el estado de ninguna comanda',
        /marcarEntregado|marcarSacado|marcarListo|registrarPago|anularComanda|editarComanda/.test(js),
        false);
    comprobar('ni escribe en la nube',
        /Servicio\.(enviarComanda|cerrarSesion|abrirSesion|moverMesa)/.test(js), false);

    const html = fuente('servir.html');
    comprobar('se instala como su propia aplicacion',
        /manifest-servir\.json/.test(html), true);

    const manifiesto = JSON.parse(fuente('manifest-servir.json'));
    comprobar('y abre su pantalla, no otra', manifiesto.start_url, 'servir.html');
}



function probarCuentaDeServir() {
    console.log('\n' + '--- La cuenta del que sirve, ya creada ---');

    const equipo = fuente('js/menu-data.js');
    const uid = (equipo.match(/'([A-Za-z0-9]{28})':\s*'servir'/) || [])[1];

    comprobar('esta en EQUIPO con su rol', !!uid, true);
    comprobar('y su identificador tiene los 28 caracteres',
        uid ? uid.length : 0, 28);

    /* Un uid repetido daria dos roles a la misma persona y el ultimo
       ganaria en silencio. Mejor que salte aqui. */
    const uids = [...equipo.matchAll(/'([A-Za-z0-9]{28})':\s*'\w+'/g)].map(m => m[1]);
    comprobar('ninguna cuenta esta repetida en la lista',
        uids.length, new Set(uids).size);

    /* Con la cuenta puesta, el sistema tiene que dejarla entrar a la
       suya y cerrarle las demas. Antes de crearla esto no se podia
       comprobar de verdad: el rol no existia en ningun lado. */
    const { corre } = celular('servir');
    comprobar('entra a su pantalla',
        corre(`Servicio.permisoEn('servir')`), 'ver');
    comprobar('y no a la comanda, la cocina ni la parrilla',
        corre(`[Servicio.permisoEn('comanda'), Servicio.permisoEn('cocina'), Servicio.permisoEn('asador')]`),
        ['no', 'no', 'no']);
    comprobar('no anota ni cobra',
        corre('[Servicio.puedeAnotar(), Servicio.puedeCobrar()]'), [false, false]);
}


function probarPorQueNoEntro() {
    console.log('\n' + '--- Cuando no deja entrar, dice por que ---');
    const sync = fuente('js/sync.js');

    /* Decirle "correo o clave incorrectos" a todo es mentir la mitad de
       las veces, y deja a la persona probando la clave contra una pared
       cuando el problema era otro. */
    [['EMAIL_NOT_FOUND', 'no esta registrado'],
     ['USER_DISABLED', 'desactivada'],
     ['TOO_MANY_ATTEMPTS_TRY_LATER', 'intentos'],
     ['OPERATION_NOT_ALLOWED', 'Firebase']].forEach(([codigo, pista]) => {
        const linea = sync.split('\n').find(l => l.includes(codigo + ':'));
        comprobar(codigo + ' se explica', !!linea && linea.includes(pista), true);
    });

    // Un codigo que no esta en la lista se muestra tal cual, no se traga
    comprobar('un codigo desconocido se muestra tal cual',
        /No se pudo entrar/.test(sync), true);

    // Y las pantallas dejan de tener cada una su propio mensaje
    ['js/servir.js', 'js/estacion.js', 'js/panel.js'].forEach(f => {
        comprobar(f + ' usa el motivo comun',
            /porQueNoEntro/.test(fuente(f)), true);
    });
}


function probarLlevarEnServir() {
    console.log('\n' + '--- Los pedidos para llevar, en la pantalla del que sirve ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    // Mesa 3, luego una funda a nombre de Carlos, luego mesa 4
    corre(`Servicio.enviarComanda({ mesa: 3, items: [
        { platoId: 'p5', nombre: 'Pollo Asado', precio: 3.5, cantidad: 3 }] })`);
    /* Los items van marcados para llevar, que es como los manda la
       comanda: al entrar por el boton "Pedido para llevar" ella marca
       todo el pedido de una, sin pedirle al mesero que lo repita plato
       por plato. */
    corre(`Servicio.enviarComanda({ nombre: 'Carlos', items: [
        { platoId: 'p5', nombre: 'Pollo Asado', precio: 3.5, cantidad: 2, llevar: true }] })`);
    corre(`Servicio.enviarComanda({ mesa: 4, items: [
        { platoId: 'p1', nombre: 'Carne Asada', precio: 3.5, cantidad: 2 }] })`);

    comprobar('la funda aparece entre lo que esta abierto',
        corre(`Servicio.llevarAbiertos().map(s => s.nombre)`), ['Carlos']);

    /* Lo importante: la funda ocupa su puesto en la MISMA fila que las
       mesas. Antes se llevaba un numero y no se veia en ningun lado, asi
       que en la rejilla faltaba el 2 y el que sirve no sabia por que. */
    const turnos = corre(`(() => {
        const t = Servicio.turnosDeSesion();
        const m3 = Servicio.sesionDeMesa(3).id;
        const m4 = Servicio.sesionDeMesa(4).id;
        const ll = Servicio.llevarAbiertos()[0].id;
        return [t[m3], t[ll], t[m4]];
    })()`);
    comprobar('mesa 3, funda y mesa 4 hacen fila seguida', turnos, [1, 2, 3]);

    /* En una funda todo va marcado para llevar, asi que los cubiertos
       dan cero: esa cuenta era para el caso mixto —dos pollos y uno se
       lo llevan— y aqui se queda corta. Por eso la pantalla enseña
       platos y no cubiertos: en una funda, cero platos seria mentira. */
    const ll = corre(`Servicio.llevarAbiertos()[0].id`);
    comprobar('los cubiertos de una funda dan cero',
        corre(`Servicio.cubiertosDeSesion('${ll}')`), 0);
    /* Se cuentan solo los platos fuertes, igual que hace la pantalla: la
       tarrina se agrega sola al pedido y contarla diria "4 platos" por
       dos pollos. */
    comprobar('pero los platos fuertes, no', corre(`(() => {
        const cs = Servicio.comandasDeSesion('${ll}');
        return cs.reduce((n, c) => n + c.items.reduce((m, i) => {
            const cat = Servicio.categoriaDe(i.platoId);
            return cat && cat.cubierto ? m + i.cantidad : m;
        }, 0), 0);
    })()`), 2);

    const js = fuente('js/servir.js');
    comprobar('por eso la pantalla cuenta platos, no cubiertos',
        /function platosDe/.test(js), true);
    comprobar('y las pinta desde lo que esta abierto',
        /Servicio\.llevarAbiertos\(\)/.test(js), true);
    comprobar('sigue sin tocar nada',
        /marcarEntregado|registrarPago|enviarComanda|cerrarSesion/.test(js), false);
}

/* ============================================================
   SERVIR EL PLATO DE OTRA FORMA

   El gerente abrió una opción nueva: el plato puede salir solo con
   patacones y ensalada. No se puede armar quitando —los patacones no
   están en una parrillada para poder quitarlos— así que se guarda por
   el resultado y de ahí sale todo lo demás.
   ============================================================ */

function probarFormaDeServir() {
    console.log('\n--- Solo patacones y ensalada ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    const ofrece = id => corre(`Servicio.cambiosDe('${id}').map(c => c.id)`);

    /* A quién se le ofrece. Una costilla viene con arroz, menestra,
       ensalada y plátano: el cambio tiene sentido. Un pescado ya viene
       con patacones y ensalada, pero también con arroz — así que
       también, solo que ahí el cambio es más corto. */
    comprobar('la costilla lo puede llevar',  ofrece('p3'), ['pat']);
    comprobar('el pescado también',           ofrece('f1'), ['pat']);
    comprobar('y el junior de pollo',         ofrece('j1'), ['pat']);

    /* A quién no. Una porción de pollo es carne sola; una cola no se
       emplata; y una porción de patacones ya ES patacones — ofrecerle
       "solo patacones y ensalada" sería un botón que no dice nada. */
    comprobar('una porción de proteína no',   ofrece('q1'), []);
    comprobar('una cola tampoco',             ofrece('b3'), []);
    comprobar('ni la porción de patacones',   ofrece('r4'), []);

    /* Con qué sale el plato al final. Esto es lo que emplata la cocina:
       no es "sin tres cosas", es un plato armado distinto. */
    const conQue = (platoId, it) =>
        corre(`Servicio.guarnicionFinal(${JSON.stringify({ platoId, ...it })}).sort()`);

    comprobar('la costilla normal sale con las cuatro',
        conQue('p3', {}), ['arroz', 'ensalada', 'menestra', 'platano']);
    comprobar('con el cambio sale solo con dos',
        conQue('p3', { cambio: 'pat' }), ['ensalada', 'patacones']);
    comprobar('y al pescado solo se le va el arroz',
        conQue('f1', { cambio: 'pat' }), ['ensalada', 'patacones']);
    comprobar('quitar a mano sigue funcionando igual',
        conQue('p3', { sin: ['menestra'] }), ['arroz', 'ensalada', 'platano']);

    /* La olla del arroz. Un plato servido de esta forma no lleva arroz,
       así que no puede seguir contándose como una porción pedida. */
    corre(`(() => {
        const t = Servicio.getComandas();
        t['n1'] = { id: 'n1', sesion: 's1', mesa: 3, creado: 1, estado: 'nuevo', items: [
            { uid: 'a', platoId: 'p3', nombre: 'Costilla', cantidad: 2, precio: 5.5, estacion: 'asador' },
            { uid: 'b', platoId: 'p3', nombre: 'Costilla', cantidad: 3, precio: 5.5, estacion: 'asador', cambio: 'pat' }
        ]};
        localStorage.setItem('srv_comandas', JSON.stringify(t));
    })()`);
    comprobar('las tres con patacones no gastan olla de arroz',
        corre(`Servicio.arrozPendiente()`), 2);

    /* EL PRECIO NO CAMBIA. Es lo que dijo el dueño con todas sus
       letras: una costilla con patacón y ensalada se cobra $5.50,
       igual que la costilla normal. */
    nubeLimpia();
    const { corre: c2 } = celular('mesero');
    c2(`Servicio.enviarComanda({ mesa: 5, items: [
        { platoId: 'p3', nombre: 'Costilla', precio: 5.50, cantidad: 1, cambio: 'pat' }] })`);

    comprobar('la costilla con patacones cuesta lo mismo',
        c2(`Servicio.cuentaDeMesa(5).total`), 5.50);
    comprobar('y el pedido se guarda con la forma en que se sirve',
        c2(`Object.values(Servicio.getComandas())[0].items[0].cambio`), 'pat');
    comprobar('la frase que lee la cocina',
        c2(`Servicio.comoSeSirve({ cambio: 'pat' })`), 'Solo patacones y ensalada');
    comprobar('un plato normal no dice nada',
        c2(`Servicio.comoSeSirve({ cambio: '' })`), '');

    /* QUIÉN LO VE. Lo dijo el dueño: al asador no le importa si va con
       patacones o sin menestra, él saca la proteína. La que necesita
       saberlo es la cocina, que es la que emplata y adorna. */
    const est = fuente('js/estacion.js');
    comprobar('la forma de servir se muestra solo en cocina',
        /ESTACION === 'cocina' && it\.cambio/.test(est), true);

    /* Y que no queden pedidos a medio armar: o se quita algo de como
       viene el plato, o se sirve de otra forma. Las dos a la vez la
       cocina no las puede leer. */
    const com = fuente('js/comanda.js');
    comprobar('elegir la forma borra lo que se había quitado',
        /if \(it\.cambio\) it\.sin = \[\];/.test(com), true);
    comprobar('y quitar algo borra la forma',
        /it\.cambio = '';\s*\/\/ o se quita/.test(com), true);

    // La porción nueva que pidió el gerente
    comprobar('existe la porción de plátano a $2.00',
        c2(`(() => { const p = Store.findPlato('r5'); return [p.nombre, p.precio]; })()`),
        ['Plátano', 2]);
}

/* ============================================================
   LO QUE HAY EN LA NEVERA

   Se prueba el caso que describió el dueño con sus palabras: "solo
   quedan 3 pollos, eso quiere decir que si alguien quiere 3 pollos
   asados ya no habrá pollos para apanado de pollo o para sacar una
   porción". Y el otro, que es distinto: "si quedan tres pollos pero ya
   no tengo apanadura, que dé la opción de colocar agotado al apanado
   pero el pollo asado y porción de pollo sigan disponibles".
   ============================================================ */

function probarStock() {
    console.log('\n--- Lo que hay en la nevera ---');
    nubeLimpia();
    const { corre } = celular('mesero');

    // De qué producto sale cada plato
    comprobar('el pollo asado sale del pollo',    corre(`Servicio.productoDe('p5')`), 'pollo');
    comprobar('el pollo apanado también',         corre(`Servicio.productoDe('a1')`), 'pollo');
    comprobar('y la porción de pollo también',    corre(`Servicio.productoDe('q1')`), 'pollo');
    comprobar('el junior de pollo también',       corre(`Servicio.productoDe('j1')`), 'pollo');
    /* Un plato que no comparte nada es su propio producto: así se le
       puede poner número a cualquier cosa de la carta sin declararla. */
    comprobar('una porción de arroz es lo suyo',  corre(`Servicio.productoDe('r1')`), 'r1');

    // Sin número puesto, todo se vende como siempre
    comprobar('sin número no hay límite', corre(`Servicio.quedanDe('pollo')`), null);
    comprobar('y todo se puede pedir',    corre(`Servicio.sePuedePedir('p5')`), true);

    /* ---- "Solo quedan 3 pollos" ---- */
    corre(`Store.setStock('pollo', 3)`);
    comprobar('el gerente pone 3 pollos', corre(`Servicio.quedanDe('pollo')`), 3);

    corre(`Servicio.enviarComanda({ mesa: 2, items: [
        { platoId: 'p5', nombre: 'Pollo Asado', precio: 3.5, cantidad: 2 }] })`);
    comprobar('se venden 2 asados y quedan 1', corre(`Servicio.quedanDe('pollo')`), 1);

    /* Aquí está el asunto: el pollo se lo llevó el ASADO, pero el que se
       queda sin nada es el APANADO — y la porción, y el junior. */
    corre(`Servicio.enviarComanda({ mesa: 3, items: [
        { platoId: 'a1', nombre: 'Pollo Apanado', precio: 5, cantidad: 1 }] })`);
    comprobar('un apanado se lleva el último', corre(`Servicio.quedanDe('pollo')`), 0);

    comprobar('ya no se puede pedir pollo asado',    corre(`Servicio.sePuedePedir('p5')`), false);
    comprobar('ni pollo apanado',                    corre(`Servicio.sePuedePedir('a1')`), false);
    comprobar('ni porción de pollo',                 corre(`Servicio.sePuedePedir('q1')`), false);
    comprobar('ni junior de pollo',                  corre(`Servicio.sePuedePedir('j1')`), false);
    // Y nada de esto toca a la carne, que es otra nevera
    comprobar('la carne asada sigue vendiéndose',    corre(`Servicio.sePuedePedir('p1')`), true);

    /* Anular devuelve el pollo solo: como se resta y no se descuenta, no
       hay que acordarse de sumar nada. */
    const id = corre(`Object.values(Servicio.getComandas()).find(c => c.mesa === 3).id`);
    corre(`Servicio.anularComanda('${id}', 'se equivocó')`);
    comprobar('anular devuelve el pollo',            corre(`Servicio.quedanDe('pollo')`), 1);
    comprobar('y se vuelve a poder pedir',           corre(`Servicio.sePuedePedir('a1')`), true);

    /* ---- El otro caso: se acabó la apanadura ---- */
    corre(`Store.toggleAgotado('a1')`);
    comprobar('el apanado apagado a mano no se pide', corre(`Servicio.sePuedePedir('a1')`), false);
    comprobar('pero el pollo asado sigue vivo',       corre(`Servicio.sePuedePedir('p5')`), true);
    comprobar('y la porción de pollo también',        corre(`Servicio.sePuedePedir('q1')`), true);
    corre(`Store.toggleAgotado('a1')`);

    /* ---- Un mixto gasta las carnes que se escogieron ---- */
    nubeLimpia();
    const { corre: c2 } = celular('mesero');
    c2(`Store.setStock('pollo', 4)`);
    c2(`Store.setStock('costilla', 2)`);
    c2(`Servicio.enviarComanda({ mesa: 6, items: [
        { platoId: 'm2', nombre: 'Mixto 2 Carnes Especial', precio: 7, cantidad: 2,
          elegidas: ['p3', 'p5'] }] })`);
    comprobar('dos mixtos se llevan dos costillas', c2(`Servicio.quedanDe('costilla')`), 0);
    comprobar('y dos pollos',                       c2(`Servicio.quedanDe('pollo')`), 2);
    /* El mixto no se cae por quedarse sin una carne: le quedan otras
       para escoger. La que se acabó es la que no se puede elegir. */
    comprobar('el mixto sigue en pie',              c2(`Servicio.sePuedePedir('m2')`), true);
    comprobar('la costilla suelta no',              c2(`Servicio.sePuedePedir('p3')`), false);

    /* ---- El número de ayer no vale hoy ---- */
    const ayer = Date.now() - 26 * 60 * 60 * 1000;
    c2(`localStorage.setItem('menu_stock', JSON.stringify(
        { pescado: { hay: 0, puesto: ${ayer} } }))`);
    comprobar('el stock de ayer venció',   c2(`Servicio.quedanDe('pescado')`), null);
    comprobar('y el plato se vende igual', c2(`Servicio.sePuedePedir('f1')`), true);

    /* ---- El espejo que lee la carta del comensal ---- */
    nubeLimpia();
    const { corre: c3, propio } = celular('mesero');
    c3(`Store.setStock('camaron', 5)`);
    c3(`Servicio.enviarComanda({ mesa: 8, items: [
        { platoId: 'c1', nombre: 'Camarón Apanado', precio: 6, cantidad: 2 }] })`);

    comprobar('el espejo dice cuántos quedan',
        c3(`Store.getEspejo().camaron`), 3);
    /* Los tres platos de camarón beben del mismo número: el celular del
       comensal no sabe restar, pero sí sabe cuál es su producto. */
    comprobar('el espejo se publica a la nube',
        propio.enviado.some(e => e.rama === 'stock' && e.valor.camaron === 3), true);

    // Y las pantallas que no toman pedidos no escriben en el menú
    nubeLimpia();
    const { corre: c4, propio: p4 } = celular('cocina');
    c4(`Store.setStock('camaron', 5)`);
    c4(`Servicio.marcarEntregado('x')`);
    comprobar('la cocina no publica el stock',
        p4.enviado.some(e => e.rama === 'stock'), false);

    /* ---- Pedir más de los que hay pone los que hay ----

       El dueño lo pilló probando: con un pollo disponible escribió dos
       apanados y NO ENTRÓ NINGUNO. Desde la mesa eso es "toqué y no pasó
       nada". Ahora entra el que hay y se dice cuántos entraron. */
    const com = fuente('js/comanda.js');
    comprobar('no se rechaza el renglón entero',
        /piden = quedan;/.test(com), true);
    comprobar('y se dice cuántos entraron de verdad',
        /puse \$\{quedan\}, no \$\{piden\}/.test(com), true);
    comprobar('mientras escribe ya se le avisa',
        /solo quedan \$\{r\.tope\}/.test(com), true);

    /* ---- LA CARRERA: dos celulares tomando pedido a la vez ----

       Lo encontró el dueño probando: el mesero y el asador ven 6
       costillas cada uno, los dos anotan 6 y los dos envían. Salían 12 a
       la parrilla existiendo 6. Los dos celulares tenían razón —un
       pedido a medio escribir no existe para nadie más— así que la
       resta sola no podía verlo. Se pregunta al final. */
    nubeLimpia();
    const A = celular('mesero');
    const B = celular('parrilla');

    /* Las dos pantallas comparten la nevera y las comandas, que es lo que
       pasa de verdad: el mismo Firebase para los dos celulares. */
    const sincronizar = () => {
        const comandas = A.corre(`localStorage.getItem('srv_comandas')`) || '{}';
        B.corre(`localStorage.setItem('srv_comandas', ${JSON.stringify(comandas)})`);
    };

    [A, B].forEach(c => c.corre(`Store.setStock('costilla', 6)`));
    comprobar('los dos ven 6 costillas',
        [A.corre(`Servicio.quedanDe('costilla')`), B.corre(`Servicio.quedanDe('costilla')`)],
        [6, 6]);

    // El mesero manda sus 6 primero
    A.corre(`Servicio.enviarComanda({ mesa: 2, items: [
        { platoId: 'p3', nombre: 'Costilla', precio: 5.5, cantidad: 6 }] })`);

    /* El asador todavía no se enteró: su pantalla sigue diciendo 6, y
       está en su derecho. Lo que no puede es mandarlas. */
    comprobar('el asador todavía cree que quedan 6',
        B.corre(`Servicio.quedanDe('costilla')`), 6);

    sincronizar();   // esto es lo que hace revisarStock: traer lo último

    const revisado = B.corre(`(() => {
        const r = { items: [], recortes: [] };
        const items = [
            { platoId: 'p3', nombre: 'Costilla', precio: 5.5, cantidad: 6 },
            { platoId: 'b3', nombre: 'Cola personal', precio: 0.5, cantidad: 2 }
        ];
        // Se llama a la parte que cuenta, sin la vuelta a la nube
        const restante = {};
        const queda = p => {
            if (!(p in restante)) {
                const q = Servicio.quedanDe(p);
                restante[p] = (q === null) ? 99999 : q;
            }
            return restante[p];
        };
        items.forEach(it => {
            const consumo = Servicio.consumoDe(it);
            const productos = Object.keys(consumo);
            let caben = it.cantidad;
            productos.forEach(prod => {
                const porUnidad = consumo[prod] / it.cantidad;
                if (porUnidad > 0) caben = Math.min(caben, Math.floor(queda(prod) / porUnidad));
            });
            caben = Math.max(0, caben);
            productos.forEach(prod => { restante[prod] -= consumo[prod] / it.cantidad * caben; });
            if (caben > 0) r.items.push({ nombre: it.nombre, cantidad: caben });
            if (caben < it.cantidad) r.recortes.push({ nombre: it.nombre, entraron: caben });
        });
        return r;
    })()`);

    comprobar('las 6 costillas del asador NO entran',
        revisado.recortes.map(r => r.nombre + ':' + r.entraron), ['Costilla:0']);
    /* Pero las colas del mismo pedido sí salen: no tienen la culpa, y la
       mesa no puede quedarse sin nada porque faltara una costilla. */
    comprobar('pero sus colas salen igual',
        revisado.items.map(i => i.cantidad + ' ' + i.nombre), ['2 Cola personal']);

    // Y la comprobación de verdad va contra la nube antes de escribir
    const srv = fuente('js/servicio.js');
    comprobar('se le pregunta a la nube antes de mandar',
        /async function revisarStock[\s\S]{0,900}Red\.leer\('servicio\/comandas'/.test(srv), true);
    comprobar('y la comanda se manda ya recortada',
        /const revisado = await Servicio\.revisarStock\(borrador\)/.test(com) &&
        /items: aMandar/.test(com), true);
    comprobar('con un aviso que no se va solo',
        /avisarRecorte\(recortes, true\)/.test(com), true);

    // Y la regla de la nube deja leerlo sin cuenta pero no escribirlo a cualquiera
    const reglas = JSON.parse(fuente('firebase-rules.json')).rules;
    comprobar('el espejo lo puede leer la carta', reglas.stock['.read'], true);
    comprobar('pero solo lo escribe quien toma pedidos',
        /YHeMmcUbMFdsPQrIcvT561FDunt1/.test(reglas.stock['.write']) &&
        !/rgi36tpn1KNHeDEqJN17dpbWguy2/.test(reglas.stock['.write']), true);
}

/* ============================================================
   LOS DOS ERRORES DEL PRIMER SERVICIO DE VERDAD

   No son casos inventados: los dos pasaron con gente en las mesas.
   ============================================================ */

async function probarBebidaDeLaTienda() {
    console.log('\n--- "Otra bebida" no se puede haber acabado ---');
    nubeLimpia();
    const { corre } = pantallaComanda();

    /* Una cerveza de la tienda de al lado. NO está en menu-data.js: se
       crea al vuelo con id 'x…'. El candado del stock preguntaba por
       ella al menú, no la encontraba y la daba por agotada — en el salón
       salía "Se acabó el xmsdwl45nppiz7". */
    const extra = corre(`Servicio.guardarExtra('Pilsener', 2.50)`);
    comprobar('la bebida de la tienda no está en el menú',
        corre(`!!Store.findPlato('${extra.id}')`), false);

    comprobar('y aun así se puede pedir',
        corre(`Servicio.sePuedePedir('${extra.id}')`), true);

    corre(`verMesa(6)`);
    corre(`agregarAlBorrador({ id: '${extra.id}', nombre: 'Pilsener', precio: 2.5 }, 1)`);
    comprobar('entra al pedido',
        corre(`borrador.map(i => i.nombre)`), ['Pilsener']);

    // Y sigue entrando aunque el local tenga stock puesto en otras cosas
    corre(`Store.setStock('pollo', 0)`);
    corre(`agregarAlBorrador({ id: '${extra.id}', nombre: 'Pilsener', precio: 2.5 }, 1)`);
    comprobar('el stock de otra cosa no la estorba',
        corre(`borrador.find(i => i.nombre === 'Pilsener').cantidad`), 2);
    comprobar('pero el pollo sí está agotado',
        corre(`Servicio.sePuedePedir('p5')`), false);
}

async function probarCambiarBebidaYaServida() {
    console.log('\n--- La mesa cambia el jugo por una cola con el plato ya servido ---');
    nubeLimpia();
    const { corre } = pantallaComanda();

    /* Tal cual pasó: mesa 2 pide 4 pollos y 2 jugos de mora. La cocina
       marca entregado. Al llevar los jugos, la mesa cambia uno por una
       cola de litro — y no lo dejaba tocar. */
    corre(`verMesa(2)`);
    corre(`agregarAlBorrador(Store.findPlato('p5'), 4)`);   // 4 pollos
    corre(`agregarAlBorrador(Store.findPlato('b2'), 2)`);   // 2 jugos de mora
    await corre.esperando(`enviar()`);

    const id = corre(`Servicio.tandasDe({ mesa: 2 })[0].id`);
    corre(`Servicio.marcarEntregado('${id}')`);
    comprobar('la cocina la entregó',
        corre(`Servicio.getComandas()['${id}'].estado`), 'entregado');

    // Antes esto decía 'no' y el mesero se quedaba con el jugo en la mano
    comprobar('servida no es cerrada: se puede tocar',
        corre(`Servicio.edicionDe(Servicio.getComandas()['${id}'])`), 'agregados');

    corre(`abrirEdicion('${id}')`);

    /* Lo que se cocinó queda bloqueado; la bebida no. Es lo que pidió el
       dueño: bebidas y porciones sí, porciones de proteína no. */
    const bloqueos = corre(`borrador.map(i => i.nombre + ':' + (i.bloqueado ? 'no' : 'si'))`);
    comprobar('el pollo no se toca, el jugo sí',
        bloqueos, ['Pollo Asado:no', 'Jugo de Mora:si']);

    // Se le quita un jugo y se le pone una cola de litro
    const uidJugo = corre(`borrador.find(i => i.platoId === 'b2').uid`);
    corre(`(() => { const it = borrador.find(i => i.uid === '${uidJugo}'); it.cantidad = 1; })()`);
    corre(`agregarAlBorrador(Store.findPlato('b4'), 1)`);   // Cola 1 L
    corre(`guardarEdicion()`);

    const quedo = corre(`Servicio.tandasDe({ mesa: 2 })
        .flatMap(c => c.items).map(i => i.cantidad + ' ' + i.nombre)`);
    comprobar('quedó 1 jugo y 1 cola de litro',
        quedo, ['4 Pollo Asado', '1 Jugo de Mora', '1 Cola 1 L']);

    /* La bebida no va a ninguna estación, así que NO reabre la tanda ni
       le vuelve a salir a la cocina lo que ya entregó. */
    comprobar('la tanda sigue entregada',
        corre(`Servicio.getComandas()['${id}'].estado`), 'entregado');
    comprobar('y a la cocina no le vuelve a salir',
        corre(`Servicio.comandasDe('cocina').length`), 0);

    // La cuenta se ajusta sola: se fue un jugo de 1.00 y entró una cola de 1.50
    comprobar('la cuenta cuadra', corre(`Servicio.cuentaDe({ mesa: 2 }).total`), 16.5);

    /* Y el límite que puso el dueño: cobrada la mesa, se acabó de tocar. */
    corre(`(() => {
        const c = Servicio.cuentaDe({ mesa: 2 });
        Servicio.registrarPago({ mesa: 2, forma: 'efectivo',
            lineas: c.items.map(l => ({ platoId: l.platoId, precio: l.precio, cantidad: l.pendiente })) });
    })()`);
    comprobar('cobrada la mesa, ya no se toca',
        corre(`Servicio.edicionDe(Servicio.getComandas()['${id}'])`), 'no');
}

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
    await probarAgregarATandaEnMarcha();
    probarLlavesDeCampos();
    await probarCorreccionDelMesero();
    probarEcoDeLaNube();
    await probarEnviosJuntos();
    await probarCambioDeServicio();
    probarTableroParrilla();
    probarArrozPendiente();
    probarEscaleraDeTurnos();
    probarTurnosDeMesa();
    probarCubiertosDeLaMesa();
    probarPantallaDeServir();
    probarCuentaDeServir();
    probarPorQueNoEntro();
    probarLlevarEnServir();
    probarFormaDeServir();
    probarStock();
    await probarBebidaDeLaTienda();
    await probarCambiarBebidaYaServida();
    await probarTomarPedido();
    await probarAvisoDePedidoNuevo();
    await probarPedidoQueEntraMientrasSuena();
    await probarAvisoIndependienteDelDibujo();
    await probarAyudante();
    probarInstalable();
    probarCifradoDeAvisos();
    await probarRecepcionDeAvisos();
    probarPermisosDeAvisos();

    console.log(fallos ? `\n${fallos} comprobación(es) FALLARON. No subas todavía.` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
}

main();
