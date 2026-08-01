/**
 * Genera la clave del panel para un restaurante.
 *
 *     node scripts/generar-clave.js "LaClaveQueQuiera"
 *
 * Imprime dos líneas para pegar en js/menu-data.js. La clave en sí nunca
 * queda escrita en el código: solo su huella, que no se puede revertir.
 *
 * IMPORTANTE: usa una clave larga, no 4 números. Como el repositorio es
 * público, cualquiera puede tomar la huella y probar combinaciones en su
 * propia computadora. Cuatro dígitos son 10.000 combinaciones: se prueban
 * todas. Una frase de 12 caracteres o más no se rompe por fuerza bruta.
 */

const crypto = require('crypto');

const ITERACIONES = 200000;   // debe coincidir con panel.js
const LARGO       = 32;

const clave = process.argv[2];

if (!clave) {
    console.error('\nFalta la clave.\n\n  node scripts/generar-clave.js "MiClaveSegura"\n');
    process.exit(1);
}

if (clave.length < 8) {
    console.error(`\nEsa clave tiene ${clave.length} caracteres: es muy corta.`);
    console.error('Usa al menos 8, e idealmente una frase de 12 o más.\n');
    process.exit(1);
}

const sal  = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(clave, sal, ITERACIONES, LARGO, 'sha256').toString('hex');

const aviso =
    clave.length < 12
        ? '\n  Aviso: con menos de 12 caracteres la clave es adivinable por fuerza bruta.\n'
        : '';

console.log(`
Pega estas dos líneas en js/menu-data.js, dentro de RESTAURANTE:

    panelSal:   '${sal}',
    panelHash:  '${hash}',

La clave para entrar es la que escribiste. Guárdala: no se puede recuperar
desde el hash, si se pierde hay que generar una nueva.${aviso}`);
