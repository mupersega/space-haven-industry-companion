// The landing-page planet, rendered per-pixel on the GPU. This is the shader
// port of paintPlanet() from spaceRender.ts — same world, recomputed every
// frame from a handful of uniforms so that clouds (and, later, light scattering
// through them) can animate for free instead of the CPU re-stamping thousands
// of brush sprites.
//
// The CPU renderer stays the fallback and the parity reference; this runs
// alongside it behind a dev toggle so the two can be compared directly. Parity
// pieces ported here: fractal terrain + detail-fray coastlines, the hand-tuned
// palette ramps (baked to a texture so colour is preserved exactly), fracture
// veins (dark ice cracks or emissive molten), polar ice caps, atmosphere sheen,
// a dot(normal, sun) crescent whose shadow follows the light direction, and the
// atmosphere rim + halo as an analytic limb glow.
import { PALETTES, terrainColor, type SceneParams } from './spaceRender'

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2  uRes;
uniform vec2  uCenter;
uniform float uRadius;
uniform vec2  uSunInPlane; // unit in-plane direction toward the sun (y down)
uniform vec3  uNoiseOff;
uniform float uFreq;
uniform float uContrast;
uniform float uCrescent;
uniform float uDark;
uniform float uPalette;
uniform float uPaletteCount;
uniform sampler2D uRamp;
uniform vec3  uSheen;
uniform float uCracks;
uniform vec3  uMolten;
uniform float uMoltenGlow;
uniform float uHasMolten;
uniform float uIceCaps;
uniform vec3  uAtmo;
uniform vec3  uAtmoDeep;
uniform float uRim;
uniform float uHalo;
uniform float uClouds;
uniform float uCloudSize;
uniform float uCloudAlpha;
uniform float uTime;
uniform vec3  uCloudTint0;
uniform vec3  uCloudTint1;
uniform vec3  uCloudTint2;
// wind / cloud-system tunables, live-edited from the scene tuner
uniform float uSpinPhase;  // integrated rotation phase (accumulated in JS)
uniform float uEvolve;     // how fast the warp churns + weather evolves
uniform float uSwirl;      // swirl warp strength
uniform float uSwirlScale; // swirl warp scale
uniform float uSystems;    // weather-system frequency (how many systems)
uniform float uClump;      // clump frequency within a system (clump size)
uniform float uBump;       // per-clump self-shading strength
uniform float uOrganize;   // global structure: latitude belts x pressure systems
uniform float uShear;      // FIXED zonal-band shear amplitude (gas-giant streaks)

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5, f = 1.0;
  for (int o = 0; o < 8; o++) {
    if (o >= oct) break;
    s += a * noise3(p * f);
    a *= 0.5;
    f *= 2.03;
  }
  return s / (1.0 - pow(0.5, float(oct)));
}

const vec3 WARM = vec3(255.0, 233.0, 195.0) / 255.0;
vec3 atmoColor(float prox) {
  if (prox > 0.68) return mix(uAtmo, WARM, (prox - 0.68) / 0.32);
  return mix(uAtmoDeep, uAtmo, prox / 0.68);
}
// gaussian band centred at radius c (px), full width w
float band(float rpx, float c, float w) {
  float e = (rpx - c) / (w * 0.5);
  return exp(-0.5 * e * e);
}
// ---- cloud field: Nubis-style coverage->shape->erosion density over a slow
// wind field (differential zonal rotation + a gentle evolving curl warp). All
// the tunable knobs are uniforms (uSpin/uBands/uSwirl/...) driven by the tuner.

// Rodrigues rotation of v about a unit axis — no pole stretch, unlike a
// longitude add, so differential (per-band) rotation stays clean
vec3 rotateAxis(vec3 v, vec3 axis, float ang) {
  float c = cos(ang), s = sin(ang);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}
