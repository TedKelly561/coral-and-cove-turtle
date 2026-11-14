import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraMode,
  CollectibleItem,
  ControllerStatus,
  GameHudState,
  GameScreenState,
  StoryLandmark,
  WeatherMood,
  WildlifeSighting,
} from '../types/game';
import { createProceduralTextures } from '../three/textures';
import {
  CollectibleObject3D,
  createCollectibleModel,
  createSeaTurtle,
  createStoryLandmarkModel,
  updateCollectibleFade,
} from '../three/models';
import {
  buildOceanWorld,
  getCurrentVectorAt,
  getZoneNameAt,
  groundHeightAt,
  resolveSolidObstacles,
  grottoDepthFactor,
  sampleFootprintGround,
} from '../three/world';
import { TurtleBubbleTrailSystem } from '../three/bubbleTrail';
import { oceanAudio } from '../audio/oceanAudio';

// Module-scope reusable math helpers for Zero GC in the animation loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _currentVec = new THREE.Vector3();
const _skyColor = new THREE.Color();
const _underwaterFogColor = new THREE.Color();
const _grottoFogColor = new THREE.Color(0x070b24);
const _sunColor = new THREE.Color();
const _hemiSkyColor = new THREE.Color();
const _hemiGroundColor = new THREE.Color();
const _pointerNdc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

export interface OceanCanvasHandle {
  captureSnapshot: () => string;
  triggerTurtleSong: (who: 'mom' | 'baby') => void;
  triggerBarrelRoll: (who: 'mom' | 'baby' | 'both') => void;
  triggerMunchSeaweed: () => void;
  setExternalVertical: (dir: number) => void;
  teleportToZone: (x: number, y: number, z: number) => void;
  getPositions: () => { mom: [number, number, number]; baby: [number, number, number] };
  setPositions: (mom: [number, number, number], baby: [number, number, number]) => void;
}

interface OceanCanvasProps {
  screenState: GameScreenState;
  cameraMode: CameraMode;
  dayTimeHours: number;
  autoCycleTime: boolean;
  weatherMood: WeatherMood;
  babyFollowingMom: boolean;
  piggybackActive: boolean;
  collectibles: CollectibleItem[];
  landmarks: StoryLandmark[];
  wildlife: WildlifeSighting[];
  onDiscoverCollectible: (id: string, by: 'mom' | 'baby' | 'both') => void;
  onInspectLandmark: (id: string) => void;
  onMeetWildlife: (id: string, befriended?: boolean) => void;
  onMunchSeaweed: (zoneName: string) => void;
  onUpdateHud: (partial: Partial<GameHudState>) => void;
  onUpdateControllers: (status: ControllerStatus) => void;
  onTogglePause: () => void;
  onTogglePiggyback: () => void;
}

