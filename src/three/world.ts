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
  createEdibleSeaweedPatch,
  createMoonJellyfish,
  createSeaAnemone,
  createSeaFan,
  createGrotto,
  GROTTO_CENTER,
  GROTTO_RING,
  withNearCameraFade,
  createShipwreck,
  getBrainCoralGeometry,
  getBranchCoralGeometry,
  createDriftwood,
  getBeachShellGeometry,
  getFlowerGeometry,
  getPebbleGeometry,
  getRockGeometry,
  getSeagrassGeometry,
  getTableCoralGeometry,
  getTubeSpongeGeometry,
  getCoralSurfaceTexture,
  SHIP_HULL,
  createStaghornCoral,
  createStarfish,
} from './models';
import {
  createDolphin,
  createGreatWhale,
  createMantaRay,
  createOctopus,
  createPufferfish,
  createSeahorse,
  createSpottedEagleRay,
  createYellowtailSnapper,
  getSchoolFishGeometry,
} from './creatures';

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
];

/** Rounded scenery a turtle should bump and glide over (coral boulders). Rebuilt with the world. */
interface SoftObstacle {
  x: number;
  y: number;
  z: number;
  radius: number;
}
const SOFT_OBSTACLES: SoftObstacle[] = [];
let palmCollidersAdded = false;

/**
 * Eases a turtle out of any coral boulder it is overlapping. The push follows the
 * boulder's surface with an upward bias, so swimming into one lifts the turtle over it
 * instead of stopping it dead or wedging it between two boulders.
 */
export function resolveSoftObstacles(pos: THREE.Vector3, turtleRadius: number, dt: number): void {
  const ease = Math.min(1, dt * 10);
  for (const obs of SOFT_OBSTACLES) {
    const dx = pos.x - obs.x;
    const dz = pos.z - obs.z;
    const reach = obs.radius + turtleRadius;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const dy = pos.y - obs.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist >= reach || dist < 0.0001) continue;
    const push = ((reach - dist) / dist) * ease;
    pos.x += dx * push;
    pos.z += dz * push;
    pos.y += Math.max(dy, reach * 0.35) * push;
  }
}

/** A placed shipwreck: how to get from world space into the hull's own space and back. */
interface WreckPlacement {
  toLocal: THREE.Matrix4;
  toWorld: THREE.Matrix4;
  scale: number;
}
const WRECKS: WreckPlacement[] = [];
const _wreckLocal = new THREE.Vector3();

function registerWreck(wreck: THREE.Group): void {
  wreck.updateMatrixWorld(true);
  WRECKS.push({
    toWorld: wreck.matrixWorld.clone(),
    toLocal: wreck.matrixWorld.clone().invert(),
    scale: wreck.scale.x,
  });
}

/** Station along the hull, 0 at the stern to 1 at the bow, for a point in hull space. */
const hullStation = (z: number) => (z - SHIP_HULL.sternZ) / SHIP_HULL.length;

/** True when a world position is inside a wreck's hull, below its deck. */
export function isInsideWreck(pos: THREE.Vector3): boolean {
  for (const wreck of WRECKS) {
    _wreckLocal.copy(pos).applyMatrix4(wreck.toLocal);
    const u = hullStation(_wreckLocal.z);
    if (u < 0.03 || u > 0.95 || _wreckLocal.y > SHIP_HULL.deckY) continue;
    const width = SHIP_HULL.widthAt(u, SHIP_HULL.girthAtHeight(u, _wreckLocal.y));
    if (Math.abs(_wreckLocal.x) < width) return true;
  }
  return false;
}

/**
 * Shipwreck collision that follows the real hull: planked sides, the deck and the stern
 * cabin are solid, while the breaches and the fallen-in deck are open, so a turtle can
 * swim in through a hole, explore under the deck and come out again.
 */
