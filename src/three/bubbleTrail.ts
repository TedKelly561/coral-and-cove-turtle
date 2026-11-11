import * as THREE from 'three';

// Module-scope reusable math objects for Zero GC in the animation loop
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _tipLeft = new THREE.Vector3();
const _tipRight = new THREE.Vector3();
const _shellWake = new THREE.Vector3();
const _backwardDir = new THREE.Vector3();
const _color = new THREE.Color();

interface TrailBubbleParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxLife: number;
  baseRadius: number;
  wobblePhase: number;
  wobbleFreq: number;
  wobbleAmp: number;
  isVortexSpiral: boolean;
}

export interface TurtleTrailEmitterInput {
  pos: THREE.Vector3;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
  acceleration: number;
  isBoosting: boolean;
  barrelRollProgress: number; // > 0 when actively performing a barrel roll
  isMother: boolean;
  leftFlipperGroup: THREE.Group;
  rightFlipperGroup: THREE.Group;
}

export class TurtleBubbleTrailSystem {
  public readonly instancedMesh: THREE.InstancedMesh;
  private readonly count: number = 480;
  private readonly particles: TrailBubbleParticle[] = [];
  private cursor: number = 0;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    const geo = new THREE.SphereGeometry(0.12, 12, 12);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0x0284c7,
      emissiveIntensity: 0.28,
      roughness: 0.04,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      iridescence: isSoftwareGl ? 0 : 0.95,
      iridescenceIOR: 1.33,
      iridescenceThicknessRange: [100, 420],
      transmission: isSoftwareGl ? 0 : 0.86,
      transparent: true,
      opacity: isSoftwareGl ? 0.65 : 0.94,
      depthWrite: false,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, this.count);
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.renderOrder = 4;

    // Rich underwater jewel bubble spectrum: iridescent turquoise, bioluminescent cyan, sunlit golden amber, coral pink & pearl violet
    const palette = [
      0x67e8f9, // Electric Cyan
      0x5eead4, // Iridescent Turquoise
      0xa5f3fc, // Crystal Aqua
      0xfde047, // Sunlight Gold
      0xf472b6, // Coral Blossom Pink
      0xc084fc, // Deep Pearl Violet
      0x34d399, // Sea Emerald
      0xe0f2fe, // Luminous Seafoam White
    ];
    for (let i = 0; i < this.count; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        age: 0,
        maxLife: 1.8,
        baseRadius: 0.6,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq: 6 + Math.random() * 5,
        wobbleAmp: 0.25 + Math.random() * 0.35,
        isVortexSpiral: false,
      });

      _color.setHex(palette[i % palette.length]);
      this.instancedMesh.setColorAt(i, _color);

      _mat4.makeScale(0.0001, 0.0001, 0.0001);
      this.instancedMesh.setMatrixAt(i, _mat4);
    }

    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.instancedMesh);
  }

  public spawnParticle(
    origin: THREE.Vector3,
    initialVel: THREE.Vector3,
    radiusScale: number,
    maxLife: number,
    isVortexSpiral: boolean,
    tintHex?: number
  ) {
    // Only emit underwater
    if (origin.y > -0.08) return;

    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const p = this.particles[idx];

    p.active = true;
    p.pos.copy(origin);
    p.vel.copy(initialVel);
    p.age = 0;
    p.maxLife = maxLife;
    p.baseRadius = radiusScale;
    p.wobblePhase = Math.random() * Math.PI * 2;
    p.wobbleFreq = isVortexSpiral ? 11 + Math.random() * 4 : 5.5 + Math.random() * 4;
    p.wobbleAmp = isVortexSpiral ? 0.55 : 0.22;
    p.isVortexSpiral = isVortexSpiral;

    if (tintHex && this.instancedMesh.instanceColor) {
      _color.setHex(tintHex);
      this.instancedMesh.setColorAt(idx, _color);
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  public emitForTurtle(dt: number, input: TurtleTrailEmitterInput) {
    // No underwater bubbles if basking on dry beach above water
    if (input.pos.y > -0.1) return;

    const absSpeed = Math.abs(input.speed);
    const isRolling = input.barrelRollProgress > 0;
    const isAccelerating = input.acceleration > 1.4 || input.isBoosting;

    // Extract accurate world-space coordinates of left & right hydrofoil flipper tips
    const tipOffset = input.isMother ? 1.25 : 0.72;
    _tipLeft.set(-tipOffset, 0, 0.05);
    input.leftFlipperGroup.localToWorld(_tipLeft);

    _tipRight.set(tipOffset, 0, 0.05);
    input.rightFlipperGroup.localToWorld(_tipRight);

    // Trailing carapace wake point
    _backwardDir.set(-Math.sin(input.heading), 0, -Math.cos(input.heading));
    _shellWake
      .copy(input.pos)
      .addScaledVector(_backwardDir, input.isMother ? 1.45 : 0.78);

    // 1. BARREL ROLL CORKSCREW VORTEX STREAM (High density double-helix from both flipper tips)
    if (isRolling) {
      const bursts = 4;
      for (let b = 0; b < bursts; b++) {
        const spiralAngle = input.barrelRollProgress * Math.PI * 4 + b * 0.8;
        const radialPush = 1.65;

        // Left flipper tip vortex bubble
        _pos.copy(_tipLeft).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.18
          )
        );
        const velL = new THREE.Vector3(
          _backwardDir.x * absSpeed * 0.45 + Math.cos(spiralAngle) * radialPush,
          0.65 + Math.sin(spiralAngle) * radialPush,
          _backwardDir.z * absSpeed * 0.45
        );
        this.spawnParticle(
          _pos,
          velL,
          (input.isMother ? 0.95 : 0.68) * (0.6 + Math.random() * 0.6),
          1.4 + Math.random() * 0.7,
          true,
          input.isMother ? 0x5eead4 : 0xfde047
        );

        // Right flipper tip vortex bubble
        _pos.copy(_tipRight).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.18
          )
        );
        const velR = new THREE.Vector3(
          _backwardDir.x * absSpeed * 0.45 - Math.cos(spiralAngle) * radialPush,
          0.65 - Math.sin(spiralAngle) * radialPush,
          _backwardDir.z * absSpeed * 0.45
        );
        this.spawnParticle(
          _pos,
          velR,
          (input.isMother ? 0.95 : 0.68) * (0.6 + Math.random() * 0.6),
          1.4 + Math.random() * 0.7,
          true,
          input.isMother ? 0x67e8f9 : 0xf472b6
        );
      }
    }

    // 2. ACCELERATION & FLIPPER BOOST HYDROFOIL WAKE STREAM
    if (isAccelerating || absSpeed > 3.6) {
      const emitChance = isAccelerating ? 1.0 : Math.min(0.85, (absSpeed - 3.2) * 0.25);
      const countPerFrame = input.isBoosting ? 3 : isAccelerating ? 2 : 1;

      for (let i = 0; i < countPerFrame; i++) {
        if (Math.random() > emitChance) continue;

        const source = i % 3 === 0 ? _tipLeft : i % 3 === 1 ? _tipRight : _shellWake;
        _pos.copy(source).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.28,
            (Math.random() - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.28
          )
        );

        // Wake velocity: pushed opposite to swim direction + turbulent spread
        const wakeSpeed = Math.max(1.2, absSpeed * 0.55);
        const vel = new THREE.Vector3(
          _backwardDir.x * wakeSpeed + (Math.random() - 0.5) * 1.1,
          0.45 + Math.random() * 0.65 - input.pitch * 1.2,
          _backwardDir.z * wakeSpeed + (Math.random() - 0.5) * 1.1
        );

        const sizeScale = (input.isMother ? 0.85 : 0.58) * (0.5 + Math.random() * 0.75);
        const wakePalette = [0x5eead4, 0x67e8f9, 0xa5f3fc, 0xfde047, 0xf472b6, 0xc084fc];
        const bubbleColor = input.isBoosting
          ? 0x38bdf8
          : wakePalette[Math.floor(Math.random() * wakePalette.length)];

        this.spawnParticle(
          _pos,
          vel,
          sizeScale,
          1.3 + Math.random() * 0.9,
          false,
          bubbleColor
        );
      }
    } else if (absSpeed > 0.8 && Math.random() < 0.22) {
      // 3. Gentle ambient breathing & swimming bubbles: tiny occasional bubbles trailing the carapace
      _pos.copy(_shellWake).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.22,
          (Math.random() - 0.5) * 0.14,
          (Math.random() - 0.5) * 0.22
        )
      );
      const gentleVel = new THREE.Vector3(
        _backwardDir.x * 0.4 + (Math.random() - 0.5) * 0.35,
        0.5 + Math.random() * 0.4,
        _backwardDir.z * 0.4 + (Math.random() - 0.5) * 0.35
      );
      this.spawnParticle(
        _pos,
        gentleVel,
        (input.isMother ? 0.55 : 0.38) * (0.6 + Math.random() * 0.5),
        1.1 + Math.random() * 0.6,
        false,
        input.isMother ? 0xa5f3fc : 0xfde047
      );
    }
  }

  public update(dt: number, elapsed: number) {
    // Exponential water drag factor: bubbles shed horizontal momentum quickly and rise by buoyancy
    const fluidDrag = Math.exp(-3.4 * dt);

    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxLife || p.pos.y >= -0.04) {
        p.active = false;
        _mat4.makeScale(0.0001, 0.0001, 0.0001);
        this.instancedMesh.setMatrixAt(i, _mat4);
        continue;
      }

      // Apply fluid drag to horizontal wake velocity and add upward buoyancy acceleration
      p.vel.x *= fluidDrag;
      p.vel.z *= fluidDrag;
      p.vel.y = THREE.MathUtils.lerp(p.vel.y, 1.45 + p.baseRadius * 0.6, dt * 2.8);

      // Integrate position + helical hydrodynamic vortex oscillation
      const lifeRatio = p.age / p.maxLife;
      const wobbleRadius = p.wobbleAmp * (1.0 - lifeRatio * 0.4) * dt;
      const angle = elapsed * p.wobbleFreq + p.wobblePhase;

      p.pos.x += p.vel.x * dt + Math.cos(angle) * wobbleRadius;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt + Math.sin(angle) * wobbleRadius;

      // Scale envelope: quick pop-in, oblate spheroid squash from water pressure, smooth fade-out
      const popIn = Math.min(1.0, p.age * 9.0);
      const fadeOut = 1.0 - Math.pow(lifeRatio, 2.2);
      const s = p.baseRadius * popIn * fadeOut;

      // Rising bubbles flatten slightly along Y due to hydrodynamic pressure
      _scale.set(s * 1.08, s * 0.84, s * 1.08);
      _mat4.compose(p.pos, _quat, _scale);
      this.instancedMesh.setMatrixAt(i, _mat4);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose() {
    this.instancedMesh.geometry.dispose();
    if (Array.isArray(this.instancedMesh.material)) {
      this.instancedMesh.material.forEach((m) => m.dispose());
    } else {
      this.instancedMesh.material.dispose();
    }
  }
}
