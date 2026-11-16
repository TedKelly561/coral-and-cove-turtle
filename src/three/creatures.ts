import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OceanTextureLibrary } from './textures';
import { createFriendshipHalo } from './models';

/**
 * Sea life built from a few shared pieces rather than stacked primitives:
 *
 *  - loftBody: a smooth body from cross-sections along its length (nose at +Z, back at +Y)
 *  - flatFin:  a thin fin cut from an outline
 *  - tubeAlong: a tapering tube that follows a curve (tails, arms)
 *
 * Colour is painted per vertex (dark back, pale belly, stripes), so each animal needs
 * only one or two materials and no extra textures.
 */

type ColorAt = (along: number, upness: number, side: number) => THREE.ColorRepresentation;

interface Station {
  /** Position along the body; the nose is the largest z. */
  z: number;
  /** Half width at this station. */
  w: number;
  top: number;
  bottom: number;
}

const _c = new THREE.Color();

function paint(geo: THREE.BufferGeometry, colorOf: (v: THREE.Vector3, i: number) => THREE.ColorRepresentation) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    _c.set(colorOf(v, i));
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Smooth closed body through a list of cross-sections. */
function loftBody(
  stations: Station[],
  colorAt: ColorAt,
  radial = 14,
  lengthSteps = 0
): THREE.BufferGeometry {
  // Resample through a spline so a handful of hand-set stations gives a smooth outline.
  const fine: Station[] = [];
  const curveW = new THREE.CatmullRomCurve3(stations.map((s) => new THREE.Vector3(s.w, s.top, s.bottom)));
  const curveZ = new THREE.CatmullRomCurve3(stations.map((s) => new THREE.Vector3(s.z, 0, 0)));
  const steps = lengthSteps || Math.max(18, stations.length * 4);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = curveW.getPoint(t);
    fine.push({ z: curveZ.getPoint(t).x, w: Math.max(0, a.x), top: a.y, bottom: a.z });
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  fine.forEach((s, i) => {
    const cy = (s.top + s.bottom) / 2;
    const h = Math.max(0.0001, (s.top - s.bottom) / 2);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const sx = Math.sin(a);
      const cyUp = Math.cos(a);
      positions.push(s.w * sx, cy + h * cyUp, s.z);
      uvs.push(i / steps, j / radial);
      _c.set(colorAt(i / steps, cyUp, Math.sign(sx)));
      colors.push(_c.r, _c.g, _c.b);
    }
  });
  const ring = radial + 1;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Thin fin from an outline of [a, b] points. `place` puts each outline point in 3D,
 * e.g. (a, b) => [0, b, a] for an upright fin along the body.
 */
function flatFin(
  outline: [number, number][],
  place: (a: number, b: number) => [number, number, number],
  color: THREE.ColorRepresentation
): THREE.BufferGeometry {
  const contour = outline.map(([a, b]) => new THREE.Vector2(a, b));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions: number[] = [];
  const uvs: number[] = [];
  outline.forEach(([a, b]) => {
    positions.push(...place(a, b));
    uvs.push(a, b);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(triangles.flat());
  geo.computeVertexNormals();
  return paint(geo, () => color);
}

/** Tube that follows a curve, with its own radius at each point along the way. */
function tubeAlong(
  curve: THREE.Curve<THREE.Vector3>,
  radiusAt: (t: number) => number,
  colorAt: (t: number) => THREE.ColorRepresentation,
  segments = 20,
  radial = 7
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = radiusAt(t);
    _c.set(colorAt(t));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = frames.normals[i];
      const b = frames.binormals[i];
      positions.push(
        p.x + r * (Math.cos(a) * n.x + Math.sin(a) * b.x),
        p.y + r * (Math.cos(a) * n.y + Math.sin(a) * b.y),
        p.z + r * (Math.cos(a) * n.z + Math.sin(a) * b.z)
      );
      uvs.push(t, j / radial);
      colors.push(_c.r, _c.g, _c.b);
    }
  }
  const ring = radial + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function ball(radius: number, at: [number, number, number], color: THREE.ColorRepresentation, detail = 8) {
  const geo = new THREE.SphereGeometry(radius, detail, Math.max(4, detail - 2));
  geo.translate(...at);
  return paint(geo, () => color);
}

/** Joins parts into one geometry (so an animal, or a whole school, is a single draw). */
function join(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const plain = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    Object.keys(g.attributes).forEach((name) => {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    });
    return g;
  });
  const merged = mergeGeometries(plain);
  parts.forEach((part) => part.dispose());
  return merged;
}

