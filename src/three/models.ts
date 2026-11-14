import * as THREE from 'three';
import { OceanTextureLibrary } from './textures';
import { CollectibleItem, StoryLandmark } from '../types/game';

export interface ArticulatedTurtle {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  beakMesh: THREE.Mesh;
  frontLeftFlipper: THREE.Group;
  frontRightFlipper: THREE.Group;
  backLeftFlipper: THREE.Group;
  backRightFlipper: THREE.Group;
  tailMesh: THREE.Mesh;
  callRippleMesh: THREE.Mesh;
  callRippleMat: THREE.MeshBasicMaterial;
}

/**
 * High-Realism 14-Part Composite Procedural Sea Turtle (Mother "Kaimana" or Baby "Lani")
 */
export function createSeaTurtle(
  isMother: boolean,
  textures: OceanTextureLibrary
): ArticulatedTurtle {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const scale = isMother ? 1.35 : 0.68;
  bodyGroup.scale.setScalar(scale);

  const carapaceMat = new THREE.MeshPhysicalMaterial({
    map: isMother ? textures.momShellAlbedo : textures.babyShellAlbedo,
    bumpMap: textures.shellBump,
    bumpScale: 0.055,
    roughness: 0.22,
    metalness: 0.08,
    clearcoat: 0.92,
    clearcoatRoughness: 0.14,
  });

  const plastronMat = new THREE.MeshStandardMaterial({
    color: isMother ? 0xe8cf9c : 0xf4e2b8,
    bumpMap: textures.shellBump,
    bumpScale: 0.015,
    roughness: 0.64,
    metalness: 0.02,
  });

  const rimMat = new THREE.MeshPhysicalMaterial({
    color: isMother ? 0x2b5943 : 0x3b7d6b,
    roughness: 0.36,
    metalness: 0.05,
    clearcoat: 0.5,
  });

  const skinMat = new THREE.MeshStandardMaterial({
    map: textures.skinAlbedo,
    bumpMap: textures.skinAlbedo,
    bumpScale: 0.025,
    color: isMother ? 0x6f9e85 : 0x89bd9e,
    roughness: 0.52,
    metalness: 0.04,
  });

  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x091318,
    roughness: 0.04,
    metalness: 0.1,
    clearcoat: 1.0,
  });

  const irisMat = new THREE.MeshStandardMaterial({
    color: isMother ? 0xd97706 : 0x38bdf8,
    roughness: 0.3,
  });

  // 1. Primary Silhouette: Sculpted Tear-Drop Domed Carapace
  const shellGeo = new THREE.SphereGeometry(1.0, 36, 28, 0, Math.PI * 2, 0, Math.PI * 0.54);
  const sPos = shellGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const vx = sPos.getX(i);
    const vy = sPos.getY(i);
    const vz = sPos.getZ(i);
    // Taper gently toward the posterior pygal tip for anatomical sea turtle realism
    const rearTaper = vz < 0 ? 1.0 + vz * 0.16 : 1.0 - vz * 0.04;
    const dorsalKeel = Math.max(0, 1.0 - Math.abs(vx) * 2.5) * 0.05 * vy;
    sPos.setXYZ(i, vx * 0.88 * rearTaper, vy * 0.46 + dorsalKeel, vz * 1.2);
  }
  shellGeo.computeVertexNormals();

  const carapace = new THREE.Mesh(shellGeo, carapaceMat);
  carapace.position.y = 0.02;
  carapace.castShadow = true;
  carapace.receiveShadow = true;
  bodyGroup.add(carapace);

  // 2. Sculpted Marginal Scute Rim Ridge
  const rimGeo = new THREE.TorusGeometry(0.95, 0.065, 14, 40);
  rimGeo.rotateX(Math.PI / 2);
  rimGeo.scale(0.9, 1.0, 1.21);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = 0.03;
  rimMesh.castShadow = true;
  bodyGroup.add(rimMesh);

  // 3. Plastron (Underbelly plate)
  const plastronGeo = new THREE.SphereGeometry(
    0.94,
    28,
    18,
    0,
    Math.PI * 2,
    Math.PI * 0.5,
    Math.PI * 0.5
  );
  plastronGeo.scale(0.84, 0.25, 1.12);
  const plastron = new THREE.Mesh(plastronGeo, plastronMat);
  plastron.position.y = 0.02;
  plastron.receiveShadow = true;
  bodyGroup.add(plastron);

  // 4, 5, 6. Head, Articulated Grazing Beak, Brow Ridges & Glossy Eyes
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.12, 1.22);
  bodyGroup.add(headGroup);

  const neckGeo = new THREE.CapsuleGeometry(0.18, 0.22, 8, 14);
  neckGeo.rotateX(Math.PI / 2);
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.set(0, -0.02, -0.08);
  headGroup.add(neckMesh);

  const craniumGeo = new THREE.SphereGeometry(0.24, 22, 20);
  craniumGeo.scale(0.88, 0.82, 1.25);
  const cranium = new THREE.Mesh(craniumGeo, skinMat);
  cranium.position.set(0, 0.03, 0.16);
  cranium.castShadow = true;
  headGroup.add(cranium);

  const beakGeo = new THREE.ConeGeometry(0.14, 0.22, 14);
  beakGeo.rotateX(Math.PI * 0.55);
  const beakMesh = new THREE.Mesh(beakGeo, plastronMat);
  beakMesh.position.set(0, -0.01, 0.36);
  headGroup.add(beakMesh);

  const eyeRadius = isMother ? 0.054 : 0.068;
  const eyeGeo = new THREE.SphereGeometry(eyeRadius, 14, 14);
  const irisGeo = new THREE.RingGeometry(eyeRadius * 0.55, eyeRadius * 0.92, 16);

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.16, 0.08, 0.24);
    headGroup.add(eye);

    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(side * 0.19, 0.08, 0.26);
    iris.rotation.y = side * 1.1;
    headGroup.add(iris);

    // Expressive upper eyelid scute
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(eyeRadius * 1.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      rimMat
    );
    lid.position.set(side * 0.16, 0.09, 0.24);
    lid.rotation.z = -side * 0.25;
    headGroup.add(lid);
  });

  // 7 & 8. Hydrofoil Front Flippers with Phalangeal Scale Plates
  const buildFrontFlipper = (isLeft: boolean): THREE.Group => {
    const pivot = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.45, 0.22, 1.15, 0.08);
    shape.quadraticCurveTo(1.42, 0.0, 1.48, -0.12);
    shape.quadraticCurveTo(1.1, -0.28, 0.45, -0.22);
    shape.quadraticCurveTo(0.15, -0.18, 0, 0);

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
    });
    extrudeGeo.rotateX(Math.PI / 2);
    if (isLeft) {
      extrudeGeo.scale(-1, 1, 1);
      extrudeGeo.computeVertexNormals();
    }

    const flipperMesh = new THREE.Mesh(extrudeGeo, skinMat);
    flipperMesh.castShadow = true;
    flipperMesh.receiveShadow = true;
    pivot.add(flipperMesh);

    // Individual large leading-edge scute scales
    const dir = isLeft ? -1 : 1;
    for (let s = 0; s < 5; s++) {
      const scute = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.09), rimMat);
      scute.position.set(dir * (0.28 + s * 0.22), 0.015, 0.11 - s * 0.02);
      scute.rotation.y = dir * -0.15;
      pivot.add(scute);
    }

    pivot.position.set(isLeft ? -0.72 : 0.72, 0.02, 0.68);
    return pivot;
  };

  const frontLeftFlipper = buildFrontFlipper(true);
  const frontRightFlipper = buildFrontFlipper(false);
  bodyGroup.add(frontLeftFlipper, frontRightFlipper);

  // 9 & 10. Rudder Hind Flippers
  const buildBackFlipper = (isLeft: boolean): THREE.Group => {
    const pivot = new THREE.Group();
    const paddleGeo = new THREE.SphereGeometry(0.32, 14, 12);
    paddleGeo.scale(1.15, 0.16, 0.65);
    const mesh = new THREE.Mesh(paddleGeo, skinMat);
    mesh.position.set(isLeft ? -0.24 : 0.24, 0, -0.14);
    mesh.rotation.y = isLeft ? 0.45 : -0.45;
    mesh.castShadow = true;
    pivot.add(mesh);
    pivot.position.set(isLeft ? -0.52 : 0.52, -0.02, -0.88);
    return pivot;
  };

  const backLeftFlipper = buildBackFlipper(true);
  const backRightFlipper = buildBackFlipper(false);
  bodyGroup.add(backLeftFlipper, backRightFlipper);

  // 11. Tail Accent
  const tailGeo = new THREE.ConeGeometry(0.09, 0.28, 10);
  tailGeo.rotateX(-Math.PI / 2);
  const tailMesh = new THREE.Mesh(tailGeo, skinMat);
  tailMesh.position.set(0, -0.02, -1.16);
  bodyGroup.add(tailMesh);

  // 12. Harmonic Call Ripple Ring
  const rippleGeo = new THREE.RingGeometry(0.9, 1.15, 36);
  rippleGeo.rotateX(-Math.PI / 2);
  const callRippleMat = new THREE.MeshBasicMaterial({
    color: isMother ? 0x5eead4 : 0xfde047,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const callRippleMesh = new THREE.Mesh(rippleGeo, callRippleMat);
  callRippleMesh.position.y = 0.08;
  root.add(callRippleMesh);

  return {
    group: root,
    bodyGroup,
    headGroup,
    beakMesh,
    frontLeftFlipper,
    frontRightFlipper,
    backLeftFlipper,
    backRightFlipper,
    tailMesh,
    callRippleMesh,
    callRippleMat,
  };
}

export interface EdibleSeaweedPatch {
  id: string;
  position: THREE.Vector3;
  group: THREE.Group;
  bladesGroup: THREE.Group;
  tenderBuds: THREE.Mesh;
  amountRemaining: number;
  munchAnimTimer: number;
}

/**
 * Multi-Part Textured Edible Sea-Lettuce & Ribbon Kelp Patch for Turtles to Munch
 */
const NEAR_CAMERA_FADE_GLSL = `
  {
    // Dissolve the parts of a leaf that sit right against the camera lens,
    // so a blade drifting through the view never fills the whole screen.
    float nearFade = smoothstep(1.6, 4.5, length(vViewPosition));
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (nearFade < ign) discard;
  }
`;

/** Adds the near-camera dissolve to a standard material's fragment shader source. */
export function withNearCameraFade(fragmentShader: string): string {
  return fragmentShader.replace(
    '#include <dithering_fragment>',
    NEAR_CAMERA_FADE_GLSL + '#include <dithering_fragment>'
  );
}

export function createEdibleSeaweedPatch(
  id: string,
  x: number,
  y: number,
  z: number,
  textures: OceanTextureLibrary
): EdibleSeaweedPatch {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.85,
    metalness: 0.05,
  });
  const holdfast = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 1), rockMat);
  holdfast.scale.set(1.3, 0.45, 1.2);
  holdfast.position.y = 0.15;
  group.add(holdfast);

  const bladesGroup = new THREE.Group();
  bladesGroup.position.y = 0.2;
  group.add(bladesGroup);

  const leafMat = new THREE.MeshStandardMaterial({
    map: textures.kelpAlbedo,
    bumpMap: textures.kelpBump,
    bumpScale: 0.04,
    color: 0x34d399,
    roughness: 0.42,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  leafMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = withNearCameraFade(shader.fragmentShader);
  };

  const frondShape = new THREE.Shape();
  frondShape.moveTo(0, 0);
  frondShape.quadraticCurveTo(0.32, 0.7, 0.24, 1.5);
  frondShape.quadraticCurveTo(0.15, 2.2, 0.0, 2.65);
  frondShape.quadraticCurveTo(-0.15, 2.2, -0.24, 1.5);
  frondShape.quadraticCurveTo(-0.32, 0.7, 0, 0);

  const frondGeo = new THREE.ShapeGeometry(frondShape, 12);
  const posAttr = frondGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const waveZ = Math.sin(vy * 3.8 + vx * 4.0) * 0.14;
    posAttr.setZ(i, waveZ);
  }
  frondGeo.computeVertexNormals();

  for (let f = 0; f < 7; f++) {
    const angle = (f / 7) * Math.PI * 2;
    const radius = f === 0 ? 0 : 0.28;
    const frond = new THREE.Mesh(frondGeo, leafMat);
    frond.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    frond.rotation.y = angle + 0.4;
    frond.rotation.x = f === 0 ? 0 : 0.18;
    const s = 0.75 + (f % 3) * 0.2;
    frond.scale.setScalar(s);
    frond.castShadow = true;
    bladesGroup.add(frond);
  }

  const budMat = new THREE.MeshPhysicalMaterial({
    color: 0xa3e635,
    emissive: 0x4d7c0f,
    emissiveIntensity: 0.55,
    roughness: 0.2,
    clearcoat: 0.9,
  });
  const tenderBuds = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), budMat);
  tenderBuds.position.y = 2.15;
  bladesGroup.add(tenderBuds);

  return {
    id,
    position: new THREE.Vector3(x, y, z),
    group,
    bladesGroup,
    tenderBuds,
    amountRemaining: 1.0,
    munchAnimTimer: 0,
  };
}

