/**
 * AVISAR.JS  —  Mandar un aviso que despierte el celular
 *
 * Se usa desde scripts/enviar-aviso.js y, más adelante, desde lo que
 * mande los avisos de verdad. Aquí no hay nada de comandas: solo cómo se
 * empaqueta y se firma un aviso.
 *
 * POR QUÉ ESTÁ ESCRITO A MANO
 * ---------------------------
 * Hay una librería que hace esto (`web-push`) y son cuatro líneas. Pero
 * este proyecto no tiene ni una sola dependencia: se instala copiando
 * archivos y funciona con el Node que ya está puesto. Cambiar eso por
 * ahorrarse cien líneas que no se van a volver a tocar sale caro el día
 * que alguien tenga que montarlo en otro computador.
 *
 * Todo lo que sigue es el estándar Web Push:
 *
 *   RFC 8292  cómo se firma, para que Google sepa que el aviso es de
 *             este sitio y no de cualquiera
 *   RFC 8291  cómo se cifra, para que solo lo pueda leer el celular al
 *             que va — ni Google ni nadie por el camino
 *   RFC 8188  cómo se empaqueta lo cifrado
 *
 * Está comprobado contra el ejemplo oficial del RFC 8291: si algún día
 * deja de dar el mismo resultado byte por byte, la prueba lo dice.
 */

const {
    createECDH, createHmac, createCipheriv, createSign,
    randomBytes, createPrivateKey
} = require('crypto');

const b64u  = b => Buffer.from(b).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Buffer.from(String(s), 'base64url');

const hmac = (clave, dato) => createHmac('sha256', clave).update(dato).digest();

/** Deriva una clave a partir de otra. Es el HKDF de siempre. */
const derivar = (sal, material, info, largo) =>
    hmac(hmac(sal, material), Buffer.concat([info, Buffer.from([1])])).subarray(0, largo);

/* ============================================================
   CIFRAR EL MENSAJE  (RFC 8291 + RFC 8188)

   El aviso pasa por los servidores de Google, así que va cifrado con
   una clave que solo tienen este remitente y ese celular concreto. Ni
   Google puede leer lo que dice.
   ============================================================ */

/**
 * @param destino  lo que guardó el celular: { p256dh, auth }
 * @param mensaje  el texto (JSON) que se le manda
 * @param fijas    solo para la prueba del RFC: fuerza la sal y la clave
 *                 de un solo uso, que si no son al azar y no se puede
 *                 comparar con nada.
 */
function cifrar(destino, mensaje, fijas) {
    const suClave = deB64u(destino.p256dh);      // la pública del celular
    const suSecreto = deB64u(destino.auth);      // su secreto compartido

    /* Una clave de un solo uso para este aviso. Si se repitiera en dos
       avisos, quien viera los dos podría deshacer el cifrado. */
    const efimera = createECDH('prime256v1');
    if (fijas && fijas.privada) efimera.setPrivateKey(deB64u(fijas.privada));
    else efimera.generateKeys();

    const miClave = efimera.getPublicKey();      // 65 bytes, sin comprimir
    const compartido = efimera.computeSecret(suClave);
    const sal = fijas && fijas.sal ? deB64u(fijas.sal) : randomBytes(16);

    /* De aquí sale el material del que cuelga todo lo demás. El "info"
       lleva dentro las dos claves públicas, así que el resultado solo
       vale para esta pareja de remitente y celular. */
    const material = derivar(suSecreto, compartido, Buffer.concat([
        Buffer.from('WebPush: info\0'), suClave, miClave
    ]), 32);

    const prk = hmac(sal, material);
    const llave = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

    /* El 2 del final dice "aquí se acaba, no viene otro trozo". Va
       DENTRO de lo cifrado a propósito: si fuera por fuera, cualquiera
       podría cortar el mensaje por la mitad sin que se notara. */
    const claro = Buffer.concat([Buffer.from(mensaje, 'utf8'), Buffer.from([2])]);

    const cifrador = createCipheriv('aes-128-gcm', llave, nonce);
    const cuerpo = Buffer.concat([cifrador.update(claro), cifrador.final(), cifrador.getAuthTag()]);

    const tamano = Buffer.alloc(4);
    tamano.writeUInt32BE(4096);

    // sal | tamaño de trozo | cuántos bytes mide mi clave | mi clave | lo cifrado
    return Buffer.concat([sal, tamano, Buffer.from([miClave.length]), miClave, cuerpo]);
}

