// EMBERWORKS — boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. main.js wires the modules together and owns the round flow; the rules live
// in state.js, the map in world.js, the shooting in the raycasts below, the bots in bots.js.
// ?shot=combat|start|plant|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPON_DEFS, VEST_DEF } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createState, PHASE, WIN_ROUNDS, MAX_ROUNDS, ROUND_TIME, BUY_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME } from './state.js';
import { REWARDS } from './economy.js';
import { audio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const weapons = createWeapons(camera, world, effects, audio);
const player = createPlayer(world.colliders, world.spawns.player);
const hud = createHud();
const state = createState();
const bomb = createBomb(scene, audio);

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const ray = new THREE.Ray();
const playerBox = new THREE.Box3();
const headBox = new THREE.Box3();
const torsoBox = new THREE.Box3();
const shootables = world.shootables.concat([]); // bots' hit meshes are appended below

let defuser = null;
const noise = { x: 0, z: 0, kind: 'shot', time: -100 };
let trauma = 0;
let fov = 74;
let roundEndTimer = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

const bots = createBots(scene, world, {
  shootBot(bot, origin, dir, distance) {
    resolveBotShot(bot, origin, dir, distance);
  },
  defuserAssigned() {
    return defuser !== null;
  },
  assignDefuser(bot) {
    defuser = bot;
  },
  releaseDefuser(bot) {
    if (defuser === bot) defuser = null;
  },
});
for (const mesh of bots.hitMeshes) shootables.push(mesh);

weapons.setDetonateHook((point, radius, maxDamage, minDamage) => {
  damageAt(point, radius, maxDamage, minDamage, 'grenade');
  noise.x = point.x;
  noise.z = point.z;
  noise.kind = 'blast';
  noise.time = state.elapsed;
  addTrauma(0.5, point);
});

const input = createInput(renderer.domElement, onLockChange);

// ---- helpers ---------------------------------------------------------------

function playerInZone() {
  const p = player.body.position;
  if (world.sites.A.zone.containsPoint(tmpVec.set(p.x, 1, p.z))) return 'A';
  if (world.sites.B.zone.containsPoint(tmpVec.set(p.x, 1, p.z))) return 'B';
  return null;
}

function addTrauma(amount, point) {
  const distance = point ? player.body.position.distanceTo(point) : 0;
  const falloff = point ? Math.max(0.25, 1 - distance / 25) : 1;
  trauma = Math.min(1, trauma + amount * falloff);
}

function syncCamera(dt) {
  player.eyePosition(eyePos);
  const shake = trauma * trauma * 0.03;
  camera.position.set(
    eyePos.x + (random() * 2 - 1) * shake,
    eyePos.y + (random() * 2 - 1) * shake,
    eyePos.z + (random() * 2 - 1) * shake,
  );
  camera.rotation.set(player.state.pitch, player.body.yaw, 0, 'YXZ');
  const targetFov = weapons.state.scoped ? 26 : 74;
  if (Math.abs(fov - targetFov) > 0.05) {
    fov += (targetFov - fov) * Math.min(1, dt * 12);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  trauma = Math.max(0, trauma - dt * 1.6);
}

// ---- shooting ---------------------------------------------------------------

function shoot(spread) {
  const def = weapons.currentDef();
  if (!weapons.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  weapons.muzzleWorld(muzzle);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = def.range;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point : tmpVec2.copy(camera.position).addScaledVector(direction, def.range);
  effects.tracer(muzzle, end);
  if (hit) {
    const bot = hit.object.userData.bot;
    if (bot) {
      const headshot = hit.object.userData.part === 'head';
      const damage = def.damage * (headshot ? def.headMult : 1);
      const killed = bots.damage(hit.object, damage);
      if (killed) {
        state.kills += 1;
        state.money += REWARDS.kill;
        hud.killfeed('You', bot.name, headshot);
        hud.hitMarker(true, shot ? 4000 : 90);
        audio.kill();
      } else {
        hud.hitMarker(false, shot ? 4000 : 90);
        audio.hit();
      }
      if (bots.aliveCount() === 0) endRound(true, 'All Wardens eliminated');
    } else {
      tmpVec.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      effects.impact(hit.point, tmpVec);
    }
  }
  weapons.pullTrigger();
  player.recoil(def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
  noise.x = player.body.position.x;
  noise.z = player.body.position.z;
  noise.kind = 'shot';
  noise.time = state.elapsed;
  hud.setAmmo(weapons.inventory[weapons.state.current].mag, weapons.inventory[weapons.state.current].reserve, def.name, weapons.state.grenades);
  return true;
}

// A bot's shot: the world is raycast first, then the player's two boxes are tested against
// the same ray, so a bot can only hit what it can actually see.
function resolveBotShot(bot, origin, dir, distance) {
  raycaster.set(origin, dir);
  raycaster.far = 80;
  const wallHit = raycaster.intersectObjects(world.shootables, false)[0];
  const wallDistance = wallHit ? wallHit.distance : 80;
  ray.origin.copy(origin);
  ray.direction.copy(dir);
  const p = player.body.position;
  torsoBox.min.set(p.x - 0.34, p.y + 0.25, p.z - 0.34);
  torsoBox.max.set(p.x + 0.34, p.y + 1.45, p.z + 0.34);
  headBox.min.set(p.x - 0.2, p.y + 1.45, p.z - 0.2);
  headBox.max.set(p.x + 0.2, p.y + 1.72, p.z + 0.2);
  const headHit = ray.intersectBox(headBox, tmpVec);
  const torsoHit = !headHit ? ray.intersectBox(torsoBox, tmpVec2) : null;
  const hitPoint = headHit ?? torsoHit;
  const hitDistance = hitPoint ? origin.distanceTo(hitPoint) : Infinity;
  const end = hitPoint ?? tmpVec2.copy(origin).addScaledVector(dir, Math.min(wallDistance, 60));
  effects.tracer(origin, end);
  audio.enemyShot();
  if (hitPoint && hitDistance < wallDistance && player.state.alive) {
    let damage = 9 * (distance > 20 ? 0.7 : 1);
    if (headHit) damage *= 1.5;
    player.damage(damage);
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) {
      hud.killfeed(bot.name, 'You', !!headHit);
      if (!bomb.state.planted) endRound(false, 'You were eliminated');
      // With the charge planted the round plays on: the Wardens must still defuse it.
    }
  }
}

// Blast damage at a point: falloff by distance, blocked by walls, hits the player and bots.
function damageAt(point, radius, maxDamage, minDamage, source) {
  const targets = [{ kind: 'player', position: player.body.position, chest: 1.2 }];
  for (const bot of bots.bots) {
    if (bot.alive) targets.push({ kind: 'bot', bot, position: bot.body.position, chest: 1.2 });
  }
  for (const target of targets) {
    const distance = Math.hypot(target.position.x - point.x, target.position.z - point.z);
    if (distance > radius) continue;
    tmpVec.set(target.position.x, target.position.y + target.chest, target.position.z);
    if (!world.hasLineOfSight(point, tmpVec)) continue;
    const damage = Math.round(minDamage + (maxDamage - minDamage) * (1 - distance / radius));
    if (target.kind === 'player') {
      if (!player.state.alive) continue;
      player.damage(damage);
      hud.damageFlash();
      audio.hurt();
      if (!player.state.alive && source === 'grenade' && !bomb.state.planted) {
        endRound(false, 'Caught by your own blast');
      }
    } else {
      const killed = bots.damage(target.bot.torso, damage);
      if (killed) {
        state.kills += 1;
        state.money += REWARDS.kill;
        hud.killfeed('You', target.bot.name, false);
        if (bots.aliveCount() === 0) endRound(true, 'All Wardens eliminated');
      }
    }
  }
}

// ---- round flow -------------------------------------------------------------

function startMatch() {
  state.wins = 0;
  state.losses = 0;
  state.money = 800;
  state.kills = 0;
  state.round = 1;
  state.started = true;
  weapons.inventory.pistol.owned = true;
  for (const def of WEAPON_DEFS) {
    if (def.id !== 'pistol') weapons.inventory[def.id].owned = false;
  }
  weapons.select('pistol');
  startRound();
}

function startRound() {
  state.phase = PHASE.BUY;
  state.timer = BUY_TIME;
  state.bombPlanted = false;
  state.bombSite = null;
  state.roundWinner = null;
  state.roundReason = '';
  defuser = null;
  player.reset(world.spawns.player);
  weapons.refill();
  weapons.select('pistol');
  bots.reset();
  bomb.reset();
  trauma = 0;
  hud.setHealth(100, 0);
  hud.setMoney(state.money);
  hud.setScore(state.wins, state.losses, state.round);
  hud.setAlive(true, 5);
  hud.setBombStatus('PLANT THE CHARGE — FURNACE (A) OR DEPOT (B)', false);
  hud.hidePlant();
  hud.showOverlay('buy', { round: state.round, money: state.money, timer: state.timer, owned: ownedIds() });
}

function ownedIds() {
  return WEAPON_DEFS.filter((def) => weapons.inventory[def.id].owned).map((def) => def.id);
}

function startLive() {
  state.phase = PHASE.LIVE;
  state.timer = ROUND_TIME;
  hud.hideOverlay();
}

function endRound(won, reason) {
  if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) return;
  const reward = won ? REWARDS.roundWin : REWARDS.roundLoss;
  state.money += reward;
  state.lastReward = reward;
  if (won) state.wins += 1;
  else state.losses += 1;
  state.roundWinner = won ? 'Vanguard' : 'Wardens';
  state.roundReason = reason;
  state.phase = PHASE.ROUND_END;
  roundEndTimer = 3.5;
  const matchOver = state.wins >= WIN_ROUNDS || state.losses >= WIN_ROUNDS || state.round >= MAX_ROUNDS;
  if (won) audio.roundWin();
  else audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
  hud.setScore(state.wins, state.losses, state.round);
  hud.showOverlay('round', {
    won,
    reason,
    reward,
    wins: state.wins,
    losses: state.losses,
    matchOver,
  });
}

function advanceAfterRound() {
  const matchOver = state.wins >= WIN_ROUNDS || state.losses >= WIN_ROUNDS || state.round >= MAX_ROUNDS;
  if (matchOver) {
    state.phase = PHASE.MATCH_END;
    hud.showOverlay('match', { won: state.wins > state.losses, wins: state.wins, losses: state.losses, kills: state.kills });
    return;
  }
  state.round += 1;
  startRound();
}

function buyItem(id) {
  if (state.phase !== PHASE.BUY) return;
  if (id === 'vest') {
    if (player.state.armor >= 100) return;
    if (state.money < VEST_DEF.price) {
      audio.denied();
      return;
    }
    state.money -= VEST_DEF.price;
    player.state.armor = 100;
    audio.buy();
  } else {
    const result = weapons.buy(id, state.money);
    if (!result.ok) {
      audio.denied();
      return;
    }
    state.money -= result.cost;
    audio.buy();
  }
  hud.setMoney(state.money);
  hud.setHealth(player.state.health, player.state.armor);
  hud.refreshBuy(state.money, ownedIds());
  const slot = weapons.inventory[weapons.state.current];
  hud.setAmmo(slot.mag, slot.reserve, weapons.currentDef().name, weapons.state.grenades);
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (state.phase === PHASE.MENU) {
    startMatch();
    return;
  }
  if (state.phase === PHASE.BUY) {
    startLive();
    input.requestLock();
    return;
  }
  if (state.phase === PHASE.ROUND_END) {
    advanceAfterRound();
    return;
  }
  if (state.phase === PHASE.MATCH_END) {
    startMatch();
    return;
  }
  input.requestLock();
});
hud.onBuy((id) => buyItem(id));

function onLockChange(locked) {
  if (shot) return;
  if (!locked && state.phase === PHASE.LIVE && player.state.alive && bots.aliveCount() > 0) {
    hud.showOverlay('paused');
  }
}

renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  if ((state.phase === PHASE.LIVE || state.phase === PHASE.BUY) && !input.state.locked && overlayIsHidden()) {
    input.requestLock();
  }
});