export interface CollectibleObject3D {
  item: CollectibleItem;
  group: THREE.Group;
  lidPivot?: THREE.Group;
  glowCore: THREE.Mesh;
  openProgress: number;
  fadeProgress: number; // 0 = fully visible, 1 = completely faded away after discovery
  baseY: number;
  materials: THREE.Material[];
}

/**
 * High-Realism Collectible Builder (Ornate Brass-Riveted Treasure Chests, Ribbed Nautilus/Conch Shells,
 * Fluted Tridacna Giant Clams with Levitating Pearls, & Ancient Relics) with Smooth Fade-Out Support!
 */
export function createCollectibleModel(
  item: CollectibleItem,
  textures: OceanTextureLibrary,
  groundY: number
): CollectibleObject3D {
  const group = new THREE.Group();
  group.position.set(item.position[0], groundY, item.position[2]);
  group.userData = { collectibleId: item.id };

  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.radialShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.52,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  group.add(shadowPlane);

  const glowMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(item.accentColor),
    emissive: new THREE.Color(item.accentColor),
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.12,
    clearcoat: 1.0,
    iridescence: 0.75,
  });

  let lidPivot: THREE.Group | undefined;
  let glowCore: THREE.Mesh;

  if (item.category === 'treasure_chest') {
    const woodMat = new THREE.MeshStandardMaterial({
      map: textures.woodAlbedo,
      bumpMap: textures.woodAlbedo,
      bumpScale: 0.03,
      roughness: 0.72,
      metalness: 0.08,
    });
    const brassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9a441,
      roughness: 0.22,
      metalness: 0.9,
      clearcoat: 0.6,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.78,
    });

    // 1. Bevelled Oak Chest Base Box with plank groove details
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.78, 1.08), woodMat);
    baseMesh.position.y = 0.39;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Dark velvet coffer lining inside
    const velvetLiningMat = new THREE.MeshStandardMaterial({
      color: 0x831843,
      roughness: 0.92,
    });
    const lining = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.68, 0.92), velvetLiningMat);
    lining.position.y = 0.42;
    group.add(lining);

    // 2. Heavy Forged Iron Corner Brackets & Center Straps with 3D Bolt Heads
    [-0.72, 0, 0.72].forEach((xOff) => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.82, 1.12), brassMat);
      strap.position.set(xOff, 0.39, 0);
      group.add(strap);

      // Rivet studs along front and back of each strap
      [0.18, 0.42, 0.68].forEach((yRivet) => {
        [-0.56, 0.56].forEach((zRivet) => {
          const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), ironMat);
          rivet.position.set(xOff, yRivet, zRivet);
          group.add(rivet);
        });
      });
    });

    // 3. Side Forged Iron Carrying Ring Handles
    [-0.85, 0.85].forEach((xSide) => {
      const handlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.22), ironMat);
      handlePlate.position.set(xSide, 0.48, 0);
      const handleRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 16), ironMat);
      handleRing.rotation.y = Math.PI / 2;
      handleRing.position.set(xSide, 0.44, 0);
      group.add(handlePlate, handleRing);
    });

    // 4. Ornate Front Escutcheon Lockplate, Hasp & Skull Keyhole
    const lockplate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.08), brassMat);
    lockplate.position.set(0, 0.58, 0.56);
    const keyhole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.1, 8), ironMat);
    keyhole.rotation.x = Math.PI / 2;
    keyhole.position.set(0, 0.54, 0.58);
    group.add(lockplate, keyhole);

    // 5. Overflowing Hoard of Gold Doubloons, Faceted Gemstones & Pearl Necklaces
    const coinMat = new THREE.MeshPhysicalMaterial({
      color: 0xfacc15,
      emissive: 0xb45309,
      emissiveIntensity: 0.38,
      roughness: 0.16,
      metalness: 0.95,
      clearcoat: 0.85,
    });
    const coinBed = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.26, 20), coinMat);
    coinBed.scale.set(1.15, 1, 0.72);
    coinBed.position.set(0, 0.7, 0);
    group.add(coinBed);

    // Multi-colored precious cut gemstones
    const gemColors = [0xef4444, 0x3b82f6, 0x10b981, 0xa855f7];
    for (let g = 0; g < 8; g++) {
      const gemMat = new THREE.MeshPhysicalMaterial({
        color: gemColors[g % gemColors.length],
        emissive: gemColors[g % gemColors.length],
        emissiveIntensity: 0.3,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.7,
        clearcoat: 1.0,
      });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 1), gemMat);
      const ga = (g / 8) * Math.PI * 2;
      gem.position.set(Math.cos(ga) * 0.42, 0.84, Math.sin(ga) * 0.26);
      gem.rotation.set(g, ga, g * 0.5);
      group.add(gem);
    }

    // Spilling string of ivory pearl beads draped over the coffer rim
    const pearlMat = new THREE.MeshPhysicalMaterial({
      color: 0xfffbeb,
      roughness: 0.15,
      metalness: 0.1,
      clearcoat: 1.0,
      iridescence: 0.85,
    });
    for (let p = 0; p < 14; p++) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 10), pearlMat);
      const curveT = p / 13;
      const bx = 0.35 + curveT * 0.25;
      const by = 0.82 - Math.sin(curveT * Math.PI) * 0.18 - curveT * 0.22;
      const bz = 0.48 + curveT * 0.14;
      bead.position.set(bx, by, bz);
      group.add(bead);
    }

    // 6. Central Glowing Treasure Gem
    glowCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 2), glowMat);
    glowCore.position.set(0, 0.98, 0);
    group.add(glowCore);

    // 7. Hinged Domed Coffer Lid with Brass Ribs & Rivets
    lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.78, -0.54);
    group.add(lidPivot);

    const lidCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.54, 1.64, 20, 1, false, 0, Math.PI),
      woodMat
    );
    lidCylinder.rotation.z = Math.PI / 2;
    lidCylinder.position.set(0, 0, 0.54);
    lidCylinder.castShadow = true;
    lidPivot.add(lidCylinder);

    [-0.72, 0, 0.72].forEach((xOff) => {
      const lidBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.565, 0.565, 0.12, 20, 1, false, 0, Math.PI),
        brassMat
      );
      lidBand.rotation.z = Math.PI / 2;
      lidBand.position.set(xOff, 0, 0.54);
      lidPivot!.add(lidBand);
    });
  } else if (item.category === 'seashell') {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.85,
      metalness: 0.05,
    });
    const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), rockMat);
    baseRock.scale.set(1.3, 0.44, 1.2);
    baseRock.position.y = 0.18;
    group.add(baseRock);

    const shellGroup = new THREE.Group();
    shellGroup.position.y = 0.72;
    group.add(shellGroup);

    // Sculpted Ribbed Queen Conch with Stepped Spire & Iridescent Porcelain Flared Lip
    const conchMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff1f2,
      roughness: 0.22,
      metalness: 0.05,
      clearcoat: 0.95,
      iridescence: 0.85,
    });
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const rib = Math.sin(t * Math.PI * 14) * 0.032;
      const r = Math.sin(t * Math.PI) * 0.44 * (1 - t * 0.32) + 0.05 + rib;
      points.push(new THREE.Vector2(r, (t - 0.5) * 1.08));
    }
    const latheShell = new THREE.Mesh(new THREE.LatheGeometry(points, 32), conchMat);
    latheShell.rotation.z = Math.PI * 0.35;
    latheShell.castShadow = true;
    shellGroup.add(latheShell);

    // Whorl crown spires along apex
    for (let w = 0; w < 6; w++) {
      const wa = (w / 6) * Math.PI * 2;
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 8), conchMat);
      spine.position.set(Math.cos(wa) * 0.26, 0.12, Math.sin(wa) * 0.26);
      spine.rotation.z = Math.cos(wa) * 0.85;
      spine.rotation.x = Math.sin(wa) * 0.85;
      shellGroup.add(spine);
    }

    // Flared rosy-pink aperture mouth lip
    const apertureLip = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.08, 14, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xfecdd3,
        emissive: 0xf43f5e,
        emissiveIntensity: 0.22,
        roughness: 0.1,
        clearcoat: 1.0,
        iridescence: 0.95,
      })
    );
    apertureLip.scale.set(1.4, 0.8, 1.0);
    apertureLip.rotation.x = Math.PI * 0.25;
    apertureLip.position.set(0.12, -0.06, 0.18);
    shellGroup.add(apertureLip);

    glowCore = latheShell;
  } else if (item.category === 'glowing_pearl') {
    // Realistic Fluted Giant Tridacna Gigas Clam with Radiating Corrugations & Iridescent Mantle
    const clamMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.54,
      metalness: 0.08,
    });
    const mantleMat = new THREE.MeshPhysicalMaterial({
      color: item.accentColor,
      emissive: item.accentColor,
      emissiveIntensity: 0.35,
      roughness: 0.22,
      clearcoat: 0.95,
      iridescence: 0.9,
    });

    const buildFlutedValve = (isTop: boolean): THREE.Mesh => {
      const geo = new THREE.SphereGeometry(
        0.85,
        32,
        22,
        0,
        Math.PI * 2,
        isTop ? 0 : Math.PI * 0.5,
        Math.PI * 0.5
      );
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const angle = Math.atan2(vz, vx);
        const flute = Math.sin(angle * 10) * 0.07;
        pos.setXYZ(i, vx * (1.32 + flute), vy * 0.54, vz * (0.98 + flute));
      }
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, clamMat);
    };

    const bottomValve = buildFlutedValve(false);
    bottomValve.position.y = 0.42;
    group.add(bottomValve);

    const topValve = buildFlutedValve(true);
    topValve.position.set(0, 0.62, -0.38);
    topValve.rotation.x = -0.82;
    group.add(topValve);

    // Deep turquoise velvet mantle with papillae dots
    const velvetMantle = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.14, 14, 32), mantleMat);
    velvetMantle.rotation.x = Math.PI / 2;
    velvetMantle.scale.set(1.24, 0.88, 1);
    velvetMantle.position.y = 0.48;
    group.add(velvetMantle);

    // Massive lustrous orient pearl resting on an oyster cushion
    glowCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xfffbeb,
        emissive: new THREE.Color(item.accentColor),
        emissiveIntensity: 0.6,
        roughness: 0.06,
        metalness: 0.08,
        clearcoat: 1.0,
        iridescence: 1.0,
      })
    );
    glowCore.position.set(0, 0.72, 0.08);
    group.add(glowCore);
  } else {
    // Ancient Greco-Roman Terracotta Amphora Vase with Verdigris Bronze Fittings
    const potteryMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.76,
      metalness: 0.04,
    });
    const bronzeMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d9488,
      roughness: 0.38,
      metalness: 0.82,
      clearcoat: 0.45,
    });

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.72, 0.45, 16), potteryMat);
    pedestal.position.y = 0.22;
    group.add(pedestal);

    const amphoraGroup = new THREE.Group();
    amphoraGroup.position.y = 0.95;
    group.add(amphoraGroup);

    // Sculpted Ovoid Terracotta Body with Tapered Neck & Lip
    const amphoraPoints: THREE.Vector2[] = [];
    amphoraPoints.push(new THREE.Vector2(0.12, -0.5));
    amphoraPoints.push(new THREE.Vector2(0.28, -0.4));
    amphoraPoints.push(new THREE.Vector2(0.46, -0.1));
    amphoraPoints.push(new THREE.Vector2(0.48, 0.15));
    amphoraPoints.push(new THREE.Vector2(0.32, 0.4));
    amphoraPoints.push(new THREE.Vector2(0.18, 0.55));
    amphoraPoints.push(new THREE.Vector2(0.24, 0.62));
    amphoraPoints.push(new THREE.Vector2(0.16, 0.62));
    const amphoraMesh = new THREE.Mesh(new THREE.LatheGeometry(amphoraPoints, 24), potteryMat);
    amphoraMesh.castShadow = true;
    amphoraGroup.add(amphoraMesh);

    // Twin Arched Clay Handles
    [-1, 1].forEach((side) => {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 16, Math.PI), potteryMat);
      handle.position.set(side * 0.38, 0.26, 0);
      handle.rotation.z = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      amphoraGroup.add(handle);
    });

    // Verdigris bronze ornamental shoulder band
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 10, 24), bronzeMat);
    collar.position.y = 0.38;
    collar.rotation.x = Math.PI / 2;
    amphoraGroup.add(collar);

    // Glowing ancient relic crystal hovering inside the amphora neck
    glowCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 2), glowMat);
    glowCore.position.set(0, 0.72, 0);
    amphoraGroup.add(glowCore);
  }

  // Collect all unique materials on this collectible so we can smoothly fade its opacity to 0 on discovery!
  const materialsSet = new Set<THREE.Material>();
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.userData = { collectibleId: item.id };
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => materialsSet.add(m));
      } else if (mesh.material) {
        materialsSet.add(mesh.material);
      }
    }
  });
  const materials = Array.from(materialsSet);

  return {
    item,
    group,
    lidPivot,
    glowCore,
    openProgress: item.discovered ? 1 : 0,
    fadeProgress: item.discovered ? 1 : 0,
    baseY: groundY,
    materials,
  };
}

