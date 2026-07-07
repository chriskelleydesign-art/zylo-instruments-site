// ═══════════════════════════════════════════════════════════════════════════
// ALPENGLOW 3.0 AQUA — Three.js WebGPU + threejs-water-pro
// All water (surface, reflections, refraction, foam, caustics, underwater fog,
// waterline) is owned by the WaterSystem — zero custom water code.
// Terrain/flight/sky ported from the WebGL2 build (archived as v2.html).
// v2 systems restored on top: solar system + space regime, world modes
// (incl. AFTERCITY suburbia), cycle/zen/hold, dive/launch, nav HUD, and a
// contained TSL caustics layer on the real seabed terrain.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from "three/webgpu";
import { pass, positionWorld, attribute, uniform, smoothstep as tslSmoothstep,
         mx_noise_float, bumpMap, normalWorld, vec3 } from "three/tsl";
import * as TSL from "three/tsl";   // vec2/float/cameraPosition pulled from namespace (link-safe)
const { vec2, float, cameraPosition } = TSL;
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { WaterSystem, Sky, getPresetParams } from "../lib/water-pro/index.js";
import { createMusicEngine } from "./music.js";

// ── helpers ──────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ── solar system (ported from v2 — units: km, sun at origin) ─────────────────
const BODIES = [
  { name: "SOL", emissive: true, r: 5200, pos: [0, 0, 0],
    a: [1.0, 0.85, 0.6], b: [1.0, 0.6, 0.3], atmo: [1.0, 0.75, 0.45] },
  { name: "CINDER", r: 900, orbit: 26000, ang: 0.8, y: -800,
    a: [0.13, 0.10, 0.10], b: [0.55, 0.22, 0.09], atmo: [0.9, 0.35, 0.15], water: 0,
    land: { heightMul: 1.5, waterLvl: -1e6, snow: 1e6, seed: [911, 47],
      grass: [0.16, 0.10, 0.08], forest: [0.10, 0.06, 0.05], rock: [0.13, 0.11, 0.11], sand: [0.30, 0.15, 0.08],
      snowCol: [0.9, 0.5, 0.3] } },
  { name: "SOLENNE", r: 1400, orbit: 40000, ang: 2.4, y: 500,
    a: [0.72, 0.56, 0.34], b: [0.48, 0.33, 0.20], atmo: [0.95, 0.75, 0.5], water: 0,
    land: { heightMul: 0.55, waterLvl: -1e6, snow: 1e6, seed: [402, 733],
      grass: [0.42, 0.32, 0.16], forest: [0.30, 0.22, 0.11], rock: [0.38, 0.28, 0.18], sand: [0.52, 0.42, 0.24],
      snowCol: [0.8, 0.72, 0.6] } },
  { name: "DUNEMERE", r: 1650, orbit: 48500, ang: 3.25, y: -950,
    a: [0.84, 0.58, 0.30], b: [0.52, 0.30, 0.15], atmo: [1.0, 0.64, 0.34], water: 0,
    land: { heightMul: 0.72, waterLvl: -1e6, snow: 1e6, seed: [1204, 619],
      grass: [0.50, 0.32, 0.14], forest: [0.37, 0.22, 0.10], rock: [0.42, 0.30, 0.21], sand: [0.76, 0.54, 0.25],
      snowCol: [0.95, 0.76, 0.48] } },
  { name: "ALPEN PRIME", r: 1800, orbit: 58000, ang: 4.1, y: 0, home: true,
    a: [0.16, 0.30, 0.16], b: [0.10, 0.20, 0.38], atmo: [0.45, 0.65, 1.0], water: 1,
    land: { heightMul: 1.0, waterLvl: 0, snow: 135, seed: [0, 0],
      grass: [0.095, 0.185, 0.062], forest: [0.042, 0.105, 0.042], rock: [0.225, 0.20, 0.175], sand: [0.36, 0.33, 0.25],
      snowCol: [0.80, 0.85, 0.94] },
    moons: [{ name: "BRUME", r: 240, orbit: 9500, ang: 1.2, w: 0.010,
      a: [0.52, 0.50, 0.47], b: [0.30, 0.29, 0.30], atmo: [0.46, 0.48, 0.58], water: 0,
      land: { heightMul: 0.8, waterLvl: -1e6, snow: 1e6, seed: [77, 310],
        grass: [0.36, 0.35, 0.32], forest: [0.26, 0.25, 0.24], rock: [0.34, 0.33, 0.33], sand: [0.44, 0.43, 0.40],
        snowCol: [0.78, 0.78, 0.82] } }] },
  { name: "MERIDIA", r: 2400, orbit: 96000, ang: 5.6, y: -1500,
    a: [0.07, 0.22, 0.30], b: [0.13, 0.32, 0.20], atmo: [0.35, 0.8, 0.9], water: 1,
    land: { heightMul: 0.9, waterLvl: 26, snow: 1e6, seed: [265, 88],
      grass: [0.06, 0.20, 0.10], forest: [0.03, 0.13, 0.07], rock: [0.16, 0.19, 0.15], sand: [0.34, 0.34, 0.22],
      snowCol: [0.8, 0.9, 0.9] } },
  { name: "PELAGOS", r: 2100, orbit: 116000, ang: 0.62, y: 1400,
    a: [0.02, 0.18, 0.34], b: [0.05, 0.36, 0.52], atmo: [0.30, 0.82, 1.0], water: 1,
    land: { heightMul: 0.38, waterLvl: 420, snow: 1e6, seed: [144, 987],
      grass: [0.03, 0.18, 0.16], forest: [0.02, 0.12, 0.14], rock: [0.12, 0.22, 0.24], sand: [0.20, 0.38, 0.34],
      snowCol: [0.70, 0.94, 0.98] } },
  { name: "LITHOS", r: 360, orbit: 124000, ang: 4.85, y: -2200, lowG: true,
    a: [0.30, 0.27, 0.24], b: [0.16, 0.14, 0.13], atmo: [0.30, 0.28, 0.25], water: 0,
    land: { heightMul: 2.2, waterLvl: -1e6, snow: 1e6, seed: [1901, 302],
      grass: [0.22, 0.20, 0.18], forest: [0.12, 0.11, 0.10], rock: [0.27, 0.25, 0.24], sand: [0.38, 0.34, 0.28],
      snowCol: [0.55, 0.54, 0.56] } },
  { name: "PALLOR", r: 1100, orbit: 134000, ang: 1.9, y: 2000,
    a: [0.80, 0.86, 0.94], b: [0.55, 0.66, 0.80], atmo: [0.7, 0.85, 1.0], water: 0,
    land: { heightMul: 1.1, waterLvl: -1e6, snow: -100, seed: [518, 903],
      grass: [0.55, 0.62, 0.72], forest: [0.42, 0.5, 0.62], rock: [0.35, 0.42, 0.55], sand: [0.6, 0.68, 0.78],
      snowCol: [0.86, 0.90, 0.97] },
    moons: [{ name: "SKREE", r: 160, orbit: 5200, ang: 3.0, w: 0.016,
      a: [0.54, 0.52, 0.48], b: [0.34, 0.34, 0.36], atmo: [0.48, 0.52, 0.62], water: 0,
      land: { heightMul: 1.2, waterLvl: -1e6, snow: 1e6, seed: [640, 12],
        grass: [0.40, 0.38, 0.34], forest: [0.31, 0.30, 0.29], rock: [0.36, 0.35, 0.34], sand: [0.50, 0.48, 0.43],
        snowCol: [0.72, 0.72, 0.76] } },
    { name: "VAIL", r: 320, orbit: 11800, ang: 0.4, w: 0.007,
      a: [0.55, 0.60, 0.70], b: [0.35, 0.42, 0.55], atmo: [0.5, 0.6, 0.8], water: 0,
      land: { heightMul: 0.9, waterLvl: -1e6, snow: 30, seed: [222, 555],
        grass: [0.45, 0.52, 0.62], forest: [0.35, 0.42, 0.52], rock: [0.30, 0.36, 0.48], sand: [0.5, 0.58, 0.68],
        snowCol: [0.85, 0.9, 0.97] } }] },
  { name: "NINTHE", r: 700, orbit: 172000, ang: 3.6, y: -3000,
    a: [0.28, 0.16, 0.38], b: [0.14, 0.08, 0.22], atmo: [0.7, 0.4, 1.0], water: 0,
    land: { heightMul: 1.25, waterLvl: -1e6, snow: 180, seed: [830, 411],
      grass: [0.20, 0.12, 0.28], forest: [0.12, 0.07, 0.18], rock: [0.17, 0.12, 0.22], sand: [0.3, 0.2, 0.38],
      snowCol: [0.75, 0.65, 0.95] } },
  { name: "VULKAR", r: 1250, orbit: 190000, ang: 2.15, y: -1900, kind: "lava",
    a: [0.14, 0.07, 0.06], b: [0.62, 0.20, 0.08], atmo: [1.0, 0.42, 0.18], water: 0,
    land: { heightMul: 1.7, waterLvl: -1e6, snow: 1e6, seed: [451, 88],
      clouds: 0,                     // molten world: no water-cloud cover at all
      skyTint: [1.30, 0.54, 0.30],   // v4's red inferno haze — tints sky paint + fog
      grass: [0.085, 0.055, 0.048], forest: [0.055, 0.038, 0.032], rock: [0.10, 0.075, 0.068], sand: [0.15, 0.09, 0.06],
      snowCol: [0.40, 0.22, 0.14] } },
  { name: "AETHER", r: 2050, orbit: 204000, ang: 0.35, y: 2600, kind: "aether",
    a: [0.10, 0.30, 0.40], b: [0.46, 0.40, 0.66], atmo: [0.55, 0.95, 0.82], water: 1,
    land: { heightMul: 0.5, waterLvl: 60, snow: 1e6, seed: [318, 642],
      grass: [0.18, 0.34, 0.40], forest: [0.12, 0.26, 0.36], rock: [0.30, 0.30, 0.42], sand: [0.44, 0.46, 0.58],
      snowCol: [0.80, 0.92, 0.98] } },
  { name: "UMBRA GATE", r: 1750, orbit: 218000, ang: 5.25, y: 4600, blackhole: true,
    a: [0.02, 0.015, 0.035], b: [0.85, 0.32, 1.0], atmo: [0.50, 0.18, 1.0], water: 0,
    land: { heightMul: 1.0, waterLvl: -1e6, snow: 1e6, seed: [55, 999],
      grass: [0.02, 0.02, 0.03], forest: [0.02, 0.02, 0.03], rock: [0.04, 0.03, 0.05], sand: [0.06, 0.04, 0.08],
      snowCol: [0.2, 0.18, 0.25] } },
  { name: "AFTERCITY", r: 1900, pos: [260000, 3600, -188000], hidden: true,
    a: [0.08, 0.26, 0.42], b: [0.80, 0.16, 0.95], atmo: [0.25, 0.85, 1.0], water: 0,
    land: { city: 1, heightMul: 1.0, waterLvl: -1e6, snow: 1e6, seed: [7007, 2029],
      grass: [0.055, 0.12, 0.058], forest: [0.045, 0.10, 0.050], rock: [0.19, 0.18, 0.16], sand: [0.30, 0.29, 0.23],
      snowCol: [0.40, 0.95, 1.0] } },
];
const RINGS = { NINTHE: [1.45, 2.35], PALLOR: [1.35, 1.80] };

function setLandingAnchor(body) {
  const l = Math.hypot(...body.pos) || 1;
  const toSun = [-body.pos[0] / l, -body.pos[1] / l, -body.pos[2] / l];
  const a = [toSun[0] + 0.35, toSun[1] + 0.55, toSun[2] - 0.2];
  const al = Math.hypot(...a) || 1;
  body.anchor = a.map(v => v / al);
}
const SYS = [];
for (const p of BODIES) {
  if (!p.pos) p.pos = [Math.sin(p.ang) * p.orbit, p.y || 0, Math.cos(p.ang) * p.orbit];
  setLandingAnchor(p);
  SYS.push(p);
  if (p.moons) for (const m of p.moons) { m.parent = p; SYS.push(m); }
}
function moonUpdate(dt) {
  for (const b of SYS) if (b.parent) {
    b.ang += (b.w || 0.01) * dt * 0.05;
    b.pos = [b.parent.pos[0] + Math.sin(b.ang) * b.orbit,
             b.parent.pos[1] + b.orbit * 0.04,
             b.parent.pos[2] + Math.cos(b.ang) * b.orbit];
    setLandingAnchor(b);
    if (b.mesh) b.mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
  }
}
moonUpdate(0);
const HOME = SYS.find(b => b.home);
const HANDOFF_UP = 24000;   // meters — climb past this and the sky hands off to space

// ── terrain (ported verbatim from v2 — domain-warped fbm + drainage carving) ─
let SEED = [0, 0];
const WATER_LVL = 0;   // world water is ALWAYS y=0; planets shift their terrain
function hash12(px, py) {
  let x = px * 0.1031 - Math.floor(px * 0.1031);
  let y = py * 0.1031 - Math.floor(py * 0.1031);
  let z = x;
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d; y += d; z += d;
  const r = (x + y) * z;
  return r - Math.floor(r);
}
function vnoise(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
function fbm(px, py, oct) {
  let a = 0.5, s = 0, x = px, y = py;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y);
    const nx = 0.8 * x - 0.6 * y, ny = 0.6 * x + 0.8 * y;
    x = nx * 2.03; y = ny * 2.03; a *= 0.5;
  }
  return s;
}
function ridged(px, py, oct) {
  let a = 0.55, s = 0, w = 1.0, x = px, y = py;
  for (let i = 0; i < oct; i++) {
    let n = 1.0 - Math.abs(2.0 * vnoise(x, y) - 1.0);
    n = n * n * w; w = Math.min(1, n * 1.4);
    s += a * n;
    const nx = 0.8 * x - 0.6 * y, ny = 0.6 * x + 0.8 * y;
    x = nx * 2.13; y = ny * 2.13; a *= 0.5;
  }
  return s;
}
// AFTERCITY heightfield: lawns, roads, driveway pads, yard trees (v2 port).
// Houses are separate instanced geometry — see HousePool.
function cityRaw(wx, wz, land) {
  const sx = wx + SEED[0] + land.seed[0];
  const sz = wz + SEED[1] + land.seed[1];
  const px = sx + Math.sin(sz * 0.0016) * 46;
  const pz = sz + Math.sin(sx * 0.0013) * 38;
  const dgx = px / 460, dgz = pz / 460;
  const dfx = dgx - Math.floor(dgx), dfz = dgz - Math.floor(dgz);
  const collector = Math.min(Math.min(dfx, 1 - dfx), Math.min(dfz, 1 - dfz));
  const mainRoad = 1 - smoothstep(0.034, 0.058, collector);
  const sideA = Math.abs(dfz - (0.36 + 0.045 * Math.sin(Math.floor(dgx) * 1.11)));
  const sideB = Math.abs(dfz - (0.66 + 0.040 * Math.sin(Math.floor(dgx) * 0.97 + 2.0)));
  const sideRoad = (1 - smoothstep(0.020, 0.038, Math.min(sideA, sideB))) * smoothstep(0.10, 0.20, dfx) * (1 - smoothstep(0.80, 0.90, dfx));
  const road = Math.max(mainRoad, sideRoad);
  const lx = px / 54, lz = pz / 76;
  const lotX = Math.floor(lx), lotZ = Math.floor(lz);
  const fx = lx - lotX, fz = lz - lotZ;
  const lotId = hash12(lotX, lotZ);
  const occupied = lotId > 0.08 && road < 0.35 && collector > 0.078;
  const hx = fx + (lotId - 0.5) * 0.035;
  const hz = fz + (hash12(lotX + 7, lotZ - 3) - 0.5) * 0.035;
  const driveway = smoothstep(0.60, 0.66, hx) * (1 - smoothstep(0.84, 0.90, hx)) *
                   smoothstep(0.00, 0.05, hz) * (1 - smoothstep(0.34, 0.40, hz)) * (occupied ? 1 : 0);
  const lawn = 1.05 + (fbm(px * 0.018, pz * 0.018, 3) - 0.5) * 0.22;
  const treeId = hash12(lotX + 11, lotZ + 5);
  const tr1 = Math.max(0, 1 - Math.hypot((hx - 0.24) * 1.1, (hz - 0.10) * 1.6) / 0.075);
  const tr2 = Math.max(0, 1 - Math.hypot((hx - 0.76) * 1.1, (hz - 0.85) * 1.6) / 0.075);
  let tree = treeId > 0.35 ? Math.max(tr1, treeId > 0.7 ? tr2 : 0) : 0;
  tree = tree * tree * (3 - 2 * tree);
  // real instanced trees now sit on the ground (see HousePool) — the heightfield
  // only keeps a faint 0.4 m planter mound so the lawn isn't dead flat.
  return (lawn * (1 - road) + road * 0.18 + driveway * 0.62 + tree * 0.4 * (1 - road)) * land.heightMul;
}
// Where a house sits on a lot (shared by HousePool); null if lot is empty.
function cityLot(wx, wz, land) {
  const sx = wx + SEED[0] + land.seed[0];
  const sz = wz + SEED[1] + land.seed[1];
  const px = sx + Math.sin(sz * 0.0016) * 46;
  const pz = sz + Math.sin(sx * 0.0013) * 38;
  const dgx = px / 460, dgz = pz / 460;
  const dfx = dgx - Math.floor(dgx), dfz = dgz - Math.floor(dgz);
  const collector = Math.min(Math.min(dfx, 1 - dfx), Math.min(dfz, 1 - dfz));
  const mainRoad = 1 - smoothstep(0.034, 0.058, collector);
  const sideA = Math.abs(dfz - (0.36 + 0.045 * Math.sin(Math.floor(dgx) * 1.11)));
  const sideB = Math.abs(dfz - (0.66 + 0.040 * Math.sin(Math.floor(dgx) * 0.97 + 2.0)));
  const sideRoad = (1 - smoothstep(0.020, 0.038, Math.min(sideA, sideB))) * smoothstep(0.10, 0.20, dfx) * (1 - smoothstep(0.80, 0.90, dfx));
  const road = Math.max(mainRoad, sideRoad);
  const lotX = Math.floor(px / 54), lotZ = Math.floor(pz / 76);
  const lotId = hash12(lotX, lotZ);
  if (!(lotId > 0.08 && road < 0.35 && collector > 0.078)) return null;
  return { lotX, lotZ, id: lotId };
}
function terrainRaw(wx, wz) {
  const land = PLANET.land;
  if (land.city) return cityRaw(wx, wz, land);
  const px = (wx + SEED[0] + land.seed[0]) * 0.0016,
        py = (wz + SEED[1] + land.seed[1]) * 0.0016;
  const qx = fbm(px * 0.9 + 3.1, py * 0.9 + 3.1, 4);
  const qy = fbm(px * 0.9 - 7.7, py * 0.9 - 7.7, 4);
  const pwx = px + (qx - 0.5) * 0.55, pwy = py + (qy - 0.5) * 0.55;
  const c = fbm(pwx * 0.35, pwy * 0.35, 4);
  const mask = clamp((c - 0.38) / 0.22, 0, 1);
  const m = mask * mask * (3 - 2 * mask);
  const r = ridged(pwx * 1.4, pwy * 1.4, 5);
  let h = (c - 0.46) * 150.0;
  h += Math.pow(r, 1.55) * 192.0 * (0.24 + 0.70 * m);
  h -= (1 - m) * fbm(pwx * 2.6, pwy * 2.6, 3) * 22.0;
  // deep-ocean trenches: a very-low-frequency field carves SOME lowland basins
  // much deeper (kept out of the mountains via (1-m)) so not every sea is shallow
  const deepField = fbm(pwx * 0.16 + 41.0, pwy * 0.16 - 13.0, 3);
  const deepMask = clamp((deepField - 0.54) / 0.16, 0, 1);
  h -= (1 - m) * deepMask * deepMask * 60.0;
  h += (fbm(px * 3.2, py * 3.2, 3) - 0.5) * 5.5;
  h *= land.heightMul;
  // World water is always y=0: water planets shift terrain so their sea level
  // lands at 0; dry planets never dip below +2 so the WaterSystem's underwater
  // pipeline can never engage there (basins become desert playas).
  if (land.waterLvl > -1e5) {
    const fh = h - land.waterLvl;
    // deepen sea/lake floors so the underwater world has real depth. Value stays
    // continuous at the shoreline (0·factor = 0); the multiplier ramps from 1.2
    // near shore to ~1.75 by −22 m — wadeable shallows, genuinely deep basins.
    return fh < 0 ? fh * (1.2 + 0.55 * smoothstep(0, -22, fh)) : fh;
  }
  // VULKAR (v4 parity): carve the lowlands deeper, then clamp them into
  // dead-flat pans at y=2 — those pans ARE the lava lakes (the terrain
  // material paints everything below ~y 4 as emissive melt). Staying ≥2
  // keeps the WaterSystem's underwater pipeline off, same as other dry worlds.
  if (PLANET.kind === "lava") h -= (1 - m) * 34;
  return Math.max(h, 2);
}

