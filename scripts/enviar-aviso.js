/**
 * ENVIAR-AVISO.JS  —  Mandar un aviso a mano, para probar
 *
 *     node scripts/enviar-aviso.js                 a todos los apuntados
 *     node scripts/enviar-aviso.js cocina          solo a la cocina
 *     node scripts/enviar-aviso.js parrilla "Texto de prueba"
 *     node scripts/enviar-aviso.js --lista         solo mirar quién hay
 *
 * ANTES HACE FALTA:
 *
 *   $env:CLAVE_PUSH   = '...'   (la privada de generar-clave-push.js)
 *   $env:CORREO_PUSH  = '...'   (la cuenta del gerente)
 *   $env:CLAVE_GERENTE= '...'   (su contraseña)
 *
 * En Linux o Mac, `export` en vez de `$env:`.
 *
 * PARA QUÉ SIRVE
 * --------------
 * Comprueba de punta a punta lo que no se puede comprobar de otra
 * forma: que un celular guardado en el bolsillo, con la pantalla
 * apagada, suene. Si esto funciona, el resto es decidir cuándo mandarlo.
 *
 * No toca las comandas ni el servicio. Solo manda el aviso.
 */

const { mandar } = require('./avisar.js');

const CFG = leerConfig();

function leerConfig() {
    /* Se sacan del propio menu-data.js en vez de escribirlas otra vez
       aquí: dos copias de la misma dirección terminan siendo dos
       direcciones distintas. */
    const fs = require('fs');
    const path = require('path');
    const fuente = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'menu-data.js'), 'utf8');

    const sacar = (objeto, campo) => {
        const bloque = new RegExp(`const ${objeto}\\s*=\\s*\\{[\\s\\S]*?\\n\\};`).exec(fuente);
        if (!bloque) return '';
        const m = new RegExp(`${campo}\\s*:\\s*'([^']*)'`).exec(bloque[0]);
        return m ? m[1] : '';
    };

    return {
        bd: sacar('FIREBASE', 'databaseURL').replace(/\/$/, ''),
        apiKey: sacar('FIREBASE', 'apiKey'),
        contacto: sacar('PUSH', 'contacto'),
        clavePublica: sacar('PUSH', 'clave')
    };
}

/** Entra con la cuenta del gerente, que es la única que lee los apuntes. */
async function entrar(correo, clave) {
    const r = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CFG.apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: correo, password: clave, returnSecureToken: true })
        });

    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || 'no se pudo entrar');
    return d.idToken;
}

async function leerApuntados(token, rol) {
    const rama = rol ? `avisos/${rol}` : 'avisos';
    const r = await fetch(`${CFG.bd}/${rama}.json?auth=${encodeURIComponent(token)}`);
    if (!r.ok) {
        const detalle = await r.text().catch(() => '');
        throw new Error(`${r.status} al leer "${rama}". ${detalle.slice(0, 140)}`);
    }
    const datos = await r.json();
    if (!datos) return [];

    /* Sin rol, lo que vuelve son los papeles y dentro los aparatos. Con
       rol, directamente los aparatos. Se aplana a una sola lista.

       `llave` es el nombre del nodo y `aparato` es lo que dice el
       apunte ("Android (instalada)"). Son dos cosas distintas y hay que
       llamarlas distinto: al principio las dos se llamaban `aparato` y
       una se comía a la otra. */
    const lista = [];
    Object.entries(datos).forEach(([clave, valor]) => {
        if (rol) lista.push({ ...valor, rol, llave: clave });
        else Object.entries(valor || {}).forEach(([k, v]) =>
            lista.push({ ...v, rol: clave, llave: k }));
    });
    return lista.filter(x => x.endpoint);
}

/** Lo tira de la nube. Un buzón que ya no existe no se reintenta. */
async function borrar(token, rol, aparato) {
    await fetch(`${CFG.bd}/avisos/${rol}/${aparato}.json?auth=${encodeURIComponent(token)}`,
        { method: 'DELETE' }).catch(() => {});
}