/**
 * Helper to smoothly fade a discovered treasure out and hide it once completely faded
 */
export function updateCollectibleFade(cObj: CollectibleObject3D, opacity: number) {
  if (opacity <= 0.01) {
    cObj.group.visible = false;
    return;
  }
  cObj.group.visible = true;
  cObj.materials.forEach((mat) => {
    mat.transparent = true;
    mat.opacity = opacity;
  });
}

/**
 * Next-Level Realistic 18-Part Sunken Galleon Shipwreck:
 * - Curved hull strakes & keel spine
 * - Planked main deck with cargo hatch coaming & iron grating
 * - Elevated stern castle with bevelled gallery windows & warm interior lantern glow
 * - Quarterdeck carved wooden balustrade railings
 * - 4 Naval Bronze Cannons on wooden gun carriages
 * - 8-Spoke Brass & Teak Ship's Helm Wheel + Binnacle Compass
 * - Foremast & Mainmast with Crow's Nest Lookout, Rope Shroud Rigging, & Tattered Sails
 * - Multi-fluke Admiralty Iron Anchor + Anchor Chain & Living Coral Encrustations
 */
export function createShipwreck(
  position: [number, number, number],
  rotY: number,
  scale: number,
  textures: OceanTextureLibrary
): THREE.Group {
  const wreck = new THREE.Group();
  wreck.position.set(position[0], position[1], position[2]);
  wreck.rotation.y = rotY;
  wreck.rotation.z = 0.14; // Realistic resting list on the seabed
  wreck.scale.setScalar(scale);

  const hullMat = new THREE.MeshStandardMaterial({
    map: textures.woodAlbedo,
    bumpMap: textures.woodAlbedo,
    bumpScale: 0.045,
    roughness: 0.78,
    metalness: 0.06,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x264638,
    roughness: 0.62,
    metalness: 0.15,
  });
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xc8963e,
    roughness: 0.28,
    metalness: 0.86,
    clearcoat: 0.5,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.8,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xd6cfc2,
    roughness: 0.88,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.74,
  });

  // 1. Heavy Keel Spine, Curved Stempost (Bow) & Sternpost with Rudder
  const keel = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 15.2), hullMat);
  keel.position.y = 0.45;
  keel.castShadow = true;
  keel.receiveShadow = true;
  wreck.add(keel);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.6, 1.45), trimMat);
  rudder.position.set(0, 2.1, -8.1);
  rudder.rotation.y = 0.28; // Turned rudder blade
  wreck.add(rudder);

  // 2. Contoured Timber Hull Ribs & Plank Strakes (9 rib stations + outer hull strake bands)
  for (let i = -4; i <= 4; i++) {
    const zPos = i * 1.65;
    const widthFactor = 1.0 - Math.pow(Math.abs(i) / 4.8, 1.8) * 0.48;

    [-1, 1].forEach((side) => {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(2.55 * widthFactor, 0.17, 10, 18, Math.PI * 0.58),
        hullMat
      );
      rib.position.set(side * 0.35, 2.35, zPos);
      rib.rotation.z = side === 1 ? -Math.PI * 0.46 : -Math.PI * 0.08;
      rib.castShadow = true;
      wreck.add(rib);

      // Outer longitudinal hull plank strakes (with swim-through breaches midship)
      if (Math.abs(i) !== 1) {
        const strake = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 1.15, 1.72),
          i % 2 === 0 ? hullMat : trimMat
        );
        strake.position.set(side * 2.55 * widthFactor, 1.9, zPos);
        strake.rotation.z = side * -0.22;
        strake.castShadow = true;
        wreck.add(strake);
      }
    });
  }

  // 3. Planked Main Deck, Cargo Hatch Coaming & Forecastle Deck
  const foreDeck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.24, 4.8), hullMat);
  foreDeck.position.set(0, 2.65, 4.4);
  foreDeck.receiveShadow = true;
  wreck.add(foreDeck);

  const aftDeck = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.24, 4.6), hullMat);
  aftDeck.position.set(0, 2.65, -2.6);
  aftDeck.receiveShadow = true;
  wreck.add(aftDeck);

  // Midship Cargo Hatch Frame
  const hatchFrame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.38, 2.4), trimMat);
  hatchFrame.position.set(0, 2.75, 1.1);
  wreck.add(hatchFrame);

  // 4. Four Bronze Naval Cannons on Wooden Gun Carriages (2 Port, 2 Starboard)
  [
    [-1.85, 3.6, -1],
    [1.85, 3.6, 1],
    [-1.95, -1.8, -1],
    [1.95, -1.8, 1],
  ].forEach(([cx, cz, sideDir]) => {
    const cannonGroup = new THREE.Group();
    cannonGroup.position.set(cx, 2.78, cz);
    cannonGroup.rotation.y = sideDir === 1 ? Math.PI / 2 : -Math.PI / 2;

    const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.95), trimMat);
    carriage.position.y = 0.16;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 1.35, 12),
      ironMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.36, 0.2);
    cannonGroup.add(carriage, barrel);
    wreck.add(cannonGroup);
  });

  // 5. Elevated Stern Captain's Cabin, Quarterdeck Balustrade & Bevelled Gallery Windows
  const sternCabin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.3, 4.2), hullMat);
  sternCabin.position.set(0, 2.55, -5.9);
  sternCabin.castShadow = true;
  wreck.add(sternCabin);

  // Quarterdeck carved wooden balustrade railings
  for (let b = -4; b <= 4; b++) {
    const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 8), trimMat);
    baluster.position.set(b * 0.48, 4.55, -3.85);
    wreck.add(baluster);
  }
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.16), brassMat);
  topRail.position.set(0, 4.92, -3.85);
  wreck.add(topRail);

  // Stern Gallery Multi-Paned Windows with Brass Mullions
  for (let w = -1; w <= 1; w++) {
    const windowGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 1.18, 0.16),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.75,
        roughness: 0.18,
      })
    );
    windowGlow.position.set(w * 1.18, 2.85, -8.02);
    wreck.add(windowGlow);

    const brassFrame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.28, 0.12), brassMat);
    brassFrame.position.set(w * 1.18, 2.85, -8.0);
    wreck.add(brassFrame);
  }

  // 6. Bowsprit Spar & Carved Sea-Nymph / Scroll Figurehead at Bow
  const bowHull = new THREE.Mesh(new THREE.ConeGeometry(2.65, 5.4, 12, 1, true), hullMat);
  bowHull.rotation.x = Math.PI / 2;
  bowHull.scale.set(1.0, 1.0, 0.76);
  bowHull.position.set(0, 1.9, 6.4);
  wreck.add(bowHull);

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 6.8, 12), trimMat);
  bowsprit.rotation.x = Math.PI * 0.34;
  bowsprit.position.set(0, 3.25, 9.4);
  wreck.add(bowsprit);

  const figurehead = new THREE.Mesh(new THREE.TorusKnotGeometry(0.32, 0.09, 32, 8), brassMat);
  figurehead.position.set(0, 2.55, 8.2);
  wreck.add(figurehead);

  // 7. Masts, Crow's Nest Lookout Basket, Rope Shroud Rigging, & Billowed Tattered Sails
  [
    { z: 2.4, h: 10.8, hasCrowsNest: true },
    { z: -2.4, h: 12.2, hasCrowsNest: false },
  ].forEach((mastCfg, idx) => {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.36, mastCfg.h, 14),
      hullMat
    );
    mast.position.set(0, mastCfg.h * 0.5 + 0.5, mastCfg.z);
    mast.castShadow = true;
    wreck.add(mast);

    if (mastCfg.hasCrowsNest) {
      const basket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.48, 0.75, 14),
        trimMat
      );
      basket.position.set(0, mastCfg.h * 0.82, mastCfg.z);
      wreck.add(basket);
    }

    // Rope shroud stays down to port and starboard gunwales
    [-1, 1].forEach((side) => {
      const shroud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, mastCfg.h * 0.78, 6),
        trimMat
      );
      shroud.position.set(side * 1.15, mastCfg.h * 0.42, mastCfg.z);
      shroud.rotation.z = side * 0.24;
      wreck.add(shroud);
    });

    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 7.2, 12), trimMat);
    yard.rotation.z = Math.PI / 2;
    yard.rotation.y = idx === 0 ? 0.22 : -0.18;
    yard.position.set(0, mastCfg.h * 0.7, mastCfg.z);
    wreck.add(yard);

    // Curved billowed sail geometry
    const sailGeo = new THREE.PlaneGeometry(5.8, 3.4, 12, 8);
    const sAttr = sailGeo.attributes.position;
    for (let s = 0; s < sAttr.count; s++) {
      const sx = sAttr.getX(s);
      const sy = sAttr.getY(s);
      const billow = Math.cos((sx / 5.8) * Math.PI) * Math.cos((sy / 3.4) * Math.PI) * 0.55;
      sAttr.setZ(s, billow);
    }
    sailGeo.computeVertexNormals();

    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0, mastCfg.h * 0.7 - 1.75, mastCfg.z + 0.18);
    sail.rotation.y = idx === 0 ? 0.22 : -0.18;
    wreck.add(sail);
  });

  // 8. Detailed 8-Spoke Ship's Helm Wheel & Brass Binnacle Compass on Quarterdeck
  const helmGroup = new THREE.Group();
  helmGroup.position.set(0, 4.65, -4.35);
  wreck.add(helmGroup);

  const helmStand = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.28), hullMat);
  helmStand.position.y = -0.35;
  const helmRim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.065, 10, 24), brassMat);
  helmGroup.add(helmStand, helmRim);

  for (let sp = 0; sp < 8; sp++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.55, 8), hullMat);
    spoke.rotation.z = (sp * Math.PI) / 4;
    helmGroup.add(spoke);
  }

  // 9. Multi-Fluke Admiralty Iron Anchor & Chain Links at Bow
  const anchorGroup = new THREE.Group();
  anchorGroup.position.set(2.45, 0.85, 6.9);
  anchorGroup.rotation.z = 0.45;
  const anchorShank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 10), ironMat);
  const anchorCrown = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.13, 10, 18, Math.PI),
    ironMat
  );
  anchorCrown.rotation.z = Math.PI;
  anchorCrown.position.y = -0.25;
  anchorGroup.add(anchorShank, anchorCrown);
  wreck.add(anchorGroup);

  // 10. Living Coral & Sea Fan Encrustations growing on the sunken hull
  const coralColors = [0xf43f5e, 0xfb923c, 0x2dd4bf, 0xc084fc];
  for (let c = 0; c < 8; c++) {
    const coralCluster = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.45 + (c % 3) * 0.18, 1),
      new THREE.MeshStandardMaterial({
        color: coralColors[c % coralColors.length],
        roughness: 0.5,
      })
    );
    coralCluster.position.set(
      (c % 2 === 0 ? 1 : -1) * (1.8 + (c % 3) * 0.3),
      1.2 + (c % 4) * 0.55,
      -5.0 + c * 1.45
    );
    wreck.add(coralCluster);
  }

  return wreck;
}

