// The arsenal: four guns and one grenade. This module owns the weapon numbers, the view
// models, magazines, reloads, spread and recoil; main.js owns the ray and the damage.
// Ammo lives per weapon, so switching guns keeps what each one had left.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = [
  { id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 4, mag: 12, reserve: 36, gap: 0.16, auto: false, reload: 1.1, spreadStill: 0.004, spreadMove: 0.02, recoil: 0.006, kick: 0.03, range: 60 },
  { id: 'smg', name: 'Rook-9', price: 1500, damage: 22, headMult: 4, mag: 32, reserve: 96, gap: 0.075, auto: true, reload: 1.6, spreadStill: 0.006, spreadMove: 0.03, recoil: 0.005, kick: 0.02, range: 55 },
  { id: 'rifle', name: 'VK-7', price: 2700, damage: 34, headMult: 4, mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.009, kick: 0.055, range: 80 },
  { id: 'sniper', name: 'Longbow .50', price: 4750, damage: 90, headMult: 4, mag: 5, reserve: 15, gap: 1.1, auto: false, reload: 2.8, spreadStill: 0.0006, spreadMove: 0.05, recoil: 0.03, kick: 0.12, range: 120 },
];
export const GRENADE_DEF = { id: 'grenade', name: 'Spark HE', price: 300 };
export const VEST_DEF = { id: 'vest', name: 'Plate Vest', price: 650 };

const GRENADE_FUSE_AFTER_BOUNCE = 1.8;
const GRENADE_FUSE_MAX = 2.6;
const GRENADE_RADIUS = 6.5;
const GRENADE_MAX_DAMAGE = 115;
const GRENADE_MIN_DAMAGE = 20;

const muzzleWorld = new THREE.Vector3();
const muzzleLocal = new THREE.Vector3(0.28, -0.24, -1.0);

