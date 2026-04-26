/**
 * shaders.js — Black Hole GLSL Shaders
 *
 * Background-only raytracing shader:
 *  - Gravitational lensing via null geodesic integration
 *  - Photon sphere glow at r = 1.5 Rs
 *  - Event horizon shadow
 *  - Rich procedural starfield with Milky Way band
 *
 * Note: The accretion disk is rendered as a rotating particle system
 *       (see accretion-particles.js), composited on top by the engine.
 */

// ── Fullscreen Quad Vertex Shader ──────────────────────────────────────────
export const quadVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ── Black Hole Fragment Shader (background only) ───────────────────────────
export const blackHoleFragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec2  uResolution;
uniform float uTime;
uniform float uTemperature;       // passed through; not used in this shader
uniform float uBrightness;        // photon-sphere / glow multiplier
uniform float uCollapseIntensity; // Schwarzschild radius multiplier
uniform float uRotation;          // orbit radians
uniform float uTilt;              // vertical tilt
uniform float uCameraDist;        // camera distance

const float RS_BASE   = 1.0;
const int   MAX_STEPS = 256;
const float STEP_SIZE = 0.12;
const float MAX_DIST  = 40.0;
const float PI        = 3.14159265359;

// ── Hash / noise ────────────────────────────────────────────────────────────
float hash(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}

// ── Rotation ────────────────────────────────────────────────────────────────
mat3 rotateY(float a) { float s=sin(a),c=cos(a); return mat3(c,0,s, 0,1,0, -s,0,c); }
mat3 rotateX(float a) { float s=sin(a),c=cos(a); return mat3(1,0,0, 0,c,-s, 0,s,c); }

