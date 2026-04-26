/**
 * blackhole-engine.js — Three.js WebGL Renderer & Uniform Management
 *
 * Renders two layers:
 *  1. Fullscreen quad (starfield + photon sphere + event horizon)
 *  2. Particle accretion disk (orbiting glowing particles)
 */

import * as THREE from 'three';
import { quadVertexShader, blackHoleFragmentShader } from './shaders.js';
import { createAccretionDisk, updateParticles } from './accretion-particles.js';

// ── State ───────────────────────────────────────────────────────────────────
let renderer, scene, camera, material, uniforms;
let particleScene, particleCamera, particleMainMesh, particleTrailMesh;
let animationId = null;
let clock;

const DEFAULTS = {
    temperature: 0.6,
    brightness: 0.7,
    collapseIntensity: 0.5,
    rotation: 0.0,
    tilt: 0.35,
    cameraDist: 10.0
};

export const params = { ...DEFAULTS };
// Expose camera world position for particle Doppler
export let cameraWorldPos = new THREE.Vector3(0, 0, 10);

// ── Initialise ──────────────────────────────────────────────────────────────
export function initEngine(containerId = 'container') {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);

    // ── Renderer ──────────────────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    renderer.autoClear = true;
    container.appendChild(renderer.domElement);

    // ── Background scene (fullscreen quad) ─────────────────────────────────
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    uniforms = {
        uResolution:        { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uTime:              { value: 0 },
        uTemperature:       { value: params.temperature },
        uBrightness:        { value: params.brightness },
        uCollapseIntensity: { value: params.collapseIntensity },
        uRotation:          { value: params.rotation },
        uTilt:              { value: params.tilt },
        uCameraDist:        { value: params.cameraDist }
    };

    material = new THREE.ShaderMaterial({
        vertexShader: quadVertexShader,
        fragmentShader: blackHoleFragmentShader,
        uniforms,
        depthWrite: false,
        depthTest: false
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    // ── Particle scene (accretion disk) ────────────────────────────────────
    particleScene = new THREE.Scene();
    particleCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 60);
    const meshes = createAccretionDisk(RS(), params.temperature);
    if (meshes) {
        particleTrailMesh = meshes.trailMesh;
        particleMainMesh  = meshes.mainMesh;
        particleTrailMesh.frustumCulled = false;
        particleMainMesh.frustumCulled  = false;
        particleScene.add(particleTrailMesh);  // trails behind
        particleScene.add(particleMainMesh);   // main particles on top
    }

    window.addEventListener('resize', onResize);
    return { renderer, uniforms };
}

// ── Schwarzschild radius from collapse intensity ────────────────────────────
function RS() { return 1.0 * (0.5 + params.collapseIntensity * 1.5); }

// ── Resize ──────────────────────────────────────────────────────────────────
function onResize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (uniforms) uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    if (particleCamera) {
        particleCamera.aspect = window.innerWidth / window.innerHeight;
        particleCamera.updateProjectionMatrix();
    }
}

// ── Animation Loop ──────────────────────────────────────────────────────────
export function startLoop() {
    clock = new THREE.Clock();

    function animate() {
        animationId = requestAnimationFrame(animate);

        const dt = Math.min(clock.getDelta(), 0.1);   // cap to avoid spiral on tab-switch
        const elapsed = clock.elapsedTime;

        // ── Camera world position (for particle Doppler) ──────────────────
        updateCameraWorldPos();

        // ── Update background uniforms ─────────────────────────────────────
        uniforms.uTime.value              = elapsed;
        uniforms.uTemperature.value       = params.temperature;
        uniforms.uBrightness.value        = params.brightness;
        uniforms.uCollapseIntensity.value = params.collapseIntensity;
        uniforms.uRotation.value          = params.rotation;
        uniforms.uTilt.value              = params.tilt;
        uniforms.uCameraDist.value        = params.cameraDist;

        // ── Render background ──────────────────────────────────────────────
        renderer.render(scene, camera);

        // ── Update & render particles (additive blend over background) ─────
        if (particleMainMesh) {
            updateParticles(dt, RS(), params.temperature, params.brightness, cameraWorldPos);
            updateParticleCamera();
            renderer.autoClear = false;
            renderer.render(particleScene, particleCamera);
            renderer.autoClear = true;
        }
    }

    animate();
}

// ── Compute camera world position matching raytracer ────────────────────────
function updateCameraWorldPos() {
    const d = params.cameraDist;
    const pos = new THREE.Vector3(0, 0, d);
    // Must match shader: rotateY(rotation) * rotateX(tilt) → tilt first, then rotate
    pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), params.tilt);
    pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), params.rotation);
    cameraWorldPos.copy(pos);
}

// ── Position particle perspective camera to match raytracer viewpoint ───────
function updateParticleCamera() {
    particleCamera.position.copy(cameraWorldPos);
    particleCamera.lookAt(0, 0, 0);
    particleCamera.updateProjectionMatrix();
}

// ── Set parameters ──────────────────────────────────────────────────────────
export function setTemperature(v)       { params.temperature = clamp(v, 0, 1); }
export function setBrightness(v)        { params.brightness  = clamp(v, 0, 1); }
export function setCollapseIntensity(v) { params.collapseIntensity = clamp(v, 0, 1); }
export function setRotation(v)          { params.rotation    = v; }
export function setTilt(v)              { params.tilt        = v; }
export function setCameraDist(v)        { params.cameraDist   = Math.max(2.5, Math.min(v, 30.0)); }

// ── Dispose ─────────────────────────────────────────────────────────────────
export function dispose() {
    stopLoop();
    window.removeEventListener('resize', onResize);
    if (material) material.dispose();
    if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
}

export function stopLoop() {
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