// ── land palette (per-planet, defaults = ALPEN PRIME) ────────────────────────
const PAL_LAND = {
  grass: [0.095, 0.185, 0.062], forest: [0.042, 0.105, 0.042],
  rock: [0.225, 0.20, 0.175], sand: [0.36, 0.33, 0.25],
  snow: [0.80, 0.85, 0.94], snowLine: 135,
  sediment: [0.13, 0.15, 0.12], abyss: [0.05, 0.07, 0.07],
};
// Palette as TSL uniforms so terrain colour is decided PER-PIXEL (v2 parity),
// not smeared across low-res vertex colours. Vector3 keeps values linear.
const uGrass    = uniform(new THREE.Vector3(...PAL_LAND.grass));
const uForest   = uniform(new THREE.Vector3(...PAL_LAND.forest));
const uRock     = uniform(new THREE.Vector3(...PAL_LAND.rock));
const uSand     = uniform(new THREE.Vector3(...PAL_LAND.sand));
const uSnowCol  = uniform(new THREE.Vector3(...PAL_LAND.snow));
const uSnowLine = uniform(PAL_LAND.snowLine);
function applyPlanetPalette(p) {
  PAL_LAND.grass = p.land.grass; PAL_LAND.forest = p.land.forest;
  PAL_LAND.rock = p.land.rock; PAL_LAND.sand = p.land.sand;
  PAL_LAND.snow = p.land.snowCol; PAL_LAND.snowLine = p.land.snow;
  uGrass.value.set(...PAL_LAND.grass);   uForest.value.set(...PAL_LAND.forest);
  uRock.value.set(...PAL_LAND.rock);     uSand.value.set(...PAL_LAND.sand);
  uSnowCol.value.set(...PAL_LAND.snow);  uSnowLine.value = PAL_LAND.snowLine;
  uLavaAmt.value = p.kind === "lava" ? 1 : 0;
}
// AFTERCITY ground albedo — v2 parity: green lawns, asphalt roads with faint
// lane dashes, concrete sidewalks/driveways/foundation pads, blobby yard trees.
// Masks mirror cityRaw/cityLot exactly so paint lines up with the instanced
// houses. Outputs albedo only; the material does the lighting.
const _fract = (x) => x - Math.floor(x);
function cityColor(out, wx, wz) {
  const land = PLANET.land;
  const sx = wx + SEED[0] + land.seed[0], sz = wz + SEED[1] + land.seed[1];
  const px = sx + Math.sin(sz * 0.0016) * 46, pz = sz + Math.sin(sx * 0.0013) * 38;
  const dgx = px / 460, dgz = pz / 460;
  const dcx = Math.floor(dgx), dfx = dgx - dcx, dfz = dgz - Math.floor(dgz);
  const collector = Math.min(Math.min(dfx, 1 - dfx), Math.min(dfz, 1 - dfz));
  const mainRoad = 1 - smoothstep(0.034, 0.058, collector);
  const mainWalk = (1 - smoothstep(0.058, 0.082, collector)) * (1 - mainRoad);
  const sideA = Math.abs(dfz - (0.36 + 0.045 * Math.sin(dcx * 1.11)));
  const sideB = Math.abs(dfz - (0.66 + 0.040 * Math.sin(dcx * 0.97 + 2.0)));
  const sMin = Math.min(sideA, sideB);
  const gate = smoothstep(0.10, 0.20, dfx) * (1 - smoothstep(0.80, 0.90, dfx));
  const sideRoad = (1 - smoothstep(0.018, 0.038, sMin)) * gate;
  const sideWalk = (1 - smoothstep(0.038, 0.058, sMin)) * gate * (1 - sideRoad);
  const road = Math.max(mainRoad, sideRoad);
  const sidewalk = Math.max(mainWalk, sideWalk);
  // lot + occupancy (decided at lot centre, matching the house instancer)
  const lxf = px / 54, lzf = pz / 76;
  const lotX = Math.floor(lxf), lotZ = Math.floor(lzf);
  const fx = lxf - lotX, fz = lzf - lotZ;
  const lotId = hash12(lotX, lotZ);
  const jx = (lotId - 0.5) * 0.035, jz = (hash12(lotX + 7, lotZ - 3) - 0.5) * 0.035;
  const pcx = (lotX + 0.5 - jx) * 54, pcz = (lotZ + 0.475 - jz) * 76;
  const dgcx = pcx / 460, dgcz = pcz / 460;
  const dfcx = dgcx - Math.floor(dgcx), dfcz = dgcz - Math.floor(dgcz);
  const collC = Math.min(Math.min(dfcx, 1 - dfcx), Math.min(dfcz, 1 - dfcz));
  const mainC = 1 - smoothstep(0.034, 0.058, collC);
  const sAc = Math.abs(dfcz - (0.36 + 0.045 * Math.sin(Math.floor(dgcx) * 1.11)));
  const sBc = Math.abs(dfcz - (0.66 + 0.040 * Math.sin(Math.floor(dgcx) * 0.97 + 2.0)));
  const sideC = (1 - smoothstep(0.020, 0.038, Math.min(sAc, sBc))) *
                smoothstep(0.10, 0.20, dfcx) * (1 - smoothstep(0.80, 0.90, dfcx));
  const occupied = (lotId > 0.08 && Math.max(mainC, sideC) < 0.35 && collC > 0.078) ? 1 : 0;
  const hfx = fx + jx, hfz = fz + jz;
  const house = smoothstep(0.185, 0.205, hfx) * (1 - smoothstep(0.795, 0.815, hfx)) *
                smoothstep(0.255, 0.275, hfz) * (1 - smoothstep(0.675, 0.695, hfz)) * occupied;
  const porch = smoothstep(0.35, 0.37, hfx) * (1 - smoothstep(0.68, 0.70, hfx)) *
                smoothstep(0.15, 0.17, hfz) * (1 - smoothstep(0.30, 0.32, hfz)) * occupied;
  const garageOn = hash12(lotX + 2, lotZ + 8) >= 0.3 ? 1 : 0;
  const garage = smoothstep(0.59, 0.61, hfx) * (1 - smoothstep(0.83, 0.85, hfx)) *
                 smoothstep(0.11, 0.13, hfz) * (1 - smoothstep(0.34, 0.36, hfz)) * occupied * garageOn;
  const driveway = smoothstep(0.60, 0.66, hfx) * (1 - smoothstep(0.84, 0.90, hfx)) *
                   smoothstep(0.00, 0.05, hfz) * (1 - smoothstep(0.34, 0.40, hfz)) * occupied;
  // palette
  const lawnVar = clamp(fbm(px * 0.03, pz * 0.03, 3), 0, 1);
  let c = mix3([0.11, 0.26, 0.075], [0.30, 0.44, 0.15], lawnVar);
  const dash = _fract(px * 0.03) > 0.97 ? 0.16 : 0;            // faint lane dashes
  c = mix3(c, [0.30 + dash, 0.305 + dash, 0.30 + dash], road);
  c = mix3(c, [0.68, 0.665, 0.61], sidewalk);                 // concrete ×0.95
  c = mix3(c, [0.56, 0.546, 0.50], driveway);                 // concrete ×0.78
  const pad = Math.max(house, Math.max(garage, porch));
  c = mix3(c, [0.49, 0.476, 0.435], pad * 0.92);              // foundation slab
  // blobby yard trees (front + back)
  const treeId = hash12(lotX + 11, lotZ + 5);
  const tr1 = Math.max(0, 1 - Math.hypot((hfx - 0.24) * 1.1, (hfz - 0.10) * 1.6) / 0.075);
  const tr2 = Math.max(0, 1 - Math.hypot((hfx - 0.76) * 1.1, (hfz - 0.85) * 1.6) / 0.075);
  let tree = treeId > 0.35 ? Math.max(tr1, treeId > 0.7 ? tr2 : 0) : 0;
  tree = tree * tree * (3 - 2 * tree);
  c = mix3(c, [0.09, 0.22, 0.07], tree * 0.85);
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}
function landColor(out, h, slopeY, wx, wz) {
  if (PLANET.land.city) { cityColor(out, wx, wz); return; }
  const tex = 0.75 + 0.5 * fbm(wx * 0.02, wz * 0.02, 3);
  if (h < WATER_LVL - 0.5) {
    // ── seabed maps (v2 parity): depth-banded geology + rock faces + fine
    // sediment grain + sand ripples in the shallows. Reads as a real ocean
    // floor, not a flat depth gradient. Depth bands stretched for deeper basins.
    const d = WATER_LVL - h;
    const S = PAL_LAND.sand, R = PAL_LAND.rock;
    const shelf = [S[0] * 0.82, S[1] * 0.86, S[2] * 0.72];
    const mid   = [0.10, 0.21, 0.20];
    const deep  = [0.018, 0.050, 0.060];
    let c = mix3(shelf, mid, smoothstep(4, 26, d));
    c = mix3(c, deep, smoothstep(55, 130, d));            // extended for deep floors
    // rock outcrops on the steeper faces / drop-offs
    const face = 1 - smoothstep(0.55, 0.90, slopeY);
    c = mix3(c, [R[0] * 0.30, R[1] * 0.38, R[2] * 0.40], face * 0.5);
    // fine sediment grain + shallow sand ripples
    const sed = fbm(wx * 0.17, wz * 0.17, 3);
    const rip = 0.5 + 0.5 * Math.sin(wx * 0.5 + wz * 0.3 + sed * 5.0);
    const rippleBand = smoothstep(1.5, 20, d) * (1 - smoothstep(30, 60, d));
    let shade = (0.84 + 0.30 * sed) * (0.93 + 0.13 * rip * rippleBand);
    // gentle AO: gullies darker than ridges
    shade *= 0.58 + 0.42 * smoothstep(0.28, 0.92, slopeY);
    out[0] = c[0] * shade; out[1] = c[1] * shade; out[2] = c[2] * shade;
    return;
  }
  const hAbove = h - WATER_LVL;
  // patchy vegetation — grass in the meadows, forest in clumps
  const patch = fbm(wx * 0.012 + 4, wz * 0.012, 4);
  const veg = mix3(PAL_LAND.grass, PAL_LAND.forest, smoothstep(0.34, 0.74, patch));
  let c = mix3(PAL_LAND.sand, veg, smoothstep(0.6, 3.5, hAbove));
  // rock: exposed on steep slopes (earlier than before), as scattered outcrops
  // on moderate slopes, and at high altitude — so mountains aren't flat green
  const rockSlope = smoothstep(0.93, 0.66, slopeY);
  const rockPatch = smoothstep(0.60, 0.80, patch) * smoothstep(0.58, 0.84, slopeY);
  const rocky = Math.max(rockSlope, Math.max(rockPatch, smoothstep(70, 165, hAbove)));
  c = mix3(c, PAL_LAND.rock, rocky);
  // snow caps — slope-aware line (sheer faces shed snow) with a ragged edge,
  // plus guaranteed full cover well above the line so summits are always white
  const snEdge = fbm(wx * 0.03 + 9, wz * 0.03, 3) * 26;
  const sn1 = smoothstep(PAL_LAND.snowLine, PAL_LAND.snowLine + 30,
                         hAbove + (slopeY - 0.8) * 92 + snEdge - 13);
  const sn2 = smoothstep(PAL_LAND.snowLine * 1.5, PAL_LAND.snowLine * 2.0, hAbove);
  const snowAmt = Math.max(sn1 * (0.55 + 0.45 * slopeY), sn2);
  c = mix3(c, PAL_LAND.snow, snowAmt);
  // fake ambient occlusion: darken the steep faces so relief reads under light,
  // plus a second higher-frequency tonal break-up. Snow is EXEMPT from the
  // tonal noise — dirty grey speckle on the caps read as artifacts; caps stay
  // bright with only gentle slope shading.
  const ao = 0.70 + 0.30 * smoothstep(0.42, 0.86, slopeY);
  const t2 = 0.72 + 0.56 * fbm(wx * 0.05, wz * 0.05, 3);
  const shade = lerp(tex * ao * t2, Math.min(1.05, 0.82 + 0.24 * slopeY), snowAmt);
  out[0] = c[0] * shade; out[1] = c[1] * shade; out[2] = c[2] * shade;
}

// ── contained caustics: TSL node material for the terrain rings ─────────────
// The pattern lives in the terrain's colorNode, masked to just-below-sea-level
// world positions and driven by two uniforms the frame loop updates. If TSL
// isn't available for any reason we silently fall back to the plain material.
const uCausticAmt = uniform(0);
const uCausticTime = uniform(0);
const uLavaAmt = uniform(0);        // 1 on VULKAR: basins glow as molten crust
function makeTerrainMaterial() {
  try {
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0.0 });
    const vcol = attribute("color", "vec3");
    const wp = positionWorld;
    const t = uCausticTime;
    // ── caustics from REAL noise (not sine products). Two ridged noise layers
    // scrolling in different directions cross to form an organic, animated web —
    // the old 3-sine version made a regular diagonal grid that read wrong from
    // most angles. `abs(noise)` inverted & powered = bright thin ridges.
    const cp = wp.mul(0.085);
    const s1 = mx_noise_float(cp.add(vec3(t.mul(0.16), t.mul(0.05), t.mul(0.07))))
      .abs().oneMinus().pow(8.0);
    const s2 = mx_noise_float(cp.mul(1.7).add(vec3(t.mul(-0.11), t.mul(0.04), t.mul(0.13))))
      .abs().oneMinus().pow(8.0);
    const web = s1.add(s2).mul(0.7);
    const depth = wp.y.negate();                        // meters below sea level
    // extended fade (95→150 m) so the now-deeper floors still catch caustics
    const mask = tslSmoothstep(0.6, 4.0, depth)
      .mul(tslSmoothstep(150.0, 55.0, depth));
    const glint = web.mul(uCausticAmt).mul(mask);
    // Per-pixel albedo BREAK-UP (v2's fbmTex look): two octaves of MaterialX
    // noise in the horizontal plane modulate the vertex colour, so rock and
    // meadow carry texture between the 3.2 m vertices instead of smearing.
    // Purely multiplicative around 1.0 — no slope/normal reads (those washed
    // out the terrain in earlier attempts), so it is safe on every planet.
    const tp = vec3(wp.x, 0.0, wp.z);
    const tex1 = mx_noise_float(tp.mul(0.021));
    const tex2 = mx_noise_float(tp.mul(0.115));
    const texAmt = tex1.mul(0.30).add(tex2.mul(0.18)).add(1.0);
    mat.colorNode = vcol.mul(texAmt).mul(glint.add(1.0)).add(glint.mul(0.10));

    // ── per-pixel DETAIL NORMAL: real MaterialX noise (not sine products) fed
    // through bumpMap, so light catches micro-relief the low-res clipmap geometry
    // can't carry. Three octaves for grain at ~4 m / 1.5 m / 0.5 m features.
    // CRITICAL: sample in the HORIZONTAL plane (xz) only. Including world Y made
    // the bump gradient blow up on steep faces (height changes fast per screen
    // pixel there), producing the large dark blotches on the mountains. XZ-only
    // keeps it a stable ground-detail pattern regardless of slope.
    const np = vec3(wp.x, 0.0, wp.z).mul(0.26);
    const nDetail = mx_noise_float(np)
      .add(mx_noise_float(np.mul(2.7)).mul(0.5))
      .add(mx_noise_float(np.mul(6.9)).mul(0.25));
    mat.normalNode = bumpMap(nDetail, uniform(0.4));

    // ── VULKAR lava (v4's molten-crust branch, ported to TSL): the flat pans
    // terrainRaw clamps at y=2 glow as dark cooling plates threaded with
    // bright cracks; emissive, so it self-illuminates on the night side and
    // under any sky. Nearby rock catches a pulsing under-glow (v4's cheap
    // "lava is a light source" cue). All gated by uLavaAmt → zero cost off.
    const lp = vec3(wp.x, 0.0, wp.z).mul(0.045);
    const crack = mx_noise_float(lp.mul(2.6).add(vec3(t.mul(0.05), 0.0, t.mul(-0.04))))
      .abs().oneMinus().pow(9.0);
    const plate = mx_noise_float(lp.mul(0.7)).mul(0.5).add(0.5);
    const pulse = plate.mul(12.0).add(t.mul(0.7)).sin().mul(0.19).add(0.81);
    // v4 read: dark cooling plates dominate, the glow lives in THIN cracks
    const melt = vec3(1.35, 0.30, 0.045).mul(crack.mul(1.6).add(0.07)).mul(pulse);
    const lavaMask = tslSmoothstep(4.2, 2.4, wp.y);
    const rimGlow = tslSmoothstep(26.0, 4.0, wp.y).mul(0.20);
    mat.emissiveNode = melt.mul(lavaMask)
      .add(vec3(1.0, 0.24, 0.04).mul(rimGlow).mul(pulse))
      .mul(uLavaAmt);
    return mat;
  } catch (e) {
    console.warn("caustics unavailable — plain terrain material", e);
    return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 });
  }
}

// ── tiled terrain (world-anchored, pooled, budgeted rebuilds) ────────────────
class TileRing {
  // lodSink: coarse far ring — vertices sink below the true surface in
  // proportion to local slope so the low-res mesh can never poke through the
  // fine ring on steep faces (the "low-res patches on mountainsides" artifact).
  constructor(scene, size, seg, radius, yOffset = 0, lodSink = false) {
    this.size = size; this.seg = seg; this.radius = radius; this.yOffset = yOffset;
    this.lodSink = lodSink;
    this.tiles = new Map();
    this.queue = [];
    this.scene = scene;
    this.mat = makeTerrainMaterial();
  }
  makeMesh() {
    const geo = new THREE.BufferGeometry();
    const n = (this.seg + 1) * (this.seg + 1);
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let z = 0; z < this.seg; z++)
      for (let x = 0; x < this.seg; x++) {
        const a = z * (this.seg + 1) + x, b = a + 1, c = a + this.seg + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.frustumCulled = true;
    return mesh;
  }
  build(mesh, ix, iz) {
    const { size, seg } = this;
    const pos = mesh.geometry.attributes.position;
    const nor = mesh.geometry.attributes.normal;
    const col = mesh.geometry.attributes.color;
    const x0 = ix * size, z0 = iz * size, step = size / seg;
    // Heightfield with a 1-cell APRON beyond every tile edge. Normals and
    // slope are central differences over this apron, so they are IDENTICAL
    // on both sides of a tile border — no per-tile lighting seams (the grid
    // of faceted lines computeVertexNormals() produced, since it can't see
    // the neighbouring tile).
    const W = seg + 3;
    const H = new Float32Array(W * W);
    for (let z = -1, k = 0; z <= seg + 1; z++)
      for (let x = -1; x <= seg + 1; x++, k++)
        H[k] = terrainRaw(x0 + x * step, z0 + z * step);
    const cArr = [0, 0, 0];
    for (let z = 0, k = 0; z <= seg; z++)
      for (let x = 0; x <= seg; x++, k++) {
        const a = (z + 1) * W + (x + 1);
        const h = H[a];
        const dx = (H[a + 1] - H[a - 1]) / (2 * step);
        const dz = (H[a + W] - H[a - W]) / (2 * step);
        const inv = 1 / Math.sqrt(1 + dx * dx + dz * dz);
        nor.setXYZ(k, -dx * inv, inv, -dz * inv);
        // coarse-ring sink: proportional to slope so linear-interp error can
        // never rise above the fine ring's surface
        const sink = this.lodSink ? Math.min(14, 0.30 * step * Math.hypot(dx, dz)) : 0;
        pos.setXYZ(k, x0 + x * step, h + this.yOffset - sink, z0 + z * step);
        landColor(cArr, h, inv, x0 + x * step, z0 + z * step);
        col.setXYZ(k, cArr[0], cArr[1], cArr[2]);
      }
    pos.needsUpdate = true; nor.needsUpdate = true; col.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
  update(camX, camZ) {
    const ci = Math.floor(camX / this.size), cz = Math.floor(camZ / this.size);
    const want = new Set();
    for (let dz = -this.radius; dz <= this.radius; dz++)
      for (let dx = -this.radius; dx <= this.radius; dx++)
        want.add((ci + dx) + "," + (cz + dz));
    const free = [];
    for (const [key, mesh] of this.tiles)
      if (!want.has(key)) { this.tiles.delete(key); free.push(mesh); }
    for (const key of want)
      if (!this.tiles.has(key) && !this.queue.includes(key)) this.queue.push(key);
    // cap the catch-up burst so a big backlog can't spike a frame (tiles are
    // ~2× heavier now at seg 80). Steady state stays at 2/frame.
    let budget = this.queue.length > 16 ? 6 : 2;
    while (budget-- > 0 && this.queue.length) {
      const key = this.queue.shift();
      if (this.tiles.has(key)) continue;
      const [ix, iz] = key.split(",").map(Number);
      const mesh = free.pop() || this.makeMesh();
      if (!mesh.parent) this.scene.add(mesh);
      this.build(mesh, ix, iz);
      this.tiles.set(key, mesh);
    }
    for (const mesh of free) { this.scene.remove(mesh); mesh.geometry.dispose(); }
  }
  rebuildAll() {
    for (const [, mesh] of this.tiles) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.tiles.clear(); this.queue.length = 0;
  }
  setVisible(visible) {
    for (const [, mesh] of this.tiles) mesh.visible = visible;
  }
}

// ── AFTERCITY houses — instanced body + pyramid roof, per-lot colours ───────
// (summer-afternoon palette: warm cream/white walls, terracotta roofs)
const HOUSE_WALLS = [[0.93, 0.89, 0.80], [0.88, 0.86, 0.82], [0.90, 0.83, 0.72], [0.82, 0.84, 0.83]];
const HOUSE_ROOFS = [[0.55, 0.28, 0.18], [0.46, 0.24, 0.17], [0.34, 0.26, 0.24], [0.42, 0.33, 0.24]];
class HousePool {
  constructor(scene) {
    this.max = 500;
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    bodyGeo.translate(0, 0.5, 0);
    const roofGeo = new THREE.ConeGeometry(0.78, 1, 4, 1);
    roofGeo.rotateY(Math.PI / 4);       // align pyramid edges with the walls
    roofGeo.translate(0, 0.5, 0);
    this.body = new THREE.InstancedMesh(bodyGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.92 }), this.max);
    this.roof = new THREE.InstancedMesh(roofGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.85 }), this.max);
    // real yard trees: a brown trunk + a rounded green canopy (deciduous look),
    // replacing the old green heightfield lumps that didn't read as trees
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.18, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const canopyGeo = new THREE.IcosahedronGeometry(0.5, 1);
    canopyGeo.scale(1, 1.15, 1); canopyGeo.translate(0, 0.55, 0);
    this.treeN = this.max * 2;
    this.trunk = new THREE.InstancedMesh(trunkGeo,
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 }), this.treeN);
    this.canopy = new THREE.InstancedMesh(canopyGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), this.treeN);
    for (const m of [this.body, this.roof, this.trunk, this.canopy]) {
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.lastKey = "";
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }
  update(active, camX, camZ) {
    for (const m of [this.body, this.roof, this.trunk, this.canopy]) m.visible = active;
    if (!active) { this.lastKey = ""; return; }
    const key = Math.round(camX / 120) + "," + Math.round(camZ / 120);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const land = PLANET.land;
    let n = 0, t = 0;
    const placeTree = (tx, tz, r) => {
      if (t >= this.treeN) return;
      const gy = terrainRaw(tx, tz);
      const h = 3.4 + r * 2.6;                       // 3.4–6 m tall
      const cw = 2.6 + r * 1.8;                      // canopy width
      this.dummy.position.set(tx, gy - 0.1, tz);
      this.dummy.scale.set(0.6, h, 0.6); this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix(); this.trunk.setMatrixAt(t, this.dummy.matrix);
      this.dummy.position.set(tx, gy - 0.1 + h * 0.72, tz);
      this.dummy.scale.set(cw, cw * (0.9 + r * 0.4), cw);
      this.dummy.updateMatrix(); this.canopy.setMatrixAt(t, this.dummy.matrix);
      const g = 0.28 + r * 0.20;
      this.canopy.setColorAt(t, this.color.setRGB(0.10 + r * 0.06, g, 0.07 + r * 0.05));
      t++;
    };
    // WORLD-ANCHORED scan lattice (the v4 rule): the sample grid must snap to
    // fixed world coordinates, not start at the camera — a camera-anchored
    // grid hits each lot at a different point after every 120 m rebuild, so
    // cityLot resolved differently and the whole suburb visibly jumped.
    // Snapped + deduped by lot id, a house is now a pure function of its lot.
    const R = 780, stepX = 54, stepZ = 76;
    const x0 = Math.floor((camX - R) / stepX) * stepX;
    const z0 = Math.floor((camZ - R) / stepZ) * stepZ;
    const seen = new Set();
    for (let wz = z0; wz <= camZ + R && n < this.max; wz += stepZ)
      for (let wx = x0; wx <= camX + R && n < this.max; wx += stepX) {
        const lot = cityLot(wx, wz, land);
        if (!lot) continue;
        const lotKey = lot.lotX + "," + lot.lotZ;
        if (seen.has(lotKey)) continue;
        seen.add(lotKey);
        // jitter derives ONLY from the lot, so it never re-rolls on rebuild
        const jx = (lot.id - 0.5) * 12, jz = (hash12(lot.lotX + 3, lot.lotZ + 9) - 0.5) * 14;
        const hx = wx + jx, hz = wz + jz;
        const gy = terrainRaw(hx, hz);
        // v4-scale homes: real two-story presence instead of garden sheds
        const w = 12 + lot.id * 5, d = 13 + hash12(lot.lotX, lot.lotZ + 1) * 6;
        const wallH = 4.6 + hash12(lot.lotX + 5, lot.lotZ) * 3.4;
        const roofH = 2.6 + hash12(lot.lotX + 2, lot.lotZ + 4) * 1.7;
        const yaw = (lot.id > 0.5 ? 0 : Math.PI / 2) + (lot.id - 0.5) * 0.05;

        this.dummy.position.set(hx, gy - 0.25, hz);
        this.dummy.scale.set(w, wallH, d);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.updateMatrix();
        this.body.setMatrixAt(n, this.dummy.matrix);
        const wc = HOUSE_WALLS[Math.floor(lot.id * 997) % HOUSE_WALLS.length];
        this.body.setColorAt(n, this.color.setRGB(wc[0], wc[1], wc[2]));

        this.dummy.position.set(hx, gy - 0.25 + wallH, hz);
        this.dummy.scale.set(w, roofH, d);   // cone r=0.78 ⇒ slight eave overhang
        this.dummy.updateMatrix();
        this.roof.setMatrixAt(n, this.dummy.matrix);
        const rc = HOUSE_ROOFS[Math.floor(lot.id * 631) % HOUSE_ROOFS.length];
        this.roof.setColorAt(n, this.color.setRGB(rc[0], rc[1], rc[2]));
        n++;

        // yard trees: one front-corner tree per lot, a 2nd out back on some,
        // set clear of the house footprint so canopies don't punch the roof
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        const front = hash12(lot.lotX + 11, lot.lotZ + 5);
        const off1x = -w * 0.62, off1z = d * 0.66;
        placeTree(hx + off1x * cs - off1z * sn, hz + off1x * sn + off1z * cs, front);
        if (hash12(lot.lotX + 4, lot.lotZ + 8) > 0.5) {
          const bk = hash12(lot.lotX + 2, lot.lotZ + 6);
          const off2x = w * 0.6, off2z = -d * 0.6;
          placeTree(hx + off2x * cs - off2z * sn, hz + off2x * sn + off2z * cs, bk);
        }
      }
    this.body.count = n;
    this.roof.count = n;
    this.trunk.count = t;
    this.canopy.count = t;
    this.body.instanceMatrix.needsUpdate = true;
    this.roof.instanceMatrix.needsUpdate = true;
    this.trunk.instanceMatrix.needsUpdate = true;
    this.canopy.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.roof.instanceColor) this.roof.instanceColor.needsUpdate = true;
    if (this.canopy.instanceColor) this.canopy.instanceColor.needsUpdate = true;
  }
}