export const OceanCanvas = forwardRef<OceanCanvasHandle, OceanCanvasProps>((props, ref) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef(props);
  propsRef.current = props;

  const simRef = useRef<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    mainCamera: THREE.PerspectiveCamera | null;
    momPos: THREE.Vector3;
    babyPos: THREE.Vector3;
    momCallTimer: number;
    babyCallTimer: number;
    momBarrelRoll: number;
    babyBarrelRoll: number;
    momMunchTimer: number;
    babyMunchTimer: number;
    externalVerticalDir: number;
    collectibleObjs: CollectibleObject3D[];
    requestMunch: boolean;
  }>({
    renderer: null,
    scene: null,
    mainCamera: null,
    momPos: new THREE.Vector3(-2.5, -2.8, 4),
    babyPos: new THREE.Vector3(1.8, -2.5, 5.2),
    momCallTimer: 0,
    babyCallTimer: 0,
    momBarrelRoll: 0,
    babyBarrelRoll: 0,
    momMunchTimer: 0,
    babyMunchTimer: 0,
    externalVerticalDir: 0,
    collectibleObjs: [],
    requestMunch: false,
  });

  useImperativeHandle(ref, () => ({
    captureSnapshot: () => {
      const { renderer, scene, mainCamera } = simRef.current;
      if (!renderer || !scene || !mainCamera) return '';
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
      renderer.render(scene, mainCamera);
      return renderer.domElement.toDataURL('image/png');
    },
    triggerTurtleSong: (who: 'mom' | 'baby') => {
      if (who === 'mom') {
        simRef.current.momCallTimer = 1.6;
        oceanAudio.playTurtleCall(true);
      } else {
        simRef.current.babyCallTimer = 1.6;
        oceanAudio.playTurtleCall(false);
      }
    },
    triggerBarrelRoll: (who: 'mom' | 'baby' | 'both') => {
      if (who === 'mom' || who === 'both') {
        simRef.current.momBarrelRoll = 1.0;
        oceanAudio.playBarrelRollBubbles(true);
      }
      if (who === 'baby' || who === 'both') {
        simRef.current.babyBarrelRoll = 1.0;
        oceanAudio.playBarrelRollBubbles(false);
      }
    },
    triggerMunchSeaweed: () => {
      simRef.current.requestMunch = true;
    },
    setExternalVertical: (dir: number) => {
      simRef.current.externalVerticalDir = dir;
    },
    teleportToZone: (x: number, y: number, z: number) => {
      const safeY = Math.max(groundHeightAt(x, z) + 0.85, y);
      simRef.current.momPos.set(x, safeY, z);
      simRef.current.babyPos.set(
        x + 2.4,
        Math.max(groundHeightAt(x + 2.4, z + 1.2) + 0.65, safeY + 0.3),
        z + 1.2
      );
    },
    getPositions: () => ({
      mom: [
        Number(simRef.current.momPos.x.toFixed(2)),
        Number(simRef.current.momPos.y.toFixed(2)),
        Number(simRef.current.momPos.z.toFixed(2)),
      ],
      baby: [
        Number(simRef.current.babyPos.x.toFixed(2)),
        Number(simRef.current.babyPos.y.toFixed(2)),
        Number(simRef.current.babyPos.z.toFixed(2)),
      ],
    }),
    setPositions: (mom, baby) => {
      simRef.current.momPos.set(mom[0], mom[1], mom[2]);
      simRef.current.babyPos.set(baby[0], baby[1], baby[2]);
    },
  }));

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    // 1. Software-WebGL Guard & Renderer Initialization (Three.js r160+)
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c4a6e);
    const sceneFog = new THREE.FogExp2(0x0c4a6e, 0.015);
    scene.fog = sceneFog;

    // 2. Mandatory Studio Environment Reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const mainCamera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.2,
      240
    );
    mainCamera.position.set(0, 2.5, 16);

    const splitCamMom = new THREE.PerspectiveCamera(
      58,
      (window.innerWidth * 0.5) / window.innerHeight,
      0.2,
      240
    );
    const splitCamBaby = new THREE.PerspectiveCamera(
      58,
      (window.innerWidth * 0.5) / window.innerHeight,
      0.2,
      240
    );

    // 3. Balanced Studio & Solar Lighting Rig
    const sunKeyLight = new THREE.DirectionalLight(0xfff4d6, 2.4);
    sunKeyLight.position.set(35, 65, 25);
    sunKeyLight.castShadow = !isSoftwareGl;
    const d = 55;
    sunKeyLight.shadow.camera.left = -d;
    sunKeyLight.shadow.camera.right = d;
    sunKeyLight.shadow.camera.top = d;
    sunKeyLight.shadow.camera.bottom = -d;
    sunKeyLight.shadow.camera.near = 1;
    sunKeyLight.shadow.camera.far = 160;
    sunKeyLight.shadow.mapSize.set(1024, 1024);
    sunKeyLight.shadow.bias = -0.0005;
    sunKeyLight.shadow.normalBias = 0.02;
    scene.add(sunKeyLight);

    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x0f766e, 1.35);
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-40, 25, -45);
    scene.add(rimLight);

    const celestialSphere = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, fog: false })
    );
    scene.add(celestialSphere);

    // 4. Procedural Textures, Ocean World, Turtles, Collectibles & Hydrodynamic Bubble Trail System
    const textures = createProceduralTextures(renderer);
    const worldRig = buildOceanWorld(scene, textures);

    const momTurtle = createSeaTurtle(true, textures);
    const babyTurtle = createSeaTurtle(false, textures);
    scene.add(momTurtle.group, babyTurtle.group);

    // Dedicated Hydrodynamic Flipper-Tip Bubble Trail & Vortex Particle System
    const bubbleTrailSystem = new TurtleBubbleTrailSystem(scene, isSoftwareGl);

    // Collectible 3D Models
    const collectibleObjs: CollectibleObject3D[] = propsRef.current.collectibles.map((item) => {
      const gy = groundHeightAt(item.position[0], item.position[2]);
      const obj = createCollectibleModel(item, textures, gy);
      scene.add(obj.group);
      return obj;
    });

    // Environmental Storytelling Landmark Monuments (including Coconut Cove Lighthouse & Hatchery!)
    const landmarkGroups = propsRef.current.landmarks.map((lm) => {
      const gy = groundHeightAt(lm.position[0], lm.position[2]);
      const grp = createStoryLandmarkModel(lm, gy, textures);
      scene.add(grp);
      return { landmark: lm, group: grp };
    });

    simRef.current.renderer = renderer;
    simRef.current.scene = scene;
    simRef.current.mainCamera = mainCamera;
    simRef.current.collectibleObjs = collectibleObjs;

    if (!isSoftwareGl) {
      renderer.compile(scene, mainCamera);
    }

    // 5. Direct Click/Tap Raycasting on Collectibles ("Select a treasure, and that object should fade away")
    const onPointerDown = (e: PointerEvent) => {
      if (propsRef.current.screenState !== 'playing') return;
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointerNdc, mainCamera);
      const activeCollectibleGroups = collectibleObjs
        .filter((c) => !c.item.discovered && c.group.visible)
        .map((c) => c.group);

      const hits = _raycaster.intersectObjects(activeCollectibleGroups, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.collectibleId) {
          obj = obj.parent;
        }
        const clickedId = obj?.userData?.collectibleId as string | undefined;
        if (clickedId) {
          const targetObj = collectibleObjs.find((c) => c.item.id === clickedId);
          if (targetObj && !targetObj.item.discovered) {
            targetObj.item.discovered = true;
            oceanAudio.playTreasureChime();
            // Emit celebratory rising bubble burst around the selected treasure
            for (let b = 0; b < 24; b++) {
              bubbleTrailSystem.spawnParticle(
                targetObj.group.position
                  .clone()
                  .add(
                    new THREE.Vector3(
                      (Math.random() - 0.5) * 1.4,
                      0.5 + Math.random() * 0.8,
                      (Math.random() - 0.5) * 1.4
                    )
                  ),
                new THREE.Vector3(
                  (Math.random() - 0.5) * 1.8,
                  1.8 + Math.random() * 1.6,
                  (Math.random() - 0.5) * 1.8
                ),
                0.85 + Math.random() * 0.65,
                1.6 + Math.random() * 0.8,
                true,
                0xfde047
              );
            }
            propsRef.current.onDiscoverCollectible(clickedId, 'both');
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // 6. Responsive Keyboard & Dual Gamepad Input State
    const heldKeys = new Set<string>();
    const justPressedKeys = new Set<string>();
    const prevPadButtons: boolean[][] = [[], []];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const code = e.code;
      if (!heldKeys.has(code)) {
        justPressedKeys.add(code);
      }
      heldKeys.add(code);
      oceanAudio.init();

      if (code === 'Escape') {
        propsRef.current.onTogglePause();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
    };

    const onWindowBlur = () => {
      heldKeys.clear();
      justPressedKeys.clear();
      simRef.current.externalVerticalDir = 0;
    };

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      mainCamera.aspect = w / h;
      mainCamera.updateProjectionMatrix();

      splitCamMom.aspect = (w * 0.5) / h;
      splitCamMom.updateProjectionMatrix();
      splitCamBaby.aspect = (w * 0.5) / h;
      splitCamBaby.updateProjectionMatrix();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('resize', onResize);

    // Kinematics State for Mother ("Kaimana") and Baby ("Lani")
    let momHeading = Math.PI;
    let momPitch = 0;
    let momRoll = 0;
    let momSpeed = 0;
    let prevMomSpeed = 0;
    let momSwimPhase = 0;

    let babyHeading = Math.PI;
    let babyPitch = 0;
    let babyRoll = 0;
    let babySpeed = 0;
    let prevBabySpeed = 0;
    let babySwimPhase = 1.2;

    const camLookTarget = new THREE.Vector3(0, -2.5, 0);
    const splitLookMom = new THREE.Vector3();
    const splitLookBaby = new THREE.Vector3();

    let hudSyncTimer = 0;
    let localSolarHours = propsRef.current.dayTimeHours;
    let lastPropsSolarHours = propsRef.current.dayTimeHours;

    // 7. Software-WebGL Safe Pacing Loop
    let frameId = 0;
    let isDisposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = clock.getElapsedTime();
      const currentProps = propsRef.current;

      if (Math.abs(currentProps.dayTimeHours - lastPropsSolarHours) > 0.05) {
        localSolarHours = currentProps.dayTimeHours;
        lastPropsSolarHours = currentProps.dayTimeHours;
      } else if (currentProps.autoCycleTime && currentProps.screenState === 'playing') {
        localSolarHours = (localSolarHours + dt * 0.066) % 24;
      }

      // Compute Dynamic Day/Night Solar & Lunar Lighting
      const sunAngle = ((localSolarHours - 6) / 24) * Math.PI * 2;
      const sunElev = Math.sin(sunAngle);
      const sunHoriz = Math.cos(sunAngle);

      const dayFactor = THREE.MathUtils.smoothstep(sunElev, -0.22, 0.35);
      const nightFactor = 1.0 - dayFactor;
      const goldenHourFactor = Math.max(0, 1.0 - Math.abs(sunElev - 0.08) * 3.2);

      sunKeyLight.position.set(sunHoriz * 75, Math.max(12, Math.abs(sunElev) * 78), 28);
      celestialSphere.position.set(
        sunHoriz * 115,
        Math.max(8, sunElev >= 0 ? sunElev * 85 : -sunElev * 65),
        -75
      );
      (celestialSphere.material as THREE.MeshBasicMaterial).color.setHex(
        sunElev >= -0.05 ? 0xfef08a : 0xe0f2fe
      );

      const isRainWeather = currentProps.weatherMood === 'gentle_rain';
      const isMistWeather = currentProps.weatherMood === 'misty_morning';

      _sunColor.setHex(0xfffbeb).lerp(new THREE.Color(0xfb923c), goldenHourFactor * 0.75);
      if (isRainWeather) {
        _sunColor.lerp(new THREE.Color(0xbae6fd), 0.55);
      } else if (isMistWeather) {
        _sunColor.lerp(new THREE.Color(0xfde68a), 0.42);
      }
      if (nightFactor > 0.5) {
        _sunColor.lerp(new THREE.Color(0x38bdf8), (nightFactor - 0.5) * 2);
      }
      sunKeyLight.color.copy(_sunColor);
      const baseSunIntensity = THREE.MathUtils.lerp(0.85, 2.55, dayFactor);
      // Twilight inside the Bioluminescent Grotto: daylight falls away so the glow can read.
      const grottoFactor = grottoDepthFactor(
        simRef.current.momPos.x,
        simRef.current.momPos.y,
        simRef.current.momPos.z
      );
      sunKeyLight.intensity =
        (isRainWeather
          ? baseSunIntensity * 0.62
          : isMistWeather
            ? baseSunIntensity * 0.78
            : baseSunIntensity) *
        (1 - grottoFactor * 0.94);
      hemiLight.intensity = 1.35 * (1 - grottoFactor * 0.86);
      rimLight.intensity = 0.75 * (1 - grottoFactor * 0.8);
      // The studio reflection map is a constant fill light. Left alone it keeps the
      // whole world daylight-bright at night and inside the grotto.
      scene.environmentIntensity =
        THREE.MathUtils.lerp(0.35, 1.0, dayFactor) * (1 - grottoFactor * 0.85);

      _hemiSkyColor
        .setHex(0x0f172a)
        .lerp(new THREE.Color(0x7dd3fc), dayFactor)
        .lerp(new THREE.Color(0xfda4af), goldenHourFactor * 0.45);
      if (isRainWeather) {
        _hemiSkyColor.lerp(new THREE.Color(0x64748b), 0.55 * dayFactor);
      } else if (isMistWeather) {
        _hemiSkyColor.lerp(new THREE.Color(0xe2e8f0), 0.6 * dayFactor);
      }
      _hemiGroundColor.setHex(0x042f2e).lerp(new THREE.Color(0x0d9488), dayFactor);
      hemiLight.color.copy(_hemiSkyColor);
      hemiLight.groundColor.copy(_hemiGroundColor);

      // Poll PC Gamepads
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad1 = gamepads[0] || null;
      const pad2 = gamepads[1] || null;

      const applyDeadzone = (val: number, dz = 0.16) =>
        Math.abs(val) < dz ? 0 : (val - Math.sign(val) * dz) / (1 - dz);

      const isPadJustPressed = (pad: Gamepad | null, padIdx: number, btnIdx: number): boolean => {
        if (!pad || !pad.buttons[btnIdx]) return false;
        const pressed = pad.buttons[btnIdx].pressed;
        const wasPressed = prevPadButtons[padIdx][btnIdx] || false;
        prevPadButtons[padIdx][btnIdx] = pressed;
        return pressed && !wasPressed;
      };

      if (isPadJustPressed(pad1, 0, 9) || isPadJustPressed(pad2, 1, 9)) {
        currentProps.onTogglePause();
      }

      const momPos = simRef.current.momPos;
      const babyPos = simRef.current.babyPos;
      let p1Boost = false;
      let p2Boost = false;
      let isSinglePlayerBaby = false;
      let isSinglePlayerMom = false;

      if (currentProps.screenState === 'playing') {
        // --- PLAYER 1: MOTHER TURTLE ("KAIMANA") INPUT ---
        let p1Turn = 0;
        let p1Forward = 0;
        let p1Vertical = simRef.current.externalVerticalDir;
        let p1Sing = false;
        let p1BarrelRoll = false;
        let p1Munch = simRef.current.requestMunch;
        simRef.current.requestMunch = false;

        if (heldKeys.has('KeyA')) p1Turn += 1;
        if (heldKeys.has('KeyD')) p1Turn -= 1;
        if (heldKeys.has('KeyW')) p1Forward += 1;
        if (heldKeys.has('KeyS')) p1Forward -= 0.6;
        // Multiple intuitive Up / Down keys for Player 1
        if (heldKeys.has('Space') || heldKeys.has('KeyR')) p1Vertical += 1;
        if (heldKeys.has('KeyC') || heldKeys.has('ShiftLeft') || heldKeys.has('KeyF'))
          p1Vertical -= 1;
        if (heldKeys.has('KeyQ')) p1Boost = true;
        if (justPressedKeys.has('KeyE')) p1Sing = true;
        if (justPressedKeys.has('KeyB') || justPressedKeys.has('KeyV')) p1BarrelRoll = true;
        if (justPressedKeys.has('KeyG')) p1Munch = true;

        if (pad1) {
          const lx = applyDeadzone(pad1.axes[0] || 0);
          const ly = applyDeadzone(pad1.axes[1] || 0);
          const ry = applyDeadzone(pad1.axes[3] || 0);
          p1Turn -= lx;
          p1Forward += -ly;
          p1Vertical += -ry;
          // Gamepad Up: A (0), RT (7), or D-Pad Up (12)
          if (
            pad1.buttons[0]?.pressed ||
            pad1.buttons[7]?.pressed ||
            pad1.buttons[12]?.pressed
          ) {
            p1Vertical += 1;
          }
          // Gamepad Down: B (1), LT (6), or D-Pad Down (13)
          if (
            pad1.buttons[1]?.pressed ||
            pad1.buttons[6]?.pressed ||
            pad1.buttons[13]?.pressed
          ) {
            p1Vertical -= 1;
          }
          // Boost: X (2) or RB (5)
          if (pad1.buttons[2]?.pressed || pad1.buttons[5]?.pressed) p1Boost = true;
          // Sing & Befriend: Y (3)
          if (isPadJustPressed(pad1, 0, 3)) p1Sing = true;
          // Barrel Roll: LB (4) or Right Stick Click (11)
          if (isPadJustPressed(pad1, 0, 4) || isPadJustPressed(pad1, 0, 11)) {
            p1BarrelRoll = true;
          }
        }

        if (p1Sing) {
          simRef.current.momCallTimer = 1.6;
          oceanAudio.playTurtleCall(true);
        }
        if (p1BarrelRoll && simRef.current.momBarrelRoll <= 0.05) {
          simRef.current.momBarrelRoll = 1.0;
          oceanAudio.playBarrelRollBubbles(true);
          if (currentProps.babyFollowingMom) {
            simRef.current.babyBarrelRoll = 1.0;
          }
        }
        if (justPressedKeys.has('KeyQ') || isPadJustPressed(pad1, 0, 2)) {
          oceanAudio.playSwimWhoosh();
        }

        // Advance Mother Turtle Physics (with Barrel Roll forward surge)
        const isMomRolling = simRef.current.momBarrelRoll > 0;
        const maxMomSpeed = p1Boost || isMomRolling ? 8.6 : 5.2;
        const targetMomSpeed =
          Math.max(-2.2, Math.min(1, p1Forward + (isMomRolling ? 0.65 : 0))) * maxMomSpeed;
        prevMomSpeed = momSpeed;
        momSpeed = THREE.MathUtils.damp(momSpeed, targetMomSpeed, 4.5, dt);
        momHeading += p1Turn * 1.95 * dt;
        momRoll = THREE.MathUtils.damp(momRoll, -p1Turn * 0.34, 5.0, dt);
        momPitch = THREE.MathUtils.damp(
          momPitch,
          THREE.MathUtils.clamp(-p1Vertical, -1, 1) * 0.42,
          5.0,
          dt
        );

        momPos.x += Math.sin(momHeading) * momSpeed * dt;
        momPos.z += Math.cos(momHeading) * momSpeed * dt;
        momPos.y += p1Vertical * 3.6 * dt;

        if (getCurrentVectorAt(momPos.x, momPos.y, momPos.z, _currentVec)) {
          const mult = currentProps.weatherMood === 'gentle_currents' ? 1.45 : 0.75;
          momPos.addScaledVector(_currentVec, dt * mult);
        }

        // Strict 5-Point Sand Collision for Mother Turtle
        const momFootprint = sampleFootprintGround(momPos.x, momPos.z, momHeading, 1.5, 1.3);
        // On the beach she rests her belly on the sand and tilts with the slope,
        // instead of hovering above the highest point under her.
        const momLandT = THREE.MathUtils.smoothstep(momFootprint.maxGroundY, -0.2, 0.4);
        const momMinY = THREE.MathUtils.lerp(
          momFootprint.maxGroundY + 0.48,
          momFootprint.restGroundY + 0.36,
          momLandT
        );
        const momMaxY = momFootprint.maxGroundY > 0 ? momMinY : 0.25;
        momPos.y = THREE.MathUtils.clamp(momPos.y, momMinY, Math.max(momMinY, momMaxY));
        if (momLandT > 0) {
          const slopePitch = -Math.atan2(
            momFootprint.noseGroundY - momFootprint.tailGroundY,
            3.0
          );
          momPitch = THREE.MathUtils.lerp(momPitch, slopePitch, momLandT * (1 - Math.exp(-8 * dt)));
        }
        momPos.x = THREE.MathUtils.clamp(momPos.x, -85, 85);
        momPos.z = THREE.MathUtils.clamp(momPos.z, -85, 85);

        // Impassable Solid Obstacles (Shipwrecks & Coconut Cove Lighthouse)
        resolveSolidObstacles(momPos, 1.25);

        // --- PLAYER 2: BABY TURTLE ("LANI") INPUT & COMPANION FOLLOW ---
        let p2Turn = 0;
        let p2Forward = 0;
        let p2Vertical = simRef.current.externalVerticalDir;
        let p2Sing = false;
        let p2BarrelRoll = false;

        if (heldKeys.has('ArrowLeft')) p2Turn += 1;
        if (heldKeys.has('ArrowRight')) p2Turn -= 1;
        if (heldKeys.has('ArrowUp')) p2Forward += 1;
        if (heldKeys.has('ArrowDown')) p2Forward -= 0.6;
        if (
          heldKeys.has('Enter') ||
          heldKeys.has('Period') ||
          heldKeys.has('PageUp') ||
          heldKeys.has('KeyU')
        ) {
          p2Vertical += 1;
        }
        if (
          heldKeys.has('ShiftRight') ||
          heldKeys.has('Slash') ||
          heldKeys.has('PageDown') ||
          heldKeys.has('KeyK')
        ) {
          p2Vertical -= 1;
        }
        if (heldKeys.has('KeyN')) p2Boost = true;
        if (justPressedKeys.has('KeyM')) p2Sing = true;
        if (justPressedKeys.has('Comma') || justPressedKeys.has('ControlRight')) {
          p2BarrelRoll = true;
        }
        if (justPressedKeys.has('KeyP')) currentProps.onTogglePiggyback();

        if (pad2) {
          const lx = applyDeadzone(pad2.axes[0] || 0);
          const ly = applyDeadzone(pad2.axes[1] || 0);
          const ry = applyDeadzone(pad2.axes[3] || 0);
          p2Turn -= lx;
          p2Forward += -ly;
          p2Vertical += -ry;
          if (
            pad2.buttons[0]?.pressed ||
            pad2.buttons[7]?.pressed ||
            pad2.buttons[12]?.pressed
          ) {
            p2Vertical += 1;
          }
          if (
            pad2.buttons[1]?.pressed ||
            pad2.buttons[6]?.pressed ||
            pad2.buttons[13]?.pressed
          ) {
            p2Vertical -= 1;
          }
          if (pad2.buttons[2]?.pressed || pad2.buttons[5]?.pressed) p2Boost = true;
          if (isPadJustPressed(pad2, 1, 3)) p2Sing = true;
          if (isPadJustPressed(pad2, 1, 4) || isPadJustPressed(pad2, 1, 11)) {
            p2BarrelRoll = true;
          }
        }

        if (p2Sing) {
          simRef.current.babyCallTimer = 1.6;
          oceanAudio.playTurtleCall(false);
        }
        if (p2BarrelRoll && simRef.current.babyBarrelRoll <= 0.05) {
          simRef.current.babyBarrelRoll = 1.0;
          oceanAudio.playBarrelRollBubbles(false);
        }

        const p1HasManualInput =
          Math.abs(p1Turn) > 0.05 ||
          Math.abs(p1Forward) > 0.05 ||
          Math.abs(p1Vertical - simRef.current.externalVerticalDir) > 0.05 ||
          p1Boost ||
          p1BarrelRoll;

        const p2HasManualInput =
          Math.abs(p2Turn) > 0.05 ||
          Math.abs(p2Forward) > 0.05 ||
          Math.abs(p2Vertical - simRef.current.externalVerticalDir) > 0.05 ||
          p2Boost ||
          p2BarrelRoll;

        // Detect single player mode: if one player is actively swimming and the other is not being controlled,
        // we never tether, snap, or drag the active turtle back to the idle turtle!
        isSinglePlayerBaby =
          currentProps.cameraMode === 'follow_baby' ||
          (p2HasManualInput && !p1HasManualInput && !pad1 && !heldKeys.has('KeyW') && !heldKeys.has('KeyA') && !heldKeys.has('KeyS') && !heldKeys.has('KeyD'));

        isSinglePlayerMom =
          currentProps.cameraMode === 'follow_mom' ||
          (p1HasManualInput && !p2HasManualInput && !pad2 && !heldKeys.has('ArrowUp') && !heldKeys.has('ArrowLeft') && !heldKeys.has('ArrowRight') && !heldKeys.has('ArrowDown'));

        prevBabySpeed = babySpeed;

        if (currentProps.piggybackActive && !p2HasManualInput && !isSinglePlayerBaby) {
          _vec3A
            .set(0, 0.72, -0.15)
            .applyAxisAngle(_vec3B.set(0, 1, 0), momHeading)
            .add(momPos);
          babyPos.lerp(_vec3A, Math.min(1, dt * 10));
          babyHeading = THREE.MathUtils.damp(babyHeading, momHeading, 8, dt);
          babyPitch = THREE.MathUtils.damp(babyPitch, momPitch, 8, dt);
          babyRoll = THREE.MathUtils.damp(babyRoll, momRoll, 8, dt);
          babySpeed = momSpeed;
        } else if (currentProps.babyFollowingMom && !p2HasManualInput && !isSinglePlayerBaby) {
          // In Mom-lead mode, Baby glides gently toward Mom without creating any pull or drag on Mom
          _vec3A
            .set(3.1, 0.25, -1.4)
            .applyAxisAngle(_vec3B.set(0, 1, 0), momHeading)
            .add(momPos);
          const distToSlot = babyPos.distanceTo(_vec3A);
          // If Mom is far away (e.g. single-player Mom swimming across the map), Baby swims toward Mom smoothly at its own pace
          // instead of snapping or rubberbanding
          const followSpeedRate = Math.min(6.5, 2.2 + distToSlot * 0.45);
          babyPos.lerp(_vec3A, Math.min(1, dt * Math.min(3.0, followSpeedRate)));
          babyHeading = THREE.MathUtils.damp(babyHeading, momHeading, 4.5, dt);
          babyPitch = THREE.MathUtils.damp(babyPitch, momPitch, 4.5, dt);
          babyRoll = THREE.MathUtils.damp(
            babyRoll,
            Math.sin(elapsed * 2.2) * 0.12,
            4.0,
            dt
          );
          babySpeed = Math.min(7.0, Math.max(momSpeed, distToSlot * 0.95));
        } else {
          // Independent baby control: Player 2 swims freely with zero tether or pull toward Mom!
          const isBabyRolling = simRef.current.babyBarrelRoll > 0;
          const maxBabySpeed = p2Boost || isBabyRolling ? 8.8 : 5.5;
          const targetBabySpeed =
            Math.max(-2.2, Math.min(1, p2Forward + (isBabyRolling ? 0.65 : 0))) *
            maxBabySpeed;
          babySpeed = THREE.MathUtils.damp(babySpeed, targetBabySpeed, 5.0, dt);
          babyHeading += p2Turn * 2.25 * dt;
          babyRoll = THREE.MathUtils.damp(babyRoll, -p2Turn * 0.38, 5.5, dt);
          babyPitch = THREE.MathUtils.damp(
            babyPitch,
            THREE.MathUtils.clamp(-p2Vertical, -1, 1) * 0.46,
            5.5,
            dt
          );

          babyPos.x += Math.sin(babyHeading) * babySpeed * dt;
          babyPos.z += Math.cos(babyHeading) * babySpeed * dt;
          babyPos.y += p2Vertical * 3.6 * dt;

          if (getCurrentVectorAt(babyPos.x, babyPos.y, babyPos.z, _currentVec)) {
            const mult = currentProps.weatherMood === 'gentle_currents' ? 1.45 : 0.75;
            babyPos.addScaledVector(_currentVec, dt * mult);
          }
        }

        // Strict 5-Point Sand Collision for Baby Turtle
        const babyFootprint = sampleFootprintGround(babyPos.x, babyPos.z, babyHeading, 0.9, 0.8);
        const babyLandT = THREE.MathUtils.smoothstep(babyFootprint.maxGroundY, -0.2, 0.4);
        const babyMinY = THREE.MathUtils.lerp(
          babyFootprint.maxGroundY + 0.36,
          babyFootprint.restGroundY + 0.2,
          babyLandT
        );
        const babyMaxY = babyFootprint.maxGroundY > 0 ? babyMinY : 0.22;
        if (!currentProps.piggybackActive) {
          babyPos.y = THREE.MathUtils.clamp(babyPos.y, babyMinY, Math.max(babyMinY, babyMaxY));
          if (babyLandT > 0) {
            const slopePitch = -Math.atan2(
              babyFootprint.noseGroundY - babyFootprint.tailGroundY,
              1.8
            );
            babyPitch = THREE.MathUtils.lerp(
              babyPitch,
              slopePitch,
              babyLandT * (1 - Math.exp(-8 * dt))
            );
          }
        } else {
          babyPos.y = Math.max(babyPos.y, babyMinY);
        }
        babyPos.x = THREE.MathUtils.clamp(babyPos.x, -85, 85);
        babyPos.z = THREE.MathUtils.clamp(babyPos.z, -85, 85);

        // Impassable Solid Obstacles (Shipwrecks & Coconut Cove Lighthouse)
        resolveSolidObstacles(babyPos, 0.65);

        // Keep the two shells from passing through each other. Baby gives way,
        // except while riding on Mom's back, where touching is the point.
        if (!currentProps.piggybackActive) {
          const sepX = babyPos.x - momPos.x;
          const sepZ = babyPos.z - momPos.z;
          const sepY = babyPos.y - momPos.y;
          const flatDist = Math.hypot(sepX, sepZ);
          const minFlatDist = 2.5;
          if (flatDist < minFlatDist && Math.abs(sepY) < 1.1) {
            // Directly on top of each other: slide out to Mom's side.
            const nx = flatDist > 0.001 ? sepX / flatDist : Math.cos(momHeading);
            const nz = flatDist > 0.001 ? sepZ / flatDist : -Math.sin(momHeading);
            const push = (minFlatDist - flatDist) * Math.min(1, dt * 9);
            babyPos.x += nx * push;
            babyPos.z += nz * push;
          }
        }

        // --- SEAWEED GRAZING / MUNCHING INTERACTION ---
        worldRig.edibleSeaweedPatches.forEach((patch) => {
          if (patch.amountRemaining <= 0.45) return;
          const dMom = patch.position.distanceTo(momPos);
          const dBaby = patch.position.distanceTo(babyPos);
          const minDist = Math.min(dMom, dBaby);

          // Automatically munch when stopping beside a lush seaweed patch OR pressing Munch button
          const stoppedBesidePatch =
            minDist < 2.85 && Math.abs(momSpeed) < 1.2 && patch.munchAnimTimer <= 0;
          const manualMunchNearPatch = p1Munch && minDist < 6.5;

          if (stoppedBesidePatch || manualMunchNearPatch) {
            p1Munch = false;
            patch.amountRemaining = 0.25;
            patch.munchAnimTimer = 1.2;
            simRef.current.momMunchTimer = 1.1;
            simRef.current.babyMunchTimer = 1.1;
            oceanAudio.playSeaweedMunch();

            // Emit joyful green leaf & bubble particles from the nibbled seaweed
            for (let b = 0; b < 14; b++) {
              bubbleTrailSystem.spawnParticle(
                patch.position
                  .clone()
                  .add(
                    new THREE.Vector3(
                      (Math.random() - 0.5) * 0.8,
                      1.1 + Math.random() * 0.8,
                      (Math.random() - 0.5) * 0.8
                    )
                  ),
                new THREE.Vector3(
                  (Math.random() - 0.5) * 1.4,
                  1.5 + Math.random() * 1.2,
                  (Math.random() - 0.5) * 1.4
                ),
                0.75 + Math.random() * 0.5,
                1.3 + Math.random() * 0.6,
                false,
                b % 2 === 0 ? 0xa3e635 : 0x5eead4
              );
            }
            currentProps.onMunchSeaweed(getZoneNameAt(patch.position.x, patch.position.y, patch.position.z));
          }
        });

        // If user clicked "Munch Seaweed" in the HUD while not right on top of a patch, swim & nibble right where they are!
        if (p1Munch) {
          simRef.current.momMunchTimer = 1.1;
          simRef.current.babyMunchTimer = 1.1;
          oceanAudio.playSeaweedMunch();
          currentProps.onMunchSeaweed(getZoneNameAt(momPos.x, momPos.y, momPos.z));
        }
      } else if (currentProps.screenState === 'title') {
        const tAngle = elapsed * 0.28;
        momPos.set(
          Math.sin(tAngle) * 9,
          -2.6 + Math.sin(elapsed * 0.8) * 0.4,
          Math.cos(tAngle) * 7 - 4
        );
        momHeading = tAngle + Math.PI * 0.5;
        momSpeed = 2.8;

        babyPos.set(
          momPos.x + Math.cos(tAngle) * 2.2,
          momPos.y + 0.35 + Math.sin(elapsed * 1.3) * 0.2,
          momPos.z + Math.sin(tAngle) * 2.2
        );
        babyHeading = momHeading;
        babySpeed = 2.8;
      }

      // 8. Advance Barrel Roll & Munch Timers and Animate Articulated Turtles
      if (simRef.current.momBarrelRoll > 0) {
        simRef.current.momBarrelRoll = Math.max(0, simRef.current.momBarrelRoll - dt * 1.15);
      }
      if (simRef.current.babyBarrelRoll > 0) {
        simRef.current.babyBarrelRoll = Math.max(0, simRef.current.babyBarrelRoll - dt * 1.25);
      }
      if (simRef.current.momMunchTimer > 0) {
        simRef.current.momMunchTimer = Math.max(0, simRef.current.momMunchTimer - dt);
      }
      if (simRef.current.babyMunchTimer > 0) {
        simRef.current.babyMunchTimer = Math.max(0, simRef.current.babyMunchTimer - dt);
      }

      momSwimPhase += dt * (2.2 + Math.abs(momSpeed) * 0.85);
      babySwimPhase += dt * (3.1 + Math.abs(babySpeed) * 1.05);

      const animateTurtleRig = (
        rig: ReturnType<typeof createSeaTurtle>,
        pos: THREE.Vector3,
        heading: number,
        pitch: number,
        roll: number,
        phase: number,
        callTimer: number,
        barrelRollVal: number,
        munchTimer: number
      ) => {
        rig.group.position.copy(pos);
        rig.group.rotation.order = 'YXZ';
        rig.group.rotation.y = heading;
        rig.group.rotation.x = pitch;

        // Smooth 360-degree cosine-eased barrel roll angle
        const barrelAngle =
          barrelRollVal > 0
            ? (1.0 - Math.cos((1.0 - barrelRollVal) * Math.PI)) * Math.PI
            : 0;
        rig.group.rotation.z = roll + barrelAngle;

        const flap = Math.sin(phase) * 0.52;
        const twist = Math.cos(phase) * 0.28;
        rig.frontLeftFlipper.rotation.z = flap;
        rig.frontLeftFlipper.rotation.x = twist;
        rig.frontRightFlipper.rotation.z = -flap;
        rig.frontRightFlipper.rotation.x = twist;

        rig.backLeftFlipper.rotation.x = Math.sin(phase - 1.2) * 0.25;
        rig.backRightFlipper.rotation.x = -Math.sin(phase - 1.2) * 0.25;

        // Adorable 3-bite head nod & beak nibble when munching seaweed!
        if (munchTimer > 0) {
          const nibble = Math.sin(munchTimer * 26);
          rig.headGroup.rotation.x = 0.28 + nibble * 0.22;
          rig.headGroup.position.z = 1.28 + Math.abs(nibble) * 0.1;
          rig.beakMesh.scale.y = 1.0 + nibble * 0.25;
        } else {
          rig.headGroup.rotation.x = 0;
          rig.headGroup.position.z = 1.22;
          rig.beakMesh.scale.y = 1.0;
        }

        rig.headGroup.rotation.y = Math.sin(phase * 0.5) * 0.08;
        rig.tailMesh.rotation.y = Math.cos(phase) * 0.18;

        if (callTimer > 0) {
          const progress = 1.0 - callTimer / 1.6;
          const s = 1.0 + progress * 6.5;
          rig.callRippleMesh.scale.setScalar(s);
          rig.callRippleMat.opacity = (1.0 - progress) * 0.75;
        } else {
          rig.callRippleMat.opacity = 0;
        }
      };

      if (simRef.current.momCallTimer > 0)
        simRef.current.momCallTimer = Math.max(0, simRef.current.momCallTimer - dt);
      if (simRef.current.babyCallTimer > 0)
        simRef.current.babyCallTimer = Math.max(0, simRef.current.babyCallTimer - dt);

      animateTurtleRig(
        momTurtle,
        momPos,
        momHeading,
        momPitch,
        momRoll,
        momSwimPhase,
        simRef.current.momCallTimer,
        simRef.current.momBarrelRoll,
        simRef.current.momMunchTimer
      );
      animateTurtleRig(
        babyTurtle,
        babyPos,
        babyHeading,
        babyPitch,
        babyRoll,
        babySwimPhase,
        simRef.current.babyCallTimer,
        simRef.current.babyBarrelRoll,
        simRef.current.babyMunchTimer
      );

      // Update world matrices of turtles so flipper-tip bubble emitters have exact world coordinates
      momTurtle.group.updateMatrixWorld(true);
      babyTurtle.group.updateMatrixWorld(true);

      // 9. Emit & Update Hydrodynamic Turtle-Trail Bubble Particle System
      const momAccel = Math.max(0, ( Math.abs(momSpeed) - Math.abs(prevMomSpeed) ) / Math.max(0.001, dt));
      const babyAccel = Math.max(0, ( Math.abs(babySpeed) - Math.abs(prevBabySpeed) ) / Math.max(0.001, dt));

      bubbleTrailSystem.emitForTurtle(dt, {
        pos: momPos,
        heading: momHeading,
        pitch: momPitch,
        roll: momRoll,
        speed: momSpeed,
        acceleration: momAccel,
        isBoosting: p1Boost,
        barrelRollProgress: simRef.current.momBarrelRoll,
        isMother: true,
        leftFlipperGroup: momTurtle.frontLeftFlipper,
        rightFlipperGroup: momTurtle.frontRightFlipper,
      });

      bubbleTrailSystem.emitForTurtle(dt, {
        pos: babyPos,
        heading: babyHeading,
        pitch: babyPitch,
        roll: babyRoll,
        speed: babySpeed,
        acceleration: babyAccel,
        isBoosting: p2Boost,
        barrelRollProgress: simRef.current.babyBarrelRoll,
        isMother: false,
        leftFlipperGroup: babyTurtle.frontLeftFlipper,
        rightFlipperGroup: babyTurtle.frontRightFlipper,
      });

      bubbleTrailSystem.update(dt, elapsed);

      // 10. Update Collectibles & Smooth Fade-Away after Selection/Discovery
      let nearbyPrompt: string | null = null;
      const activeCallTimer = Math.max(simRef.current.momCallTimer, simRef.current.babyCallTimer);

      // Check if near an edible seaweed patch
      worldRig.edibleSeaweedPatches.forEach((patch) => {
        if (patch.amountRemaining > 0.55) {
          const dMin = Math.min(
            patch.position.distanceTo(momPos),
            patch.position.distanceTo(babyPos)
          );
          if (dMin < 5.5) {
            nearbyPrompt = 'Pause here or press G / Munch Seaweed to nibble tender kelp!';
          }
        }
      });

      collectibleObjs.forEach((cObj, idx) => {
        const syncedItem = currentProps.collectibles[idx];
        const isDiscovered = syncedItem ? syncedItem.discovered : cObj.item.discovered;

        if (!cObj.group.visible && isDiscovered && cObj.fadeProgress >= 0.99) {
          return;
        }

        cObj.glowCore.rotation.y += dt * 1.6;
        cObj.glowCore.position.y =
          (cObj.item.category === 'treasure_chest' ? 0.96 : 0.68) +
          Math.sin(elapsed * 2.4 + idx) * 0.08 +
          cObj.fadeProgress * 1.15;

        const dMom = cObj.group.position.distanceTo(momPos);
        const dBaby = cObj.group.position.distanceTo(babyPos);
        const minDist = Math.min(dMom, dBaby);

        if (!isDiscovered && minDist < 4.2 && currentProps.screenState === 'playing') {
          const who = dMom < 4.2 && dBaby < 4.2 ? 'both' : dMom < dBaby ? 'mom' : 'baby';
          cObj.item.discovered = true;
          oceanAudio.playTreasureChime();
          for (let k = 0; k < 20; k++) {
            bubbleTrailSystem.spawnParticle(
              cObj.group.position
                .clone()
                .add(
                  new THREE.Vector3(
                    (Math.random() - 0.5) * 1.2,
                    0.5 + Math.random() * 0.6,
                    (Math.random() - 0.5) * 1.2
                  )
                ),
              new THREE.Vector3(
                (Math.random() - 0.5) * 1.5,
                1.6 + Math.random() * 1.4,
                (Math.random() - 0.5) * 1.5
              ),
              0.8 + Math.random() * 0.6,
              1.5 + Math.random() * 0.7,
              true,
              0xfde047
            );
          }
          currentProps.onDiscoverCollectible(cObj.item.id, who);
        } else if (!isDiscovered && minDist < 8.5) {
          nearbyPrompt = `Swim close or click ${cObj.item.name} to collect it`;
        }

        // Smoothly open chest lid AND fade the entire treasure object away once discovered!
        if (isDiscovered) {
          cObj.openProgress = THREE.MathUtils.damp(cObj.openProgress, 1, 5.5, dt);
          if (cObj.lidPivot) {
            cObj.lidPivot.rotation.x = -cObj.openProgress * Math.PI * 0.65;
          }
          // Start fading away right as the lid opens so players see the sparkle and watch it dissolve
          if (cObj.openProgress > 0.35) {
            cObj.fadeProgress = Math.min(1, cObj.fadeProgress + dt * 0.68);
            const opacity = Math.max(0, 1.0 - cObj.fadeProgress);
            cObj.group.position.y = cObj.baseY + cObj.fadeProgress * 0.65;
            cObj.group.scale.setScalar(Math.max(0.01, 1.0 - cObj.fadeProgress * 0.25));
            updateCollectibleFade(cObj, opacity);
          }
        } else {
          cObj.openProgress = 0;
          cObj.fadeProgress = 0;
          cObj.group.position.y = cObj.baseY;
          cObj.group.scale.setScalar(1);
          updateCollectibleFade(cObj, 1);
        }
      });

      // 11. Check Environmental Storytelling Landmarks
      landmarkGroups.forEach(({ landmark, group }) => {
        const syncedLm = currentProps.landmarks.find((l) => l.id === landmark.id);
        const isInspected = syncedLm ? syncedLm.inspected : landmark.inspected;
        const dMin = Math.min(
          group.position.distanceTo(momPos),
          group.position.distanceTo(babyPos)
        );
        if (!isInspected && dMin < 6.2 && currentProps.screenState === 'playing') {
          landmark.inspected = true;
          oceanAudio.playTreasureChime();
          currentProps.onInspectLandmark(landmark.id);
        }
      });

      // 12. Update Interactive Marine Wildlife & Friendship States
      const { activeReaction, newlyBefriendedId } = worldRig.updateEnvironment(
        dt,
        elapsed,
        momPos,
        babyPos,
        momSpeed,
        babySpeed,
        activeCallTimer,
        nightFactor,
        currentProps.weatherMood
      );

      if (newlyBefriendedId && currentProps.screenState === 'playing') {
        currentProps.onMeetWildlife(newlyBefriendedId, true);
      }

      if (currentProps.screenState === 'playing') {
        worldRig.mantaRays.forEach((m) => {
          if (
            Math.min(
              m.group.position.distanceTo(momPos),
              m.group.position.distanceTo(babyPos)
            ) < 9.5
          ) {
            currentProps.onMeetWildlife('wildlife-manta', m.befriended);
          }
        });
        worldRig.eagleRays.forEach((r) => {
          if (
            Math.min(
              r.group.position.distanceTo(momPos),
              r.group.position.distanceTo(babyPos)
            ) < 9.5
          ) {
            currentProps.onMeetWildlife('wildlife-manta', r.befriended);
          }
        });
        worldRig.coralCrabs.forEach((c) => {
          if (
            Math.min(
              c.group.position.distanceTo(momPos),
              c.group.position.distanceTo(babyPos)
            ) < 5.5
          ) {
            currentProps.onMeetWildlife('wildlife-crabs', activeCallTimer > 0);
          }
        });
        worldRig.starfishList.forEach((s) => {
          if (
            Math.min(
              s.group.position.distanceTo(momPos),
              s.group.position.distanceTo(babyPos)
            ) < 4.5
          ) {
            currentProps.onMeetWildlife('wildlife-crabs', true);
          }
        });
        worldRig.dolphins.forEach((d) => {
          if (
            Math.min(
              d.group.position.distanceTo(momPos),
              d.group.position.distanceTo(babyPos)
            ) < 11.0
          ) {
            currentProps.onMeetWildlife('wildlife-dolphin', d.befriended);
          }
        });
        if (
          Math.min(
            worldRig.whaleShark.group.position.distanceTo(momPos),
            worldRig.whaleShark.group.position.distanceTo(babyPos)
          ) < 14.0
        ) {
          currentProps.onMeetWildlife('wildlife-whaleshark', worldRig.whaleShark.befriended);
        }
        worldRig.jellyfishList.forEach((j) => {
          if (
            Math.min(
              j.group.position.distanceTo(momPos),
              j.group.position.distanceTo(babyPos)
            ) < 9.5
          ) {
            currentProps.onMeetWildlife('wildlife-jellyfish', activeCallTimer > 0);
          }
        });
        if (momPos.distanceTo(_vec3A.set(12, -3.5, -14)) < 9.5) {
          currentProps.onMeetWildlife('wildlife-reef-school', activeCallTimer > 0);
        }
      }

      // 13. Camera Choreography
      const distBetweenTurtles = momPos.distanceTo(babyPos);

      if (currentProps.screenState === 'title') {
        const camAngle = elapsed * 0.14;
        _vec3A.set(
          Math.sin(camAngle) * 16,
          1.8 + Math.sin(elapsed * 0.4) * 1.2,
          Math.cos(camAngle) * 16
        );
        mainCamera.position.lerp(_vec3A, Math.min(1, dt * 2.5));
        camLookTarget.lerp(momPos, Math.min(1, dt * 3.5));
        mainCamera.lookAt(camLookTarget);
      } else if (currentProps.cameraMode === 'follow_mom') {
        _vec3A
          .set(0, 2.2, -7.8)
          .applyAxisAngle(_vec3B.set(0, 1, 0), momHeading)
          .add(momPos);
        const minCamY = groundHeightAt(_vec3A.x, _vec3A.z) + 0.85;
        _vec3A.y = Math.max(_vec3A.y, minCamY);
        mainCamera.position.lerp(_vec3A, 1 - Math.exp(-4.5 * dt));
        camLookTarget.lerp(momPos, 1 - Math.exp(-6.5 * dt));
        mainCamera.lookAt(camLookTarget);
      } else if (currentProps.cameraMode === 'follow_baby') {
        _vec3A
          .set(0, 1.8, -6.2)
          .applyAxisAngle(_vec3B.set(0, 1, 0), babyHeading)
          .add(babyPos);
        const minCamY = groundHeightAt(_vec3A.x, _vec3A.z) + 0.75;
        _vec3A.y = Math.max(_vec3A.y, minCamY);
        mainCamera.position.lerp(_vec3A, 1 - Math.exp(-4.5 * dt));
        camLookTarget.lerp(babyPos, 1 - Math.exp(-6.5 * dt));
        mainCamera.lookAt(camLookTarget);
      } else {
        // If single player is actively swimming one turtle and the other is idle, focus primarily on the active player
        let centerPoint = _vec3C.addVectors(momPos, babyPos).multiplyScalar(0.5);
        let camHeading = momHeading;
        let pullDist = distBetweenTurtles;

        if (isSinglePlayerBaby) {
          centerPoint = babyPos;
          camHeading = babyHeading;
          pullDist = 0;
        } else if (isSinglePlayerMom) {
          centerPoint = momPos;
          camHeading = momHeading;
          pullDist = 0;
        }

        const pullBack = THREE.MathUtils.clamp(8.5 + pullDist * 0.58, 8.5, 26);
        const liftY = THREE.MathUtils.clamp(2.6 + pullDist * 0.22, 2.6, 9.5);

        _vec3A
          .set(0, liftY, -pullBack)
          .applyAxisAngle(_vec3B.set(0, 1, 0), camHeading)
          .add(centerPoint);
        const minCamY = groundHeightAt(_vec3A.x, _vec3A.z) + 0.9;
        _vec3A.y = Math.max(_vec3A.y, minCamY);

        mainCamera.position.lerp(_vec3A, 1 - Math.exp(-3.8 * dt));
        camLookTarget.lerp(centerPoint, 1 - Math.exp(-5.5 * dt));
        mainCamera.lookAt(camLookTarget);
      }

      const isCamUnderwater = mainCamera.position.y < 0.05;
      oceanAudio.setCameraUnderwater(isCamUnderwater);

      if (isCamUnderwater) {
        _underwaterFogColor
          .setHex(0x041e2e)
          .lerp(new THREE.Color(0x0d7490), dayFactor)
          .lerp(new THREE.Color(0x0e7490), goldenHourFactor * 0.35);
        if (isRainWeather) {
          _underwaterFogColor.lerp(new THREE.Color(0x0b4f63), 0.45);
        } else if (isMistWeather) {
          _underwaterFogColor.lerp(new THREE.Color(0x158096), 0.35);
        }
        _underwaterFogColor.lerp(_grottoFogColor, grottoFactor * 0.88);
        (scene.background as THREE.Color).copy(_underwaterFogColor);
        sceneFog.color.copy(_underwaterFogColor);
        sceneFog.density =
          (isRainWeather ? 0.019 : isMistWeather ? 0.021 : 0.016) + grottoFactor * 0.012;
      } else {
        _skyColor
          .setHex(0x091526)
          .lerp(new THREE.Color(0x7dd3fc), dayFactor)
          .lerp(new THREE.Color(0xfdba74), goldenHourFactor * 0.65);
        if (isRainWeather) {
          _skyColor.lerp(new THREE.Color(0x475569), 0.65 * dayFactor);
        } else if (isMistWeather) {
          _skyColor.lerp(new THREE.Color(0xcbd5e1), 0.72 * dayFactor);
        }
        (scene.background as THREE.Color).copy(_skyColor);
        sceneFog.color.copy(_skyColor);
        sceneFog.density = isMistWeather ? 0.0185 : isRainWeather ? 0.011 : 0.0052;
      }

      // 14. Render Scene
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;

      if (currentProps.cameraMode === 'split_screen' && currentProps.screenState === 'playing') {
        renderer.setScissorTest(true);

        _vec3A
          .set(0, 2.1, -7.2)
          .applyAxisAngle(_vec3B.set(0, 1, 0), momHeading)
          .add(momPos);
        _vec3A.y = Math.max(_vec3A.y, groundHeightAt(_vec3A.x, _vec3A.z) + 0.85);
        splitCamMom.position.lerp(_vec3A, 1 - Math.exp(-5 * dt));
        splitLookMom.lerp(momPos, 1 - Math.exp(-7 * dt));
        splitCamMom.lookAt(splitLookMom);

        renderer.setViewport(0, 0, Math.floor(w * 0.5), h);
        renderer.setScissor(0, 0, Math.floor(w * 0.5), h);
        renderer.render(scene, splitCamMom);

        _vec3A
          .set(0, 1.7, -5.8)
          .applyAxisAngle(_vec3B.set(0, 1, 0), babyHeading)
          .add(babyPos);
        _vec3A.y = Math.max(_vec3A.y, groundHeightAt(_vec3A.x, _vec3A.z) + 0.75);
        splitCamBaby.position.lerp(_vec3A, 1 - Math.exp(-5 * dt));
        splitLookBaby.lerp(babyPos, 1 - Math.exp(-7 * dt));
        splitCamBaby.lookAt(splitLookBaby);

        renderer.setViewport(Math.floor(w * 0.5), 0, Math.ceil(w * 0.5), h);
        renderer.setScissor(Math.floor(w * 0.5), 0, Math.ceil(w * 0.5), h);
        renderer.render(scene, splitCamBaby);

        renderer.setScissorTest(false);
      } else {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, w, h);
        renderer.render(scene, mainCamera);
      }

      justPressedKeys.clear();

      hudSyncTimer += dt;
      if (hudSyncTimer >= 0.22) {
        hudSyncTimer = 0;
        const zoneName = getZoneNameAt(momPos.x, momPos.y, momPos.z);
        const inGentleCurrent = getCurrentVectorAt(momPos.x, momPos.y, momPos.z, _currentVec);
        currentProps.onUpdateHud({
          currentZone: zoneName,
          momDepth: Math.max(0, Number((-momPos.y).toFixed(1))),
          babyDepth: Math.max(0, Number((-babyPos.y).toFixed(1))),
          distanceBetween: Number(distBetweenTurtles.toFixed(1)),
          dayTimeHours: Number(localSolarHours.toFixed(2)),
          inGentleCurrent,
          activeWildlifeReaction: activeReaction,
          nearbyPrompt,
        });

        currentProps.onUpdateControllers({
          p1Connected: Boolean(pad1),
          p1Name: pad1 ? pad1.id.split('(')[0].trim().slice(0, 22) : 'Keyboard (WASD)',
          p2Connected: Boolean(pad2),
          p2Name: pad2 ? pad2.id.split('(')[0].trim().slice(0, 22) : 'Keyboard (Arrows)',
        });
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', onResize);
      bubbleTrailSystem.dispose();
      textures.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={canvasMountRef}
      className="fixed inset-0 w-screen h-screen overflow-hidden pointer-events-auto z-0"
      aria-label="3D Ocean Sanctuary Viewport"
    />
  );
});