function overlayIsHidden() {
  return document.getElementById('overlay').hidden;
}

// ---- simulation step --------------------------------------------------------

function step(dt) {
  state.elapsed += dt;
  world.step(state.elapsed);

  if (state.phase === PHASE.BUY) {
    state.timer -= dt;
    player.moveStep(dt, input.state.keys);
    bots.step(dt, botContext());
    if (state.timer <= 0) startLive();
  } else if (state.phase === PHASE.LIVE) {
    state.timer -= dt;
    player.moveStep(dt, input.state.keys);
    weapons.step(dt);
    bots.step(dt, botContext());
    bomb.update(dt, {
      phase: 'live',
      playerInZone: playerInZone(),
      planting: input.state.keys.has('KeyE'),
      playerAlive: player.state.alive,
      playerPosition: player.body.position,
      defuser,
      onPlant(site) {
        state.bombPlanted = true;
        state.bombSite = site;
        state.money += REWARDS.plant;
        hud.setMoney(state.money);
        hud.setBombStatus(`CHARGE PLANTED — ${world.sites[site].name.toUpperCase()} · ${formatBombTimer()}`, false);
      },
      onExplode(point, site) {
        effects.explosion(point);
        audio.explosion();
        addTrauma(0.9, point);
        damageAt(point, 9, 200, 40, 'bomb');
        endRound(true, `Charge detonated at ${world.sites[site].name}`);
      },
      onDefuse() {
        endRound(false, 'Charge defused');
      },
    });
    if (state.phase === PHASE.LIVE && state.timer <= 0 && !bomb.state.planted) {
      endRound(false, 'Time expired — charge not planted');
    }
    if (state.phase === PHASE.LIVE && bomb.state.planted) {
      hud.setBombStatus(`CHARGE PLANTED — ${world.sites[bomb.state.site].name.toUpperCase()} · ${formatBombTimer()}`, bomb.state.timer <= 10);
    }
  } else if (state.phase === PHASE.ROUND_END) {
    weapons.step(dt);
    bots.step(dt, botContext());
    roundEndTimer -= dt;
    if (roundEndTimer <= 0) advanceAfterRound();
  } else {
    bots.step(dt, botContext());
  }

  effects.step(dt);
}