// ── infinitown model loading (AFTERCITY) ────────────────────────────────────
// Minimal glTF 2.0 reader for the infinitown assets (THREE.GLTFExporter files:
// tight-packed accessors, data-URI buffers/images) — we ship no GLTFLoader in
// the vendored three build, and these files need only a fraction of one.
async function loadGltfModel(url) {
  const j = await (await fetch(url)).json();
  const bufs = j.buffers.map(b => {
    const bin = atob(b.uri.split(",")[1]);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a.buffer;
  });
  const CT = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const acc = (i) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView];
    const T = CT[a.componentType], n = NC[a.type];
    return new T(bufs[bv.buffer], (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
  };
  const texCache = {};
  const texFor = (ti) => {
    if (ti == null) return null;
    if (texCache[ti]) return texCache[ti];
    const src = j.textures[ti].source;
    const t = new THREE.TextureLoader().load(j.images[src].uri);
    t.flipY = false;                       // glTF UV convention
    t.colorSpace = THREE.SRGBColorSpace;
    return (texCache[ti] = t);
  };
  const matCache = {};
  const matFor = (mi) => {
    if (mi == null) return new THREE.MeshStandardMaterial({ roughness: 0.9 });
    if (matCache[mi]) return matCache[mi];
    const m = j.materials[mi], pbr = m.pbrMetallicRoughness || {};
    const mat = new THREE.MeshStandardMaterial({
      map: texFor(pbr.baseColorTexture?.index),
      roughness: pbr.roughnessFactor ?? 0.9,
      metalness: 0,
    });
    if (pbr.baseColorFactor) mat.color.setRGB(...pbr.baseColorFactor.slice(0, 3));
    return (matCache[mi] = mat);
  };
  // walk the node tree collecting {geometry, material, local matrix}
  const parts = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const local = new THREE.Matrix4();
    if (n.matrix) local.fromArray(n.matrix);
    else local.compose(
      new THREE.Vector3(...(n.translation || [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (n.mesh != null)
      for (const p of j.meshes[n.mesh].primitives) {
        if ((p.mode ?? 4) !== 4 || p.attributes.POSITION == null) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(acc(p.attributes.POSITION), 3));
        if (p.attributes.NORMAL != null)
          geo.setAttribute("normal", new THREE.BufferAttribute(acc(p.attributes.NORMAL), 3));
        else geo.computeVertexNormals();
        if (p.attributes.TEXCOORD_0 != null)
          geo.setAttribute("uv", new THREE.BufferAttribute(acc(p.attributes.TEXCOORD_0), 2));
        if (p.indices != null) geo.setIndex(new THREE.BufferAttribute(acc(p.indices), 1));
        geo.computeBoundingBox();
        parts.push({ geo, mat: matFor(p.material), local: world.clone() });
      }
    for (const c of (n.children || [])) walk(c, world);
  };
  for (const ni of j.scenes[j.scene || 0].nodes) walk(ni, new THREE.Matrix4());
  // normalise: recentre XZ, ground the base at y=0, scale footprint → ~13 m
  const bb = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const p of parts) { tmp.copy(p.geo.boundingBox).applyMatrix4(p.local); bb.union(tmp); }
  const sizeX = bb.max.x - bb.min.x, sizeZ = bb.max.z - bb.min.z;
  const s = 13 / Math.max(1e-3, Math.max(sizeX, sizeZ));
  const norm = new THREE.Matrix4().makeScale(s, s, s).multiply(
    new THREE.Matrix4().makeTranslation(
      -(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2));
  for (const p of parts) p.local = norm.clone().multiply(p.local);
  return parts;
}

// Instanced infinitown houses: every (geometry, material) part of every model
// becomes ONE InstancedMesh — ~30 draw calls for the whole suburb. The old
// box HousePool is the silent fallback if the assets fail to load. Streets
// stay painted + empty: the liminal read comes from vacancy, not clutter.
const INFINI_HOUSES = ["house", "house2", "house3", "residence"];
class InfiniHousePool {
  constructor(scene) {
    this.scene = scene;
    this.models = null;          // [{parts:[{im, local}]}]
    this.loading = false;
    this.fallback = new HousePool(scene);
    this.lastKey = "";
    this.max = 130;
    this.dummy = new THREE.Object3D();
    this.m4 = new THREE.Matrix4();
  }
  ensureLoading() {
    if (this.loading) return;
    this.loading = true;
    Promise.all(INFINI_HOUSES.map(n => loadGltfModel(`./infinitown-master/gltf/${n}.gltf`)))
      .then(models => {
        this.models = models.map(parts => ({
          parts: parts.map(p => {
            const im = new THREE.InstancedMesh(p.geo, p.mat, this.max);
            im.count = 0; im.visible = false; im.frustumCulled = false;
            this.scene.add(im);
            return { im, local: p.local };
          }),
        }));
        this.lastKey = "";                     // force a repopulate
        this.fallback.update(false, 0, 0);     // retire the boxes
        console.log("AFTERCITY: infinitown houses online");
      })
      .catch(e => console.warn("infinitown assets failed — box houses stay", e));
  }
  update(active, camX, camZ) {
    if (active) this.ensureLoading();
    if (!this.models) { this.fallback.update(active, camX, camZ); return; }
    for (const m of this.models) for (const pt of m.parts) pt.im.visible = active;
    if (!active) { this.lastKey = ""; return; }
    const key = Math.round(camX / 120) + "," + Math.round(camZ / 120);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const land = PLANET.land;
    const counts = this.models.map(() => 0);
    const R = 720, stepX = 54, stepZ = 76;
    for (let wz = camZ - R; wz <= camZ + R; wz += stepZ)
      for (let wx = camX - R; wx <= camX + R; wx += stepX) {
        const lot = cityLot(wx, wz, land);
        if (!lot) continue;
        const mi = Math.floor(lot.id * 977) % this.models.length;
        if (counts[mi] >= this.max) continue;
        const jx = (lot.id - 0.5) * 12, jz = (hash12(lot.lotX + 3, lot.lotZ + 9) - 0.5) * 14;
        const hx = wx + jx, hz = wz + jz;
        const gy = terrainRaw(hx, hz);
        const scl = 0.9 + lot.id * 0.35;
        this.dummy.position.set(hx, gy - 0.2, hz);
        this.dummy.rotation.set(0, (lot.id > 0.5 ? 0 : Math.PI / 2) + (lot.id - 0.5) * 0.06, 0);
        this.dummy.scale.setScalar(scl);
        this.dummy.updateMatrix();
        const n = counts[mi]++;
        for (const pt of this.models[mi].parts) {
          this.m4.multiplyMatrices(this.dummy.matrix, pt.local);
          pt.im.setMatrixAt(n, this.m4);
        }
      }
    this.models.forEach((m, mi) => {
      for (const pt of m.parts) {
        pt.im.count = counts[mi];
        pt.im.instanceMatrix.needsUpdate = true;
      }
    });
  }
}

// ── altitude-projected cloud dome (v4 technique, TSL/WebGPU) ────────────────
// A camera-locked sky dome whose fragment shader projects the view ray onto a
// cloud plane at a REAL world altitude (3300 m), so the deck slides past as you
// translate, grows as you climb, and flips to sunlit tops once above it — true
// parallax the painted equirect dome can't give. Ported from v4.html ~1979.
const uCloudTime = uniform(0);
const uCloudHaze = uniform(0.08);
const uCloudDry  = uniform(1);                       // (1-spaceBlend)*dry*!underwater
const uCloudCov  = uniform(0.45);                    // user/planet cloud-cover dial
const uCloudSunDir = uniform(new THREE.Vector3(0, 1, 0));
const uCloudSunCol = uniform(new THREE.Vector3(1, 0.9, 0.75));
const uCloudTint   = uniform(new THREE.Vector3(1, 1, 1));

function makeCloudDome() {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
  });
  // fbm from mx_noise (remap each octave to ~[0,1]); vec2 domain lifted to 3D
  const n2  = (p) => mx_noise_float(vec3(p.x, p.y, 0)).mul(0.5).add(0.5);
  const fbm = (p) => n2(p).mul(0.5)
    .add(n2(p.mul(2.03)).mul(0.25))
    .add(n2(p.mul(4.10)).mul(0.125))
    .add(n2(p.mul(8.20)).mul(0.0625));

  const d = positionWorld.sub(cameraPosition).normalize();
  const camY = cameraPosition.y;
  const camXZ = vec2(cameraPosition.x, cameraPosition.z);
  const dyRaw = d.y;
  const dyAbs = dyRaw.abs();
  const hfade = tslSmoothstep(0.012, 0.055, dyAbs);
  const dy = dyAbs.max(0.012).mul(dyRaw.div(dyAbs.max(0.0001)));   // sign-preserving, off-zero
  const sd = d.dot(uCloudSunDir).max(0.0);

  // ── cumulus deck at 3300 m ──
  const relD = camY.mul(-1).add(3300.0);
  const tD = relD.div(dy);
  const tDp = tD.max(0.0);                                  // clamp so exp() can't blow up
  const front = tslSmoothstep(-0.0001, 0.0001, tD);         // 1 when the deck is ahead
  const cw = vec2(
    camXZ.x.add(d.x.mul(tDp)).mul(0.00058).add(uCloudTime.mul(0.006)),
    camXZ.y.add(d.z.mul(tDp)).mul(0.00058).add(uCloudTime.mul(0.0023)));
  const horFade = tDp.mul(-0.000055).exp();
  const wv2  = fbm(cw.mul(0.20).add(3.7));
  const cN   = fbm(cw.mul(0.34).add(wv2.mul(0.75)));
  const det  = fbm(cw.mul(0.92).add(wv2.mul(0.4)).add(7.0));
  const dens = cN.add(det.mul(0.30));
  const thr  = uCloudHaze.mul(-0.17).add(0.545).sub(uCloudCov.sub(0.45).mul(0.42));
  const cov  = tslSmoothstep(thr, thr.add(0.13), dens).mul(horFade).mul(hfade);
  const base = fbm(cw.mul(0.34).add(wv2.mul(0.75)).sub(0.42));
  const form = dens.sub(base).mul(2.6).add(0.5).clamp(0, 1);
  const belowM = relD.div(440.0).add(0.5).clamp(0, 1);
  const top = uCloudTint.mul(sd.pow(2.0).mul(0.60).add(1.02));
  const bot = uCloudTint.mul(vec3(0.46, 0.50, 0.60)).add(uCloudSunCol.mul(sd.pow(6.0)).mul(0.28));
  const ccUp = bot.mix(top, form.mul(0.65).add(0.35));
  const ccDn = bot.mix(bot.mix(top, float(0.55)), form.mul(0.85));
  const cc = ccUp.mix(ccDn, belowM).mul(form.mul(0.52).add(0.72));
  const edge = tslSmoothstep(thr, thr.add(0.05), dens).sub(tslSmoothstep(thr.add(0.05), thr.add(0.24), dens));
  const cumCol = cc.add(uCloudSunCol.mul(edge).mul(float(0.17).mix(float(0.09), belowM)));
  const cumA = cov.mul(0.94).mul(front);

  // ── high cirrus at 7800 m ──
  const relC = camY.mul(-1).add(7800.0);
  const tC = relC.div(dy);
  const tCp = tC.max(0.0);
  const frontC = tslSmoothstep(-0.0001, 0.0001, tC);
  const cw2 = vec2(
    camXZ.x.add(d.x.mul(tCp)).mul(0.00016).add(uCloudTime.mul(0.012)),
    camXZ.y.add(d.z.mul(tCp)).mul(0.00016).sub(uCloudTime.mul(0.004)));
  const ci = fbm(cw2.mul(vec2(1.0, 2.6)).add(fbm(cw2.mul(0.5)).mul(0.8)));
  const wisp = tslSmoothstep(0.52, 0.80, ci).mul(tCp.mul(-0.00030).exp())
                 .mul(uCloudHaze.mul(0.35).add(0.30)).mul(hfade);
  const cirCol = uCloudTint.mul(sd.pow(3.0).mul(0.35).add(0.96));
  const cirA = wisp.mul(frontC);

  // composite cumulus over cirrus, gated by dry/atmosphere
  const aCir = cirA.mul(uCloudDry).clamp(0, 1);
  const aCum = cumA.mul(uCloudDry).clamp(0, 1);
  mat.colorNode = cirCol.mix(cumCol, aCum.div(aCum.add(aCir.mul(aCum.oneMinus())).max(0.0001)));
  mat.opacityNode = aCum.add(aCir.mul(aCum.oneMinus())).clamp(0, 1);

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(12000, 32, 20), mat);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

// ── atmosphere clouds: soft billboard puffs drifting around the camera ──────
// Cheap (one draw call's worth of sprites, no per-frame texture work) but they
// give the sky real parallax depth the painted equirect deck can't.
// Cumulus texture painted per-pixel: an asymmetric envelope (domed top, flat
// base) eroded by fbm so the edges are ragged, with the vertical light
// gradient BAKED IN — bright cauliflower top, grey-blue shaded underside.
// That baked shading is what makes a flat sprite read as a lit volume.
function makeCloudTexture(seed) {
  const W = 384, H = 192;
  const cnv = document.createElement("canvas");
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const baseY = 0.68;                       // flat cloud base sits here
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const dx = (u - 0.5) * 2.15;
      // asymmetric vertical distance: slow falloff above the base (tall domed
      // top), hard cut just below it (flat underside)
      const dy = v < baseY ? (baseY - v) * 2.4 : (v - baseY) * 7.0;
      const env = clamp(1 - Math.sqrt(dx * dx + dy * dy), 0, 1);
      if (env <= 0) { d[(y * W + x) * 4 + 3] = 0; continue; }
      // cauliflower erosion: domain-warped fbm carves the puffy lobes
      const wv = fbm(u * 3.1 + seed, v * 3.4 - seed, 3);
      const n = fbm(u * 5.5 + wv * 1.3 + seed * 7, v * 6.0 + wv * 1.3 - seed * 3, 4);
      let a = clamp((env * (0.55 + 0.75 * n) - 0.30) * 2.6, 0, 1);
      a = a * a * (3 - 2 * a);
      // baked lighting: white tops → grey-blue base, plus a lobe highlight
      // where the erosion noise crests (sun-kissed cauliflower heads)
      const lit = clamp(1 - v * 1.15, 0, 1);
      const crest = clamp((n - 0.55) * 2.2, 0, 1) * lit;
      const r = 0.62 + 0.34 * lit + 0.10 * crest;
      const g = 0.65 + 0.32 * lit + 0.10 * crest;
      const b = 0.72 + 0.26 * lit + 0.08 * crest;
      const i = (y * W + x) * 4;
      d[i]     = clamp(r * 255, 0, 255);
      d[i + 1] = clamp(g * 255, 0, 255);
      d[i + 2] = clamp(b * 255, 0, 255);
      d[i + 3] = a * 235;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
class CloudField {
  // count = cloud CLUSTERS; each is 2-4 overlapping sprites that drift as one
  // mass — single blobs read as cotton balls, clusters read as weather.
  constructor(scene, count = 11) {
    this.texes = [makeCloudTexture(1.7), makeCloudTexture(4.3), makeCloudTexture(9.1)];
    this.clusters = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      // wider spread → the deck fills the sky like v4 instead of a few blobs
      // overhead. Two height tiers (a main deck + a sparser high layer) give the
      // sky depth the single-height billboard field was missing.
      const r = 900 + Math.random() * 5200;
      // one coherent CUMULUS DECK band at ~2.6–3.3 km (v4's deck altitude, so
      // the climb passes through real masses) — sprites can't tile or seam
      const cl = {
        x: Math.cos(a) * r, z: Math.sin(a) * r,
        y: 2620 + Math.random() * 680,
        driftX: 1.4 + Math.random() * 2.0,
        driftZ: (Math.random() - 0.5) * 1.3,
        parts: [],
      };
      // ── VOLUMETRIC STACK: each cloud is built in three tiers instead of one
      // flat sheet — a wide dark BASE slab, 2-3 mid LOBES with real height, and
      // 1-2 smaller bright TOP caps riding above them. The tiers overlap with
      // vertical structure (~40% of the cloud's width in height), and the
      // update() below drifts upper tiers slightly faster than the base, so
      // parallax inside one cloud sells actual thickness — no duplicated
      // deck planes, just a lit mass with a top, a body, and an underside.
      const w0 = 1000 + Math.random() * 1000;
      const tiers = [
        { n: 1,                                  y: 0,               s: [1.55, 0.30], op: 0.34, drift: 1.00 }, // base slab (shaded underside)
        { n: 2 + Math.floor(Math.random() * 2),  y: w0 * 0.16,       s: [0.85, 0.52], op: 0.40, drift: 1.06 }, // mid lobes (tall, carry the volume)
        { n: 1 + Math.floor(Math.random() * 2),  y: w0 * 0.34,       s: [0.48, 0.42], op: 0.46, drift: 1.13 }, // sunlit caps (cauliflower heads)
      ];
      for (let ti = 0; ti < tiers.length; ti++) {
        const T = tiers[ti];
        for (let p = 0; p < T.n; p++) {
          const mat = new THREE.SpriteMaterial({
            map: this.texes[Math.floor(Math.random() * this.texes.length)],
            transparent: true, opacity: 0.5, depthWrite: false, fog: true });
          const sp = new THREE.Sprite(mat);
          const w = w0 * T.s[0] * (0.8 + Math.random() * 0.4);
          sp.scale.set(w, w0 * T.s[1] * (0.85 + Math.random() * 0.3), 1);
          cl.parts.push({ sp,
            ox: (Math.random() - 0.5) * w0 * (ti === 0 ? 0.3 : 0.85),
            oy: T.y + (Math.random() - 0.5) * w0 * 0.10,
            oz: (Math.random() - 0.5) * w0 * 0.4,
            op: T.op + Math.random() * 0.08,
            tier: ti,                     // 0 base · 1 body · 2 top (shading + parallax)
            drift: T.drift,
            dph: 0 });                    // accumulated extra drift for this tier
          scene.add(sp);
        }
      }
      this.clusters.push(cl);
    }
  }
  update(dt, camX, camZ, camY, hour, spaceBlend, visible, cov = 0.45) {
    const P = skyAt(hour);
    const day = clamp((P.zen[0] + P.zen[1] + P.zen[2]) * 0.9, 0.14, 1.0);
    const fade = clamp(1 - spaceBlend * 2.2, 0, 1);
    const covA = 0.30 + 0.95 * cov;                 // dial scales the whole field
    const show = visible && fade > 0.02 && cov > 0.03;
    // ── two-toned dusk shading (matches the painted sky): sunlit caps take
    // the sun's colour, the base slab cools toward the zenith slate. At noon
    // duskW≈0 and this degrades to the plain white-top/grey-base ramp.
    const el = 62 * Math.sin(Math.PI * (hour - 6) / 12);
    const duskW = clamp(1 - Math.abs(el - 1.5) / 13, 0, 1);
    const lift = 1 + duskW * 0.85;
    const litR = day * lerp(1.02, P.glow[0] * 1.05, duskW * 0.85) * lift;
    const litG = day * lerp(1.03, P.glow[1] * 0.95, duskW * 0.85) * lift;
    const litB = day * lerp(1.06, P.glow[2] * 0.90, duskW * 0.85) * lift;
    // the sprite textures already bake a dark underside — a dark tint on top
    // of that double-darkened the bases into harsh near-black blobs. Keep the
    // shadow tint luminous; the baked gradient supplies the rest.
    const shR = day * (0.62 + (P.mid[0] + P.glow[0] * 0.3) * 0.40);
    const shG = day * (0.65 + (P.mid[1] + P.glow[1] * 0.3) * 0.40);
    const shB = day * (0.72 + (P.mid[2] + P.glow[2] * 0.3) * 0.40);
    // passAmt: how deep the camera sits inside the cloud deck (its clusters span
    // y≈330..760). Exposed so the frame loop can whiten the fog into a soft
    // "passing through cloud" band instead of the camera punching hard sprites.
    // whiteout envelope: the deck now spans ~2.6–3.9 km including the stacked
    // tops, so punching through takes real time — the fog whiteout follows
    this.passAmt = (show ? clamp(1 - Math.abs(camY - 3050) / 780, 0, 1) : 0) * clamp(cov * 2.2, 0, 1);
    const R = 6200;   // matches the wider cluster spread so the deck isn't clipped
    for (const cl of this.clusters) {
      cl.x += cl.driftX * dt;
      cl.z += cl.driftZ * dt;
      if (cl.x - camX >  R) cl.x -= R * 2;
      if (cl.x - camX < -R) cl.x += R * 2;
      if (cl.z - camZ >  R) cl.z -= R * 2;
      if (cl.z - camZ < -R) cl.z += R * 2;
      // horizon fade: far clusters went edge-on at the skyline and their lit
      // rims painted a dashed white line across the horizon — melt them out
      // over the last stretch of the wrap radius instead
      const dxz = Math.hypot(cl.x - camX, cl.z - camZ);
      const dFade = 1 - smoothstep(3700, 5500, dxz);
      for (const pt of cl.parts) {
        // cull, don't just fade: a sprite at 5% opacity still rasterizes its
        // full quad — near-invisible far clusters were pure fill-rate waste
        pt.sp.visible = show && dFade > 0.15;
        if (!pt.sp.visible) continue;
        // intra-cloud parallax: upper tiers drift a touch faster than the base,
        // so the stack shears subtly as you fly past — the depth cue that makes
        // the tiers read as one thick mass instead of stacked cards
        pt.dph += cl.driftX * (pt.drift - 1) * dt;
        pt.sp.position.set(cl.x + pt.ox + pt.dph, cl.y + pt.oy, cl.z + pt.oz);
        // tier shading: shadowed slab under the body, sun-fed caps on top
        const tm = pt.tier === 0 ? 0.38 : pt.tier === 1 ? 0.68 : 1.0;
        pt.sp.material.color.setRGB(
          lerp(shR, litR, tm), lerp(shG, litG, tm), lerp(shB, litB, tm));
        // per-sprite vertical fade: a puff within ~90 m of the camera's height
        // dissolves so you never see a hard billboard card slice past on ascent
        const vGap = Math.abs((cl.y + pt.oy) - camY);
        const vFade = smoothstep(60, 320, vGap);   // big cards dissolve early; the whiteout owns the interior
        pt.sp.material.opacity = pt.op * fade * (0.45 + day * 0.55) * vFade * dFade * covA;
      }
    }
  }
}

// ── v4 cloud decks: horizontal planes anchored at REAL world altitudes ───────
// You climb UP THROUGH them (v4's key ascent feel): grey-blue undersides from
// below, a soft whiteout as you pass through the deck altitude, then sunlit tops
// from above. Each plane follows the camera in XZ (endless deck) and scrolls its
// texture to drift; distance fog melts the far edge into haze (v4's horFade).
function makeCloudDeckTexture(seed, freq, thr, soft) {
  const S = 512;
  const cnv = document.createElement("canvas"); cnv.width = cnv.height = S;
  const ctx = cnv.getContext("2d");
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const wx = u * freq, wy = v * freq;
    const warp = fbm(wx * 0.6 + seed, wy * 0.6 - seed, 3);       // domain warp → billows
    const c = fbm(wx + warp * 0.75 + seed, wy + warp * 0.75, 4);
    const det = fbm(wx * 2.7 + 7, wy * 2.7 - 3, 3);
    const dens = c + det * 0.30;
    let cov = clamp((dens - thr) / soft, 0, 1);
    cov = cov * cov * (3 - 2 * cov);
    const form = clamp((dens - thr) * 3 + 0.4, 0, 1);            // baked cauliflower form
    const lit = 0.70 + 0.55 * form;
    const i = (y * S + x) * 4;
    d[i] = clamp(255 * lit, 0, 255); d[i + 1] = clamp(255 * lit, 0, 255); d[i + 2] = clamp(255 * (lit * 0.98 + 0.02), 0, 255);
    d[i + 3] = cov * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  // anisotropy + mipmaps kill the grazing-angle moiré that read as a dashed
  // line across the horizon where the deck plane goes near edge-on
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
class CloudDeck {
  constructor(scene) {
    const mkPlane = (y, size, tex, rep, baseOp) => {
      tex.repeat.set(rep, rep);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true,
        depthWrite: false, side: THREE.DoubleSide, fog: true, opacity: baseOp,
        vertexColors: true });
      const geo = new THREE.PlaneGeometry(size, size, 24, 24);
      // radial vertex-alpha: fade the deck to nothing toward its rim so the flat
      // plane never shows a hard geometric edge or grazing line at the horizon
      const pos = geo.attributes.position, N = pos.count;
      const cols = new Float32Array(N * 4);
      const half = size / 2;
      for (let i = 0; i < N; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i)) / half;
        // aggressive fade: only the near cloud disk around the camera shows;
        // the far/grazing region (which forms the edge-on horizon line) fades
        // to nothing well before the rim
        const a = 1 - smoothstep(0.16, 0.62, r);
        cols[i * 4] = 1; cols[i * 4 + 1] = 1; cols[i * 4 + 2] = 1; cols[i * 4 + 3] = a;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(cols, 4));
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.renderOrder = -2;
      m.frustumCulled = false;
      scene.add(m);
      return { m, tex, y, baseOp };
    };
    // cumulus deck @ 3300 m (v4's low deck). A second high cirrus plane was
    // dropped — from far below it went edge-on and drew a faint horizon line;
    // the cumulus deck alone carries the full climb-through-cloud experience.
    this.cumulus = mkPlane(3300, 60000, makeCloudDeckTexture(1.7, 9, 0.52, 0.16), 6, 0.92);
    this.decks = [this.cumulus];
    this.passAmt = 0;
  }
  update(dt, camX, camZ, camY, hour, spaceBlend, visible) {
    const P = skyAt(hour);
    const day = clamp((P.zen[0] + P.zen[1] + P.zen[2]) * 0.9, 0.14, 1.0);
    const fade = clamp(1 - (spaceBlend - 0.55) / 0.35, 0, 1);   // gone before space
    const show = visible && fade > 0.01;
    // whiteout envelope while crossing the cumulus deck (drives the fog whiten)
    this.passAmt = show ? clamp(1 - Math.abs(camY - 3300) / 260, 0, 1) : 0;
    for (const deck of this.decks) {
      deck.m.visible = show;
      if (!show) continue;
      deck.m.position.set(camX, deck.y, camZ);
      const spd = 0.0016;
      deck.tex.offset.x = (deck.tex.offset.x + dt * spd) % 1;
      deck.tex.offset.y = (deck.tex.offset.y + dt * spd * 0.4) % 1;
      // sunlit warm tops when above ↔ grey-blue undersides when below, cross-
      // faded across ±260 m so crossing the deck never hard-flips the shading
      const above = clamp((camY - deck.y) / 260 + 0.5, 0, 1);
      const shade = lerp(day * 0.5, day * (0.98 + P.glow[0] * 0.18), above);
      deck.m.material.color.setRGB(
        shade * (0.94 + P.glow[0] * 0.10), shade * (0.95 + P.glow[1] * 0.08), shade * 1.02);
      // fade the plane out within ±260 m of the camera's altitude so its flat
      // sheet never slices the view as a hard edge-on line — the whiteout owns
      // that band instead
      const near = smoothstep(45, 260, Math.abs(camY - deck.y));
      deck.m.material.opacity = deck.baseOp * fade * (0.5 + day * 0.5) * near;
    }
  }
}

