/**
 * physics.js - Physical utilities for black hole simulation
 * 
 * Provides:
 *   - Blackbody radiation color from temperature
 *   - Keplerian orbital velocity
 *   - Doppler shift
 *   - Gravitational deflection angle
 *   - Vector rotation helper
 */

const Physics = {

  /**
   * Approximate blackbody radiation colour from temperature (Kelvin).
   * Uses a simplified piecewise model (red → orange → yellow → white → blue).
   * Range: ~1000 K (dull red) to ~30000 K (blue-white).
   */
  blackbodyColor: function (T) {
    // Clamp to reasonable range
    const t = Math.max(800, Math.min(50000, T));
    let r, g, b;

    if (t < 2000) {
      // Deep red → orange
      const f = (t - 800) / 1200;
      r = 1.0;
      g = 0.15 + f * 0.45;
      b = 0.02 + f * 0.08;
    } else if (t < 4000) {
      // Orange → yellow
      const f = (t - 2000) / 2000;
      r = 1.0;
      g = 0.6 + f * 0.4;
      b = 0.1 + f * 0.4;
    } else if (t < 6500) {
      // Yellow → white
      const f = (t - 4000) / 2500;
      r = 1.0;
      g = 1.0;
      b = 0.5 + f * 0.5;
    } else if (t < 12000) {
      // White → blue-white
      const f = (t - 6500) / 5500;
      r = 1.0 - f * 0.3;
      g = 1.0 - f * 0.15;
      b = 1.0;
    } else {
      // Blue-white → deep blue
      const f = Math.min(1.0, (t - 12000) / 38000);
      r = 0.7 - f * 0.4;
      g = 0.85 - f * 0.5;
      b = 1.0;
    }

    return { r: Math.max(0, r), g: Math.max(0, g), b: Math.max(0, b) };
  },

  /**
   * Keplerian orbital angular velocity at distance r from mass M.
   * ω = sqrt(G*M / r^3)
   * Returns angular velocity in rad/s (normalized units).
   */
  keplerianVelocity: function (r, mass) {
    const G = 1.0; // Normalized gravitational constant
    return Math.sqrt(G * mass / Math.max(r * r * r, 0.001));
  },

  /**
   * Radial gravitational acceleration.
   * a = -G*M / r^2
   */
  gravityAcceleration: function (r, mass) {
    const G = 1.0;
    return -G * mass / Math.max(r * r, 0.001);
  },

  /**
   * Doppler shift factor for a particle moving relative to camera.
   * @param {THREE.Vector3} velocity - Particle velocity
   * @param {THREE.Vector3} particlePos - Particle world position
   * @param {THREE.Vector3} cameraPos - Camera world position
   * @returns {object} { shift, brightness } — shift < 0 = blueshifted, shift > 0 = redshifted.
   *                    brightness is the relativistic beaming boost (>1 = brighter).
   */
  dopplerEffect: function (velocity, particlePos, cameraPos) {
    const c = 30.0; // Speed of light in simulation units
    const toCamera = cameraPos.clone().sub(particlePos).normalize();
    const vNorm = velocity.clone().normalize();
    const vMag = velocity.length();

    // Radial component (toward/away from observer)
    const vRadial = velocity.dot(toCamera);
    const beta = vRadial / c;

    // Relativistic Doppler factor
    // z = sqrt((1+beta)/(1-beta)) - 1
    const gamma = 1.0 / Math.sqrt(1.0 - Math.min((vMag / c) * (vMag / c), 0.99));
    const dopplerFactor = Math.sqrt((1.0 + beta) / Math.max(1.0 - beta, 0.01));

    // Relativistic beaming (aberration + Doppler)
    // Intensity boost: I'/I = (1 / (gamma * (1 - beta * cos(theta))))^4
    const cosTheta = vNorm.dot(toCamera);
    const beaming = Math.pow(1.0 / (gamma * (1.0 - beta * cosTheta)), 4);
    const brightness = Math.min(beaming, 5.0);

    return {
      shift: dopplerFactor - 1.0,  // z > 0 = redshift, z < 0 = blueshift
      brightness: Math.max(0.1, brightness)
    };
  },

  /**
   * Gravitational deflection angle (Schwarzschild metric, weak-field approximation).
   * θ ≈ 4GM/(c^2 * b) = 2*Rs/b   for b >> Rs
   * Becomes large as b → photon sphere.
   * 
   * @param {number} b - Impact parameter
   * @param {number} Rs - Schwarzschild radius
   * @returns {number} Deflection angle in radians
   */
  deflectionAngle: function (b, Rs) {
    const photonSphere = 1.5 * Rs;  // 3GM/c^2
    if (b <= Rs * 0.95) return Math.PI * 2.0; // Captured
    if (b >= photonSphere * 4.0) {
      // Weak field
      return (2.0 * Rs) / b;
    }
    // Intermediate / strong field: interpolate
    const t = (b - Rs) / (photonSphere * 4.0 - Rs);
    const weak = (2.0 * Rs) / b;
    const strong = (2.0 * Rs) / Math.max(b - photonSphere + 0.01, 0.01);
    return weak + (strong - weak) * Math.pow(1.0 - Math.min(t, 1.0), 2.0);
  },

  /**
   * Rotate a vector around a given axis by an angle (in radians).
   * Uses Rodrigues' rotation formula.
   */
  rotateVector: function (v, axis, angle) {
    const k = axis.clone().normalize();
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const dot = v.dot(k);

    // Rodrigues: v_rot = v*cosθ + (k×v)*sinθ + k*(k·v)*(1-cosθ)
    const cross = new THREE.Vector3(
      k.y * v.z - k.z * v.y,
      k.z * v.x - k.x * v.z,
      k.x * v.y - k.y * v.x
    );

    return new THREE.Vector3(
      v.x * cosA + cross.x * sinA + k.x * dot * (1.0 - cosA),
      v.y * cosA + cross.y * sinA + k.y * dot * (1.0 - cosA),
      v.z * cosA + cross.z * sinA + k.z * dot * (1.0 - cosA)
    );
  },

  /**
   * Convert a 3D direction vector to equirectangular UV coordinates.
   * Useful for sampling a 2D texture with a direction.
   */
  directionToUV: function (dir) {
    const d = dir.clone().normalize();
    const u = 0.5 + Math.atan2(d.x, -d.z) / (2.0 * Math.PI);
    const v = 0.5 - Math.asin(d.y) / Math.PI;
    return { u, v };
  }
};