/**
 * 8-Part Tropical Coconut Palm Tree
 */
export function createCoconutPalm(
  x: number,
  y: number,
  z: number,
  height: number,
  leanAngle: number,
  leanDir: number,
  textures: OceanTextureLibrary
): THREE.Group {
  const palm = new THREE.Group();
  palm.position.set(x, y, z);
  palm.rotation.y = leanDir;

  const trunkMat = new THREE.MeshStandardMaterial({
    map: textures.barkAlbedo,
    bumpMap: textures.barkAlbedo,
    bumpScale: 0.04,
    roughness: 0.84,
    metalness: 0.04,
  });
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0x2e7d32,
    roughness: 0.48,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  const coconutMat = new THREE.MeshStandardMaterial({
    color: 0x4e342e,
    roughness: 0.45,
    metalness: 0.08,
  });

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(Math.sin(leanAngle) * height * 0.35, height * 0.45, 0),
    new THREE.Vector3(Math.sin(leanAngle) * height * 0.82, height * 0.85, 0),
    new THREE.Vector3(Math.sin(leanAngle) * height, height, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 18, 0.24, 12, false);
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  palm.add(trunkMesh);

  const crown = new THREE.Group();
  crown.position.set(Math.sin(leanAngle) * height, height, 0);
  palm.add(crown);

  for (let c = 0; c < 4; c++) {
    const a = (c * Math.PI) / 2;
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), coconutMat);
    nut.scale.set(0.9, 1.15, 0.9);
    nut.position.set(Math.cos(a) * 0.28, -0.18, Math.sin(a) * 0.28);
    crown.add(nut);
  }

  const frondShape = new THREE.Shape();
  frondShape.moveTo(0, 0);
  frondShape.quadraticCurveTo(1.2, 0.45, 2.8, 0.12);
  frondShape.lineTo(3.2, 0);
  frondShape.lineTo(2.8, -0.12);
  frondShape.quadraticCurveTo(1.2, -0.45, 0, 0);

  const frondGeo = new THREE.ShapeGeometry(frondShape, 12);
  const posAttr = frondGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const drop =
      Math.sin((vx / 3.2) * Math.PI * 0.65) * 0.55 - (vx / 3.2) * (vx / 3.2) * 0.85;
    posAttr.setXYZ(i, vx, drop, vy);
  }
  frondGeo.computeVertexNormals();

  for (let f = 0; f < 9; f++) {
    const frondMesh = new THREE.Mesh(frondGeo, frondMat);
    frondMesh.rotation.y = (f / 9) * Math.PI * 2;
    frondMesh.rotation.z = f % 2 === 0 ? 0.18 : -0.08;
    frondMesh.castShadow = true;
    crown.add(frondMesh);
  }

  return palm;
}

