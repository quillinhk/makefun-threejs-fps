// The Wardens: five defender bots. Each one holds a position, patrols a route, and reacts to
// what it sees and hears. States: HOLD, PATROL, INVESTIGATE, ENGAGE, ROTATE, DEFUSE, DEAD.
// Vision is a cone plus line of sight; hearing is the noise events main.js reports (gunfire
// and explosions). Shooting is a ray with spread, the same path the player's shots take, so
// a bot can only hit what it can actually see. Pathing is BFS over the world's waypoint graph.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody } from './physics.js';

const HEALTH = 100;
const BOT_NAMES = ['Ash', 'Bram', 'Cinder', 'Dusk', 'Ember'];
const VISION_RANGE = 45;
const VISION_HALF_ANGLE = 1.05; // ~60 degrees
const HEAR_SHOT = 30;
const HEAR_BLAST = 50;
const REACTION_MIN = 0.6;
const REACTION_MAX = 1.0;
const BURST_SHOTS = 3;
const BURST_GAP = 0.12;
const BURST_REST_MIN = 1.2;
const BURST_REST_MAX = 2.0;
const BOT_DAMAGE = 9;
const BOT_DAMAGE_FALLOFF = 20;

// Where each bot starts the round: [hold waypoint id, patrol waypoint ids]
const ROLES = [
  { hold: 14, patrol: [14, 12, 16] }, // A site
  { hold: 16, patrol: [16, 14, 7] }, // A corner
  { hold: 15, patrol: [15, 13, 17] }, // B site
  { hold: 17, patrol: [17, 15, 8] }, // B corner
  { hold: 11, patrol: [11, 6, 7, 8] }, // mid roamer
];

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function createBots(scene, world, hooks) {
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.25 });
  const plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.55, metalness: 0.05 });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.6, roughness: 0.3 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeometry = new THREE.BoxGeometry(0.26, 0.26, 0.26);
  const legGeometry = new THREE.BoxGeometry(0.16, 0.7, 0.16);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const bots = [];
  const hitMeshes = [];

  for (let i = 0; i < 5; i += 1) {
    const spawn = world.spawns.defenders[i];
    const { body, step, wishFrom, groundSpeed } = createBody(world.colliders, {
      x: spawn.x,
      z: spawn.z,
      eye: 1.6,
      height: 1.72,
      walkSpeed: 5.0,
      crouchSpeed: 2.4,
    });
    const group = new THREE.Group();
    group.position.copy(spawn);
    const legL = new THREE.Mesh(legGeometry, steel);
    legL.position.set(-0.12, 0.35, 0);
    const legR = new THREE.Mesh(legGeometry, steel);
    legR.position.set(0.12, 0.35, 0);
    const torso = new THREE.Mesh(torsoGeometry, steel);
    torso.position.y = 1.06;
    torso.userData.part = 'torso';
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.06), plate);
    vest.position.set(0, 1.06, -0.17);
    const head = new THREE.Mesh(headGeometry, skin);
    head.position.y = 1.58;
    head.userData.part = 'head';
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.03), visor);
    visorMesh.position.set(0, 1.6, -0.14);
    const gun = new THREE.Mesh(gunGeometry, plate);
    gun.position.set(0.2, 1.25, -0.3);
    group.add(legL, legR, torso, vest, head, visorMesh, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      index: i,
      name: BOT_NAMES[i],
      body,
      group,
      legL,
      legR,
      torso,
      head,
      health: HEALTH,
      alive: true,
      state: 'HOLD',
      role: ROLES[i],
      path: [],
      pathIndex: 0,
      pathTarget: null,
      lastSeen: new THREE.Vector3(),
      lastSeenTime: -100,
      hearAt: new THREE.Vector3(),
      hearTime: -100,
      scanPhase: i * 1.3,
      visionTimer: i * 0.03,
      reactionLeft: 0,
      burstLeft: 0,
      burstTimer: 0,
      restLeft: 0,
      firstBurst: true,
      strafeDir: i % 2 === 0 ? 1 : -1,
      strafeTimer: 0,
      holdTimer: 0,
      fall: 0,
      defusing: false,
      walkPhase: 0,
      step,
      wishFrom,
      groundSpeed,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (const node of world.waypoints) {
      const d = (node.x - x) * (node.x - x) + (node.z - z) * (node.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = node.id;
      }
    }
    return best;
  }

  // BFS over the waypoint graph; returns the node ids from start to goal, start excluded.
  function findPath(startId, goalId) {
    if (startId === goalId) return [];
    const previous = new Map([[startId, -1]]);
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of world.waypoints[current].links) {
        if (previous.has(next)) continue;
        previous.set(next, current);
        if (next === goalId) {
          const path = [goalId];
          let node = goalId;
          while (previous.get(node) !== startId) {
            node = previous.get(node);
            path.unshift(node);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [];
  }

  function setPath(bot, goalId) {
    const from = nearestNode(bot.body.position.x, bot.body.position.z);
    bot.path = findPath(from, goalId);
    bot.pathIndex = 0;
    bot.pathTarget = goalId;
  }

  function canSee(bot, playerPos, playerEye, now) {
    _v1.copy(playerEye).sub(bot.body.position);
    _v1.y = 0;
    const distance = _v1.length();
    if (distance > VISION_RANGE) return false;
    if (distance > 6) {
      const forwardX = -Math.sin(bot.body.yaw);
      const forwardZ = -Math.cos(bot.body.yaw);
      const dot = (_v1.x * forwardX + _v1.z * forwardZ) / (distance || 1);
      if (dot < Math.cos(VISION_HALF_ANGLE)) return false;
    }
    _v2.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    return world.hasLineOfSight(_v2, playerEye);
  }

  function facePoint(bot, point) {
    const dx = point.x - bot.body.position.x;
    const dz = point.z - bot.body.position.z;
    const target = Math.atan2(-dx, -dz);
    let diff = target - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.body.yaw += Math.max(-0.12, Math.min(0.12, diff));
  }

  function walkPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = world.waypoints[bot.path[bot.pathIndex]];
    const dx = node.x - bot.body.position.x;
    const dz = node.z - bot.body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.7) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const wish = bot.wishFrom(0, 0, 0);
    // The wish is a world-space direction here, not a yaw-relative one.
    wish.set(dx / distance, 0, dz / distance);
    bot.step(dt, wish, speed, false, false);
    facePoint(bot, node);
    return false;
  }

  function fireAtPlayer(bot, player, now) {
    const origin = _v1.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    const target = _v2.copy(player.eyePosition(new THREE.Vector3()));
    target.y -= 0.35; // chest
    const distance = origin.distanceTo(target);
    // Spread grows through a burst (spray control matters) and the first burst after
    // spotting the player is wild: the bot is still acquiring the target.
    const burstGrowth = (BURST_SHOTS - bot.burstLeft) * 0.01;
    const wild = bot.firstBurst ? 2 : 1;
    const spread = (0.06 + distance * 0.0015 + player.groundSpeed() * 0.004 + burstGrowth) * wild;
    const direction = target.sub(origin).normalize();
    direction.x += (Math.random() * 2 - 1) * spread;
    direction.y += (Math.random() * 2 - 1) * spread;
    direction.z += (Math.random() * 2 - 1) * spread;
    direction.normalize();
    hooks.shootBot(bot, origin.clone(), direction.clone(), distance);
  }

  function updateBot(bot, dt, ctx) {
    const { time, player, phase, bombPlanted, bombPos, noise } = ctx;
    const live = phase === 'live';
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.08;
      return;
    }
    const playerPos = player.body.position;
    const playerEye = player.eyePosition(new THREE.Vector3());

    // Vision, staggered so all five do not raycast on the same step. Only live rounds
    // count: during the buy phase the bots walk to their holds and do not shoot.
    bot.visionTimer -= dt;
    if (live && bot.visionTimer <= 0) {
      bot.visionTimer = 0.12;
      if (player.state.alive && canSee(bot, playerPos, playerEye, time)) {
        bot.lastSeen.copy(playerPos);
        bot.lastSeenTime = time;
        if (bot.state !== 'ENGAGE') {
          bot.state = 'ENGAGE';
          bot.reactionLeft = REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
          bot.burstLeft = 0;
          bot.restLeft = 0;
          bot.firstBurst = true;
        }
      }
    }

    // Hearing: a shot or a blast inside its radius pulls the bot to the sound.
    if (live && noise && time - noise.time < 0.25) {
      const d = Math.hypot(noise.x - bot.body.position.x, noise.z - bot.body.position.z);
      const radius = noise.kind === 'blast' ? HEAR_BLAST : HEAR_SHOT;
      if (d < radius && bot.state !== 'ENGAGE' && bot.state !== 'DEFUSE') {
        bot.hearAt.set(noise.x, 0, noise.z);
        bot.hearTime = time;
        if (bot.state !== 'ROTATE') {
          bot.state = 'INVESTIGATE';
          setPath(bot, nearestNode(noise.x, noise.z));
        }
      }
    }

    // A planted charge pulls every living defender to the site.
    if (live && bombPlanted && bot.state !== 'ENGAGE' && bot.state !== 'DEFUSE' && bot.state !== 'ROTATE') {
      bot.state = 'ROTATE';
      setPath(bot, nearestNode(bombPos.x, bombPos.z));
    }

    const speed = bot.state === 'ROTATE' ? 5.0 : bot.state === 'PATROL' ? 2.4 : 3.8;
    switch (bot.state) {
      case 'HOLD': {
        bot.body.yaw += Math.sin(time * 0.7 + bot.scanPhase) * 0.008;
        bot.holdTimer += dt;
        if (bot.holdTimer > 6) {
          bot.holdTimer = 0;
          bot.state = 'PATROL';
          bot.pathIndex = 0;
          setPath(bot, bot.role.patrol[(bot.index + 1) % bot.role.patrol.length]);
        }
        break;
      }
      case 'PATROL': {
        if (walkPath(bot, dt, 2.4)) {
          bot.state = 'HOLD';
          bot.holdTimer = 0;
        }
        break;
      }
      case 'INVESTIGATE': {
        if (walkPath(bot, dt, 3.8)) {
          // Reached the sound: look around, then walk home.
          bot.holdTimer += dt;
          bot.body.yaw += dt * 1.2;
          if (bot.holdTimer > 2) {
            bot.holdTimer = 0;
            bot.state = 'PATROL';
            setPath(bot, bot.role.hold);
          }
        }
        break;
      }
      case 'ENGAGE': {
        facePoint(bot, playerPos);
        if (!live || !player.state.alive || time - bot.lastSeenTime > 4) {
          bot.state = bombPlanted ? 'ROTATE' : 'INVESTIGATE';
          if (bot.state === 'INVESTIGATE') setPath(bot, nearestNode(bot.lastSeen.x, bot.lastSeen.z));
          break;
        }
        // Strafe sideways while shooting, so the bot is not a standing target.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.9 + Math.random() * 0.8;
          bot.strafeDir *= -1;
        }
        const strafe = bot.wishFrom(0, bot.strafeDir, bot.body.yaw);
        bot.step(dt, strafe, 1.6, false, false);
        if (bot.reactionLeft > 0) {
          bot.reactionLeft -= dt;
        } else if (bot.burstLeft > 0) {
          bot.burstTimer -= dt;
          if (bot.burstTimer <= 0) {
            bot.burstTimer = BURST_GAP;
            bot.burstLeft -= 1;
            fireAtPlayer(bot, player, time);
            if (bot.burstLeft === 0) bot.firstBurst = false;
          }
        } else {
          bot.restLeft -= dt;
          if (bot.restLeft <= 0) {
            bot.burstLeft = BURST_SHOTS;
            bot.burstTimer = 0;
            bot.restLeft = BURST_REST_MIN + Math.random() * (BURST_REST_MAX - BURST_REST_MIN);
          }
        }
        break;
      }
      case 'ROTATE': {
        if (walkPath(bot, dt, 5.0)) {
          // Arrived at the site: the first bot there defuses, the rest cover.
          if (bombPlanted && !hooks.defuserAssigned()) {
            bot.state = 'DEFUSE';
            bot.defusing = true;
            hooks.assignDefuser(bot);
          } else {
            bot.state = 'HOLD';
            bot.holdTimer = 0;
          }
        }
        break;
      }
      case 'DEFUSE': {
        facePoint(bot, bombPos);
        if (!player.state.alive) {
          // Nothing left to stop it; the channel runs in main.js.
        } else if (time - bot.lastSeenTime < 1.5) {
          bot.defusing = false;
          bot.state = 'ENGAGE';
          hooks.releaseDefuser(bot);
        }
        break;
      }
      default:
        break;
    }

    // Walk cycle: legs swing and the body bobs while the bot moves.
    const moving = bot.groundSpeed();
    if (moving > 0.4) {
      bot.walkPhase += dt * moving * 1.9;
      const swing = Math.sin(bot.walkPhase) * 0.45;
      bot.legL.rotation.x = swing;
      bot.legR.rotation.x = -swing;
      bot.group.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.03;
    } else {
      bot.legL.rotation.x *= 0.8;
      bot.legR.rotation.x *= 0.8;
      bot.group.position.y = 0;
    }
    bot.group.position.x = bot.body.position.x;
    bot.group.position.z = bot.body.position.z;
    bot.group.rotation.y = bot.body.yaw;
  }

  function step(dt, ctx) {
    for (const bot of bots) updateBot(bot, dt, ctx);
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.state = 'DEAD';
    bot.fall = 0;
    if (bot.defusing) {
      bot.defusing = false;
      hooks.releaseDefuser(bot);
    }
    return true;
  }

  function reset() {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const spawn = world.spawns.defenders[i];
      bot.body.position.set(spawn.x, 0, spawn.z);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = Math.atan2(-(0 - spawn.x), -(-8 - spawn.z)); // face mid at the start
      bot.group.position.copy(spawn);
      bot.group.rotation.set(0, bot.body.yaw, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'HOLD';
      bot.path = [];
      bot.pathIndex = 0;
      bot.lastSeenTime = -100;
      bot.hearTime = -100;
      bot.fall = 0;
      bot.defusing = false;
      bot.holdTimer = i * 0.7;
      bot.legL.rotation.x = 0;
      bot.legR.rotation.x = 0;
    }
  }

  function aliveCount() {
    let count = 0;
    for (const bot of bots) if (bot.alive) count += 1;
    return count;
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    reset,
    aliveCount,
    nearestNode,
    setPath,
  };
}