const skin = (opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.05,
    side: THREE.DoubleSide,
    ...opts,
  });

/** Dark back shading smoothly to a pale belly. */
const countershade =
  (back: number, flank: number, belly: number, split = -0.15): ColorAt =>
  (_along, upness) => {
    const c = new THREE.Color(belly);
    if (upness > split) c.lerp(new THREE.Color(flank), THREE.MathUtils.smoothstep(upness, split, split + 0.35));
    if (upness > 0.35) c.lerp(new THREE.Color(back), THREE.MathUtils.smoothstep(upness, 0.35, 0.8));
    return c;
  };

// ---------------------------------------------------------------------------
// Dolphin
// ---------------------------------------------------------------------------
export function createDolphin(): {
  group: THREE.Group;
  flukePivot: THREE.Group;
  friendHaloMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const material = skin({ roughness: 0.25 });
  const back = 0x55657a;
  const body = join([
    loftBody(
      [
        { z: 1.3, w: 0.0, top: -0.06, bottom: -0.08 },
        { z: 1.25, w: 0.06, top: -0.01, bottom: -0.13 },
        { z: 1.06, w: 0.1, top: 0.04, bottom: -0.17 }, // short beak
        { z: 0.94, w: 0.21, top: 0.29, bottom: -0.23 }, // melon rises behind the beak
        { z: 0.62, w: 0.31, top: 0.37, bottom: -0.31 },
        { z: 0.15, w: 0.37, top: 0.4, bottom: -0.36 },
        { z: -0.4, w: 0.3, top: 0.33, bottom: -0.28 },
        { z: -0.9, w: 0.15, top: 0.2, bottom: -0.14 },
        { z: -1.22, w: 0.06, top: 0.11, bottom: -0.06 }, // tail stock
        { z: -1.34, w: 0.0, top: 0.03, bottom: 0.01 },
      ],
      countershade(back, 0x8fa0b3, 0xf1f5f9),
      16
    ),
    // Curved-back dorsal fin
    flatFin(
      [
        [0.12, 0.36],
        [-0.12, 0.62],
        [-0.3, 0.78],
        [-0.34, 0.6],
        [-0.42, 0.34],
      ],
      (a, b) => [0, b, a],
      back
    ),
    // Flippers, angled down and back
    ...[-1, 1].map((side) =>
      flatFin(
        [
          [0.5, 0],
          [0.3, 0.42],
          [0.1, 0.56],
          [0.12, 0.3],
          [0.22, 0],
        ],
        (a, b) => [side * (0.26 + b * 0.82), -0.22 - b * 0.5, a - b * 0.35],
        back
      )
    ),
    ball(0.032, [0.2, 0.06, 0.86], 0x0b1220),
    ball(0.032, [-0.2, 0.06, 0.86], 0x0b1220),
  ]);
  group.add(new THREE.Mesh(body, material));

  const flukePivot = new THREE.Group();
  flukePivot.position.set(0, 0.03, -1.26);
  const flukes = flatFin(
    [
      [0, 0.06],
      [0.5, -0.2],
      [0.62, -0.36],
      [0.3, -0.3],
      [0, -0.2], // centre notch
      [-0.3, -0.3],
      [-0.62, -0.36],
      [-0.5, -0.2],
    ],
    (a, b) => [a, 0, b],
    back
  );
  flukePivot.add(new THREE.Mesh(flukes, material));
  group.add(flukePivot);

  const halo = createFriendshipHalo();
  halo.mesh.position.y = 0.95;
  group.add(halo.mesh);

  return { group, flukePivot, friendHaloMat: halo.mat };
}

