import * as THREE from 'three';
import { OceanTextureLibrary } from './textures';
import {
  EdibleSeaweedPatch,
  SwayingAnemone,
  SwayingCoralCluster,
  SwayingSeaFan,
  createClownfish,
  createCoconutPalm,
  createCoralCrab,
  createDolphin,
  createEdibleSeaweedPatch,
  createGreatWhale,
  createMantaRay,
  createMoonJellyfish,
  createSeaAnemone,
  createSeaFan,
  createGrotto,
  GROTTO_CENTER,
  GROTTO_RING,
  withNearCameraFade,
  createShipwreck,
  createSpottedEagleRay,
  createStaghornCoral,
  createStarfish,
  createYellowtailSnapper,
} from './models';

// Pre-allocated module-scope scratch objects to guarantee Zero GC in render loop
const _dummy = new THREE.Object3D();
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _color = new THREE.Color();

/**
 * Impassable Solid Obstacles:
 * Shipwrecks (Starlight Galleon & Coral Brigantine) and Coconut Cove Lighthouse
 * Neither Mother Turtle nor Baby Turtle can pass through their physical volumes.
 */
export interface ObstacleCollider {
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
  name?: string;
}

export const SOLID_OBSTACLES: ObstacleCollider[] = [
  // Coconut Cove Lighthouse Tower
  { x: -3.2, z: 30.8, radius: 2.4, minY: -0.5, maxY: 16.0, name: 'Lighthouse Tower' },
  // Hatchery Sanctuary Pergola Shelter
  { x: 3.4, z: 25.8, radius: 2.6, minY: -0.5, maxY: 6.0, name: 'Hatchery Shelter' },
  // Starlight Galleon Shipwreck (3 overlapping capsules along its rotated hull spine)
  { x: -34.98, z: -21.77, radius: 2.7, minY: -14.0, maxY: -2.0, name: 'Galleon Bow' },
  { x: -38.0, z: -26.0, radius: 2.9, minY: -14.0, maxY: -2.0, name: 'Galleon Midship' },
  { x: -41.02, z: -30.23, radius: 2.9, minY: -14.0, maxY: -1.5, name: 'Galleon Stern Castle' },
  // Coral Brigantine Shipwreck (3 overlapping capsules along its rotated hull spine)
  { x: 26.4, z: -38.8, radius: 2.5, minY: -14.0, maxY: -2.5, name: 'Brigantine Bow' },
  { x: 30.0, z: -42.0, radius: 2.7, minY: -14.0, maxY: -2.5, name: 'Brigantine Midship' },
  { x: 33.6, z: -45.2, radius: 2.7, minY: -14.0, maxY: -2.0, name: 'Brigantine Stern Castle' },
];

/**
 * The grotto's rock ring as one smooth wall. A turtle touching it is eased back to the
 * nearer side, so it slides along the rock to an opening instead of wedging between spires.
 * Swimming over the top (near the surface) is allowed.
 */
function resolveGrottoWall(pos: THREE.Vector3, turtleRadius: number): void {
  if (pos.y > -2.0) return;
  const dx = pos.x - GROTTO_CENTER.x;
  const dz = pos.z - GROTTO_CENTER.z;
  const dist = Math.hypot(dx, dz);
  const halfThickness = 2.3 + turtleRadius;
  const offset = dist - GROTTO_RING.radius;
  if (Math.abs(offset) >= halfThickness || dist < 0.001) return;

  const angle = Math.atan2(dz, dx);
  const inOpening = GROTTO_RING.gapAngles.some((g) => {
    const d = Math.atan2(Math.sin(angle - g), Math.cos(angle - g));
    return Math.abs(d) < GROTTO_RING.gapHalfWidth - 0.16;
  });
  if (inOpening) return;

  const target = GROTTO_RING.radius + (offset >= 0 ? halfThickness : -halfThickness);
  pos.x = GROTTO_CENTER.x + (dx / dist) * target;
  pos.z = GROTTO_CENTER.z + (dz / dist) * target;
}