// billowy fbm — approximates the Worley half of Perlin-Worley cloud noise, so
// shapes read puffy/cauliflower rather than smoke-like
float fbmBillow(vec3 p, int oct) {
  float s = 0.0, a = 0.5, f = 1.0;
  for (int o = 0; o < 8; o++) {
    if (o >= oct) break;
    s += a * (1.0 - abs(2.0 * noise3(p * f) - 1.0));
    a *= 0.5;
    f *= 2.03;
  }
  return s / (1.0 - pow(0.5, float(oct)));
}
// Houdini fit-range: the load-bearing Nubis trick — erodes edges while keeping
// cloud cores solid (multiplying noises can't do that)
float remap(float v, float lo, float hi, float nlo, float nhi) {
  return nlo + (clamp(v, lo, hi) - lo) * (nhi - nlo) / max(hi - lo, 1e-4);
}
// vector-potential curl noise -> divergence-free 3D flow (Bridson 2007). The
// caller projects it onto the tangent plane so cloud material stays on the surface.
vec3 curlPot(vec3 p) {
  return vec3(noise3(p), noise3(p + vec3(31.4, 17.7, -9.1)), noise3(p + vec3(-5.3, 88.1, 42.6)));
}
vec3 curl3(vec3 p) {
  float e = 0.09;
  vec3 dx = curlPot(p + vec3(e, 0.0, 0.0)) - curlPot(p - vec3(e, 0.0, 0.0));
  vec3 dy = curlPot(p + vec3(0.0, e, 0.0)) - curlPot(p - vec3(0.0, e, 0.0));
  vec3 dz = curlPot(p + vec3(0.0, 0.0, e)) - curlPot(p - vec3(0.0, 0.0, e));
  return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) / (2.0 * e);
}
// how much of the planet carries weather (from the clouds slider, max 20), 0..1
float coverAmount() { return clamp(uClouds / 20.0, 0.0, 1.0); }
// full density. TWO scales, deliberately separated: a moderate-freq SYSTEM field
// thresholded into discrete weather clusters with genuine clear sky between them
// (so it reads as clumps OF systems, not one planet-wide cloud), and a high-freq
// billow for the puffy clumps that live inside each system.
// bias shifts the system threshold: negative fills stormy regions in, positive
// opens clear regions up. It carries the large-scale weather organization
// (belts x pressure x a drifting strength), computed once per fragment in main.
float cloudDensityAt(vec3 p, float bias) {
  float sz = max(0.35, uCloudSize);
  float sys = fbm(p * (uSystems / sz) + uNoiseOff + 9.0, 4);
  float lo = mix(1.15, 0.2, pow(coverAmount(), 0.6)) + bias;
  float cov = smoothstep(lo, lo + 0.13, sys);  // gate -> separated systems
  float shape = fbmBillow(p * (uClump / sz) + uNoiseOff, 4);
  float base = remap(shape, 1.0 - cov, 1.0, 0.0, 1.0) * cov;
  float det = fbmBillow(p * (uClump * 2.4 / sz) + uNoiseOff + 5.0, 3);
  return clamp(remap(base, det * 0.4, 1.0, 0.0, 1.0), 0.0, 1.0);
}
// cheaper density (no erosion) for the gradient / march / shadow taps; same
// system x clump structure so the self-shading gradient is representative
float cloudCoarse(vec3 p, float bias) {
  float sz = max(0.35, uCloudSize);
  float sys = fbm(p * (uSystems / sz) + uNoiseOff + 9.0, 3);
  float lo = mix(1.15, 0.2, pow(coverAmount(), 0.6)) + bias;
  float cov = smoothstep(lo, lo + 0.13, sys);
  float shape = fbmBillow(p * (uClump / sz) + uNoiseOff, 3);
  return clamp(remap(shape, 1.0 - cov, 1.0, 0.0, 1.0) * cov, 0.0, 1.0);
}

