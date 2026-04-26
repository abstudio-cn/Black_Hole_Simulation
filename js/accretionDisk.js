/**
 * accretionDisk.js - Accretion disk particle system for black hole simulation.
 *
 * Features:
 *   - Keplerian orbits with gravitational infall (collapse)
 *   - Temperature-based blackbody colour
 *   - Velocity-based trail (faster → longer & thicker)
 *   - Doppler effect (blueshift approaching, redshift receding)
 *   - Custom glow shader with soft circular falloff
 */

function createAccretionDisk(scene, blackHolePos) {
  const particleCount = 3000;
  const innerRadius = 2.0;
  const outerRadius = 22.0;
  const diskThickness = 0.6;
  const mass = 1.0; // Normalized black hole mass
  const maxTrailPoints = 64;

  // =====================
  // Particle state arrays
  // =====================
  const radii = new Float32Array(particleCount);
  const angles = new Float32Array(particleCount);
  const heights = new Float32Array(particleCount);
  const radialVel = new Float32Array(particleCount);
  const temperatures = new Float32Array(particleCount);

  // Velocity for trail & doppler
  const velocities = new Float32Array(particleCount * 3);

  // Trail history: [particleIndex * maxTrailPoints + trailIndex] → {x,y,z}
  const trailHistoryX = new Float32Array(particleCount * maxTrailPoints);
  const trailHistoryY = new Float32Array(particleCount * maxTrailPoints);
  const trailHistoryZ = new Float32Array(particleCount * maxTrailPoints);
  const trailAge = new Float32Array(particleCount * maxTrailPoints); // 1=newest, 0=oldest

  // =====================
  // Initialise particles
  // =====================
  function initParticles() {
    for (let i = 0; i < particleCount; i++) {
      // Concentration toward inner disk (more particles near black hole)
      const t = Math.random();
      const r = innerRadius + (outerRadius - innerRadius) * Math.pow(t, 1.5);

      radii[i] = r;
      angles[i] = Math.random() * Math.PI * 2.0;
      heights[i] = (Math.random() - 0.5) * diskThickness * (r - innerRadius) / (outerRadius - innerRadius);
      radialVel[i] = 0.0;

      // Temperature: hotter closer to black hole
      const tempFactor = 1.0 - (r - innerRadius) / (outerRadius - innerRadius);
      temperatures[i] = 1200 + tempFactor * 8800; // 1200K – 10000K

      // Compute initial angular velocity
      const omega = Physics.keplerianVelocity(r, mass);
      const vx = -r * omega * Math.sin(angles[i]);
      const vy = 0.0;
      const vz = r * omega * Math.cos(angles[i]);
      velocities[i * 3] = vx;
      velocities[i * 3 + 1] = vy;
      velocities[i * 3 + 2] = vz;

      // Init trail history to current position
      const px = r * Math.cos(angles[i]);
      const py = heights[i];
      const pz = r * Math.sin(angles[i]);
      for (let t = 0; t < maxTrailPoints; t++) {
        trailHistoryX[i * maxTrailPoints + t] = px;
        trailHistoryY[i * maxTrailPoints + t] = py;
        trailHistoryZ[i * maxTrailPoints + t] = pz;
        trailAge[i * maxTrailPoints + t] = 1.0 - t / maxTrailPoints;
      }
    }
  }
  initParticles();

  // =====================
  // Glow sprite texture
  // =====================
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const gctx = glowCanvas.getContext('2d');
  const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.04, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.12, 'rgba(255, 255, 255, 0.8)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.4)');
  grad.addColorStop(0.5, 'rgba(255, 200, 100, 0.1)');
  grad.addColorStop(0.75, 'rgba(128, 60, 20, 0.02)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 128, 128);

  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.needsUpdate = true;

  // =====================
  // Trail glow texture (sharp core, fast fade for comet-tail look)
  // =====================
  const trailCanvas = document.createElement('canvas');
  trailCanvas.width = 64;
  trailCanvas.height = 64;
  const tctx = trailCanvas.getContext('2d');
  const tgrad = tctx.createRadialGradient(32, 32, 0, 32, 32, 28);
  tgrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  tgrad.addColorStop(0.12, 'rgba(255, 255, 255, 0.85)');
  tgrad.addColorStop(0.3, 'rgba(255, 240, 200, 0.4)');
  tgrad.addColorStop(0.55, 'rgba(255, 160, 80, 0.08)');
  tgrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  tctx.fillStyle = tgrad;
  tctx.fillRect(0, 0, 64, 64);

  const trailTex = new THREE.CanvasTexture(trailCanvas);
  trailTex.needsUpdate = true;

  // =====================
  // Main particle geometry
  // =====================
  const particleGeom = new THREE.BufferGeometry();
  const pPositions = new Float32Array(particleCount * 3);
  const pColors = new Float32Array(particleCount * 3);
  const pSizes = new Float32Array(particleCount);

  particleGeom.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  particleGeom.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  particleGeom.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));

  const particleMat = new THREE.PointsMaterial({
    size: 0.825,  // 0.55 * 1.5 (default multiplier)
    map: glowTex,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity: 0.9
  });

  const particlePoints = new THREE.Points(particleGeom, particleMat);
  particlePoints.name = 'accretionParticles';
  particlePoints.renderOrder = 1;
  scene.add(particlePoints);

  // =====================
  // Trail particle geometry
  // =====================
  const totalTrailVerts = particleCount * maxTrailPoints;
  const trailPositions = new Float32Array(totalTrailVerts * 3);
  const trailColors = new Float32Array(totalTrailVerts * 3);
  const trailSizes = new Float32Array(totalTrailVerts);

  const trailGeom = new THREE.BufferGeometry();
  trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeom.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  trailGeom.setAttribute('size', new THREE.BufferAttribute(trailSizes, 1));

  const trailMat = new THREE.PointsMaterial({
    size: 0.525,  // 0.35 * 1.5 (default multiplier)
    map: trailTex,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity: 0.9
  });

  const trailPoints = new THREE.Points(trailGeom, trailMat);
  trailPoints.name = 'accretionTrails';
  scene.add(trailPoints);

  // =====================
  // State
  // =====================
  // Base material sizes (for setParticleSize to scale from)
  const BASE_PARTICLE_SIZE = 0.55;
  const BASE_TRAIL_SIZE = 0.35;

  let glowBrightness = 0.8;
  let collapseStrength = 0.3;
  let temperatureMultiplier = 1.0;
  let rotationSpeed = 2.3;
  let timeAccum = 0.0;

  // =====================
  // Public API
  // =====================
  return {
    particlePoints,
    trailPoints,
    particleCount,
    maxTrailPoints,

    setGlowBrightness(v) { glowBrightness = v; },
    setCollapseStrength(v) { collapseStrength = v; },
    setTemperatureMultiplier(v) { temperatureMultiplier = v; },
    setRotationSpeed(v) { rotationSpeed = v; },
    /** Set particle size multiplier — directly updates material.size for instant feedback */
    setParticleSize(v) {
      particleMat.size = BASE_PARTICLE_SIZE * v;
      trailMat.size = BASE_TRAIL_SIZE * v;
    },

    /**
     * Main update: physics + rendering.
     * @param {number} dt - Delta time
     * @param {THREE.Vector3} cameraPos - Camera world position (for doppler)
     */
    update(dt, cameraPos) {
      timeAccum += dt;
      const dtClamped = Math.min(dt, 0.05); // Prevent large jumps

      const posArr = particleGeom.getAttribute('position').array;
      const colArr = particleGeom.getAttribute('color').array;
      const sizeArr = particleGeom.getAttribute('size').array;

      const tposArr = trailGeom.getAttribute('position').array;
      const tcolArr = trailGeom.getAttribute('color').array;
      const tsizeArr = trailGeom.getAttribute('size').array;

      for (let i = 0; i < particleCount; i++) {
        // --- Update physics ---
        let r = radii[i];
        let theta = angles[i];
        let h = heights[i];
        let vr = radialVel[i];

        // Gravitational acceleration (inward)
        const gravA = Physics.gravityAcceleration(r, mass);

        // Collapse: adds inward radial velocity (strength boosted for visible effect)
        vr += collapseStrength * (-6.0 / Math.max(r * r, 0.25)) * dtClamped;

        // Update radius
        r += vr * dtClamped;
        // Clamp
        if (r < innerRadius * 0.8 || r > outerRadius * 1.15) {
          // Respawn at outer edge
          r = outerRadius * (0.9 + Math.random() * 0.1);
          vr = 0.0;
          theta = Math.random() * Math.PI * 2.0;
          h = (Math.random() - 0.5) * diskThickness * 0.1;
          temperatures[i] = 1200 + Math.random() * 2000;
        }

        // Keplerian angular velocity (scaled by rotationSpeed)
        const omega = Physics.keplerianVelocity(r, mass);
        theta += omega * rotationSpeed * dtClamped;

        // Damp vertical motion toward disk plane
        h *= (1.0 - 0.8 * dtClamped);

        // Store updated state
        radii[i] = r;
        angles[i] = theta;
        heights[i] = h;
        radialVel[i] = vr;

        // Update temperature (hotter near center, scaled by multiplier)
        const baseTempFactor = 1.0 - (r - innerRadius) / (outerRadius - innerRadius);
        const tempFactor = baseTempFactor * temperatureMultiplier;
        temperatures[i] += ((1200 + tempFactor * 8800) - temperatures[i]) * dtClamped * 2.0;

        // Current world position
        const px = r * Math.cos(theta);
        const py = h;
        const pz = r * Math.sin(theta);

        // Tangential velocity (for doppler)
        const vTan = r * omega;
        const vx = -vTan * Math.sin(theta) + vr * Math.cos(theta);
        const vy = 0.0;
        const vz = vTan * Math.cos(theta) + vr * Math.sin(theta);
        velocities[i * 3] = vx;
        velocities[i * 3 + 1] = vy;
        velocities[i * 3 + 2] = vz;

        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

        // --- Gravitational redshift (Schwarzschild metric) ---
        // (gravityAcceleration not needed for pure keplerian orbit; kept for reference)
        /* unused: const gravA = Physics.gravityAcceleration(r, mass); */

        // --- Gravitational redshift (Schwarzschild metric) ---
        // z_grav = 1 / sqrt(1 - Rs/r) - 1  →  light from near horizon is redshifted
        const Rs_grav = 2.0; // Schwarzschild radius
        const gravFactor = 1.0 - Rs_grav / Math.max(r, Rs_grav * 1.01);
        const gravRedshift = gravFactor > 0.001 ? 1.0 / Math.sqrt(gravFactor) - 1.0 : 3.0;
        const gravBrightness = Math.max(0.1, 1.0 / Math.pow(1.0 + gravRedshift, 3));

        // --- Doppler effect ---
        const velVec = new THREE.Vector3(vx, vy, vz);
        const posVec = new THREE.Vector3(px, py, pz);
        const doppler = Physics.dopplerEffect(velVec, posVec, cameraPos);

        // --- Blackbody colour ---
        const T = temperatures[i];
        const bb = Physics.blackbodyColor(T);

        // Apply doppler: blueshift → more blue, redshift → more red
        const shift = doppler.shift;
        let cr = bb.r, cg = bb.g, cb = bb.b;
        if (shift < 0) {
          // Blueshift: boost blue, reduce red
          const s = Math.min(-shift * 2.0, 1.0);
          cb = Math.min(1.0, cb + s * 0.5);
          cr = Math.max(0.1, cr - s * 0.3);
        } else {
          // Redshift: boost red, reduce blue
          const s = Math.min(shift * 2.0, 1.0);
          cr = Math.min(1.0, cr + s * 0.3);
          cb = Math.max(0.05, cb - s * 0.4);
        }

        // Apply gravitational redshift (redden near black hole)
        const gr = Math.min(gravRedshift * 0.15, 1.0);
        cr = cr * (1.0 - gr * 0.3) + gr * 0.3;
        cb = cb * (1.0 - gr * 0.5);

        // Apply relativistic beaming brightness (combined with gravitational dimming)
        const beamBright = doppler.brightness * gravBrightness;

        // --- Main particle ---
        posArr[i * 3] = px;
        posArr[i * 3 + 1] = py;
        posArr[i * 3 + 2] = pz;

        // Size: proportional to glow brightness, modulated by temperature
        const baseSize = 0.15 + glowBrightness * 0.45;
        const tempSize = 0.6 + tempFactor * 0.4;
        sizeArr[i] = baseSize * tempSize * beamBright;

        colArr[i * 3] = cr * beamBright * glowBrightness;
        colArr[i * 3 + 1] = cg * beamBright * glowBrightness;
        colArr[i * 3 + 2] = cb * beamBright * glowBrightness;

        // --- Trail ---
        // Shift trail history
        const baseIdx = i * maxTrailPoints;
        for (let t = maxTrailPoints - 1; t > 0; t--) {
          trailHistoryX[baseIdx + t] = trailHistoryX[baseIdx + t - 1];
          trailHistoryY[baseIdx + t] = trailHistoryY[baseIdx + t - 1];
          trailHistoryZ[baseIdx + t] = trailHistoryZ[baseIdx + t - 1];
          trailAge[baseIdx + t] = trailAge[baseIdx + t - 1] * 0.92;
        }
        trailHistoryX[baseIdx] = px;
        trailHistoryY[baseIdx] = py;
        trailHistoryZ[baseIdx] = pz;
        trailAge[baseIdx] = 1.0;

        // Active trail points: proportional to speed
        const speedNorm = Math.min(speed / 6.0, 1.0);
        const activeTrail = Math.max(12, Math.floor(12 + speedNorm * (maxTrailPoints - 12)));

        // Write trail geometry — head bright, tail transparent
        for (let t = 0; t < maxTrailPoints; t++) {
          const idx = baseIdx + t;
          tposArr[idx * 3] = trailHistoryX[idx];
          tposArr[idx * 3 + 1] = trailHistoryY[idx];
          tposArr[idx * 3 + 2] = trailHistoryZ[idx];

          const age = trailAge[idx];
          const tNorm = t / Math.max(maxTrailPoints - 1, 1); // 0=head → 1=tail

          // Cubic ease-out: head bright (0.95), tail → transparent (0)
          const fade = 1.0 - tNorm;
          const trailAlpha = t < activeTrail ? fade * fade * fade * 0.95 * age : 0.0;

          // Size: head large, shrinks toward tail
          const sizeFade = Math.pow(fade, 1.5);
          const trailSz = (0.06 + speedNorm * 0.22) * sizeFade * glowBrightness * 1.3;

          tsizeArr[idx] = trailSz;
          // Head boost: slightly brighter colour near head
          const headBoost = 1.0 + fade * 0.3;
          tcolArr[idx * 3] = cr * trailAlpha * beamBright * glowBrightness * headBoost;
          tcolArr[idx * 3 + 1] = cg * trailAlpha * beamBright * glowBrightness * headBoost;
          tcolArr[idx * 3 + 2] = cb * trailAlpha * beamBright * glowBrightness * headBoost;
        }
      }

      // Update buffers
      particleGeom.getAttribute('position').needsUpdate = true;
      particleGeom.getAttribute('color').needsUpdate = true;
      particleGeom.getAttribute('size').needsUpdate = true;
      trailGeom.getAttribute('position').needsUpdate = true;
      trailGeom.getAttribute('color').needsUpdate = true;
      trailGeom.getAttribute('size').needsUpdate = true;
    },

    getVelocities() { return velocities; },
    getRadii() { return radii; },
    getAngles() { return angles; },
    getHeights() { return heights; },

    dispose() {
      particleGeom.dispose();
      particleMat.dispose();
      trailGeom.dispose();
      trailMat.dispose();
      glowTex.dispose();
      trailTex.dispose();
    }
  };
}