/**
 * Environmental Storytelling Landmark Monument Builder
 */
export function createStoryLandmarkModel(
  landmark: StoryLandmark,
  groundY: number,
  textures: OceanTextureLibrary
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(landmark.position[0], groundY, landmark.position[2]);

  if (landmark.id === 'landmark-coconut-nursery') {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3d1,
      roughness: 0.85,
      metalness: 0.05,
    });
    const towerMat = new THREE.MeshStandardMaterial({
      map: textures.lighthouseAlbedo,
      roughness: 0.55,
      metalness: 0.05,
    });
    const copperRoofMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d9488,
      roughness: 0.35,
      metalness: 0.55,
      clearcoat: 0.4,
    });
    const lanternGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.95,
      roughness: 0.1,
      clearcoat: 1.0,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      map: textures.woodAlbedo,
      roughness: 0.78,
    });
    const thatchMat = new THREE.MeshStandardMaterial({
      color: 0xc29b61,
      roughness: 0.9,
    });
    const eggMat = new THREE.MeshPhysicalMaterial({
      color: 0xfffbeb,
      roughness: 0.25,
      clearcoat: 0.6,
    });

    const lhGroup = new THREE.Group();
    lhGroup.position.set(-3.2, 0.2, 3.8);
    group.add(lhGroup);

    const foundation = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 2.1, 0.9, 8),
      stoneMat
    );
    foundation.position.y = 0.45;
    foundation.castShadow = true;
    foundation.receiveShadow = true;
    lhGroup.add(foundation);

    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.55, 6.2, 20),
      towerMat
    );
    tower.position.y = 3.9;
    tower.castShadow = true;
    tower.receiveShadow = true;
    lhGroup.add(tower);

    const galleryDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.25, 0.24, 20),
      stoneMat
    );
    galleryDeck.position.y = 7.05;
    lhGroup.add(galleryDeck);

    const railing = new THREE.Mesh(
      new THREE.TorusGeometry(1.28, 0.05, 8, 24),
      copperRoofMat
    );
    railing.rotation.x = Math.PI / 2;
    railing.position.y = 7.42;
    lhGroup.add(railing);

    const lanternRoom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.78, 1.25, 16),
      lanternGlassMat
    );
    lanternRoom.position.y = 7.75;
    lhGroup.add(lanternRoom);

    const cupola = new THREE.Mesh(new THREE.ConeGeometry(1.12, 1.15, 16), copperRoofMat);
    cupola.position.y = 8.9;
    cupola.castShadow = true;
    lhGroup.add(cupola);

    const spire = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), lanternGlassMat);
    spire.position.y = 9.55;
    lhGroup.add(spire);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.15, 0.2), woodMat);
    door.position.set(0, 1.4, -1.48);
    lhGroup.add(door);

    const pergolaGroup = new THREE.Group();
    pergolaGroup.position.set(1.8, 0, -0.4);
    group.add(pergolaGroup);

    [
      [-1.3, -1.1],
      [1.3, -1.1],
      [-1.3, 1.1],
      [1.3, 1.1],
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 10), woodMat);
      post.position.set(px, 1.1, pz);
      post.castShadow = true;
      pergolaGroup.add(post);
    });

    const thatchRoof = new THREE.Mesh(new THREE.ConeGeometry(2.25, 1.1, 4), thatchMat);
    thatchRoof.rotation.y = Math.PI / 4;
    thatchRoof.scale.set(1.15, 1, 0.95);
    thatchRoof.position.y = 2.65;
    thatchRoof.castShadow = true;
    pergolaGroup.add(thatchRoof);

    const nestRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.18, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0xe7c896, roughness: 0.88 })
    );
    nestRing.rotation.x = Math.PI / 2;
    nestRing.position.y = 0.14;
    pergolaGroup.add(nestRing);

    const eggOffsets = [
      [0, 0],
      [0.24, 0.12],
      [-0.24, 0.14],
      [0.18, -0.22],
      [-0.2, -0.2],
      [0.34, -0.08],
      [-0.04, 0.28],
    ];
    eggOffsets.forEach(([ex, ez], idx) => {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), eggMat);
      egg.scale.set(0.95, 1.12, 0.95);
      egg.position.set(ex, 0.22 + (idx === 0 ? 0.08 : 0), ez);
      egg.castShadow = true;
      pergolaGroup.add(egg);
    });

    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.3, 8), woodMat);
    signPost.position.set(-2.1, 0.65, -1.2);
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.1), woodMat);
    signBoard.position.set(-2.1, 1.15, -1.2);
    pergolaGroup.add(signPost, signBoard);

    return group;
  }

  const basaltMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.78,
    metalness: 0.12,
  });
  const jadeRuneMat = new THREE.MeshPhysicalMaterial({
    color: 0x2dd4bf,
    emissive: 0x0d9488,
    emissiveIntensity: 0.65,
    roughness: 0.22,
    clearcoat: 0.85,
  });
  const bronzeMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    roughness: 0.3,
    metalness: 0.82,
  });

  const baseStep1 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 0.45, 8), basaltMat);
  baseStep1.position.y = 0.22;
  const baseStep2 = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.65, 0.45, 8), basaltMat);
  baseStep2.position.y = 0.65;
  group.add(baseStep1, baseStep2);

  if (landmark.id === 'landmark-sanctuary-bell') {
    const leftCol = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.0, 10), basaltMat);
    leftCol.position.set(-1.1, 2.1, 0);
    const rightCol = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.0, 10), basaltMat);
    rightCol.position.set(1.1, 2.1, 0);
    const topArch = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.24, 10, 20, Math.PI),
      basaltMat
    );
    topArch.position.set(0, 3.5, 0);

    const bellCone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.58, 0.85, 16), bronzeMat);
    bellCone.position.set(0, 2.75, 0);
    const bellClapper = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), jadeRuneMat);
    bellClapper.position.set(0, 2.28, 0);
    group.add(leftCol, rightCol, topArch, bellCone, bellClapper);
  } else {
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 1.1, 8), basaltMat);
    pedestal.position.y = 1.4;
    group.add(pedestal);

    const statueGroup = new THREE.Group();
    statueGroup.position.y = 2.25;
    statueGroup.rotation.x = -0.25;
    group.add(statueGroup);

    const stoneShell = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 16), jadeRuneMat);
    stoneShell.scale.set(0.88, 0.42, 1.15);
    const stoneHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 14), basaltMat);
    stoneHead.position.set(0, 0.08, 1.18);
    const leftFlip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.38), basaltMat);
    leftFlip.position.set(-0.95, 0, 0.45);
    leftFlip.rotation.y = -0.35;
    const rightFlip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.38), basaltMat);
    rightFlip.position.set(0.95, 0, 0.45);
    rightFlip.rotation.y = 0.35;
    statueGroup.add(stoneShell, stoneHead, leftFlip, rightFlip);
  }

  return group;
}

export function createFriendshipHalo(): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const geo = new THREE.TorusGeometry(0.55, 0.06, 10, 24);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 1.45;
  return { mesh, mat };
}

export function createMantaRay(): {
  group: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  friendHaloMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.28,
    metalness: 0.12,
    clearcoat: 0.75,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.55,
  });

  const discBody = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 14), bodyMat);
  discBody.scale.set(1.1, 0.24, 1.45);
  group.add(discBody);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), bellyMat);
  belly.scale.set(1.05, 0.18, 1.38);
  belly.position.y = -0.06;
  group.add(belly);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.7);
  wingShape.quadraticCurveTo(1.4, 0.35, 2.35, -0.15);
  wingShape.quadraticCurveTo(1.2, -0.55, 0, -0.75);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, bodyMat);
  const leftGeo = wingGeo.clone().scale(-1, 1, 1);
  leftGeo.computeVertexNormals();
  const leftWing = new THREE.Mesh(leftGeo, bodyMat);

  group.add(leftWing, rightWing);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 2.1, 8), bodyMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0, -1.9);
  group.add(tail);

  const halo = createFriendshipHalo();
  halo.mesh.position.y = 0.85;
  group.add(halo.mesh);

  return { group, leftWing, rightWing, friendHaloMat: halo.mat };
}

export function createDolphin(): {
  group: THREE.Group;
  flukePivot: THREE.Group;
  friendHaloMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const dolphinMat = new THREE.MeshPhysicalMaterial({
    color: 0x64748b,
    roughness: 0.18,
    metalness: 0.12,
    clearcoat: 0.9,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.45,
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.35, 10, 18), dolphinMat);
  torso.rotation.x = Math.PI / 2;
  group.add(torso);

  const underbelly = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.2, 8, 14), bellyMat);
  underbelly.rotation.x = Math.PI / 2;
  underbelly.position.y = -0.07;
  group.add(underbelly);

  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.52, 12), dolphinMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.04, 1.1);
  group.add(snout);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8), dolphinMat);
  dorsal.scale.set(0.35, 1, 1.2);
  dorsal.rotation.x = -0.35;
  dorsal.position.set(0, 0.48, -0.1);
  group.add(dorsal);

  [-1, 1].forEach((side) => {
    const pec = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 8), dolphinMat);
    pec.scale.set(1, 0.25, 0.7);
    pec.rotation.z = side * 1.15;
    pec.position.set(side * 0.45, -0.18, 0.35);
    group.add(pec);
  });

  const flukePivot = new THREE.Group();
  flukePivot.position.set(0, 0, -1.05);
  group.add(flukePivot);

  const fluke = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), dolphinMat);
  fluke.scale.set(1.3, 0.12, 0.48);
  fluke.position.set(0, 0, -0.2);
  flukePivot.add(fluke);

  const halo = createFriendshipHalo();
  halo.mesh.position.y = 0.95;
  group.add(halo.mesh);

  return { group, flukePivot, friendHaloMat: halo.mat };
}

