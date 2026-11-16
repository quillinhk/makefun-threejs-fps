// Short-lived visuals, pooled: tracers, impact sparks and the explosion flash. Nothing is
// created per frame — a fixed pool of line segments and point sprites is reused, and step()
// only moves the ones that are alive. All timings run on simulation time, so a frozen
// screenshot frame keeps the effect it caught.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 12;
const TRACER_LIFE = 0.12;
const SPARK_LIFE = 0.45;

export function createEffects(scene) {
  const tracerMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMaterial.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.hazard),
    size: 0.09,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.visible = false;
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVelocities = new Float32Array(SPARK_COUNT * 3);
  let sparkLife = 0;
  const sparkOrigin = new THREE.Vector3();

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.furnace), 0, 26, 1.6);
  scene.add(flashLight);
  let flashLife = 0;

  // A bright line from the muzzle to the hit point, alive for a blink.
  function tracer(from, to) {
    const item = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    const positions = item.line.geometry.attributes.position.array;
    positions[0] = from.x;
    positions[1] = from.y;
    positions[2] = from.z;
    positions[3] = to.x;
    positions[4] = to.y;
    positions[5] = to.z;
    item.line.geometry.attributes.position.needsUpdate = true;
    item.line.visible = true;
    item.line.material.opacity = 0.9;
    item.life = TRACER_LIFE;
  }

  // A burst of sparks at an impact point, flying out along the surface normal.
  function impact(point, normal) {
    const positions = sparkGeometry.attributes.position.array;
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      const spread = 1.6;
      sparkVelocities[i * 3] = normal.x * 2.2 + (Math.random() * 2 - 1) * spread;
      sparkVelocities[i * 3 + 1] = Math.abs(normal.y) * 2 + Math.random() * 2.4;
      sparkVelocities[i * 3 + 2] = normal.z * 2.2 + (Math.random() * 2 - 1) * spread;
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkOrigin.copy(point);
    sparks.visible = true;
    sparkLife = SPARK_LIFE;
  }

  function explosion(point) {
    flashLight.position.copy(point);
    flashLight.position.y += 1.2;
    flashLight.intensity = 240;
    flashLife = 0.5;
    impact(point, new THREE.Vector3(0, 1, 0));
  }

  function step(dt) {
    for (const item of tracers) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) item.line.visible = false;
      else item.line.material.opacity = 0.9 * (item.life / TRACER_LIFE);
    }
    if (sparkLife > 0) {
      sparkLife -= dt;
      const positions = sparkGeometry.attributes.position.array;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        positions[i * 3] += sparkVelocities[i * 3] * dt;
        positions[i * 3 + 1] += sparkVelocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += sparkVelocities[i * 3 + 2] * dt;
        sparkVelocities[i * 3 + 1] -= 9 * dt;
      }
      sparkGeometry.attributes.position.needsUpdate = true;
      sparkMaterial.opacity = 0.95 * Math.max(0, sparkLife / SPARK_LIFE);
      if (sparkLife <= 0) sparks.visible = false;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashLight.intensity = 240 * Math.max(0, flashLife / 0.5);
      if (flashLife <= 0) flashLight.intensity = 0;
    }
  }

  return { tracer, impact, explosion, step };
}
