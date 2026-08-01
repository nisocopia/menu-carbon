/* ============================================================
   TRACKER.JS  —  Estado del pedido
   Arranca SOLO cuando el cliente confirma un pedido real,
   no cuando abre la página.
   ============================================================ */

const STAGES = [
    { p: 0.00, text: '¡Tu pedido ya está en nuestras manos!',           icon: 'fa-check-circle' },
    { p: 0.18, text: 'Tu pedido entró a la cocina, ya casi empezamos',  icon: 'fa-clock' },
    { p: 0.36, text: 'Estamos poniendo tu proteína al fuego ahora mismo', icon: 'fa-fire' },
    { p: 0.55, text: 'Preparando tu guarnición con mucho cariño',       icon: 'fa-leaf' },
    { p: 0.73, text: 'Ya casi está, los últimos toques de tu plato',    icon: 'fa-star' },
    { p: 1.00, text: '¡Tu plato está a punto de salir!',                icon: 'fa-bell' }
];

const TRACKER_EXPIRA = 2 * 60 * 60 * 1000;   // el aviso desaparece a las 2 horas
let trackerTimer = null;

function pintarTracker(pedido) {
    const minutos = (Date.now() - pedido.creado) / 60000;
    const estimado = (Store.getConfig().tiempoPromedio || 22);
    const avance = Math.min(minutos / estimado, 1);

    let etapa = STAGES[0], indice = 0;
    STAGES.forEach((s, i) => {
        if (avance >= s.p) { etapa = s; indice = i; }
    });

    document.getElementById('order-status-icon').className = 'fas ' + etapa.icon;
    document.getElementById('order-status-text').textContent = etapa.text;

    document.querySelectorAll('.tracker-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i <= indice);
    });
}

function ocultarTracker() {
    const t = document.getElementById('order-tracker');
    t.style.display = 'none';
    document.body.classList.remove('tracker-active');
    if (trackerTimer) { clearInterval(trackerTimer); trackerTimer = null; }
}

function iniciarTracker(pedido) {
    if (!pedido) return;

    const tracker = document.getElementById('order-tracker');
    tracker.style.display = 'flex';
    document.body.classList.add('tracker-active');
    pintarTracker(pedido);

    if (trackerTimer) clearInterval(trackerTimer);
    trackerTimer = setInterval(() => {
        if (Date.now() - pedido.creado > TRACKER_EXPIRA) {
            Store.cerrarPedidoActivo();
            ocultarTracker();
            return;
        }
        pintarTracker(pedido);
    }, 20000);
}

/* Si el cliente recarga la página con un pedido en curso, lo retoma. */
document.addEventListener('DOMContentLoaded', () => {
    const activo = Store.getPedidoActivo();
    if (!activo) return;

    if (Date.now() - activo.creado > TRACKER_EXPIRA) {
        Store.cerrarPedidoActivo();
        return;
    }
    iniciarTracker(activo);
});