void main() {
  vec2 frag = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec2 d = (frag - uCenter) / uRadius;
  float rr = dot(d, d);
  float rlen = sqrt(rr);
  float rpx = rlen * uRadius;

  vec3 terrainCol = vec3(0.0);
  float baseA = 0.0;

  if (rr <= 1.0) {
    float nz = sqrt(max(0.0, 1.0 - rr));
    vec3 n = vec3(d.x, d.y, nz);

    // fractal height field on the sphere's normal
    float h = fbm(n * uFreq + uNoiseOff, 4);
    h = 0.5 + (h - 0.5) * 1.9 * uContrast;
    // fray the coastlines with two scales of fine noise so shores are ragged
    float detailFreq = uFreq * 4.7;
    float dn = noise3(n * detailFreq + uNoiseOff);
    float dn2 = noise3(n * detailFreq * 2.6 + uNoiseOff.yzx);
    float dn3 = noise3(n * detailFreq * 5.3 + uNoiseOff.zxy);
    h += (dn - 0.5) * 0.075 + (dn2 - 0.5) * 0.04 + (dn3 - 0.5) * 0.024;

    // base colour from the baked palette ramp (domain 0.2..1.1)
    float u = clamp((h - 0.2) / 0.9, 0.0, 1.0);
    float row = (uPalette + 0.5) / uPaletteCount;
    vec3 base = texture(uRamp, vec2(u, row)).rgb;

    // fracture veins: dark crevasses (ice) or emissive channels (molten)
    float hot = 0.0;
    if (uCracks > 0.0) {
      float c1 = abs(fbm(n * uFreq * 4.6 + uNoiseOff.zxy, 3) - 0.5);
      float c2 = abs(noise3(n * uFreq * 13.0 + uNoiseOff.yzx) - 0.5);
      float vein = max(pow(max(0.0, 1.0 - c1 / 0.024), 1.6),
                       pow(max(0.0, 1.0 - c2 / 0.026), 1.6) * 0.45);
      if (uHasMolten > 0.5) {
        hot = pow(vein, 1.25) * uCracks * uMoltenGlow;
      } else {
        float s = vein * uCracks;
        base.r *= 1.0 - s;
        base.g *= 1.0 - s * 0.85;
        base.b *= 1.0 - s * 0.6;
      }
    }

    // polar ice caps: perturb the latitude with coarse AND fine noise for a
    // ragged snow line, then a NARROW transition so the edge is crisp and jagged
    // rather than a soft wide gradient
    if (uIceCaps > 0.0) {
      float lat = abs(n.y) + (dn - 0.5) * 0.1 + (dn3 - 0.5) * 0.07;
      float cap = smoothstep(0.7, 0.75, lat) * uIceCaps;
      base += (vec3(236.0, 244.0, 252.0) / 255.0 - base) * cap;
    }

    // crescent lighting: the sun sits to the side and a touch behind (neg z),
    // so a lit sliver wraps the sun-side limb and the shadow follows the sun.
    float detail = 0.86 + 0.28 * dn;
    float sz = -0.55 + (uCrescent - 1.0) * 0.3;
    vec3 sun = normalize(vec3(uSunInPlane, sz));
    float lit = smoothstep(-0.05, 0.35, dot(n, sun));
    float ambient = 0.05;
    float nightMul = max(1.0 - clamp((1.0 - lit) * 0.96 * uDark, 0.0, 1.0), ambient);
    float glow = lit * uCrescent;

    vec3 col = base * detail * nightMul + uSheen * glow * 0.16;
    // molten veins are emissive, but let the far side fall off so a molten world
    // still reads with a dark side (the sun-facing lava blazes, the night dims)
    if (uHasMolten > 0.5) col += uMolten * hot * mix(0.4, 1.0, lit);
    terrainCol = col;

    // --- cloud deck: small puffy clumps that drift slowly with per-band
    // (differential) rotation. No flow advection — a gentle, slowly-evolving
    // curl warp gives the clumps organic swirl WITHOUT smearing them into
    // streaks, and there's no phase reset to sweep across the disc.
    vec3 axis = normalize(vec3(0.14, 1.0, 0.0));       // slightly tilted spin axis
    float clat = asin(clamp(dot(n, axis), -1.0, 1.0)); // latitude on that axis
    vec3 east = normalize(cross(axis, n) + 1e-5);      // +longitude (zonal) dir
    vec3 north = cross(n, east);

    // Rigid base rotation (uSpinPhase, uniform across latitudes) PLUS a FIXED
    // per-world zonal shear that stretches the deck into stable gas-giant bands.
    // Because the shear amplitude (uShear) is CONSTANT — not multiplied by the
    // ever-growing spin phase as the old differential rotation was — the bands
    // reach a steady stretch and then rotate rigidly, instead of shearing into
    // ever-thinner wisps over time. uShear = 0 leaves chunky worlds (ice) intact;
    // hyper/quant crank it up for the banded look.
    float ang = uSpinPhase + uShear * sin(clat * 2.0);
    vec3 ns = rotateAxis(n, axis, ang);
    // subtle domain warp that slowly evolves in time — clumps swirl and morph
    // instead of translating; a continuous field, so nothing resets/sweeps
    vec3 warp = curl3(ns * uSwirlScale + uTime * uEvolve);
    vec3 pAdv = ns + (warp - dot(warp, ns) * ns) * uSwirl;

    // --- large-scale weather organization (the "structure") ---
    // two broad latitude zones (stormy vs clear) times big pressure systems that
    // drift AND slowly evolve (rate = churn), so weather forms in coherent regions.
    float sz2 = max(0.35, uCloudSize);
    float tEvo = uTime * uEvolve;
    float belts = 0.5 + 0.5 * sin(clat * 2.0);
    float pressure = fbm(ns * (1.4 / sz2) + uNoiseOff + 20.0 + vec3(tEvo * 1.5, 0.0, 0.0), 3);
    float climate = belts * (0.3 + 0.7 * pressure);
    // the STRENGTH of organization is itself a slow, drifting field — so a system
    // tightens as it moves into an organized region and loosens as it leaves.
    // That ramping up/down (not a fixed structure value) is the dynamism we want.
    float orgVary = fbm(ns * (0.7 / sz2) + uNoiseOff + 50.0 + vec3(0.0, tEvo, 0.0), 3);
    float bias = (0.5 - climate) * uOrganize * (0.2 + 1.7 * orgVary) * 0.5;
    // fade organization out as cover -> 0 so "cloud cover 0" is truly clear (a
    // negative bias must not conjure storm cloud out of an empty sky)
    bias *= smoothstep(0.0, 0.1, coverAmount());

    float dens = cloudDensityAt(pAdv, bias);

    // per-clump self-shading: build a cloud-surface normal from the density
    // gradient so each puff has a sunlit face and a shadowed face — the light &
    // dark WITHIN a clump, not just a cast shadow.
    float eg = 0.02;
    float dC = cloudCoarse(pAdv, bias);
    float dE = cloudCoarse(pAdv + east * eg, bias);
    float dN = cloudCoarse(pAdv + north * eg, bias);
    vec3 cloudN = normalize(n - ((dE - dC) * east + (dN - dC) * north) * uBump);
    // wrapped lighting: a floor keeps shadowed faces present-but-not-black, so
    // clumps read as bright puffs carrying shadow rather than grey mottle
    float selfLit = clamp(dot(cloudN, sun) * 0.6 + 0.4, 0.0, 1.0);

    // sunward tangent for the drop-shadow onto terrain + self-shadow march
    vec3 sunTan = sun - n * dot(sun, n);
    float tl = length(sunTan);
    sunTan = tl > 1e-4 ? sunTan / tl : vec3(0.0);
    float tau = 0.0;
    for (int i = 1; i <= 3; i++) {
      tau += cloudCoarse(pAdv + sunTan * (0.05 * float(i)), bias);
    }
    float Tsun = exp(-1.4 * tau);

    // cloud shadow cast onto the terrain below. The offset is the cloud's
    // altitude as a fraction of the planet radius — keep it TINY (~1%) so the
    // shadow hugs the cloud; a big offset flings the shadow thousands of km away.
    float shadow = clamp(cloudCoarse(pAdv + sunTan * 0.012, bias) - dens, 0.0, 1.0);
    terrainCol *= 1.0 - shadow * 0.5 * lit;

    // lighting: global crescent x per-clump self-shading x Beer self-shadow,
    // with dual-lobe Henyey-Greenstein for the silver-lined limb
    vec3 V = vec3(0.0, 0.0, 1.0);
    float cosA = dot(V, -sun);
    float g1 = 0.8, g2 = -0.15;
    float hgF = (1.0 - g1 * g1) / pow(max(1.0 + g1 * g1 - 2.0 * g1 * cosA, 1e-3), 1.5);
    float hgB = (1.0 - g2 * g2) / pow(max(1.0 + g2 * g2 - 2.0 * g2 * cosA, 1e-3), 1.5);
    float phase = mix(hgF, hgB, 0.5);

    // per-clump self-shading drives brightness; the crescent (lit) only gently
    // modulates it now — early builds over-favoured lit clouds and hid the rest.
    float clight = selfLit * mix(0.62, 1.0, lit) * mix(0.85, 1.0, Tsun);
    // shadowed faces take the darker tint, lit faces the brightest
    vec3 cloudCol = mix(uCloudTint0, uCloudTint2, clamp(selfLit + 0.15, 0.0, 1.0)) * clight;
    cloudCol += WARM * (phase * dens * (1.0 - dens) * 4.0 * lit * Tsun * 0.35);

    // opacity is essentially light-independent now — a cloud is opaque whether
    // lit or not, so full-opacity clouds actually occlude on the dark side too
    float cloudA = clamp(dens * uCloudAlpha * (0.85 + 0.15 * lit) * 0.95, 0.0, 1.0);
    terrainCol = mix(terrainCol, cloudCol, cloudA);

    // soften the disc edge by ~1.5px (the fragment-discard boundary gets no MSAA)
    baseA = smoothstep(1.0, 1.0 - 1.5 / uRadius, rlen);
  }

  // --- atmosphere: a scattering shell rather than drawn arcs. Coloured by each
  // world's OWN air (uAtmo / uAtmoDeep) so every planet refracts differently —
  // deep hue away from the sun, its brighter hue toward it, a warm sun-glow at
  // the sun-facing limb. A fresnel haze thickens over the lit limb, a crisp rim
  // rides the edge, and a soft glow bleeds beyond it. All radius-normalised, so
  // it holds up at any pixel density.
  float pixAng = atan(d.y, d.x);
  float sunAng = atan(uSunInPlane.y, uSunInPlane.x);
  float rel = atan(sin(pixAng - sunAng), cos(pixAng - sunAng));
  float sunSide = max(0.0, cos(rel)); // 1 toward the sun, 0 away

  // air colour: this world's deep hue -> its bright hue -> a palette-tinted warm
  // as it faces the sun (so the sun-glow still reads as this planet's air)
  vec3 airMid = mix(uAtmoDeep, uAtmo, smoothstep(0.0, 0.65, sunSide));
  vec3 atmoC = mix(airMid, mix(uAtmo, WARM, 0.5), smoothstep(0.65, 1.0, sunSide));

  float atmoA = 0.0;
  if (rr <= 1.0) {
    // inner scattering haze: fresnel-thick toward the limb, lit hemisphere only
    // (recompute the normal + sun here — the terrain block's are out of scope)
    float nz2 = sqrt(max(0.0, 1.0 - rr));
    vec3 sun2 = normalize(vec3(uSunInPlane, -0.55 + (uCrescent - 1.0) * 0.3));
    float dayLit = smoothstep(-0.35, 0.4, dot(vec3(d.x, d.y, nz2), sun2));
    atmoA = pow(1.0 - nz2, 3.5) * dayLit * (0.32 * uHalo);
  } else {
    // outer glow shell beyond the limb, brightest toward the sun
    atmoA = exp(-(rlen - 1.0) / (0.05 * uHalo + 1e-3)) * (0.12 + 0.88 * sunSide) * (0.55 * uHalo);
  }
  // crisp rim line at the very edge (radius-normalised gaussian)
  float re = (rlen - 1.0) / 0.006;
  atmoA += exp(-0.5 * re * re) * (0.6 * uRim) * (0.15 + 0.85 * sunSide);
  atmoA = clamp(atmoA, 0.0, 1.0);

  // composite the atmosphere over the terrain, both over transparent space
  float outA = atmoA + baseA * (1.0 - atmoA);
  vec3 outC = (atmoC * atmoA + terrainCol * baseA * (1.0 - atmoA)) / max(outA, 1e-4);
  outColor = vec4(outC, outA);
}`

export interface PlanetGLHandle {
  resize(w: number, h: number): void
  /** time = elapsed seconds (weather evolution); spinPhase = integrated rotation
   * phase. Both 0 for a static frame. */
  render(params: SceneParams, time?: number, spinPhase?: number): void
  dispose(): void
}

/** '#rrggbb' -> [r,g,b] in 0..1 */
function hex01(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[planetGL] shader compile failed:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

const RAMP_W = 256

// bake every palette's terrain ramp into one RGBA atlas: a row per palette,
// columns spanning height 0.2..1.1 — reuses the exact CPU ramp so colours match
function bakeRampAtlas(): Uint8Array {
  const rows = PALETTES.length
  const buf = new Uint8Array(RAMP_W * rows * 4)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < RAMP_W; x++) {
      const h = 0.2 + (x / (RAMP_W - 1)) * 0.9
      const [cr, cg, cb] = terrainColor(PALETTES[r], h)
      const i = (r * RAMP_W + x) * 4
      buf[i] = Math.round(cr)
      buf[i + 1] = Math.round(cg)
      buf[i + 2] = Math.round(cb)
      buf[i + 3] = 255
    }
  }
  return buf
}

// deterministic per-seed noise offset (mirrors the spirit of the CPU seed
// scatter; the field differs anyway so it need not be identical)
function seedOffset(seed: number): [number, number, number] {
  let s = (seed | 0) * 48271 + 11
  const next = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return [11.7 + next() * 191, 5.3 + next() * 191, 23.1 + next() * 191]
}

export function createPlanetGL(canvas: HTMLCanvasElement): PlanetGLHandle | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
    depth: false,
  })
  if (!gl) return null

  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[planetGL] link failed:', gl.getProgramInfoLog(prog))
    return null
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const ramp = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, ramp)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RAMP_W, PALETTES.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, bakeRampAtlas())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const u = (name: string) => gl.getUniformLocation(prog, name)
  const loc = {
    res: u('uRes'),
    center: u('uCenter'),
    radius: u('uRadius'),
    sun: u('uSunInPlane'),
    noiseOff: u('uNoiseOff'),
    freq: u('uFreq'),
    contrast: u('uContrast'),
    crescent: u('uCrescent'),
    dark: u('uDark'),
    palette: u('uPalette'),
    paletteCount: u('uPaletteCount'),
    ramp: u('uRamp'),
    sheen: u('uSheen'),
    cracks: u('uCracks'),
    molten: u('uMolten'),
    moltenGlow: u('uMoltenGlow'),
    hasMolten: u('uHasMolten'),
    iceCaps: u('uIceCaps'),
    atmo: u('uAtmo'),
    atmoDeep: u('uAtmoDeep'),
    rim: u('uRim'),
    halo: u('uHalo'),
    clouds: u('uClouds'),
    cloudSize: u('uCloudSize'),
    cloudAlpha: u('uCloudAlpha'),
    time: u('uTime'),
    cloudTint0: u('uCloudTint0'),
    cloudTint1: u('uCloudTint1'),
    cloudTint2: u('uCloudTint2'),
    spinPhase: u('uSpinPhase'),
    evolve: u('uEvolve'),
    swirl: u('uSwirl'),
    swirlScale: u('uSwirlScale'),
    systems: u('uSystems'),
    clump: u('uClump'),
    bump: u('uBump'),
    organize: u('uOrganize'),
    shear: u('uShear'),
  }

  gl.useProgram(prog)
  gl.uniform1i(loc.ramp, 0)
  gl.clearColor(0, 0, 0, 0)

  let W = canvas.width || 1
  let H = canvas.height || 1

  return {
    resize(w, h) {
      if (w === W && h === H && canvas.width === w && canvas.height === h) return
      W = w
      H = h
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    },
    render(p, time = 0, spinPhase = 0) {
      const cx = W * p.planetX
      const cy = H * p.planetY
      const R = H * p.planetR
      const sdx = W * p.sunX - cx
      const sdy = H * p.sunY - cy
      const inLen = Math.hypot(sdx, sdy) || 1
      const [ox, oy, oz] = seedOffset(p.seed)
      const palCount = PALETTES.length
      const pal = ((p.palette | 0) % palCount + palCount) % palCount
      const P = PALETTES[pal]
      const molten = P.moltenColor
      // cloud colour is set per scene now (so a preset can pick e.g. ash grey):
      // the lit face is the chosen colour, the shadowed face a darker, cooler cut
      const cc = hex01(p.cloudColor)
      const t2 = cc
      const t1 = cc
      const t0: [number, number, number] = [cc[0] * 0.5, cc[1] * 0.55, cc[2] * 0.62]

      gl.useProgram(prog)
      gl.bindVertexArray(vao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, ramp)
      gl.uniform2f(loc.res, W, H)
      gl.uniform2f(loc.center, cx, cy)
      gl.uniform1f(loc.radius, R)
      gl.uniform2f(loc.sun, sdx / inLen, sdy / inLen)
      gl.uniform3f(loc.noiseOff, ox, oy, oz)
      gl.uniform1f(loc.freq, 3.1 * p.terrainScale)
      gl.uniform1f(loc.contrast, 0.5 + 0.5 * p.terrain)
      gl.uniform1f(loc.crescent, p.crescent)
      gl.uniform1f(loc.dark, p.dark)
      gl.uniform1f(loc.palette, pal)
      gl.uniform1f(loc.paletteCount, palCount)
      gl.uniform3f(loc.sheen, P.sheen[0] / 255, P.sheen[1] / 255, P.sheen[2] / 255)
      gl.uniform1f(loc.cracks, P.cracks ?? 0)
      gl.uniform3f(loc.molten, molten ? molten[0] / 255 : 0, molten ? molten[1] / 255 : 0, molten ? molten[2] / 255 : 0)
      gl.uniform1f(loc.moltenGlow, P.moltenGlow ?? 1)
      gl.uniform1f(loc.hasMolten, molten ? 1 : 0)
      gl.uniform1f(loc.iceCaps, P.iceCaps ?? 0)
      gl.uniform3f(loc.atmo, P.atmo[0] / 255, P.atmo[1] / 255, P.atmo[2] / 255)
      gl.uniform3f(loc.atmoDeep, P.atmoDeep[0] / 255, P.atmoDeep[1] / 255, P.atmoDeep[2] / 255)
      gl.uniform1f(loc.rim, p.rim)
      gl.uniform1f(loc.halo, p.halo)
      gl.uniform1f(loc.clouds, p.clouds)
      gl.uniform1f(loc.cloudSize, p.cloudSize)
      gl.uniform1f(loc.cloudAlpha, p.cloudAlpha)
      gl.uniform1f(loc.time, time)
      gl.uniform3f(loc.cloudTint0, t0[0], t0[1], t0[2])
      gl.uniform3f(loc.cloudTint1, t1[0], t1[1], t1[2])
      gl.uniform3f(loc.cloudTint2, t2[0], t2[1], t2[2])
      gl.uniform1f(loc.spinPhase, spinPhase)
      gl.uniform1f(loc.evolve, p.windEvolve)
      gl.uniform1f(loc.swirl, p.windSwirl)
      gl.uniform1f(loc.swirlScale, p.windSwirlScale)
      gl.uniform1f(loc.systems, p.cloudSystems)
      gl.uniform1f(loc.clump, p.cloudClump)
      gl.uniform1f(loc.bump, p.cloudBump)
      gl.uniform1f(loc.organize, p.windOrganize)
      gl.uniform1f(loc.shear, p.windShear)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() {
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
      gl.deleteVertexArray(vao)
      gl.deleteTexture(ramp)
    },
  }
}