// ── crisp night stars: camera-locked Points shell (terrain scene) ───────────
// Painted equirect stars are inherently blurry (one texel ≈ 25 px on screen),
// so the SHARP stars are real 3D points on a far sphere around the camera;
// the painted stars stay dim, feeding the water's reflections with soft glow.
class NightStars {
  constructor(scene, n = 1300) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const R = 11500;
    for (let i = 0; i < n; i++) {
      // upper-hemisphere-biased directions
      let x, y, z, l;
      do { x = Math.random() * 2 - 1; y = Math.random(); z = Math.random() * 2 - 1; l = Math.hypot(x, y, z); }
      while (l < 0.1 || l > 1);
      y = y * 0.96 + 0.04;
      pos[i * 3] = (x / l) * R; pos[i * 3 + 1] = (y / l) * R; pos[i * 3 + 2] = (z / l) * R;
      const m = Math.random();                       // magnitude: many faint, few bright
      const b = 0.22 + m * m * m * 0.68;
      const warm = Math.random();
      col[i * 3] = b * (0.80 + warm * 0.20); col[i * 3 + 1] = b * (0.84 + warm * 0.08); col[i * 3 + 2] = b * (1.0 - warm * 0.18);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.PointsMaterial({ size: 1.35, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.pts = new THREE.Points(geo, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = -3;
    this.pts.visible = false;
    scene.add(this.pts);
  }
  update(camPos, nightAmt, spaceBlend, glowG = 0) {
    // stars wait for the afterglow: while the dusk band still burns (high g)
    // only the brightest hint shows; the field arrives as the sky truly darkens
    const glowDamp = 1 - clamp((glowG - 0.25) / 0.55, 0, 1);
    const a = nightAmt * (1 - clamp(spaceBlend * 1.6, 0, 1)) * glowDamp;
    this.pts.visible = a > 0.02;
    this.mat.opacity = a * 0.9;
    if (this.pts.visible) this.pts.position.copy(camPos);
  }
}

// ── horizon curtain: a camera-centred ring at 26 km (beyond every water/
// terrain tile) that melts the sea→sky seam into the fog colour. The water
// library's far-field wave facets catch the bright twilight sky at grazing
// angles as dashed glints (scene-bisect verified; no exposed setting reaches
// them) — this curtain simply owns that band, like v3's transition haze.
class HorizonVeil {
  constructor(scene) {
    const R = 26000;
    const geo = new THREE.CylinderGeometry(R, R, 1, 96, 10, true);
    const pos = geo.attributes.position, N = pos.count;
    const cols = new Float32Array(N * 4);
    this.azi = new Float32Array(N);            // per-vertex azimuth for sky sampling
    for (let i = 0; i < N; i++) {
      const t = pos.getY(i) + 0.5;              // 0 bottom … 1 top
      // full strength almost to the top (the true-horizon strip lives there),
      // with a soft upper lip melting into open sky
      const a = smoothstep(1.0, 0.93, t) * smoothstep(0.0, 0.12, t);
      cols[i * 4] = 1; cols[i * 4 + 1] = 1; cols[i * 4 + 2] = 1; cols[i * 4 + 3] = a;
      this.azi[i] = Math.atan2(pos.getX(i), pos.getZ(i));
    }
    this.colAttr = new THREE.BufferAttribute(cols, 4);
    geo.setAttribute("color", this.colAttr);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, vertexColors: true,
      side: THREE.BackSide, depthWrite: false, fog: false });
    this.m = new THREE.Mesh(geo, this.mat);
    this.m.renderOrder = 5;
    this.m.frustumCulled = false;
    this.m.visible = false;
    scene.add(this.m);
    this._lastTint = -1;
  }
  update(camX, camY, camZ, waterLvl, fogColor, spaceBlend, submerged, now) {
    const on = waterLvl > -1e5 && !submerged && spaceBlend < 0.6;
    this.m.visible = on;
    if (!on) return;
    // dynamic vertical reach: on a flat world the far water climbs toward EYE
    // level, so the curtain's top must ride just above the camera to cover the
    // true-horizon strip where the grazing glints live; the bottom reaches
    // below sea level so no sightline slips under it.
    const top = Math.max(waterLvl + 300, camY + 70);
    const bottom = waterLvl - (Math.max(camY, 60) * 0.55 + 400);
    this.m.scale.set(1, top - bottom, 1);
    this.m.position.set(camX, (top + bottom) / 2, camZ);
    this.mat.opacity = 1 - clamp(spaceBlend * 1.8, 0, 1);
    // ── the veil IS the sky: tint every column from the painted sky's just-
    // above-horizon row at that column's azimuth, so the curtain reads as the
    // horizon gradient continuing down over the water seam — not a flat band.
    if (now - (this._lastTint || -9) > 0.5) {
      this._lastTint = now;
      const W = skyCanvas.width;
      const row = skyCtx.getImageData(0, Math.floor(skyCanvas.height * 0.478), W, 1).data;
      const cols = this.colAttr.array;
      for (let i = 0; i < this.azi.length; i++) {
        // equirect u ↔ world azimuth (matches three's equirect mapping)
        let u = 0.5 - this.azi[i] / (Math.PI * 2);
        u = ((u % 1) + 1) % 1;
        const px = Math.min(W - 1, Math.floor(u * W)) * 4;
        // canvas bytes are sRGB; vertex colors feed the linear pipeline
        cols[i * 4]     = Math.pow(row[px] / 255, 2.2);
        cols[i * 4 + 1] = Math.pow(row[px + 1] / 255, 2.2);
        cols[i * 4 + 2] = Math.pow(row[px + 2] / 255, 2.2);
      }
      this.colAttr.needsUpdate = true;
      this.mat.color.setRGB(1, 1, 1);
    }
  }
}

// ── night plankton: bioluminescent motes in and just over the water ─────────
// Glowing cyan points in a camera-following tile spanning the top of the water
// column (−14 m … +2 m). Only alive at night near/under water; additive, so
// they read as electric life against the dark sea.
class NightPlankton {
  constructor(scene, n = 900) {
    const box = this.box = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3]     = Math.random() * box;
      pos[i * 3 + 1] = -14 + Math.random() * 16;
      pos[i * 3 + 2] = Math.random() * box;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const cnv = document.createElement("canvas"); cnv.width = cnv.height = 64;
    const c2 = cnv.getContext("2d");
    const g = c2.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(140,255,235,1)");
    g.addColorStop(0.35, "rgba(40,220,255,0.55)");
    g.addColorStop(1, "rgba(0,80,120,0)");
    c2.fillStyle = g; c2.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cnv);
    this.mat = new THREE.PointsMaterial({ map: tex, size: 2.8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, color: 0x9fffe8 });
    this.pts = new THREE.Points(geo, this.mat);
    this.pts.frustumCulled = false;
    this.pts.visible = false;
    scene.add(this.pts);
    // ── bio-glow patches: soft cyan pools of light lying ON the sea surface,
    // so whole stretches of the night ocean luminesce — and diving into one
    // puts you inside the glow with the motes. Flat additive quads, not
    // sprites (sprites always face the camera and would stand up like cards).
    const gcnv = document.createElement("canvas"); gcnv.width = gcnv.height = 128;
    const g2 = gcnv.getContext("2d");
    const gg = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, "rgba(120,255,230,0.9)");
    gg.addColorStop(0.4, "rgba(30,200,235,0.35)");
    gg.addColorStop(1, "rgba(0,60,90,0)");
    g2.fillStyle = gg; g2.fillRect(0, 0, 128, 128);
    const gtex = new THREE.CanvasTexture(gcnv);
    this.patches = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: gtex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const w = 70 + i * 34;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.7), mat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.frustumCulled = false;
      m.visible = false;
      scene.add(m);
      this.patches.push({ m, ox: (i * 73.7) % this.box, oz: (i * 41.3 + 30) % this.box, ph: i * 1.9 });
    }
  }
  update(now, camX, camZ, nightAmt, waterAmt) {
    const on = nightAmt > 0.04 && waterAmt > 0.03;
    this.pts.visible = on;
    for (const pa of this.patches) pa.m.visible = on;
    if (!on) { this.mat.opacity = 0; return; }
    const b = this.box;
    // tile snaps to a world lattice around the camera (stationary motes)
    const tx = Math.floor(camX / b) * b, tz = Math.floor(camZ / b) * b;
    this.pts.position.set(tx, Math.sin(now * 0.3) * 0.4, tz);
    this.mat.opacity = nightAmt * (0.45 + waterAmt * 0.55) * (0.80 + 0.20 * Math.sin(now * 0.9));
    for (const pa of this.patches) {
      pa.m.position.set(tx + pa.ox, 0.4, tz + pa.oz);
      // slow independent breathing so the pools bloom and dim like living light
      pa.m.material.opacity = nightAmt * (0.10 + 0.09 * (0.5 + 0.5 * Math.sin(now * 0.23 + pa.ph)));
    }
  }
}

// ── procedural equirect sky (feeds the water's reflections) ─────────────────
// Hand-authored from sunset photography: each key carries hor (skyline),
// mid (the band a third of the way up — this is where dusk lives: dusty pink
// over amber, the nuance a 2-stop gradient can't make), zen (overhead), glow
// (sun tint) and g (glow strength). Golden hour gets its own keys instead of
// one long lerp from afternoon into night — that lerp was the "muddy" dusk.
const SKY_KEYS = [
  // timings LOCKED to the sun geometry (elevation = 62·sin(π(h−6)/12):
  // sunrise crosses 0° at 6.0, sunset at 18.0) — the old keys ran ~1 h late,
  // so "sunset colours" painted onto a sun already 14° down = mud.
  { t: 0.0,  zen: [0.028, 0.042, 0.092], mid: [0.038, 0.055, 0.105], hor: [0.052, 0.070, 0.122], glow: [0.06, 0.07, 0.12], g: 0.15 },
  { t: 4.9,  zen: [0.030, 0.045, 0.100], mid: [0.055, 0.062, 0.118], hor: [0.150, 0.105, 0.115], glow: [0.45, 0.24, 0.18], g: 0.50 },
  { t: 5.7,  zen: [0.060, 0.090, 0.190], mid: [0.300, 0.235, 0.320], hor: [0.840, 0.470, 0.220], glow: [1.00, 0.55, 0.28], g: 0.92 },
  { t: 6.4,  zen: [0.120, 0.190, 0.380], mid: [0.520, 0.430, 0.470], hor: [0.900, 0.600, 0.340], glow: [1.00, 0.68, 0.38], g: 0.75 },
  { t: 7.5,  zen: [0.180, 0.320, 0.560], mid: [0.460, 0.500, 0.610], hor: [0.760, 0.640, 0.560], glow: [1.00, 0.75, 0.45], g: 0.55 },
  { t: 12.0, zen: [0.230, 0.430, 0.760], mid: [0.440, 0.580, 0.800], hor: [0.700, 0.780, 0.860], glow: [1.00, 0.95, 0.85], g: 0.25 },
  { t: 17.2, zen: [0.160, 0.265, 0.500], mid: [0.560, 0.450, 0.470], hor: [0.900, 0.590, 0.300], glow: [1.00, 0.66, 0.33], g: 0.72 },
  { t: 18.1, zen: [0.085, 0.115, 0.280], mid: [0.500, 0.300, 0.380], hor: [1.000, 0.420, 0.160], glow: [1.00, 0.46, 0.22], g: 1.00 },
  { t: 18.9, zen: [0.040, 0.056, 0.135], mid: [0.190, 0.150, 0.255], hor: [0.480, 0.210, 0.100], glow: [0.80, 0.33, 0.16], g: 0.65 },
  { t: 19.9, zen: [0.032, 0.046, 0.100], mid: [0.055, 0.064, 0.115], hor: [0.130, 0.100, 0.135], glow: [0.26, 0.15, 0.15], g: 0.28 },
  { t: 21.5, zen: [0.028, 0.042, 0.092], mid: [0.038, 0.055, 0.105], hor: [0.052, 0.070, 0.122], glow: [0.06, 0.07, 0.12], g: 0.15 },
  { t: 24.0, zen: [0.028, 0.042, 0.092], mid: [0.038, 0.055, 0.105], hor: [0.052, 0.070, 0.122], glow: [0.06, 0.07, 0.12], g: 0.15 },
];
function skyAt(hour) {
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++)
    if (hour >= SKY_KEYS[i].t && hour <= SKY_KEYS[i + 1].t) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  const t = (hour - a.t) / Math.max(0.001, b.t - a.t);
  const tt = t * t * (3 - 2 * t);
  return { zen: mix3(a.zen, b.zen, tt), mid: mix3(a.mid, b.mid, tt), hor: mix3(a.hor, b.hor, tt), glow: mix3(a.glow, b.glow, tt), g: lerp(a.g, b.g, tt) };
}
function sunAngles(hour) {
  const elevation = 62 * Math.sin(Math.PI * (hour - 6) / 12);
  const azimuth = (hour / 24) * 360 + 180;
  return { elevation, azimuth };
}

const skyCanvas = document.createElement("canvas");
skyCanvas.width = 1024; skyCanvas.height = 512;
const skyCtx = skyCanvas.getContext("2d");
// Row-range painter: paintSky() calls it once for the full canvas (init /
// world jumps); the frame loop repaints PROGRESSIVELY via skySteps() — the
// old all-at-once repaint was a ~100 ms JS stall every few seconds of the
// day cycle, the single biggest hitch in the app.
function paintSkyRows(img, y0, y1, hour, spaceBlend = 0, uw = 0) {
  const P = skyAt(hour);
  const { elevation, azimuth } = sunAngles(hour);
  const W = skyCanvas.width, Hh = skyCanvas.height;
  const d = img.data;
  const sunU = ((azimuth % 360) + 360) % 360 / 360;
  const sunV = 0.5 - (elevation / 180);
  const dim = 1 - spaceBlend * 0.92;   // ascent: atmosphere thins to near-black
  // per-planet sky mood (v4's skyTint): VULKAR reads red-hazed, AETHER golden
  const tint = (PLANET.land && PLANET.land.skyTint) || null;
  // daylight strength (from zenith brightness) so clouds are bright white by day
  // and dark by night, and a cloud tint warmed slightly toward the sun glow.
  // night clouds must go DARK (silhouettes over the stars) — the old 0.16
  // floor kept them pale grey, and their drifting lit edge painted the moving
  // "white line" glitch on the night horizon
  const dayBright = clamp((P.zen[0] + P.zen[1] + P.zen[2]) * 0.85, 0.05, 1.05);
  // ── golden-hour cloud palette: real sunset clouds are TWO-TONED — coral/
  // rose on the sun-fed faces, cool blue-slate in the shadowed bodies — never
  // a grey brightness ramp (the grey ramp was the "muddy" dusk). duskW peaks
  // with the sun near the horizon; duskLift keeps lit faces luminous while
  // the ambient sky dims, exactly like the reference photos.
  const duskW = clamp(1 - Math.abs(elevation - 1.5) / 13, 0, 1);
  const duskLift = 1 + duskW * 0.9;
  const litBase = mix3([0.985, 0.99, 1.0], [P.glow[0], P.glow[1] * 0.92, P.glow[2] * 0.90], duskW * 0.82);
  // shadow bodies stay LUMINOUS grey-violet (photo reference: even the dark
  // cloud bellies at dusk hold light) — the first cut crushed them to near-
  // black, which read muddy/harsh
  const shadeBase = mix3([0.60, 0.63, 0.72], mix3(P.mid, P.glow, 0.30), 0.42);
  // ── night sky: stars + moon(s), deterministic so repaints never shimmer ──
  const nightAmt = clamp(1 - (elevation + 3) / 9, 0, 1);   // full night below −6°
  const starsOn = nightAmt > 0.03;
  const mseed = (PLANET.land && PLANET.land.seed ? PLANET.land.seed[0] : 7);
  const fru = (x) => x - Math.floor(x);
  const moonN = 1 + (Math.floor(Math.abs(mseed * 1.7)) % 3);   // one to THREE moons per planet
  const moons = [];
  for (let mi = 0; mi < moonN; mi++) moons.push({
    u: fru(mseed * 0.317 + mi * 0.41 + 0.13),
    // primary moon rides LOW (v 0.28-0.36 → 25-40° up): photogenic near the
    // horizon and its specular glade stretches long across the water
    // primary moon rides LOW (13–22° up): a low moon lays a long glade down
    // the water — a high moon's glint pools uselessly near the horizon point
    v: (mi === 0 ? 0.375 : 0.20) + (mi === 0 ? 0.055 : 0.09) * fru(mseed * 0.53 + mi * 0.67),
    s: mi === 0 ? 2900 : mi === 1 ? 12000 : 22000,         // primary LARGE, companions smaller
    br: mi === 0 ? 1.55 : mi === 1 ? 0.6 : 0.4,
  });
  const cloudDrift = hour * 0.7;       // slow march across the day
  // smooth altitude fade (0.55→0.9) instead of a hard cutoff, so the painted
  // clouds — and their water reflections — don't pop off on the climb
  // seen from UNDER the water, the painted cumulus turns into marbled grey
  // shapes through the surface (the screenshot bug) — the submerged sky keeps
  // its gradient + sun but drops the cloud paint entirely
  const cloudFade = clamp(1 - (spaceBlend - 0.55) / 0.35, 0, 1) * clamp(1 - uw, 0, 1);
  const cloudsOn = cloudFade > 0.01;
  for (let y = y0; y < y1; y++) {
    const v = y / (Hh - 1);
    const upness = clamp(1 - v * 2, -1, 1);
    // 3-stop gradient: hor → mid → zen. The mid band (dusty pink riding over
    // the amber skyline at dusk, pale blue by day) is the nuance the photos
    // carry and a 2-stop lerp cannot — colour TEMPERATURE changes with
    // altitude, not just brightness. This is what un-muddies golden hour.
    let base;
    if (upness >= 0) {
      const a1 = smoothstep(0.0, 0.22, upness);
      const b1 = smoothstep(0.18, 0.74, Math.pow(upness, 0.85));
      base = mix3(mix3(P.hor, P.mid, a1), P.zen, b1);
    } else {
      // BELOW-horizon rows are what the dome shows in coastline gaps and what
      // grazing water reflects. Every version that put ANY bright strip here
      // became "the horizon band" bug (linear falloff, 12% lip, 3.5% hairline
      // — all read as a colored stripe in some light). FLAT sea-mirror, no
      // vertical structure at all — but its brightness follows DAYLIGHT: a
      // midday sea nearly matches the bright sky (a dark mirror drew a dark
      // line across the noon horizon), while a dusk/night sea goes dark so
      // no glowing band can ever form against the sunset.
      const mirrorF = 0.28 + 0.34 * clamp((dayBright - 0.3) / 0.7, 0, 1);
      base = [P.hor[0] * mirrorF, P.hor[1] * (mirrorF + 0.03), P.hor[2] * (mirrorF + 0.07)];
    }
    // horizon haze band (v3 mood): warm the low sky toward the sun glow near the
    // skyline for richer atmospheric depth — strong at sunrise/sunset (high P.g),
    // subtle at midday. Fades to nothing well above the horizon.
    // dayGate: 1 while the sky is genuinely bright (the approved golden hour),
    // 0 in deep twilight/dawn — the arch and the bright haze band only belong
    // to a lit sky; on a dark one they painted muddy maroon + the thin bright
    // horizon band whose wave-broken reflection was the dashed white line.
    const dayGate = clamp((P.zen[0] + P.zen[1] + P.zen[2]) * 2.4 - 0.22, 0, 1);
    if (upness > -0.12) {
      // THE dashed-horizon-line bug lived here: Math.max(upness, 0) clamped
      // the falloff to FULL strength for every row just below the horizon —
      // an 8-px bright stripe under the horizon of the equirect. Distant
      // terrain/waves occluded it intermittently → the "dashed white line".
      // belowFade melts the glow smoothly below the horizon instead.
      const belowFade = smoothstep(-0.10, 0.02, upness);
      const hazeBand = Math.exp(-Math.max(upness, 0) * Math.max(upness, 0) * 24) * belowFade;
      const hazeCol = mix3(P.hor, P.glow, 0.32);
      // hide-test forensics: the dashed line = the WATER's grazing reflection
      // of this very band, wave-chopped into dashes. On a bright sky the
      // reflected band reads as a proper sunset horizon (keep it); on a dark
      // twilight sky it must go to nearly nothing — dayGate² floor ~0.04.
      base = mix3(base, hazeCol, hazeBand * (0.16 + 0.36 * P.g) * (0.04 + 0.96 * dayGate * dayGate));
    }
    // anti-twilight arch: golden hour only (dayGate) — the painterly layer
    // real dusks have; never painted onto an already-dark sky
    if (P.g > 0.35 && upness > 0.04) {
      const rose = Math.exp(-Math.pow((upness - 0.24) / 0.16, 2)) * (P.g - 0.35) * 0.5 * dayGate;
      base = mix3(base, [0.66, 0.32, 0.44], rose);
    }
    // cloud vertical envelope: a deck that lives low-to-mid sky and fades to
    // ZERO before the zenith — equirect pinches at the pole, so any cloud near
    // the top smears into radial "rays". Keep it in the upness 0.05..0.5 band.
    const cloudBand = cloudsOn && upness > 0.065
      ? smoothstep(0.07, 0.20, upness) * (1 - smoothstep(0.42, 0.80, upness))
      : 0;
    for (let x = 0; x < W; x++) {
      let du = Math.abs(x / W - sunU); du = Math.min(du, 1 - du);
      const dv = Math.abs(v - sunV);
      // Small crisp disc + a modest corona (v2's sun is a tight ~5° disc, not a
      // sky-filling glow). Raise the first pair to shrink the disc, the second
      // pair to shrink the halo. Lower them if you want a bigger sun.
      const sg = Math.exp(-(du * du * 3200 + dv * dv * 1800)) * P.g
               + Math.exp(-(du * du * 240  + dv * dv * 150))  * P.g * 0.28;
      // per-pixel colour (copy the row's sky base so cloud writes don't leak
      // into the next pixel's gradient)
      let pr = base[0], pg = base[1], pb = base[2];
      // ── stars + moons: painted BEFORE the clouds so cloud cover occludes
      // them naturally. Star field is a pure hash of the pixel — identical on
      // every repaint, so nothing twinkles or crawls.
      if (starsOn && upness > -0.02) {
        // ── cell stars: each 6-px cell may own ONE star with its own position,
        // radius, brightness and warm/cool tint — round multi-pixel points with
        // magnitude variety instead of the old 1-px threshold grit. A tilted
        // MILKY WAY band raises density and brightness along its arc.
        const cs = 6;
        const cxs = Math.floor(x / cs), cys = Math.floor(y / cs);
        const mwCenter = 0.30 + 0.13 * Math.sin((x / W) * Math.PI * 2 + mseed);
        const mwD = (v - mwCenter) / 0.10;
        const mw = Math.exp(-mwD * mwD);
        const h0 = hash12(cxs * 12.9898 + mseed, cys * 78.233);
        if (h0 > 0.915 - mw * 0.075) {
          const px = (cxs + 0.25 + 0.5 * hash12(cxs + 7.1, cys + 3.3)) * cs;
          const py = (cys + 0.25 + 0.5 * hash12(cxs - 4.7, cys + 9.2)) * cs;
          const ddx = x + 0.5 - px, ddy = y + 0.5 - py;
          const h1 = hash12(cxs * 3.7, cys * 1.9);
          const rad = 0.42 + h1 * h1 * 0.75;             // sub-pixel points; only the rare bright ones bloom past 1 px
          const g = Math.exp(-(ddx * ddx + ddy * ddy) / (rad * rad));
          const bri = (0.26 + 0.74 * h1 * h1) * (0.55 + mw * 0.45) * 0.22
                    * (1 - clamp((P.g - 0.25) / 0.55, 0, 1));
          const sAmt = nightAmt * clamp(upness * 3 + 0.4, 0, 1) * g * bri;
          const warm = hash12(cxs + 57, cys + 91);
          pr += sAmt * (0.78 + warm * 0.28);
          pg += sAmt * (0.82 + warm * 0.10);
          pb += sAmt * (1.02 - warm * 0.24);
        }
        // the band itself: a faint cool nebular glow along the arc
        const mwGlow = mw * nightAmt * clamp(upness * 2.4 + 0.3, 0, 1) * 0.045
                     * (1 - clamp((P.g - 0.25) / 0.55, 0, 1));
        pr += mwGlow * 1.05; pg += mwGlow * 1.0; pb += mwGlow * 1.4;
        for (const mo of moons) {
          let mdu = Math.abs(x / W - mo.u); mdu = Math.min(mdu, 1 - mdu);
          const mdv = Math.abs(v - mo.v);
          // 4× on du² corrects the 2:1 equirect aspect → round discs
          const disc = Math.exp(-(mdu * mdu * mo.s * 4.2 + mdv * mdv * mo.s));
          const halo = Math.exp(-(mdu * mdu * mo.s * 0.55 + mdv * mdv * mo.s * 0.13)) * 0.26;
          const mb = (Math.min(disc, 1) * 1.05 + halo) * mo.br * nightAmt;
          pr += 0.86 * mb; pg += 0.88 * mb; pb += 0.95 * mb;
        }
      }
      // ── clouds (v2 parity): wrap-safe cylinder coords, domain-warped fbm,
      // darker undersides. Painted into the sky so they reflect in the water. ──
      if (cloudBand > 0.001) {
        const lon = (x / W) * Math.PI * 2;
        // project onto the cloud plane like v2 (d.xz / y): the 1/upness term is
        // what makes the noise vary with LATITUDE too — without it every pixel
        // in a column shared one value and painted vertical rays.
        const proj = 1.7 / Math.max(upness, 0.06);
        const cx = Math.sin(lon) * proj + cloudDrift * 0.03;
        const cz = Math.cos(lon) * proj + cloudDrift * 0.012;
        const wv = fbm(cx * 0.22, cz * 0.22, 3);                         // warp
        const cN = fbm(cx * 0.35 + wv * 0.7, cz * 0.35 + wv * 0.7, 4);   // billows
        // coverage dial: 0 → sparse wisps barely form; 0.45 → the old look;
        // 1 → heavy overcast, most of the sky claimed by cloud
        const cc = S.cloudCov !== undefined ? S.cloudCov : 0.45;
        const lo = 0.62 - 0.50 * cc, hi = lo + 0.26 - 0.10 * cc;
        const cov = smoothstep(lo, hi, cN) * cloudBand * cloudFade * smoothstep(0.02, 0.10, cc);
        if (cov > 0.001) {
          const under = fbm(cx * 1.5 + wv * 0.7 - 0.35, cz * 1.5 + wv * 0.7 - 0.35, 3);
          const f = clamp((cN - under) * 3 + 0.5, 0, 1);      // 1 = sun-fed face
          // clouds nearer the sun's azimuth blush hardest (photo behaviour)
          const sunProx = Math.exp(-du * du * 30);
          const warmB = 1 + sunProx * duskW * 0.75;
          const lum = dayBright * (0.80 + 0.20 * f) * duskLift;
          const cr = lerp(shadeBase[0], litBase[0] * warmB, f) * lum + P.glow[0] * sg * 0.5;
          const cg = lerp(shadeBase[1], litBase[1] * (1 + sunProx * duskW * 0.30), f) * lum + P.glow[1] * sg * 0.5;
          const cb = lerp(shadeBase[2], litBase[2], f) * lum + P.glow[2] * sg * 0.5;
          const m = cov * 0.9;
          pr = lerp(pr, cr, m); pg = lerp(pg, cg, m); pb = lerp(pb, cb, m);
        }
      }
      const i = (y * W + x) * 4;
      // when the sun sits at/below the horizon, its painted disc lands in the
      // BELOW-horizon rows — sky no eye ever sees directly, but tilted wave
      // facets reflect it: the twilight "dashed glints" arc on the far water.
      // Mask the glow out of the below-horizon rows whenever the sun is low.
      const sgm = elevation < 2 && upness < 0 ? Math.max(0, 1 + upness * 14) : 1;
      let or_ = pr * dim + P.glow[0] * sg * sgm;
      let og_ = pg * dim + P.glow[1] * sg * sgm;
      let ob_ = pb * dim + P.glow[2] * sg * sgm;
      if (tint) { or_ *= tint[0]; og_ *= tint[1]; ob_ *= tint[2]; }
      d[i]     = clamp(or_ * 255, 0, 255);
      d[i + 1] = clamp(og_ * 255, 0, 255);
      d[i + 2] = clamp(ob_ * 255, 0, 255);
      d[i + 3] = 255;
    }
  }
}
function paintSky(hour, spaceBlend = 0) {
  const img = skyCtx.createImageData(skyCanvas.width, skyCanvas.height);
  paintSkyRows(img, 0, skyCanvas.height, hour, spaceBlend);
  skyCtx.putImageData(img, 0, 0);
}
// progressive repaint job: ~28 rows/frame ≈ 2 ms — finishes in ~0.3 s,
// invisible on the slow day cycle, zero frame spikes
let skyJob = null;
function startSkyRepaint(hour, spaceBlend, uw = 0) {
  skyJob = { hour, spaceBlend, uw, y: 0,
             img: skyCtx.createImageData(skyCanvas.width, skyCanvas.height) };
}
function stepSkyRepaint(rows = 28) {
  if (!skyJob) return false;
  const y1 = Math.min(skyCanvas.height, skyJob.y + rows);
  paintSkyRows(skyJob.img, skyJob.y, y1, skyJob.hour, skyJob.spaceBlend, skyJob.uw);
  skyJob.y = y1;
  if (y1 >= skyCanvas.height) {
    skyCtx.putImageData(skyJob.img, 0, 0);
    skyJob = null;
    return true;   // canvas updated — caller flips texture.needsUpdate
  }
  return false;
}

