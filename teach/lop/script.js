const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let gameState = 'playing';
let lastTime = performance.now();

const arena = { width: 1600, height: 1600 };
const camera = { x: 0, y: 0 };

// __Input Handling__
// kbd
const keys = {};
// mouse
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
let isLeftClicking = false;
let isRightClicking = false;

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    // dodging and blocking 
});
window.addEventListener('keyup', e => {
    keys[e.code] = false;
    // dodging and blocking 
});

window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mousedown', e => {
    if (e.button === 0) isLeftClicking = true;
    if (e.button === 2) isRightClicking = true;
});

window.addEventListener('mouseup', e => {
    if (e.button === 0) isLeftClicking = false;
    if (e.button === 2) isRightClicking = false;
});

const player = {
    x: 800, y: 1000,
    radius: 24,
    speed: 340,

    hp: 100, maxHp: 100,
    stamina: 100, maxStamina: 100, staminaRegen: 80,
    angle: 0,
};

const boss = {
    x: 800, y: 800,
    baseRadius: 55, radiusX: 55, radiusY: 55,
    angle: 0, speed: 140,
    hp: 1000, maxHp: 1000, damage: 35,
    state: 'chase',
}

function update(dt) {
    if (gameState !== 'playing') return;

    let moveX = 0, moveY = 0;
    if (keys['KeyW'] || keys['ArrowUp']) moveY -= 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveY += 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

    if (moveX !== 0 || moveY !== 0) {
        const length = Math.hypot(moveX, moveY);
        moveX /= length;
        moveY /= length;
    }

    // player movement
    let currentSpeed = player.speed;

    player.x += moveX * currentSpeed * dt;
    player.y += moveY * currentSpeed * dt;

    // bounding
    player.x = Math.max(player.radius, Math.min(arena.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(arena.height - player.radius, player.y));

    mouse.worldX = mouse.x + camera.x;
    mouse.worldY = mouse.y + camera.y;
    player.angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);

    // boss movement

    const distToPlayer = Math.hypot(player.x - boss.x, player.y - boss.y);
    boss.angle += Math.atan2(player.y - boss.y, player.x - boss.x);

    let targetRadiusX = boss.baseRadius; targetRadiusY = boss.baseRadius;

    const bounce = Math.sin(performance.now() * 0.012);
    targetRadiusX = boss.baseRadius * (bounce * 0.04 + 1);
    targetRadiusY = boss.baseRadius * (-bounce * 0.04 + 1);

    boss.x += Math.cos(boss.angle) * boss.speed * dt;
    boss.y += Math.sin(boss.angle) * boss.speed * dt;

    boss.radiusX = lerp(boss.radiusX, targetRadiusX, dt * 14);
    boss.radiusY = lerp(boss.radiusY, targetRadiusY, dt * 14);

    camera.x = lerp(camera.x, player.x - canvas.width / 2, dt * 6);
    camera.y = lerp(camera.y, player.y - canvas.height / 2, dt * 6);

    // bounding
    camera.x = Math.max(0, Math.min(arena.width - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(arena.height - canvas.height, camera.y));

}

function render() {
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.stokeStyle = '#18181f';
    ctx.lineWidth = 2;
    for (let x = 0; x <= arena.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, arena.height);
        ctx.stroke();
    }
    for (let y = 0; y <= arena.width; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(arena.width, y);
        ctx.stroke();
    }

    // Draw the player
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#0088ff';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2); // player.x and player.y as origin then radius as the player radius and draw a full circle
    ctx.fill();
    ctx.strokeStyle = '#002255'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(10, -4, 22, 8);
    ctx.restore();

    // Draw the boss 
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(boss.angle);
    ctx.fillStyle = '#d41919';
    ctx.beginPath();
    ctx.ellipse(0, 0, boss.radiusX, boss.radiusY, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff0000'; ctx.fillRect(boss.radius - 12, -6, 15, 12);
    ctx.restore();
}

function lerp(start, end, t) {
    return (1 - t) * start + t * end;
}

function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    update(dt);
    render(); requestAnimationFrame(loop);
}

requestAnimationFrame(loop);