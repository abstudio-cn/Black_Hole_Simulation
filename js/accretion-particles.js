/**
 * accretion-particles.js — General-Relativistic Rotating Particle Disk
 *
 * 10000 particles on Schwarzschild geodesic orbits:
 *  - ISCO (3 Rs) → Keplerian stable circular orbit
 *  - Rs < r < ISCO → inspiral (no stable orbit, plunging geodesic)
 *  - r < Rs → swallowed by horizon → respawn at random disk position
 *  - Temperature-based colour: Shakura-Sunyaev T ∝ r^(-3/4)
 *  - Relativistic Doppler beaming (I ∝ doppler^3.5)
 *  - 8-point per-particle trail with exponential fade
 */

import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
//  SHADERS
// ═══════════════════════════════════════════════════════════════════════════

const particleVert = /* glsl */ `
attribute float aSize;
attribute float aBrightness;
varying vec3  vColor;
varying float vAlpha;
void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (250.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
    vColor = color;
    vAlpha = aBrightness;
}
`;

const particleFrag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float glow = exp(-d * d * 3.5);
    if (glow < 0.02) discard;
    float alpha = glow * vAlpha;
    gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

const trailVert = /* glsl */ `
attribute float aFade;
varying float vFade;
varying vec3  vColor;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 2.5 * (150.0 / -mv.z);
    gl_Position  = projectionMatrix * mv;
    vFade = aFade;
    vColor = color;
}
`;