// ── flight state ─────────────────────────────────────────────────────────────
let PLANET = HOME;
const S = {
  x: 0, z: 0, camY: 60, hdg: 0.9, yawVel: 0, pitch: 0, roll: 0,
  speed: 26, effSpd: 0, altitude: 60, hour: 15.4, auto: true,
  cycle: true, zen: false, hold: false,
  thrustHold: 0, thrust: 0, lastInput: 0,
  haze: 0.05, cloudCov: 0.45, density: 0.5, drift: 0.4, tone: 0.6, reverb: 0.65,
  wind: 0.5, level: 0.75, melody: 0.55, musicMode: "auto",
  underwater: 0, waterProx: 0, spaceBlend: 0, warpAmt: 0,
  // space regime
  mode: "terrain", sys: [0, 0, 0], vpitch: 0, warping: false,
  navTarget: null, launchGrace: 0, spaceVel: 0, _tgtName: null,
  // lock screen: the sim is frozen and input is ignored until Begin Flight is
  // clicked (matches v3 — the intro is a still poster, not a live playground)
  started: false,
};
const keys = {};
let dragging = false, dragX0 = 0, dragY0 = 0, dragDX = 0, dragDY = 0;
window.__A = { S, keys, terrainRaw, SYS, get water() { return water; }, setSeed: s => { SEED = s; } };
const music = createMusicEngine({
  state: S,
  onChord: chord => {
    const el = document.getElementById("chord");
    if (el) el.innerHTML = "<b>" + chord.label + "</b> · " + chord.mode;
  },
});

function findSpawn() {
  if (PLANET.land.waterLvl <= -1e5) { S.camY = 160; S.altitude = 160; return; }
  let best = null;
  for (let gx = -30; gx <= 30; gx++)
    for (let gz = -30; gz <= 30; gz++) {
      const x = gx * 200, z = gz * 200;
      const h = terrainRaw(x, z);
      if (h < -20) {
        let landNear = 0;
        for (let a = 0; a < 6; a++)
          if (terrainRaw(x + Math.cos(a) * 900, z + Math.sin(a) * 900) > 6) landNear++;
        const score = landNear * 10 - Math.abs(h + 45);
        if (!best || score > best.score) best = { x, z, score };
      }
    }
  if (best) { S.x = best.x; S.z = best.z; }
  S.camY = 40; S.altitude = 40;
}

// ── toast / HUD text helpers ─────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3400);
}
function fmtKm(km) {
  if (km < 1000) return Math.round(km) + " KM";
  if (km < 1e6) return (km / 1000).toFixed(1) + " MM";
  return (km / 1e6).toFixed(2) + " GM";
}

// ── space regime (isolated: its own scene + render path) ────────────────────
let spaceScene = null, spaceRig = null, sunGlow = null, nearStars = null, warpStreaks = null;

// black screen bridge over every scene handoff (atmosphere⇄space⇄city):
// set to 1 at the switch, decays in the frame loop. The terrain loop also
// pins it to the climb so the final approach to HANDOFF_UP fades to black
// BEFORE the scene swap instead of popping between skies.
// starts at 1: the very first frames reveal the world through a ~2 s ease
// from black (the boot crossfade), instead of the scene popping in fully lit
let screenFade = 1;
const screenFadeEl = document.getElementById("space-fade");
const thrustGlowEl = document.getElementById("thrust-glow");
const warpGradeEl = document.getElementById("warp-grade");
function driveScreenFade(dt, climb = 0) {
  // slower decay → the reveal on the far side of the handoff eases in gently
  // instead of snapping back from black
  screenFade = Math.max(0, screenFade - dt / 2.0);
  const v = Math.max(screenFade, climb);
  if (screenFadeEl) screenFadeEl.style.opacity = v < 0.005 ? "0" : v.toFixed(3);
}

