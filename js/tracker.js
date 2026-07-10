const STAGES = [
    { time: 0,  text: '¡Tu pedido ya está en nuestras manos!',         icon: 'fa-check-circle' },
    { time: 4,  text: 'Tu pedido entró a la cocina, ya casi empezamos', icon: 'fa-clock' },
    { time: 8,  text: 'Estamos poniendo tu proteína al fuego ahora mismo', icon: 'fa-fire' },
    { time: 12, text: 'Preparando tu guarnición con mucho cariño',      icon: 'fa-leaf' },
    { time: 16, text: 'Ya casi está, los últimos toques de tu plato',   icon: 'fa-star' },
    { time: 22, text: '¡Tu plato está a punto de salir!',               icon: 'fa-bell' },
];

const EXPIRE_MS    = 2 * 60 * 60 * 1000; // 2 horas
const SHOW_AFTER   = 2 * 60 * 1000;      // 2 minutos antes de mostrarse
const KEY          = 'carbon_order_start';

function showTracker(start) {
    const tracker = document.getElementById('order-tracker');
    tracker.style.display = 'flex';
    document.body.classList.add('tracker-active');
    updateTracker(start);

    setInterval(() => {
        if (Date.now() - start > EXPIRE_MS) {
            localStorage.removeItem(KEY);
            tracker.style.display = 'none';
            document.body.classList.remove('tracker-active');
            return;
        }
        updateTracker(start);
    }, 30000);
}

function updateTracker(start) {
    const mins = (Date.now() - start) / 60000;

    let stage = STAGES[0];
    let stageIndex = 0;
    STAGES.forEach((s, i) => {
        if (mins >= s.time) { stage = s; stageIndex = i; }
    });

    document.getElementById('order-status-icon').className = 'fas ' + stage.icon;
    document.getElementById('order-status-text').textContent = stage.text;

    document.querySelectorAll('.tracker-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i <= stageIndex);
    });
}

function initTracker() {
    const now = Date.now();
    let start = localStorage.getItem(KEY);

    if (start) {
        start = parseInt(start);
        if (now - start > EXPIRE_MS) {
            localStorage.removeItem(KEY);
            return;
        }
    } else {
        start = now;
        localStorage.setItem(KEY, start);
    }

    const elapsed = now - start;

    if (elapsed >= SHOW_AFTER) {
        showTracker(start);
    } else {
        setTimeout(() => showTracker(start), SHOW_AFTER - elapsed);
    }
}

window.addEventListener('DOMContentLoaded', initTracker);
