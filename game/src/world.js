// Yard 7: a dusk industrial container yard, 42 x 38 m. Three north-south lanes — A long
// (west), mid, B long (east) — joined by a north and a south connector. Two charge sites:
// Furnace (A, north-west) and Depot (B, north-east). Every box is a collider and a surface
// a bullet stops on. Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// A tiny 3x5 pixel font, built from boxes, for the site signs and the yard sign.
const FONT = {
  A: [0b01110, 0b10001, 0b11111, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b11110, 0b10001, 0b11110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
  R: [0b11110, 0b10001, 0b11110, 0b10100, 0b10010],
  Y: [0b10001, 0b10001, 0b01110, 0b00100, 0b00100],
  7: [0b11111, 0b00010, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const glowFurnace = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.furnace),
    emissive: new THREE.Color(PALETTE.furnace),
    emissiveIntensity: 0.8,
    roughness: 0.4,
  });
  const glowHazard = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.hazard),
    emissive: new THREE.Color(PALETTE.hazard),
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });
  const beamA = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const beamB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.hazard), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });

  const colliders = [];
  const shootables = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(boxGeometry, materials[material]);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and perimeter, 5 m walls, open to the dusk sky.
  box(42.6, 0.4, 38.6, 0, -0.2, 0, 'canvas');
  box(0.6, 5, 38.6, -21.3, 2.5, 0, 'surface');
  box(0.6, 5, 38.6, 21.3, 2.5, 0, 'surface');
  box(42.6, 5, 0.6, 0, 2.5, -19.3, 'surface');
  box(42.6, 5, 0.6, 0, 2.5, 19.3, 'surface');

  // Lane dividers: container rows at x = -10 and x = +10, with a north gap (z -11..-5) and a
  // south gap (z +5..+11) as the connectors between the lanes.
  for (const side of [-1, 1]) {
    const x = side * 10;
    box(2.4, 2.6, 8, x, 1.3, -15, 'rust');
    box(2.4, 2.6, 10, x, 1.3, 0, 'hairline');
    box(2.4, 2.6, 8, x, 1.3, 15, 'rust');
    box(2.4, 2.6, 2.4, x, 3.9, -15, 'hazard'); // a stacked container, for a high sightline
  }

  // Mid wall at z = 0 with a 4 m door: the mid lane's choke point.
  box(8, 3.4, 1.2, -6, 1.7, 0, 'surface');
  box(8, 3.4, 1.2, 6, 1.7, 0, 'surface');
  box(4.4, 0.9, 1.2, 0, 3.85, 0, 'hairline'); // lintel over the door

  // A site — the Furnace: a big dark-steel furnace block with a glowing mouth, pipes and a platform.
  box(6, 4.2, 3, -16, 2.1, -16.5, 'surface');
  box(6, 0.4, 3.2, -16, 4.4, -16.5, 'rust');
  const mouth = new THREE.Mesh(boxGeometry, glowFurnace);
  mouth.scale.set(2.4, 1.2, 0.2);
  mouth.position.set(-16, 1.0, -14.9);
  group.add(mouth);
  box(0.8, 6.4, 0.8, -18.4, 3.2, -17.2, 'hairline');
  box(0.8, 5.2, 0.8, -13.6, 2.6, -17.2, 'hairline');
  box(5, 0.5, 3.4, -16, 0.25, -11.5, 'surface');

  // B site — the Depot: an open-front warehouse, roof on corner pillars, crates inside.
  box(8, 0.5, 7, 15, 4.75, -14, 'surface');
  box(0.7, 4.5, 0.7, 11.4, 2.25, -17.2, 'hairline');
  box(0.7, 4.5, 0.7, 18.6, 2.25, -17.2, 'hairline');
  box(0.7, 4.5, 0.7, 11.4, 2.25, -10.8, 'hairline');
  box(0.7, 4.5, 0.7, 18.6, 2.25, -10.8, 'hairline');
  box(2.2, 1.4, 2.2, 13, 0.7, -15.5, 'rust');
  box(2.2, 1.4, 2.2, 17, 0.7, -12.5, 'hairline');

  // Cover crates along the lanes and connectors.
  box(1.4, 1.4, 1.4, -15, 0.7, -4, 'hairline');
  box(1.4, 1.4, 1.4, -15, 0.7, 4, 'rust');
  box(1.4, 1.4, 1.4, 15, 0.7, -4, 'rust');
  box(1.4, 1.4, 1.4, 15, 0.7, 4, 'hairline');
  box(1.4, 1.4, 1.4, -5, 0.7, -10, 'hairline');
  box(1.4, 1.4, 1.4, 5, 0.7, -10, 'rust');
  box(1.4, 1.4, 1.4, -4, 0.7, 8, 'rust');
  box(1.4, 1.4, 1.4, 4, 0.7, 8, 'hairline');
  box(1.2, 1.2, 1.2, -2, 0.6, -6, 'hairline');
  box(1.2, 1.2, 1.2, 2, 0.6, -6, 'hairline');
  box(2.4, 0.9, 1.2, -6, 0.45, 14.5, 'hairline');
  box(2.4, 0.9, 1.2, 6, 0.45, 14.5, 'hairline');
  // Spawn cover: a container on the mid sightline, so the Wardens cannot shoot the
  // Vanguard spawn through the mid door before the round starts.
  box(4, 2.6, 1.2, 0, 1.3, 12, 'rust');
  box(1.4, 1.4, 1.4, -12.5, 0.7, -13.5, 'hairline');
  box(1.4, 1.4, 1.4, 12.5, 0.7, -13.5, 'rust');

  // One thin hazard strip under the mid door lintel.
  const lintelStripe = new THREE.Mesh(boxGeometry, glowHazard);
  lintelStripe.scale.set(4.4, 0.08, 0.06);
  lintelStripe.position.set(0, 3.42, -0.62);
  group.add(lintelStripe);

  // Site beams and floor rings: A amber, B hazard yellow.
  function siteBeam(x, z, material) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 7, 20, 1, true), material);
    beam.position.set(x, 3.5, z);
    group.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 8, 32), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.06, z);
    group.add(ring);
    return beam;
  }
  siteBeam(-15, -13.5, beamA);
  siteBeam(15, -13.5, beamB);

  // Pixel-font signs: "A" and "B" over the sites, "YARD 7" on the south wall.
  const pixelGeometry = new THREE.BoxGeometry(0.22, 0.22, 0.06);
  function sign(text, x, y, z, yaw, material, scale = 1) {
    const signGroup = new THREE.Group();
    let cursor = 0;
    for (const char of text) {
      const glyph = FONT[char] ?? FONT[' '];
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (glyph[row] & (1 << (4 - col))) {
            const pixel = new THREE.Mesh(pixelGeometry, material);
            pixel.position.set((cursor + col) * 0.26 * scale, (4 - row) * 0.26 * scale, 0);
            signGroup.add(pixel);
          }
        }
      }
      cursor += 6;
    }
    signGroup.position.set(x, y, z);
    signGroup.rotation.y = yaw;
    group.add(signGroup);
    return signGroup;
  }
  sign('A', -16.9, 4.6, -14.7, 0, glowFurnace, 1.6);
  sign('B', 13.6, 4.6, -10.6, 0, glowHazard, 1.6);
  sign('YARD 7', -3.4, 3.4, 18.9, Math.PI, glowHazard, 1.4);

  // Light: a low amber sun from the west, a cool dusk fill, and the sites' own glow.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.7);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 3.4);
  sun.position.set(-20, 11, 8);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.9);
  fill.position.set(10, 12, 14);
  scene.add(fill);

  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.furnace), 55, 20, 1.8);
  furnaceLight.position.set(-15, 2.4, -13.2);
  scene.add(furnaceLight);

  const depotLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 26, 15, 1.8);
  depotLight.position.set(15, 4, -13.5);
  scene.add(depotLight);

  // Waypoint graph for the bots: nodes the bots walk between, edges they may use.
  // id: [x, z, [neighbour ids]]
  const nodes = [
    [0, 15, [1, 2, 18, 19]], // 0 attacker spawn
    [-5, 8, [0, 3, 4, 7, 18]], // 1 south connector west
    [5, 8, [0, 3, 5, 8, 19]], // 2 south connector east
    [0, 8, [18, 19, 6, 1, 2]], // 3 mid south
    [-15, 8, [1, 7, 9]], // 4 A long south
    [15, 8, [2, 8, 10]], // 5 B long south
    [0, 0, [3, 7, 8, 11]], // 6 mid door
    [-10, -8, [1, 6, 9, 12]], // 7 north connector west
    [10, -8, [2, 6, 10, 13]], // 8 north connector east
    [-15, 0, [4, 7, 12]], // 9 A long mid
    [15, 0, [5, 8, 13]], // 10 B long mid
    [0, -8, [6, 7, 8]], // 11 mid north
    [-15, -8, [7, 9, 14]], // 12 A long north
    [15, -8, [8, 10, 15]], // 13 B long north
    [-15, -13.5, [12, 16]], // 14 A site
    [15, -13.5, [13, 17]], // 15 B site
    [-12, -11, [14, 12]], // 16 A site corner
    [12, -11, [15, 13]], // 17 B site corner
    [-4, 11.5, [0, 1, 3]], // 18 spawn cover west (around the spawn container)
    [4, 11.5, [0, 2, 3]], // 19 spawn cover east
  ];
  const waypoints = nodes.map(([x, z, links], id) => ({ id, x, z, links }));

  const sites = {
    A: { name: 'Furnace', zone: new THREE.Box3(new THREE.Vector3(-19, 0, -17.5), new THREE.Vector3(-11, 4, -9.5)), center: new THREE.Vector3(-15, 1, -13.5) },
    B: { name: 'Depot', zone: new THREE.Box3(new THREE.Vector3(11, 0, -17.5), new THREE.Vector3(19, 4, -9.5)), center: new THREE.Vector3(15, 1, -13.5) },
  };
  const spawns = {
    player: new THREE.Vector3(0, 0, 15),
    defenders: [
      new THREE.Vector3(-16, 0, -14.5),
      new THREE.Vector3(-12.5, 0, -11.5),
      new THREE.Vector3(16, 0, -14.5),
      new THREE.Vector3(12.5, 0, -11.5),
      new THREE.Vector3(0, 0, -8),
    ],
  };

  // Line of sight through the world only (bots and the player are not walls).
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const losFrom = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  function hasLineOfSight(from, to) {
    losFrom.copy(from);
    losDir.copy(to).sub(from);
    const distance = losDir.length();
    if (distance < 0.01) return true;
    losDir.multiplyScalar(1 / distance);
    raycaster.set(losFrom, losDir);
    raycaster.far = distance;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  // The furnace breathes: its light and the site beams pulse gently with sim time.
  function step(time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
    furnaceLight.intensity = 48 + pulse * 16;
    beamA.opacity = 0.09 + pulse * 0.07;
    beamB.opacity = 0.09 + (1 - pulse) * 0.07;
  }

  return { colliders, shootables, group, sites, spawns, waypoints, hasLineOfSight, step };
}
