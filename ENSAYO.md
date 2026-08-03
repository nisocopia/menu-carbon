# Ensayo antes del primer servicio

Veinte minutos con los tres celulares, **antes de abrir**. No es por
desconfianza del sistema: es que nadie ha tocado nunca estas pantallas y
la primera vez que las toques no puede ser con seis mesas esperando.

Al final se borra todo lo de la prueba con un botón.

---

## Antes de empezar

- [ ] Fusionar el PR en GitHub. El sitio se actualiza solo en 1–2 minutos.
- [ ] Los tres celulares en el **wifi del local**.

Cada celular abre su dirección y **entra una sola vez** (la sesión dura
horas). Conviene guardarla en la pantalla de inicio: en Chrome, menú de
los tres puntos → *Agregar a pantalla principal*.

| Celular | Dirección | Cuenta |
|---|---|---|
| El del mesero | `…/comanda.html` | la del gerente o la del mesero |
| El del asador | `…/parrilla.html` | la del asador |
| El de la cocina | `…/cocina.html` | la de la cocina |

> Los correos de este local están en `CUENTAS.md`, que no se sube al
> repositorio.

> Arriba a la derecha de cada pantalla hay un **punto verde**. Si sale
> rojo, algo anda mal con la red y hay que resolverlo antes de seguir.

---

## 1. Un pedido simple

**En el celular del mesero:** toca la mesa 3, escribe `3p` y toca Enviar.

- [ ] **Asador:** aparece "Mesa 3 · 3 Pollo Asado"
- [ ] **Cocina:** aparece lo mismo, más **"3 cubiertos"** en amarillo grande
- [ ] **Mesero:** la mesa 3 quedó en amarillo con el saldo `$10.50`

## 2. Que el asador vea solo lo suyo

**En el celular del mesero:** mesa 5, escribe `1co 1kj` (una costilla y un camarón al
ajillo), Enviar.

- [ ] **Asador:** ve la costilla, **no** ve el camarón
- [ ] **Cocina:** ve las dos cosas

Esto es lo que reemplaza los dos papeles. Si funciona, el resto es detalle.

## 3. Una modificación y un "para llevar"

**En el celular del mesero:** mesa 7, escribe `2c`. Toca el renglón *Carne Asada*:
marca **sin menestra**, el término **término medio** y **Para llevar**.
Cierra con Listo y Enviar.

- [ ] **Asador:** ve el término y la etiqueta 🥡, **no** ve "sin menestra"
- [ ] **Cocina:** ve las dos cosas
- [ ] **Cocina:** dice **0 cubiertos** (todo es para llevar)

## 4. Una segunda tanda

**En el celular del mesero:** vuelve a la mesa 3, escribe `1ar` y Enviar.

- [ ] El código nuevo es **`M3b · 1 Arroz`**, no `M3`
- [ ] La cuenta de la mesa 3 subió a `$12.00`

## 5. Entregar

**En la cocina:** toca **ENTREGADO** en la mesa 3.

- [ ] Desaparece de la cocina **y del asador**
- [ ] En el del mesero, la mesa 3 sigue abierta con su cuenta

## 6. Cobrar dividido

**En el celular del mesero:** mesa 3 → Cobrar. Toca **+** una vez en Pollo Asado y
cobra en **Efectivo**.

- [ ] Quedan `$8.50` y la mesa **sigue abierta**
- [ ] "Seleccionar todo lo que falta" → Transferencia → **la mesa se libera sola**

## 7. Un mixto (el que más se equivoca)

**En el celular del mesero:** mesa 8, escribe `1x2`, Enviar **sin tocar nada más**.

- [ ] **No te deja mandarlo** y se abre solo el cuadro de las carnes
- [ ] Escoge Pollo y Carne, Listo, Enviar
- [ ] **Asador:** ve "Mixto 2 Carnes · Pollo + Carne", entero

## 8. Un pedido desde el celular de un cliente

Abre el menú en **otro** celular (o de incógnito), agrega un pollo, toca
*Listo, llamar al mesero*, escoge la mesa 9.

- [ ] **Mesero:** arriba aparece "1 pedido desde la mesa", en amarillo
- [ ] **No** le llegó al asador todavía
- [ ] Tocas **Confirmar y enviar** → recién ahí le llega al asador

## 9. Sin wifi (el más importante)

**Quítale el wifi al celular del mesero** (modo avión) y manda un pedido a la mesa 2.

- [ ] Arriba sale en rojo **"1 sin enviar"**, parpadeando
- [ ] El aviso dice **"anotado — SIN RED"**, no dice "enviado"
- [ ] Al asador **no** le llegó (correcto: todavía no salió)

**Vuelve a poner el wifi.** Sin recargar nada:

- [ ] El rojo se apaga solo en unos segundos
- [ ] El pedido aparece en el asador

Ahora al revés: **quítale el wifi al celular de la cocina** y espera medio
minuto.

- [ ] La cocina se pone con **borde rojo** y dice **"No se está recibiendo"**
- [ ] Al devolverle el wifi, vuelve sola

Esto último es lo que más me importa que veas: una pantalla de cocina
desconectada se ve igual de vacía que una sin pedidos. Tiene que gritarlo.

---

## 10. Que el personal no entre al panel

En el celular del asador, escribe la direccion del panel a mano:
`.../panel.html`

- [ ] **No lo deja entrar.** Dice que esa cuenta es del local pero no la
      del gerente
- [ ] Con tu cuenta si entra

---

## Dejar limpio

**En el celular del mesero:** `panel.html` → pestaña **Pedidos** → **Vaciar el
servicio** → escribe `BORRAR`.

- [ ] Todas las mesas quedan libres
- [ ] Los números vuelven a cero

El menú, los precios y las bebidas guardadas **no** se tocan.

---

## Esta noche

Recomendación en serio: **no botes el cuaderno todavía.** Anota en paralelo
las primeras dos o tres noches. Si algo falla en hora pico, tienes con qué
seguir sin que nadie se quede sin comer, y de paso vas a ver dónde el
sistema es más lento que el papel — que es lo que hay que arreglar después.

Si algo no cuadra en el ensayo, anota **qué pantalla, qué tocaste y qué
esperabas** que pasara. Con eso se arregla rápido.