// ---------------------------------------------------------------------------
// Humpback whale
// ---------------------------------------------------------------------------
export function createGreatWhale(_textures?: OceanTextureLibrary): {
  group: THREE.Group;
  tailPivot: THREE.Group;
  blowholePivot: THREE.Group;
  friendHaloMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  const material = skin({ roughness: 0.5 });
  const back = 0x27323f;
  const pale = 0xe8edf2;

  // Dark back, white belly, and the long throat grooves a humpback has under its chin.
  const whaleColor: ColorAt = (along, upness, side) => {
    const base = countershade(back, 0x3b4a5c, pale, -0.3)(along, upness, side) as THREE.Color;
    if (upness < -0.2 && along < 0.52) {
      const groove = Math.sin(Math.acos(THREE.MathUtils.clamp(upness, -1, 1)) * 22) > 0.35;
      if (groove) base.lerp(new THREE.Color(0x7b8794), 0.75);
    }
    return base;
  };

  const parts: THREE.BufferGeometry[] = [
    loftBody(
      [
        { z: 4.05, w: 0.0, top: -0.2, bottom: -0.3 },
        { z: 3.8, w: 0.5, top: 0.12, bottom: -0.62 }, // blunt snout
        { z: 2.9, w: 1.0, top: 0.62, bottom: -1.2 }, // deep jaw and throat
        { z: 1.6, w: 1.28, top: 1.1, bottom: -1.38 },
        { z: 0.2, w: 1.3, top: 1.25, bottom: -1.3 },
        { z: -1.4, w: 1.08, top: 1.12, bottom: -1.0 },
        { z: -3.0, w: 0.62, top: 0.72, bottom: -0.5 },
        { z: -4.3, w: 0.26, top: 0.36, bottom: -0.14 }, // tail stock
        { z: -4.85, w: 0.0, top: 0.14, bottom: 0.06 },
      ],
      whaleColor,
      22
    ),
    // Small hooked dorsal fin, set well back
    flatFin(
      [
        [-1.1, 1.08],
        [-1.6, 1.52],
        [-1.9, 1.46],
        [-2.1, 0.95],
      ],
      (a, b) => [0, b, a],
      back
    ),
    ball(0.085, [0.98, -0.12, 2.75], 0x05080d),
    ball(0.085, [-0.98, -0.12, 2.75], 0x05080d),
  ];
  // Knobs on the snout
  for (let k = 0; k < 9; k++) {
    const side = k % 2 === 0 ? 1 : -1;
    parts.push(ball(0.075, [side * (0.18 + (k % 3) * 0.2), 0.3 + (k % 4) * 0.09, 3.55 - (k % 5) * 0.28], 0x3b4a5c, 6));
  }
  // Very long flippers: dark on top, white underneath, knobbly along the front edge.
  [-1, 1].forEach((side) => {
    const flipper = loftBody(
      [
        { z: 0, w: 0.0, top: 0.02, bottom: -0.02 },
        { z: 0.25, w: 0.36, top: 0.09, bottom: -0.09 },
        { z: 1.3, w: 0.46, top: 0.08, bottom: -0.08 },
        { z: 2.5, w: 0.36, top: 0.06, bottom: -0.06 },
        { z: 3.3, w: 0.16, top: 0.03, bottom: -0.03 },
        { z: 3.55, w: 0.0, top: 0.01, bottom: -0.01 },
      ],
      (_a, upness) => (upness > 0.1 ? back : pale),
      10
    );
    // The loft runs along +Z: swing it out to the side, sweeping back and drooping a little.
    flipper.rotateX(side * -0.12);
    flipper.rotateY(side * (Math.PI / 2 + 0.55));
    flipper.rotateZ(side * -0.22);
    flipper.translate(side * 1.05, -0.72, 1.7);
    parts.push(flipper);
  });
  group.add(new THREE.Mesh(join(parts), material));

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.12, -4.7);
  const flukes = flatFin(
    [
      [0, 0.25],
      [1.2, -0.25],
      [2.0, -0.75],
      [1.85, -1.1],
      [0.9, -0.85],
      [0, -0.55], // centre notch
      [-0.9, -0.85],
      [-1.85, -1.1],
      [-2.0, -0.75],
      [-1.2, -0.25],
    ],
    (a, b) => [a, 0, b],
    back
  );
  tailPivot.add(new THREE.Mesh(flukes, material));
  group.add(tailPivot);

  const blowholePivot = new THREE.Group();
  blowholePivot.position.set(0, 1.05, 2.1);
  group.add(blowholePivot);

  const halo = createFriendshipHalo();
  halo.mesh.scale.setScalar(2.2);
  halo.mesh.position.y = 2.3;
  group.add(halo.mesh);

  return { group, tailPivot, blowholePivot, friendHaloMat: halo.mat };
}