const trailFrag = /* glsl */ `
varying float vFade;
varying vec3  vColor;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float glow = exp(-d * d * 5.0);
    float alpha = glow * vFade;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(vColor, alpha);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const PARTICLE_COUNT = 10000;
const ISCO           = 3.0;     // × Rs
const DISK_OUTER     = 12.0;    // × Rs
const DISK_HALF_THICK= 0.3;     // × Rs
const MAX_TRAIL      = 8;
const TRAIL_TOTAL    = PARTICLE_COUNT * MAX_TRAIL;
const SPEED_MULT     = 6.0;     // visual rotation speed × real Keplerian ratio

// ═══════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════

let mainMesh      = null;
let trailMesh     = null;
let mainGeom, trailGeom;
let mainPos, mainCol, mainSize, mainBri;
let trailPos, trailCol, trailFade;
let particleData  = [];

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function gaussRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ── Blackbody temperature → sRGB (JS port of GLSL version) ──────────────────
function blackbodyToRGB(T) {
    const t = clamp(T, 1000, 40000) / 100;
    if (t <= 66) return { r: 1.0, g: clamp(0.390 * Math.log(Math.max(t, 1.1)) - 0.632, 0, 1), b: 0.0 };
    return {
        r: clamp(1.292 * Math.pow(t - 60, -0.133), 0, 1),
        g: clamp(1.129 * Math.pow(t - 60, -0.075), 0, 1),
        b: 1.0
    };
}

// ── Shakura-Sunyaev temperature profile ─────────────────────────────────────
function diskTemperature(r, Rs, tempMul) {
    const T_peak  = 3000 + tempMul * 97000;       // 3000 .. 100000 K
    const rNorm   = r / Rs;
    const T_local = T_peak * Math.pow(Math.max(rNorm / ISCO, 0.3), -0.75);
    return clamp(T_local, 800, 120000);
}

// ── Spawn a particle — biased toward outer disk (inflow pattern) ───────────
function spawnParticle(Rs, tempMul) {
    const t      = Math.pow(Math.random(), 0.7);               // bias toward outer
    const r      = (ISCO + (DISK_OUTER - ISCO) * t) * Rs;
    const angle  = Math.random() * Math.PI * 2;
    const y      = gaussRandom() * DISK_HALF_THICK * Rs * 0.4;
    const omega  = SPEED_MULT * Math.sqrt(Rs / (2 * r)) / r;
    const T      = diskTemperature(r, Rs, tempMul);
    const col    = blackbodyToRGB(T);
    const sz     = 0.018 + (1 - t) * 0.05;
    return {
        r, angle, y, omega, baseCol: col, temp: T, size: sz,
        alive: true, inspiral: false,
        trail: new Array(MAX_TRAIL).fill(null).map(() => ({ x: 0, y: 0, z: 0 }))
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CREATE
// ═══════════════════════════════════════════════════════════════════════════

export function createAccretionDisk(Rs, tempMul) {
    // ── Main particle geometry ────────────────────────────────────────────
    mainGeom = new THREE.BufferGeometry();
    mainPos  = new Float32Array(PARTICLE_COUNT * 3);
    mainCol  = new Float32Array(PARTICLE_COUNT * 3);
    mainSize = new Float32Array(PARTICLE_COUNT);
    mainBri  = new Float32Array(PARTICLE_COUNT);

    particleData = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = spawnParticle(Rs, tempMul);
        particleData.push(p);

        // Init trail with current position
        const cx = p.r * Math.cos(p.angle);
        const cz = p.r * Math.sin(p.angle);
        for (let t = 0; t < MAX_TRAIL; t++) {
            p.trail[t] = { x: cx, y: p.y, z: cz };
        }
        writeMainVertex(i, cx, p.y, cz, p.baseCol, p.size, 1.0);
    }

    mainGeom.setAttribute('position',    new THREE.BufferAttribute(mainPos, 3));
    mainGeom.setAttribute('color',       new THREE.BufferAttribute(mainCol, 3));
    mainGeom.setAttribute('aSize',       new THREE.BufferAttribute(mainSize, 1));
    mainGeom.setAttribute('aBrightness', new THREE.BufferAttribute(mainBri, 1));

    const mainMat = new THREE.ShaderMaterial({
        vertexShader: particleVert, fragmentShader: particleFrag,
        uniforms: {},
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false,
        vertexColors: true,
    });
    mainMesh = new THREE.Points(mainGeom, mainMat);
    mainMesh.frustumCulled = false;

    // ── Trail geometry ────────────────────────────────────────────────────
    trailGeom = new THREE.BufferGeometry();
    trailPos   = new Float32Array(TRAIL_TOTAL * 3);
    trailCol   = new Float32Array(TRAIL_TOTAL * 3);
    trailFade  = new Float32Array(TRAIL_TOTAL);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particleData[i];
        for (let t = 0; t < MAX_TRAIL; t++) {
            const fade = Math.exp(-t * 0.55);           // exponential fade with age
            const idx = (i * MAX_TRAIL + t) * 3;
            const cx = p.r * Math.cos(p.angle);
            const cz = p.r * Math.sin(p.angle);
            trailPos[idx]     = cx;
            trailPos[idx + 1] = p.y;
            trailPos[idx + 2] = cz;
            trailCol[idx]     = p.baseCol.r * fade;
            trailCol[idx + 1] = p.baseCol.g * fade;
            trailCol[idx + 2] = p.baseCol.b * fade;
            trailFade[i * MAX_TRAIL + t] = fade;
        }
    }

    trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeom.setAttribute('color',    new THREE.BufferAttribute(trailCol, 3));
    trailGeom.setAttribute('aFade',    new THREE.BufferAttribute(trailFade, 1));

    const trailMat = new THREE.ShaderMaterial({
        vertexShader: trailVert, fragmentShader: trailFrag,
        uniforms: {},
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false,
        vertexColors: true,
    });
    trailMesh = new THREE.Points(trailGeom, trailMat);
    trailMesh.frustumCulled = false;

    return { mainMesh, trailMesh };
}

// ═══════════════════════════════════════════════════════════════════════════
//  UPDATE EACH FRAME
// ═══════════════════════════════════════════════════════════════════════════

export function updateParticles(dt, Rs, tempMul, brightnessMul, camWorldPos) {
    if (!mainGeom || !trailGeom) return;

    const cx = camWorldPos.x, cy = camWorldPos.y, cz = camWorldPos.z;
    // Clamp dt to avoid jumps after tab-switch
    const step = Math.min(dt, 0.05);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particleData[i];

        if (!p.alive) {
            // Respawn
            const fresh = spawnParticle(Rs, tempMul);
            Object.assign(p, fresh);
            for (let t = 0; t < MAX_TRAIL; t++) {
                const cx2 = p.r * Math.cos(p.angle);
                const cz2 = p.r * Math.sin(p.angle);
                p.trail[t] = { x: cx2, y: p.y, z: cz2 };
            }
        }

        // ── GR orbit ───────────────────────────────────────────────────────
        const rNorm = p.r / Rs;

        // ── All particles spiral inward (viscous accretion) ──────────────
        if (rNorm >= ISCO) {
            // Outer disk: Keplerian orbit + slow radial drift
            p.angle += p.omega * step;
            p.inspiral = false;
            // Viscous inspiral: dr/dt ∝ -√(Rs/r)  — faster near BH
            const drift = 0.45 * Math.sqrt(Rs / p.r) * step;
            p.r -= drift;
            p.omega = SPEED_MULT * Math.sqrt(Rs / (2 * p.r)) / p.r;
            p.temp = diskTemperature(p.r, Rs, tempMul);
            p.baseCol = blackbodyToRGB(p.temp);
            p.size = 0.018 + clamp(1 - (p.r / Rs - ISCO) / (DISK_OUTER - ISCO), 0, 1) * 0.07;
        } else if (rNorm > 1.0) {
            // Inside ISCO → rapid plunging geodesic
            p.inspiral = true;
            const plunge = 1.5 * Math.sqrt(Rs / p.r) * step;
            p.r -= plunge;
            p.omega = SPEED_MULT * Math.sqrt(Rs / (2 * p.r)) / p.r;
            p.angle += p.omega * step;
            p.temp = diskTemperature(p.r, Rs, tempMul);
            p.baseCol = blackbodyToRGB(p.temp);
            p.size = 0.04;
        } else {
            // r ≤ Rs → swallowed by event horizon
            p.alive = false;
            // Write black / zero for this frame
            writeMainVertex(i, 0, 0, 0, { r: 0, g: 0, b: 0 }, 0, 0);
            clearTrails(i);
            continue;
        }

        // Wrap angle
        if (p.angle > Math.PI * 2) p.angle -= Math.PI * 2;
        if (p.angle < 0) p.angle += Math.PI * 2;

        // ── Cartesian position ─────────────────────────────────────────────
        const cosA = Math.cos(p.angle);
        const sinA = Math.sin(p.angle);
        const px = p.r * cosA;
        const py = p.y;
        const pz = p.r * sinA;

        // ── Doppler beaming ────────────────────────────────────────────────
        // Tangential velocity (unit direction)
        const tx = -sinA, tz = cosA;
        // Direction from particle to camera
        const dx = cx - px, dy = cy - py, dz_ = cz - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz_ * dz_) || 1;
        const vOrb = p.omega * p.r;                       // v/c
        const betaDotN = vOrb * (tx * (dx / dist) + tz * (dz_ / dist));
        const gamma = 1 / Math.sqrt(1 - vOrb * vOrb);
        const doppler = 1 / (gamma * (1 - betaDotN));
        const beam = Math.pow(clamp(doppler, 0.15, 6.0), 4.0);
        const brightness = clamp(beam * 0.55 * brightnessMul, 0.06, 3.2);

        // Colour shift: approaching → whiter/bluer, receding → redder/dimmer
        const shift = clamp((doppler - 1) * 0.5, -0.45, 0.45);

        // ── Write main vertex ──────────────────────────────────────────────
        writeMainVertex(i, px, py, pz, p.baseCol, p.size, brightness, shift);

        // ── Update trail ───────────────────────────────────────────────────
        updateTrail(i, px, py, pz, p.baseCol, shift);
    }

    mainGeom.attributes.position.needsUpdate    = true;
    mainGeom.attributes.color.needsUpdate       = true;
    mainGeom.attributes.aBrightness.needsUpdate = true;

    trailGeom.attributes.position.needsUpdate   = true;
    trailGeom.attributes.color.needsUpdate      = true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function writeMainVertex(i, x, y, z, col, size, brightness, shift = 0) {
    const idx = i * 3;
    mainPos[idx]     = x;
    mainPos[idx + 1] = y;
    mainPos[idx + 2] = z;
    mainCol[idx]     = clamp(col.r + shift, 0, 1);
    mainCol[idx + 1] = clamp(col.g + shift * 0.6, 0, 1);
    mainCol[idx + 2] = clamp(col.b + shift * 0.8, 0, 1);
    mainSize[i]      = size;
    mainBri[i]       = brightness;
}

function updateTrail(i, x, y, z, col, shift = 0) {
    const p = particleData[i];
    if (!p || !p.alive) return;

    // Shift trail: oldest out, newest in
    for (let t = MAX_TRAIL - 1; t > 0; t--) {
        p.trail[t] = p.trail[t - 1];
    }
    p.trail[0] = { x, y, z };

    // Write to trail buffer
    const base = i * MAX_TRAIL * 3;
    for (let t = 0; t < MAX_TRAIL; t++) {
        const fade = Math.exp(-t * 0.55);
        const idx = base + t * 3;
        trailPos[idx]     = p.trail[t].x;
        trailPos[idx + 1] = p.trail[t].y;
        trailPos[idx + 2] = p.trail[t].z;
        trailCol[idx]     = clamp(col.r + shift, 0, 1) * fade;
        trailCol[idx + 1] = clamp(col.g + shift * 0.6, 0, 1) * fade;
        trailCol[idx + 2] = clamp(col.b + shift * 0.8, 0, 1) * fade;
    }
}

function clearTrails(i) {
    const base = i * MAX_TRAIL * 3;
    for (let t = 0; t < MAX_TRAIL; t++) {
        const idx = base + t * 3;
        trailPos[idx] = trailPos[idx + 1] = trailPos[idx + 2] = 0;
        trailCol[idx] = trailCol[idx + 1] = trailCol[idx + 2] = 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export function getMainMesh()    { return mainMesh; }
export function getTrailMesh()   { return trailMesh; }

export function disposeParticles() {
    if (mainGeom)   mainGeom.dispose();
    if (trailGeom)  trailGeom.dispose();
    if (mainMesh && mainMesh.material) mainMesh.material.dispose();
    if (trailMesh && trailMesh.material) trailMesh.material.dispose();
    particleData = [];
    mainMesh = trailMesh = null;
}
