// One body, one job: move an axis-aligned box through the world's colliders. The player and
// every bot share this code, so movement, crouching and collision behave the same for both.
// No allocation in step(): the probe box and the wish vector are module-level temps.
import * as THREE from 'three';

const RADIUS = 0.34;
const GRAVITY = 20;

const probe = new THREE.Box3();
const wish = new THREE.Vector3();

export function createBody(colliders, options) {
  const body = {
    position: new THREE.Vector3(options.x ?? 0, 0, options.z ?? 0),
    velocity: new THREE.Vector3(),
    yaw: options.yaw ?? 0,
    pitch: 0,
    eye: options.eye ?? 1.6,
    standEye: options.eye ?? 1.6,
    crouchEye: (options.eye ?? 1.6) * 0.64,
    standHeight: options.height ?? 1.72,
    crouchHeight: (options.height ?? 1.72) * 0.65,
    height: options.height ?? 1.72,
    onGround: true,
    crouching: false,
    walkSpeed: options.walkSpeed ?? 5.2,
    crouchSpeed: options.crouchSpeed ?? 2.4,
    groundAccel: options.groundAccel ?? 42,
    airAccel: options.airAccel ?? 9,
    friction: options.friction ?? 9,
    jumpSpeed: options.jumpSpeed ?? 6.2,
  };

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the floor
  // is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Move one fixed step. wishDir is a unit XZ vector (or zero), speed the target speed,
  // crouch whether to crouch, jump whether to jump. Returns nothing; state lives on body.
  function step(dt, wishDir, speed, crouch, jump) {
    if (crouch && !body.crouching) {
      body.crouching = true;
      body.height = body.crouchHeight;
    } else if (!crouch && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, body.standHeight, 0.02)) {
      body.crouching = false;
      body.height = body.standHeight;
    }
    const eyeTarget = body.crouching ? body.crouchEye : body.standEye;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const accel = body.onGround ? body.groundAccel : body.airAccel;
    const blend = Math.min(1, (accel * dt) / speed);
    body.velocity.x += (wishDir.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wishDir.z * speed - body.velocity.z) * blend;
    if (body.onGround && wishDir.x === 0 && wishDir.z === 0) {
      const damp = Math.max(0, 1 - body.friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (jump && body.onGround) {
      body.velocity.y = body.jumpSpeed;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    // One axis of horizontal movement, with a step-up: a low obstacle (a platform lip, a
    // crate edge) is walked onto instead of walked into, so bots and the player flow over
    // the yard's low cover instead of getting stuck on it.
    function moveAxis(axis, delta) {
      const nextX = axis === 'x' ? body.position.x + delta : body.position.x;
      const nextZ = axis === 'z' ? body.position.z + delta : body.position.z;
      const hit = overlaps(nextX, body.position.y, nextZ, body.height, 0.04);
      if (!hit) {
        body.position.x = nextX;
        body.position.z = nextZ;
        return true;
      }
      const stepHeight = 0.6;
      if (hit.max.y > body.position.y && hit.max.y - body.position.y <= stepHeight) {
        const liftedY = hit.max.y;
        if (!overlaps(nextX, liftedY, nextZ, body.height, 0.04)) {
          body.position.y = liftedY;
          body.velocity.y = 0;
          body.onGround = true;
          body.position.x = nextX;
          body.position.z = nextZ;
          return true;
        }
      }
      if (axis === 'x') body.velocity.x = 0;
      else body.velocity.z = 0;
      return false;
    }

    moveAxis('x', body.velocity.x * dt);
    moveAxis('z', body.velocity.z * dt);

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  // A wish direction from a forward/strafe pair, rotated by yaw. Reuses the module temp.
  function wishFrom(forward, strafe, yaw) {
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    return wish;
  }

  function groundSpeed() {
    return Math.hypot(body.velocity.x, body.velocity.z);
  }

  return { body, step, wishFrom, groundSpeed, overlaps };
}
