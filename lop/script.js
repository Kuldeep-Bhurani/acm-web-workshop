const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let gameState = 'playing';
let lastTime = performance.now();
let cameraShake = 0;
let hitStopTimer = 0;

const arena = { width: 1600, height: 1600 };
const camera = { x: 0, y: 0 };

// --- ENTITIES ---
const player = {
    x: 800, y: 1000,
    radius: 24,
    speed: 340,

    hp: 100, maxHp: 100, regainHp: 0,
    stamina: 100, maxStamina: 100, staminaRegen: 80,

    // Dodge mechanics
    isDodging: false, dodgeTimer: 0, dodgeDuration: 0.3, dodgeCost: 20,
    dodgeDirX: 0, dodgeDirY: 0, ghostTimer: 0,

    isBlocking: false, perfectGuardWindow: 0,

    attackCooldown: 0, angle: 0,
    lightAttackRate: 0.3, lightDamage: 20, lightCost: 15, lightPoise: 20, lightStagger: 6,
    heavyAttackRate: 0.7, heavyDamage: 55, heavyCost: 35, heavyPoise: 60, heavyStagger: 24
};

const boss = {
    x: 800, y: 500,
    baseRadius: 55, radiusX: 55, radiusY: 55,
    angle: 0, speed: 140,
    hp: 1000, maxHp: 1000, damage: 35,

    poise: 100, maxPoise: 100,
    stagger: 0, maxStagger: 100,
    isGroggy: false, groggyTimer: 0, maxGroggyTime: 6.0,

    state: 'chase', timer: 0, flashTimer: 0, flashColor: '#ff0000'
};

let particles = [];
let activeVisualEffects = [];
let ghostTrails = []; // Array to hold dodge afterimages

// --- INPUT HANDLERS ---
const keys = {};
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
let isLeftClicking = false;
let isRightClicking = false;

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !player.isDodging && !player.isBlocking && player.stamina > 0) {
        player.isBlocking = true;
        player.perfectGuardWindow = 0.22;
    }
});

window.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') player.isBlocking = false;
});

window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', e => { if (e.button === 0) isLeftClicking = true; if (e.button === 2) isRightClicking = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) isLeftClicking = false; if (e.button === 2) isRightClicking = false; });
window.addEventListener('contextmenu', e => e.preventDefault());

// --- PARTICLES ---
function spawnBloodSplash(x, y, angle, count, scale = 1, isFatal = false) {
    for (let i = 0; i < count; i++) {
        const pAngle = angle + (Math.random() - 0.5) * (isFatal ? Math.PI * 2 : 1.2);
        const speed = (Math.random() * 300 + 100) * scale;
        particles.push({
            x: x, y: y, vx: Math.cos(pAngle) * speed, vy: Math.sin(pAngle) * speed,
            radius: (Math.random() * 4 + 2) * scale,
            color: isFatal ? `hsl(${Math.random() * 10}, 100%, ${Math.random() * 40 + 30}%)` : '#ff3300',
            life: Math.random() * 0.4 + 0.3, maxLife: 0.7, decay: Math.random() * 1.5 + 1.5
        });
    }
}

function spawnSparks(x, y, count) {
    for (let i = 0; i < count; i++) {
        const pAngle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 400 + 200;
        particles.push({
            x: x, y: y, vx: Math.cos(pAngle) * speed, vy: Math.sin(pAngle) * speed,
            radius: Math.random() * 2 + 1.5, color: '#00ffff', life: Math.random() * 0.2 + 0.15
        });
    }
}

function spawnHealSparks(x, y) {
    for (let i = 0; i < 6; i++) {
        const pAngle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 120 + 40;
        particles.push({
            x: x, y: y, vx: Math.cos(pAngle) * speed, vy: Math.sin(pAngle) * speed,
            radius: Math.random() * 3 + 1.5, color: '#44ff44', life: Math.random() * 0.3 + 0.2
        });
    }
}