// ---------------------------------------------------------------------------
// Rays
// ---------------------------------------------------------------------------
interface RayPlan {
  span: number;
  /** Leading edge sweep: how far back the wing tip sits. */
  sweep: number;
  /** Chord (front to back) of the wing where it joins the body. */
  rootChord: number;
  top: number;
  topEdge: number;
  belly: number;
  tailLength: number;
  horns: boolean;
  map?: THREE.Texture;
}

function buildRay(plan: RayPlan) {
  const group = new THREE.Group();
  const topMat = skin({ roughness: 0.4, map: plan.map ?? null });
  const bellyMat = skin({ roughness: 0.55 });

  // One wing: a sheet that is thick at the shoulder and thins to the tip and both edges.
  const wing = (side: number) => {
    const spanSteps = 12;
    const chordSteps = 8;
    const build = (upper: boolean) => {
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= spanSteps; i++) {
        const s = i / spanSteps;
        const x = side * (0.2 + s * (plan.span - 0.2));
        const lead = plan.rootChord * 0.5 - plan.sweep * Math.pow(s, 1.25);
        const chord = plan.rootChord * Math.pow(1 - s, 0.75) + 0.04;
        const thick = 0.17 * Math.pow(1 - s, 1.4) + 0.006;
        for (let j = 0; j <= chordSteps; j++) {
          const c = j / chordSteps;
          const profile = Math.sin(Math.PI * Math.pow(c, 0.75));
          positions.push(x, (upper ? 1 : -0.55) * thick * profile - s * s * 0.12, lead - c * chord);
          uvs.push(0.5 + side * s * 0.5, c);
        }
      }
      const ring = chordSteps + 1;
      for (let i = 0; i < spanSteps; i++) {
        for (let j = 0; j < chordSteps; j++) {
          const a = i * ring + j;
          const b = a + ring;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return paint(geo, (v) =>
        upper
          ? new THREE.Color(plan.top).lerp(new THREE.Color(plan.topEdge), Math.pow(Math.abs(v.x) / plan.span, 2))
          : plan.belly
      );
    };
    const holder = new THREE.Group();
    holder.add(new THREE.Mesh(build(true), topMat), new THREE.Mesh(build(false), bellyMat));
    return holder;
  };
  const leftWing = wing(-1);
  const rightWing = wing(1);
  group.add(leftWing, rightWing);

  const half = plan.rootChord * 0.5;
  const bodyParts: THREE.BufferGeometry[] = [
    loftBody(
      [
        { z: half + 0.32, w: 0.0, top: 0.03, bottom: -0.03 },
        { z: half + 0.2, w: 0.3, top: 0.12, bottom: -0.1 },
        { z: half - 0.2, w: 0.42, top: 0.24, bottom: -0.15 },
        { z: 0, w: 0.4, top: 0.26, bottom: -0.15 },
        { z: -half * 0.8, w: 0.24, top: 0.16, bottom: -0.09 },
        { z: -half - 0.25, w: 0.05, top: 0.05, bottom: -0.03 },
      ],
      (_a, upness) => (upness > -0.05 ? plan.top : plan.belly),
      12
    ),
    tubeAlong(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.01, -half - 0.2),
        new THREE.Vector3(0, 0.03, -half - plan.tailLength * 0.5),
        new THREE.Vector3(0, -0.02, -half - plan.tailLength),
      ]),
      (t) => 0.045 * (1 - t) + 0.006,
      () => plan.top,
      10,
      5
    ),
    ball(0.045, [0.36, 0.12, half - 0.05], 0x05080d),
    ball(0.045, [-0.36, 0.12, half - 0.05], 0x05080d),
  ];
  if (plan.horns) {
    // The two rolled lobes a manta holds out in front of its mouth.
    [-1, 1].forEach((side) => {
      bodyParts.push(
        tubeAlong(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * 0.26, 0, half + 0.12),
            new THREE.Vector3(side * 0.31, -0.03, half + 0.38),
            new THREE.Vector3(side * 0.24, -0.08, half + 0.58),
          ]),
          (t) => 0.075 * (1 - t * 0.6),
          () => plan.top,
          8,
          6
        )
      );
    });
  }
  group.add(new THREE.Mesh(join(bodyParts), bellyMat));

  const halo = createFriendshipHalo();
  halo.mesh.position.y = 0.85;
  group.add(halo.mesh);

  return { group, leftWing, rightWing, friendHaloMat: halo.mat };
}

