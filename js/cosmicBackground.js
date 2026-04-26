/**
 * cosmicBackground.js - Procedural deep-space background for black hole simulation.
 *
 * Creates a large sphere with a canvas-generated cosmic texture (nebula-like
 * gradients, dark-space colours) rendered behind the starfield and all other
 * scene objects.  Rendered as a BackSide sphere so the camera sees the inside.
 */

function createCosmicBackground(scene) {
  const radius = 800.0;

  // =====================
  // Procedural cosmic texture (canvas)
  // =====================
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // --- Pure black background ---
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- Faint distant stars sprinkled on the texture ---
  for (let s = 0; s < 800; s++) {
    const sx = Math.random() * canvas.width;
    const sy = Math.random() * canvas.height;
    const sr = 0.3 + Math.random() * 1.8;
    const sa = 0.15 + Math.random() * 0.5;
    ctx.fillStyle = `rgba(230,210,180,${sa})`;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  const cosmicTex = new THREE.CanvasTexture(canvas);
  cosmicTex.wrapS = THREE.RepeatWrapping;
  cosmicTex.wrapU = THREE.RepeatWrapping;
  cosmicTex.colorSpace = THREE.SRGBColorSpace;
  cosmicTex.needsUpdate = true;

  // =====================
  // Large sphere with BackSide rendering
  // =====================
  const geom = new THREE.SphereGeometry(radius, 64, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: cosmicTex,
    side: THREE.BackSide,   // Camera sees the inside
    fog: false,             // Always visible, unaffected by fog
    depthWrite: false,
    depthTest: true
  });

  const sphere = new THREE.Mesh(geom, mat);
  sphere.name = 'cosmicBackground';
  sphere.renderOrder = -1;  // Behind everything
  scene.add(sphere);

  // =====================
  // Public API
  // =====================
  return {
    sphere,
    cosmicTex,

    dispose() {
      geom.dispose();
      mat.dispose();
      cosmicTex.dispose();
    }
  };
}
