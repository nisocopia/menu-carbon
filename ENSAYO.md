# Ensayo antes del primer servicio

Veinte minutos con los tres celulares, **antes de abrir**. No es por
desconfianza del sistema: es que nadie ha tocado nunca estas pantallas y
la primera vez que las toques no puede ser con seis mesas esperando.

Al final se borra todo lo de la prueba con un botón.

---

## Antes de empezar

- [ ] Fusionar el PR en GitHub. El sitio se actualiza solo en 1–2 minutos.
- [ ] Los tres celulares en el **wifi del local**.
- [ ] **Toca una vez la pantalla** del asador y la cocina al abrirlas. El
      navegador no deja sonar el aviso hasta que alguien la toca; si
      sigue bloqueado sale un cartel amarillo diciendolo.

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

**En el asador:** toca **"Ya lo saqué"** en la mesa 3.

- [ ] Sale del tablero del asador y queda plegado abajo
- [ ] **La cocina lo sigue viendo** — todavia tiene que emplatar

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

## 10. Que cada cuenta llegue solo hasta donde le toca

Cada celular entra con **su** correo. Estas cuatro pruebas se hacen
escribiendo la direccion a mano en el celular equivocado.

**En el celular del asador:**

- [ ] `.../panel.html` → **no lo deja entrar**. Dice que esa cuenta es del
      local pero no la del gerente
- [ ] `.../comanda.html` → **no lo deja**, y le dice que su pantalla es
      `parrilla.html`
- [ ] `.../cocina.html` → **si entra**, con una franja azul arriba que dice
      "estas mirando la cocina" y **las tarjetas sin boton**

**En el celular de la cocina:**

- [ ] `.../parrilla.html` → **si entra**, mirando, sin boton de "Ya lo saque"

**En el tuyo:** con tu cuenta entras a todo y puedes tocar todo.

> Si alguna cuenta no entra a la suya, casi siempre es que el uid quedo
> mal copiado. Estan en `js/menu-data.js` (lista `EQUIPO`) y en
> `firebase-rules.json`, y los dos tienen que decir lo mismo.

## 11. Que el mismo pedido no entre dos veces

Con **dos** celulares abiertos en `comanda.html` (el tuyo y el del
mesero), manda un pedido desde el celular de un cliente a la mesa 4.

- [ ] Los dos ven "1 pedido desde la mesa"
- [ ] Tocas **Confirmar y enviar** en el tuyo → se crea la comanda
- [ ] En el del mesero, tocas Confirmar tambien → dice **"Ese pedido ya lo
      confirmo otro celular"** y **no** crea una segunda comanda
- [ ] En el asador aparece **una sola** tarjeta de la mesa 4

## 12. Que solo tu puedas vaciar el servicio

- [ ] Con tu cuenta, `panel.html` → **Vaciar el servicio** funciona
- [ ] Ninguna otra cuenta llega a esa pantalla, y aunque llegara, la nube
      le negaria el borrado

## 13. Un pedido para llevar

**En el celular del mesero:** toca **Pedido para llevar**, escribe `2p`.

- [ ] El boton de abajo **no dice Enviar**: dice "Escribe el nombre"
- [ ] Escribe `Carlos` → el boton pasa a **Enviar**
- [ ] En el total aparecen **2 tarrinas** ($0.50) sin haberlas pedido
- [ ] **Asador:** la tarjeta dice **CARLOS** en grande, no "LLEVAR"
- [ ] **Cocina:** tambien ve el nombre, y **no** ve la tarrina

Ahora manda otro para llevar a nombre de `Luis`, con `1c`.

- [ ] En la pantalla de mesas, debajo del boton, aparecen **los dos**
      con su nombre y su saldo
- [ ] Tocas el de Carlos → ves solo lo suyo, no lo de Luis
- [ ] Lo cobras → desaparece de la lista y el de Luis **sigue ahi**

## 14. Corregir a tiempo, y no poder despues

**En el celular del mesero:** mesa 4, escribe `1p`, Enviar.

- [ ] Debajo de la tanda sale **"Se puede corregir entero"** con los
      segundos bajando
- [ ] Tocas **Editar**, cambias el pollo por chuleta, Guardar cambios
- [ ] **Asador:** la tarjeta se actualiza sola, con el **mismo codigo**

Espera un minuto largo y vuelve a esa mesa.

- [ ] Ahora el boton dice **"Agregar bebida o porcion"**
- [ ] Al abrirlo, la chuleta esta ahi pero **no se puede tocar**
- [ ] Agregas una cola → si deja
- [ ] Intentas agregar otro pollo → dice que ya paso el minuto

## 15. Que no se pueda anular lo que ya salio

**En el asador:** manten apretado **2 segundos** en un pedido de la mesa 4.

- [ ] Se ve una **barra que avanza**; si sueltas antes, no pasa nada
- [ ] Al completarse, sale del tablero

**En el mesero:** vuelve a la mesa 4.

- [ ] Ya **no hay boton de Anular**: en su lugar dice que el asador ya lo saco

## 16. La cocina marca plato por plato

**En el mesero:** mesa 7, escribe `1p 4ch`, Enviar.

- [ ] **Cocina:** ve **cuatro renglones de Chuleta**, no "4x Chuleta"
- [ ] El boton de abajo dice **"Faltan 5 por marcar"** y esta apagado
- [ ] Marcas el pollo y tres chuletas → dice "Falta 1 por marcar"
- [ ] Marcas la cuarta → recien ahi se enciende **ENTREGADO**

## 17. El orden, en la tablet

**En la tablet de la cocina**, con tres o cuatro pedidos en pantalla:

- [ ] Cada tarjeta tiene su numero **1, 2, 3** en un circulo
- [ ] El primero dice **EMPIEZA POR ESTE** y ocupa el ancho entero
- [ ] Se sabe cual sigue **sin mirar ninguna hora**

## 18. El asador tomando un pedido

**En el celular del asador:** toca **Tomar pedido**.

- [ ] Entra, y puede anotar mesa o para llevar igual que el mesero
- [ ] En una mesa con cuenta abierta, **no le aparece el boton Cobrar**

## 19. Cambiar de mesa

**En el mesero:** mesa 5, manda `2p`. Luego entra a la mesa 5.

- [ ] Abajo hay **Cambiar de mesa**
- [ ] Solo salen las mesas **libres**
- [ ] Escoges la 9 → la 5 queda libre y la 9 tiene la cuenta entera
- [ ] **Asador:** el codigo paso de `M5` a `M9`

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