function resolveWreckHulls(pos: THREE.Vector3, turtleRadius: number): void {
  for (const wreck of WRECKS) {
    const local = _wreckLocal.copy(pos).applyMatrix4(wreck.toLocal);
    const r = (turtleRadius / wreck.scale) * 0.7;
    const u = hullStation(local.z);
    if (u < -0.08 || u > 1.05) continue;
    const uc = THREE.MathUtils.clamp(u, 0, 1);
    const sheer = SHIP_HULL.sheerHeight(uc);
    if (local.y > sheer + r + 1.4 || local.y < SHIP_HULL.keelRise(uc) - r) continue;
    let moved = false;

    // Stern cabin: a solid block. Leave by the nearest face (never downward).
    const [cabinHalfW, cabinBottom, cabinTop, cabinZ0, cabinZ1] = SHIP_HULL.cabin;
    if (
      Math.abs(local.x) < cabinHalfW + r &&
      local.y > cabinBottom - r &&
      local.y < cabinTop + r &&
      local.z > cabinZ0 - r &&
      local.z < cabinZ1 + r
    ) {
      const outX = cabinHalfW + r - Math.abs(local.x);
      const outUp = cabinTop + r - local.y;
      const outFore = cabinZ1 + r - local.z;
      const outAft = local.z - (cabinZ0 - r);
      const least = Math.min(outX, outUp, outFore, outAft);
      if (least === outX) local.x = Math.sign(local.x || 1) * (cabinHalfW + r);
      else if (least === outUp) local.y = cabinTop + r;
      else if (least === outFore) local.z = cabinZ1 + r;
      else local.z = cabinZ0 - r;
      moved = true;
    }

    // Planked sides, wherever they are not broken open.
    if (local.y <= sheer) {
      const g = SHIP_HULL.girthAtHeight(uc, local.y);
      const side = local.x >= 0 ? 1 : -1;
      const wall = SHIP_HULL.widthAt(uc, g);
      const offset = Math.abs(local.x) - wall;
      if (Math.abs(offset) < r && u >= 0 && !SHIP_HULL.isBreached(uc, g, side)) {
        // Back to the side the turtle is on; if the hull is too narrow there, outside.
        const inside = offset < 0 && wall - r > 0.35;
        local.x = side * (inside ? wall - r : wall + r);
        moved = true;
      }
    }

    // Deck: a floor from above and a ceiling from below, except where it has fallen in.
    if (uc > SHIP_HULL.deckFrom && uc < SHIP_HULL.deckTo) {
      const deckWidth = SHIP_HULL.widthAt(uc, SHIP_HULL.girthAtHeight(uc, SHIP_HULL.deckY));
      const [holeX0, holeX1, holeZ0, holeZ1] = SHIP_HULL.deckCollapse;
      const inHole =
        local.x > holeX0 && local.x < holeX1 && local.z > holeZ0 && local.z < holeZ1;
      const gap = local.y - SHIP_HULL.deckY;
      const reach = r * 0.6;
      if (!inHole && Math.abs(local.x) < deckWidth && Math.abs(gap) < reach) {
        local.y = SHIP_HULL.deckY + (gap >= 0 ? reach : -reach);
        moved = true;
      }
    }

    if (moved) pos.copy(local).applyMatrix4(wreck.toWorld);
  }
}

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
  resolveWreckHulls(pos, turtleRadius);
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
  /** Which school-fish mesh draws this fish, and its slot in that mesh. */
  mesh: THREE.InstancedMesh;
  slot: number;
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
    leftWing: THREE.Object3D;
    rightWing: THREE.Object3D;
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
    leftWing: THREE.Object3D;
    rightWing: THREE.Object3D;
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
  textures: OceanTextureLibrary,
  lightGraphics = false
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

  // Light rippling over the seabed (the bright net the surface casts in shallow water)
  // and a line of foam washing along the shore, both drawn in the sand's own shader.
  const terrainUniforms = { uTime: { value: 0 }, uCaustics: { value: 1 } };
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uCaustics = terrainUniforms.uCaustics;
    shader.vertexShader =
      `varying vec3 vSeabedPos;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vSeabedPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );
    shader.fragmentShader =
      `uniform float uTime;\nuniform float uCaustics;\nvarying vec3 vSeabedPos;\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          {
            // Foam: a thin band at the waterline that slides up and down the beach.
            float wash = sin(uTime * 0.9 + vSeabedPos.x * 0.35 + vSeabedPos.z * 0.27) * 0.07;
            float band = 1.0 - smoothstep(0.0, 0.16, abs(vSeabedPos.y - 0.04 - wash));
            float lace = 0.55 + 0.45 * sin(vSeabedPos.x * 3.1 + vSeabedPos.z * 2.3 + uTime * 1.8);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), band * lace * 0.7);
            // Sand just above the water stays dark and wet.
            float wet = (1.0 - smoothstep(0.05, 0.55, vSeabedPos.y)) * step(0.0, vSeabedPos.y);
            diffuseColor.rgb *= 1.0 - wet * 0.22;
          }
          `
        )
        .replace(
          '#include <emissivemap_fragment>',
          `
          #include <emissivemap_fragment>
          {
            vec2 p = vSeabedPos.xz * 0.5;
            float t = uTime * 0.55;
            float a = sin(p.x * 1.7 + sin(p.y * 1.3 + t) * 1.6 + t);
            float b = sin(p.y * 1.9 + sin(p.x * 1.1 - t * 0.8) * 1.7 - t * 0.7);
            float c = sin((p.x + p.y) * 1.2 + sin((p.x - p.y) * 0.9 + t * 0.5) * 1.4);
            float net = pow(1.0 - abs(a * 0.5 + b * 0.5), 7.0) + pow(1.0 - abs(b * 0.5 + c * 0.5), 7.0);
            // Only under water, strongest in the shallows and gone in the deep.
            float lit = smoothstep(0.0, -0.9, vSeabedPos.y) * smoothstep(-17.0, -6.0, vSeabedPos.y);
            // No sunlight reaches the floor of the grotto, so the net fades out there.
            float open = smoothstep(9.0, 21.0, distance(vSeabedPos.xz, vec2(${GROTTO_CENTER.x}.0, ${GROTTO_CENTER.z}.0)));
            totalEmissiveRadiance += vec3(0.72, 0.95, 0.88) * net * 0.3 * lit * open * uCaustics;
          }
          `
        );
  };

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
        vSurfacePos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );
    // Sparkle: thin bright streaks that drift across the surface.
    shader.vertexShader = `varying vec3 vSurfacePos;\n` + shader.vertexShader;
    shader.fragmentShader =
      `uniform float uTime;\nvarying vec3 vSurfacePos;\n` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>
        {
          vec2 q = vSurfacePos.xz * 0.42;
          float s1 = sin(q.x * 2.3 + sin(q.y * 1.7 + uTime * 0.7) * 1.5 + uTime * 0.9);
          float s2 = sin(q.y * 2.7 + sin(q.x * 1.3 - uTime * 0.6) * 1.6 - uTime * 0.8);
          float glint = pow(1.0 - abs(s1 * 0.5 + s2 * 0.5), 14.0);
          totalEmissiveRadiance += vec3(0.85, 0.97, 1.0) * glint * 0.35;
        }
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
    if (gy > 0.2 && !palmCollidersAdded) {
      SOLID_OBSTACLES.push({
        x: cfg.x,
        z: cfg.z,
        radius: 0.45,
        minY: gy - 0.5,
        maxY: gy + cfg.h,
        name: 'Palm Trunk',
      });
    }
    if (gy > 0.2) {
      const palm = createCoconutPalm(cfg.x, gy - 0.1, cfg.z, cfg.h, cfg.lean, cfg.dir, textures);
      scene.add(palm);
    }
  });

  // 3B. Island detail: grass and flowers on the high ground, shells along the tideline,
  // boulders and driftwood on the beaches.
  const islands: [number, number, number][] = [
    [0, 34, 30],
    [-58, -8, 22],
    [56, -14, 20],
  ];
  // Things that must stay clear: the lighthouse, the hatchery shelter and the palm trunks.
  const keepOff: [number, number, number][] = [
    [-3.2, 30.8, 3.4],
    [3.4, 25.8, 3.8],
    ...palmConfigs.map((cfg): [number, number, number] => [cfg.x, cfg.z, 0.9]),
  ];
  const isClear = (x: number, z: number) =>
    keepOff.every(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) > kr);
  /** Random spots on the islands whose ground height is within a band. */
  const islandSpots = (count: number, minY: number, maxY: number): [number, number, number][] => {
    const spots: [number, number, number][] = [];
    for (let attempt = 0; attempt < count * 40 && spots.length < count; attempt++) {
      const [ix, iz, ir] = islands[attempt % islands.length];
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * ir;
      const x = ix + Math.cos(a) * r;
      const z = iz + Math.sin(a) * r;
      const y = groundHeightAt(x, z);
      if (y >= minY && y <= maxY && isClear(x, z)) spots.push([x, y, z]);
    }
    return spots;
  };
  const scatter = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    spots: [number, number, number][],
    tones: number[],
    place: (spot: [number, number, number], i: number) => void
  ) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, spots.length));
    spots.forEach((spot, i) => {
      place(spot, i);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      _color.setHex(tones[i % tones.length]);
      mesh.setColorAt(i, _color);
    });
    mesh.count = spots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  // Grass: the same blades as the seagrass, in a breeze, on ground above the beach.
  const islandGrassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  islandGrassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float sway = clamp(transformed.y / 0.9, 0.0, 1.0);
        transformed.x += sin(uTime * 2.4 + instanceMatrix[3][0] * 0.9 + instanceMatrix[3][2] * 0.7) * 0.09 * sway * sway;
        `
      );
  };
  scatter(
    getSeagrassGeometry(),
    islandGrassMat,
    islandSpots(lightGraphics ? 320 : 520, 1.5, 20),
    [0x65a30d, 0x84cc16, 0x4d7c0f, 0xa3e635, 0x3f9142],
    ([x, y, z]) => {
      _dummy.position.set(x, y - 0.02, z);
      _dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      const gs = 0.7 + Math.random() * 0.9;
      _dummy.scale.set(gs * 1.3, gs * (0.7 + Math.random() * 0.5), gs * 1.3);
    }
  );
  scatter(
    getFlowerGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55 }),
    islandSpots(lightGraphics ? 70 : 120, 1.7, 20),
    [0xf43f5e, 0xfde047, 0xfb923c, 0xf9a8d4, 0xffffff, 0xc084fc],
    ([x, y, z]) => {
      _dummy.position.set(x, y - 0.02, z);
      _dummy.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
      _dummy.scale.setScalar(0.9 + Math.random() * 0.9);
    }
  );
  scatter(
    getBeachShellGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.45,
      side: THREE.DoubleSide,
    }),
    islandSpots(lightGraphics ? 80 : 130, 0.12, 1.3),
    [0xfde6d0, 0xfbcfe8, 0xfff7ed, 0xfed7aa, 0xe9d5ff],
    ([x, y, z]) => {
      _dummy.position.set(x, y + 0.015, z);
      _dummy.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, 0);
      _dummy.scale.setScalar(0.8 + Math.random() * 1.1);
    }
  );
  scatter(
    getRockGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }),
    islandSpots(22, 0.3, 3.5),
    [0x8b8f98, 0x6f7480, 0xa39b8f, 0x7c8577],
    ([x, y, z]) => {
      const rs = 0.6 + Math.random() * 1.5;
      _dummy.position.set(x, y + 0.12 * rs, z);
      _dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      _dummy.scale.set(rs * (0.8 + Math.random() * 0.5), rs * (0.7 + Math.random() * 0.4), rs);
    }
  );
  islandSpots(9, 0.25, 1.2).forEach(([x, y, z]) => {
    const log = createDriftwood(textures, 1.6 + Math.random() * 1.6);
    log.position.set(x, y + 0.08, z);
    log.rotation.y = Math.random() * Math.PI * 2;
    scene.add(log);
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
  WRECKS.length = 0;
  registerWreck(galleonWreck);

  const brigantineY = groundHeightAt(30, -42);
  const brigantineWreck = createShipwreck([30, brigantineY - 0.2, -42], -0.85, 0.95, textures);
  scene.add(brigantineWreck);
  registerWreck(brigantineWreck);

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
  const coralCount = lightGraphics ? 190 : 230;

  const coralUniforms = {
    uTime: { value: 0 },
  };

  const coralMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: getCoralSurfaceTexture(),
    bumpMap: getCoralSurfaceTexture(),
    bumpScale: 0.06,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.08,
    roughness: 0.62,
    metalness: 0.04,
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

  palmCollidersAdded = true;
  SOFT_OBSTACLES.length = 0;
  // Four coral forms, each drawn as one instanced mesh: brain-coral mounds, branching
  // staghorn, flat table coral and clusters of tube sponges.
  type CoralKind = 'brain' | 'branch' | 'table' | 'sponge';
  const kindCycle: CoralKind[] = ['brain', 'branch', 'table', 'brain', 'sponge', 'branch'];
  const kindOf = (i: number) => kindCycle[i % kindCycle.length];
  const countOf = (kind: CoralKind) =>
    Array.from({ length: coralCount }, (_, i) => kindOf(i)).filter((k) => k === kind).length;
  const coralMeshes: Record<CoralKind, THREE.InstancedMesh> = {
    brain: new THREE.InstancedMesh(getBrainCoralGeometry(), coralMaterial, countOf('brain')),
    branch: new THREE.InstancedMesh(getBranchCoralGeometry(), coralMaterial, countOf('branch')),
    table: new THREE.InstancedMesh(getTableCoralGeometry(), coralMaterial, countOf('table')),
    sponge: new THREE.InstancedMesh(getTubeSpongeGeometry(), coralMaterial, countOf('sponge')),
  };
  const coralSlots: Record<CoralKind, number> = { brain: 0, branch: 0, table: 0, sponge: 0 };
  // Each kind keeps to colours that suit it, with a little variation between neighbours.
  const coralPalettes: Record<CoralKind, number[]> = {
    brain: [0xf43f5e, 0xfb923c, 0xfacc15, 0x2dd4bf, 0xa3e635],
    branch: [0xa855f7, 0xec4899, 0xfb7185, 0x38bdf8, 0xfde047],
    table: [0x2dd4bf, 0x60a5fa, 0xf59e0b, 0xc084fc],
    sponge: [0xfacc15, 0xf97316, 0xe879f9, 0x4ade80],
  };
  // How much of each kind's footprint a turtle bumps into.
  const coralBump: Record<CoralKind, number> = { brain: 0.8, branch: 0.6, table: 0.55, sponge: 0.5 };
  const wreckCentres: [number, number][] = [
    [-38, -26],
    [30, -42],
  ];
  const keepClearOfWrecks = (x: number, z: number): [number, number] => {
    let cx = x;
    let cz = z;
    wreckCentres.forEach(([wx, wz]) => {
      const d = Math.hypot(cx - wx, cz - wz);
      if (d < 11) {
        const push = 11 / Math.max(d, 0.01);
        cx = wx + (cx - wx) * push;
        cz = wz + (cz - wz) * push;
      }
    });
    return [cx, cz];
  };

  for (let i = 0; i < coralCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 58;
    // Keep the shipwrecks clear, so nothing grows in the way of swimming through them.
    const [cx, cz] = keepClearOfWrecks(Math.cos(angle) * radius, Math.sin(angle) * radius - 8);
    const cy = groundHeightAt(cx, cz);
    const kind = kindOf(i);

    // Set a little into the sand so the base never floats on a slope.
    _dummy.position.set(cx, Math.min(-1.2, cy) - 0.08, cz);
    _dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const s = 0.6 + Math.random() * 1.35;
    if (kind === 'brain') _dummy.scale.set(s * 1.15, s * (0.65 + Math.random() * 0.6), s);
    else if (kind === 'table') _dummy.scale.set(s * 0.9, s * (0.7 + Math.random() * 0.4), s * 0.9);
    else _dummy.scale.set(s * 0.85, s * (0.8 + Math.random() * 0.4), s * 0.85);
    _dummy.updateMatrix();
    SOFT_OBSTACLES.push({
      x: cx,
      y: _dummy.position.y,
      z: cz,
      radius: 0.75 * s * coralBump[kind],
    });

    const palette = coralPalettes[kind];
    _color.setHex(palette[i % palette.length]);
    // Nudge hue and brightness so no two neighbours are quite the same colour.
    _color.offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.1);
    const mesh = coralMeshes[kind];
    mesh.setMatrixAt(coralSlots[kind], _dummy.matrix);
    mesh.setColorAt(coralSlots[kind], _color);
    coralSlots[kind] += 1;
  }
  Object.values(coralMeshes).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  });

  // 6B. Seabed detail: pebbles and shell fragments scattered over the sand, thickest
  // around the reef, and tufts of seagrass in the shallows.
  const pebbleCount = lightGraphics ? 420 : 700;
  const pebbles = new THREE.InstancedMesh(
    getPebbleGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.02 }),
    pebbleCount
  );
  const pebbleTones = [0x94a3b8, 0xcbd5e1, 0xd6c7a1, 0xf5ead2, 0x8b7d6b, 0xfbcfe8];
  for (let i = 0; i < pebbleCount; i++) {
    // Most gather in loose patches; the rest lie singly across the seabed.
    const patch = i % 4 !== 0;
    const patchAngle = Math.floor(i / 12) * 2.4;
    const patchRadius = 10 + ((Math.floor(i / 12) * 37) % 55);
    const px = patch
      ? Math.cos(patchAngle) * patchRadius + (Math.random() - 0.5) * 5
      : (Math.random() - 0.5) * 150;
    const pz = patch
      ? Math.sin(patchAngle) * patchRadius - 8 + (Math.random() - 0.5) * 5
      : (Math.random() - 0.5) * 150;
    const py = groundHeightAt(px, pz);
    _dummy.position.set(px, py + 0.02, pz);
    _dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
    const ps = 0.5 + Math.random() * 1.6;
    _dummy.scale.set(ps * (0.8 + Math.random() * 0.5), ps, ps);
    _dummy.updateMatrix();
    pebbles.setMatrixAt(i, _dummy.matrix);
    _color.setHex(pebbleTones[i % pebbleTones.length]);
    pebbles.setColorAt(i, _color);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.receiveShadow = true;
  scene.add(pebbles);

  const seagrassCount = lightGraphics ? 260 : 420;
  const seagrassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  seagrassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = coralUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Blades bend with the current, more toward the tip.
        float bend = clamp(transformed.y / 0.9, 0.0, 1.0);
        float gx = instanceMatrix[3][0];
        float gz = instanceMatrix[3][2];
        transformed.x += sin(uTime * 1.7 + gx * 0.6 + gz * 0.4) * 0.16 * bend * bend;
        transformed.z += cos(uTime * 1.3 + gx * 0.3 - gz * 0.5) * 0.11 * bend * bend;
        `
      );
    shader.fragmentShader = withNearCameraFade(shader.fragmentShader);
  };
  const seagrass = new THREE.InstancedMesh(getSeagrassGeometry(), seagrassMat, seagrassCount);
  const grassTones = [0x4ade80, 0x22c55e, 0x86efac, 0x34d399, 0xa3e635];
  let grassPlaced = 0;
  for (let attempt = 0; attempt < seagrassCount * 12 && grassPlaced < seagrassCount; attempt++) {
    // Meadows: pick a patch centre, then scatter tufts around it.
    const meadow = attempt % 9;
    const mAngle = meadow * 0.7 + 0.3;
    const mRadius = 14 + meadow * 6;
    const gx = Math.cos(mAngle) * mRadius + (Math.random() - 0.5) * 12;
    const gz = Math.sin(mAngle) * mRadius - 4 + (Math.random() - 0.5) * 12;
    const gy = groundHeightAt(gx, gz);
    // Seagrass only grows where light reaches: under water, but not in the deep.
    if (gy > -0.7 || gy < -9.5) continue;
    const [fx, fz] = keepClearOfWrecks(gx, gz);
    _dummy.position.set(fx, groundHeightAt(fx, fz) - 0.03, fz);
    _dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const gs = 0.8 + Math.random() * 1.1;
    _dummy.scale.set(gs, gs * (0.8 + Math.random() * 0.6), gs);
    _dummy.updateMatrix();
    seagrass.setMatrixAt(grassPlaced, _dummy.matrix);
    _color.setHex(grassTones[grassPlaced % grassTones.length]);
    seagrass.setColorAt(grassPlaced, _color);
    grassPlaced += 1;
  }
  seagrass.count = grassPlaced;
  seagrass.instanceMatrix.needsUpdate = true;
  if (seagrass.instanceColor) seagrass.instanceColor.needsUpdate = true;
  seagrass.frustumCulled = false;
  scene.add(seagrass);

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
  const grotto = createGrotto(groundHeightAt, !lightGraphics);
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

  // Two kinds of schooling fish, each drawn as one instanced mesh: slender darting fish
  // and tall-bodied tangs. A school is all one kind and one colour.
  const fishMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const discSchools = new Set([0, 1, 3]); // yellow tang, blue tang, damselfish
  const schoolCount = 7;
  const discTotal = Array.from({ length: fishCount }, (_, i) => i).filter((i) =>
    discSchools.has(i % schoolCount)
  ).length;
  const fishInstanced = new THREE.InstancedMesh(
    getSchoolFishGeometry('slender'),
    fishMat,
    fishCount - discTotal
  );
  const discFishInstanced = new THREE.InstancedMesh(getSchoolFishGeometry('disc'), fishMat, discTotal);
  fishInstanced.frustumCulled = false;
  discFishInstanced.frustumCulled = false;
  let slenderSlot = 0;
  let discSlot = 0;

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
    const isDisc = discSchools.has(i % schoolCount);
    const pos = new THREE.Vector3(
      center.x + (Math.random() - 0.5) * 9,
      center.y + (Math.random() - 0.5) * 2.8,
      center.z + (Math.random() - 0.5) * 9
    );
    fishBoids.push({
      pos,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2.2, 0, (Math.random() - 0.5) * 2.2),
      homeCenter: center,
      scale: (isDisc ? 1.25 : 1.15) * (0.72 + Math.random() * 0.45),
      phase: Math.random() * Math.PI * 2,
      mesh: isDisc ? discFishInstanced : fishInstanced,
      slot: isDisc ? discSlot : slenderSlot,
    });
    _color.setHex(fishColors[i % fishColors.length]);
    if (isDisc) discFishInstanced.setColorAt(discSlot++, _color);
    else fishInstanced.setColorAt(slenderSlot++, _color);
  }
  [fishInstanced, discFishInstanced].forEach((mesh) => {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  });

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

  // 10B-2. Pufferfish: each potters around its own patch of reef and puffs up when a
  // turtle swims close.
  const pufferHomes: [number, number][] = [
    [14, -9],
    [21, -21],
    [-23, -12],
    [-9, -23],
    [34, 14],
  ];
  const pufferfish = pufferHomes.map(([hx, hz], idx) => {
    const puffer = createPufferfish();
    puffer.group.scale.setScalar(1.5);
    scene.add(puffer.group);
    return { ...puffer, hx, hz, phase: idx * 1.9, puff: 0 };
  });

  // 10B-3. Seahorses bobbing upright among the kelp and in the grotto.
  const seahorseSpots: [number, number, number][] = [
    [35, 20, 0xf59e0b],
    [39, 25, 0xfb7185],
    [42, 21, 0xfacc15],
    [36, 29, 0xa3e635],
    [44, 27, 0xfdba74],
    [31, 24, 0xf472b6],
    [-40, 28, 0xc084fc],
    [-45, 33, 0x67e8f9],
  ];
  const seahorses = seahorseSpots.map(([sx, sz, colorHex], idx) => {
    const horse = createSeahorse(colorHex);
    horse.group.scale.setScalar(1.7);
    scene.add(horse.group);
    return { ...horse, sx, sz, phase: idx * 2.3 };
  });

  // 10B-4. Octopuses creeping slowly over the seabed.
  const octopusBeats: [number, number, number, number][] = [
    [17, -25, 4.5, 0xd9573b],
    [-17, -31, 3.5, 0xb45ad6],
  ];
  const octopuses = octopusBeats.map(([ox, oz, beat, colorHex], idx) => {
    const octo = createOctopus(colorHex);
    octo.group.scale.setScalar(1.25);
    scene.add(octo.group);
    return { ...octo, ox, oz, beat, angle: idx * 2.1 };
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
    terrainUniforms.uTime.value = elapsed;
    // Light on the seabed follows the day: bright at noon, faint by moonlight, dull in rain.
    terrainUniforms.uCaustics.value =
      THREE.MathUtils.lerp(1.0, 0.18, nightFactor) *
      (weatherMood === 'gentle_rain' ? 0.45 : weatherMood === 'misty_morning' ? 0.6 : 1.0);
    grotto.motes.rotation.y = elapsed * 0.03;
    grotto.motes.position.y = Math.sin(elapsed * 0.4) * 0.25;
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
      b.mesh.setMatrixAt(b.slot, _dummy.matrix);
    }
    fishInstanced.instanceMatrix.needsUpdate = true;
    discFishInstanced.instanceMatrix.needsUpdate = true;

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
      // Each fish drifts in a lazy, slightly wobbly loop around its anemone, the two of a
      // pair on opposite sides, darting in a little closer now and then.
      const a = elapsed * 0.55 + cf.wigglePhase + (idx % 2) * Math.PI;
      const loopAt = (angle: number, out: THREE.Vector3) => {
        const r = 1.05 + Math.sin(angle * 2.3 + idx) * 0.35;
        return out.set(cf.homePos.x + Math.cos(angle) * r, 0, cf.homePos.z + Math.sin(angle) * r);
      };
      loopAt(a, _vec3B);
      loopAt(a + 0.12, _vec3A);
      const floorY = groundHeightAt(_vec3B.x, _vec3B.z) + 0.55;
      const cy = floorY + 0.45 + Math.sin(elapsed * 1.3 + idx * 1.7) * 0.25;
      cf.group.position.set(_vec3B.x, cy, _vec3B.z);
      _vec3A.y = cy + Math.cos(elapsed * 1.3 + idx * 1.7) * 0.04;
      cf.group.lookAt(_vec3A);
      cf.tailMesh.rotation.y = Math.sin(elapsed * 9 + idx) * 0.45;
    });

    // 1C-2. Pufferfish: lazy wander; swell up and bristle when a turtle is close.
    pufferfish.forEach((pf, idx) => {
      const a = elapsed * 0.3 + pf.phase;
      const r = 2.2 + Math.sin(a * 1.7 + idx) * 0.8;
      _vec3B.set(pf.hx + Math.cos(a) * r, 0, pf.hz + Math.sin(a) * r);
      _vec3A.set(
        pf.hx + Math.cos(a + 0.1) * r,
        0,
        pf.hz + Math.sin(a + 0.1) * r
      );
      const py = Math.min(
        -1.0,
        groundHeightAt(_vec3B.x, _vec3B.z) + 1.3 + Math.sin(elapsed * 0.9 + idx * 2) * 0.3
      );
      _vec3B.y = py;
      _vec3A.y = py;
      const near = Math.min(_vec3B.distanceTo(momPos), _vec3B.distanceTo(babyPos));
      pf.puff = THREE.MathUtils.damp(pf.puff, near < 3.4 ? 1 : 0, near < 3.4 ? 6 : 1.5, dt);
      pf.group.position.copy(_vec3B);
      pf.group.lookAt(_vec3A);
      pf.body.scale.set(1 + pf.puff * 0.75, 1 + pf.puff * 0.75, 1 + pf.puff * 0.35);
      pf.spikes.scale.setScalar(Math.max(0.001, pf.puff));
      if (near < 3.4) activeReaction = 'Pufferfish puffing up into a spiky ball!';
    });

    // 1C-3. Seahorses: hover upright, drift a little, flutter the back fin.
    seahorses.forEach((sh, idx) => {
      const drift = elapsed * 0.25 + sh.phase;
      const hx = sh.sx + Math.cos(drift) * 0.5;
      const hz = sh.sz + Math.sin(drift * 1.3) * 0.5;
      const hy = Math.min(
        -1.2,
        groundHeightAt(hx, hz) + 1.5 + Math.sin(elapsed * 0.8 + sh.phase) * 0.35
      );
      sh.group.position.set(hx, hy, hz);
      sh.group.rotation.y = Math.sin(elapsed * 0.2 + sh.phase) * 1.2 + idx;
      sh.group.rotation.x = Math.sin(elapsed * 0.8 + sh.phase) * 0.08;
      sh.fin.rotation.y = Math.sin(elapsed * 22 + idx) * 0.5;
    });

    // 1C-4. Octopuses: creep round a small beat on the seabed, arms rippling.
    octopuses.forEach((oc, idx) => {
      oc.angle += dt * 0.09;
      const cx = oc.ox + Math.cos(oc.angle) * oc.beat;
      const cz = oc.oz + Math.sin(oc.angle) * oc.beat;
      oc.group.position.set(cx, groundHeightAt(cx, cz) + 0.12, cz);
      oc.group.rotation.y = -oc.angle;
      const breath = 1 + Math.sin(elapsed * 1.6 + idx) * 0.05;
      oc.mantle.scale.set(breath, 2 - breath, breath);
      oc.arms.forEach((arm, k) => {
        arm.rotation.x = Math.sin(elapsed * 1.3 + k * 0.8 + idx) * 0.12;
        arm.rotation.z = Math.cos(elapsed * 1.1 + k * 1.1) * 0.1;
      });
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
      // Nose along the direction of travel around the circle (the model faces +Z).
      const heading = -(d.angle + idx * 0.45);

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
    // Unhurried cruising, slower still when the turtles are close enough to swim alongside.
    const wsSpeed = wsDist < 14 ? 0.035 : 0.06;
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

    // Route: one wide oval through the deep channel. It stays at least 9 m clear of both
    // shipwrecks and over seabed no shallower than about 10 m, so the whale never has
    // to squeeze over a sand bank.
    whaleShark.angle += dt * wsSpeed;
    const whaleAt = (angle: number, out: THREE.Vector3) =>
      out.set(-10 + Math.cos(angle) * 30, 0, -52 + Math.sin(angle) * 13);
    whaleAt(whaleShark.angle, _vec3B);
    whaleAt(whaleShark.angle + 0.04, _vec3A);
    const wx = _vec3B.x;
    const wz = _vec3B.z;
    const nextWx = _vec3A.x;
    const nextWz = _vec3A.z;
    const wsHeading = Math.atan2(nextWx - wx, nextWz - wz);

    // Sample under the whole body and both pectoral fins, and keep a generous 4.5 m of
    // water under it. It also stays well below the surface.
    const wsFootprint = sampleFootprintGround(wx, wz, wsHeading, 6.5, 3.6);
    const targetSafeWhaleY =
      THREE.MathUtils.clamp(wsFootprint.maxGroundY + 4.5, -8.5, -3.8) +
      Math.sin(elapsed * 0.35) * 0.35;
    whaleShark.smoothedY = THREE.MathUtils.damp(whaleShark.smoothedY, targetSafeWhaleY, 1.2, dt);

    const slopePitch = THREE.MathUtils.clamp(
      (wsFootprint.noseGroundY - wsFootprint.tailGroundY) * 0.05,
      -0.15,
      0.15
    );

    whaleShark.group.position.set(wx, whaleShark.smoothedY, wz);
    _vec3A.set(nextWx, whaleShark.smoothedY + slopePitch * 3.0, nextWz);
    whaleShark.group.lookAt(_vec3A);

    // True Cetacean Swimming: Tail flukes undulate VERTICALLY (up & down)!
    whaleShark.tailPivot.rotation.x = Math.sin(elapsed * 1.1) * 0.24;

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