// --- GAME ENGINE ---
function update(dt) {
    if (gameState !== 'playing') return;

    if (hitStopTimer > 0) {
        hitStopTimer -= dt;
        if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - 40 * dt);
        return;
    }

    // Time Decay for Regain (Weakening Rally)
    if (player.regainHp > 0) {
        player.regainHp = Math.max(0, player.regainHp - 4 * dt); // Loses 4 HP per second
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.exp(-2.5 * dt); p.vy *= Math.exp(-2.5 * dt);
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = ghostTrails.length - 1; i >= 0; i--) {
        ghostTrails[i].life -= dt;
        if (ghostTrails[i].life <= 0) ghostTrails.splice(i, 1);
    }

    for (let i = activeVisualEffects.length - 1; i >= 0; i--) {
        let fx = activeVisualEffects[i];
        fx.life -= dt;
        if (fx.life <= 0) activeVisualEffects.splice(i, 1);
    }

    if (player.perfectGuardWindow > 0) player.perfectGuardWindow -= dt;

    if (!keys['Space'] && !player.isDodging && !player.isBlocking) {
        player.stamina = Math.min(player.maxStamina, player.stamina + player.staminaRegen * dt);
    }

    let moveX = 0, moveY = 0;
    if (keys['KeyW'] || keys['ArrowUp']) moveY -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveY += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

    if (moveX !== 0 || moveY !== 0) {
        const len = Math.sqrt(moveX * moveX + moveY * moveY);
        moveX /= len; moveY /= len;
    }

    // Trigger Dodge
    if (keys['Space'] && player.stamina >= player.dodgeCost && !player.isDodging && !player.isBlocking) {
        player.isDodging = true;
        player.dodgeTimer = player.dodgeDuration;
        player.stamina -= player.dodgeCost;

        // Lock in dodge direction
        if (moveX === 0 && moveY === 0) {
            player.dodgeDirX = Math.cos(player.angle);
            player.dodgeDirY = Math.sin(player.angle);
        } else {
            player.dodgeDirX = moveX;
            player.dodgeDirY = moveY;
        }
    }

    let currentSpeed = player.speed;

    if (player.isDodging) {
        // Dodge interpolation (Easing Curve) -> Fast start, slower end
        let dodgeProgress = 1 - (player.dodgeTimer / player.dodgeDuration);
        currentSpeed = lerp(1200, 150, dodgeProgress);

        // Override general movement with locked dodge direction
        moveX = player.dodgeDirX;
        moveY = player.dodgeDirY;

        // Generate Ghost Trails
        player.ghostTimer -= dt;
        if (player.ghostTimer <= 0) {
            ghostTrails.push({ x: player.x, y: player.y, angle: player.angle, life: 0.15 });
            player.ghostTimer = 0.03; // Spawn rate of ghosts
        }

        player.dodgeTimer -= dt;
        if (player.dodgeTimer <= 0) player.isDodging = false;
    } else if (player.isBlocking) {
        currentSpeed = player.speed * 0.35;
    }

    player.x += moveX * currentSpeed * dt;
    player.y += moveY * currentSpeed * dt;

    player.x = Math.max(player.radius, Math.min(arena.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(arena.height - player.radius, player.y));

    mouse.worldX = mouse.x + camera.x; mouse.worldY = mouse.y + camera.y;
    player.angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);

    if (player.attackCooldown > 0) player.attackCooldown -= dt;

    if (player.attackCooldown <= 0 && !player.isDodging && !player.isBlocking) {
        if (isRightClicking && player.stamina >= player.heavyCost) {
            player.stamina -= player.heavyCost; player.attackCooldown = player.heavyAttackRate; executeAttack(true);
        } else if (isLeftClicking && player.stamina >= player.lightCost) {
            player.stamina -= player.lightCost; player.attackCooldown = player.lightAttackRate; executeAttack(false);
        }
    }

    if (boss.flashTimer > 0) boss.flashTimer -= dt;
    if (boss.isGroggy) { boss.groggyTimer -= dt; if (boss.groggyTimer <= 0) { boss.isGroggy = false; boss.stagger = 0; } }

    const distToPlayer = Math.hypot(player.x - boss.x, player.y - boss.y);
    boss.angle = Math.atan2(player.y - boss.y, player.x - boss.x);

    let targetRadiusX = boss.baseRadius, targetRadiusY = boss.baseRadius;

    if (boss.state === 'stunned') {
        boss.timer -= dt; targetRadiusX = boss.baseRadius * 1.3; targetRadiusY = boss.baseRadius * 0.6;
        if (boss.timer <= 0) { boss.state = 'chase'; boss.poise = boss.maxPoise; }
    } else if (boss.state === 'interrupted') {
        boss.timer -= dt; targetRadiusX = boss.baseRadius * 0.7; targetRadiusY = boss.baseRadius * 1.25;
        boss.x -= Math.cos(boss.angle) * 160 * dt; boss.y -= Math.sin(boss.angle) * 160 * dt;
        if (boss.timer <= 0) boss.state = 'chase';
    } else if (boss.state === 'chase') {
        const bounce = Math.sin(performance.now() * 0.012);
        targetRadiusX = boss.baseRadius * (1 + bounce * 0.04); targetRadiusY = boss.baseRadius * (1 - bounce * 0.04);
        boss.x += Math.cos(boss.angle) * boss.speed * dt; boss.y += Math.sin(boss.angle) * boss.speed * dt;
        if (distToPlayer < 120) { boss.state = 'windup'; boss.timer = 0.75; }
    } else if (boss.state === 'windup') {
        boss.timer -= dt; targetRadiusX = boss.baseRadius * 0.85; targetRadiusY = boss.baseRadius * 1.2;
        if (boss.timer <= 0) { boss.state = 'attack'; boss.timer = 0.18; executeBossAttack(); }
    } else if (boss.state === 'attack') {
        boss.timer -= dt; targetRadiusX = boss.baseRadius * 1.35; targetRadiusY = boss.baseRadius * 0.75;
        if (boss.timer <= 0) { boss.state = 'cooldown'; boss.timer = 0.8; }
    } else if (boss.state === 'cooldown') {
        boss.timer -= dt; if (boss.timer <= 0) boss.state = 'chase';
    }

    boss.radiusX = lerp(boss.radiusX, targetRadiusX, 14 * dt);
    boss.radiusY = lerp(boss.radiusY, targetRadiusY, 14 * dt);

    camera.x = lerp(camera.x, player.x - canvas.width / 2, 6 * dt);
    camera.y = lerp(camera.y, player.y - canvas.height / 2, 6 * dt);
    camera.x = Math.max(0, Math.min(arena.width - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(arena.height - canvas.height, camera.y));

    if (cameraShake > 0) cameraShake = lerp(cameraShake, 0, 7 * dt);

    updateUI();
}

