// ============ HUB ============
function openGamesHub() {
    document.getElementById('games-modal').style.display = 'flex';
    showHub();
}

function closeGamesHub() {
    document.getElementById('games-modal').style.display = 'none';
    clearInterval(memoryTimer);
    cancelAnimationFrame(ruletaAnimFrame);
    ruletaSpinning = false;
}

function showHub() {
    document.getElementById('games-hub').style.display = 'block';
    document.getElementById('game-memory').style.display = 'none';
    document.getElementById('game-ruleta').style.display = 'none';
    document.getElementById('game-puzzle').style.display = 'none';
}

function backToHub() {
    clearInterval(memoryTimer);
    cancelAnimationFrame(ruletaAnimFrame);
    ruletaSpinning = false;
    showHub();
}

function startGame(game) {
    document.getElementById('games-hub').style.display = 'none';
    if (game === 'memory') startMemory();
    else if (game === 'ruleta') startRuleta();
    else if (game === 'puzzle') startPuzzle();
}

// ============ MEMORIA ============
const memoryImages = [
    { src: 'img/productos/carneasada.png',      name: 'Carne Asada' },
    { src: 'img/productos/costillaasada.png',   name: 'Costilla' },
    { src: 'img/productos/polloasado.png',      name: 'Pollo Asado' },
    { src: 'img/productos/polloap.png',         name: 'Pollo Apanado' },
    { src: 'img/productos/espagueticamaron.png',name: 'Espagueti' },
    { src: 'img/productos/pescadoalajillo.png', name: 'Pescado Ajillo' },
];

let memoryCards = [];
let memoryFlipped = [];
let memoryMatched = 0;
let memoryMoves = 0;
let memoryTimer = null;
let memorySeconds = 0;
let memoryLocked = false;

function startMemory() {
    document.getElementById('game-memory').style.display = 'block';
    memoryMatched = 0;
    memoryMoves = 0;
    memorySeconds = 0;
    memoryFlipped = [];
    memoryLocked = false;
    clearInterval(memoryTimer);

    memoryCards = [...memoryImages, ...memoryImages]
        .sort(() => Math.random() - 0.5);

    renderMemoryBoard();

    memoryTimer = setInterval(() => {
        memorySeconds++;
        const el = document.getElementById('memory-time');
        if (el) el.textContent = memorySeconds + 's';
    }, 1000);
}

function renderMemoryBoard() {
    const board = document.getElementById('memory-board');
    board.innerHTML = '';
    document.getElementById('memory-moves').textContent = '0';
    document.getElementById('memory-time').textContent = '0s';

    memoryCards.forEach((card, index) => {
        const el = document.createElement('div');
        el.className = 'memory-card';
        el.innerHTML = `
            <div class="mc-inner">
                <div class="mc-front">🍖</div>
                <div class="mc-back"><img src="${card.src}" alt="${card.name}"></div>
            </div>`;
        el.addEventListener('click', () => flipMemoryCard(index, el, card));
        board.appendChild(el);
    });
}

function flipMemoryCard(index, el, card) {
    if (memoryLocked || el.classList.contains('flipped') || el.classList.contains('matched')) return;

    el.classList.add('flipped');
    memoryFlipped.push({ index, el, card });

    if (memoryFlipped.length === 2) {
        memoryMoves++;
        document.getElementById('memory-moves').textContent = memoryMoves;
        memoryLocked = true;

        const [a, b] = memoryFlipped;
        if (a.card.src === b.card.src) {
            a.el.classList.add('matched');
            b.el.classList.add('matched');
            memoryMatched++;
            memoryFlipped = [];
            memoryLocked = false;
            if (memoryMatched === memoryImages.length) {
                clearInterval(memoryTimer);
                setTimeout(() => alert('¡Ganaste! 🎉\n' + memoryMoves + ' movimientos en ' + memorySeconds + 's'), 300);
            }
        } else {
            setTimeout(() => {
                a.el.classList.remove('flipped');
                b.el.classList.remove('flipped');
                memoryFlipped = [];
                memoryLocked = false;
            }, 900);
        }
    }
}

// ============ RULETA ============
const ruletaItems = [
    { name: 'Carne Asada' },
    { name: 'Costilla' },
    { name: 'Pollo Asado' },
    { name: 'Chancho al Horno' },
    { name: 'Pollo Apanado' },
    { name: 'Camarón Ajillo' },
    { name: 'Pescado Apanado' },
    { name: 'Espagueti Camarón' },
];
const ruletaColors = ['#c0392b','#e67e22','#d4ac0d','#27ae60','#16a085','#2980b9','#8e44ad','#a93226'];

let ruletaAngle = 0;
let ruletaSpinning = false;
let ruletaAnimFrame = null;