/* ============================================================
   FIRMAR  (RFC 8292)

   Google no le reparte avisos a cualquiera: si no, cualquiera podría
   hacer sonar la cocina de un restaurante ajeno. El aviso va firmado
   con la clave privada del local, y la pública ya la conoce el celular
   porque es la que aceptó al activarlos.
   ============================================================ */

function firmar(endpoint, privada, contacto) {
    const destino = new URL(endpoint);

    const cabeza = { typ: 'JWT', alg: 'ES256' };
    const cuerpo = {
        aud: destino.origin,
        // Doce horas. Más no lo aceptan, y menos obligaría a rehacerla
        // en mitad de un servicio.
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: contacto || 'mailto:avisos@carbon.local'
    };

    const sinFirma = b64u(JSON.stringify(cabeza)) + '.' + b64u(JSON.stringify(cuerpo));

    /* La clave llega como los 32 bytes pelados que imprime
       generar-clave-push.js. Node quiere un JWK, así que se rehacen las
       coordenadas públicas a partir de ella. */
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(deB64u(privada));
    const publica = ecdh.getPublicKey();

    const llave = createPrivateKey({
        key: {
            kty: 'EC', crv: 'P-256',
            x: b64u(publica.subarray(1, 33)),
            y: b64u(publica.subarray(33, 65)),
            d: privada
        },
        format: 'jwk'
    });

    /* En crudo y no en DER: es la diferencia entre que el aviso salga o
       que rebote con un 401 que no explica nada. */
    const firma = createSign('SHA256').update(sinFirma).end()
        .sign({ key: llave, dsaEncoding: 'ieee-p1363' });

    return { jwt: sinFirma + '.' + b64u(firma), publica: b64u(publica) };
}

/* ============================================================
   MANDARLO
   ============================================================ */

/**
 * @param destino  { endpoint, p256dh, auth } tal como lo guardó el celular
 * @param datos    objeto que recibirá el service worker
 * @param opciones { privada, contacto, urgencia, vida }
 *
 * Devuelve { ok, status, motivo }. El 404 y el 410 son especiales: no
 * son un fallo, son "este celular ya no existe" — se desinstaló la
 * aplicación o se borraron los datos. Esa suscripción hay que tirarla,
 * no reintentarla, o se queda ahí para siempre.
 */
async function mandar(destino, datos, opciones) {
    const o = opciones || {};
    if (!o.privada) return { ok: false, status: 0, motivo: 'Falta la clave privada' };

    let cuerpo, firma;
    try {
        cuerpo = cifrar(destino, JSON.stringify(datos), o.fijas);
        firma  = firmar(destino.endpoint, o.privada, o.contacto);
    } catch (e) {
        return { ok: false, status: 0, motivo: 'No se pudo preparar: ' + e.message };
    }

    try {
        const r = await fetch(destino.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `vapid t=${firma.jwt}, k=${firma.publica}`,
                'Content-Encoding': 'aes128gcm',
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(cuerpo.length),
                /* Cuánto lo guarda Google si el celular está sin señal.
                   Media hora: un pedido que llega más tarde que eso ya
                   no le sirve a nadie, y peor: suena por algo que puede
                   estar servido y cobrado. */
                'TTL': String(o.vida || 1800),
                // "alta" es lo que hace que despierte un celular dormido
                'Urgency': o.urgencia || 'high'
            },
            body: cuerpo
        });

        if (r.ok) return { ok: true, status: r.status, motivo: '' };

        const detalle = await r.text().catch(() => '');
        return {
            ok: false,
            status: r.status,
            caduco: r.status === 404 || r.status === 410,
            motivo: `${r.status} ${String(detalle).slice(0, 160)}`
        };
    } catch (e) {
        return { ok: false, status: 0, motivo: 'Sin conexión: ' + e.message };
    }
}

module.exports = { mandar, cifrar, firmar, b64u, deB64u };