// --- ATTACK EXECUTION & GUARD REGAIN LOGIC ---
function executeAttack(isHeavy) {
    const range = isHeavy ? 110 : 80;
    const arcAngle = isHeavy ? Math.PI * 0.6 : Math.PI * 0.45;

    activeVisualEffects.push({ type: 'slash', px: player.x, py: player.y, angle: player.angle, range: range, arc: arcAngle, color: isHeavy ? 'rgba(153, 0, 255, 0.8)' : 'rgba(0, 255, 255, 0.7)', life: isHeavy ? 0.16 : 0.1 });

    const distance = Math.hypot(boss.x - player.x, boss.y - player.y);
    if (distance <= range + boss.baseRadius) {
        let targetAngle = Math.atan2(boss.y - player.y, boss.x - player.x);
        let diff = Math.abs(normalizeAngle(targetAngle - player.angle));

        if (diff <= arcAngle / 2) {
            // WEAKER REGAIN HEALING
            if (player.regainHp > 0) {
                let healAmount = isHeavy ? 12 : 5; // Reduced from 20/10
                let actualHeal = Math.min(player.regainHp, healAmount);

                player.hp += actualHeal;
                player.regainHp -= actualHeal;
                spawnHealSparks(player.x, player.y);
            }

            let damage = boss.state === 'stunned' ? (isHeavy ? player.heavyDamage * 2.5 : player.lightDamage * 2.0) : (isHeavy ? player.heavyDamage : player.lightDamage);
            boss.hp -= damage;
            boss.flashTimer = 0.15; boss.flashColor = '#ffffff';

            if (boss.isGroggy && isHeavy) {
                boss.state = 'stunned'; boss.timer = 5.0; boss.isGroggy = false; boss.stagger = 0;
                hitStopTimer = 0.35; cameraShake = 35;
                spawnBloodSplash(boss.x, boss.y, player.angle, 75, 2.5, true);
                activeVisualEffects.push({ type: 'fatal-ring', x: boss.x, y: boss.y, radius: 10, maxRadius: 260, life: 0.35 });
                triggerFeedbackText("FATAL ATTACK!", "#ff0033");
            } else if (boss.state !== 'stunned') {
                cameraShake = isHeavy ? 8 : 3.5;
                spawnBloodSplash(boss.x, boss.y, player.angle, isHeavy ? 18 : 8, isHeavy ? 1.3 : 0.8, false);

                if (!boss.isGroggy) {
                    boss.stagger += isHeavy ? player.heavyStagger : player.lightStagger;
                    if (boss.stagger >= boss.maxStagger) { boss.stagger = boss.maxStagger; boss.isGroggy = true; boss.groggyTimer = boss.maxGroggyTime; }
                }

                boss.poise -= isHeavy ? player.heavyPoise : player.lightPoise;
                if (boss.poise <= 0) {
                    boss.state = 'interrupted'; boss.timer = 0.7; boss.poise = boss.maxPoise;
                    cameraShake = 16; boss.flashTimer = 0.3; boss.flashColor = '#ffaa00';
                    spawnBloodSplash(boss.x, boss.y, player.angle, 25, 1.5, false);
                    triggerFeedbackText("POISE BROKEN", "#ffffff");
                }
            }
            if (boss.hp <= 0) endGame('win');
        }
    }
}