function botContext() {
  botCtx.time = state.elapsed;
  botCtx.player = player;
  botCtx.phase = state.phase;
  botCtx.bombPlanted = bomb.state.planted;
  botCtx.bombPos = bomb.state.position;
  botCtx.noise = noise;
  return botCtx;
}
const botCtx = { time: 0, player: null, phase: 'menu', bombPlanted: false, bombPos: null, noise: null };

function formatBombTimer() {
  const total = Math.max(0, Math.ceil(bomb.state.timer));
  return `0:${String(total).padStart(2, '0')}`;
}

// ---- frame ------------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const pressed = input.takePressed();
    for (const code of pressed) {
      if (code === 'KeyR') weapons.reload();
      else if (code === 'KeyB' && state.phase === PHASE.BUY) {
        if (overlayIsHidden()) hud.showOverlay('buy', { round: state.round, money: state.money, timer: state.timer, owned: ownedIds() });
        else {
          hud.hideOverlay();
          input.requestLock();
        }
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(code) && state.phase === PHASE.BUY) {
        const items = ['pistol', 'smg', 'rifle', 'sniper', 'grenade', 'vest'];
        buyItem(items[Number(code.slice(5)) - 1]);
      } else if (code === 'KeyG' && state.phase === PHASE.LIVE) {
        player.eyePosition(eyePos);
        camera.getWorldDirection(direction);
        if (weapons.throwGrenade(eyePos, direction, player.body.velocity)) {
          hud.setAmmo(weapons.inventory[weapons.state.current].mag, weapons.inventory[weapons.state.current].reserve, weapons.currentDef().name, weapons.state.grenades);
        }
      } else if (code === 'Digit1') weapons.select('pistol');
      else if (code === 'Digit2') weapons.select('smg');
      else if (code === 'Digit3') weapons.select('rifle');
      else if (code === 'Digit4') weapons.select('sniper');
      else if (code === 'Digit5' && state.phase === PHASE.LIVE) {
        player.eyePosition(eyePos);
        camera.getWorldDirection(direction);
        weapons.throwGrenade(eyePos, direction, player.body.velocity);
      }
    }
    if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
      const def = weapons.currentDef();
      if (def.auto) {
        if (input.state.firing && weapons.ready()) shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
      } else {
        const clicks = input.takeClicks();
        if (clicks.length > 0 && weapons.ready()) shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
      }
      weapons.setScoped(input.state.scoped && weapons.state.current === 'sniper');
    } else {
      input.takeClicks();
    }
    if (input.state.keys.has('KeyR')) weapons.reload();

    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera(dt);
    syncHud();
  }
  renderer.render(scene, camera);
}

