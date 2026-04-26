/**
 * blackhole.js - Black hole rendering with gravitational lensing shader.
 *
 * Two-pass approach:
 *   1. Scene (starfield + accretion disk) rendered to a texture
 *   2. Black hole sphere samples that texture with gravitational deflection
 *
 * Effects:
 *   - Event horizon (black centre with soft falloff)
 *   - Photon ring / Einstein ring
 *   - Gravitational lensing deflection
 *   - Soft linear edge transitions
 */

function createBlackHole(scene, renderer) {
  let Rs = 2.0;             // Schwarzschild radius (mutable via setRs)
  let photonSphere = 1.5 * Rs;  // 3GM/c² (scales with Rs)
  let lensingRadius = 8.0;  // Sphere radius for visible lensing region (scales with Rs)
  const position = new THREE.Vector3(0, 0, 0);

  // =====================
  // Render target for scene (without black hole)
  // =====================
  let sceneRT = new THREE.WebGLRenderTarget(
    renderer.domElement.width,
    renderer.domElement.height,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    }
  );

  // =====================
  // Custom shader material
  // =====================
  const vertexShader = /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec4 vScreenPos;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vScreenPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = vScreenPos;
    }
  `;

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vWorldNormal;
    varying vec4 vScreenPos;

    uniform sampler2D uSceneTexture;
    uniform vec3 uCameraPos;
    uniform vec3 uBlackHolePos;
    uniform float uRs;
    uniform float uPhotonSphere;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uTemperature;
    uniform float uDiskBrightness;

    void main() {
      vec3 viewDir = normalize(vWorldPos - uCameraPos);
      vec3 toCenter = uBlackHolePos - uCameraPos;

      // -- Impact parameter (world-space closest-approach distance) --
      float tca = dot(toCenter, viewDir);
      vec3 closestPoint = uCameraPos + viewDir * tca;
      float b = length(closestPoint - uBlackHolePos);

      // Sphere world-space radius
      float sphereR = 4.0 * uRs;
      float photonDist = uPhotonSphere;

      // ---- Event horizon (dark core) ----
      if (b < uRs * 0.55) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // ================================================================
      //  POINT-MASS GRAVITATIONAL LENS EQUATION
      //
      //  β = θ − θ_E² / θ
      //
      //  θ   = observed angular position on the sky  (→ screen radius r)
      //  β   = true source angular position           (→ source radius r_src)
      //  θ_E = Einstein radius (critical curve)
      //
      //  For r >> rE :  r_src ≈ r               (no lensing, outer edge)
      //  For r  = rE :  r_src = 0               (Einstein ring)
      //  For r  < rE :  r_src < 0               (inverted mirror image)
      //
      //  Magnification:  μ = 1 / |1 − (rE/r)⁴|
      // ================================================================

      // Screen-space UV and BH centre
      vec2 screenUV  = vScreenPos.xy / vScreenPos.w * 0.5 + 0.5;
      vec2 bhCenter  = vec2(0.5);          // BH at world origin, camera looks at origin

      vec2 delta   = screenUV - bhCenter;
      float r      = length(delta);
      vec2  rDir   = r > 0.001 ? delta / r : vec2(1.0, 0.0);

      // Einstein radius — maps photon sphere to screen coordinates.
      // Uses the current pixel's world→screen ratio (approx constant across sphere).
      float rE_raw = r * photonDist / max(b, 0.001);
      float rE     = clamp(rE_raw, 0.02, 0.30);

      // ---- Lens equation:  r_src = r − rE² / r ----
      float rSrc = r - (rE * rE) / max(r, 0.001);

      // Handle inversion: negative rSrc → image from opposite side of BH
      vec2  srcDir;
      float absRSrc;
      if (rSrc >= 0.0) {
        srcDir  = rDir;
        absRSrc = rSrc;
      } else {
        srcDir  = -rDir;          // reversed → mirror image
        absRSrc = -rSrc;
      }

      // Sample background at lensed (source) position
      vec2 srcUV = bhCenter + srcDir * absRSrc;
      srcUV = clamp(srcUV, vec2(0.0), vec2(1.0));
      vec3 bgColor = texture2D(uSceneTexture, srcUV).rgb;

      // ---- Magnification (surface-brightness conservation) ----
      float rERat   = clamp(rE / max(r, 0.001), 0.0, 0.98);
      float mu      = 1.0 / abs(1.0 - rERat * rERat * rERat * rERat);
      mu = clamp(mu, 0.25, 4.5);

      vec3 color = bgColor * mu;

      // ---- Photon ring glow (at photon sphere, world-space) ----
      float ringDist   = abs(b - photonDist);
      float ringCore   = exp(-ringDist * ringDist * 12.0) * 0.55;
      float ringOuter  = exp(-ringDist * ringDist * 3.0) * 0.18;

      float temp = uTemperature;
      vec3 warmRing = vec3(1.0, 0.75, 0.30);
      vec3 hotRing  = vec3(0.60, 0.78, 1.0);
      float diskB = uDiskBrightness;
      color += mix(warmRing, hotRing, temp) * (ringCore + ringOuter) * diskB;

      // ---- Inner glow (between event horizon and photon sphere) ----
      float innerGlow = 0.0;
      if (b > uRs * 1.05 && b < photonDist) {
        innerGlow = pow((photonDist - b) / (photonDist - uRs * 1.05), 1.5) * 0.25;
      }
      vec3 warmGlow = vec3(0.40, 0.22, 0.05);
      vec3 hotGlow  = vec3(0.12, 0.30, 0.65);
      color += mix(warmGlow, hotGlow, temp) * innerGlow;

      // ---- Event-horizon soft edge ----
      float horizonSoft = smoothstep(uRs * 0.5, uRs * 1.15, b);
      color = mix(vec3(0.001, 0.0, 0.004), color, horizonSoft);

      // ---- Outer transition: lensed → raw background ----
      // Lens equation gives rSrc ≈ r far from BH; use smoothstep for cushion.
      float outerFade = 1.0 - smoothstep(sphereR * 0.30, sphereR * 0.78, b);
      vec3  rawBg     = texture2D(uSceneTexture, screenUV).rgb;
      color = mix(rawBg, color, outerFade);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const uniforms = {
    uSceneTexture: { value: sceneRT.texture },
    uCameraPos: { value: new THREE.Vector3() },
    uBlackHolePos: { value: position.clone() },
    uRs: { value: Rs },
    uPhotonSphere: { value: photonSphere },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height) },
    uTemperature: { value: 0.5 },
    uDiskBrightness: { value: 0.65 }
  };

  const shaderMat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,  // Lens on both front (outside) and back (inside) faces
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending
  });

  // Sphere for lensing region
  const sphereGeom = new THREE.SphereGeometry(lensingRadius, 128, 128);
  const sphere = new THREE.Mesh(sphereGeom, shaderMat);
  sphere.name = 'blackHole';
  sphere.renderOrder = 999; // Always render on top
  scene.add(sphere);

  // Small black sphere at centre — the black hole entity
  const coreGeom = new THREE.SphereGeometry(Rs * 0.95, 64, 64);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const coreSphere = new THREE.Mesh(coreGeom, coreMat);
  coreSphere.name = 'blackHoleCore';
  coreSphere.renderOrder = 1000; // On top of lensing sphere
  scene.add(coreSphere);

  // =====================
  // Public API
  // =====================
  return {
    mesh: sphere,
    shaderMat,
    uniforms,
    sceneRT,
    Rs,
    photonSphere,
    position,

    /** Resize render target (call on window resize). */
    resize(w, h) {
      sceneRT.setSize(w, h);
      uniforms.uResolution.value.set(w, h);
    },

    /**
     * Prepare for scene pass: hide black hole, return render target.
     * Call before rendering starfield+disk.
     */
    beginScenePass() {
      sphere.visible = false;
      coreSphere.visible = false;
      return sceneRT;
    },

    /**
     * Prepare for black hole pass: show black hole, update camera uniform.
     * Call before rendering black hole to screen.
     */
    beginBHPass(camera) {
      sphere.visible = true;
      coreSphere.visible = true;
      uniforms.uCameraPos.value.copy(camera.position);
      uniforms.uTime.value += 0.016;
      uniforms.uSceneTexture.value = sceneRT.texture;
    },

    /**
     * Dynamically adjust black hole Schwarzschild radius.
     * Scales photon sphere, lensing sphere, core sphere, and uniforms.
     * @param {number} r - New Schwarzschild radius (clamped 1.0–6.0)
     */
    setRs(r) {
      r = THREE.MathUtils.clamp(r, 1.0, 6.0);
      const scale = r / 2.0;  // 2.0 = initial default Rs, always compute absolute scale
      Rs = r;
      photonSphere = 1.5 * Rs;
      lensingRadius = 4.0 * Rs;

      // Scale both spheres uniformly (absolute, not cumulative)
      sphere.scale.setScalar(scale);
      coreSphere.scale.setScalar(scale);

      // Update shader uniforms
      uniforms.uRs.value = Rs;
      uniforms.uPhotonSphere.value = photonSphere;
    },

    /** Set photon ring temperature from control panel (0..1). */
    setTemperature(v) {
      uniforms.uTemperature.value = v;
    },

    /** Set photon ring brightness from disk glow brightness (0..1). */
    setDiskBrightness(v) {
      uniforms.uDiskBrightness.value = v;
    },

    dispose() {
      sphereGeom.dispose();
      shaderMat.dispose();
      coreGeom.dispose();
      coreMat.dispose();
      sceneRT.dispose();
    }
  };
}