export function createMantaRay() {
  return buildRay({
    span: 2.4,
    sweep: 0.75,
    rootChord: 1.85,
    top: 0x243244,
    topEdge: 0x3f556e,
    belly: 0xeef2f6,
    tailLength: 1.6,
    horns: true,
  });
}

export function createSpottedEagleRay(textures: OceanTextureLibrary) {
  return buildRay({
    span: 2.15,
    sweep: 1.05,
    rootChord: 1.55,
    top: 0xffffff, // left white so the spotted skin texture shows true
    topEdge: 0xdbe4ee,
    belly: 0xf5f7fa,
    tailLength: 2.7,
    horns: false,
    map: textures.eagleRayAlbedo,
  });
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------
const forkedTail = (reach: number, height: number, color: THREE.ColorRepresentation) =>
  flatFin(
    [
      [0, 0.06 * height],
      [-reach, height],
      [-reach * 0.55, 0],
      [-reach, -height],
      [0, -0.06 * height],
    ],
    (a, b) => [0, b, a],
    color
  );

export function createYellowtailSnapper(): { group: THREE.Group; tailMesh: THREE.Mesh } {
  const group = new THREE.Group();
  const material = skin({ roughness: 0.28, metalness: 0.25 });
  const yellow = 0xfacc15;
  const body = join([
    loftBody(
      [
        { z: 0.46, w: 0.0, top: 0.0, bottom: -0.02 },
        { z: 0.38, w: 0.045, top: 0.07, bottom: -0.08 },
        { z: 0.16, w: 0.085, top: 0.17, bottom: -0.15 },
        { z: -0.12, w: 0.09, top: 0.18, bottom: -0.16 },
        { z: -0.38, w: 0.045, top: 0.09, bottom: -0.08 },
        { z: -0.5, w: 0.015, top: 0.04, bottom: -0.04 },
      ],
      // Silver-blue back, pale belly, and the yellow stripe that gives the fish its name.
      (along, upness) =>
        Math.abs(upness - 0.05) < 0.2 && along > 0.12
          ? yellow
          : upness > 0.2
            ? 0x7c93b0
            : 0xeef2f7,
      12
    ),
    flatFin(
      [
        [0.2, 0.15],
        [0.02, 0.3],
        [-0.3, 0.2],
        [-0.36, 0.08],
      ],
      (a, b) => [0, b, a],
      yellow
    ),
    flatFin(
      [
        [-0.1, -0.14],
        [-0.22, -0.26],
        [-0.36, -0.08],
      ],
      (a, b) => [0, b, a],
      yellow
    ),
    ball(0.02, [0.058, 0.04, 0.3], 0x0b1220, 6),
    ball(0.02, [-0.058, 0.04, 0.3], 0x0b1220, 6),
  ]);
  group.add(new THREE.Mesh(body, material));

  const tailMesh = new THREE.Mesh(forkedTail(0.26, 0.2, yellow), material);
  tailMesh.position.z = -0.48;
  group.add(tailMesh);
  return { group, tailMesh };
}

let slenderSchoolFish: THREE.BufferGeometry | null = null;
let discSchoolFish: THREE.BufferGeometry | null = null;

/**
 * Geometry for the schooling fish, drawn many times in one go. Painted in greys so each
 * fish's own colour shows through: paler belly, darker fins, black eye.
 * 'slender' is a darting anthias-like fish; 'disc' is a tall-bodied tang.
 */
export function getSchoolFishGeometry(kind: 'slender' | 'disc'): THREE.BufferGeometry {
  if (kind === 'slender' && slenderSchoolFish) return slenderSchoolFish;
  if (kind === 'disc' && discSchoolFish) return discSchoolFish;
  const shade: ColorAt = (_a, upness) => (upness > 0.3 ? 0xd4d4d4 : upness < -0.35 ? 0xffffff : 0xf2f2f2);
  const fin = 0xbdbdbd;
  let geo: THREE.BufferGeometry;
  if (kind === 'slender') {
    geo = join([
      loftBody(
        [
          { z: 0.34, w: 0.0, top: 0.0, bottom: -0.01 },
          { z: 0.27, w: 0.035, top: 0.05, bottom: -0.055 },
          { z: 0.08, w: 0.06, top: 0.105, bottom: -0.1 },
          { z: -0.14, w: 0.05, top: 0.09, bottom: -0.085 },
          { z: -0.3, w: 0.015, top: 0.035, bottom: -0.035 },
        ],
        shade,
        7,
        10 // kept light: there are a couple of hundred of these on screen
      ),
      forkedTail(0.2, 0.15, fin).translate(0, 0, -0.28),
      flatFin(
        [
          [0.12, 0.09],
          [0.0, 0.2],
          [-0.2, 0.12],
          [-0.24, 0.05],
        ],
        (a, b) => [0, b, a],
        fin
      ),
      ball(0.017, [0.04, 0.02, 0.22], 0x000000, 5),
      ball(0.017, [-0.04, 0.02, 0.22], 0x000000, 5),
    ]);
    slenderSchoolFish = geo;
  } else {
    geo = join([
      loftBody(
        [
          { z: 0.28, w: 0.0, top: -0.01, bottom: -0.03 },
          { z: 0.22, w: 0.03, top: 0.08, bottom: -0.09 },
          { z: 0.05, w: 0.05, top: 0.2, bottom: -0.2 },
          { z: -0.12, w: 0.045, top: 0.19, bottom: -0.19 },
          { z: -0.26, w: 0.012, top: 0.04, bottom: -0.04 },
        ],
        shade,
        7,
        10 // kept light: there are a couple of hundred of these on screen
      ),
      flatFin(
        [
          [0, 0.03],
          [-0.15, 0.15],
          [-0.11, 0],
          [-0.15, -0.15],
          [0, -0.03],
        ],
        (a, b) => [0, b, a - 0.25],
        fin
      ),
      // Long fins running the length of the back and belly
      flatFin(
        [
          [0.14, 0.17],
          [0.02, 0.29],
          [-0.2, 0.22],
          [-0.24, 0.06],
        ],
        (a, b) => [0, b, a],
        fin
      ),
      flatFin(
        [
          [0.1, -0.18],
          [-0.02, -0.28],
          [-0.2, -0.21],
          [-0.24, -0.06],
        ],
        (a, b) => [0, b, a],
        fin
      ),
      ball(0.018, [0.033, 0.05, 0.17], 0x000000, 5),
      ball(0.018, [-0.033, 0.05, 0.17], 0x000000, 5),
    ]);
    discSchoolFish = geo;
  }
  return geo;
}

/** Round little fish that puffs up into a spiky ball when something big comes near. */
export function createPufferfish(): { group: THREE.Group; body: THREE.Group; spikes: THREE.Mesh } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const material = skin({ roughness: 0.5 });
  const sand = 0xe7c873;
  const shape = join([
    loftBody(
      [
        { z: 0.3, w: 0.0, top: 0.0, bottom: -0.02 },
        { z: 0.24, w: 0.1, top: 0.1, bottom: -0.11 },
        { z: 0.05, w: 0.19, top: 0.2, bottom: -0.2 },
        { z: -0.14, w: 0.15, top: 0.16, bottom: -0.17 },
        { z: -0.3, w: 0.03, top: 0.04, bottom: -0.04 },
      ],
      (along, upness) => {
        const c = new THREE.Color(upness > -0.1 ? sand : 0xfdf6e3);
        // Brown speckles over the back
        if (upness > 0 && Math.sin(along * 53) * Math.sin(upness * 31) > 0.45) c.set(0x7a5a2b);
        return c;
      },
      12
    ),
    flatFin(
      [
        [0, 0.05],
        [-0.14, 0.09],
        [-0.14, -0.09],
        [0, -0.05],
      ],
      (a, b) => [0, b, a - 0.29],
      0xd9a441
    ),
    ...[-1, 1].map((side) =>
      flatFin(
        [
          [0, 0],
          [-0.1, 0.07],
          [-0.12, -0.05],
        ],
        (a, b) => [side * (0.17 - a * 0.5), b - 0.02, a + 0.02],
        0xd9a441
      )
    ),
    ball(0.045, [0.115, 0.07, 0.17], 0xffffff, 7),
    ball(0.045, [-0.115, 0.07, 0.17], 0xffffff, 7),
    ball(0.024, [0.15, 0.075, 0.185], 0x0b1220, 6),
    ball(0.024, [-0.15, 0.075, 0.185], 0x0b1220, 6),
  ]);
  body.add(new THREE.Mesh(shape, material));

  // Spikes lie hidden (scaled to nothing) until the fish puffs up.
  const spikeParts: THREE.BufferGeometry[] = [];
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  for (let i = 0; i < 46; i++) {
    const y = 1 - (i / 45) * 2;
    const ringR = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    dir.set(Math.cos(a) * ringR, y, Math.sin(a) * ringR);
    const spike = new THREE.ConeGeometry(0.018, 0.1, 4);
    spike.translate(0, 0.05, 0);
    spike.applyQuaternion(q.setFromUnitVectors(up, dir));
    spike.translate(dir.x * 0.185, dir.y * 0.195, dir.z * 0.2);
    spikeParts.push(paint(spike, () => 0xfff3c4));
  }
  const spikes = new THREE.Mesh(join(spikeParts), material);
  spikes.scale.setScalar(0.001);
  body.add(spikes);

  return { group, body, spikes };
}