/**
 * Majestic Great Oceanic Humpback Whale
 * - Deep hydrodynamic arched cetacean body with rostral sensory tubercles
 * - Longitudinal ventral throat pleats / grooves expanding along the lower jaw & chest
 * - Raised double blowhole on crown of head that emits gentle mist spouts
 * - Long wing-like pectoral flippers (humpback megaptera wings) with white underbellies & tubercles
 * - Falcate dorsal fin atop the dorsal hump
 * - Caudal peduncle leading to broad horizontal double flukes that undulate vertically
 */
export function createGreatWhale(textures: OceanTextureLibrary): {
  group: THREE.Group;
  tailPivot: THREE.Group;
  blowholePivot: THREE.Group;
  friendHaloMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();

  const whaleMat = new THREE.MeshPhysicalMaterial({
    map: textures.whaleAlbedo,
    bumpMap: textures.whaleAlbedo,
    bumpScale: 0.04,
    color: 0x223344,
    roughness: 0.32,
    metalness: 0.08,
    clearcoat: 0.75,
  });

  const bellyPleatMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.55,
    metalness: 0.04,
  });

  const flipperMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.38,
    metalness: 0.06,
  });

  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    clearcoat: 1.0,
  });

  // 1. Sculpted Cetacean Torso with Arched Rostrum
  const torsoGeo = new THREE.CapsuleGeometry(1.28, 5.2, 16, 28);
  torsoGeo.rotateX(Math.PI / 2);
  const tPos = torsoGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const vx = tPos.getX(i);
    const vy = tPos.getY(i);
    const vz = tPos.getZ(i);
    // Deep chest and tapered tail stock
    const chestT = vz > 0 ? 1.0 + Math.sin((vz / 3.8) * Math.PI) * 0.28 : 1.0 + vz * 0.12;
    tPos.setXYZ(i, vx * chestT * 0.94, vy * chestT * 0.92, vz * 1.05);
  }
  torsoGeo.computeVertexNormals();

  const torso = new THREE.Mesh(torsoGeo, whaleMat);
  torso.castShadow = true;
  group.add(torso);

  // 2. Longitudinal Ventral Pleated Throat Pouch
  const throatGeo = new THREE.SphereGeometry(1.22, 24, 18, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5);
  throatGeo.scale(0.85, 0.42, 2.2);
  const throat = new THREE.Mesh(throatGeo, bellyPleatMat);
  throat.position.set(0, -0.68, 1.1);
  group.add(throat);

  // 3. Sensory Tubercles (Knobby nodules along rostrum & lower chin)
  for (let t = 0; t < 14; t++) {
    const tub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), whaleMat);
    const tz = 1.4 + (t % 7) * 0.38;
    const tx = (t < 7 ? -1 : 1) * (0.18 + (t % 7) * 0.05);
    tub.position.set(tx, 0.92 - (t % 7) * 0.04, tz);
    group.add(tub);
  }

  // 4. Double Blowhole & Misty Spout Mount on Crown of Head
  const blowholePivot = new THREE.Group();
  blowholePivot.position.set(0, 1.12, 1.45);
  group.add(blowholePivot);

  const blowholeRim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), whaleMat);
  blowholeRim.rotation.x = Math.PI / 2;
  blowholePivot.add(blowholeRim);

  // 5. Intelligent Glossy Cetacean Eyes
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), eyeMat);
    eye.position.set(side * 1.02, 0.14, 2.3);
    group.add(eye);
  });

  // 6. Massive Wing-Like Pectoral Flippers with Scalloped Tubercles
  const flipperShape = new THREE.Shape();
  flipperShape.moveTo(0, 0);
  flipperShape.quadraticCurveTo(0.65, 0.2, 2.45, -0.4);
  flipperShape.quadraticCurveTo(2.7, -0.65, 2.5, -0.85);
  flipperShape.quadraticCurveTo(1.4, -0.75, 0, -0.35);

  const flipperGeo = new THREE.ExtrudeGeometry(flipperShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
  });
  flipperGeo.rotateX(Math.PI / 2);

  [-1, 1].forEach((side) => {
    const geo = flipperGeo.clone();
    if (side === -1) {
      geo.scale(-1, 1, 1);
      geo.computeVertexNormals();
    }
    const flipper = new THREE.Mesh(geo, flipperMat);
    flipper.position.set(side * 1.15, -0.32, 0.85);
    flipper.rotation.z = side * 0.35;
    flipper.rotation.y = side * -0.25;
    flipper.castShadow = true;
    group.add(flipper);
  });

  // 7. Falcate Dorsal Fin atop the Dorsal Hump
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 10), whaleMat);
  dorsal.scale.set(0.25, 1.0, 1.35);
  dorsal.rotation.x = -0.48;
  dorsal.position.set(0, 1.25, -1.2);
  group.add(dorsal);

  // 8. Caudal Peduncle & Broad Horizontal Double Flukes (Undulates VERTICALLY!)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -3.2);
  group.add(tailPivot);

  const peduncle = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 12), whaleMat);
  peduncle.scale.set(0.65, 0.95, 1.0);
  peduncle.rotation.x = -Math.PI / 2;
  peduncle.position.set(0, 0, -1.0);
  tailPivot.add(peduncle);

  // Broad horizontal flukes with central median notch
  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0, 0);
  flukeShape.quadraticCurveTo(1.1, 0.45, 2.1, 0.2);
  flukeShape.quadraticCurveTo(2.35, -0.15, 1.9, -0.45);
  flukeShape.quadraticCurveTo(0.9, -0.28, 0.15, -0.5); // Median notch indent
  flukeShape.lineTo(0, -0.42);

  const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
  });
  flukeGeo.rotateX(Math.PI / 2);

  const rightFluke = new THREE.Mesh(flukeGeo, whaleMat);
  rightFluke.position.set(0, 0, -2.1);
  const leftFlukeGeo = flukeGeo.clone().scale(-1, 1, 1);
  leftFlukeGeo.computeVertexNormals();
  const leftFluke = new THREE.Mesh(leftFlukeGeo, whaleMat);
  leftFluke.position.set(0, 0, -2.1);
  tailPivot.add(rightFluke, leftFluke);

  // 9. Golden Friendship Halo
  const halo = createFriendshipHalo();
  halo.mesh.scale.setScalar(2.2);
  halo.mesh.position.y = 2.35;
  group.add(halo.mesh);

  return { group, tailPivot, blowholePivot, friendHaloMat: halo.mat };
}

// Backward-compatible alias for any existing reference
export function createWhaleShark(textures?: OceanTextureLibrary): {
  group: THREE.Group;
  tailPivot: THREE.Group;
  friendHaloMat: THREE.MeshBasicMaterial;
} {
  // If textures not supplied directly, create fallbacks
  const t = textures || ({
    whaleAlbedo: new THREE.CanvasTexture(document.createElement('canvas')),
  } as unknown as OceanTextureLibrary);
  const w = createGreatWhale(t);
  return { group: w.group, tailPivot: w.tailPivot, friendHaloMat: w.friendHaloMat };
}

/**
 * Elegant Spotted Eagle Ray (Aetobatus narinari)
 * - Diamond falcate wings with indigo spotted pattern
 * - Distinctive duckbill snout
 * - Slender whip tail (2.5x body length)
 */
export function createSpottedEagleRay(textures: OceanTextureLibrary): {
  group: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  friendHaloMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();

  const mantleMat = new THREE.MeshPhysicalMaterial({
    map: textures.eagleRayAlbedo,
    color: 0xffffff,
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 0.85,
  });

  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.45,
  });

  // Central Disc
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 12), mantleMat);
  disc.scale.set(0.95, 0.22, 1.35);
  group.add(disc);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.68, 16, 10), bellyMat);
  belly.scale.set(0.92, 0.16, 1.28);
  belly.position.y = -0.05;
  group.add(belly);

  // Duck-bill cephalic snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.62, 12), mantleMat);
  snout.scale.set(1.4, 0.28, 1.0);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0, 1.05);
  group.add(snout);

  // Pointed falcate wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.5);
  wingShape.quadraticCurveTo(1.2, 0.38, 2.15, -0.05);
  wingShape.quadraticCurveTo(1.1, -0.45, 0, -0.6);

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, mantleMat);
  const leftGeo = wingGeo.clone().scale(-1, 1, 1);
  leftGeo.computeVertexNormals();
  const leftWing = new THREE.Mesh(leftGeo, mantleMat);
  group.add(leftWing, rightWing);

  // Long whip-like tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 3.2, 8), mantleMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0.02, -2.4);
  group.add(tail);

  const halo = createFriendshipHalo();
  halo.mesh.position.y = 0.85;
  group.add(halo.mesh);

  return { group, leftWing, rightWing, friendHaloMat: halo.mat };
}

/**
 * Yellowtail Snapper (Ocyurus chrysurus)
 * Metallic silvery-blue body with brilliant golden-yellow lateral stripe and yellow forked tail
 */
export function createYellowtailSnapper(): {
  group: THREE.Group;
  tailMesh: THREE.Mesh;
} {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x94a3b8,
    roughness: 0.18,
    metalness: 0.72,
    clearcoat: 0.9,
  });

  const yellowStripeMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xeab308,
    emissiveIntensity: 0.35,
    roughness: 0.25,
  });

  // Fusiform fish body
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.72, 10), bodyMat);
  body.scale.set(0.48, 1.25, 1.0);
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // Signature bright yellow mid-lateral stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.65), yellowStripeMat);
  stripe.position.set(0, 0.02, 0.02);
  group.add(stripe);

  // Yellow dorsal fin
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 8), yellowStripeMat);
  dorsal.scale.set(0.15, 1.0, 1.2);
  dorsal.rotation.x = -0.45;
  dorsal.position.set(0, 0.22, -0.05);
  group.add(dorsal);

  // Deeply forked bright yellow caudal tail
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.36, 6), yellowStripeMat);
  tailMesh.scale.set(0.12, 1.45, 0.7);
  tailMesh.rotation.x = Math.PI / 2;
  tailMesh.position.set(0, 0, -0.48);
  group.add(tailMesh);

  return { group, tailMesh };
}

