/**
 * GENERAR-CLAVE-PUSH.JS  —  La clave con la que se firman los avisos
 *
 *     node scripts/generar-clave-push.js
 *
 * CUÁNDO CORRERLO: **una sola vez por restaurante**, al montarlo. Después
 * nunca más.
 *
 * Si se vuelve a correr, la clave cambia y TODOS los celulares dejan de
 * recibir avisos hasta que cada uno vuelva a activarlos a mano. No es
 * grave, pero hay que ir aparato por aparato.
 *
 * PARA QUÉ SIRVE
 * --------------
 * Un aviso que despierta un celular apagado no lo manda el sitio: lo
 * manda Google. Y Google no reparte avisos a quien se los pida —
 * cualquiera podría hacer sonar la cocina de un restaurante ajeno. Así
 * que exige que vayan firmados.
 *
 * Aquí se fabrica ese par de claves:
 *
 *   PÚBLICA   va en js/menu-data.js y la ve todo el mundo. Es la que el
 *             celular le enseña a Google al decir "acepto avisos de este
 *             sitio y de ninguno más".
 *   PRIVADA   NO va al repositorio. Con ella se firman los avisos, así
 *             que quien la tenga puede hacer sonar las pantallas del
 *             local. Va donde viva el que los manda, y en ningún otro
 *             sitio.
 *
 * No hace falta instalar nada: usa el mismo Node que genera la clave del
 * panel.
 */

const { generateKeyPairSync } = require('crypto');

/**
 * Base64 del que se usa en direcciones web: sin +, sin / y sin el
 * relleno de iguales. Es el único que aceptan tanto el navegador como
 * los servidores de avisos.
 */
const base64url = buf => Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const deBase64url = s => Buffer.from(s, 'base64url');

function generar() {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' });

    /* La pública son las dos coordenadas del punto, una detrás de otra,
       con un 4 delante que significa "van sin comprimir". Son los 65
       bytes exactos que espera el navegador; en cualquier otra forma los
       rechaza sin decir por qué. */
    const publica = Buffer.concat([
        Buffer.from([4]), deBase64url(jwk.x), deBase64url(jwk.y)
    ]);

    return { publica: base64url(publica), privada: jwk.d };
}

const { publica, privada } = generar();

console.log(`
Las dos claves de los avisos. Se generan una vez y no se vuelven a tocar.

──────────────────────────────────────────────────────────────────────
1. LA PÚBLICA  →  pégala en js/menu-data.js
──────────────────────────────────────────────────────────────────────

const PUSH = {
    clave: '${publica}'
};

──────────────────────────────────────────────────────────────────────
2. LA PRIVADA  →  guárdala fuera del repositorio
──────────────────────────────────────────────────────────────────────

${privada}

   Con esta clave se puede hacer sonar cualquier pantalla del local.
   NO la subas a GitHub. Guárdala donde guardes las contraseñas y
   pásasela solo a quien vaya a mandar los avisos.

   Para probar desde este computador, ponla en una variable de entorno
   y no en un archivo:

     Windows (PowerShell)   $env:CLAVE_PUSH = '${privada}'
     Linux o Mac            export CLAVE_PUSH='${privada}'
──────────────────────────────────────────────────────────────────────
`);
