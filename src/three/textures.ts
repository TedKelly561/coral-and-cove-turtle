import * as THREE from 'three';

export interface OceanTextureLibrary {
  momShellAlbedo: THREE.CanvasTexture;
  babyShellAlbedo: THREE.CanvasTexture;
  shellBump: THREE.CanvasTexture;
  skinAlbedo: THREE.CanvasTexture;
  sandAlbedo: THREE.CanvasTexture;
  sandBump: THREE.CanvasTexture;
  kelpAlbedo: THREE.CanvasTexture;
  kelpBump: THREE.CanvasTexture;
  lighthouseAlbedo: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  barkAlbedo: THREE.CanvasTexture;
  radialShadow: THREE.CanvasTexture;
  eagleRayAlbedo: THREE.CanvasTexture;
  crabAlbedo: THREE.CanvasTexture;
  whaleAlbedo: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): OceanTextureLibrary {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  // 1. Turtle Carapace Scute Pattern Generator (Mother & Baby distinct palettes)
  const buildShellTexture = (isMother: boolean, isBump: boolean): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    // Drawn on a 512 grid at double resolution, so fine detail stays crisp up close.
    ctx.scale(2, 2);
    // Repeatable scatter for speckles, so both turtles look the same on every visit.
    let shellSeed = isMother ? 11 : 29;
    const shellRand = () => {
      shellSeed += 1;
      const v = Math.sin(shellSeed * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    if (isBump) {
      ctx.fillStyle = '#404040';
      ctx.fillRect(0, 0, 512, 512);
    } else {
      const bgGrad = ctx.createRadialGradient(256, 256, 30, 256, 256, 260);
      if (isMother) {
        bgGrad.addColorStop(0, '#1e4d3b');
        bgGrad.addColorStop(0.6, '#14382b');
        bgGrad.addColorStop(1, '#0d261d');
      } else {
        bgGrad.addColorStop(0, '#27796b');
        bgGrad.addColorStop(0.6, '#1b574d');
        bgGrad.addColorStop(1, '#123b34');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);
    }

    const scuteCenters = [
      [256, 110, 48],
      [256, 185, 54],
      [256, 260, 56],
      [256, 335, 52],
      [256, 405, 44],
      [172, 145, 46],
      [158, 222, 50],
      [162, 300, 48],
      [182, 370, 42],
      [340, 145, 46],
      [354, 222, 50],
      [350, 300, 48],
      [330, 370, 42],
    ];

    scuteCenters.forEach(([cx, cy, r]) => {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 + Math.PI / 6;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * (r * 0.88);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      if (isBump) {
        const bumpGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
        bumpGrad.addColorStop(0, '#ffffff');
        bumpGrad.addColorStop(0.82, '#b0b0b0');
        bumpGrad.addColorStop(1, '#222222');
        ctx.fillStyle = bumpGrad;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#151515';
        ctx.stroke();
      } else {
        const scuteGrad = ctx.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, r);
        if (isMother) {
          scuteGrad.addColorStop(0, '#d99b4e');
          scuteGrad.addColorStop(0.38, '#8c5327');
          scuteGrad.addColorStop(0.78, '#285943');
          scuteGrad.addColorStop(1, '#10291f');
        } else {
          scuteGrad.addColorStop(0, '#f3c66f');
          scuteGrad.addColorStop(0.42, '#419e88');
          scuteGrad.addColorStop(0.82, '#22695c');
          scuteGrad.addColorStop(1, '#123e36');
        }
        ctx.fillStyle = scuteGrad;
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = isMother ? '#e6b86a' : '#fae09b';
        ctx.stroke();

        ctx.strokeStyle = isMother ? 'rgba(245, 200, 120, 0.28)' : 'rgba(255, 235, 165, 0.35)';
        ctx.lineWidth = 1.5;
        for (let ray = 0; ray < 12; ray++) {
          const a = (ray * Math.PI) / 6;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * (r * 0.78), cy + Math.sin(a) * (r * 0.72));
          ctx.stroke();
        }
      }

      // Growth rings: each scute is laid down in layers, like tree rings.
      [0.82, 0.66, 0.5, 0.34].forEach((k, ringIdx) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 + Math.PI / 6;
          const px = cx + Math.cos(angle) * r * k;
          const py = cy + Math.sin(angle) * r * 0.88 * k;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.lineWidth = isBump ? 1.6 : 1.1;
        ctx.strokeStyle = isBump
          ? '#5a5a5a'
          : isMother
            ? `rgba(20, 45, 32, ${0.5 - ringIdx * 0.08})`
            : `rgba(18, 62, 54, ${0.45 - ringIdx * 0.07})`;
        ctx.stroke();
      });

      // Mottling inside the scute: darker flecks and a few pale ones.
      if (!isBump) {
        for (let m = 0; m < 26; m++) {
          const ma = shellRand() * Math.PI * 2;
          const md = Math.sqrt(shellRand()) * r * 0.8;
          ctx.fillStyle =
            m % 5 === 0
              ? 'rgba(255, 236, 190, 0.35)'
              : isMother
                ? 'rgba(48, 26, 10, 0.3)'
                : 'rgba(14, 60, 52, 0.3)';
          ctx.beginPath();
          ctx.ellipse(
            cx + Math.cos(ma) * md,
            cy + Math.sin(ma) * md * 0.88,
            1.2 + shellRand() * 2.2,
            0.8 + shellRand() * 1.4,
            ma,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
      ctx.restore();
    });

    // A little life on the shell: pale barnacle rings and soft green algae near the rim.
    if (!isBump) {
      for (let b = 0; b < (isMother ? 16 : 5); b++) {
        const ba = shellRand() * Math.PI * 2;
        const bd = 150 + shellRand() * 70;
        const bx = 256 + Math.cos(ba) * bd * 0.72;
        const by = 256 + Math.sin(ba) * bd * 0.86;
        ctx.fillStyle = 'rgba(96, 150, 96, 0.22)';
        ctx.beginPath();
        ctx.ellipse(bx, by, 9 + shellRand() * 8, 6 + shellRand() * 5, ba, 0, Math.PI * 2);
        ctx.fill();
        if (b % 2 === 0) {
          ctx.strokeStyle = 'rgba(236, 232, 214, 0.75)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(bx + 4, by - 2, 2.6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = isBump ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  // 2. Flipper & Head Scale Texture
  const buildSkinTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#86a892'; // pale seams between the scale plates
    ctx.fillRect(0, 0, 512, 512);

    let skinSeed = 5;
    const skinRand = () => {
      skinSeed += 1;
      const v = Math.sin(skinSeed * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    // Scale plates on an offset grid, each a slightly different size, shape and shade.
    const stepX = 512 / 12;
    const stepY = 512 / 14;
    for (let row = -1; row <= 14; row++) {
      for (let col = -1; col <= 12; col++) {
        const cx = col * stepX + (row % 2 === 0 ? 0 : stepX / 2) + (skinRand() - 0.5) * 6;
        const cy = row * stepY + (skinRand() - 0.5) * 5;
        const rx = stepX * (0.4 + skinRand() * 0.1);
        const ry = stepY * (0.4 + skinRand() * 0.1);
        const shade = 36 + Math.floor(skinRand() * 26);
        const plate = ctx.createRadialGradient(cx - rx * 0.25, cy - ry * 0.25, 1, cx, cy, rx);
        plate.addColorStop(0, `rgb(${shade + 34}, ${shade + 78}, ${shade + 52})`);
        plate.addColorStop(1, `rgb(${shade}, ${shade + 40}, ${shade + 22})`);
        ctx.fillStyle = plate;
        // Six-sided plate with softened corners
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3 + (skinRand() - 0.5) * 0.25;
          const px = cx + Math.cos(a) * rx;
          const py = cy + Math.sin(a) * ry;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        // A few darker freckles on the plate
        if (skinRand() > 0.45) {
          ctx.fillStyle = 'rgba(18, 44, 30, 0.45)';
          ctx.beginPath();
          ctx.arc(cx + (skinRand() - 0.5) * rx, cy + (skinRand() - 0.5) * ry, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  // 3. High-Detail Rippled Tropical Sand Albedo & Bump (with shell fragments, coral grains, and cross-ripples)
  const buildSandTextures = () => {
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = 1024;
    albedoCanvas.height = 1024;
    const actx = albedoCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 1024;
    bumpCanvas.height = 1024;
    const bctx = bumpCanvas.getContext('2d')!;

    actx.fillStyle = '#ead6ae';
    actx.fillRect(0, 0, 1024, 1024);
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 1024, 1024);

    // Organic curved wave-Current Sand Ripples
    for (let y = 0; y < 1024; y += 2) {
      for (let x = 0; x < 1024; x += 32) {
        const curveOffset = Math.sin((x / 1024) * Math.PI * 6) * 14;
        const primaryWave = Math.sin(((y + curveOffset) / 1024) * Math.PI * 28) * 0.5 + 0.5;
        const secondaryWave = Math.cos(((x - y * 0.4) / 1024) * Math.PI * 18) * 0.25;
        const combined = Math.max(0, Math.min(1, primaryWave * 0.8 + secondaryWave + 0.1));

        const r = Math.floor(214 + combined * 32);
        const g = Math.floor(191 + combined * 30);
        const b = Math.floor(146 + combined * 26);
        actx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        actx.fillRect(x, y, 32, 2);

        const bVal = Math.floor(65 + combined * 165);
        bctx.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
        bctx.fillRect(x, y, 32, 2);
      }
    }

    // Fine mineral grains, pink coral dust, & micro-shell flecks
    for (let i = 0; i < 6500; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const sz = 1 + Math.random() * 2.5;
      const mod = i % 5;
      if (mod === 0) actx.fillStyle = 'rgba(255, 252, 244, 0.65)'; // Pearl shell speck
      else if (mod === 1) actx.fillStyle = 'rgba(244, 172, 168, 0.45)'; // Pink coral grain
      else if (mod === 2) actx.fillStyle = 'rgba(168, 138, 96, 0.45)'; // Dark amber quartz
      else actx.fillStyle = 'rgba(218, 192, 145, 0.4)';
      actx.beginPath();
      actx.arc(x, y, sz, 0, Math.PI * 2);
      actx.fill();

      bctx.fillStyle = mod === 0 ? '#d8d8d8' : '#585858';
      bctx.fillRect(x, y, sz, sz);
    }

    // Scattered tiny embedded Spiral & Scallop Micro-Shells in the sand texture
    for (let s = 0; s < 45; s++) {
      const sx = Math.random() * 1000 + 12;
      const sy = Math.random() * 1000 + 12;
      const sr = 4 + Math.random() * 5;
      actx.save();
      actx.translate(sx, sy);
      actx.rotate(Math.random() * Math.PI * 2);
      actx.fillStyle = s % 2 === 0 ? 'rgba(255, 241, 230, 0.78)' : 'rgba(248, 210, 175, 0.75)';
      actx.beginPath();
      actx.arc(0, 0, sr, 0, Math.PI, false);
      actx.closePath();
      actx.fill();
      actx.strokeStyle = 'rgba(175, 135, 95, 0.55)';
      actx.lineWidth = 1;
      actx.stroke();
      actx.restore();
    }

    const sandAlbedo = new THREE.CanvasTexture(albedoCanvas);
    sandAlbedo.colorSpace = THREE.SRGBColorSpace;
    sandAlbedo.wrapS = THREE.RepeatWrapping;
    sandAlbedo.wrapT = THREE.RepeatWrapping;
    sandAlbedo.repeat.set(34, 34);
    sandAlbedo.anisotropy = maxAnisotropy;

    const sandBump = new THREE.CanvasTexture(bumpCanvas);
    sandBump.colorSpace = THREE.NoColorSpace;
    sandBump.wrapS = THREE.RepeatWrapping;
    sandBump.wrapT = THREE.RepeatWrapping;
    sandBump.repeat.set(34, 34);
    sandBump.anisotropy = maxAnisotropy;

    return { sandAlbedo, sandBump };
  };

  // 4. Botanical Seaweed & Giant Kelp Frond Texture (Midrib vein, lateral ribs, ruffled margins, cellular speckles)
  const buildKelpTextures = () => {
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = 256;
    albedoCanvas.height = 512;
    const actx = albedoCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 512;
    const bctx = bumpCanvas.getContext('2d')!;

    const bgGrad = actx.createLinearGradient(0, 0, 256, 0);
    bgGrad.addColorStop(0, '#0d6e52');
    bgGrad.addColorStop(0.25, '#169c72');
    bgGrad.addColorStop(0.5, '#34d399');
    bgGrad.addColorStop(0.75, '#169c72');
    bgGrad.addColorStop(1, '#0d6e52');
    actx.fillStyle = bgGrad;
    actx.fillRect(0, 0, 256, 512);

    bctx.fillStyle = '#606060';
    bctx.fillRect(0, 0, 256, 512);

    // Central raised botanical midrib vein
    const midGrad = actx.createLinearGradient(112, 0, 144, 0);
    midGrad.addColorStop(0, '#10b981');
    midGrad.addColorStop(0.5, '#a7f3d0');
    midGrad.addColorStop(1, '#10b981');
    actx.fillStyle = midGrad;
    actx.fillRect(118, 0, 20, 512);

    bctx.fillStyle = '#e8e8e8';
    bctx.fillRect(118, 0, 20, 512);

    // Lateral herringbone veins & ruffled blade corrugations
    for (let y = 8; y < 512; y += 16) {
      actx.strokeStyle = 'rgba(167, 243, 208, 0.42)';
      actx.lineWidth = 2.5;
      actx.beginPath();
      actx.moveTo(128, y);
      actx.quadraticCurveTo(70, y - 10, 8, y - 22);
      actx.moveTo(128, y);
      actx.quadraticCurveTo(186, y - 10, 248, y - 22);
      actx.stroke();

      bctx.strokeStyle = '#c8c8c8';
      bctx.lineWidth = 3;
      bctx.beginPath();
      bctx.moveTo(128, y);
      bctx.quadraticCurveTo(70, y - 10, 8, y - 22);
      bctx.moveTo(128, y);
      bctx.quadraticCurveTo(186, y - 10, 248, y - 22);
      bctx.stroke();
    }

    // Translucent golden-green chloroplast cells & pneumatocyst speckles
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 512;
      actx.fillStyle = i % 3 === 0 ? 'rgba(253, 224, 71, 0.25)' : 'rgba(6, 78, 59, 0.32)';
      actx.beginPath();
      actx.ellipse(x, y, 3, 2, 0.3, 0, Math.PI * 2);
      actx.fill();
    }

    const kelpAlbedo = new THREE.CanvasTexture(albedoCanvas);
    kelpAlbedo.colorSpace = THREE.SRGBColorSpace;
    kelpAlbedo.wrapS = THREE.RepeatWrapping;
    kelpAlbedo.wrapT = THREE.RepeatWrapping;
    kelpAlbedo.anisotropy = maxAnisotropy;

    const kelpBump = new THREE.CanvasTexture(bumpCanvas);
    kelpBump.colorSpace = THREE.NoColorSpace;
    kelpBump.wrapS = THREE.RepeatWrapping;
    kelpBump.wrapT = THREE.RepeatWrapping;
    kelpBump.anisotropy = maxAnisotropy;

    return { kelpAlbedo, kelpBump };
  };

  // 5. Coastal Lighthouse Masonry Texture (Crisp whitewashed coral stone & warm coral-red stripes)
  const buildLighthouseTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 512);

    // Classic maritime red-and-white horizontal bands
    ctx.fillStyle = '#e11d48';
    ctx.fillRect(0, 90, 256, 85);
    ctx.fillRect(0, 275, 256, 85);

    // Subtle stone block mortar lines
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.lineWidth = 2;
    for (let y = 0; y < 512; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  // 6. Weathered Shipwreck Timber Planks
  const buildWoodTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#4a3525';
    ctx.fillRect(0, 0, 256, 256);

    for (let p = 0; p < 8; p++) {
      const y = p * 32;
      ctx.fillStyle = p % 2 === 0 ? '#543c29' : '#432f20';
      ctx.fillRect(0, y, 256, 30);
      ctx.fillStyle = '#24180f';
      ctx.fillRect(0, y + 30, 256, 2);
      for (let g = 0; g < 16; g++) {
        ctx.strokeStyle = 'rgba(30, 18, 10, 0.35)';
        ctx.beginPath();
        ctx.moveTo(0, y + g * 2);
        ctx.bezierCurveTo(85, y + g * 2 + 3, 170, y + g * 2 - 3, 256, y + g * 2);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  // 7. Coconut Palm Ringed Trunk Bark
  const buildBarkTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#6e553e';
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 14) {
      ctx.fillStyle = '#4f3b28';
      ctx.fillRect(0, y, 128, 4);
      ctx.fillStyle = '#85694e';
      ctx.fillRect(0, y + 4, 128, 3);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  // 8. Soft Radial Contact Shadow Texture
  const buildRadialShadow = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(3, 18, 28, 0.58)');
    grad.addColorStop(0.55, 'rgba(3, 18, 28, 0.25)');
    grad.addColorStop(1, 'rgba(3, 18, 28, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // 9. Spotted Eagle Ray Texture (Dark indigo mantle with crisp white rosette spots)
  const buildEagleRayTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
    bgGrad.addColorStop(0, '#111827');
    bgGrad.addColorStop(0.5, '#1e1b4b');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Scattered white rosettes and rings across dorsal wings
    for (let i = 0; i < 90; i++) {
      const rx = 40 + Math.random() * 432;
      const ry = 40 + Math.random() * 432;
      const r = 2.5 + Math.random() * 4.5;

      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Ring accent
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(rx, ry, r * 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  // 10. Tropical Sally Lightfoot / Coral Crab Texture
  const buildCrabTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, '#ea580c');
    grad.addColorStop(0.65, '#dc2626');
    grad.addColorStop(1, '#991b1b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Stippled cream and turquoise reef speckles
    for (let s = 0; s < 70; s++) {
      const sx = 20 + Math.random() * 216;
      const sy = 20 + Math.random() * 216;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = s % 3 === 0 ? '#2dd4bf' : '#fef08a';
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  // 11. Oceanic Great Humpback Whale Texture (Slate Charcoal + Pale Throat Grooves)
  const buildWhaleTexture = (): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle countershading on lower half
    const bellyGrad = ctx.createLinearGradient(0, 256, 0, 512);
    bellyGrad.addColorStop(0, '#1e293b');
    bellyGrad.addColorStop(0.4, '#475569');
    bellyGrad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = bellyGrad;
    ctx.fillRect(0, 256, 512, 256);

    // Longitudinal ventral pleats/grooves
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 2.5;
    for (let p = 0; p < 24; p++) {
      const py = 290 + p * 8.5;
      ctx.beginPath();
      ctx.moveTo(30, py);
      ctx.lineTo(480, py);
      ctx.stroke();
    }

    // Barnacle rosette clusters near chin
    for (let b = 0; b < 16; b++) {
      const bx = 380 + (b % 4) * 26;
      const by = 260 + Math.floor(b / 4) * 22;
      ctx.beginPath();
      ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const momShellAlbedo = buildShellTexture(true, false);
  const babyShellAlbedo = buildShellTexture(false, false);
  const shellBump = buildShellTexture(true, true);
  const skinAlbedo = buildSkinTexture();
  const { sandAlbedo, sandBump } = buildSandTextures();
  const { kelpAlbedo, kelpBump } = buildKelpTextures();
  const lighthouseAlbedo = buildLighthouseTexture();
  const woodAlbedo = buildWoodTexture();
  const barkAlbedo = buildBarkTexture();
  const radialShadow = buildRadialShadow();
  const eagleRayAlbedo = buildEagleRayTexture();
  const crabAlbedo = buildCrabTexture();
  const whaleAlbedo = buildWhaleTexture();

  return {
    momShellAlbedo,
    babyShellAlbedo,
    shellBump,
    skinAlbedo,
    sandAlbedo,
    sandBump,
    kelpAlbedo,
    kelpBump,
    lighthouseAlbedo,
    woodAlbedo,
    barkAlbedo,
    radialShadow,
    eagleRayAlbedo,
    crabAlbedo,
    whaleAlbedo,
    dispose: () => {
      momShellAlbedo.dispose();
      babyShellAlbedo.dispose();
      shellBump.dispose();
      skinAlbedo.dispose();
      sandAlbedo.dispose();
      sandBump.dispose();
      kelpAlbedo.dispose();
      kelpBump.dispose();
      lighthouseAlbedo.dispose();
      woodAlbedo.dispose();
      barkAlbedo.dispose();
      radialShadow.dispose();
      eagleRayAlbedo.dispose();
      crabAlbedo.dispose();
      whaleAlbedo.dispose();
    },
  };
}