/**
 * Vibrant Orange & White Banded Clownfish (Amphiprion ocellaris)
 */
export function createClownfish(): {
  group: THREE.Group;
  tailMesh: THREE.Mesh;
} {
  const group = new THREE.Group();

  const orangeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf97316,
    roughness: 0.28,
    clearcoat: 0.85,
  });

  const whiteStripeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
  });

  const blackTrimMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

  // Rounded ovoid clownfish body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), orangeMat);
  body.scale.set(0.55, 1.0, 1.45);
  group.add(body);

  // 3 Distinct vertical white bands edged in black
  [-0.12, 0.02, 0.16].forEach((zOff) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.045, 14), whiteStripeMat);
    ring.scale.set(0.58, 1, 1.0);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, zOff);
    group.add(ring);

    const border = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), blackTrimMat);
    border.scale.set(0.59, 1, 1.0);
    border.rotation.x = Math.PI / 2;
    border.position.set(0, 0, zOff);
    group.add(border);
  });

  // Soft paddle-like tail fin
  const tailMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), orangeMat);
  tailMesh.scale.set(0.15, 1.1, 0.65);
  tailMesh.position.set(0, 0, -0.28);
  group.add(tailMesh);

  return { group, tailMesh };
}

/**
 * Tropical Sally Lightfoot / Coral Crab
 * Vibrant carapace shell, stalk eyes, 2 articulated front pincers, and 8 walking legs
 */
export function createCoralCrab(textures: OceanTextureLibrary): {
  group: THREE.Group;
  leftPincer: THREE.Mesh;
  rightPincer: THREE.Mesh;
  legs: THREE.Mesh[];
} {
  const group = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    map: textures.crabAlbedo,
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.1,
  });

  const pincerMat = new THREE.MeshPhysicalMaterial({
    color: 0xdc2626,
    emissive: 0x7f1d1d,
    emissiveIntensity: 0.25,
    roughness: 0.32,
    clearcoat: 0.6,
  });

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

  // 1. Broad Flat Carapace
  const carapace = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), shellMat);
  carapace.scale.set(1.25, 0.45, 0.95);
  carapace.position.y = 0.12;
  carapace.castShadow = true;
  group.add(carapace);

  // 2. Protruding Stalk Eyes
  [-1, 1].forEach((side) => {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), shellMat);
    stalk.position.set(side * 0.12, 0.22, 0.18);
    stalk.rotation.z = side * -0.25;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eye.position.set(side * 0.14, 0.28, 0.2);
    group.add(stalk, eye);
  });

  // 3. Two Articulated Front Pincers (Chelipeds)
  const pincerGeo = new THREE.ConeGeometry(0.08, 0.24, 8);
  pincerGeo.scale(0.65, 1.0, 1.25);
  const leftPincer = new THREE.Mesh(pincerGeo, pincerMat);
  leftPincer.position.set(-0.24, 0.15, 0.24);
  leftPincer.rotation.set(0.45, -0.65, 0.5);

  const rightPincer = new THREE.Mesh(pincerGeo, pincerMat);
  rightPincer.position.set(0.24, 0.15, 0.24);
  rightPincer.rotation.set(0.45, 0.65, -0.5);
  group.add(leftPincer, rightPincer);

  // 4. Eight Walking Legs (4 on each side)
  const legs: THREE.Mesh[] = [];
  [-1, 1].forEach((side) => {
    for (let l = 0; l < 4; l++) {
      const legGeo = new THREE.CylinderGeometry(0.022, 0.012, 0.32, 6);
      const leg = new THREE.Mesh(legGeo, shellMat);
      const lz = 0.12 - l * 0.09;
      leg.position.set(side * 0.28, 0.08, lz);
      leg.rotation.z = side * (0.85 + (l % 2) * 0.25);
      leg.rotation.y = side * (0.4 - l * 0.25);
      group.add(leg);
      legs.push(leg);
    }
  });

  return { group, leftPincer, rightPincer, legs };
}

export interface SwayingCoralCluster {
  group: THREE.Group;
  branches: { mesh: THREE.Mesh; baseRot: THREE.Euler; length: number; phase: number }[];
  basePos: THREE.Vector3;
}

export interface SwayingSeaFan {
  mesh: THREE.Mesh;
  baseRot: THREE.Euler;
  basePos: THREE.Vector3;
  phase: number;
}

export interface SwayingAnemone {
  group: THREE.Group;
  tentacles: { mesh: THREE.Mesh; baseRot: THREE.Euler; phase: number }[];
  basePos: THREE.Vector3;
}

/**
 * Branching Staghorn Coral Cluster with Swaying Prongs
 */
export function createStaghornCoral(colorHex: number): SwayingCoralCluster {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.65,
    metalness: 0.05,
  });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.85, 8), mat);
  trunk.position.y = 0.42;
  group.add(trunk);

  const branches: { mesh: THREE.Mesh; baseRot: THREE.Euler; length: number; phase: number }[] = [];

  // Antler-like branching prongs mounted with distinct base rotations
  for (let b = 0; b < 6; b++) {
    const branchGeo = new THREE.CylinderGeometry(0.05, 0.095, 0.72, 6);
    branchGeo.translate(0, 0.36, 0); // pivot at base of branch
    const branch = new THREE.Mesh(branchGeo, mat);
    const ba = (b / 6) * Math.PI * 2;
    branch.position.set(Math.cos(ba) * 0.16, 0.72, Math.sin(ba) * 0.16);
    branch.rotation.set(Math.cos(ba) * 0.52, ba * 0.3, Math.sin(ba) * 0.52);
    group.add(branch);
    branches.push({
      mesh: branch,
      baseRot: branch.rotation.clone(),
      length: 0.72,
      phase: b * 0.85,
    });

    // Secondary sub-branch tip for realistic staghorn antler detail
    if (b % 2 === 0) {
      const subGeo = new THREE.CylinderGeometry(0.03, 0.055, 0.42, 6);
      subGeo.translate(0, 0.21, 0);
      const subBranch = new THREE.Mesh(subGeo, mat);
      subBranch.position.set(0, 0.48, 0);
      subBranch.rotation.set(0.35, 0.6, 0.2);
      branch.add(subBranch);
    }
  }

  return { group, branches, basePos: new THREE.Vector3() };
}

/**
 * Soft Waving Sea Anemone (Clownfish home) with Articulated Tentacles
 */
export function createSeaAnemone(colorHex: number): SwayingAnemone {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    clearcoat: 0.7,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.25, 12), mat);
  base.position.y = 0.12;
  group.add(base);

  const tentacles: { mesh: THREE.Mesh; baseRot: THREE.Euler; phase: number }[] = [];
  for (let t = 0; t < 16; t++) {
    const ta = (t / 16) * Math.PI * 2;
    const r = 0.12 + (t % 2) * 0.09;
    const tenGeo = new THREE.ConeGeometry(0.028, 0.48, 6);
    tenGeo.translate(0, 0.24, 0); // pivot at base
    const ten = new THREE.Mesh(tenGeo, mat);
    ten.position.set(Math.cos(ta) * r, 0.25, Math.sin(ta) * r);
    ten.rotation.set(Math.cos(ta) * 0.35, 0, Math.sin(ta) * 0.35);
    group.add(ten);
    tentacles.push({
      mesh: ten,
      baseRot: ten.rotation.clone(),
      phase: t * 0.45,
    });
  }

  return { group, tentacles, basePos: new THREE.Vector3() };
}

let seaFanAlphaTexture: THREE.CanvasTexture | null = null;

/** White-on-black branching pattern shared by every sea fan (deterministic, built once). */
function getSeaFanAlphaTexture(): THREE.CanvasTexture {
  if (seaFanAlphaTexture) return seaFanAlphaTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';

  const branch = (x: number, y: number, angle: number, length: number, width: number, depth: number) => {
    const ex = x + Math.sin(angle) * length;
    const ey = y - Math.cos(angle) * length;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth === 0) return;
    const spread = 0.34 + (depth % 2) * 0.08;
    branch(ex, ey, angle - spread, length * 0.78, Math.max(2.2, width * 0.72), depth - 1);
    branch(ex, ey, angle + spread, length * 0.78, Math.max(2.2, width * 0.72), depth - 1);
    if (depth > 2) branch(ex, ey, angle, length * 0.7, Math.max(2.2, width * 0.72), depth - 2);
  };
  branch(size / 2, size, 0, 50, 11, 6);

  seaFanAlphaTexture = new THREE.CanvasTexture(canvas);
  return seaFanAlphaTexture;
}

/**
 * Delicate Gorgonian Sea Fan Coral
 */
export function createSeaFan(colorHex: number): SwayingSeaFan {
  const fanGeo = new THREE.PlaneGeometry(1.2, 1.4, 8, 10);
  fanGeo.translate(0, 0.7, 0); // pivot at seabed root
  const fanMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.6,
    side: THREE.DoubleSide,
    // Branching lattice cut-out, so the fan reads as coral rather than a flat card.
    alphaMap: getSeaFanAlphaTexture(),
    alphaTest: 0.5,
  });
  const mesh = new THREE.Mesh(fanGeo, fanMat);
  return {
    mesh,
    baseRot: mesh.rotation.clone(),
    basePos: new THREE.Vector3(),
    phase: Math.random() * Math.PI * 2,
  };
}

