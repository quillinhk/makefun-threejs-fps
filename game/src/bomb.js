// The charge: plant it, guard it, or defuse it. Planting is a 3.2 s channel inside a site
// zone; once planted the charge ticks for 35 s with accelerating beeps, and a Warden that
// reaches it can defuse it in 5 s. main.js supplies the context (who is in a zone, who is
// defusing) and the outcomes (onPlant, onExplode, onDefuse).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { PLANT_TIME, BOMB_TIME, DEFUSE_TIME } from './state.js';

export function createBomb(scene, sounds) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.24, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), emissive: new THREE.Color(PALETTE.hazard), emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.2 }),
  );
  body.position.y = 0.12;
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.furnace), emissive: new THREE.Color(PALETTE.furnace), emissiveIntensity: 3 }),
  );
  led.position.set(0.1, 0.22, 0);
  group.add(body, led);
  const beacon = new THREE.PointLight(new THREE.Color(PALETTE.furnace), 4, 5, 1.8);
  beacon.position.set(0, 0.5, 0);
  group.add(beacon);
  group.visible = false;
  scene.add(group);

  const state = {
    planted: false,
    site: null,
    position: new THREE.Vector3(),
    timer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    beepTimer: 0,
    ledTimer: 0,
  };

  function update(dt, ctx) {
    if (!state.planted) {
      if (ctx.phase === 'live' && ctx.playerInZone && ctx.planting && ctx.playerAlive) {
        state.plantProgress += dt / PLANT_TIME;
        state.beepTimer -= dt;
        if (state.beepTimer <= 0) {
          state.beepTimer = 0.4;
          sounds.plantTick();
        }
        if (state.plantProgress >= 1) {
          state.planted = true;
          state.site = ctx.playerInZone;
          state.position.copy(ctx.playerPosition); // the ground under the planter's feet
          state.timer = BOMB_TIME;
          state.plantProgress = 0;
          group.position.copy(state.position);
          group.visible = true;
          sounds.plantDone();
          ctx.onPlant(state.site);
        }
      } else {
        state.plantProgress = 0;
      }
      return;
    }

    state.timer -= dt;
    state.beepTimer -= dt;
    const urgent = state.timer <= 10;
    if (state.beepTimer <= 0) {
      state.beepTimer = urgent ? 0.5 : 1.0;
      sounds.plantTick();
    }
    state.ledTimer -= dt;
    if (state.ledTimer <= 0) {
      state.ledTimer = urgent ? 0.25 : 0.6;
      led.visible = !led.visible;
    }
    if (ctx.defuser && ctx.defuser.alive) {
      state.defuseProgress += dt / DEFUSE_TIME;
      if (Math.floor(state.defuseProgress * 10) !== Math.floor((state.defuseProgress - dt / DEFUSE_TIME) * 10)) {
        sounds.defuseTick();
      }
      if (state.defuseProgress >= 1) {
        ctx.onDefuse();
      }
    } else {
      state.defuseProgress = 0;
    }
    if (state.timer <= 0) {
      ctx.onExplode(state.position.clone(), state.site);
    }
  }

  function reset() {
    state.planted = false;
    state.site = null;
    state.timer = 0;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.beepTimer = 0;
    group.visible = false;
    led.visible = true;
  }

  // Deterministic captures place an already-planted charge without playing the channel.
  function forcePlant(site, position, timer) {
    state.planted = true;
    state.site = site;
    state.position.copy(position);
    state.timer = timer;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    group.position.copy(state.position);
    group.visible = true;
  }

  return { state, update, reset, forcePlant };
}