// procedural equirect planet skin: latitude bands + fbm continents in the
// body's own a/b palette — flat lambert balls read as "bad placeholder"
function makePlanetTexture(b) {
  const W = 1024, H = 512;
  const cnv = document.createElement("canvas");
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const s0 = (b.land?.seed?.[0] || 7) * 0.13, s1 = (b.land?.seed?.[1] || 3) * 0.17;
  for (let y = 0; y < H; y++) {
    const lat = y / (H - 1);
    // TRUE spherical sampling: noise is read at the 3D point on the unit
    // sphere (collapsed to 2 dims via two projections), so features shrink
    // correctly toward the poles instead of smearing into streaks — the old
    // cylinder + lat-shear mapping was the "messed up" look on every planet.
    const phi = (lat - 0.5) * Math.PI;
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const lon = u * Math.PI * 2;
      const px3 = Math.sin(lon) * cphi, py3 = sphi, pz3 = Math.cos(lon) * cphi;
      // lower frequency → BIGGER, fewer continents that read cleanly from orbit
      // (the old ×2.0 made a busy, noisy speckle that looked "not scaled right")
      const nx = px3 * 1.25 + py3 * 0.95 + s0;
      const nz = pz3 * 1.25 - py3 * 0.72 + s1;
      // continents: thresholded fbm gives a crisp coastline (sea a → land b)
      const cont = fbm(nx, nz, 5);
      const land = smoothstep(0.46, 0.55, cont);
      // darker seas + stronger land relief so continents read from orbit
      const detail = 0.58 + 0.85 * fbm(nx * 2.3 + 11, nz * 2.3 + py3 * 2.0, 4);
      const seaShade = 0.45 + 0.35 * smoothstep(0.20, 0.45, cont);
      let r = lerp(b.a[0] * seaShade, b.b[0] * detail, land);
      let g = lerp(b.a[1] * seaShade, b.b[1] * detail, land);
      let bl = lerp(b.a[2] * seaShade, b.b[2] * detail, land);
      // shallow-sea brightening around the coasts for a bit of depth
      const shelf = smoothstep(0.38, 0.45, cont) * (1 - land);
      r = lerp(r, b.a[0] * 1.5 + 0.05, shelf * 0.5);
      g = lerp(g, b.a[1] * 1.5 + 0.06, shelf * 0.5);
      bl = lerp(bl, b.a[2] * 1.5 + 0.09, shelf * 0.5);
      // v4 climate bands: warm-tinted equator → cool-tinted poles, on land only
      const clim = smoothstep(0.25, 0.85, Math.abs(py3));   // 0 equator → 1 pole
      const cwR = lerp(1.06, 0.86, clim), cwG = lerp(1.0, 0.95, clim), cwB = lerp(0.88, 1.12, clim);
      r = lerp(r, r * cwR, land); g = lerp(g, g * cwG, land); bl = lerp(bl, bl * cwB, land);
      // cloud swirls: zonally sheared spherical noise — reads as weather bands
      const shear = lon + py3 * 2.6;
      const cnx = Math.sin(shear) * cphi * 2.4 + s0 * 1.7;
      const cnz = Math.cos(shear) * cphi * 2.4 - s1 * 1.3;
      const cloud = smoothstep(0.54, 0.80, fbm(cnx + py3 * 1.4, cnz - py3 * 1.1, 4));
      // faint only — real clouds now live on a separate rotating shell above
      const cf = cloud * (0.55 + 0.45 * Math.sin(lat * Math.PI * 6.0)) * 0.16;
      r = lerp(r, 0.95, cf); g = lerp(g, 0.96, cf); bl = lerp(bl, 0.98, cf);
      // polar ice caps with a noisy edge
      const polar = smoothstep(0.78, 0.94, Math.abs(lat - 0.5) * 2 + (cont - 0.5) * 0.12);
      r = lerp(r, 0.86, polar * 0.6); g = lerp(g, 0.89, polar * 0.6); bl = lerp(bl, 0.95, polar * 0.6);
      const i = (y * W + x) * 4;
      d[i] = clamp(r * 255, 0, 255); d[i + 1] = clamp(g * 255, 0, 255); d[i + 2] = clamp(bl * 255, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// VULKAR — volcanic world. Returns { map, emissive }: dark basalt crust laced
// with glowing lava rivers and molten basins. The emissive map self-illuminates
// the lava so it glows on the planet's NIGHT side too (the key "molten" cue —
// space uses no bloom, so self-lit emissive is what sells the heat).
function makeLavaTexture(b) {
  const W = 1024, H = 512;
  const cnv = document.createElement("canvas"); cnv.width = W; cnv.height = H;
  const ecnv = document.createElement("canvas"); ecnv.width = W; ecnv.height = H;
  const ctx = cnv.getContext("2d"), ectx = ecnv.getContext("2d");
  const img = ctx.createImageData(W, H), em = ectx.createImageData(W, H);
  const d = img.data, e = em.data;
  const s0 = (b.land?.seed?.[0] || 4) * 0.11 + 2.0, s1 = (b.land?.seed?.[1] || 8) * 0.13 - 3.0;
  for (let y = 0; y < H; y++) {
    const lat = y / (H - 1), phi = (lat - 0.5) * Math.PI;
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const px3 = Math.sin(lon) * cphi, py3 = sphi, pz3 = Math.cos(lon) * cphi;
      const nx = px3 * 1.5 + py3 * 0.8 + s0, nz = pz3 * 1.5 - py3 * 0.6 + s1;
      const elev = fbm(nx, nz, 5);
      // lava veins: ridged cracks powered into thin bright rivers
      const v1 = vnoise(nx * 2.2 + 5, nz * 2.2 - 3);
      const v2 = vnoise(nx * 4.1 - 7, nz * 4.1 + 9);
      let crack = Math.pow(1 - Math.abs(2 * v1 - 1), 8) * (0.6 + 0.4 * (1 - Math.abs(2 * v2 - 1)));
      const basin = smoothstep(0.52, 0.36, elev);        // low areas → molten pools
      let heat = clamp(basin * 0.9 + crack * 1.5, 0, 1);
      heat *= 0.55 + 0.65 * fbm(nx * 3.0 + 20, nz * 3.0, 3);   // patchy flicker
      heat = clamp(heat, 0, 1);
      const grain = 0.5 + 0.5 * fbm(nx * 3.5, nz * 3.5, 3);
      let r = 0.08 + 0.06 * grain, g = 0.055 + 0.035 * grain, bl = 0.05 + 0.025 * grain;
      // molten ramp: deep red → orange → yellow-white as heat climbs
      const lr = lerp(0.55, 1.0, heat), lg = lerp(0.09, 0.85, heat * heat), lb = lerp(0.02, 0.38, heat * heat * heat);
      r = lerp(r, lr, heat); g = lerp(g, lg, heat); bl = lerp(bl, lb, heat);
      const i = (y * W + x) * 4;
      d[i] = clamp(r * 255, 0, 255); d[i + 1] = clamp(g * 255, 0, 255); d[i + 2] = clamp(bl * 255, 0, 255); d[i + 3] = 255;
      const eh = heat * heat;      // sharpen: only the hottest lava emits
      e[i] = clamp(lerp(0.45, 1.0, heat) * eh * 255, 0, 255);
      e[i + 1] = clamp(lerp(0.07, 0.7, heat) * eh * 255, 0, 255);
      e[i + 2] = clamp(lerp(0.0, 0.22, heat) * eh * 255, 0, 255);
      e[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); ectx.putImageData(em, 0, 0);
  const map = new THREE.CanvasTexture(cnv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const emis = new THREE.CanvasTexture(ecnv); emis.colorSpace = THREE.SRGBColorSpace; emis.anisotropy = 8;
  return { map, emissive: emis };
}

// AETHER — a luminous cloud-sea world. Teal→violet body swirled with bright
// cyan-white ribbons that softly self-illuminate (dreamy, always-glowing) plus
// aurora-lit poles. Returns { map, emissive }.
function makeAetherTexture(b) {
  const W = 1024, H = 512;
  const cnv = document.createElement("canvas"); cnv.width = W; cnv.height = H;
  const ecnv = document.createElement("canvas"); ecnv.width = W; ecnv.height = H;
  const ctx = cnv.getContext("2d"), ectx = ecnv.getContext("2d");
  const img = ctx.createImageData(W, H), em = ectx.createImageData(W, H);
  const d = img.data, e = em.data;
  const s0 = (b.land?.seed?.[0] || 3) * 0.17 + 1.3, s1 = (b.land?.seed?.[1] || 6) * 0.12 - 2.4;
  for (let y = 0; y < H; y++) {
    const lat = y / (H - 1), phi = (lat - 0.5) * Math.PI;
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const py3 = sphi;
      // zonally sheared spherical noise → banded swirls
      const shear = lon + py3 * 2.4;
      const cnx = Math.sin(shear) * cphi * 2.2 + s0, cnz = Math.cos(shear) * cphi * 2.2 + s1;
      const warp = fbm(cnx * 0.7, cnz * 0.7, 3);
      const band = fbm(cnx * 1.2 + warp, cnz * 1.2 + warp * 0.8 + py3 * 1.0, 4);
      const t = smoothstep(0.40, 0.62, band);
      let r = lerp(b.a[0], b.b[0], t), g = lerp(b.a[1], b.b[1], t), bl = lerp(b.a[2], b.b[2], t);
      // luminous cloud-sea ribbons
      const streak = smoothstep(0.64, 0.86, fbm(cnx * 1.6 + warp * 1.2, cnz * 1.6 - py3 * 1.3, 4));
      const glow = streak * (0.55 + 0.45 * Math.sin(lat * Math.PI * 4));
      r = lerp(r, 0.72, glow * 0.7); g = lerp(g, 0.95, glow * 0.7); bl = lerp(bl, 1.0, glow * 0.7);
      // aurora-lit poles
      const polar = smoothstep(0.72, 0.96, Math.abs(lat - 0.5) * 2);
      r = lerp(r, 0.55, polar * 0.4); g = lerp(g, 0.92, polar * 0.5); bl = lerp(bl, 0.98, polar * 0.5);
      const i = (y * W + x) * 4;
      d[i] = clamp(r * 255, 0, 255); d[i + 1] = clamp(g * 255, 0, 255); d[i + 2] = clamp(bl * 255, 0, 255); d[i + 3] = 255;
      const eh = clamp(glow * 0.85 + polar * 0.55, 0, 1);
      e[i] = clamp((0.32 + 0.28 * t) * eh * 255, 0, 255);
      e[i + 1] = clamp(0.86 * eh * 255, 0, 255);
      e[i + 2] = clamp(1.0 * eh * 255, 0, 255);
      e[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); ectx.putImageData(em, 0, 0);
  const map = new THREE.CanvasTexture(cnv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const emis = new THREE.CanvasTexture(ecnv); emis.colorSpace = THREE.SRGBColorSpace; emis.anisotropy = 8;
  return { map, emissive: emis };
}

// Separate ATMOSPHERIC cloud layer (white puffs on transparent) for a second
// sphere just above the surface. Giving clouds their own rotating shell reads
// far more like a real planet than clouds baked flat into the surface.
function makePlanetCloudTexture(b) {
  const W = 1024, H = 512;
  const cnv = document.createElement("canvas");
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const s0 = (b.land?.seed?.[0] || 5) * 0.19 + 3.3, s1 = (b.land?.seed?.[1] || 2) * 0.11 - 1.7;
  for (let y = 0; y < H; y++) {
    const lat = y / (H - 1);
    const phi = (lat - 0.5) * Math.PI;
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const px3 = Math.sin(lon) * cphi, py3 = sphi, pz3 = Math.cos(lon) * cphi;
      // zonally-sheared spherical noise → weather systems / cloud bands
      const shear = lon + py3 * 2.2;
      const cnx = Math.sin(shear) * cphi * 2.2 + s0;
      const cnz = Math.cos(shear) * cphi * 2.2 + s1;
      const warp = fbm(cnx * 0.8, cnz * 0.8, 3);
      const c = fbm(cnx * 1.3 + warp * 0.8 + py3 * 1.1, cnz * 1.3 + warp * 0.8, 4);
      let a = smoothstep(0.50, 0.74, c) * (0.6 + 0.4 * Math.sin(lat * Math.PI * 5.0));
      a = clamp(a, 0, 1);
      const i = (y * W + x) * 4;
      d[i] = 244; d[i + 1] = 247; d[i + 2] = 255; d[i + 3] = a * 210;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Soft nebula / galaxy-band texture for the deep-space backdrop. A faint
// horizontal milky band with a few coloured cloud blobs — additive, very low
// opacity, so it reads as depth without lighting up the whole sky.
function makeNebulaTexture() {
  const W = 1024, H = 512;
  const cnv = document.createElement("canvas");
  cnv.width = W; cnv.height = H;
  const ctx = cnv.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  const blobs = [
    ["rgba(120,90,200,",  0.55], ["rgba(60,120,200,", 0.5],
    ["rgba(200,110,170,", 0.42], ["rgba(80,180,190,", 0.4],
    ["rgba(150,150,220,", 0.35],
  ];
  for (let k = 0; k < 46; k++) {
    const bandY = H * 0.5 + (Math.random() - 0.5) * H * 0.42;
    const x = Math.random() * W, y = bandY;
    const rad = 40 + Math.random() * 180;
    const [col, a] = blobs[(Math.random() * blobs.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col + (a * (0.5 + Math.random() * 0.5)).toFixed(2) + ")");
    g.addColorStop(1, col + "0)");
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// ── v4 planetary atmosphere shell (TSL) ─────────────────────────────────────
// Reproduces v4's per-pixel atmosphere: a Fresnel rim (pow 3) plus a razor-thin
// bright horizon line (pow 9), tinted by the body's atmo colour and brightest
// on the sun-lit limb. Rendered as a FrontSide additive shell just above the
// surface — the limb glows, the disc centre contributes nothing, so the planet
// body reads through cleanly. SOL sits at the origin, so per-fragment sun
// direction = normalize(-worldPos). Falls back to a plain sprite if TSL throws.
function makeAtmosphereMaterial(atmo, strength = 1) {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide, toneMapped: true,
  });
  const N = normalWorld;
  const V = positionWorld.sub(cameraPosition).normalize();   // camera → fragment
  const fres = N.dot(V).abs().oneMinus().clamp(0, 1);        // 1 at the limb, 0 at centre
  const sunDir = positionWorld.negate().normalize();          // toward SOL @ origin
  const day = N.dot(sunDir).mul(0.7).add(0.32).clamp(0, 1);   // v4: 0.20 + 0.8·diff
  // rim (broad, pow 3) + horizon line (thin, pow 9), both lit-side weighted
  const glow = fres.pow(3).mul(0.55).add(fres.pow(9).mul(1.35)).mul(day).mul(strength);
  mat.colorNode = vec3(atmo[0], atmo[1], atmo[2]).mul(glow);
  return mat;
}

// ── v4 planet SURFACES: true 3D noise evaluated at the sphere position ──────
// v4 ray-traced its planets with fbm3d in the sky shader — no texture mapping
// at all, which is why its surfaces had zero seams and no polar pinch. The
// equirect canvas skins could never match that (the "mapping looks off"
// smearing). These rebuild the same shading as TSL nodes sampled at the
// sphere point itself: continents, terrain detail, climate bands, polar caps.
// fbm01: three octaves of MaterialX noise folded into ~[0,1] (v4's fbm3d range)
function tslFbm01(v, s) {
  return mx_noise_float(v.mul(s))
    .add(mx_noise_float(v.mul(s * 2.13)).mul(0.5))
    .add(mx_noise_float(v.mul(s * 4.41)).mul(0.25))
    .mul(0.5 / 1.75).add(0.5);
}
function makePlanetNodeMaterial(b) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  const sd = ((b.land ? b.land.seed[0] : 7) % 97) * 0.37;
  const p = TSL.positionLocal.div(b.r);                       // unit sphere point
  const q = p.mul(2.3).add(vec3(sd, sd * 1.31, sd * -0.7));
  const cont = tslFbm01(q, 1.7);                              // continents
  const det  = tslFbm01(q, 7.0);                              // terrain detail
  let land = TSL.mix(vec3(...b.a), vec3(...b.b), tslSmoothstep(0.25, 0.75, det));
  land = land.mul(tslFbm01(q, 13.0).mul(0.60).add(0.70));     // fine albedo grain
  land = land.mul(TSL.mix(vec3(1.05, 1.0, 0.90), vec3(0.85, 0.95, 1.10),
                          tslSmoothstep(0.25, 0.85, p.y.abs())));   // climate bands
  const oceanC = mix3([0.012, 0.04, 0.085],
                      [b.atmo[0] * 0.28, b.atmo[1] * 0.28, b.atmo[2] * 0.28], 0.45);
  const landM = b.water
    ? tslSmoothstep(0.455, 0.53, cont.add(det.mul(0.08)))
    : float(1);
  let surf = TSL.mix(vec3(...oceanC), land, landM);
  const capAmt = b.water ? 0.75 : 0.18;
  const capM = tslSmoothstep(0.70, 0.86, p.y.abs().add(det.mul(0.08))).mul(capAmt);
  surf = TSL.mix(surf, vec3(0.90, 0.93, 0.98), capM);
  mat.colorNode = surf;
  return mat;
}
function makePlanetCloudNodeMaterial(b) {
  // cloud shell in TRUE 3D noise as well — the equirect cloud texture was the
  // last polar-smear offender (broad diagonal streak bands across the ball)
  const mat = new THREE.MeshStandardNodeMaterial({
    transparent: true, depthWrite: false, roughness: 1, metalness: 0 });
  const sd = ((b.land ? b.land.seed[1] : 3) % 89) * 0.41;
  const p = TSL.positionLocal.div(b.r * 1.015);
  const q = p.mul(4.2).add(vec3(sd * 1.3, sd * -0.4, -sd));
  const wv = tslFbm01(q, 2.1);                     // domain warp
  const cl = tslFbm01(q.add(wv.mul(0.9)), 1.0);    // billows
  const amt = b.water ? 0.72 : 0.38;               // v4's cAmt: wetter = cloudier
  mat.colorNode = vec3(0.96, 0.97, 1.0);
  mat.opacityNode = tslSmoothstep(0.52, 0.72, cl).mul(amt);
  return mat;
}
function makeLavaNodeMaterial(b) {
  // VULKAR from orbit: dark basalt threaded with bright crack rivers and
  // molten lowland lakes — emissive, so the night side glows (v4's key cue)
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  const sd = ((b.land ? b.land.seed[0] : 13) % 97) * 0.37;
  const p = TSL.positionLocal.div(b.r);
  const q = p.mul(3.1).add(vec3(sd, -sd, sd * 0.6));
  const cont = tslFbm01(q, 1.6);
  // v4 balance: the ball is mostly DARK basalt — thin bright crack rivers in
  // the lowlands, a few rare molten seas in the deepest basins. First cut had
  // heat everywhere and read as a small sun.
  const veins = mx_noise_float(q.mul(5.2)).abs().oneMinus().pow(9.0)
    .mul(tslSmoothstep(0.58, 0.40, cont));
  const lakes = tslSmoothstep(0.38, 0.30, cont).mul(0.75);
  const heat = TSL.max(veins, lakes).clamp(0, 1);
  const rock = TSL.mix(vec3(0.050, 0.030, 0.028), vec3(0.14, 0.09, 0.07), tslFbm01(q, 7.0));
  mat.colorNode = TSL.mix(rock, vec3(0.24, 0.08, 0.03), heat.mul(0.5));
  mat.emissiveNode = vec3(1.5, 0.38, 0.05).mul(heat.pow(1.4)).mul(0.95);
  return mat;
}

// Build the space scene lazily — it generates a 1024×512 surface texture AND a
// cloud texture for every planet (~20 heavy canvas loops). Doing that before
// the first frame was blocking the initial paint (the "black for a few
// seconds"). Now it's built off the critical path: warmed during idle after the
// terrain is up, or on-demand the first time you launch.
function ensureSpaceRig() { if (!spaceScene) makeSpaceRig(); }
function makeSpaceRig() {
  spaceScene = new THREE.Scene();
  spaceScene.background = new THREE.Color(0x02030a);
  spaceRig = new THREE.Group();
  spaceScene.add(spaceRig);

  // lower ambient → a real day/night terminator so the atmosphere crescent
  // reads on the sun-lit limb (v4 look); the sun point light does the modelling
  spaceScene.add(new THREE.AmbientLight(0x44506e, 0.42));
  const sunLight = new THREE.PointLight(0xfff2dd, 3.4, 0, 0);
  spaceScene.add(sunLight);

  // shared soft radial texture — nebula wisps, planet glows
  const softTex = (() => {
    const S = 256, cnv = document.createElement("canvas");
    cnv.width = cnv.height = S;
    const cx = cnv.getContext("2d");
    const g = cx.createRadialGradient(S/2, S/2, 2, S/2, S/2, S/2);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.45, "rgba(255,255,255,0.30)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = g; cx.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cnv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  // deep-space backdrop: a handful of huge, faint, elongated nebula wisps
  // along a tilted galactic band. Sprites, not a textured sphere — the sphere
  // mapping read as a repeating grid and lifted the whole sky off black.
  // Space stays BLACK; the wisps are whispers (additive, ≤0.14 opacity).
  {
    const wispCols = [[0.42, 0.30, 0.72], [0.22, 0.40, 0.70], [0.62, 0.34, 0.55],
                      [0.28, 0.58, 0.62], [0.48, 0.48, 0.75]];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + (i % 3) * 0.21;
      const R = 300000;
      const mat = new THREE.SpriteMaterial({ map: softTex, transparent: true,
        opacity: 0.08 + (i % 3) * 0.038, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false });
      const c = wispCols[i % wispCols.length];
      mat.color.setRGB(c[0], c[1], c[2]);
      const sp = new THREE.Sprite(mat);
      // band tilted ~20°: y follows a sine of the angle + scatter
      sp.position.set(Math.cos(a) * R,
                      Math.sin(a) * R * 0.36 + ((i * 37) % 40000 - 20000),
                      Math.sin(a) * R);
      // much larger wisps — the nebula reads as vast cloud banks, not specks
      const w = 190000 + (i % 4) * 70000;
      sp.scale.set(w, w * 0.42, 1);
      sp.material.rotation = a * 0.7;
      spaceRig.add(sp);
    }
  }

  // near-field star particles: a cube of stars around the ship that WRAPS as
  // you move — these are the ones that stream past during a warp burn.
  {
    const N = 700, EXT = 36000;
    const posArr = new Float32Array(N * 3);
    const colArr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      posArr[i * 3]     = (Math.random() * 2 - 1) * EXT;
      posArr[i * 3 + 1] = (Math.random() * 2 - 1) * EXT;
      posArr[i * 3 + 2] = (Math.random() * 2 - 1) * EXT;
      // real-star brightness spread: mostly dim, a few brilliant; subtle warm/
      // cool tint. Random²→ heavy tail so bright stars are rare and stand out.
      const b = 0.42 + Math.random() * Math.random() * 1.5;
      const warm = Math.random() < 0.18;
      colArr[i * 3]     = b * (warm ? 1.0  : 0.82);
      colArr[i * 3 + 1] = b * (warm ? 0.84 : 0.88);
      colArr[i * 3 + 2] = b * (warm ? 0.66 : 1.0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    // soft round glow texture + per-star colour = glowing dots, not flat squares
    nearStars = new THREE.Points(g, new THREE.PointsMaterial({
      map: softTex, vertexColors: true, size: 520, sizeAttenuation: true,
      transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending }));
    nearStars.frustumCulled = false;
    nearStars.userData.ext = EXT;
    nearStars.userData.baseOpacity = 0.9;
    spaceScene.add(nearStars);

    // ── v4-style star smear: NO hard line segments. Each star gets a short
    // trail of soft round glow SAMPLES behind it along the travel direction —
    // exactly v4's multi-sample starField smear (dots that stretch into soft
    // luminous streaks under warp, never sharp arcade lines). Each tail sample
    // carries its star's colour, fading toward the tail. ──────────────────────
    const TRAIL = 6;
    const tpos = new Float32Array(N * TRAIL * 3);
    const tcol = new Float32Array(N * TRAIL * 3);
    for (let i = 0; i < N; i++)
      for (let k = 0; k < TRAIL; k++) {
        const o = (i * TRAIL + k) * 3, f = 1 - k / TRAIL;   // fade along the tail
        tcol[o] = colArr[i * 3] * f; tcol[o + 1] = colArr[i * 3 + 1] * f; tcol[o + 2] = colArr[i * 3 + 2] * f;
      }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(tpos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(tcol, 3));
    warpStreaks = new THREE.Points(sg, new THREE.PointsMaterial({
      map: softTex, vertexColors: true, size: 360, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    warpStreaks.frustumCulled = false;
    warpStreaks.userData.trail = TRAIL;
    warpStreaks.userData.count = N;
    spaceScene.add(warpStreaks);
  }

  // stars — three shells for depth, with per-star warm/cool colour variety
  for (const [count, radius, size, opacity] of
       [[2600, 340000, 2.2, 0.9], [1600, 380000, 1.3, 0.55], [2200, 400000, 0.8, 0.38]]) {
    const posArr = new Float32Array(count * 3);
    const colArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(1 - u * u);
      posArr[i * 3] = rr * Math.cos(a) * radius;
      posArr[i * 3 + 1] = u * radius;
      posArr[i * 3 + 2] = rr * Math.sin(a) * radius;
      // spectral variety: mostly white-blue, a scatter of amber/red giants
      const t = Math.random();
      const warm = t < 0.16 ? 1 : 0;
      const bright = 0.75 + Math.random() * 0.25;
      colArr[i * 3]     = bright * (warm ? 1.0 : 0.87);
      colArr[i * 3 + 1] = bright * (warm ? 0.72 : 0.90);
      colArr[i * 3 + 2] = bright * (warm ? 0.52 : 1.0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    const m = new THREE.PointsMaterial({ vertexColors: true, size, sizeAttenuation: false,
      transparent: true, opacity, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    spaceRig.add(pts);
  }

  // sun glow sprite
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const gctx = glowCanvas.getContext("2d");
  const grad = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,240,210,1)");
  grad.addColorStop(0.35, "rgba(255,190,120,0.45)");
  grad.addColorStop(1, "rgba(255,150,80,0)");
  gctx.fillStyle = grad; gctx.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowCanvas);

  for (const b of SYS) {
    if (b.hidden) continue;
    if (b.emissive) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 48, 24),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(b.a[0], b.a[1], b.a[2]) }));
      mesh.position.set(...b.pos);
      spaceRig.add(mesh);
      b.mesh = mesh;
      // v4 corona: a wide warm glow (g1) + a tighter brighter core (g2)
      sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      sunGlow.material.color.setRGB(1.0, 0.75, 0.45);   // uBodyAtmo for SOL
      sunGlow.scale.setScalar(b.r * 5.0);
      sunGlow.position.set(...b.pos);
      spaceRig.add(sunGlow);
      const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true,
        opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      sunCore.material.color.setRGB(1.0, 0.88, 0.62);
      sunCore.scale.setScalar(b.r * 2.1);
      sunCore.position.set(...b.pos);
      spaceRig.add(sunCore);
      continue;
    }
    const col = new THREE.Color(
      lerp(b.a[0], b.b[0], 0.35), lerp(b.a[1], b.b[1], 0.35), lerp(b.a[2], b.b[2], 0.35));
    let mat;
    if (b.blackhole) {
      mat = new THREE.MeshBasicMaterial({ color: 0x05030a });
    } else if (b.kind === "lava") {
      // v4-parity 3D-noise surface; equirect texture kept as the fallback
      try { mat = makeLavaNodeMaterial(b); }
      catch (e) {
        const { map, emissive } = makeLavaTexture(b);
        mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive,
          emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 1, metalness: 0 });
      }
    } else if (b.kind === "aether") {
      const { map, emissive } = makeAetherTexture(b);
      mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive,
        emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 1, metalness: 0 });
    } else {
      try { mat = makePlanetNodeMaterial(b); }
      catch (e) {
        mat = new THREE.MeshStandardMaterial({ map: makePlanetTexture(b), roughness: 1, metalness: 0 });
      }
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 72, 36), mat);
    mesh.position.set(...b.pos);
    spaceRig.add(mesh);
    b.mesh = mesh;

    // rotating cloud shell just above the surface (skip airless/black/lava bodies —
    // white water-clouds over molten basalt looked wrong; VULKAR's fiery halo
    // and self-lit lava carry its atmosphere read instead)
    if (!b.blackhole && b.kind !== "lava") {
      let cloudMat;
      try { cloudMat = makePlanetCloudNodeMaterial(b); }
      catch (e) {
        cloudMat = new THREE.MeshStandardMaterial({ map: makePlanetCloudTexture(b), transparent: true,
          roughness: 1, metalness: 0, depthWrite: false });
      }
      const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(b.r * 1.015, 56, 28), cloudMat);
      mesh.add(cloudMesh);
      b.cloudMesh = cloudMesh;
    }

    // ── v4 atmosphere: a Fresnel rim shell on the limb (the crisp bright edge)
    // + a tight soft outer bloom sprite (v4's exp(-(dmin-R)/(R·0.10)) glow).
    if (!b.blackhole) {
      const aStr = b.kind === "lava" ? 1.8 : b.kind === "aether" ? 1.6 : 1.35;
      try {
        const shell = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.055, 48, 24),
          makeAtmosphereMaterial(b.atmo, aStr));
        shell.renderOrder = 2;                    // drawn after the body
        mesh.add(shell);
      } catch (e) { /* TSL unavailable — the sprite bloom below still gives glow */ }
    }
    // tight outer bloom (much smaller than the old 3.1r broad wash → v4's tight
    // corona rather than a planet-swallowing haze)
    // v4 glow: a generous additive halo (v4 used ~3.1r) — planets should read
    // as luminous bodies from across the system, not matte balls
    const haloOp = b.blackhole ? 0.5 : b.kind === "lava" ? 0.60 : b.kind === "aether" ? 0.52 : 0.46;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex,
      transparent: true, opacity: haloOp,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.material.color.setRGB(b.atmo[0], b.atmo[1], b.atmo[2]);
    halo.scale.setScalar(b.r * (b.kind === "lava" ? 3.1 : 2.9));
    halo.renderOrder = -1;              // planet body draws over the core glow
    mesh.add(halo);

    const ringDef = RINGS[b.name];
    if (ringDef) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(b.r * ringDef[0], b.r * ringDef[1], 64),
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true,
          opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = Math.PI / 2 - 0.22;
      mesh.add(ring);
    }
    if (b.blackhole) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(b.r * 1.15, b.r * 1.7, 64),
        new THREE.MeshBasicMaterial({ color: 0xb478ff, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2 - 0.5;
      mesh.add(ring);
    }
  }
}

function nearestBodies() {
  const out = [];
  for (const b of SYS) {
    if (b.hidden) continue;
    const dx = b.pos[0] - S.sys[0], dy = b.pos[1] - S.sys[1], dz = b.pos[2] - S.sys[2];
    const dist = Math.hypot(dx, dy, dz) - b.r;
    out.push({ b, dist, dir: [dx, dy, dz] });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}
function camForward() {
  const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  return [Math.sin(S.hdg) * cp, sp, -Math.cos(S.hdg) * cp];
}

let setSpaceModeVisual = null;   // bound in main() where scene objects live

function enterSpace() {
  ensureSpaceRig();
  const p = PLANET;
  const altKm = Math.max(S.camY / 1000, p.r * 0.12);
  S.sys = [
    p.pos[0] + p.anchor[0] * (p.r + altKm),
    p.pos[1] + p.anchor[1] * (p.r + altKm),
    p.pos[2] + p.anchor[2] * (p.r + altKm),
  ];
  S.mode = "space";
  S.vpitch = S.pitch;
  S.launchGrace = 9.0;
  S.spaceVel = 2600;
  S.underwater = 0; S.waterProx = 0;
  screenFade = 1;
  if (setSpaceModeVisual) setSpaceModeVisual(true);
  toast("LEAVING ATMOSPHERE — " + p.name);
}
function enterAtmosphere(body, dir) {
  if (body.blackhole) { enterAfterCity(); return; }
  PLANET = body;
  applyPlanetPalette(body);
  // per-planet default cloud cover (user can re-dial it on the Clouds knob)
  S.cloudCov = body.land && body.land.clouds !== undefined ? body.land.clouds : 0.45;
  if (typeof cloudKnob !== "undefined" && cloudKnob) cloudKnob.set(S.cloudCov, false);
  lastSkyPaint = -99;                 // repaint the sky for the new cover
  S.mode = "terrain";
  S.launchGrace = 0;
  S.spaceBlend = 0;
  S.effSpd = 0; S.yawVel = 0; S.thrust = 0; S.thrustHold = 0;   // shed orbital velocity
  S.camY = Math.min(14000, Math.max(3200, body.r * 4));
  S.altitude = Math.min(1200, Math.max(320, S.camY * 0.18));
  S.x = Math.floor(hash12(dir[0] * 97.7, dir[2] * 57.3) * 80000);
  S.z = Math.floor(hash12(dir[2] * 77.1, dir[0] * 39.9) * 80000);
  S.pitch = -0.05;
  screenFade = 1;
  if (setSpaceModeVisual) setSpaceModeVisual(false);
  toast("ENTERING ATMOSPHERE — " + body.name);
}
function enterAfterCity() {
  const city = SYS.find(b => b.name === "AFTERCITY");
  if (!city) return;
  PLANET = city;
  applyPlanetPalette(city);
  S.cityVisit = (S.cityVisit || 0) + 1;
  SEED = [Math.random() * 9000 + S.cityVisit * 371, Math.random() * 9000 + S.cityVisit * 911];
  city.land.seed = [Math.random() * 3000 + 7007, Math.random() * 3000 + 2029];
  S.mode = "terrain";
  S.launchGrace = 0;
  S.spaceBlend = 0;
  S.effSpd = 0; S.yawVel = 0; S.thrust = 0; S.thrustHold = 0;
  S.x = Math.floor(Math.random() * 42000 - 21000);
  S.z = Math.floor(Math.random() * 42000 - 21000);
  S.camY = 82;
  S.altitude = 42;
  S.pitch = -0.06;
  S.underwater = 0;
  S.hour = 19.15;
  renderTime();
  screenFade = 1;
  if (setSpaceModeVisual) setSpaceModeVisual(false);
  toast("UMBRA TRANSIT — SUBURBIA NULL");
}
function launchToOrbit() {
  ensureSpaceRig();
  if (S.mode === "space") {
    S.launchGrace = Math.max(S.launchGrace || 0, 5.0);
    S.spaceVel = Math.max(S.spaceVel, 1800);
    toast("THRUSTERS — CLEAR VECTOR");
    return;
  }
  S.underwater = 0;
  S.altitude = Math.max(S.altitude, HANDOFF_UP + 8000);
  S.camY = Math.max(S.camY, HANDOFF_UP + 800);
  S.pitch = Math.max(S.pitch, 0.10);
  enterSpace();
  toast("ORBIT INSERTION — HOLD SPACE TO BURN");
}
function enterSelectedWorld() {
  if (S.mode !== "space") { launchToOrbit(); return; }
  const near = nearestBodies().filter(n => !n.b.emissive);
  const chosen = S.navTarget ? near.find(n => n.b === S.navTarget) : near[0];
  if (!chosen) { toast("NO LANDING TARGET"); return; }
  const l = Math.hypot(...chosen.dir) || 1;
  S.warping = false;
  S.navTarget = null;
  enterAtmosphere(chosen.b, chosen.dir.map(c => c / l));
}
function findDiveSite() {
  if (PLANET.land.waterLvl <= -1e5) return null;
  let best = null, fallback = null;
  for (let r = 0; r <= 36000; r += 900) {
    const n = r === 0 ? 1 : 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r * 0.00019;
      const x = S.x + Math.sin(a) * r;
      const z = S.z + Math.cos(a) * r;
      const raw = terrainRaw(x, z);
      const depth = WATER_LVL - raw;
      if (depth > 34 && (!fallback || depth > fallback.depth)) fallback = { x, z, depth, raw };
      if (depth > 70 && (!best || depth > best.depth)) best = { x, z, depth, raw };
    }
    if (best && best.depth > 150) break;
  }
  return best || fallback;
}
function enterDiveSite() {
  if (S.mode !== "terrain") return;
  const site = findDiveSite();
  if (!site) { toast("NO DEEP WATER NEARBY — NEW RANGE"); return; }
  S.x = site.x; S.z = site.z;
  S.camY = WATER_LVL - Math.min(95, Math.max(28, site.depth * 0.58));
  S.altitude = Math.max(site.raw + 14, S.camY - 8);
  S.underwater = 0.75;
  S.pitch = -0.12;
  S.lastInput = performance.now() / 1000;
  toast("DIVE ENTRY — " + Math.round(site.depth) + " M WATER");
}

// space regime physics (port of the v2 space branch, same tuning)
function spaceUpdate(dt, now) {
  S.launchGrace = Math.max(0, (S.launchGrace || 0) - dt);
  // slow planetary spin + a faster cloud drift → living worlds, not billboards
  for (const b of SYS) {
    if (b.mesh && !b.emissive && !b.blackhole) b.mesh.rotation.y += dt * 0.015;
    if (b.cloudMesh) b.cloudMesh.rotation.y += dt * 0.010;
  }
  let yaw = 0;
  if (keys["a"] || keys["arrowleft"]) yaw -= 1;
  if (keys["d"] || keys["arrowright"]) yaw += 1;
  let yawT = yaw * 0.42;
  if (dragging) yawT += dragDX * 0.0036;
  yawT = clamp(yawT, -0.92, 0.92);
  if (yaw !== 0 || dragging) S.lastInput = now;

  let pitchRate = 0;
  if (keys["w"] || keys["arrowup"]) { pitchRate += 0.9; S.lastInput = now; }
  if (keys["s"] || keys["arrowdown"]) { pitchRate -= 0.9; S.lastInput = now; }
  if (dragging) pitchRate += -dragDY * 0.0044;
  S.vpitch = clamp(S.vpitch + pitchRate * dt, -1.35, 1.35);

  const steering = Math.abs(yawT) > 0.02 || Math.abs(pitchRate) > 0.02;
  if (steering) S.warping = false;
  const idle = now - S.lastInput > 5;
  if (S.auto && idle && !S.hold && !S.warping) {
    const wander = Math.sin(now * 0.03) * 0.5 + Math.sin(now * 0.013 + 1.1) * 0.5;
    S.yawVel += (wander * 0.02 - S.yawVel) * Math.min(1, dt * 0.4);
    S.vpitch += (Math.sin(now * 0.017) * 0.25 - S.vpitch) * Math.min(1, dt * 0.1);
  } else {
    const ease = Math.abs(yawT) > 0.02 ? 4.2 : 2.0;
    S.yawVel += (yawT - S.yawVel) * Math.min(1, dt * ease);
  }
  S.hdg = (S.hdg + S.yawVel * dt) % (Math.PI * 2);
  S.pitch += (S.vpitch - S.pitch) * Math.min(1, dt * 5.0);
  const rollT = clamp(-S.yawVel * 1.35, -0.42, 0.42);
  S.roll += (rollT - S.roll) * Math.min(1, dt * 3.0);

  // ⌘ thrust (same hold-to-build curve as terrain)
  if (keys["meta"]) { S.thrustHold = Math.min(12, S.thrustHold + dt); S.lastInput = now; }
  else S.thrustHold = Math.max(0, S.thrustHold - dt * 1.6);
  const holdN = Math.min(1, S.thrustHold / 11);
  const curve = holdN * (0.35 + 0.65 * holdN);
  const tT = keys["meta"] ? Math.min(1, 0.34 + curve * 0.66) : 0;
  S.thrust += (tT - S.thrust) * Math.min(1, dt * 3);
  const tp = S.thrust * (0.9 + curve * 4.1);

  const near = nearestBodies();
  const distSurf = Math.max(near[0].dist, 0.5);
  const fwd = camForward();

  // near-field stars: wrap the cube around the ship so stars endlessly
  // stream PAST during a burn instead of hanging on a fixed shell
  if (nearStars) {
    const ext = nearStars.userData.ext, span = ext * 2;
    const p = nearStars.geometry.attributes.position;
    const arr = p.array;
    for (let i = 0; i < arr.length; i += 3) {
      let v = arr[i] - S.sys[0];
      if (v > ext) arr[i] -= span; else if (v < -ext) arr[i] += span;
      v = arr[i + 1] - S.sys[1];
      if (v > ext) arr[i + 1] -= span; else if (v < -ext) arr[i + 1] += span;
      v = arr[i + 2] - S.sys[2];
      if (v > ext) arr[i + 2] -= span; else if (v < -ext) arr[i + 2] += span;
    }
    p.needsUpdate = true;
  }

  // warp target: clicked nav body, else whatever you're aimed at
  let aimBody = null, aimBest = 0.92;
  for (const n of near) {
    if (n.b.emissive) continue;
    const dl = Math.hypot(...n.dir) || 1;
    const dd = (n.dir[0] * fwd[0] + n.dir[1] * fwd[1] + n.dir[2] * fwd[2]) / dl;
    if (dd > aimBest) { aimBest = dd; aimBody = n.b; }
  }
  const tgt = S.navTarget || aimBody;
  S._tgtName = tgt ? tgt.name : null;

  let v, mv = fwd;
  if (S.warping && tgt) {
    const tb = near.find(n => n.b === tgt);
    const dl = Math.hypot(...tb.dir) || 1;
    const dirN = [tb.dir[0] / dl, tb.dir[1] / dl, tb.dir[2] / dl];
    const wHdg = Math.atan2(dirN[0], -dirN[2]);
    let dh = wHdg - S.hdg;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    S.hdg += dh * Math.min(1, dt * 2.0);
    S.vpitch += (Math.asin(clamp(dirN[1], -1, 1)) - S.vpitch) * Math.min(1, dt * 2.0);
    mv = dirN;
    v = S.hold ? 0 : Math.min(90000, Math.max(60, tb.dist * 0.85));
    if (tb.dist < tgt.r * 2.6) { S.warping = false; S.navTarget = null; toast("ARRIVAL — " + tgt.name); }
  } else {
    S.warping = false;
    const vmax = Math.min(5200, Math.max(18, distSurf * 0.12));
    let vCmd = S.hold ? 0 : (S.speed / 80) * vmax * (1 + tp * 3.2 + tp * tp * 0.9) * (keys["shift"] ? 0.25 : 1);
    if ((S.launchGrace || 0) > 0 && keys["meta"]) vCmd = Math.max(vCmd, 850);
    S.spaceVel += (vCmd - S.spaceVel) * (1 - Math.exp(-dt * (vCmd > S.spaceVel ? 1.6 : 0.35)));
    v = S.spaceVel;
    // approach assist: roughly aimed at the nearest world → path bends into it
    const n0 = near[0];
    if (!n0.b.emissive) {
      const dl = Math.hypot(...n0.dir) || 1;
      const dirN = [n0.dir[0] / dl, n0.dir[1] / dl, n0.dir[2] / dl];
      const aim = fwd[0] * dirN[0] + fwd[1] * dirN[1] + fwd[2] * dirN[2];
      if (aim > 0.80 && n0.dist < n0.b.r * 12) {
        const w = Math.min(1, (aim - 0.80) / 0.14);
        mv = [fwd[0] * (1 - w) + dirN[0] * w, fwd[1] * (1 - w) + dirN[1] * w, fwd[2] * (1 - w) + dirN[2] * w];
        const ml = Math.hypot(...mv) || 1;
        mv = [mv[0] / ml, mv[1] / ml, mv[2] / ml];
      }
    }
  }
  S.effSpd = v * 1000;
  S.warpAmt += ((S.warping ? 1 : 0) - S.warpAmt) * Math.min(1, dt * 1.6);
  S.sys[0] += mv[0] * v * dt;
  S.sys[1] += mv[1] * v * dt;
  S.sys[2] += mv[2] * v * dt;

  // ── light-speed streaks: the stars stay glowing DOTS at cruise and only
  // stretch into stripes as you ACCELERATE (⌘-thrust or warp), then relax back
  // to dots as you slow. Tied to thrust/warp — NOT raw cruise speed, which is
  // always high in space and was leaving the stars permanently streaked. The
  // dot is the streak's head, so it never disappears: it just grows a tail. ──
  if (warpStreaks && nearStars) {
    const streakN = clamp(S.thrust * 1.35 + S.warpAmt, 0, 1);
    // responsive ramp: the stretch answers the thruster within ~0.4 s (the
    // old 0.9/s "cinematic" build felt disconnected from the ⌘ key), and
    // relaxes back to clean dots a touch faster when you ease off.
    const target = S._streak || 0;
    const rate = streakN > target ? 2.6 : 1.9;
    S._streak = target + (streakN - target) * Math.min(1, dt * rate);
    const sN = S._streak;
    warpStreaks.visible = sN > 0.02;
    // smear shows early and grows with the burn; dot heads stay full-bright
    warpStreaks.material.opacity = Math.pow(sN, 1.4) * 0.95;
    // v4 brightness ramp: heads glow brighter the faster you go (s1 *= 1+L·2.4)
    nearStars.material.opacity = (nearStars.userData.baseOpacity || 0.9) * (1 + sN * 1.6);
    if (warpStreaks.visible) {
      const len = sN * sN * 34000;                    // visible stretch as soon as the burn starts
      const TR = warpStreaks.userData.trail;
      const hp = nearStars.geometry.attributes.position.array;
      const sp = warpStreaks.geometry.attributes.position.array;
      const n = warpStreaks.userData.count;
      for (let i = 0; i < n; i++) {
        const h = i * 3;
        const hx = hp[h], hy = hp[h + 1], hz = hp[h + 2];
        for (let k = 0; k < TR; k++) {
          // samples march backward along the travel vector — soft glowing dots
          // that overlap into a luminous streak, never a hard line
          const f = (k + 1) / TR * len, o = (i * TR + k) * 3;
          sp[o] = hx - mv[0] * f; sp[o + 1] = hy - mv[1] * f; sp[o + 2] = hz - mv[2] * f;
        }
      }
      warpStreaks.geometry.attributes.position.needsUpdate = true;
    } else {
      nearStars.material.opacity = nearStars.userData.baseOpacity || 0.9;
    }
  }

  S.spaceBlend = 1;
  S.underwater += (0 - S.underwater) * Math.min(1, dt * 2.8);
  S.waterProx *= Math.max(0, 1 - dt * 2);

  // atmosphere entry — generous capture window
  const nn = near[0];
  const nl = Math.hypot(...nn.dir) || 1;
  const inbound = (mv[0] * nn.dir[0] + mv[1] * nn.dir[1] + mv[2] * nn.dir[2]) / nl > 0.32;
  const entryDist = Math.max(22, nn.b.r * 0.022);
  if (!nn.b.emissive && (S.launchGrace || 0) <= 0 && inbound && nn.dist < entryDist) {
    S.warping = false;
    enterAtmosphere(nn.b, nn.dir.map(c => c / nl));
  }
}

function flightUpdate(dt, now) {
  // steering: drag joystick + keys
  let yaw = 0;
  if (keys["a"] || keys["arrowleft"]) yaw -= 1;
  if (keys["d"] || keys["arrowright"]) yaw += 1;
  let yawT = yaw * 0.42;
  if (dragging) yawT += dragDX * 0.0036;
  yawT = clamp(yawT, -0.92, 0.92);
  if (yaw !== 0 || dragging) S.lastInput = now;
  const idle = now - S.lastInput > 6;
  if (S.auto && idle && !S.hold) {
    const wander = Math.sin(now * 0.055) * 0.55 + Math.sin(now * 0.021 + 1.7) * 0.45;
    S.yawVel += (wander * 0.035 - S.yawVel) * Math.min(1, dt * 0.5);
  } else {
    S.yawVel += (yawT - S.yawVel) * Math.min(1, dt * (Math.abs(yawT) > 0.02 ? 4.2 : 2.0));
  }
  S.hdg = (S.hdg + S.yawVel * dt) % (Math.PI * 2);

  // ⌘ thrust: builds the longer you hold
  if (keys["meta"]) { S.thrustHold = Math.min(12, S.thrustHold + dt); S.lastInput = now; }
  else S.thrustHold = Math.max(0, S.thrustHold - dt * 1.6);
  const holdN = Math.min(1, S.thrustHold / 11);
  const curve = holdN * (0.35 + 0.65 * holdN);
  const tT = keys["meta"] ? Math.min(1, 0.34 + curve * 0.66) : 0;
  S.thrust += (tT - S.thrust) * Math.min(1, dt * 3);
  const power = S.thrust * (0.9 + curve * 4.1);

  const spdMul = Math.max(1, S.camY / 500);
  // AUTOPILOT ON: cruises on its own. OFF: you only move forward while ⌘-thrusting.
  const target = (S.hold ? 0
    : S.auto ? S.speed * spdMul * (1 + power * 1.05 + power * power * 0.5)
             : power * S.speed * spdMul * 2.4
    ) * (keys["shift"] ? 0.3 : 1);
  S.effSpd += (target - S.effSpd) * Math.min(1, dt * (S.auto ? 1.4 : 2.6));
  S.x += Math.sin(S.hdg) * S.effSpd * dt;
  S.z -= Math.cos(S.hdg) * S.effSpd * dt;

  const climbRate = 60 * Math.max(1, S.camY / 250) * (PLANET.lowG ? 0.62 : 1);
  const ground = terrainRaw(S.x, S.z);
  const floor_ = ground + 5;
  const prevY = S.camY;
  const hasWater = PLANET.land.waterLvl > -1e5;
  const underwater = hasWater && S.camY < WATER_LVL;
  const underwaterTarget = underwater ? clamp((WATER_LVL - S.camY) / 80, 0, 1) : 0;
  const waterProxTarget = hasWater ? clamp((160 - Math.abs(S.camY - WATER_LVL)) / 160, 0, 1) : 0;
  S.underwater += (underwaterTarget - S.underwater) * Math.min(1, dt * 3.8);
  S.waterProx += (waterProxTarget - S.waterProx) * Math.min(1, dt * 2.2);

  if (S.auto) {
    // AUTOPILOT ON — altitude-based flight: W/S climb, space = rocket, hold height
    if (keys["w"] || keys["arrowup"]) { S.altitude += climbRate * dt; S.lastInput = now; }
    if (keys["s"] || keys["arrowdown"]) { S.altitude -= climbRate * dt; S.lastInput = now; }
    if (keys[" "]) { const rocket = S.camY > 8000 ? 7.5 : 3.2; S.altitude += climbRate * rocket * dt; S.lastInput = now; }
    if (dragging && Math.abs(dragDY) > 6) S.altitude -= dragDY * 0.5 * dt * Math.max(1, S.camY / 200);
    S.altitude = clamp(S.altitude, -80, 60000);
    const targetY = Math.max(S.altitude, floor_);
    const drag = underwater ? 1.6 : 2.4;
    S.camY += (targetY - S.camY) * Math.min(1, dt * drag);
    if (S.camY < floor_) S.camY = floor_;
    S.onGround = false;
  } else {
    // AUTOPILOT OFF — gravity: you fall to the ground, SPACE jumps, ⌘ thrusts
    // forward. Underwater you sink slowly and swim with W/S.
    const g = (PLANET.lowG ? 11 : 26) * (underwater ? 0.22 : 1);
    S.vy = (S.vy || 0) - g * dt;
    if (keys[" "] && S.onGround) { S.vy = PLANET.lowG ? 12 : 16; S.onGround = false; S.lastInput = now; }
    // underwater: SPACE swims you upward (hold or tap-repeat to rise to the
    // surface); W/S also swim up/down
    if (underwater && keys[" "])                        { S.vy += 58 * dt; S.lastInput = now; }
    if (underwater && (keys["w"] || keys["arrowup"]))   { S.vy += 46 * dt; S.lastInput = now; }
    if (underwater && (keys["s"] || keys["arrowdown"])) { S.vy -= 46 * dt; S.lastInput = now; }
    S.vy = clamp(S.vy, -120, 60);
    S.camY += S.vy * dt;
    if (S.camY <= floor_) { S.camY = floor_; S.vy = 0; S.onGround = true; }
    else S.onGround = false;
    S.altitude = S.camY;   // stay synced so switching autopilot back on is smooth
  }

  // banking + pitch follow
  const rollT = clamp(-S.yawVel * 1.35, -0.42, 0.42);
  S.roll += (rollT - S.roll) * Math.min(1, dt * 4.5);
  const climbN = (S.camY - prevY) / Math.max(dt, 0.001) / Math.max(60, S.camY * 0.4);
  const pitchT = clamp(climbN * 0.5, -0.35, 0.35) - 0.04;
  S.pitch += (pitchT - S.pitch) * Math.min(1, dt * 3.2);

  // ascent → space handoff
  S.spaceBlend = clamp((S.camY - 12000) / (HANDOFF_UP - 12000), 0, 1);
  if (S.camY > HANDOFF_UP) enterSpace();
}

// ── boot ─────────────────────────────────────────────────────────────────────
const PRESETS = ["dusk", "sunset", "blackFlag", "seaOfThieves", "arctic", "storm", "moonlit"];
let water = null, sky = null, skyTex = null, lastSkyPaint = -99, lastSkyBlend = 0, lastSkyUw = 0, lastPmremBake = -9;
let hemiBase = null;   // preset's hemisphere intensity, captured on first frame after load

// ── underwater look settings (driven by the Underwater panel) ─────────────────
let currentWaterParams = null;
const UW = { bright: 1, caustics: 1, cscale: 150, shaft: 0.2, wobble: 0.018, murk: 1, tint: "#cfeeff" };
function applyUnderwaterToParams() {
  const p = currentWaterParams;
  if (!p) return;
  if (p.oceanFloor) {
    if (p.oceanFloor.caustics) {
      if (p.oceanFloor.caustics._base === undefined) p.oceanFloor.caustics._base = p.oceanFloor.caustics.intensity;
      p.oceanFloor.caustics.intensity = p.oceanFloor.caustics._base * UW.caustics;
      p.oceanFloor.caustics.scale = UW.cscale;
    }
    if (p.oceanFloor.sunShafts) p.oceanFloor.sunShafts.intensity = UW.shaft;
    if (typeof p.oceanFloor.depth === "number") {
      if (p.oceanFloor._baseDepth === undefined) p.oceanFloor._baseDepth = p.oceanFloor.depth;
      p.oceanFloor.depth = p.oceanFloor._baseDepth * UW.murk;   // murkier = shorter visibility
    }
  }
  if (p.postProcessing && p.postProcessing.underwater) {
    p.postProcessing.underwater.distortionIntensity = UW.wobble;
    // tint carries the underwater cast; brightness scales it (clamps toward white)
    const c = new THREE.Color(UW.tint).multiplyScalar(UW.bright);
    p.postProcessing.underwater.tintColor = "#" + c.getHexString();
  }
}
function loadWaterPreset(name) {
  currentWaterParams = getPresetParams(name);
  applyUnderwaterToParams();
  if (water) water.loadPreset(currentWaterParams);
  hemiBase = null;   // re-capture the new preset's hemisphere base next frame
}
function applyUnderwater() {
  applyUnderwaterToParams();
  if (water && currentWaterParams) water.loadPreset(currentWaterParams);
}

async function main() {
  if (!navigator.gpu) { document.getElementById("err").style.display = "flex"; return; }

  SEED = [Math.floor(Math.random() * 8000), Math.floor(Math.random() * 8000)];
  applyPlanetPalette(PLANET);
  findSpawn();

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  // Adaptive pixel ratio: start at the cap, drop toward 0.75 when frames get
  // heavy, recover when there's headroom. setPixelRatio reallocates render
  // targets, so we only call it when the ratio actually steps (never per frame).
  const DPR_CAP = Math.min(devicePixelRatio, 1.25);
  const DPR_MIN = 0.62;
  let curDPR = DPR_CAP;
  let dprEMA = 16;          // smoothed frame time (ms)
  let dprHold = 0;          // frames to wait before the next step
  renderer.setPixelRatio(curDPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  // load-bar progress: fill left→right as each heavy init stage completes
  const setLoad = (p) => { const f = document.getElementById("load-fill"); if (f) f.style.width = p + "%"; };
  setLoad(12);
  await renderer.init();
  setLoad(30);

  const scene = new THREE.Scene();
  // aerial perspective: without distance fog the terrain shading reads flat
  // and pasted-on; colour follows the horizon each frame, haze knob pulls in
  scene.fog = new THREE.Fog(0x8a99b5, 2800, 17000);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.35, 30000);
  camera.rotation.order = "YXZ";

  // terrain rings: fine near field + coarse far field (under-lapped)
  // clipmap density — crisper than the original 56/30 but pulled back from 96
  // (which was ~3× the rebuild cost) to a balance of silhouette vs performance.
  const inner = new TileRing(scene, 256, 80, 3, 0);
  const outer = new TileRing(scene, 1024, 40, 3, -0.6, true);
  // AFTERCITY houses: the simple instanced box-and-roof pool. The Infinitown
  // glTF assets were out of scale, blurry and slow to load — the clean box
  // suburb reads better and costs ~nothing (InfiniHousePool kept in the file
  // as an opt-in, but no longer the default).
  const houses = new HousePool(scene);
  // Clouds are now a live altitude-projected dome (v4 technique), not billboards.
  // v4 altitude-projected cloud dome — implemented but UNVERIFIED (this session
  // could not render the app to test it; see handoff). Gated OFF by default so
  // its TSL (which compiles at first render, past any try/catch) can't blank the
  // app. Set window.__CLOUDS = true BEFORE Begin to enable + verify.
  let cloudDome = null;
  if (window.__CLOUDS === true) {
    try { cloudDome = makeCloudDome(); scene.add(cloudDome); }
    catch (e) { console.warn("CLOUD DOME FAILED:", e.message); window.__cloudErr = e.message; }
  }
  // Volumetric sprite CLUSTERS, not a textured plane: the CloudDeck's 60 km
  // repeat-6 plane showed obvious tile seams and read as exactly what it was —
  // a thin sheet with a map. CloudField builds each cloud as a 3-tier stack
  // (shaded base slab / tall lobes / sunlit caps) with intra-cloud parallax;
  // sprites cannot tile, so there is nothing to seam.
  // 12 clusters (was 18): each cluster is 4-6 BIG transparent sprites, and
  // that overdraw was one of the largest GPU line items. 12 still fills the
  // sky; the TSL dome + painted equirect carry the rest of the cover.
  // 9 clusters: huge stacked transparent sprites are pure fill-rate — at 12+
  // clusters the horizon view stacked enough overdraw to drag the whole frame
  const clouds = new CloudField(scene, 9);
  const nightStars = new NightStars(scene);
  // HorizonVeil RETIRED (2026-07-07, user call): the 26 km curtain read as a
  // colored band across the horizon (worse than the seam it hid) and cost a
  // canvas readback + full vertex-color re-upload every 0.5 s plus a screen-
  // wide transparent strip of overdraw every frame. The class stays above for
  // reference; nothing instantiates it.
  const plankton = new NightPlankton(scene);

  // ── the water — every drop of it is threejs-water-pro ──
  // "medium" water: the single biggest perf lever in the app (the "high" FFT
  // spectrum + passes were the frame budget's largest slice). Visually close;
  // flip back to "high" here if you want max fidelity on a strong GPU.
  water = await WaterSystem.create(renderer, scene, camera, "medium");
  setLoad(62);
  loadWaterPreset("dusk");
  // our terrain is the real seabed — sink the library's procedural floor
  try { const fm = water.floor?.getMesh?.(); if (fm) fm.position.y = -160; } catch (e) {}

  // procedural time-of-day sky drives their reflections + fog
  paintSky(S.hour); lastSkyPaint = S.hour;
  skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.generateMipmaps = false;
  skyTex.minFilter = THREE.LinearFilter;
  skyTex.magFilter = THREE.LinearFilter;
  sky = new Sky({
    equirect: skyTex,
    sunDirection: water.lighting.sun.direction,
    sunOverlay: { enabled: true, radius: 0.0045, color: "#fff6e0", emissiveColor: "#fff6e0", emissiveIntensity: 4 },
    reflectionRoughness: 0.03,
    reflectionDistanceBlur: 0.5,
    reflectionBlurDistance: 1800,
  });
  for (const mesh of sky.getMeshes()) scene.add(mesh);
  water.setSky(sky);

  // NOTE: makeSpaceRig() is intentionally NOT called here — it's deferred so its
  // heavy per-planet texture generation doesn't block the first paint. Warmed
  // during idle after the first frame (below), or on-demand on first launch.

  // post: their atmospheric fog / underwater haze / sun shafts + bloom
  const postProcessing = new THREE.PostProcessing(renderer);
  const scenePass = pass(water.scene, water.camera);
  let outputNode = scenePass.getTextureNode("output");
  outputNode = water.postProcessing.buildNode(scenePass, outputNode);
  outputNode = outputNode.add(bloom(outputNode, 0.35, 0.4, 0.88));
  postProcessing.outputNode = outputNode;

  // ── mode switching: space is fully isolated from the water pipeline ──
  const setWaterVisible = (visible) => {
    try { water.clipmap?.getObject?.().traverse?.(o => { o.visible = visible; }); } catch (e) {}
    try { const o = water.clipmap?.getObject?.(); if (o) o.visible = visible; } catch (e) {}
    try { water.floor?.setVisible?.(visible); } catch (e) {}
    try { const m = water.particles?.getMesh?.(); if (m) m.visible = visible; } catch (e) {}
    try { const m = water.spray?.getMesh?.(); if (m) m.visible = visible; } catch (e) {}
  };
  setSpaceModeVisual = (active) => {
    if (active) {
      camera.near = 2; camera.far = 900000;
    } else {
      camera.near = 0.35; camera.far = 30000;
      // landing on a new world: fresh terrain + water config
      inner.rebuildAll(); outer.rebuildAll();
      const hasWater = PLANET.land.waterLvl > -1e5;
      setWaterVisible(hasWater);
    }
    camera.updateProjectionMatrix();
    for (const m of sky.getMeshes()) m.visible = !active;
    inner.setVisible(!active);
    outer.setVisible(!active);
  };

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    water.resize();
  });

  setLoad(80);
  await renderer.compileAsync(scene, camera);
  setLoad(95);

  // ── loop ──
  let lastT = performance.now();
  let hintFaded = false, navTick = 0, sceneReady = false;
  async function animate() {
    requestAnimationFrame(animate);
    const nowMs = performance.now();
    const rawMs = nowMs - lastT;
    const dt = Math.min(0.05, rawMs / 1000);
    const now = nowMs / 1000;
    lastT = nowMs;

    // adaptive DPR: EMA of frame time, step down when > ~21 ms (< 47 fps),
    // step back up when < ~13.5 ms (> 74 fps) with a hold between steps.
    if (rawMs < 100) dprEMA += (rawMs - dprEMA) * 0.1;   // ignore tab-switch spikes
    if (dprHold > 0) dprHold--;
    else if (dprEMA > 21 && curDPR > DPR_MIN) {
      curDPR = Math.max(DPR_MIN, curDPR - 0.15); renderer.setPixelRatio(curDPR); dprHold = 40;
    } else if (dprEMA < 13.5 && curDPR < DPR_CAP) {
      curDPR = Math.min(DPR_CAP, curDPR + 0.05); renderer.setPixelRatio(curDPR); dprHold = 90;
    }

    // day/night cycle (terrain only, matches v2 pace: 24 h in 10 min)
    if (S.cycle && S.mode === "terrain") {
      S.hour = (S.hour + dt * 24 / 2200) % 24;   // slower day: ~37 min per cycle
      // DOM clock write only when the displayed minute actually changes
      const mm = Math.floor(S.hour * 60);
      if (mm !== S._lastMin) { S._lastMin = mm; renderTime(); }
    }
    moonUpdate(dt);

    // v4 thrust vignette + warp grade overlays (both regimes)
    if (thrustGlowEl) thrustGlowEl.style.opacity = Math.min(0.85, (S.thrust || 0) * 0.9).toFixed(3);
    if (warpGradeEl) {
      const w = S.mode === "space" ? Math.max(S.warpAmt || 0, (S._streak || 0)) : 0;
      warpGradeEl.style.opacity = (w * 0.8).toFixed(3);
    }

    if (S.mode === "space") {
      spaceUpdate(dt, now);
      driveScreenFade(dt);
      camera.position.set(S.sys[0], S.sys[1], S.sys[2]);
      camera.rotation.set(S.pitch, -S.hdg, S.roll);
      music.frame();
      renderer.render(spaceScene, camera);
      hudUpdate(navTick++);
      return;
    }

    // Lock screen: freeze flight physics until Begin. The world still renders
    // (water animates, sky lives) but the camera holds its spawn vantage.
    if (S.started) flightUpdate(dt, now);
    // fade to black over the last stretch of the climb so the space handoff
    // never pops between two skies. The window is wide and reaches FULL black
    // by spaceBlend ≈ 0.93 — comfortably before the scene swap at 1.0 — so no
    // frame of the swap (kinematics reset, camera near/far switch, sky
    // exchange) is ever visible. Eased (t²·smooth) so the fade breathes in
    // instead of ramping linearly.
    {
      const t = clamp((S.spaceBlend - 0.58) / 0.35, 0, 1);
      driveScreenFade(dt, t * t * (3 - 2 * t));
    }
    inner.update(S.x, S.z);
    outer.update(S.x, S.z);
    houses.update(!!PLANET.land.city, S.x, S.z);
    // ── cloud visibility is INSTANT and GEOMETRIC: camY vs the waterline.
    // The old gate (smoothed S.underwater ramp) kept clouds hidden for ~1 s
    // after surfacing — the "clouds gone for a second" glitch. The billboard
    // sprites + dome still hide while genuinely under (they looked marbled
    // through the surface), but they flip exactly at the crossing frame, in
    // both directions, so the sky above water is never missing its clouds.
    const subNow = PLANET.land.waterLvl > -1e5 && S.camY < PLANET.land.waterLvl;
    clouds.update(dt, S.x, S.z, S.camY, S.hour, S.spaceBlend, !subNow, S.cloudCov);
    // altitude-projected cloud dome — follows the camera, fades out in space/underwater
    if (cloudDome) cloudDome.position.copy(camera.position);
    uCloudTime.value += dt;
    uCloudHaze.value = S.haze;
    uCloudDry.value = (1 - clamp(S.spaceBlend, 0, 1)) * (subNow ? 0 : 1)
                    * clamp((S.cloudCov !== undefined ? S.cloudCov : 0.45) * 6, 0, 1);
    uCloudCov.value = S.cloudCov !== undefined ? S.cloudCov : 0.45;
    try { uCloudSunDir.value.copy(water.lighting.sun.direction).normalize(); } catch (e) {}
    try {
      const Pc = skyAt(S.hour);
      const dc = Pc && Pc.zen ? clamp((Pc.zen[0] + Pc.zen[1] + Pc.zen[2]) * 0.4, 0.25, 1.12) : 0.9;
      uCloudTint.value.set(dc, dc, dc * 1.02);
      if (Pc && Pc.glow) uCloudSunCol.value.set(Pc.glow[0], Pc.glow[1], Pc.glow[2]);
    } catch (e) {}

    // sun + sky follow the clock; the water's light, sparkle, reflections
    // and the sky dome all read from the same uniforms
    const { elevation, azimuth } = sunAngles(S.hour);
    // electro-plankton: alive at night, near or under real water only
    {
      const nightA = clamp(1 - (elevation + 3) / 9, 0, 1) * (1 - clamp(S.spaceBlend, 0, 1));
      const nearWater = PLANET.land.waterLvl > -1e5 ? clamp(1 - S.camY / 90, 0, 1) : 0;
      // electro-plankton RETIRED (2026-07-06, user call): the procedural
      // patches read as glitchy/inconsistent — night-ocean light now comes
      // from the moon. Pass 0 so every plankton element stays dark/hidden.
      plankton.update(now, S.x, S.z, 0, 0);
      nightStars.update(camera.position, nightA, S.spaceBlend, skyAt(S.hour).g);
    }
    // ── night: the MOON takes over as the water's light source — a cool dim
    // key light at the painted moon's sky position, so the sea carries a real
    // moonglade (specular path) instead of going pitch black. The handoff
    // happens deep in twilight where the sun is already at its 0.03 floor, so
    // the source swap is invisible.
    const nightW = clamp((-elevation - 2) / 8, 0, 1);
    if (nightW > 0.6) {
      const mseedL = (PLANET.land && PLANET.land.seed ? PLANET.land.seed[0] : 7);
      const fruL = (x) => x - Math.floor(x);
      const moonU = fruL(mseedL * 0.317 + 0.13);
      const moonV = 0.375 + 0.055 * fruL(mseedL * 0.53);   // matches the painted primary moon (low sky)
      water.lighting.sun.update({
        azimuth: moonU * 360,
        elevation: clamp((0.5 - moonV) * 180, 12, 22),
        // low moon + 0.42: a long visible glade down the water, while
        // snow/terrain stay night-dark
        intensity: 0.42 * nightW * (1 - S.spaceBlend * 0.5),
        diskColor: "#d9e6ff",
      });
    } else {
      water.lighting.sun.update({
        azimuth,
        elevation: Math.max(elevation, -12),
        // night floor 0.03: the dark-sea base the moon key light sits on
        intensity: clamp(0.03 + smoothstep(-6, 30, elevation) * 1.24, 0.03, 1.3) * (1 - S.spaceBlend * 0.5),
        diskColor: elevation < 12 ? "#ffcf9e" : "#fff6e0",
      });
    }
    // sky repaint scheduling. Three situations demand a much faster repaint
    // than the idle day-cycle drip (28 rows ≈ 18 frames):
    //   · dragging the time slider — the sky must chase the thumb or the
    //     track feels broken (the v4 slider was instant; this is our match)
    //   · the ascent — spaceBlend darkens the paint, and a lagging repaint
    //     made the climb dim in visible steps (the "jerky" handoff)
    //   · crossing the waterline — the submerged sky drops its cloud paint
    // uwSky retired: the painted sky KEEPS its clouds underwater (seeing the
    // cloudscape through the surface from below is realistic), so crossings
    // trigger no repaint at all — the repaint latency was the other half of
    // the "clouds gone for a second" glitch, and skipping it saves the
    // urgent-repaint + PMREM-rebake spike right at the splash moment.
    const uwSky = 0;
    const skyDelta = Math.abs(S.hour - lastSkyPaint);
    const sbDelta = Math.abs(S.spaceBlend - lastSkyBlend);
    // urgent = must chase the user (slider drag, big jump, waterline). The
    // ascent is deliberately NOT urgent: a 0.02-blend threshold at 128 rows
    // meant near-continuous full-speed repainting during the whole climb —
    // the residual "choppy transition" was those paint spikes. The climb now
    // repaints lazily (the DOM black fade owns the final darkening anyway).
    const urgent = timeDrag || skyDelta > 0.5 || uwSky !== lastSkyUw;
    // a stale in-flight job chasing an old hour gets replaced, not awaited —
    // this is what makes scrubbing the slider track feel continuous
    if (skyJob && (Math.abs(skyJob.hour - S.hour) > 0.35 || skyJob.uw !== uwSky)) skyJob = null;
    if (!skyJob && (urgent || skyDelta > 0.06 || sbDelta > 0.08)) {
      startSkyRepaint(S.hour, S.spaceBlend, uwSky);
      lastSkyPaint = S.hour; lastSkyBlend = S.spaceBlend; lastSkyUw = uwSky;
    }
    if (stepSkyRepaint(urgent ? 128 : S.spaceBlend > 0.01 ? 64 : 28)) {
      skyTex.needsUpdate = true;
      // CRITICAL: re-bake the water's PMREM reflection environment. The
      // library bakes it ONCE from the equirect — without this the sea keeps
      // reflecting whatever sky it was born with (a bright day at midnight,
      // and reflections that never chased the time slider). Rate-limited: the
      // bake is a real GPU job, and while the cycle drips repaints (or the
      // slider scrubs) baking on EVERY completion stacked visible hitches.
      if (now - (lastPmremBake || -9) > 1.5) {
        lastPmremBake = now;
        try { sky.uploadSource(renderer); } catch (e) {}
      }
    }
    // fog tracks the horizon colour; HAZE pulls it closer, ascent thins it out
    {
      const P = skyAt(S.hour);
      const ft = (PLANET.land && PLANET.land.skyTint) || [1, 1, 1];
      // fog color must never be BRIGHTER than the sky behind it: at twilight
      // the raw horizon colour outshines the darkened sky dome, so heavily
      // fogged distant ridges converged toward a LUMINOUS colour — the last
      // ingredient of the dashed-horizon-line bug. Dim fog with the sky.
      const fogDG = clamp((P.zen[0] + P.zen[1] + P.zen[2]) * 2.4 - 0.22, 0, 1);
      // sun-elevation gate: haze brightness must die WITH the sun, not with
      // the zenith — a zenith-based gate alone left far ridges fogged bright
      // cream after sundown (the pale jagged "cutout" band behind the peaks)
      const sunGate = clamp(0.22 + smoothstep(-13, 8, elevation) * 0.78, 0.22, 1);
      const fmul = (0.15 + 0.85 * fogDG) * sunGate;
      // THE "mountains get brighter as the sun sets" bug: the water preset's
      // hemisphere light is a CONSTANT warm 0.34 — as the sky and fog dimmed
      // around it, the ambient-lit peaks read as glowing brighter. Chain the
      // hemisphere to the sun's own elevation (proved live: dimming this
      // light is what finally lets the mountains fall into dusk).
      try {
        const hemi = water.lighting._hemisphereLight;
        if (hemi) {
          if (hemiBase === null) hemiBase = hemi.intensity;
          hemi.intensity = hemiBase * (0.10 + 0.90 * smoothstep(-10, 20, elevation));
        }
      } catch (e) {}
      scene.fog.color.setRGB(P.hor[0] * ft[0] * fmul, P.hor[1] * ft[1] * fmul, P.hor[2] * ft[2] * fmul);
      const thin = 1 + S.spaceBlend * 5;
      let near = (1400 - S.haze * 1100) * thin;
      let far  = (17000 - S.haze * 9000) * thin;
      // cloud-passing haze: as the camera crosses the cloud deck, whiten the fog
      // and pull it right in so ascent feels like flying THROUGH cloud (a soft
      // whiteout) rather than clipping past hard sprite cards. Eased in/out.
      const pa = clouds.passAmt || 0;
      if (pa > 0.002) {
        const day = clamp((P.zen[0] + P.zen[1] + P.zen[2]) * 0.9, 0.2, 1.0);
        // GENTLE cloud haze, not a whiteout flash: much lower weight, the tint
        // stays close to the horizon colour (never near-white), and the fog
        // only draws in modestly. Passing the deck now reads as a soft misting,
        // not the abrupt "flash of white at altitude".
        // Immersive but GRADUAL: pa² ramps smoothly over the ~220 m deck so it
        // envelops you like flying through cloud, never the abrupt "flash". At
        // the dense core you're wrapped in soft white with short view distance.
        const w = pa * pa * 0.92;
        scene.fog.color.setRGB(
          lerp(P.hor[0], 0.85 * day, w), lerp(P.hor[1], 0.88 * day, w), lerp(P.hor[2], 0.93 * day, w));
        near = lerp(near, 90, w);
        far  = lerp(far, 1150, w);
      }
      // ── night fog pull-in: THE "dashed white horizon line" (scene-bisect
      // verified) was the farthest tile ring's SNOW CAPS catching the night
      // key light while nearer terrain sat dark — floating bright strokes at
      // the horizon. At night the fog draws in hard so distant ridges melt
      // into the dark instead of glinting above it.
      {
        const nW = clamp((-elevation - 2) / 8, 0, 1);
        near *= 1 - 0.55 * nW;
        far  *= 1 - 0.85 * nW;
      }
      scene.fog.near = near;
      scene.fog.far = far;
      // the water library's OWN atmospheric fog carries a fixed preset colour
      // (peach for "dusk") — at night it painted the glowing horizon line and
      // a warm wash on the sea. Chain it to the same palette as scene.fog.
      try {
        const fc = water.atmosphericFogPass._color;
        const c = fc && fc.value ? fc.value : fc;
        if (c && c.setRGB) c.setRGB(scene.fog.color.r, scene.fog.color.g, scene.fog.color.b);
        // THE HORIZON BAND FIX: the fog pass "sky-blends" every pixel beyond
        // ~5.4 km toward a BLURRED sky sample. Around the horizon that sample
        // is the bright skyline smeared downward, so all far terrain in the
        // horizon strip was repainted as a hard glowing band that cut through
        // mountains (worst at dusk, when the skyline is at max brightness vs
        // dark land). Verified live: pushing the blend distance out of reach
        // restores true silhouettes. Enforced per-frame because loadPreset
        // resets it. scene.fog + our palette fog colour own the atmosphere.
        const sbd = water.atmosphericFogPass._skyBlendDistance;
        if (sbd && sbd.value !== undefined) sbd.value = 1e8;
      } catch (e) {}
    }

    // caustics drive: strongest submerged, softly present near the surface
    const hasWater = PLANET.land.waterLvl > -1e5;
    uCausticAmt.value = hasWater ? (0.30 + 1.45 * S.underwater) * Math.max(S.waterProx, S.underwater) * UW.caustics : 0;
    uCausticTime.value = now * 0.9;

    camera.position.set(S.x, S.camY, S.z);
    camera.rotation.set(S.pitch, -S.hdg, S.roll);

    await water.update(dt);
    music.frame();
    postProcessing.render();
    hudUpdate(navTick++);
    // first frame is on screen → reveal the scene behind the splash card, then
    // warm the (deferred) space rig during idle so it's ready before a launch
    if (!sceneReady) {
      sceneReady = true;
      setLoad(100);
      // let the bar visibly reach 100%, THEN fade the environment in (not abrupt)
      // — and re-arm the black overlay so the world crossfades in over ~2 s in
      // sync with the splash lifting, instead of popping in fully lit
      screenFade = 1;
      setTimeout(() => document.getElementById("start")?.classList.add("ready"), 320);
      const warm = () => ensureSpaceRig();
      if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2500 });
      else setTimeout(warm, 600);
    }
  }
  animate();
}