export function createWeapons(camera, world, effects, sounds) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const rustMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.25 });

  function buildModel(def) {
    const model = new THREE.Group();
    const add = (w, h, d, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (def.id === 'pistol') {
      add(0.05, 0.09, 0.22, 0, 0, -0.1, bodyMat);
      add(0.045, 0.1, 0.06, 0, -0.08, 0.02, grip);
    } else if (def.id === 'smg') {
      add(0.08, 0.09, 0.34, 0, 0, -0.12, bodyMat);
      add(0.05, 0.12, 0.06, 0, -0.09, 0.02, grip);
      add(0.04, 0.04, 0.2, 0, 0.02, -0.3, grip);
    } else if (def.id === 'rifle') {
      add(0.09, 0.1, 0.42, 0, 0, -0.08, bodyMat);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.42, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.24, grip);
      add(0.05, 0.05, 0.1, 0, 0.07, -0.1, rustMat);
    } else {
      add(0.09, 0.11, 0.62, 0, 0, -0.16, bodyMat);
      add(0.06, 0.06, 0.5, 0, 0.03, -0.6, grip);
      add(0.05, 0.09, 0.08, 0, -0.05, 0.1, grip);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), rustMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.12);
      model.add(scope);
    }
    model.position.set(0.28, -0.26, -0.7);
    model.scale.setScalar(0.45);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.13),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.28, -0.24, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.28, -0.22, -0.8);
  camera.add(flashLight);

  const models = {};
  for (const def of WEAPON_DEFS) models[def.id] = buildModel(def);

  const inventory = {};
  for (const def of WEAPON_DEFS) inventory[def.id] = { owned: false, mag: def.mag, reserve: def.reserve };
  inventory.pistol.owned = true;

  const state = {
    current: 'pistol',
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    scoped: false,
    grenades: 0,
    grenadeCooldown: 0,
  };
  models.pistol.visible = true;

  // The live grenade, if any: one at a time, bounced per axis so it never tunnels a wall.
  const grenade = { active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), fuse: 0, bounced: false, mesh: null };
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.4, metalness: 0.5 }),
  );
  grenadeMesh.visible = false;
  grenade.mesh = grenadeMesh;
  world.group.add(grenadeMesh);

  const probe = new THREE.Box3();
  function hitsWorld(x, y, z, radius) {
    probe.min.set(x - radius, y - radius, z - radius);
    probe.max.set(x + radius, y + radius, z + radius);
    for (let i = 0; i < world.colliders.length; i += 1) {
      if (probe.intersectsBox(world.colliders[i])) return true;
    }
    return false;
  }

  function currentDef() {
    return WEAPON_DEFS.find((def) => def.id === state.current);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.grenadeCooldown = Math.max(0, state.grenadeCooldown - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.7 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const def = currentDef();
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = inventory[state.current];
        const take = Math.min(def.mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
    if (grenade.active) stepGrenade(dt);
  }

  function stepGrenade(dt) {
    grenade.velocity.y -= 20 * dt;
    const radius = 0.09;
    const next = grenade.position;
    let moved = next.x + grenade.velocity.x * dt;
    if (!hitsWorld(moved, next.y, next.z, radius)) next.x = moved;
    else {
      grenade.velocity.x *= -0.45;
      grenade.velocity.y *= 0.7;
      grenade.velocity.z *= 0.7;
      if (!grenade.bounced) {
        grenade.bounced = true;
        grenade.fuse = Math.min(grenade.fuse, GRENADE_FUSE_AFTER_BOUNCE);
        sounds.bounce();
      }
    }
    moved = next.z + grenade.velocity.z * dt;
    if (!hitsWorld(next.x, next.y, moved, radius)) next.z = moved;
    else {
      grenade.velocity.z *= -0.45;
      grenade.velocity.x *= 0.7;
      grenade.velocity.y *= 0.7;
      if (!grenade.bounced) {
        grenade.bounced = true;
        grenade.fuse = Math.min(grenade.fuse, GRENADE_FUSE_AFTER_BOUNCE);
        sounds.bounce();
      }
    }
    moved = next.y + grenade.velocity.y * dt;
    if (!hitsWorld(next.x, moved, next.z, radius)) next.y = moved;
    else {
      if (grenade.velocity.y < -1.5) {
        grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.45;
        if (!grenade.bounced) {
          grenade.bounced = true;
          grenade.fuse = Math.min(grenade.fuse, GRENADE_FUSE_AFTER_BOUNCE);
          sounds.bounce();
        }
      } else {
        grenade.velocity.y = 0;
        grenade.velocity.x *= 0.86;
        grenade.velocity.z *= 0.86;
      }
    }
    if (next.y < radius) {
      next.y = radius;
      grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.4;
    }
    grenadeMesh.position.copy(next);
    grenade.fuse -= dt;
    if (grenade.fuse <= 0) detonate();
  }

  // Called by main.js through the onDetonate hook set below.
  let onDetonate = null;
  function detonate() {
    const point = grenade.position.clone();
    grenade.active = false;
    grenadeMesh.visible = false;
    effects.explosion(point);
    sounds.explosion();
    if (onDetonate) onDetonate(point, GRENADE_RADIUS, GRENADE_MAX_DAMAGE, GRENADE_MIN_DAMAGE);
  }

  return {
    state,
    inventory,
    defs: WEAPON_DEFS,
    currentDef,
    setDetonateHook(hook) {
      onDetonate = hook;
    },
    select(id) {
      if (!inventory[id] || !inventory[id].owned || state.current === id) return false;
      models[state.current].visible = false;
      state.current = id;
      state.reloadLeft = 0;
      state.scoped = false;
      models[id].visible = true;
      return true;
    },
    buy(id, money) {
      const def = WEAPON_DEFS.find((entry) => entry.id === id);
      if (def) {
        if (inventory[id].owned) return { ok: false, reason: 'already owned' };
        if (money < def.price) return { ok: false, reason: 'not enough money' };
        inventory[id].owned = true;
        inventory[id].mag = def.mag;
        inventory[id].reserve = def.reserve;
        this.select(id);
        return { ok: true, cost: def.price };
      }
      if (id === 'grenade') {
        if (money < GRENADE_DEF.price) return { ok: false, reason: 'not enough money' };
        state.grenades += 1;
        return { ok: true, cost: GRENADE_DEF.price };
      }
      return { ok: false, reason: 'unknown item' };
    },
    ready() {
      const slot = inventory[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().gap;
      state.flash = 0.06;
      state.kick = currentDef().kick;
      sounds.shot(state.current);
    },
    takeRound() {
      const slot = inventory[state.current];
      if (slot.mag <= 0) {
        sounds.dryFire();
        return false;
      }
      slot.mag -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      const slot = inventory[state.current];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return;
      state.reloadLeft = def.reload;
      sounds.reload();
    },
    spread(speed) {
      const def = currentDef();
      const moving = Math.min(1, speed / 5.2);
      let base = def.spreadStill + moving * def.spreadMove;
      if (state.current === 'sniper' && state.scoped) base = def.spreadStill;
      if (state.current === 'sniper' && !state.scoped) base = def.spreadMove;
      return base;
    },
    setScoped(scoped) {
      if (state.current !== 'sniper') return;
      state.scoped = scoped;
      models.sniper.visible = !scoped;
    },
    throwGrenade(origin, direction, playerVelocity) {
      if (state.grenades <= 0 || state.grenadeCooldown > 0 || grenade.active) return false;
      state.grenades -= 1;
      state.grenadeCooldown = 0.8;
      grenade.active = true;
      grenade.bounced = false;
      grenade.fuse = GRENADE_FUSE_MAX;
      grenade.position.copy(origin).addScaledVector(direction, 0.5);
      grenade.position.y -= 0.1;
      grenade.velocity.copy(direction).multiplyScalar(14);
      grenade.velocity.y += 4.5;
      grenade.velocity.add(playerVelocity);
      grenadeMesh.position.copy(grenade.position);
      grenadeMesh.visible = true;
      return true;
    },
    grenadeActive() {
      return grenade.active;
    },
    muzzleWorld(out) {
      muzzleWorld.copy(muzzleLocal);
      camera.localToWorld(muzzleWorld);
      out.copy(muzzleWorld);
      return out;
    },
    refill() {
      for (const def of WEAPON_DEFS) {
        if (inventory[def.id].owned) {
          inventory[def.id].mag = def.mag;
          inventory[def.id].reserve = def.reserve;
        }
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.scoped = false;
      state.grenades = 0;
      if (grenade.active) {
        grenade.active = false;
        grenadeMesh.visible = false;
      }
    },
    step,
  };
}