const ICONOS = {
    cocina:   'img/app/cocina-192.png',
    parrilla: 'img/app/parrilla-192.png',
    mesero:   'img/app/comanda-192.png'
};

const PANTALLAS = {
    cocina:   'cocina.html',
    parrilla: 'parrilla.html',
    mesero:   'comanda.html'
};

async function main() {
    const args = process.argv.slice(2);
    const soloMirar = args.includes('--lista');
    const rol = args.find(a => !a.startsWith('--') && ['cocina', 'parrilla', 'mesero'].includes(a));
    const texto = args.find(a => !a.startsWith('--') && a !== rol);

    const privada = process.env.CLAVE_PUSH;
    const correo  = process.env.CORREO_PUSH;
    const clave   = process.env.CLAVE_GERENTE;

    if (!CFG.clavePublica) {
        console.error('\nEste local todavía no tiene los avisos montados.');
        console.error('Corre  node scripts/generar-clave-push.js  y pega la clave pública');
        console.error('en js/menu-data.js.\n');
        process.exit(1);
    }
    if (!correo || !clave) {
        console.error('\nFaltan las credenciales del gerente. En PowerShell:\n');
        console.error("  $env:CORREO_PUSH   = 'eduardolino78@gmail.com'");
        console.error("  $env:CLAVE_GERENTE = '...'\n");
        process.exit(1);
    }
    if (!soloMirar && !privada) {
        console.error('\nFalta la clave privada de los avisos:\n');
        console.error("  $env:CLAVE_PUSH = '...'   (la que imprimió generar-clave-push.js)\n");
        process.exit(1);
    }

    const token = await entrar(correo, clave);
    const apuntados = await leerApuntados(token, rol);

    if (!apuntados.length) {
        console.log(`\nNo hay ningún aparato apuntado${rol ? ' en ' + rol : ''}.`);
        console.log('Abre la pantalla en el celular y toca "Avisarme aunque esté guardado".\n');
        return;
    }

    console.log(`\n${apuntados.length} aparato(s) apuntado(s):\n`);
    console.log('  papel     correo                      aparato               apuntado');
    console.log('  ' + '-'.repeat(78));
    apuntados.forEach(a => {
        console.log('  ' +
            String(a.rol).padEnd(10) +
            String(a.correo || '—').padEnd(28) +
            String(a.aparato || '—').padEnd(22) +
            (a.creado ? new Date(a.creado).toLocaleString('es-EC') : '—'));
    });

    if (soloMirar) { console.log(); return; }

    console.log('\nMandando…\n');

    let bien = 0, mal = 0, tirados = 0;

    for (const a of apuntados) {
        const r = await mandar(a, {
            titulo: texto ? 'Prueba' : `Prueba — ${a.rol}`,
            cuerpo: texto || 'Si ves esto con la pantalla apagada, funciona.',
            icono: ICONOS[a.rol] || ICONOS.cocina,
            destino: PANTALLAS[a.rol] || 'cocina.html',
            grupo: 'prueba'
        }, { privada, contacto: CFG.contacto });

        const quien = `${a.rol}/${String(a.llave).slice(0, 8)}  ${a.aparato || ''} ${a.correo || ''}`.trim();

        if (r.ok) { bien++; console.log(`  OK      ${quien}`); }
        else if (r.caduco) {
            /* No es un fallo: ese aparato ya no existe. Se desinstaló la
               aplicación o se borraron los datos. Se tira el apunte, o se
               queda ahí para siempre haciendo ruido en cada envío. */
            tirados++;
            await borrar(token, a.rol, a.llave);
            console.log(`  TIRADO  ${quien}  (ya no existe, apunte borrado)`);
        }
        else { mal++; console.log(`  FALLA   ${quien}\n            ${r.motivo}`); }
    }

    console.log(`\n${bien} entregado(s), ${mal} con fallo, ${tirados} apunte(s) tirado(s).\n`);

    if (bien) {
        console.log('Si el celular estaba con la pantalla apagada y sonó, la Fase 4 está.');
        console.log('Si no sonó, míralo con la pantalla encendida antes de tocar nada más.\n');
    }
}

main().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1); });
