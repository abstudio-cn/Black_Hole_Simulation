/**
 * main.js - Central orchestrator for the black hole simulation.
 *
 * Sets up the Three.js scene, camera, renderer, orbit controls,
 * and manages the two-pass rendering pipeline for gravitational lensing.
 */

(function () {
  'use strict';

  // =====================
  // DOM container
  // =====================
  const container = document.getElementById('container');

  // =====================
  // Renderer
  // =====================
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // =====================
  // Scene
  // =====================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  scene.fog = new THREE.FogExp2(0x000005, 0.00003);

  // =====================
  // Camera
  // =====================
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.5,
    1000
  );
  camera.position.set(8, 6, 18);
  camera.lookAt(0, 0, 0);

  // =====================
  // Ambient light (minimal — we use additive particles)
  // =====================
  const ambientLight = new THREE.AmbientLight(0x111122, 0.5);
  scene.add(ambientLight);

  // =====================
  // Cosmic Background (deep space, outside starfield)
  // =====================
  const cosmicBg = createCosmicBackground(scene);

  // =====================
  // Starfield
  // =====================
  const starfield = createStarfield(scene);

  // =====================
  // Accretion Disk
  // =====================
  const bhPos = new THREE.Vector3(0, 0, 0);
  const disk = createAccretionDisk(scene, bhPos);

  // =====================
  // Black Hole
  // =====================
  const blackHole = createBlackHole(scene, renderer);

  // =====================
  // Orbit Controls (custom)
  // =====================
  const orbitState = {
    spherical: new THREE.Spherical(),
    target: new THREE.Vector3(0, 0, 0),
    isDragging: false,
    isPanning: false,
    prevMouse: new THREE.Vector2(),
    rotationSpeed: 0.005,
    zoomSpeed: 0.08,
    panSpeed: 0.015,
    minDistance: 5.0,
    maxDistance: 60.0,
    minPolar: 0.05,  // ~3° from up
    maxPolar: Math.PI * 0.95 // ~171° from up (equivalent to ±87° pitch)
  };

  // Initialise spherical from camera position
  (function initOrbit() {
    const offset = camera.position.clone().sub(orbitState.target);
    orbitState.spherical.setFromVector3(offset);
    // Clamp to valid range
    orbitState.spherical.radius = THREE.MathUtils.clamp(
      orbitState.spherical.radius,
      orbitState.minDistance,
      orbitState.maxDistance
    );
    orbitState.spherical.phi = THREE.MathUtils.clamp(
      orbitState.spherical.phi,
      orbitState.minPolar,
      orbitState.maxPolar
    );
  })();

  function updateCameraFromOrbit() {
    const pos = new THREE.Vector3().setFromSpherical(orbitState.spherical).add(orbitState.target);
    camera.position.copy(pos);
    camera.lookAt(orbitState.target);
  }

  // Mouse events
  renderer.domElement.addEventListener('pointerdown', (e) => {
    orbitState.prevMouse.set(e.clientX, e.clientY);
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      orbitState.isPanning = true;
    } else if (e.button === 0) {
      orbitState.isDragging = true;
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!orbitState.isDragging && !orbitState.isPanning) return;
    const dx = e.clientX - orbitState.prevMouse.x;
    const dy = e.clientY - orbitState.prevMouse.y;
    orbitState.prevMouse.set(e.clientX, e.clientY);

    if (orbitState.isDragging) {
      // Rotate
      orbitState.spherical.theta -= dx * orbitState.rotationSpeed;
      orbitState.spherical.phi -= dy * orbitState.rotationSpeed;
      orbitState.spherical.phi = THREE.MathUtils.clamp(
        orbitState.spherical.phi,
        orbitState.minPolar,
        orbitState.maxPolar
      );
    }

    if (orbitState.isPanning) {
      // Pan
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.getWorldDirection(new THREE.Vector3());
      right.crossVectors(camera.up, new THREE.Vector3().subVectors(camera.position, orbitState.target).normalize()).normalize();
      up.copy(camera.up).normalize();

      const panScale = orbitState.spherical.radius * orbitState.panSpeed;
      orbitState.target.addScaledVector(right, -dx * panScale);
      orbitState.target.addScaledVector(up, dy * panScale);
    }

    updateCameraFromOrbit();
  });

  window.addEventListener('pointerup', () => {
    orbitState.isDragging = false;
    orbitState.isPanning = false;
  });

  // Scroll zoom
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbitState.spherical.radius += e.deltaY * orbitState.zoomSpeed * 0.01;
    orbitState.spherical.radius = THREE.MathUtils.clamp(
      orbitState.spherical.radius,
      orbitState.minDistance,
      orbitState.maxDistance
    );
    updateCameraFromOrbit();
  }, { passive: false });

  // Touch support: pinch zoom
  let lastPinchDist = 0;
  renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  renderer.domElement.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = lastPinchDist - dist;
      orbitState.spherical.radius += delta * orbitState.zoomSpeed * 0.02;
      orbitState.spherical.radius = THREE.MathUtils.clamp(
        orbitState.spherical.radius,
        orbitState.minDistance,
        orbitState.maxDistance
      );
      lastPinchDist = dist;
      updateCameraFromOrbit();
    }
  }, { passive: true });

  // Disable context menu on canvas
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  // =====================
  // Control Panel
  // =====================
  const panel = createControlPanel();

  // Wire controls to disk
  panel.on('temperature', (v) => {
    disk.setTemperatureMultiplier(v * 2.0);
    blackHole.setTemperature(v);
  });
  disk.setTemperatureMultiplier(panel.getState().temperature * 2.0);
  blackHole.setTemperature(panel.getState().temperature);

  panel.on('glow', (v) => {
    disk.setGlowBrightness(v);
    blackHole.setDiskBrightness(v);
  });
  disk.setGlowBrightness(panel.getState().glowBrightness);
  blackHole.setDiskBrightness(panel.getState().glowBrightness);

  panel.on('collapse', (v) => {
    updateCollapse();
  });

  panel.on('bhSize', (v) => {
    // Map 0..1 slider to Rs 1.0..6.0 (default 0.33 → Rs=2.0)
    const rs = 1.0 + v * 5.0;
    blackHole.setRs(rs);
    updateCollapse();
  });

  // Combined collapse = baseCollapse × (Rs / 2.0) — bigger hole → stronger gravity
  function updateCollapse() {
    const base = panel.getState().collapseStrength;
    const rs = 1.0 + panel.getState().bhSize * 5.0;
    const sizeMul = rs / 2.0;
    disk.setCollapseStrength(base * sizeMul);
  }

  panel.on('particleSize', (v) => {
    disk.setParticleSize(0.3 + v * 2.4);
  });
  disk.setParticleSize(0.3 + panel.getState().particleSize * 2.4);

  panel.on('rotationSpeed', (v) => {
    disk.setRotationSpeed(0.3 + v * 4.0);
  });
  disk.setRotationSpeed(0.3 + panel.getState().rotationSpeed * 4.0);

  // Init all defaults
  blackHole.setRs(1.0 + panel.getState().bhSize * 5.0);
  updateCollapse();
  disk.setGlowBrightness(panel.getState().glowBrightness);
  disk.setTemperatureMultiplier(panel.getState().temperature * 2.0);

  // =====================
  // Animation loop
  // =====================
  const clock = new THREE.Clock();
  let lastTime = performance.now() / 1000;

  function animate(timestamp) {
    requestAnimationFrame(animate);

    const now = timestamp / 1000;
    const dt = Math.min(now - lastTime, 0.1);
    lastTime = now;

    // --- Update starfield ---
    starfield.update(now);

    // --- Update accretion disk ---
    disk.update(dt, camera.position);

    // =====================
    // PASS 1: Render scene (starfield + disk) to texture (with fog)
    // =====================
    const rt = blackHole.beginScenePass();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000005, 1.0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // =====================
    // PASS 2: Render to screen
    //   - Starfield + disk rendered directly (no double fog)
    //   - Black hole with lensing shader on top
    // =====================
    blackHole.beginBHPass(camera);
    renderer.setClearColor(0x000005, 1.0);
    renderer.clear();

    // Temporarily use zero-density fog to avoid double-fogging
    // (starfield+disk already have fog applied in the rt pass)
    const savedFog = scene.fog;
    scene.fog = new THREE.FogExp2(0x000005, 0.0);
    renderer.render(scene, camera);
    scene.fog = savedFog;
  }

  // =====================
  // Resize handler
  // =====================
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    blackHole.resize(w, h);
  });

  // =====================
  // Keyboard shortcuts
  // =====================
  window.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
      case 'r':
        // Reset camera
        orbitState.spherical.set(22, Math.PI / 3, 0.5);
        orbitState.target.set(0, 0, 0);
        updateCameraFromOrbit();
        break;
      case 'f':
        // Front view
        orbitState.spherical.set(20, Math.PI / 2, 0);
        orbitState.target.set(0, 0, 0);
        updateCameraFromOrbit();
        break;
      case 't':
        // Top view
        orbitState.spherical.set(18, 0.1, 0);
        orbitState.target.set(0, 0, 0);
        updateCameraFromOrbit();
        break;
    }
  });

  // =====================
  // Start
  // =====================
  updateCameraFromOrbit();
  requestAnimationFrame(animate);

  // Expose for debugging
  window.__blackholeApp = {
    scene,
    camera,
    renderer,
    cosmicBg,
    starfield,
    disk,
    blackHole,
    orbitState,
    panel
  };

  console.log('🌌 Black hole simulation ready.');
  console.log('   Drag to rotate | Scroll to zoom | Right-drag to pan');
  console.log('   Keys: R=reset F=front T=top');
})();