// ── Gravitational deflection (enhanced for visual impact) ─────────────────
vec3 deflect(vec3 rayPos, vec3 bhPos, float Rs) {
    vec3  rVec = rayPos - bhPos;
    float r    = length(rVec);
    if (r < Rs * 0.95) return vec3(0.0);
    // Amplified curvature — makes lensing visible across the entire disk
    // Physically: 1.5*Rs/r²  →  artistically boosted to ~4*Rs/r² for visible effect
    float curvature = (4.0 * Rs) / (r * r) * STEP_SIZE;
    return normalize(rVec) * curvature;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STARFIELD
// ═══════════════════════════════════════════════════════════════════════════

float starLayer(vec2 uv, float density, float threshold, out vec3 color) {
    vec2 cell  = floor(uv * density);
    vec2 local = fract(uv * density) - 0.5;
    float h = hash(cell);
    float exist = smoothstep(threshold, 1.0, h);
    float jx = (hash(cell + 0.1) - 0.5) * 0.6;
    float jy = (hash(cell + 0.2) - 0.5) * 0.6;
    float dist = length(local - vec2(jx, jy));
    float brightness = exist * exp(-dist * dist * 160.0);

    float cVar = hash(cell + 1.0);
         if (cVar < 0.08) color = vec3(0.6, 0.7, 1.0);
    else if (cVar < 0.20) color = vec3(0.8, 0.85, 1.0);
    else if (cVar < 0.60) color = vec3(1.0, 0.95, 0.8);
    else if (cVar < 0.85) color = vec3(1.0, 0.75, 0.5);
    else                  color = vec3(1.0, 0.5, 0.35);
    return brightness;
}

vec3 sampleRichStarfield(vec3 dir) {
    float phi   = atan(dir.z, dir.x);
    float theta = acos(clamp(dir.y, -1.0, 1.0));
    vec2  uv    = vec2(phi / (2.0 * PI), theta / PI);
    vec3 col = vec3(0.0);

    // Milky Way band
    float mwAngle = phi - 1.2;
    float mwLat   = theta - 0.8 * sin(mwAngle);
    float mw      = exp(-mwLat * mwLat * 12.0);
    float mwNoise = noise(uv * 40.0 + uTime * 0.002) * 0.4 + 0.6;
    mw *= mwNoise;
    col += vec3(0.06, 0.05, 0.10) * mw;
    col += vec3(0.04, 0.04, 0.07) * exp(-mwLat * mwLat * 40.0) * mwNoise;

    // 5 star layers (many tiny → few bright)
    vec3 sc;
    col += sc * starLayer(uv, 220.0, 0.993, sc) * 0.25;
    col += sc * starLayer(uv, 130.0, 0.990, sc) * 0.45;
    col += sc * starLayer(uv, 70.0,  0.987, sc) * 0.7;
    col += sc * starLayer(uv, 30.0,  0.984, sc) * 1.0;
    col += sc * starLayer(uv, 12.0,  0.980, sc) * 1.4;
    col *= 1.0 + mw * 0.6;
    return col;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHOTON SPHERE GLOW
// ═══════════════════════════════════════════════════════════════════════════

vec3 photonSphereGlow(vec3 pos, vec3 bhPos, float Rs, float brightness) {
    float r = length(pos - bhPos);
    float rPhoton = 1.5 * Rs;
    float d = abs(r - rPhoton);
    float ring = exp(-d * 8.0 / Rs) * 0.4;
    float glow = exp(-d * 3.0 / Rs) * 0.12;
    float halo = exp(-d * 1.2 / Rs) * 0.04;
    return (ring * vec3(1.0, 0.9, 0.55) + glow * vec3(0.9, 0.75, 0.4) + halo * vec3(0.5, 0.55, 0.8)) * brightness;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════

void main() {
    float Rs   = RS_BASE * (0.5 + uCollapseIntensity * 1.5);
    vec3 bhPos = vec3(0.0);

    // ── Camera ────────────────────────────────────────────────────────────
    float camDist = uCameraDist;
    vec3 camPos0  = vec3(0.0, 0.0, camDist);
    mat3 camRot   = rotateY(uRotation) * rotateX(uTilt);
    vec3 camPos   = camRot * camPos0;

    vec3 forward = normalize(bhPos - camPos);
    vec3 right   = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up      = cross(right, forward);

    // ── Ray ────────────────────────────────────────────────────────────────
    float aspect = uResolution.x / uResolution.y;
    vec2  uv     = (vUv - 0.5) * 2.0;
    uv.x        *= aspect;
    float fov    = 0.9;
    vec3  rayDir = normalize(forward + right * uv.x * fov + up * uv.y * fov);

    // ═══════════════════════════════════════════════════════════════════════
    //  Trace ray → detect horizon, record closest approach & final direction
    // ═══════════════════════════════════════════════════════════════════════
    vec3 tracePos    = camPos;
    vec3 traceDir    = rayDir;
    bool hitHorizon  = false;
    float minApproach = MAX_DIST;
    vec3 finalBgDir   = rayDir;

    for (int i = 0; i < MAX_STEPS; i++) {
        float r = length(tracePos - bhPos);
        if (r < minApproach) minApproach = r;

        if (r < Rs * 0.97) { hitHorizon = true; break; }

        float adaptStep = STEP_SIZE * (0.2 + 0.8 * clamp(r / (3.0 * Rs), 0.0, 1.0));
        vec3 defl = deflect(tracePos, bhPos, Rs);
        traceDir = normalize(traceDir + defl);
        tracePos += traceDir * adaptStep;

        float dist = length(tracePos - camPos);
        if (dist > MAX_DIST) { finalBgDir = traceDir; break; }
        finalBgDir = traceDir;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STEP 1: Background starfield
    // ═══════════════════════════════════════════════════════════════════════
    vec3 color = sampleRichStarfield(finalBgDir);

    // Einstein ring
    float ringFactor = exp(-minApproach / Rs) * 0.06;
    float ringWidth  = exp(-abs(minApproach - 1.5 * Rs) / (0.15 * Rs));
    color *= 1.0 + ringFactor * (1.0 + ringWidth * 3.0);

    // ═══════════════════════════════════════════════════════════════════════
    //  STEP 2: Photon sphere glow
    // ═══════════════════════════════════════════════════════════════════════
    {
        vec3 probePos = camPos;
        vec3 probeDir = rayDir;
        for (int i = 0; i < 80; i++) {
            float r = length(probePos - bhPos);
            if (r < Rs * 0.9) break;
            color += photonSphereGlow(probePos, bhPos, Rs, uBrightness) * 0.12;
            vec3 defl = deflect(probePos, bhPos, Rs);
            probeDir = normalize(probeDir + defl);
            probePos += probeDir * STEP_SIZE * 0.7;
            if (length(probePos - camPos) > MAX_DIST) break;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STEP 3: Event horizon shadow
    // ═══════════════════════════════════════════════════════════════════════
    if (hitHorizon) {
        vec3 shPos = camPos;
        vec3 shDir = rayDir;
        for (int i = 0; i < MAX_STEPS; i++) {
            float r = length(shPos - bhPos);
            if (r < Rs * 0.97) {
                float edge = smoothstep(Rs * 0.92, Rs * 0.97, r);
                color *= edge;
                color += vec3(0.03, 0.0, 0.06) * (1.0 - edge) * 0.06 * uBrightness;
                break;
            }
            float adaptStep = STEP_SIZE * (0.2 + 0.8 * clamp(r / (3.0 * Rs), 0.0, 1.0));
            vec3 defl = deflect(shPos, bhPos, Rs);
            shDir = normalize(shDir + defl);
            shPos += shDir * adaptStep;
            if (length(shPos - camPos) > MAX_DIST) break;
        }
    }

    // ── Tone mapping + gamma ──────────────────────────────────────────────
    color = color / (1.0 + color);
    color = pow(color, vec3(0.4545));

    // ── Vignette ──────────────────────────────────────────────────────────
    color *= 1.0 - 0.2 * length(vUv - 0.5) * 2.0;

    gl_FragColor = vec4(color, 1.0);
}
`;