export function resolveSolidObstacles(pos: THREE.Vector3, turtleRadius: number): void {
  resolveGrottoWall(pos, turtleRadius);
  for (const obs of SOLID_OBSTACLES) {
    if (pos.y >= obs.minY && pos.y <= obs.maxY) {
      const dx = pos.x - obs.x;
      const dz = pos.z - obs.z;
      const dist = Math.hypot(dx, dz);
      const minDist = obs.radius + turtleRadius;
      if (dist < minDist && dist > 0.0001) {
        const push = (minDist - dist) / dist;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
  }
}

/**
 * Deterministic Continuous Terrain & Island Heightfield
 * Water surface is at y = 0. Positive Y = sandy beach & island above water.
 * Negative Y = ocean seabed, coral terraces, and deep channels.
 */
export function groundHeightAt(x: number, z: number): number {
  let h =
    -8.4 +
    Math.sin(x * 0.045) * 1.45 +
    Math.cos(z * 0.045) * 1.45 +
    Math.sin((x + z) * 0.025) * 1.1;

  // 1. Main Island: Coconut Cove (Centered around x = 0, z = 34)
  const dMain = Math.hypot(x - 0, z - 34);
  if (dMain < 32) {
    const t = Math.max(0, 1 - dMain / 32);
    const smooth = t * t * (3 - 2 * t);
    h += smooth * 11.8;
  }

  // 2. Western Island: Hibiscus Atoll (Centered around x = -58, z = -8)
  const dWest = Math.hypot(x + 58, z + 8);
  if (dWest < 24) {
    const t = Math.max(0, 1 - dWest / 24);
    const smooth = t * t * (3 - 2 * t);
    h += smooth * 11.0;
  }

  // 3. Eastern Sandbar: Basking Spit (Centered around x = 56, z = -14)
  const dEast = Math.hypot(x - 56, z + 14);
  if (dEast < 22) {
    const t = Math.max(0, 1 - dEast / 22);
    const smooth = t * t * (3 - 2 * t);
    h += smooth * 10.4;
  }

  // 4. Sunlit Coral Terrace plateau (x = 12, z = -16)
  const dCoral = Math.hypot(x - 12, z + 16);
  if (dCoral < 24) {
    const t = Math.max(0, 1 - dCoral / 24);
    h += t * t * 3.4;
  }

  // 5. Bioluminescent Grotto basin (x = -42, z = 30)
  const dGrotto = Math.hypot(x + 42, z - 30);
  if (dGrotto < 22) {
    const t = Math.max(0, 1 - dGrotto / 22);
    h -= t * t * 4.5;
  }

  // 6. Deep Azure Whale Shark Channel (Carves a deep, obstacle-free trench at z around -46)
  const dWhaleChannel = Math.abs(z + 46);
  if (dWhaleChannel < 20 && Math.abs(x) < 48) {
    const t = Math.max(0, 1 - dWhaleChannel / 20);
    h -= t * t * 6.2;
  }

  // 7. Outer natural reef perimeter ridge
  const distFromOrigin = Math.hypot(x, z);
  if (distFromOrigin > 82) {
    const edgeT = Math.min(1, (distFromOrigin - 82) / 28);
    h += edgeT * edgeT * 8.5;
  }

  return h;
}

/**
 * How deep inside the Bioluminescent Grotto a point is: 0 outside, 1 near the middle.
 * Drives the twilight lighting there.
 */
export function grottoDepthFactor(x: number, y: number, z: number): number {
  const d = Math.hypot(x - GROTTO_CENTER.x, z - GROTTO_CENTER.z);
  const inside = 1 - THREE.MathUtils.smoothstep(d, 9, 21);
  const submerged = 1 - THREE.MathUtils.smoothstep(y, -5.5, -2.5);
  return inside * submerged;
}

/**
 * Multi-point 3D Seabed & Sand Collision Helper:
 * Samples 5 points across a creature's body footprint (center, nose, tail, left fin, right fin)
 * and returns the highest ground elevation underneath any part of the creature, plus the slope pitch.
 */
export function sampleFootprintGround(
  x: number,
  z: number,
  heading: number,
  halfLength: number,
  halfWidth: number
): { maxGroundY: number; noseGroundY: number; tailGroundY: number; restGroundY: number } {
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);

  const gCenter = groundHeightAt(x, z);
  const gNose = groundHeightAt(x + sinH * halfLength, z + cosH * halfLength);
  const gTail = groundHeightAt(x - sinH * halfLength, z - cosH * halfLength);
  const gLeft = groundHeightAt(x + cosH * halfWidth, z - sinH * halfWidth);
  const gRight = groundHeightAt(x - cosH * halfWidth, z + sinH * halfWidth);

  return {
    maxGroundY: Math.max(gCenter, gNose, gTail, gLeft, gRight),
    noseGroundY: gNose,
    tailGroundY: gTail,
    // Height a body resting on this slope sits at (no hovering above the high point).
    restGroundY: Math.max(gCenter, (gNose + gTail) / 2, (gLeft + gRight) / 2),
  };
}

export function getZoneNameAt(x: number, y: number, z: number): string {
  if (Math.hypot(x - 0, z - 34) < 25) {
    return y >= -0.3 ? 'Coconut Cove Beach & Lighthouse' : 'Coconut Cove Shallows';
  }
  if (Math.hypot(x + 58, z + 8) < 19) {
    return 'Hibiscus Atoll Beach';
  }
  if (Math.hypot(x - 56, z + 14) < 18) {
    return 'Basking Spit Sandbar';
  }
  if (Math.hypot(x + 38, z + 26) < 18) {
    return 'Starlight Galleon Wreck';
  }
  if (Math.hypot(x - 30, z + 42) < 18) {
    return 'Coral Brigantine Wreck';
  }
  if (Math.hypot(x - 38, z - 24) < 22) {
    return 'Whispering Kelp Forest';
  }
  if (Math.hypot(x + 42, z - 30) < 20) {
    return 'Bioluminescent Grotto';
  }
  if (Math.hypot(x + 16, z + 35) < 15) {
    return 'Ancient Turtle Shrine';
  }
  if (z < -36) {
    return 'Deep Azure Channel';
  }
  return 'Sunlit Coral Gardens';
}

export function getCurrentVectorAt(
  x: number,
  y: number,
  z: number,
  outVec: THREE.Vector3
): boolean {
  outVec.set(0, 0, 0);
  if (y > -0.5) return false;

  const dist = Math.hypot(x, z);
  if (dist > 18 && dist < 52 && y < -1.5) {
    const tangentX = -z / dist;
    const tangentZ = x / dist;
    outVec.set(tangentX * 1.15, Math.sin(x * 0.1 + z * 0.1) * 0.08, tangentZ * 1.15);
    return true;
  }
  return false;
}

export interface FishBoid {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  homeCenter: THREE.Vector3;
  scale: number;
  phase: number;
}

export interface OceanEnvironmentRig {
  waterSurface: THREE.Mesh;
  waterUniforms: { uTime: { value: number }; uWeatherMode: { value: number } };
  kelpUniforms: { uTime: { value: number } };
  coralMaterial: THREE.MeshStandardMaterial;
  sunBeamsGroup: THREE.Group;
  currentParticles: THREE.Points;
  fishInstanced: THREE.InstancedMesh;
  fishBoids: FishBoid[];
  edibleSeaweedPatches: EdibleSeaweedPatch[];
  mantaRays: {
    group: THREE.Group;
    leftWing: THREE.Mesh;
    rightWing: THREE.Mesh;
    friendHaloMat: THREE.MeshBasicMaterial;
    center: THREE.Vector3;
    radius: number;
    speed: number;
    angle: number;
    greetingTilt: number;
    befriended: boolean;
  }[];
  eagleRays: {
    group: THREE.Group;
    leftWing: THREE.Mesh;
    rightWing: THREE.Mesh;
    friendHaloMat: THREE.MeshBasicMaterial;
    center: THREE.Vector3;
    radius: number;
    speed: number;
    angle: number;
    greetingTilt: number;
    befriended: boolean;
  }[];
  yellowtailSnappers: {
    group: THREE.Group;
    tailMesh: THREE.Mesh;
    center: THREE.Vector3;
    angle: number;
    speed: number;
    radius: number;
  }[];
  clownfishPairs: {
    group: THREE.Group;
    tailMesh: THREE.Mesh;
    homePos: THREE.Vector3;
    wigglePhase: number;
  }[];
  coralCrabs: {
    group: THREE.Group;
    leftPincer: THREE.Mesh;
    rightPincer: THREE.Mesh;
    legs: THREE.Mesh[];
    basePos: THREE.Vector3;
    walkAngle: number;
    walkTimer: number;
    scuttleSpeed: number;
    swimFlutter: number;
  }[];
  dolphins: {
    group: THREE.Group;
    flukePivot: THREE.Group;
    friendHaloMat: THREE.MeshBasicMaterial;
    angle: number;
    radius: number;
    spinProgress: number;
    escortTimer: number;
    befriended: boolean;
  }[];
  whaleShark: {
    group: THREE.Group;
    tailPivot: THREE.Group;
    blowholePivot?: THREE.Group;
    friendHaloMat: THREE.MeshBasicMaterial;
    angle: number;
    smoothedY: number;
    befriended: boolean;
  };
  jellyfishList: {
    group: THREE.Group;
    bell: THREE.Mesh;
    mat: THREE.MeshPhysicalMaterial;
    basePos: THREE.Vector3;
    phase: number;
  }[];
  starfishList: {
    group: THREE.Group;
    mat: THREE.MeshPhysicalMaterial;
    basePos: THREE.Vector3;
    sparkleTimer: number;
  }[];
  updateEnvironment: (
    dt: number,
    elapsed: number,
    momPos: THREE.Vector3,
    babyPos: THREE.Vector3,
    momSpeed: number,
    babySpeed: number,
    turtleCallTimer: number,
    nightFactor: number,
    weatherMood: string
  ) => { activeReaction: string | null; newlyBefriendedId: string | null };
}

export function buildOceanWorld(
  scene: THREE.Scene,
  textures: OceanTextureLibrary
): OceanEnvironmentRig {
  // 1. Sculpted Continuous Seabed & Sandy Island Mesh (220 x 220m, 160x160 segments)
  const terrainGeo = new THREE.PlaneGeometry(220, 220, 160, 160);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const deepSandColor = new THREE.Color(0x52808e);
  const shallowSandColor = new THREE.Color(0xe6cf9e);
  const wetShoreSandColor = new THREE.Color(0xd4b483);
  const dryBeachColor = new THREE.Color(0xf7e7ca);
  const tropicalGrassColor = new THREE.Color(0x4d8c4a);

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = groundHeightAt(vx, vz);
    posAttr.setY(i, vy);

    if (vy > 1.45) {
      const grassT = Math.min(1, (vy - 1.45) / 1.4);
      _color.copy(dryBeachColor).lerp(tropicalGrassColor, grassT);
    } else if (vy > 0.15) {
      const beachT = Math.min(1, (vy - 0.15) / 1.3);
      _color.copy(wetShoreSandColor).lerp(dryBeachColor, beachT);
    } else if (vy > -0.6) {
      const wetT = Math.min(1, (vy + 0.6) / 0.75);
      _color.copy(shallowSandColor).lerp(wetShoreSandColor, wetT);
    } else {
      const depthT = Math.min(1, Math.abs(vy + 0.6) / 12.5);
      _color.copy(shallowSandColor).lerp(deepSandColor, depthT);
    }

    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: textures.sandAlbedo,
    bumpMap: textures.sandBump,
    bumpScale: 0.14,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.04,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 2. Animated Physical Water Surface (y = 0) with Weather-Aware Shader
  const waterGeo = new THREE.PlaneGeometry(240, 240, 96, 96);
  waterGeo.rotateX(-Math.PI / 2);

  const waterUniforms = {
    uTime: { value: 0 },
    uWeatherMode: { value: 0 }, // 0 = Sunlit Calm, 1 = Gentle Rain, 2 = Misty Morning
  };

  const waterMat = new THREE.MeshPhysicalMaterial({
    // Kept deep and fairly clear: a pale, mostly opaque sheet here washes out
    // the whole reef whenever the camera sits above the waterline.
    color: 0x0b6f86,
    roughness: 0.22,
    metalness: 0.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uWeatherMode = waterUniforms.uWeatherMode;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uWeatherMode;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float wave1 = sin(transformed.x * 0.18 + uTime * 1.4) * cos(transformed.z * 0.15 + uTime * 1.1) * 0.16;
        float wave2 = sin((transformed.x + transformed.z) * 0.32 - uTime * 1.9) * 0.06;
        float baseWave = wave1 + wave2;

        // Gentle Rain (uWeatherMode == 1.0): High-frequency pattering raindrop ripples
        float rainRipple = (
          sin(transformed.x * 2.8 + uTime * 9.5) * cos(transformed.z * 2.8 - uTime * 8.8) * 0.045 +
          sin(length(transformed.xz) * 1.9 - uTime * 7.4) * 0.03
        ) * clamp(1.0 - abs(uWeatherMode - 1.0), 0.0, 1.0);

        // Misty Morning (uWeatherMode == 2.0): Smooth, glassy, serene morning swell
        float mistCalm = mix(1.0, 0.45, clamp(1.0 - abs(uWeatherMode - 2.0), 0.0, 1.0));

        transformed.y += baseWave * mistCalm + rainRipple;
        `
      );
  };

  const waterSurface = new THREE.Mesh(waterGeo, waterMat);
  waterSurface.position.y = 0;
  waterSurface.renderOrder = 5;
  scene.add(waterSurface);

  // 2B. Gentle Rain Falling Droplets & Surface Splash Rings (Active in 'gentle_rain')
  const rainCount = 420;
  const rainPositions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 130;
    rainPositions[i * 3 + 1] = Math.random() * 26;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 130;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xbae6fd,
    size: 0.32,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const rainParticles = new THREE.Points(rainGeo, rainMat);
  rainParticles.visible = false;
  scene.add(rainParticles);

  const rainSplashGroup = new THREE.Group();
  const splashRingGeo = new THREE.RingGeometry(0.18, 0.28, 20);
  splashRingGeo.rotateX(-Math.PI / 2);
  const splashRingMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const splashRings: { mesh: THREE.Mesh; phase: number; baseX: number; baseZ: number }[] = [];
  for (let s = 0; s < 32; s++) {
    const ring = new THREE.Mesh(splashRingGeo, splashRingMat);
    const sx = (Math.random() - 0.5) * 90;
    const sz = (Math.random() - 0.5) * 90;
    ring.position.set(sx, 0.04, sz);
    rainSplashGroup.add(ring);
    splashRings.push({ mesh: ring, phase: Math.random() * Math.PI * 2, baseX: sx, baseZ: sz });
  }
  rainSplashGroup.visible = false;
  scene.add(rainSplashGroup);

  // 2C. Misty Morning Low-Lying Sea Fog Banks (Active in 'misty_morning')
  const mistGroup = new THREE.Group();
  const mistGeo = new THREE.SphereGeometry(4.5, 16, 12);
  mistGeo.scale(2.4, 0.22, 1.8);
  const mistMat = new THREE.MeshBasicMaterial({
    color: 0xf1f5f9,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mistBanks: { mesh: THREE.Mesh; baseX: number; baseZ: number; speed: number; phase: number }[] = [];
  for (let m = 0; m < 18; m++) {
    const bank = new THREE.Mesh(mistGeo, mistMat);
    const ma = (m / 18) * Math.PI * 2;
    const mr = 14 + (m % 3) * 18;
    const mx = Math.cos(ma) * mr;
    const mz = Math.sin(ma) * mr + 8;
    bank.position.set(mx, 0.85 + (m % 3) * 0.45, mz);
    mistGroup.add(bank);
    mistBanks.push({ mesh: bank, baseX: mx, baseZ: mz, speed: 0.35 + (m % 3) * 0.15, phase: m * 0.7 });
  }
  mistGroup.visible = false;
  scene.add(mistGroup);

  // 3. Coconut Palms, Tropical Hibiscus Bushes & Basking Rocks on the Three Sandy Islands
  const palmConfigs = [
    { x: -7, z: 31, h: 6.2, lean: 0.28, dir: 0.5 },
    { x: -3, z: 36, h: 7.4, lean: 0.22, dir: -0.3 },
    { x: 5, z: 35, h: 6.8, lean: 0.32, dir: 1.2 },
    { x: 9, z: 30, h: 5.9, lean: 0.35, dir: 2.1 },
    { x: 0, z: 40, h: 7.8, lean: 0.18, dir: 0.0 },
    { x: -11, z: 37, h: 5.5, lean: 0.3, dir: -1.1 },
    { x: 11, z: 38, h: 6.4, lean: 0.25, dir: 0.8 },
    { x: -56, z: -6, h: 6.4, lean: 0.3, dir: 0.4 },
    { x: -61, z: -10, h: 5.6, lean: 0.26, dir: -0.9 },
    { x: -54, z: -12, h: 6.9, lean: 0.22, dir: 1.7 },
    { x: 55, z: -12, h: 5.8, lean: 0.32, dir: -0.5 },
    { x: 58, z: -16, h: 6.5, lean: 0.24, dir: 0.9 },
  ];

  palmConfigs.forEach((cfg) => {
    const gy = groundHeightAt(cfg.x, cfg.z);
    if (gy > 0.2) {
      const palm = createCoconutPalm(cfg.x, gy - 0.1, cfg.z, cfg.h, cfg.lean, cfg.dir, textures);
      scene.add(palm);
    }
  });

  const bushGeo = new THREE.DodecahedronGeometry(0.65, 1);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.65 });
  const flowerGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0x881337,
    emissiveIntensity: 0.25,
    roughness: 0.4,
  });

  palmConfigs.forEach((cfg, idx) => {
    const bx = cfg.x + Math.cos(idx * 2.1) * 2.2;
    const bz = cfg.z + Math.sin(idx * 2.1) * 2.2;
    const by = groundHeightAt(bx, bz);
    if (by > 0.35) {
      const bushGroup = new THREE.Group();
      bushGroup.position.set(bx, by + 0.25, bz);
      const foliage = new THREE.Mesh(bushGeo, bushMat);
      foliage.scale.set(1.3, 0.75, 1.2);
      bushGroup.add(foliage);

      for (let f = 0; f < 3; f++) {
        const hibiscus = new THREE.Mesh(flowerGeo, flowerMat);
        const fa = (f * Math.PI * 2) / 3;
        hibiscus.position.set(Math.cos(fa) * 0.55, 0.28, Math.sin(fa) * 0.55);
        bushGroup.add(hibiscus);
      }
      scene.add(bushGroup);
    }
  });

  // 4. Two Sunken Shipwrecks
  const galleonY = groundHeightAt(-38, -26);
  const galleonWreck = createShipwreck([-38, galleonY - 0.2, -26], 0.62, 1.15, textures);
  scene.add(galleonWreck);

  const brigantineY = groundHeightAt(30, -42);
  const brigantineWreck = createShipwreck([30, brigantineY - 0.2, -42], -0.85, 0.95, textures);
  scene.add(brigantineWreck);

  // 5. Textured Botanical Seaweed & Giant Kelp Forest (InstancedMesh with veined Kelp Albedo & Bump)
  const kelpCount = 240;
  const kelpGeo = new THREE.PlaneGeometry(0.58, 3.8, 3, 14);
  kelpGeo.translate(0, 1.9, 0);
  // Add organic ruffled curvature to kelp blade geometry
  const kPos = kelpGeo.attributes.position;
  for (let i = 0; i < kPos.count; i++) {
    const vx = kPos.getX(i);
    const vy = kPos.getY(i);
    const taper = Math.sin((vy / 3.8) * Math.PI * 0.85) + 0.2;
    const ruffleZ = Math.sin(vy * 3.6 + vx * 5.0) * 0.11;
    kPos.setX(i, vx * taper);
    kPos.setZ(i, ruffleZ);
  }
  kelpGeo.computeVertexNormals();

  const kelpUniforms = { uTime: { value: 0 } };
  const kelpMat = new THREE.MeshStandardMaterial({
    map: textures.kelpAlbedo,
    bumpMap: textures.kelpBump,
    bumpScale: 0.04,
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  kelpMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = kelpUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float heightRatio = clamp(transformed.y / 3.8, 0.0, 1.0);
        float sway = sin(uTime * 1.8 + transformed.y * 1.4 + instanceMatrix[3][0] * 0.5) * 0.45 * heightRatio * heightRatio;
        transformed.x += sway;
        transformed.z += cos(uTime * 1.5 + transformed.y * 1.2 + instanceMatrix[3][2] * 0.5) * 0.30 * heightRatio * heightRatio;
        `
      );
    shader.fragmentShader = withNearCameraFade(shader.fragmentShader);
  };

  const kelpInstanced = new THREE.InstancedMesh(kelpGeo, kelpMat, kelpCount);
  const kelpPalette = [0x34d399, 0x10b981, 0x6ee7b7, 0x2dd4bf, 0xa3e635];

  for (let i = 0; i < kelpCount; i++) {
    let kx = (Math.random() - 0.5) * 130;
    let kz = (Math.random() - 0.5) * 130;
    if (i < kelpCount * 0.45) {
      kx = 38 + (Math.random() - 0.5) * 32;
      kz = 24 + (Math.random() - 0.5) * 32;
    }
    const ky = groundHeightAt(kx, kz);
    if (ky > -1.2) {
      kz -= 28;
    }
    const finalY = Math.min(-1.4, groundHeightAt(kx, kz));

    _dummy.position.set(kx, finalY, kz);
    _dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const scaleY = 0.65 + Math.random() * 1.35;
    _dummy.scale.set(0.9 + Math.random() * 0.45, scaleY, 0.9 + Math.random() * 0.45);
    _dummy.updateMatrix();
    kelpInstanced.setMatrixAt(i, _dummy.matrix);

    _color.setHex(kelpPalette[i % kelpPalette.length]);
    kelpInstanced.setColorAt(i, _color);
  }
  kelpInstanced.instanceMatrix.needsUpdate = true;
  if (kelpInstanced.instanceColor) kelpInstanced.instanceColor.needsUpdate = true;
  kelpInstanced.computeBoundingSphere();
  kelpInstanced.frustumCulled = false;
  scene.add(kelpInstanced);

  // 5B. Interactive Edible Seaweed Grazing Patches (16 tender sea-lettuce snack patches!)
  const snackCoords: [number, number][] = [
    [-2, -2],
    [4, 2],
    [8, -6],
    [-6, 8],
    [14, -10],
    [18, -18],
    [-12, -12],
    [28, 12],
    [34, 20],
    [40, 26],
    [22, 6],
    [-22, -16],
    [-14, 14],
    [10, 14],
    [-28, 18],
    [26, -28],
  ];

  const edibleSeaweedPatches: EdibleSeaweedPatch[] = snackCoords.map(([sx, sz], idx) => {
    const sy = groundHeightAt(sx, sz);
    const patch = createEdibleSeaweedPatch(`seaweed-snack-${idx}`, sx, sy, sz, textures);
    scene.add(patch.group);
    return patch;
  });

  // 6. Vibrant Coral Reef Formations with Procedural Current-Swaying Vertex Shader
  const coralCount = 160;
  const coralGeo = new THREE.DodecahedronGeometry(0.75, 1);
  coralGeo.translate(0, 0.5, 0);

  const coralUniforms = {
    uTime: { value: 0 },
  };

  const coralMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.08,
    roughness: 0.55,
    metalness: 0.08,
  });

  coralMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = coralUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Height-proportional flexible coral sway
        float coralHeightRatio = clamp(transformed.y / 1.5, 0.0, 1.0);
        // Multi-frequency current harmonics based on world position from instanceMatrix
        float cX = instanceMatrix[3][0];
        float cZ = instanceMatrix[3][2];
        float currentWaveX = sin(uTime * 1.6 + cX * 0.28 + cZ * 0.18) * 0.18;
        float currentWaveZ = cos(uTime * 1.35 + cX * 0.19 - cZ * 0.24) * 0.14;
        // High-frequency subtle polyp flutter
        float polypFlutter = sin(uTime * 3.8 + transformed.y * 5.0 + cX * 0.8) * 0.035;

        transformed.x += (currentWaveX + polypFlutter) * coralHeightRatio;
        transformed.z += (currentWaveZ + polypFlutter * 0.6) * coralHeightRatio;
        `
      );
  };

  const coralInstanced = new THREE.InstancedMesh(coralGeo, coralMaterial, coralCount);
  const coralPalette = [0xf43f5e, 0xfb923c, 0xa855f7, 0xec4899, 0x2dd4bf, 0xfacc15];

  for (let i = 0; i < coralCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 58;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius - 8;
    const cy = groundHeightAt(cx, cz);

    _dummy.position.set(cx, Math.min(-1.2, cy), cz);
    _dummy.rotation.set(0, Math.random() * Math.PI, 0);
    const s = 0.6 + Math.random() * 1.35;
    _dummy.scale.set(s * 1.15, s * (0.65 + Math.random() * 0.7), s);
    _dummy.updateMatrix();
    coralInstanced.setMatrixAt(i, _dummy.matrix);

    _color.setHex(coralPalette[i % coralPalette.length]);
    coralInstanced.setColorAt(i, _color);
  }
  coralInstanced.instanceMatrix.needsUpdate = true;
  if (coralInstanced.instanceColor) coralInstanced.instanceColor.needsUpdate = true;
  coralInstanced.computeBoundingSphere();
  scene.add(coralInstanced);

  // 7. Underwater Sunbeam God-Rays
  const sunBeamsGroup = new THREE.Group();
  const beamGeo = new THREE.ConeGeometry(3.2, 16, 12, 1, true);
  // Soft-edged shafts: brightest where the cone faces the camera, fading out at the
  // silhouette, toward the seabed and into the distance, so no hard cone outline shows.
  const beamUniforms = {
    uColor: { value: new THREE.Color(0x99f6e4) },
    uOpacity: { value: 0.075 },
  };
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float edge = smoothstep(0.0, 0.75, facing);
        float towardSeabed = smoothstep(0.0, 0.55, vUv.y);
        float distance = 1.0 - smoothstep(35.0, 85.0, length(vViewPosition));
        gl_FragColor = vec4(uColor, uOpacity * 1.7 * edge * edge * towardSeabed * distance);
      }
    `,
  });

  for (let b = 0; b < 10; b++) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    const ba = (b / 10) * Math.PI * 2;
    const br = 12 + (b % 3) * 14;
    beam.position.set(Math.cos(ba) * br, -6.5, Math.sin(ba) * br - 6);
    beam.rotation.z = 0.18;
    sunBeamsGroup.add(beam);
  }
  scene.add(sunBeamsGroup);

  // 7B. Bioluminescent Grotto: rock ring, entrance arches and glowing crystals
  const grotto = createGrotto(groundHeightAt);
  scene.add(grotto.group);

  // 8. Gentle Ocean Current Stream & Plankton Shimmer Particles
  const pCount = 320;
  const pPositions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPositions[i * 3] = (Math.random() - 0.5) * 120;
    pPositions[i * 3 + 1] = -0.5 - Math.random() * 11.5;
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x99f6e4,
    size: 0.24,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const currentParticles = new THREE.Points(pGeo, pMat);
  scene.add(currentParticles);

  // 9. Interactive Schooling Reef Fish Boids (220 Fish across 7 Tropical Schools)
  const fishCount = 220;

  // Sculpted Realistic Hydrodynamic Fish Geometry (Snout, Dorsal Fin, Forked Caudal Tail, Anal Fin)
  const fishShape = new THREE.Shape();
  fishShape.moveTo(0, 0.28); // Snout
  fishShape.quadraticCurveTo(0.12, 0.16, 0.15, 0.0); // Top forehead to mid-back
  fishShape.lineTo(0.24, -0.08); // Dorsal fin crest
  fishShape.lineTo(0.14, -0.16); // Dorsal fin back slope
  fishShape.quadraticCurveTo(0.04, -0.24, 0.03, -0.28); // Caudal peduncle top
  fishShape.lineTo(0.16, -0.42); // Upper caudal tail fin tip
  fishShape.lineTo(0.0, -0.32); // Caudal tail fork notch
  fishShape.lineTo(-0.16, -0.42); // Lower caudal tail fin tip
  fishShape.lineTo(-0.03, -0.28); // Caudal peduncle bottom
  fishShape.quadraticCurveTo(-0.04, -0.2, -0.08, -0.15); // Anal fin
  fishShape.quadraticCurveTo(-0.12, 0.02, -0.08, 0.16); // Underbelly to chin
  fishShape.closePath();

  const fishGeo = new THREE.ExtrudeGeometry(fishShape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  fishGeo.rotateY(Math.PI / 2);
  fishGeo.center();

  const fishMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.42,
  });
  const fishInstanced = new THREE.InstancedMesh(fishGeo, fishMat, fishCount);
  fishInstanced.frustumCulled = false;

  const fishColors = [
    0xfacc15, // Golden Yellow Tang
    0x38bdf8, // Regal Blue Tang
    0xf97316, // Flame Anthias
    0x2dd4bf, // Turquoise Damselfish
    0xf43f5e, // Coral Pink Anthias
    0xa855f7, // Royal Purple Fairy Basslet
    0xe2e8f0, // Silver Shimmering Sardine
  ];
  const fishBoids: FishBoid[] = [];
  const schoolCenters = [
    new THREE.Vector3(14, -3.8, -14),  // 1. Sunlit Coral Gardens
    new THREE.Vector3(-24, -4.8, -16), // 2. Whispering Kelp Glade
    new THREE.Vector3(36, -5.2, 20),   // 3. Coral Terrace
    new THREE.Vector3(-38, -8.5, -26), // 4. Starlight Galleon Wreck
    new THREE.Vector3(30, -9.0, -42),  // 5. Coral Brigantine Wreck
    new THREE.Vector3(-44, -10.5, 32), // 6. Bioluminescent Grotto
    new THREE.Vector3(4, -1.8, 12),    // 7. Coconut Cove Shallows
  ];

  for (let i = 0; i < fishCount; i++) {
    const center = schoolCenters[i % schoolCenters.length];
    const pos = new THREE.Vector3(
      center.x + (Math.random() - 0.5) * 9,
      center.y + (Math.random() - 0.5) * 2.8,
      center.z + (Math.random() - 0.5) * 9
    );
    fishBoids.push({
      pos,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2.2, 0, (Math.random() - 0.5) * 2.2),
      homeCenter: center,
      scale: 0.72 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
    });
    _color.setHex(fishColors[i % fishColors.length]);
    fishInstanced.setColorAt(i, _color);
  }
  if (fishInstanced.instanceColor) fishInstanced.instanceColor.needsUpdate = true;
  scene.add(fishInstanced);

  // 10A. Dedicated School of Yellowtail Snappers (10 Fish)
  const yellowtailSnappers = Array.from({ length: 10 }, (_, idx) => {
    const yt = createYellowtailSnapper();
    scene.add(yt.group);
    return {
      ...yt,
      center: new THREE.Vector3(18, -4.2, -18),
      angle: (idx / 10) * Math.PI * 2,
      speed: 0.45 + (idx % 3) * 0.08,
      radius: 5.5 + (idx % 2) * 2.2,
    };
  });

  // 10B. Dedicated Clownfish Pairs playing in Sea Anemones (8 Fish)
  const clownfishHomes = [
    new THREE.Vector3(12, -3.2, -12),
    new THREE.Vector3(16, -3.6, -16),
    new THREE.Vector3(-22, -4.5, -18),
    new THREE.Vector3(34, -4.8, 18),
  ];
  const clownfishPairs = Array.from({ length: 8 }, (_, idx) => {
    const cf = createClownfish();
    const home = clownfishHomes[Math.floor(idx / 2)];
    scene.add(cf.group);
    return {
      ...cf,
      homePos: home,
      wigglePhase: idx * 1.4,
    };
  });

  // 10C. Living Procedural Coral Reef Sanctuaries (Swaying Staghorns, Gorgonian Sea Fans & Anemones)
  // Deployed across 4 key ocean zones: Sunlit Coral Gardens, Whispering Kelp Terraces, Starlight Galleon, and Coral Brigantine
  const reefSanctuaryLocations = [
    // Sunlit Coral Gardens Terrace
    { x: 12.0, z: -12.0, stagColor: 0xfb923c, fanColor: 0xec4899, anemColor: 0x22d3ee },
    { x: 16.0, z: -16.0, stagColor: 0xa855f7, fanColor: 0xf43f5e, anemColor: 0xf472b6 },
    { x: 18.5, z: -13.5, stagColor: 0xf43f5e, fanColor: 0x38bdf8, anemColor: 0xfacc15 },
    { x: 10.5, z: -18.0, stagColor: 0x2dd4bf, fanColor: 0xfb923c, anemColor: 0xa855f7 },
    // Whispering Kelp Glade & Sand Shelf
    { x: -22.0, z: -18.0, stagColor: 0x34d399, fanColor: 0x06b6d4, anemColor: 0x38bdf8 },
    { x: -26.0, z: -14.0, stagColor: 0x10b981, fanColor: 0xec4899, anemColor: 0x22d3ee },
    { x: -20.5, z: -22.5, stagColor: 0xfb923c, fanColor: 0xa855f7, anemColor: 0xf472b6 },
    // Starlight Galleon Sunken Shipwreck Reef
    { x: -35.0, z: -24.0, stagColor: 0xf43f5e, fanColor: 0x38bdf8, anemColor: 0x2dd4bf },
    { x: -40.0, z: -28.0, stagColor: 0xa855f7, fanColor: 0xfb923c, anemColor: 0xfacc15 },
    { x: -37.5, z: -22.0, stagColor: 0x2dd4bf, fanColor: 0xec4899, anemColor: 0x38bdf8 },
    // Coral Brigantine Sunken Shipwreck Reef
    { x: 34.0, z: 18.0, stagColor: 0xfb923c, fanColor: 0xf43f5e, anemColor: 0x22d3ee },
    { x: 28.0, z: -40.0, stagColor: 0xfacc15, fanColor: 0xec4899, anemColor: 0xa855f7 },
    { x: 32.5, z: -44.0, stagColor: 0xec4899, fanColor: 0x2dd4bf, anemColor: 0xf43f5e },
  ];

  const swayingStaghornCorals: SwayingCoralCluster[] = [];
  const swayingSeaFans: SwayingSeaFan[] = [];
  const swayingAnemones: SwayingAnemone[] = [];

  reefSanctuaryLocations.forEach((loc, idx) => {
    // 1. Articulated Branching Staghorn Coral
    const staghorn = createStaghornCoral(loc.stagColor);
    const sx = loc.x + 1.1;
    const sz = loc.z - 0.7;
    const sy = groundHeightAt(sx, sz);
    staghorn.basePos.set(sx, sy, sz);
    staghorn.group.position.copy(staghorn.basePos);
    staghorn.group.rotation.y = idx * 1.35;
    scene.add(staghorn.group);
    swayingStaghornCorals.push(staghorn);

    // 2. Delicate Gorgonian Sea Fan
    const fan = createSeaFan(loc.fanColor);
    const fx = loc.x - 1.25;
    const fz = loc.z + 0.85;
    const fy = groundHeightAt(fx, fz);
    fan.basePos.set(fx, fy, fz);
    fan.mesh.position.copy(fan.basePos);
    fan.mesh.rotation.y = idx * 0.9 + 0.4;
    fan.baseRot.copy(fan.mesh.rotation);
    scene.add(fan.mesh);
    swayingSeaFans.push(fan);

    // 3. Soft Waving Sea Anemone
    const anemone = createSeaAnemone(loc.anemColor);
    const ax = loc.x;
    const az = loc.z;
    const ay = groundHeightAt(ax, az) + 0.08;
    anemone.basePos.set(ax, ay, az);
    anemone.group.position.copy(anemone.basePos);
    anemone.group.rotation.y = idx * 0.6;
    scene.add(anemone.group);
    swayingAnemones.push(anemone);
  });

  // 10D. 22 Tropical Sally Lightfoot / Coral Crabs (5-6 at each Coral Reef Location!)
  const crabLocationCenters = [
    new THREE.Vector3(14, 0, -16),  // Coral Gardens Terrace
    new THREE.Vector3(-38, 0, -24), // Whispering Kelp Reef
    new THREE.Vector3(-38, 0, -26), // Sunken Galleon Reef
    new THREE.Vector3(30, 0, -42),  // Coral Brigantine Reef
  ];
  const coralCrabs = Array.from({ length: 22 }, (_, idx) => {
    const crab = createCoralCrab(textures);
    const locCenter = crabLocationCenters[idx % crabLocationCenters.length];
    const ca = (idx * 1.6) % (Math.PI * 2);
    const cr = 1.5 + (idx % 5) * 0.9;
    const cx = locCenter.x + Math.cos(ca) * cr;
    const cz = locCenter.z + Math.sin(ca) * cr;
    const cy = groundHeightAt(cx, cz) + 0.08;
    const basePos = new THREE.Vector3(cx, cy, cz);
    crab.group.position.copy(basePos);
    scene.add(crab.group);
    return {
      ...crab,
      basePos,
      walkAngle: ca,
      walkTimer: Math.random() * 5,
      scuttleSpeed: 0.8 + Math.random() * 0.6,
      swimFlutter: 0,
    };
  });

  // 10E. Adorable Tropical Starfish (12 Sea Stars across Coral Rocks & Beach Shallows for the Little One!)
  const starfishCoords: [number, number, number][] = [
    [13.5, -15.5, 0xf97316], // Coral Gardens Orange Star
    [15.2, -17.2, 0x38bdf8], // Coral Gardens Blue Star
    [12.1, -13.8, 0xf43f5e], // Coral Gardens Sunset Red Star
    [-37.2, -24.5, 0xa855f7], // Galleon Wreck Purple Star
    [-39.5, -27.1, 0xfacc15], // Galleon Deck Gold Star
    [29.2, -41.5, 0x2dd4bf], // Brigantine Turquoise Star
    [31.4, -43.2, 0xfb923c], // Brigantine Coral Star
    [3.5, 22.8, 0xf472b6],   // Coconut Cove Beach Pink Star
    [-2.8, 24.2, 0xfacc15],  // Coconut Cove Shallows Gold Star
    [-52.5, -7.5, 0x38bdf8], // Hibiscus Atoll Blue Star
    [41.5, 21.0, 0xf97316],  // Kelp Forest Orange Star
    [-43.5, 31.5, 0xc084fc], // Grotto Lilac Star
  ];
  const starfishList = starfishCoords.map(([sx, sz, colorHex]) => {
    const star = createStarfish(colorHex);
    const sy = groundHeightAt(sx, sz) + 0.04;
    const basePos = new THREE.Vector3(sx, sy, sz);
    star.group.position.copy(basePos);
    star.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(star.group);
    return {
      ...star,
      basePos,
      sparkleTimer: 0,
    };
  });

  // 10F. Seven Gentle Rays (4 Manta Rays + 3 Spotted Eagle Rays!)
  const mantaRays = [
    { center: new THREE.Vector3(16, -3.5, -18), radius: 13, speed: 0.32, angle: 0 },
    { center: new THREE.Vector3(-24, -4.8, -14), radius: 14, speed: 0.28, angle: 2.1 },
    { center: new THREE.Vector3(36, -4.5, 22), radius: 12, speed: 0.35, angle: 4.2 },
    { center: new THREE.Vector3(-6, -2.8, 8), radius: 11, speed: 0.3, angle: 1.2 },
  ].map((cfg) => {
    const manta = createMantaRay();
    scene.add(manta.group);
    return {
      ...manta,
      ...cfg,
      greetingTilt: 0,
      befriended: false,
    };
  });

  const eagleRays = [
    { center: new THREE.Vector3(22, -4.0, -10), radius: 14, speed: 0.38, angle: 0.8 },
    { center: new THREE.Vector3(-32, -5.5, -22), radius: 15, speed: 0.34, angle: 3.1 },
    { center: new THREE.Vector3(28, -6.0, -36), radius: 13, speed: 0.36, angle: 5.0 },
  ].map((cfg) => {
    const ray = createSpottedEagleRay(textures);
    scene.add(ray.group);
    return {
      ...ray,
      ...cfg,
      greetingTilt: 0,
      befriended: false,
    };
  });

  // 10G. Dolphins
  const dolphins = [0, 1, 2, 3].map((idx) => {
    const d = createDolphin();
    scene.add(d.group);
    return {
      ...d,
      angle: idx * 0.55,
      radius: 22 + (idx % 2) * 3.0,
      spinProgress: 0,
      escortTimer: 0,
      befriended: false,
    };
  });

  // 10H. Majestic Great Humpback Whale
  const ws = createGreatWhale(textures);
  scene.add(ws.group);
  const whaleShark = {
    ...ws,
    angle: 0,
    smoothedY: -7.5,
    befriended: false,
  };

  // 10I. Moon Jellyfish
  const jellyColors = [0x22d3ee, 0xc084fc, 0x38bdf8, 0xf472b6];
  const jellyfishList = Array.from({ length: 8 }, (_, idx) => {
    const j = createMoonJellyfish(jellyColors[idx % jellyColors.length]);
    const a = (idx / 8) * Math.PI * 2;
    const jx = -42 + Math.cos(a) * 9;
    const jz = 30 + Math.sin(a) * 9;
    const minGround = groundHeightAt(jx, jz) + 1.8;
    const basePos = new THREE.Vector3(
      jx,
      Math.max(minGround, -6.5 - (idx % 3) * 1.4),
      jz
    );
    j.group.position.copy(basePos);
    scene.add(j.group);
    return {
      ...j,
      basePos,
      phase: idx * 0.9,
    };
  });

  // Per-frame interactive update
  const updateEnvironment = (
    dt: number,
    elapsed: number,
    momPos: THREE.Vector3,
    babyPos: THREE.Vector3,
    momSpeed: number,
    babySpeed: number,
    turtleCallTimer: number,
    nightFactor: number,
    weatherMood: string
  ): { activeReaction: string | null; newlyBefriendedId: string | null } => {
    let activeReaction: string | null = null;
    let newlyBefriendedId: string | null = null;

    waterUniforms.uTime.value = elapsed;
    kelpUniforms.uTime.value = elapsed;
    coralUniforms.uTime.value = elapsed;

    // =========================================================================
    // PROCEDURAL CURRENT ANIMATION SYSTEM FOR LIVING CORAL REEFS
    // Ambient oceanic swells + reactive hydrodynamic wake surge from passing turtles
    // =========================================================================

    // 1. Procedural Swaying of Branching Staghorn Corals
    swayingStaghornCorals.forEach((coral) => {
      // Ambient harmonic multi-frequency underwater current
      const cx = coral.basePos.x;
      const cz = coral.basePos.z;
      const ambientSwayX = Math.sin(elapsed * 1.5 + cx * 0.22 + cz * 0.15) * 0.085;
      const ambientSwayZ = Math.cos(elapsed * 1.3 + cx * 0.16 - cz * 0.20) * 0.065;

      // Hydrodynamic turtle proximity wake surge: accelerates and amplifies branch sway
      const dMom = coral.basePos.distanceTo(momPos);
      const dBaby = coral.basePos.distanceTo(babyPos);
      const minDistance = Math.min(dMom, dBaby);
      const nearestSpeed = dMom < dBaby ? momSpeed : babySpeed;
      const wakeSurge = minDistance < 5.5 ? Math.max(0, 1.0 - minDistance / 5.5) * (0.8 + nearestSpeed * 0.25) : 0;

      coral.group.rotation.x = ambientSwayX * (1.0 + wakeSurge * 1.4);
      coral.group.rotation.z = ambientSwayZ * (1.0 + wakeSurge * 1.4);

      // Articulated individual branch prong bending
      coral.branches.forEach((b) => {
        const branchFlutter = Math.sin(elapsed * 2.8 + b.phase + cx * 0.3) * 0.09;
        const wakeBending = wakeSurge * Math.sin(elapsed * 5.0 + b.phase) * 0.14;
        b.mesh.rotation.x = b.baseRot.x + ambientSwayX * 0.9 + branchFlutter + wakeBending;
        b.mesh.rotation.z = b.baseRot.z + ambientSwayZ * 0.9 + branchFlutter * 0.6 + wakeBending * 0.8;
      });
    });

    // 2. Procedural Swaying of Delicate Gorgonian Sea Fans
    swayingSeaFans.forEach((fan) => {
      const fx = fan.basePos.x;
      const fz = fan.basePos.z;
      const dMom = fan.basePos.distanceTo(momPos);
      const dBaby = fan.basePos.distanceTo(babyPos);
      const minDistance = Math.min(dMom, dBaby);
      const nearestSpeed = dMom < dBaby ? momSpeed : babySpeed;
      const wakeSurge = minDistance < 5.0 ? Math.max(0, 1.0 - minDistance / 5.0) * (0.7 + nearestSpeed * 0.25) : 0;

      // Planar billowing and rolling in the prevailing ocean current
      const fanSwayZ = Math.sin(elapsed * 1.8 + fan.phase + fx * 0.18) * 0.15 * (1.0 + wakeSurge * 1.6);
      const fanTwistY = Math.cos(elapsed * 1.25 + fan.phase * 0.8 + fz * 0.18) * 0.08 * (1.0 + wakeSurge * 1.2);
      const fanFlexX = Math.sin(elapsed * 2.2 + fan.phase) * 0.06;

      fan.mesh.rotation.x = fan.baseRot.x + fanFlexX;
      fan.mesh.rotation.y = fan.baseRot.y + fanTwistY;
      fan.mesh.rotation.z = fan.baseRot.z + fanSwayZ;
    });

    // 3. Procedural Swaying of Soft Sea Anemone Tentacles
    swayingAnemones.forEach((anemone) => {
      const ax = anemone.basePos.x;
      const az = anemone.basePos.z;
      const dMom = anemone.basePos.distanceTo(momPos);
      const dBaby = anemone.basePos.distanceTo(babyPos);
      const minDistance = Math.min(dMom, dBaby);
      const nearestSpeed = dMom < dBaby ? momSpeed : babySpeed;
      const wakeSurge = minDistance < 4.2 ? Math.max(0, 1.0 - minDistance / 4.2) * (0.6 + nearestSpeed * 0.3) : 0;

      // Base body breathing contraction/expansion
      const pulse = 1.0 + Math.sin(elapsed * 1.7 + ax * 0.2) * 0.04;
      anemone.group.scale.set(pulse, 1.0 + (pulse - 1.0) * 0.5, pulse);

      // Flexible undulating tentacle waving
      anemone.tentacles.forEach((t) => {
        const waveAngle = elapsed * 2.5 + t.phase + ax * 0.25;
        const tentacleSwayX = Math.sin(waveAngle) * 0.18 * (1.0 + wakeSurge * 1.5);
        const tentacleSwayZ = Math.cos(waveAngle * 0.85) * 0.16 * (1.0 + wakeSurge * 1.5);
        t.mesh.rotation.x = t.baseRot.x + tentacleSwayX;
        t.mesh.rotation.z = t.baseRot.z + tentacleSwayZ;
      });
    });

    // Weather Mode Shader & Material Atmosphere Updates
    const isRain = weatherMood === 'gentle_rain';
    const isMist = weatherMood === 'misty_morning';
    const targetWeatherUniform = isRain ? 1.0 : isMist ? 2.0 : 0.0;
    waterUniforms.uWeatherMode.value = THREE.MathUtils.damp(
      waterUniforms.uWeatherMode.value,
      targetWeatherUniform,
      4.0,
      dt
    );

    if (isRain) {
      waterMat.color.setHex(0x0f766e);
      waterMat.roughness = 0.24;
    } else if (isMist) {
      waterMat.color.setHex(0x2dd4bf);
      waterMat.roughness = 0.06;
    } else {
      waterMat.color.setHex(0x14b8a6);
      waterMat.roughness = 0.12;
    }

    coralMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.06, 0.55, nightFactor);
    grotto.glowMaterials.forEach((mat, gi) => {
      mat.emissiveIntensity = 0.9 + Math.sin(elapsed * 1.3 + gi * 1.7) * 0.3;
    });
    pMat.opacity = THREE.MathUtils.lerp(0.45, 0.88, nightFactor);
    beamUniforms.uOpacity.value =
      weatherMood === 'sunlit_calm' || weatherMood === 'golden_shimmer'
        ? THREE.MathUtils.lerp(0.11, 0.02, nightFactor)
        : isMist
          ? THREE.MathUtils.lerp(0.065, 0.015, nightFactor)
          : THREE.MathUtils.lerp(0.035, 0.01, nightFactor);

    // Update Gentle Rain Particles & Surface Splash Rings
    rainMat.opacity = THREE.MathUtils.damp(rainMat.opacity, isRain ? 0.68 : 0, 4.0, dt);
    rainParticles.visible = rainMat.opacity > 0.02;
    rainSplashGroup.visible = isRain;

    if (rainParticles.visible) {
      const rArr = rainGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < rainCount; i++) {
        const iy = i * 3 + 1;
        rArr[iy] -= dt * 19.5;
        rArr[i * 3] += dt * 1.4; // subtle trade-wind slant
        if (rArr[iy] < -0.5) {
          rArr[iy] = 24 + Math.random() * 4;
          rArr[i * 3] = momPos.x + (Math.random() - 0.5) * 95;
          rArr[i * 3 + 2] = momPos.z + (Math.random() - 0.5) * 95;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;

      splashRings.forEach((sr, idx) => {
        const cycle = (elapsed * 2.6 + sr.phase) % 1.0;
        const s = 0.4 + cycle * 2.8;
        sr.mesh.scale.setScalar(s);
        if (cycle < 0.08) {
          sr.mesh.position.x = momPos.x + Math.cos(idx * 1.7 + elapsed) * (4 + (idx % 7) * 4.5);
          sr.mesh.position.z = momPos.z + Math.sin(idx * 1.7 + elapsed) * (4 + (idx % 7) * 4.5);
        }
      });
    }

    // Update Misty Morning Sea-Fog Clouds
    mistMat.opacity = THREE.MathUtils.damp(mistMat.opacity, isMist ? 0.34 : 0, 3.5, dt);
    mistGroup.visible = mistMat.opacity > 0.01;
    if (mistGroup.visible) {
      mistBanks.forEach((mb) => {
        mb.mesh.position.x = mb.baseX + Math.sin(elapsed * 0.25 * mb.speed + mb.phase) * 6.5;
        mb.mesh.position.z = mb.baseZ + Math.cos(elapsed * 0.22 * mb.speed + mb.phase) * 5.0;
      });
    }

    // Update edible seaweed patches (gentle sway + regrowth after being munched)
    edibleSeaweedPatches.forEach((patch, idx) => {
      if (patch.amountRemaining < 1.0) {
        patch.amountRemaining = Math.min(1.0, patch.amountRemaining + dt * 0.035);
      }
      if (patch.munchAnimTimer > 0) {
        patch.munchAnimTimer = Math.max(0, patch.munchAnimTimer - dt);
      }
      const scaleY = 0.25 + patch.amountRemaining * 0.75;
      const wiggle =
        patch.munchAnimTimer > 0
          ? Math.sin(elapsed * 28) * 0.18
          : Math.sin(elapsed * 2.0 + idx) * 0.06;
      patch.bladesGroup.scale.set(1, scaleY, 1);
      patch.bladesGroup.rotation.z = wiggle;
      patch.tenderBuds.visible = patch.amountRemaining > 0.55;
    });

    // Drift current particles (clamped strictly above seabed sand)
    const pArr = pGeo.attributes.position.array as Float32Array;
    const currentSpeedMult = weatherMood === 'gentle_currents' || isRain ? 1.5 : 1.0;
    for (let i = 0; i < pCount; i++) {
      const ix = i * 3;
      pArr[ix] += Math.cos(elapsed * 0.3 + i) * dt * 0.65 * currentSpeedMult;
      pArr[ix + 1] += Math.sin(elapsed * 0.8 + i) * dt * 0.15;
      pArr[ix + 2] += Math.sin(elapsed * 0.3 + i) * dt * 0.65 * currentSpeedMult;
      const floorY = groundHeightAt(pArr[ix], pArr[ix + 2]) + 0.35;
      if (pArr[ix + 1] < floorY) pArr[ix + 1] = floorY + 0.5;
      if (pArr[ix + 1] > -0.3) pArr[ix + 1] = -9.5;
    }
    pGeo.attributes.position.needsUpdate = true;

    // 1. Update Reef Fish Boids (Strict Sand Collision + Turtle Interaction)
    for (let i = 0; i < fishCount; i++) {
      const b = fishBoids[i];
      _vec3A.subVectors(b.homeCenter, b.pos).multiplyScalar(0.45);
      b.vel.addScaledVector(_vec3A, dt);

      b.vel.x += Math.cos(elapsed * 1.4 + b.phase) * dt * 1.6;
      b.vel.z += Math.sin(elapsed * 1.4 + b.phase) * dt * 1.6;

      const dMom = b.pos.distanceTo(momPos);
      const dBaby = b.pos.distanceTo(babyPos);
      const nearestTurtle = dMom < dBaby ? momPos : babyPos;
      const nearestSpeed = dMom < dBaby ? momSpeed : babySpeed;
      const minDist = Math.min(dMom, dBaby);

      if (minDist < 7.5) {
        if (turtleCallTimer > 0 || nearestSpeed < 2.2) {
          _vec3B.subVectors(nearestTurtle, b.pos);
          if (minDist > 2.2) {
            b.vel.addScaledVector(_vec3B.normalize(), dt * 5.2);
          }
          activeReaction = 'Reef fish gathering in a friendly halo around the turtles';
          if (turtleCallTimer > 0) newlyBefriendedId = 'wildlife-reef-school';
        } else if (nearestSpeed > 5.0) {
          _vec3B.subVectors(b.pos, nearestTurtle).normalize();
          b.vel.addScaledVector(_vec3B, dt * 11.0);
          activeReaction = 'Reef fish shimmering as you glide through the school';
        }
      }

      const spd = b.vel.length();
      if (spd > 4.2) b.vel.multiplyScalar(4.2 / spd);
      b.pos.addScaledVector(b.vel, dt);

      // Keep fish strictly above seabed sand and below water surface
      const fishFloor = groundHeightAt(b.pos.x, b.pos.z) + 0.75;
      if (b.pos.y < fishFloor) {
        b.pos.y = fishFloor;
        b.vel.y = Math.max(0.5, b.vel.y);
      }
      b.pos.y = Math.min(b.pos.y, -0.65);

      _dummy.position.copy(b.pos);
      _vec3A.copy(b.pos).add(b.vel);
      _dummy.lookAt(_vec3A);
      _dummy.rotateY(Math.sin(elapsed * 12 + b.phase) * 0.16);
      _dummy.scale.setScalar(b.scale);
      _dummy.updateMatrix();
      fishInstanced.setMatrixAt(i, _dummy.matrix);
    }
    fishInstanced.instanceMatrix.needsUpdate = true;

    // 1B. Update Yellowtail Snappers School
    yellowtailSnappers.forEach((yt, idx) => {
      yt.angle += yt.speed * dt * 0.8;
      const yx = yt.center.x + Math.cos(yt.angle + idx * 0.25) * yt.radius;
      const yz = yt.center.z + Math.sin(yt.angle + idx * 0.25) * yt.radius;
      const floorY = groundHeightAt(yx, yz) + 1.2;
      const yy = Math.max(floorY, yt.center.y + Math.sin(elapsed * 1.5 + idx) * 0.6);
      yt.group.position.set(yx, yy, yz);

      const nextX = yt.center.x + Math.cos(yt.angle + idx * 0.25 + 0.05) * yt.radius;
      const nextZ = yt.center.z + Math.sin(yt.angle + idx * 0.25 + 0.05) * yt.radius;
      _vec3A.set(nextX, yy, nextZ);
      yt.group.lookAt(_vec3A);
      yt.tailMesh.rotation.y = Math.sin(elapsed * 9 + idx) * 0.32;
    });

    // 1C. Update Clownfish Pairs (Playful wobble around sea anemones)
    clownfishPairs.forEach((cf, idx) => {
      const a = elapsed * 1.8 + cf.wigglePhase;
      const cx = cf.homePos.x + Math.cos(a) * 0.65;
      const cz = cf.homePos.z + Math.sin(a) * 0.65;
      const floorY = groundHeightAt(cx, cz) + 0.45;
      const cy = floorY + 0.4 + Math.sin(elapsed * 2.8 + idx) * 0.22;
      cf.group.position.set(cx, cy, cz);
      _vec3A.set(
        cf.homePos.x + Math.cos(a + 0.2) * 0.65,
        cy,
        cf.homePos.z + Math.sin(a + 0.2) * 0.65
      );
      cf.group.lookAt(_vec3A);
      cf.group.rotation.z = Math.sin(elapsed * 7 + idx) * 0.18;
      cf.tailMesh.rotation.y = Math.sin(elapsed * 11 + idx) * 0.42;
    });

    // 1D. Update Coral Crabs (Sideways scuttle, claw pinch, and swimming flutter)
    coralCrabs.forEach((crab, idx) => {
      crab.walkTimer += dt;
      if (crab.walkTimer > 4.5) {
        crab.walkAngle += (Math.random() - 0.5) * 1.8;
        crab.walkTimer = 0;
      }
      const dCrab = Math.min(
        crab.group.position.distanceTo(momPos),
        crab.group.position.distanceTo(babyPos)
      );

      // When turtles are near, crab flutters or waves pincers
      if (dCrab < 4.5) {
        crab.swimFlutter = Math.min(1.0, crab.swimFlutter + dt * 3);
      } else {
        crab.swimFlutter = Math.max(0, crab.swimFlutter - dt * 2);
      }

      const scuttleDirX = -Math.sin(crab.walkAngle);
      const scuttleDirZ = Math.cos(crab.walkAngle);
      crab.basePos.x += scuttleDirX * crab.scuttleSpeed * dt * 0.45;
      crab.basePos.z += scuttleDirZ * crab.scuttleSpeed * dt * 0.45;
      const groundY = groundHeightAt(crab.basePos.x, crab.basePos.z) + 0.1;
      const swimRise = Math.sin(elapsed * 4.5 + idx) * 0.5 * crab.swimFlutter;
      crab.group.position.set(crab.basePos.x, groundY + swimRise, crab.basePos.z);
      crab.group.rotation.y = crab.walkAngle;

      // Leg step cycle
      const legCycle = elapsed * 8 * crab.scuttleSpeed;
      crab.legs.forEach((leg, lIdx) => {
        const side = lIdx < 4 ? -1 : 1;
        leg.rotation.z = side * (0.85 + Math.sin(legCycle + lIdx) * 0.28);
      });

      // Pincer waving
      const pinchWave = Math.sin(elapsed * 6 + idx) * 0.25;
      crab.leftPincer.rotation.x = 0.45 + pinchWave + crab.swimFlutter * 0.3;
      crab.rightPincer.rotation.x = 0.45 - pinchWave + crab.swimFlutter * 0.3;
    });

    // 1E. Update Starfish (Organic Ray Flexing, Respiration, & Proximity Bioluminescence)
    starfishList.forEach((star, idx) => {
      const dStar = Math.min(
        star.group.position.distanceTo(momPos),
        star.group.position.distanceTo(babyPos)
      );
      if (dStar < 4.5) {
        star.sparkleTimer = Math.min(1.0, star.sparkleTimer + dt * 2.5);
      } else {
        star.sparkleTimer = Math.max(0, star.sparkleTimer - dt * 1.5);
      }
      star.mat.emissiveIntensity = 0.28 + star.sparkleTimer * 0.85;

      // Realistic echinoderm breathing swell & curling of ray arm tips
      const breathe = 1.0 + Math.sin(elapsed * 1.6 + idx * 0.7) * 0.035;
      star.group.scale.set(breathe, 1.0 + (breathe - 1.0) * 0.8, breathe);

      star.armMeshes.forEach((arm, aIdx) => {
        const baseRot = star.baseRotations[aIdx];
        const armWave = Math.sin(elapsed * 1.8 + idx + aIdx * 1.25) * 0.06;
        arm.rotation.x = baseRot.x + armWave;
      });
    });

    // 2. Update Manta Rays (Forward Swimming with Trailing Tail + Multi-Point Sand Collision + Friendship Wing Bow)
    mantaRays.forEach((m, idx) => {
      m.angle += m.speed * dt;
      const mx = m.center.x + Math.cos(m.angle) * m.radius;
      const mz = m.center.z + Math.sin(m.angle) * m.radius;
      // Tangent velocity direction along circular orbit:
      // dx/dt = -sin(m.angle), dz/dt = cos(m.angle)
      // Since model faces +Z by default, rotation.y = atan2(dx, dz) aligns +Z with forward velocity!
      const forwardHeading = Math.atan2(-Math.sin(m.angle), Math.cos(m.angle));

      // Sample 5 points across manta wings & body so it never touches sand
      const fp = sampleFootprintGround(mx, mz, forwardHeading, 2.0, 2.4);
      const minSafeY = fp.maxGroundY + 1.45;
      const desiredY = m.center.y + Math.sin(elapsed * 1.1 + idx) * 0.65;
      const my = Math.min(-0.9, Math.max(minSafeY, desiredY));

      _vec3A.set(mx, my, mz);
      const dTurtle = Math.min(_vec3A.distanceTo(momPos), _vec3A.distanceTo(babyPos));
      const targetGreeting = dTurtle < 9.5 ? 0.48 : 0;
      m.greetingTilt = THREE.MathUtils.damp(m.greetingTilt, targetGreeting, 3.5, dt);

      if (dTurtle < 9.5) {
        activeReaction = 'Spotted Manta Ray bowing its wings in friendship';
        if (turtleCallTimer > 0 || dTurtle < 5.5) {
          m.befriended = true;
          newlyBefriendedId = 'wildlife-manta';
        }
      }
      m.friendHaloMat.opacity = THREE.MathUtils.damp(
        m.friendHaloMat.opacity,
        m.befriended ? 0.78 : 0,
        4,
        dt
      );

      m.group.position.copy(_vec3A);
      m.group.rotation.y = forwardHeading;
      m.group.rotation.z = m.greetingTilt;

      const flap = Math.sin(elapsed * 2.6 + idx) * 0.34;
      m.leftWing.rotation.z = flap;
      m.rightWing.rotation.z = -flap;
    });

    // 2B. Update Spotted Eagle Rays (Forward Swimming with Trailing Tail + Quicker avian wing stroke & agile banking)
    eagleRays.forEach((r, idx) => {
      r.angle += r.speed * dt;
      const rx = r.center.x + Math.cos(r.angle) * r.radius;
      const rz = r.center.z + Math.sin(r.angle) * r.radius;
      const forwardHeading = Math.atan2(-Math.sin(r.angle), Math.cos(r.angle));

      const fp = sampleFootprintGround(rx, rz, forwardHeading, 1.8, 2.1);
      const minSafeY = fp.maxGroundY + 1.35;
      const desiredY = r.center.y + Math.sin(elapsed * 1.3 + idx * 1.2) * 0.75;
      const ry = Math.min(-0.85, Math.max(minSafeY, desiredY));

      _vec3A.set(rx, ry, rz);
      const dTurtle = Math.min(_vec3A.distanceTo(momPos), _vec3A.distanceTo(babyPos));
      if (dTurtle < 9.5) {
        activeReaction = 'Spotted Eagle Ray banking overhead in greeting';
        if (turtleCallTimer > 0 || dTurtle < 5.5) {
          r.befriended = true;
          newlyBefriendedId = 'wildlife-manta';
        }
      }
      r.friendHaloMat.opacity = THREE.MathUtils.damp(
        r.friendHaloMat.opacity,
        r.befriended ? 0.82 : 0,
        4,
        dt
      );

      r.group.position.copy(_vec3A);
      r.group.rotation.y = forwardHeading;
      r.group.rotation.z = Math.sin(elapsed * 1.5 + idx) * 0.28;

      const flap = Math.sin(elapsed * 3.4 + idx) * 0.42;
      r.leftWing.rotation.z = flap;
      r.rightWing.rotation.z = -flap;
    });

    // 3. Update Friendly Dolphin Pod (Sand-Safe Escort & Friendship Spins)
    dolphins.forEach((d, idx) => {
      if (turtleCallTimer > 0) {
        d.escortTimer = 7.0;
        d.befriended = true;
        newlyBefriendedId = 'wildlife-dolphin';
      }
      if (d.escortTimer > 0) {
        d.escortTimer -= dt;
        d.spinProgress += dt * 4.5;
        activeReaction = 'Singing Dolphin pod spinning & swimming right beside you!';
      } else {
        d.spinProgress = THREE.MathUtils.damp(d.spinProgress, 0, 4, dt);
      }

      d.friendHaloMat.opacity = THREE.MathUtils.damp(
        d.friendHaloMat.opacity,
        d.befriended ? 0.82 : 0,
        4,
        dt
      );

      d.angle += dt * 0.42;
      const orbitCenterX = d.escortTimer > 0 ? momPos.x : 0;
      const orbitCenterZ = d.escortTimer > 0 ? momPos.z - 6 : -10;
      const orbitR = d.escortTimer > 0 ? 4.8 + idx * 1.3 : d.radius;

      const dx = orbitCenterX + Math.cos(d.angle + idx * 0.45) * orbitR;
      const dz = orbitCenterZ + Math.sin(d.angle + idx * 0.45) * orbitR;
      const heading = -(d.angle + idx * 0.45) + Math.PI;

      const fp = sampleFootprintGround(dx, dz, heading, 1.8, 0.8);
      const minSafeY = fp.maxGroundY + 1.25;
      const leapArc = Math.sin(elapsed * 2.1 + idx * 1.1);
      const dy = Math.max(minSafeY, -2.4 + leapArc * 1.8);

      _vec3B.set(dx, dy, dz);
      d.group.position.lerp(_vec3B, Math.min(1, dt * 3.5));
      d.group.rotation.y = heading;
      d.group.rotation.x = -Math.cos(elapsed * 2.1 + idx * 1.1) * 0.25;
      d.group.rotation.z = d.spinProgress;
      d.flukePivot.rotation.x = Math.sin(elapsed * 9.5 + idx) * 0.35;
    });

    // 4. Update Majestic Great Humpback Whale (Vertical Fluke Undulation & 5-Point Sand Clearance!)
    const wsDist = Math.min(
      whaleShark.group.position.distanceTo(momPos),
      whaleShark.group.position.distanceTo(babyPos)
    );
    const wsSpeed = wsDist < 14 ? 0.08 : 0.15;
    if (wsDist < 14) {
      activeReaction = 'Majestic Humpback Whale gliding peacefully alongside the turtles!';
      if (turtleCallTimer > 0 || wsDist < 8.0) {
        whaleShark.befriended = true;
        newlyBefriendedId = 'wildlife-whaleshark';
      }
    }
    whaleShark.friendHaloMat.opacity = THREE.MathUtils.damp(
      whaleShark.friendHaloMat.opacity,
      whaleShark.befriended ? 0.88 : 0,
      4,
      dt
    );

    whaleShark.angle += dt * wsSpeed;
    const wx = Math.cos(whaleShark.angle) * 34;
    const wz = -46 + Math.sin(whaleShark.angle * 2) * 11;
    const nextWx = Math.cos(whaleShark.angle + 0.04) * 34;
    const nextWz = -46 + Math.sin((whaleShark.angle + 0.04) * 2) * 11;
    const wsHeading = Math.atan2(nextWx - wx, nextWz - wz);

    // Sample 5 points across the Whale's 9.5-meter body & 5.2-meter pectoral wingspan!
    const wsFootprint = sampleFootprintGround(wx, wz, wsHeading, 5.2, 2.6);
    // Guarantee at least 2.5 meters of clearance above the highest sand point
    const targetSafeWhaleY = Math.min(-2.2, Math.max(-7.6, wsFootprint.maxGroundY + 2.55));
    whaleShark.smoothedY = THREE.MathUtils.damp(whaleShark.smoothedY, targetSafeWhaleY, 4.0, dt);

    const slopePitch = THREE.MathUtils.clamp(
      (wsFootprint.noseGroundY - wsFootprint.tailGroundY) * 0.08,
      -0.22,
      0.22
    );

    whaleShark.group.position.set(wx, whaleShark.smoothedY, wz);
    _vec3A.set(nextWx, whaleShark.smoothedY + slopePitch * 3.0, nextWz);
    whaleShark.group.lookAt(_vec3A);

    // True Cetacean Swimming: Tail flukes undulate VERTICALLY (up & down)!
    whaleShark.tailPivot.rotation.x = Math.sin(elapsed * 1.6) * 0.28;

    // 5. Update Bioluminescent Moon Jellyfish (Sand-Safe Floating)
    jellyfishList.forEach((j) => {
      const pulse = Math.sin(elapsed * 2.2 + j.phase);
      const minJFloor = groundHeightAt(j.basePos.x, j.basePos.z) + 1.65;
      j.group.position.y = Math.max(minJFloor, j.basePos.y + pulse * 0.55);
      j.bell.scale.set(1 + pulse * 0.08, 1 - pulse * 0.12, 1 + pulse * 0.08);

      const dJ = Math.min(
        j.group.position.distanceTo(momPos),
        j.group.position.distanceTo(babyPos)
      );
      const proxGlow = dJ < 8.5 ? 1.35 : 0.45 + nightFactor * 0.65;
      j.mat.emissiveIntensity = THREE.MathUtils.damp(j.mat.emissiveIntensity, proxGlow, 4, dt);
      if (dJ < 8.5) {
        activeReaction = 'Moon Jellyfish glowing with friendship bioluminescence';
        if (turtleCallTimer > 0) newlyBefriendedId = 'wildlife-jellyfish';
      }
    });

    return { activeReaction, newlyBefriendedId };
  };

  return {
    waterSurface,
    waterUniforms,
    kelpUniforms,
    coralMaterial,
    sunBeamsGroup,
    currentParticles,
    fishInstanced,
    fishBoids,
    edibleSeaweedPatches,
    mantaRays,
    eagleRays,
    yellowtailSnappers,
    clownfishPairs,
    coralCrabs,
    starfishList,
    dolphins,
    whaleShark,
    jellyfishList,
    updateEnvironment,
  };
}