// ---------------------------------------------------------------------------
// Seahorse
// ---------------------------------------------------------------------------
export function createSeahorse(colorHex: number): { group: THREE.Group; fin: THREE.Mesh } {
  const group = new THREE.Group();
  const material = skin({ roughness: 0.55 });
  const main = new THREE.Color(colorHex);
  const dark = main.clone().multiplyScalar(0.6);
  // Upright S-shaped body from the neck, through the belly, down to a curled tail.
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.36, 0.02),
    new THREE.Vector3(0, 0.26, -0.03),
    new THREE.Vector3(0, 0.1, 0.03), // belly pushes forward
    new THREE.Vector3(0, -0.08, -0.02),
    new THREE.Vector3(0, -0.24, -0.02),
    new THREE.Vector3(0, -0.34, 0.05),
    new THREE.Vector3(0, -0.3, 0.13), // tail curls forward and up
    new THREE.Vector3(0, -0.22, 0.1),
    new THREE.Vector3(0, -0.25, 0.05),
  ]);
  const parts: THREE.BufferGeometry[] = [
    tubeAlong(
      spine,
      (t) => (t < 0.35 ? 0.045 + Math.sin((t / 0.35) * Math.PI) * 0.045 : 0.06 * Math.pow(1 - (t - 0.35) / 0.65, 1.1) + 0.012),
      // Bony rings down the body
      (t) => (Math.sin(t * 70) > 0.3 ? main : dark),
      34,
      7
    ),
    // Head, tilted down, with the long tube snout
    loftBody(
      [
        { z: 0.3, w: 0.0, top: 0.0, bottom: -0.01 },
        { z: 0.27, w: 0.02, top: 0.02, bottom: -0.025 },
        { z: 0.12, w: 0.022, top: 0.025, bottom: -0.03 }, // snout
        { z: 0.06, w: 0.055, top: 0.075, bottom: -0.06 },
        { z: -0.03, w: 0.055, top: 0.085, bottom: -0.05 },
        { z: -0.1, w: 0.0, top: 0.03, bottom: 0.0 },
      ],
      () => main,
      8
    )
      .rotateX(0.55)
      .translate(0, 0.42, 0.03),
    // Little crown
    flatFin(
      [
        [-0.04, 0],
        [-0.03, 0.06],
        [0, 0.03],
        [0.02, 0.06],
        [0.03, 0],
      ],
      (a, b) => [0, b + 0.49, a - 0.03],
      dark
    ),
    ball(0.016, [0.05, 0.435, 0.06], 0x0b1220, 6),
    ball(0.016, [-0.05, 0.435, 0.06], 0x0b1220, 6),
  ];
  group.add(new THREE.Mesh(join(parts), material));

  // Fluttering back fin
  const fin = new THREE.Mesh(
    flatFin(
      [
        [0, -0.07],
        [-0.1, -0.05],
        [-0.12, 0.03],
        [-0.08, 0.08],
        [0, 0.07],
      ],
      (a, b) => [0, b, a],
      0xfff7d6
    ),
    material
  );
  fin.position.set(0, 0.13, -0.03);
  group.add(fin);
  return { group, fin };
}