function startRuleta() {
    document.getElementById('game-ruleta').style.display = 'block';
    document.getElementById('ruleta-result').textContent = '';
    setTimeout(() => drawRuleta(ruletaAngle), 50);
}

function drawRuleta(angle) {
    const canvas = document.getElementById('ruleta-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = cx - 4;
    const n = ruletaItems.length;
    const arc = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ruletaItems.forEach((item, i) => {
        const start = angle + i * arc;
        const end = start + arc;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fillStyle = ruletaColors[i];
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(start + arc / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Poppins, sans-serif';
        ctx.fillText(item.name, r - 8, 4);
        ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = '#FFC107';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function spinRuleta() {
    if (ruletaSpinning) return;
    ruletaSpinning = true;
    document.getElementById('ruleta-result').textContent = '';
    const btn = document.querySelector('#game-ruleta .game-btn');
    if (btn) btn.disabled = true;

    const totalSpin = (Math.random() * 5 + 7) * 2 * Math.PI;
    const duration = 4000 + Math.random() * 1000;
    const startTime = performance.now();
    const startAngle = ruletaAngle;

    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4);
        ruletaAngle = startAngle + totalSpin * ease;

        drawRuleta(ruletaAngle);

        if (progress < 1) {
            ruletaAnimFrame = requestAnimationFrame(animate);
        } else {
            ruletaSpinning = false;
            if (btn) btn.disabled = false;

            const n = ruletaItems.length;
            const arc = (2 * Math.PI) / n;
            const norm = (((-ruletaAngle - Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            const winner = Math.floor(norm / arc) % n;
            document.getElementById('ruleta-result').textContent = '¡Pide: ' + ruletaItems[winner].name + '!';
        }
    }

    requestAnimationFrame(animate);
}

// ============ ROMPECABEZAS ============
const PSIZE = 3;
const TSIZE = 95;
const PUZZLE_IMG = 'img/productos/carneasada.png';

let puzzleState = [];
let puzzleMoves = 0;

function startPuzzle() {
    document.getElementById('game-puzzle').style.display = 'block';
    puzzleMoves = 0;
    document.getElementById('puzzle-moves').textContent = '0';
    initPuzzle();
}

function initPuzzle() {
    puzzleMoves = 0;
    document.getElementById('puzzle-moves').textContent = '0';

    do {
        puzzleState = [1,2,3,4,5,6,7,8,0];
        for (let i = puzzleState.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [puzzleState[i], puzzleState[j]] = [puzzleState[j], puzzleState[i]];
        }
    } while (!puzzleSolvable(puzzleState) || puzzleSolved());

    renderPuzzle();
}

function puzzleSolvable(state) {
    const arr = state.filter(x => x !== 0);
    let inv = 0;
    for (let i = 0; i < arr.length; i++)
        for (let j = i + 1; j < arr.length; j++)
            if (arr[i] > arr[j]) inv++;
    return inv % 2 === 0;
}

function puzzleSolved() {
    const solved = [1,2,3,4,5,6,7,8,0];
    return puzzleState.every((v, i) => v === solved[i]);
}

function renderPuzzle() {
    const board = document.getElementById('puzzle-board');
    board.innerHTML = '';

    puzzleState.forEach((val, pos) => {
        const tile = document.createElement('div');
        if (val === 0) {
            tile.className = 'puzzle-tile empty';
        } else {
            tile.className = 'puzzle-tile';
            const srcRow = Math.floor((val - 1) / PSIZE);
            const srcCol = (val - 1) % PSIZE;
            tile.style.backgroundImage = 'url(' + PUZZLE_IMG + ')';
            tile.style.backgroundSize = (PSIZE * TSIZE) + 'px ' + (PSIZE * TSIZE) + 'px';
            tile.style.backgroundPosition = '-' + (srcCol * TSIZE) + 'px -' + (srcRow * TSIZE) + 'px';
            tile.addEventListener('click', () => moveTile(pos));
        }
        board.appendChild(tile);
    });
}

function moveTile(pos) {
    const blank = puzzleState.indexOf(0);
    const row = Math.floor(pos / PSIZE), col = pos % PSIZE;
    const bRow = Math.floor(blank / PSIZE), bCol = blank % PSIZE;

    if (Math.abs(row - bRow) + Math.abs(col - bCol) !== 1) return;

    [puzzleState[pos], puzzleState[blank]] = [puzzleState[blank], puzzleState[pos]];
    puzzleMoves++;
    document.getElementById('puzzle-moves').textContent = puzzleMoves;
    renderPuzzle();

    if (puzzleSolved()) {
        setTimeout(() => alert('¡Lo lograste! 🎉\n' + puzzleMoves + ' movimientos'), 200);
    }
}