// ── HUD & input wiring ───────────────────────────────────────────────────────
function hudUpdate(navTick = 0) {
  // HUD text doesn't need 60fps — DOM writes every frame are a needless
  // main-thread cost. Update the readouts every 3rd frame (still ~20/s).
  if ((navTick % 3) !== 0) return;
  const deg = ((S.hdg * 180 / Math.PI) % 360 + 360) % 360;
  const CARD = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  let modeLbl, altLbl, spdLbl;
  if (S.mode === "terrain") {
    const under = PLANET.land.waterLvl > -1e5 && S.camY < WATER_LVL;
    modeLbl = under ? "SUBMERGED" : (S.camY < 2500 ? "SURFACE" : (S.camY < 16000 ? "ASCENT" : "EXOSPHERE"));
    altLbl = under ? Math.round(WATER_LVL - S.camY) + " M DEPTH"
      : (S.camY < 10000 ? String(Math.max(0, Math.round(S.camY))).padStart(4, "0") + " M"
                        : (S.camY / 1000).toFixed(1) + " KM");
    spdLbl = S.effSpd < 1000 ? String(Math.round(S.effSpd)).padStart(2, "0") + " M/S"
                             : (S.effSpd / 1000).toFixed(1) + " KM/S";
  } else {
    const near = nearestBodies();
    modeLbl = S.warping && S._tgtName ? "WARP → " + S._tgtName
      : (near[0].dist < near[0].b.r * 2 ? "ORBIT — " + near[0].b.name : "DEEP SPACE");
    altLbl = fmtKm(near[0].dist);
    spdLbl = S.effSpd >= 1e6 ? (S.effSpd / 1e6).toFixed(1) + " MM/S" : (S.effSpd / 1000).toFixed(1) + " KM/S";
  }
  document.getElementById("ro-mode").textContent = modeLbl;
  document.getElementById("ro-alt").textContent = altLbl;
  document.getElementById("ro-hdg").textContent =
    String(Math.round(deg)).padStart(3, "0") + "° " + CARD[Math.round(deg / 45) % 8];
  document.getElementById("ro-spd").textContent = spdLbl;

  // keep the altitude knob display in step with key/drag climbing
  // (set() writes S.altitude back — never call it while diving below 25 m)
  if ((navTick & 15) === 0 && S.mode === "terrain" && S.altitude >= 25
      && typeof altKnob !== "undefined")
    altKnob.set(S.altitude, false);

  // nav rows (throttled)
  if ((navTick & 15) === 0) {
    const rows = document.getElementById("nav-rows");
    if (!rows) return;
    if (S.mode === "space") {
      const near = nearestBodies().slice(0, 4);
      const fwd = camForward();
      rows.innerHTML = near.map(n => {
        const l = Math.hypot(...n.dir) || 1;
        const aim = (n.dir[0] * fwd[0] + n.dir[1] * fwd[1] + n.dir[2] * fwd[2]) / l > 0.992;
        const isTgt = S.navTarget === n.b;
        return `<div class="nav-row${aim || isTgt ? " aim" : ""}" data-b="${n.b.name}" title="click target · R warp · E enter">` +
               `${isTgt ? "⇢ " : ""}<b>${n.b.name}</b> · ${fmtKm(n.dist)}${aim ? " ◆" : ""}</div>`;
      }).join("");
    } else {
      rows.innerHTML = `<div class="nav-row"><b>${PLANET.name}</b> · LOCAL</div>`;
    }
  }
}