function syncHud() {
  const slot = weapons.inventory[weapons.state.current];
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(slot.mag, slot.reserve, weapons.currentDef().name, weapons.state.grenades);
  hud.setMoney(state.money);
  hud.setScore(state.wins, state.losses, state.round);
  hud.setAlive(player.state.alive, bots.aliveCount());
  if (state.phase === PHASE.BUY) hud.setTimer(state.timer, 'BUY');
  else if (state.phase === PHASE.LIVE) hud.setTimer(bomb.state.planted ? bomb.state.timer : state.timer, bomb.state.planted ? 'CHARGE' : 'ROUND');
  else if (state.phase === PHASE.ROUND_END) hud.setTimer(roundEndTimer, 'NEXT');
  else hud.setTimer(0, 'ROUND');
  hud.setCrosshairGap(4 + weapons.spread(player.groundSpeed()) * 900);
  if (state.phase === PHASE.LIVE) {
    const zone = playerInZone();
    if (bomb.state.planted) {
      hud.hint(defuser ? 'A Warden is defusing the charge — stop them!' : 'Defend the planted charge.');
      if (bomb.state.defuseProgress > 0) hud.showPlant('DEFUSE IN PROGRESS', bomb.state.defuseProgress);
      else hud.hidePlant();
    } else if (zone) {
      hud.hint(`Hold E to plant the charge at ${world.sites[zone].name} (${zone})`);
      if (bomb.state.plantProgress > 0) hud.showPlant('PLANTING CHARGE', bomb.state.plantProgress);
      else hud.hidePlant();
    } else {
      hud.hint('');
      hud.hidePlant();
    }
  } else {
    hud.hint('');
    hud.hidePlant();
  }
}