export function createMoonJellyfish(colorHex: number): {
  group: THREE.Group;
  bell: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
} {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.55,
    roughness: 0.15,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6),
    mat
  );
  group.add(bell);

  for (let t = 0; t < 6; t++) {
    const a = (t / 6) * Math.PI * 2;
    const tentacle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.006, 1.05, 6),
      mat
    );
    tentacle.position.set(Math.cos(a) * 0.22, -0.52, Math.sin(a) * 0.22);
    group.add(tentacle);
  }

  return { group, bell, mat };
}

/**
 * Realistic Tropical Sea Star / Starfish (Linckia laevigata & Protoreaster linckii)
 * - 5 Sculpted tapered arms radiating from central disc with organic camber & curled arm tips
 * - Central raised dorsal dome with distinct madreporite plate
 * - Dual rows of carinal spines & microscopic calcium granule nodes
 * - Ventral ambulacral grooves with miniature suction tube feet
 * - Soft organic breathing respiration / gentle current flexing
 */
export function createStarfish(colorHex: number): {
  group: THREE.Group;
  mat: THREE.MeshPhysicalMaterial;
  armMeshes: THREE.Mesh[];
  baseRotations: THREE.Euler[];
} {
  const group = new THREE.Group();

  const mat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.28,
    roughness: 0.38,
    metalness: 0.04,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
  });

  const detailMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.55,
  });

  const tubeFootMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.7,
  });

  // 1. Central Aboral Disc with Raised Dome
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.12, 16), mat);
  disc.position.y = 0.06;
  group.add(disc);

  // Central Madreporite (filtering sieve plate on aboral surface)
  const madreporite = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.03, 8), detailMat);
  madreporite.position.set(0.06, 0.13, 0.04);
  group.add(madreporite);

  const armMeshes: THREE.Mesh[] = [];
  const baseRotations: THREE.Euler[] = [];

  // 2. Five Sculpted Ray Arms with Ambulacral Rows & Tuberculated Carinal Ridges
  for (let a = 0; a < 5; a++) {
    const angle = (a / 5) * Math.PI * 2;
    const armPivot = new THREE.Group();
    armPivot.position.set(Math.cos(angle) * 0.22, 0.045, Math.sin(angle) * 0.22);
    armPivot.rotation.y = -angle + Math.PI / 2;
    group.add(armPivot);

    // Sculpted ray arm with slight organic upward curvature at the tip
    const armGeo = new THREE.ConeGeometry(0.12, 0.64, 10);
    armGeo.scale(0.88, 1, 0.58);
    armGeo.rotateX(Math.PI / 2);
    armGeo.translate(0, 0, 0.32); // pivot from disc edge

    const arm = new THREE.Mesh(armGeo, mat);
    armPivot.add(arm);
    armMeshes.push(arm);
    baseRotations.push(arm.rotation.clone());

    // Prominent Carinal Spines along the dorsal midline of each arm
    for (let spine = 1; spine <= 4; spine++) {
      const dist = 0.12 + spine * 0.11;
      const spineMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.024, 0.045, 6),
        detailMat
      );
      spineMesh.position.set(0, 0.065 - spine * 0.008, dist);
      arm.add(spineMesh);

      // Flanking marginal granules (lateral spines)
      [-1, 1].forEach((side) => {
        const granule = new THREE.Mesh(
          new THREE.SphereGeometry(0.016, 6, 6),
          mat
        );
        granule.position.set(side * (0.05 - spine * 0.006), 0.025, dist);
        arm.add(granule);
      });

      // Ventral Ambulacral Suction Tube Feet underneath each arm
      [-1, 1].forEach((side) => {
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.012, 0.035, 6),
          tubeFootMat
        );
        foot.position.set(side * 0.025, -0.04, dist);
        arm.add(foot);
      });
    }
  }

  return { group, mat, armMeshes, baseRotations };
}

/** Where the Bioluminescent Grotto sits on the seabed (matches the basin in groundHeightAt). */
export const GROTTO_CENTER = { x: -42, z: 30 };

/** Shape of the rock ring, shared by the drawing code and the collision wall. */
export const GROTTO_RING = {
  radius: 17.5,
  // Three wide openings, so the ring frames the basin without ever trapping a turtle.
  gapAngles: [-0.75, 1.35, 3.45],
  gapHalfWidth: 0.4,
};

/**
 * Bioluminescent Grotto: a broken ring of dark basalt spires leaning in over the basin,
 * two entrance arches, and glowing crystals and wall-lichen inside.
 * Layout is deterministic so the collision spires always match what is drawn.
 */
export function createGrotto(groundAt: (x: number, z: number) => number): {
  group: THREE.Group;
  glowMaterials: THREE.MeshStandardMaterial[];
} {
  const group = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x232b3d,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  const glowPalette = [0x22d3ee, 0xa78bfa, 0x34d399, 0xf0abfc];
  const glowMaterials = glowPalette.map(
    (hex) =>
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: hex,
        emissiveIntensity: 0.9,
        roughness: 0.35,
        fog: false,
      })
  );

  const spireGeo = new THREE.IcosahedronGeometry(1, 1);
  const lichenGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const crystalGeo = new THREE.ConeGeometry(0.22, 1, 5);

  // Cheap repeatable pseudo-random, so the grotto looks the same every visit.
  const rand = (n: number) => {
    const v = Math.sin(n * 127.1 + 11.7) * 43758.5453;
    return v - Math.floor(v);
  };

  const ringRadius = GROTTO_RING.radius;
  const spireCount = 22;
  const { gapAngles, gapHalfWidth } = GROTTO_RING;

  for (let i = 0; i < spireCount; i++) {
    const angle = (i / spireCount) * Math.PI * 2;
    const inGap = gapAngles.some((g) => {
      const d = Math.atan2(Math.sin(angle - g), Math.cos(angle - g));
      return Math.abs(d) < gapHalfWidth;
    });
    if (inGap) continue;

    const r = ringRadius + (rand(i) - 0.5) * 2.4;
    const x = GROTTO_CENTER.x + Math.cos(angle) * r;
    const z = GROTTO_CENTER.z + Math.sin(angle) * r;
    const baseY = groundAt(x, z);
    const width = 1.9 + rand(i + 40) * 1.3;
    // Tall, but always capped below the waterline.
    const height = Math.min(6.2 + rand(i + 80) * 2.6, -1.0 - baseY);
    if (height < 2) continue;

    const spire = new THREE.Mesh(spireGeo, rockMat);
    spire.scale.set(width, height * 0.62, width * (0.8 + rand(i + 120) * 0.4));
    spire.position.set(x, baseY + height * 0.42, z);
    spire.rotation.y = rand(i + 160) * Math.PI;
    // Lean the top in toward the middle of the basin.
    const lean = 0.2 + rand(i + 200) * 0.14;
    spire.rotation.z = Math.cos(angle) * lean;
    spire.rotation.x = -Math.sin(angle) * lean;
    spire.castShadow = true;
    spire.receiveShadow = true;
    group.add(spire);

    // Glowing lichen dots on the inward face.
    for (let k = 0; k < 5; k++) {
      const dot = new THREE.Mesh(lichenGeo, glowMaterials[(i + k) % glowMaterials.length]);
      const inward = width * 0.78;
      const side = (rand(i * 7 + k) - 0.5) * width * 0.9;
      dot.position.set(
        x - Math.cos(angle) * inward - Math.sin(angle) * side,
        baseY + 0.8 + rand(i * 13 + k) * height * 0.6,
        z - Math.sin(angle) * inward + Math.cos(angle) * side
      );
      dot.scale.setScalar(0.7 + rand(i * 17 + k) * 1.1);
      group.add(dot);
    }
  }

  // Rock arches framing the two entrances.
  const archGeo = new THREE.TorusGeometry(4.6, 1.0, 6, 14, Math.PI);
  gapAngles.forEach((g) => {
    const ax = GROTTO_CENTER.x + Math.cos(g) * ringRadius;
    const az = GROTTO_CENTER.z + Math.sin(g) * ringRadius;
    const arch = new THREE.Mesh(archGeo, rockMat);
    arch.position.set(ax, groundAt(ax, az) - 0.4, az);
    // The arch spans across the opening, so its plane faces along the ring radius.
    arch.rotation.y = Math.PI / 2 - g;
    arch.castShadow = true;
    group.add(arch);
  });

  // Crystal clusters on the basin floor.
  for (let c = 0; c < 26; c++) {
    const angle = rand(c + 300) * Math.PI * 2;
    const r = 2.5 + rand(c + 340) * 12;
    const cx = GROTTO_CENTER.x + Math.cos(angle) * r;
    const cz = GROTTO_CENTER.z + Math.sin(angle) * r;
    const cy = groundAt(cx, cz);
    const mat = glowMaterials[c % glowMaterials.length];
    for (let k = 0; k < 3; k++) {
      const crystal = new THREE.Mesh(crystalGeo, mat);
      const h = 0.5 + rand(c * 5 + k) * 0.9;
      crystal.scale.set(1, h, 1);
      crystal.position.set(cx + (k - 1) * 0.26, cy + h * 0.45, cz + (rand(c * 9 + k) - 0.5) * 0.4);
      crystal.rotation.z = (k - 1) * 0.32;
      crystal.rotation.x = (rand(c * 3 + k) - 0.5) * 0.4;
      group.add(crystal);
    }
  }

  // Soft coloured light pooling on the floor.
  const lightSpecs: [number, number, number][] = [
    [-8, 4, 0x22d3ee],
    [8, -6, 0xa78bfa],
    [2, 10, 0x34d399],
  ];
  lightSpecs.forEach(([dx, dz, hex]) => {
    const lx = GROTTO_CENTER.x + dx;
    const lz = GROTTO_CENTER.z + dz;
    const light = new THREE.PointLight(hex, 7, 16, 1.6);
    light.position.set(lx, groundAt(lx, lz) + 3.2, lz);
    group.add(light);
  });

  return { group, glowMaterials };
}