addEventListener("keydown", e => {
  if (!S.started) return;                         // lock screen: ignore all flight keys
  keys[e.key.toLowerCase()] = true;
  if (e.key === " ") e.preventDefault();
  if (e.metaKey) keys["meta"] = true;
  if (e.key === "v" || e.key === "V") { enterDiveSite(); e.preventDefault(); }
  if (e.key === "l" || e.key === "L") { launchToOrbit(); e.preventDefault(); }
  if (e.key === "e" || e.key === "E") { enterSelectedWorld(); e.preventDefault(); }
  if ((e.key === "r" || e.key === "R") && S.mode === "space" && !S.warping) {
    S.warping = true; S.lastInput = performance.now() / 1000; e.preventDefault();
  }
});
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; if (!e.metaKey) keys["meta"] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

addEventListener("pointerdown", e => {
  if (!S.started) return;                         // lock screen: no drag-to-steer
  if (e.target.closest("#deck") || e.target.closest("button") || e.target.closest("input")
      || e.target.closest("#hud-nav")) return;
  dragging = true; dragX0 = e.clientX; dragY0 = e.clientY; dragDX = 0; dragDY = 0;
});
addEventListener("pointermove", e => {
  if (dragging) { dragDX = e.clientX - dragX0; dragDY = e.clientY - dragY0; }
});
addEventListener("pointerup", () => { dragging = false; dragDX = 0; dragDY = 0; });

// ── v2 rotary knob widget (ported verbatim) ──────────────────────────────────
function arcPath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const KA0 = Math.PI * 0.75, KA1 = Math.PI * 2.25;
function makeKnob(parent, { key, label, min, max, def, fmt, onSet, curve }) {
  const el = document.createElement("div");
  el.className = "knob";
  el.innerHTML = `<svg viewBox="0 0 44 44">
    <path d="${arcPath(22, 22, 17, KA0, KA1)}" stroke="rgba(255,255,255,0.10)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path class="val-arc" d="" stroke="rgba(240,240,240,0.85)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle class="dot" r="1.8" fill="#ff9d8a"/>
  </svg>
  <div class="k-val"></div><div class="k-lbl">${label}</div>`;
  parent.appendChild(el);
  const arc = el.querySelector(".val-arc");
  const dot = el.querySelector(".dot");
  const valEl = el.querySelector(".k-val");
  const toVal = n => curve === "log" ? min * Math.pow(max / min, n) : min + (max - min) * n;
  const toN = v => curve === "log" ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  let val = def;
  function render() {
    const n = Math.min(1, Math.max(0, toN(val)));
    const a = KA0 + n * (KA1 - KA0);
    arc.setAttribute("d", n > 0.004 ? arcPath(22, 22, 17, KA0, a) : "");
    dot.setAttribute("cx", (22 + 12.5 * Math.cos(a)).toFixed(2));
    dot.setAttribute("cy", (22 + 12.5 * Math.sin(a)).toFixed(2));
    valEl.textContent = fmt ? fmt(val) : val.toFixed(2);
  }
  function set(v, fire = true) {
    val = Math.min(max, Math.max(min, v));
    S[key] = val;
    render();
    if (fire && onSet) onSet(val);
  }
  let dragN = 0, active = false, dragY = 0;
  el.addEventListener("pointerdown", e => {
    dragY = e.clientY; dragN = toN(val); active = true;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  el.addEventListener("pointermove", e => {
    if (!active) return;
    const fine = e.shiftKey ? 0.22 : 1;
    set(toVal(Math.min(1, Math.max(0, dragN + (dragY - e.clientY) / 150 * fine))));
  });
  el.addEventListener("pointerup", () => active = false);
  el.addEventListener("pointercancel", () => active = false);
  el.addEventListener("dblclick", () => set(def));
  set(def, false);
  S[key] = val;
  return { set, get: () => val };
}
const pct = v => Math.round(v * 100) + "%";
const fmtAltKnob = v => v < 1000 ? Math.round(v) + " m" : (v / 1000).toFixed(v < 10000 ? 1 : 0) + " km";
makeKnob(document.getElementById("sec-flight"), { key: "speed", label: "Speed", min: 6, max: 80, def: 26, fmt: v => Math.round(v) + " m/s" });
const altKnob = makeKnob(document.getElementById("sec-flight"), { key: "altitude", label: "Altitude", min: 25, max: 60000, def: 60, fmt: fmtAltKnob, curve: "log" });
makeKnob(document.getElementById("sec-atmos"), { key: "haze", label: "Haze", min: 0, max: 1, def: 0.05, fmt: pct });
// cloud-cover dial: 0 = bare sky (VULKAR default), 1 = heavy overcast — drives
// the painted-sky deck, the parallax dome and the billboard clusters together
const cloudKnob = makeKnob(document.getElementById("sec-atmos"), { key: "cloudCov", label: "Clouds", min: 0, max: 1, def: 0.45, fmt: pct,
  onSet: () => { lastSkyPaint = -99; } });
makeKnob(document.getElementById("sec-engine"), { key: "density", label: "Density", min: 0, max: 1, def: 0.5, fmt: pct });
makeKnob(document.getElementById("sec-engine"), { key: "melody", label: "Melody", min: 0, max: 1, def: 0.55, fmt: pct });
makeKnob(document.getElementById("sec-engine"), { key: "drift", label: "Drift", min: 0, max: 1, def: 0.4, fmt: pct });
makeKnob(document.getElementById("sec-engine"), { key: "tone", label: "Tone", min: 0, max: 1, def: 0.6, fmt: pct });
makeKnob(document.getElementById("sec-space"), { key: "reverb", label: "Reverb", min: 0, max: 1, def: 0.65, fmt: pct, onSet: () => music.rebuildIR() });
makeKnob(document.getElementById("sec-space"), { key: "wind", label: "Wind", min: 0, max: 1, def: 0.5, fmt: pct });
makeKnob(document.getElementById("sec-space"), { key: "level", label: "Level", min: 0, max: 1, def: 0.75, fmt: pct });

// ── time track (v2 gradient slider) ──────────────────────────────────────────
const timeTrack = document.getElementById("time-track");
const timeThumb = document.getElementById("time-thumb");
function fmtClock(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}
function renderTime() {
  timeThumb.style.left = (S.hour / 24 * 100) + "%";
  document.getElementById("time-val").textContent = fmtClock(S.hour);
  document.getElementById("clock").textContent = fmtClock(S.hour);
}
window.__renderTime = renderTime;
function timeFromEvent(e) {
  const r = timeTrack.getBoundingClientRect();
  S.hour = Math.min(23.99, Math.max(0, (e.clientX - r.left) / r.width * 24));
  renderTime();
}
let timeDrag = false;
timeTrack.addEventListener("pointerdown", e => { timeDrag = true; try { timeTrack.setPointerCapture(e.pointerId); } catch (_) {} timeFromEvent(e); });
timeTrack.addEventListener("pointermove", e => { if (timeDrag) timeFromEvent(e); });
timeTrack.addEventListener("pointerup", () => timeDrag = false);
timeTrack.addEventListener("pointercancel", () => timeDrag = false);
renderTime();

// ── chips + world buttons ────────────────────────────────────────────────────
function chip(id, key, cb) {
  const el = document.getElementById(id);
  el.addEventListener("click", () => {
    S[key] = !S[key];
    el.classList.toggle("on", S[key]);
    if (cb) cb(S[key]);
  });
  return el;
}
chip("chip-auto", "auto");
chip("chip-cycle", "cycle");
chip("chip-music", "musicPanelOn", on => {
  document.getElementById("music-panel").classList.toggle("on", on);
  if (on) music.wake(true);
});
const zenChip = chip("chip-zen", "zen", on => document.body.classList.toggle("zen", on));
document.getElementById("zen-exit").addEventListener("click", () => {
  S.zen = false; document.body.classList.remove("zen"); zenChip.classList.remove("on");
});
const stillBtn = document.getElementById("btn-still");
stillBtn.addEventListener("click", () => {
  S.hold = !S.hold;
  stillBtn.textContent = S.hold ? "Resume" : "Hold";
});
document.getElementById("btn-launch").addEventListener("click", launchToOrbit);
document.getElementById("btn-dive").addEventListener("click", enterDiveSite);
document.getElementById("btn-seed").addEventListener("click", () => {
  SEED = [Math.floor(Math.random() * 8000), Math.floor(Math.random() * 8000)];
  findSpawn();
  toast("NEW RANGE — " + PLANET.name);
});
document.getElementById("nav-rows").addEventListener("click", e => {
  const row = e.target.closest(".nav-row");
  if (!row || !row.dataset.b) return;
  const b = SYS.find(x => x.name === row.dataset.b);
  if (b && !b.emissive) {
    S.navTarget = (S.navTarget === b) ? null : b;
    if (S.navTarget) toast("TARGET — " + b.name + " · R TO WARP");
  }
});
document.getElementById("btn-motif").addEventListener("click", () => music.wake(true));

// ── music panel selects + sliders ────────────────────────────────────────────
{
  const keySel = document.getElementById("music-key");
  music.NOTE_NAMES.forEach((name, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = name;
    keySel.appendChild(opt);
  });
  keySel.value = String(music.keyRoot);
  keySel.addEventListener("change", () => music.setKey(keySel.value));

  const scaleSel = document.getElementById("music-scale");
  Object.entries(music.MODES).forEach(([value, mode]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = mode.label || mode.name || value;
    scaleSel.appendChild(opt);
  });
  scaleSel.value = S.musicMode;
  scaleSel.addEventListener("change", () => music.setMode(scaleSel.value));

  document.querySelectorAll("[data-music-param]").forEach(input => {
    const key = input.dataset.musicParam;
    input.value = S[key];
    input.addEventListener("input", () => {
      S[key] = Number(input.value);
      if (key === "reverb") music.rebuildIR();
    });
  });
}

// ── water preset dropdown (the library's sea states) ─────────────────────────
{
  const sel = document.getElementById("water-preset");
  for (const name of PRESETS) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name.toUpperCase();
    sel.appendChild(opt);
  }
  sel.value = "dusk";
  sel.addEventListener("change", () => loadWaterPreset(sel.value));
}

// ── underwater settings panel ────────────────────────────────────────────────
{
  const chip = document.getElementById("chip-uw");
  const panel = document.getElementById("uw-panel");
  chip.addEventListener("click", () => {
    const on = chip.classList.toggle("on");
    panel.classList.toggle("show", on);
  });
  const bind = (id, key, cb) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = (key === "tint") ? UW.tint : UW[key];
    el.addEventListener("input", () => {
      UW[key] = (key === "tint") ? el.value : Number(el.value);
      if (cb) cb();
      applyUnderwater();
    });
  };
  bind("uw-bright",  "bright");
  bind("uw-caust",   "caustics");   // also live-scales the terrain caustics uniform
  bind("uw-cscale",  "cscale");
  bind("uw-shaft",   "shaft");
  bind("uw-wobble",  "wobble");
  bind("uw-murk",    "murk");
  bind("uw-tint",    "tint");
}

// fade the hint line after a while, like v2
setTimeout(() => { const h = document.getElementById("hint"); if (h) h.style.opacity = "0"; }, 16000);

// Start rendering immediately so the landscape moves behind the intro card
// (matches the old v2 intro feel); BEGIN just fades the overlay.
main().catch(err => {
  console.error(err);
  document.getElementById("err").style.display = "flex";
  document.getElementById("err").firstElementChild.innerHTML =
    "Startup error:<br>" + String(err).slice(0, 300) + "<br><br>The previous build is <b>v2.html</b>.";
});
document.getElementById("btn-begin").addEventListener("click", () => {
  document.getElementById("start").classList.add("gone");
  S.started = true;                     // unfreeze the sim + enable input
  S.lastInput = performance.now() / 1000;
  music.wake(true);
});
