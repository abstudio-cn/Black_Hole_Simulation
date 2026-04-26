/**
 * starfield.js - Background starfield for the black hole simulation.
 * 
 * Creates a large sphere of glowing point particles behind everything.
 * Stars twinkle slightly over time and have varied colours/sizes.
 */

function createStarfield(scene) {
  const starCount = 3000;
  const radius = 500.0;

  // --- Geometry ---
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const baseSizes = new Float32Array(starCount);
  const twinklePhases = new Float32Array(starCount);
  const twinkleSpeeds = new Float32Array(starCount);

  for (let i = 0; i < starCount; i++) {
    // Uniform random on sphere
    const theta = Math.random() * Math.PI * 2.0;
    const phi = Math.acos(2.0 * Math.random() - 1.0);
    const r = radius * (0.92 + Math.random() * 0.08);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Star colour: mostly white/blue-white, some yellow/red
    const type = Math.random();
    let cr, cg, cb;
    if (type < 0.6) {
      // White / blue-white (hot)
      cr = 0.85 + Math.random() * 0.15;
      cg = 0.88 + Math.random() * 0.12;
      cb = 0.9 + Math.random() * 0.1;
    } else if (type < 0.8) {
      // Yellow
      cr = 0.95 + Math.random() * 0.05;
      cg = 0.75 + Math.random() * 0.2;
      cb = 0.4 + Math.random() * 0.3;
    } else if (type < 0.92) {
      // Orange
      cr = 0.9 + Math.random() * 0.1;
      cg = 0.5 + Math.random() * 0.25;
      cb = 0.2 + Math.random() * 0.2;
    } else {
      // Red / cool
      cr = 0.75 + Math.random() * 0.25;
      cg = 0.3 + Math.random() * 0.2;
      cb = 0.25 + Math.random() * 0.2;
    }
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;

    // Size: most small, few larger
    const sz = 0.3 + Math.random() * 2.2 * Math.random();
    sizes[i] = sz;
    baseSizes[i] = sz;
    twinklePhases[i] = Math.random() * Math.PI * 2.0;
    twinkleSpeeds[i] = 0.3 + Math.random() * 2.5;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // --- Glow sprite texture (canvas-generated) ---
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 64;
  spriteCanvas.height = 64;
  const ctx = spriteCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.08, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.2, 'rgba(255, 240, 220, 0.7)');
  gradient.addColorStop(0.45, 'rgba(200, 180, 255, 0.2)');
  gradient.addColorStop(0.7, 'rgba(80, 60, 120, 0.03)');
  gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const spriteTex = new THREE.CanvasTexture(spriteCanvas);
  spriteTex.needsUpdate = true;

  // --- Material ---
  const mat = new THREE.PointsMaterial({
    size: 1.6,
    map: spriteTex,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity: 0.9
  });

  const points = new THREE.Points(geom, mat);
  points.name = 'starfield';
  points.renderOrder = 0;
  scene.add(points);

  // --- Return update function ---
  return {
    points,
    sizes,
    baseSizes,
    twinklePhases,
    twinkleSpeeds,
    starCount,
    spriteTex, // keep reference so it isn't GC'd

    update(time) {
      const sizeAttr = geom.getAttribute('size');
      if (!sizeAttr) return;
      const arr = sizeAttr.array;
      for (let i = 0; i < starCount; i++) {
        const twinkle = 0.5 + 0.5 * Math.sin(time * twinkleSpeeds[i] + twinklePhases[i]);
        // Subtle twinkle: 85%–115% of base size
        arr[i] = baseSizes[i] * (0.85 + twinkle * 0.3);
      }
      sizeAttr.needsUpdate = true;
    },

    dispose() {
      geom.dispose();
      mat.dispose();
      spriteTex.dispose();
    }
  };
}
