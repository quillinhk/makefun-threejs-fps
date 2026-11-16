// The player: a physics body with health, armour, look and recoil. Movement itself lives in
// physics.js; this module adds the first-person parts (eye height, look, recoil, damage).
import { createBody } from './physics.js';

export function createPlayer(colliders, spawn) {
  const { body, step, wishFrom, groundSpeed } = createBody(colliders, {
    x: spawn.x,
    z: spawn.z,
    eye: 1.6,
    height: 1.72,
    walkSpeed: 5.2,
    crouchSpeed: 2.4,
  });

  const state = {
    health: 100,
    armor: 0,
    alive: true,
    pitch: 0,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    body.yaw += yawKick;
  }

  // Damage with armour soaking half, like a plate vest does.
  function damage(amount) {
    if (!state.alive) return 0;
    let remaining = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, amount * 0.5);
      state.armor -= absorbed;
      remaining = amount - absorbed;
    }
    state.health = Math.max(0, state.health - remaining);
    if (state.health === 0) state.alive = false;
    return remaining;
  }

  function reset(spawnPoint) {
    body.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.velocity.set(0, 0, 0);
    body.yaw = 0;
    state.pitch = 0;
    state.health = 100;
    state.armor = 0;
    state.alive = true;
    body.crouching = false;
    body.height = body.standHeight;
    body.eye = body.standEye;
  }

  function moveStep(dt, keys) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    const wish = wishFrom(forward, strafe, body.yaw);
    const speed = body.crouching ? body.crouchSpeed : body.walkSpeed;
    step(dt, wish, speed, crouch, keys.has('Space'));
  }

  return {
    body,
    state,
    look,
    recoil,
    damage,
    reset,
    moveStep,
    groundSpeed,
    eyePosition(out) {
      out.set(body.position.x, body.position.y + body.eye, body.position.z);
      return out;
    },
  };
}
