const STAGES = [
    { time: 0,  text: 'Pedido recibido',          icon: 'fa-check-circle' },
    { time: 4,  text: 'En cola de preparación',    icon: 'fa-clock' },
    { time: 8,  text: 'Cocinando tu proteína',     icon: 'fa-fire' },
    { time: 12, text: 'Preparando la guarnición',  icon: 'fa-leaf' },
    { time: 16, text: 'Últimos detalles...',        icon: 'fa-star' },
    { time: 18, text: '¡Tu pedido está casi listo!', icon: 'fa-bell' },
];

const EXPIRE_MS = 2 * 60 * 60 * 1000; // 2 horas
const KEY = 'carbon_order_start';

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

    document.getElementById('order-tracker').style.display = 'block';
    updateTracker(start);

    setInterval(() => {
        if (Date.now() - start > EXPIRE_MS) {
            localStorage.removeItem(KEY);
            document.getElementById('order-tracker').style.display = 'none';
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

    const dots = document.querySelectorAll('.tracker-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i <= stageIndex);
    });
}

window.addEventListener('DOMContentLoaded', initTracker);