// ---------------------------------------------------------------------------
// Octopus
// ---------------------------------------------------------------------------
export function createOctopus(colorHex = 0xd9573b): {
  group: THREE.Group;
  mantle: THREE.Mesh;
  arms: THREE.Group[];
} {
  const group = new THREE.Group();
  const material = skin({ roughness: 0.6 });
  const main = new THREE.Color(colorHex);
  const pale = main.clone().lerp(new THREE.Color(0xfff1e6), 0.7);

  // Baggy mantle leaning back behind the eyes
  const mantleGeo = join([
    loftBody(
      [
        { z: 0.3, w: 0.0, top: 0.12, bottom: 0.08 },
        { z: 0.24, w: 0.2, top: 0.3, bottom: -0.02 },
        { z: 0.0, w: 0.34, top: 0.52, bottom: -0.04 },
        { z: -0.35, w: 0.36, top: 0.62, bottom: 0.0 },
        { z: -0.7, w: 0.24, top: 0.5, bottom: 0.12 },
        { z: -0.86, w: 0.0, top: 0.34, bottom: 0.3 },
      ],
      (along, upness) => {
        const c = main.clone();
        if (upness < -0.3) c.lerp(pale, 0.8);
        if (upness > 0 && Math.sin(along * 37) * Math.sin(upness * 23) > 0.5) c.multiplyScalar(0.72);
        return c;
      },
      14
    ),
    ball(0.07, [0.17, 0.36, 0.2], 0xfff7e0, 8),
    ball(0.07, [-0.17, 0.36, 0.2], 0xfff7e0, 8),
    ball(0.036, [0.2, 0.37, 0.25], 0x0b1220, 6),
    ball(0.036, [-0.2, 0.37, 0.25], 0x0b1220, 6),
  ]);
  const mantle = new THREE.Mesh(mantleGeo, material);
  group.add(mantle);

  // Eight arms fanned out around the body, each curling at the tip.
  const arms: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.1, 0.05);
    pivot.rotation.y = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const reach = 0.85 + (i % 3) * 0.12;
    const arm = tubeAlong(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.05, 0.12),
        new THREE.Vector3(0, -0.02, reach * 0.4),
        new THREE.Vector3(0.06, -0.07, reach * 0.75),
        new THREE.Vector3(0.16, -0.06, reach),
        new THREE.Vector3(0.24, 0.0, reach * 0.9), // curled tip
      ]),
      (t) => 0.085 * Math.pow(1 - t, 0.9) + 0.012,
      (t) => (Math.sin(t * 46) > 0.2 ? main : pale),
      18,
      6
    );
    pivot.add(new THREE.Mesh(arm, material));
    group.add(pivot);
    arms.push(pivot);
  }
  return { group, mantle, arms };
}