function executeBossAttack() {
    const attackRange = 140;
    activeVisualEffects.push({ type: 'boss-slam', x: boss.x, y: boss.y, angle: boss.angle, range: attackRange, life: 0.2 });

    const distance = Math.hypot(player.x - boss.x, player.y - boss.y);
    if (distance <= attackRange + player.radius) {
        let targetAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
        let diff = Math.abs(normalizeAngle(targetAngle - boss.angle));

        if (diff <= Math.PI * 0.4) {
            if (player.isDodging) return; // I-Frames active

            if (player.perfectGuardWindow > 0) {
                triggerFeedbackText("PERFECT GUARD!", "#00ffff");
                cameraShake = 12; hitStopTimer = 0.08;
                spawnSparks(player.x + Math.cos(boss.angle) * 20, player.y + Math.sin(boss.angle) * 20, 16);

                // Perfect Guards also trigger Regain recovery (Weaker)
                if (player.regainHp > 0) {
                    let actualHeal = Math.min(player.regainHp, 8); // Reduced from 15
                    player.hp += actualHeal;
                    player.regainHp -= actualHeal;
                    spawnHealSparks(player.x, player.y);
                }

                if (!boss.isGroggy && boss.state !== 'stunned') {
                    boss.stagger += 25;
                    if (boss.stagger >= boss.maxStagger) { boss.stagger = boss.maxStagger; boss.isGroggy = true; boss.groggyTimer = boss.maxGroggyTime; }
                }
            }
            else if (player.isBlocking && player.stamina >= 15) {
                let chipDamage = boss.damage * 0.25;
                player.hp -= chipDamage;

                // WEAKER RALLY: Only 60% of damage is convertible to Regain 
                let regainableDamage = chipDamage * 0.6;
                player.regainHp = Math.min(player.maxHp - player.hp, player.regainHp + regainableDamage);

                player.stamina -= 30;
                cameraShake = 3;
                spawnSparks(player.x, player.y, 4);
            }
            else {
                player.hp -= boss.damage;
                player.regainHp = 0; // Regain is wiped!

                cameraShake = 18;
                spawnBloodSplash(player.x, player.y, boss.angle, 15, 1.0, false);
            }

            if (player.hp <= 0) endGame('lose');
        }
    }
}