// ---- deterministic captures -------------------------------------------------

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - player.body.position.x;
  const dy = point.y - (player.body.position.y + player.body.eye);
  const dz = point.z - player.body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.body.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera(0);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera(0);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    startMatch();
    player.body.position.set(0, 0, 15);
    player.body.yaw = 0;
    player.state.pitch = 0;
    settle(30);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    hud.setHealth(100, 0);
    hud.setMoney(state.money);
    syncHud();
    paintTwiceThenReady();
    return;
  }
  if (name === 'combat') {
    startMatch();
    state.money += 3000;
    buyItem('rifle');
    startLive();
    player.body.position.set(0, 0, 2);
    settle(20);
    const bot = bots.bots[4]; // the mid roamer, holding at (0, -8)
    aimAt(new THREE.Vector3(bot.body.position.x, 1.3, bot.body.position.z));
    shoot(0);
    settle(1);
    aimAt(new THREE.Vector3(bot.body.position.x, 1.3, bot.body.position.z));
    shoot(0);
    settle(1);
    hud.setHealth(100, 0);
    syncHud();
    paintTwiceThenReady();
    return;
  }
  if (name === 'plant') {
    startMatch();
    startLive();
    // Plant at Furnace (A) as if the player just finished the channel. The charge sits on
    // open ground east of the furnace platform, where the camera can see it.
    player.body.position.set(-11, 0, -8);
    settle(10);
    bomb.forcePlant('A', new THREE.Vector3(-12.5, 0, -12), 28);
    state.bombPlanted = true;
    state.bombSite = 'A';
    state.money += REWARDS.plant;
    const rotator = bots.bots[1];
    rotator.state = 'ROTATE';
    bots.setPath(rotator, bots.nearestNode(-12.5, -12));
    settle(40);
    aimAt(new THREE.Vector3(-12.5, 0.3, -12));
    hud.setHealth(82, 50);
    player.state.health = 82;
    player.state.armor = 50;
    syncHud();
    paintTwiceThenReady();
    return;
  }
  if (name === 'end') {
    startMatch();
    endRound(true, 'Charge detonated at Furnace');
    syncHud();
    paintTwiceThenReady();
    return;
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for automated play-testing (read-only state plus test hooks).
window.__game = {
  state,
  player,
  bots,
  weapons,
  bomb,
  debug: {
    plant(site) {
      const zone = world.sites[site];
      player.body.position.set(zone.center.x, 0, zone.center.z);
    },
    killBots() {
      for (const bot of bots.bots) {
        if (bot.alive) bots.damage(bot.torso, 1000);
      }
    },
    damageBot(index, amount) {
      const bot = bots.bots[index];
      if (bot && bot.alive) bots.damage(bot.torso, amount);
    },
    killPlayer() {
      player.damage(10000);
    },
    giveMoney(amount) {
      state.money += amount;
    },
    startLive() {
      startLive();
    },
  },
};

syncCamera(0);
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