// --- RENDERING ---
function render() {
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    if (cameraShake > 0) {
        ctx.translate(-camera.x + (Math.random() - 0.5) * cameraShake, -camera.y + (Math.random() - 0.5) * cameraShake);
    } else {
        ctx.translate(-camera.x, -camera.y);
    }

    ctx.strokeStyle = '#18181f'; ctx.lineWidth = 2;
    for (let x = 0; x < arena.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, arena.height); ctx.stroke(); }
    for (let y = 0; y < arena.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arena.width, y); ctx.stroke(); }
    ctx.strokeStyle = '#ff3300'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, arena.width, arena.height);

    activeVisualEffects.forEach(fx => {
        if (fx.type === 'slash') {
            ctx.save(); ctx.translate(fx.px, fx.py); ctx.rotate(fx.angle); ctx.fillStyle = fx.color;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, fx.range, -fx.arc / 2, fx.arc / 2); ctx.fill(); ctx.restore();
        } else if (fx.type === 'boss-slam') {
            ctx.save(); ctx.translate(fx.x, fx.y); ctx.rotate(fx.angle); ctx.fillStyle = 'rgba(230, 40, 0, 0.25)';
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, fx.range, -Math.PI * 0.4, Math.PI * 0.4); ctx.fill(); ctx.restore();
        } else if (fx.type === 'fatal-ring') {
            ctx.strokeStyle = `rgba(255, 0, 50, ${fx.life / 0.35})`; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.maxRadius * (1 - fx.life / 0.35), 0, Math.PI * 2); ctx.stroke();
        }
    });

    // Draw Dodge Ghost Trails
    ghostTrails.forEach(ghost => {
        ctx.save();
        ctx.translate(ghost.x, ghost.y);
        ctx.rotate(ghost.angle);
        ctx.fillStyle = `rgba(0, 255, 255, ${ghost.life / 0.15 * 0.4})`;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    if (gameState === 'playing' || gameState === 'win') {
        ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle);

        if (player.isBlocking) {
            ctx.strokeStyle = player.perfectGuardWindow > 0 ? '#ffffff' : '#00aaff'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, player.radius + 8, -Math.PI * 0.4, Math.PI * 0.4); ctx.stroke();
        }

        ctx.fillStyle = player.isDodging ? '#ffffff' : (player.perfectGuardWindow > 0 ? '#00ffff' : '#0088ff');
        ctx.beginPath(); ctx.arc(0, 0, player.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#002255'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(10, -4, 22, 8);
        ctx.restore();
    }

    if (gameState === 'playing' || gameState === 'lose') {
        ctx.save(); ctx.translate(boss.x, boss.y); ctx.rotate(boss.angle);
        ctx.fillStyle = boss.flashTimer > 0 ? boss.flashColor : (boss.state === 'stunned' ? '#201012' : (boss.state === 'interrupted' ? '#777777' : (boss.state === 'windup' ? ((Math.floor(performance.now() / 70) % 2 === 0) ? '#ff9900' : '#880000') : '#aa0000')));
        ctx.beginPath(); ctx.ellipse(0, 0, boss.radiusX, boss.radiusY, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = boss.isGroggy ? '#ffffff' : '#440000'; ctx.lineWidth = boss.isGroggy ? 5 : 3; ctx.stroke();
        ctx.fillStyle = '#ff0000'; ctx.fillRect(boss.radiusX - 12, -6, 15, 12); ctx.restore();
    }

    particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    });

    ctx.restore();
}

// --- UI UPDATES ---
function updateUI() {
    const hpPercent = Math.max(0, (player.hp / player.maxHp) * 100);
    document.getElementById('player-hp').style.width = hpPercent + '%';

    const regainTotalPercent = Math.max(0, ((player.hp + player.regainHp) / player.maxHp) * 100);
    document.getElementById('player-regain').style.width = regainTotalPercent + '%';

    document.getElementById('player-stam').style.width = Math.max(0, (player.stamina / player.maxStamina) * 100) + '%';

    document.getElementById('boss-hp').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    document.getElementById('boss-stagger').style.width = Math.max(0, (boss.stagger / boss.maxStagger) * 100) + '%';

    const bossContainer = document.getElementById('boss-hp-container');
    const staggerBar = document.getElementById('boss-stagger');
    if (boss.isGroggy) {
        bossContainer.classList.add('groggy-state'); staggerBar.style.backgroundColor = '#ffffff';
    } else {
        bossContainer.classList.remove('groggy-state'); staggerBar.style.backgroundColor = '#ffcc00';
    }
}

function triggerFeedbackText(message, color) {
    const text = document.getElementById('feedback-text');
    text.innerText = message; text.style.color = color; text.style.textShadow = `0 0 15px ${color}`;
    text.style.opacity = '1'; text.style.top = '30%';
    setTimeout(() => { text.style.opacity = '0'; text.style.top = '35%'; }, 700);
}

function endGame(result) {
    gameState = result;
    const msg = document.getElementById('game-over'); msg.style.display = 'block';
    if (result === 'win') { msg.innerText = 'BOSS VANQUISHED'; msg.style.color = '#00ff66'; }
    else { msg.innerText = 'YOU DIED'; msg.style.color = '#ff2222'; }
}

function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }
function normalizeAngle(angle) { while (angle < -Math.PI) angle += Math.PI * 2; while (angle > Math.PI) angle -= Math.PI * 2; return angle; }

function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    update(dt); render(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
