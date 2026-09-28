import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* UMBRAL / La selva respira
   1. Estado y render · 2. Arte procedural · 3. Mundo y fauna
   4. Ecología y acciones · 5. Interfaz · 6. Entrada · 7. Simulación.
   Un único estado de pantalla controla ratón, simulación y menús.
   Las respuestas ecológicas son un modelo didáctico, no una predicción.
*/
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2,
  clamp = THREE.MathUtils.clamp,
  mix = THREE.MathUtils.lerp;
let seed = 346923;
function rng() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rand = (a, b) => a + rng() * (b - a),
  pick = (a) => a[Math.floor(rng() * a.length)];
const state = {
  screen: "welcome",
  time: 0,
  health: 100,
  oxygen: 100,
  food: 100,
  wood: 0,
  fiber: 0,
  fruit: 0,
  seeds: 2,
  planted: 0,
  cut: 0,
  hunted: 0,
  observed: new Set(),
  sites: new Set(),
  fieldScore: 0,
  naturalistBadge: false,
  scenario: "none",
  eco: 100,
  water: 100,
  biodiversity: 100,
  poison: 0,
  attack: 0,
  rain: false,
  daylight: 1,
  shelter: null,
  won: false,
  explore: false,
  muted: false,
  exhausted: false,
  controller: false,
  quality: "medium",
  lastCause: "heridas",
  lastStep: 0,
  thrust: 0,
};
const keys = new Set(),
  entities = [],
  trees = [],
  animals = [],
  bushes = [],
  fish = [],
  glows = [],
  drops = [];
let target = null,
  yaw = 0,
  pitch = -0.06,
  dragging = false,
  lockPending = false,
  wasLocked = false;
let journalPage = "identity",
  journalReturn = "playing",
  toastUntil = 0,
  padPrevious = [],
  padNav = 0;
const eye = 1.68,
  player = new THREE.Vector3(-6, 0, 18),
  direction = new THREE.Vector3(),
  tmp = new THREE.Vector3();
const camera = new THREE.PerspectiveCamera(
  65,
  innerWidth / innerHeight,
  0.08,
  240,
);
camera.rotation.order = "YXZ";
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$("world").appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x91a892, 0.018);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.22,
  0.65,
  1.1,
);
composer.addPass(bloom);
const outputPass = new OutputPass();
composer.addPass(outputPass);
const hemi = new THREE.HemisphereLight(0xd1e3d5, 0x38482f, 2.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdda1, 3.1);
sun.position.set(-25, 35, -25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -48,
  right: 48,
  top: 48,
  bottom: -48,
  near: 1,
  far: 125,
});
sun.shadow.bias = -0.00008;
sun.shadow.normalBias = 0.045;
sun.shadow.radius = 3;
scene.add(sun);
const moon = new THREE.DirectionalLight(0x93bbc5, 0.15);
moon.position.set(20, 35, -10);
scene.add(moon);
const coolFill = new THREE.DirectionalLight(0xa6cddd, 0.18);
coolFill.position.set(25, 18, 25);
scene.add(coolFill);
const leafLight = { value: new THREE.Vector3() };
const leafTransmission = { value: 0.14 };
const clock = new THREE.Clock(),
  raycaster = new THREE.Raycaster();
const waterLevel = 0.1;

// ---------- Geometría, texturas propias y materiales compartidos ----------
function texture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const barkMap = texture(256, (c, s) => {
  c.fillStyle = "#7b7660";
  c.fillRect(0, 0, s, s);
  for (let i = 0; i < 1700; i++) {
    const x = rand(0, s),
      y = rand(0, s);
    c.strokeStyle = `rgba(${rng() < 0.5 ? "32,34,26" : "177,168,130"},${rand(0.04, 0.26)})`;
    c.lineWidth = rand(0.3, 2.7);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + rand(-3, 3), y + rand(5, 55));
    c.stroke();
  }
});
barkMap.wrapS = barkMap.wrapT = THREE.RepeatWrapping;
barkMap.repeat.set(2, 3);
const floorMap = texture(256, (c, s) => {
  c.fillStyle = "#7d7960";
  c.fillRect(0, 0, s, s);
  for (let i = 0; i < 5500; i++) {
    c.fillStyle = pick(["#626950", "#8a8a67", "#585e47", "#9b926b", "#494e3b"]);
    c.globalAlpha = rand(0.1, 0.6);
    c.fillRect(rand(0, s), rand(0, s), rand(1, 5), rand(1, 4));
  }
  c.globalAlpha = 1;
});
floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
floorMap.repeat.set(28, 28);
const leafMap = texture(128, (c, s) => {
  c.clearRect(0, 0, s, s);
  const g = c.createLinearGradient(15, 100, 103, 18);
  g.addColorStop(0, "#91a55e");
  g.addColorStop(0.55, "#d4df99");
  g.addColorStop(1, "#839d54");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(64, 125);
  c.bezierCurveTo(5, 82, 14, 26, 66, 3);
  c.bezierCurveTo(113, 31, 125, 84, 64, 125);
  c.fill();
  c.strokeStyle = "#516d3455";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(64, 124);
  c.lineTo(66, 5);
  for (let y = 30; y < 115; y += 13) {
    c.moveTo(65, y);
    c.lineTo(25, y - 21);
    c.moveTo(65, y);
    c.lineTo(104, y - 21);
  }
  c.stroke();
});
const dotMap = texture(64, (c, s) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "#ffffffff");
  g.addColorStop(0.22, "#ffffffe0");
  g.addColorStop(1, "#ffffff00");
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
});
function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extra });
}
const mats = {
  bark: material(0x706751, { map: barkMap }),
  root: material(0x665e47, { map: barkMap }),
  rock: material(0x777d65, { map: floorMap }),
  moss: material(0x667f41),
  wood: material(0x967549, { map: barkMap }),
  fruit: material(0xd69744, { roughness: 0.6 }),
  dark: material(0x1a251d),
  ivory: material(0xd5cc9e),
  leaf: material(0x8eaa5c, {
    map: leafMap,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  }),
  water: material(0x578572),
  gold: material(0xa69360),
};
const sphere = new THREE.SphereGeometry(1, 20, 14),
  ico = new THREE.IcosahedronGeometry(1, 1);
function part(parent, geo, mat, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function ellipsoid(parent, mat, pos, scale) {
  return part(parent, sphere, mat, pos, scale);
}
function branchGeometry(a, b, r1, r2, segments = 7) {
  const av = new THREE.Vector3(...a),
    bv = new THREE.Vector3(...b),
    v = bv.clone().sub(av);
  const geo = new THREE.CylinderGeometry(r2, r1, v.length(), segments, 1);
  geo.applyMatrix4(
    new THREE.Matrix4().compose(
      av.add(bv).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.normalize(),
      ),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  return geo;
}
function branch(parent, a, b, r1, r2, mat = mats.bark) {
  return part(parent, branchGeometry(a, b, r1, r2), mat);
}
function tube(parent, points, radius, mat) {
  return part(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      18,
      radius,
      5,
      false,
    ),
    mat,
  );
}
function register(obj, data) {
  const e = { obj, ...data };
  obj.traverse((o) => (o.userData.entity = e));
  entities.push(e);
  return e;
}

// ---------- Fase 1: terreno coherente, senderos y materiales por bioma ----------
// Ruido de valor suave y FBM con dominio deformado; no consume el RNG de la fauna.
function terrainHash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7 + 83.19) * 43758.5453;
  return n - Math.floor(n);
}
function noise2(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  return mix(
    mix(terrainHash(ix, iz), terrainHash(ix + 1, iz), u),
    mix(terrainHash(ix, iz + 1), terrainHash(ix + 1, iz + 1), u),
    v,
  );
}
function fbm(x, z, octaves = 4) {
  let value = 0,
    amplitude = 0.5,
    weight = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise2(x, z) * amplitude;
    weight += amplitude;
    const nx = x * 1.93 + z * 0.21 + 13.2;
    z = z * 1.97 - x * 0.18 + 7.6;
    x = nx;
    amplitude *= 0.48;
  }
  return value / weight;
}
const smooth = THREE.MathUtils.smoothstep;
const forestLayout = [
  [-10, 16, 1.18],
  [-17, 8, 1.1],
  [9, 19, 1.04],
  [17, 8, 1.15],
  [-20, -5, 1],
  [16, -15, 1.1],
  [-8, -19, 1.05],
  [7, -24, 1.12],
];
for (let i = 8; i < 30; i++) {
  const a = ((i - 8) * TAU) / 22 + (terrainHash(i, 2) - 0.5) * 0.3;
  const r = 28 + terrainHash(i, 5) * 15;
  forestLayout.push([
    Math.cos(a) * r,
    Math.sin(a) * r,
    0.8 + terrainHash(i, 6) * 0.45,
  ]);
}
function shoreRadius(x, z) {
  const r = Math.hypot(x / 15, (z + 3) / 10);
  return (
    r + (noise2(x * 0.12 + 10, z * 0.12) - 0.5) * 0.12 * smooth(r, 0.5, 1.1)
  );
}
function pathMask(x, z) {
  const bankPath = Math.abs(shoreRadius(x, z) - 1.94) * 13;
  const entryPath =
    z > 15 ? Math.abs(x + 6 - Math.sin((z - 18) * 0.14) * 1.8) : 99;
  return 1 - smooth(Math.min(bankPath, entryPath), 0.35, 1.35);
}
function canopyCover(x, z) {
  let cover = 0;
  for (const [tx, tz, size] of forestLayout) {
    const d2 = (x - tx) ** 2 + (z - tz) ** 2;
    if (d2 < 100) cover += Math.exp(-d2 / (18 * size));
  }
  return clamp(cover, 0, 1);
}
function height(x, z) {
  const r = shoreRadius(x, z);
  const warp = (noise2(x * 0.037 + 31, z * 0.037) - 0.5) * 4;
  const hills = (fbm((x + warp) * 0.046, (z - warp) * 0.046, 5) - 0.45) * 4.6;
  const micro = (noise2(x * 0.55, z * 0.55) - 0.5) * 0.09;
  const bank = smooth(r, 0.82, 1.95);
  const rim =
    smooth(Math.hypot(x, z), 37, 54) * (3.2 + fbm(x * 0.08, z * 0.08) * 3);
  const trail = pathMask(x, z) * smooth(r, 1.3, 1.7);
  return (
    mix(-1.6 + Math.min(r, 1.3) * 0.48, 1.05 + hills, bank) +
    rim +
    micro * bank * (1 - trail * 0.8) -
    trail * 0.08
  );
}
function wet(x, z) {
  return height(x, z) < waterLevel - 0.15 && shoreRadius(x, z) < 1.7;
}
function dryPoint(min = 0, max = 45) {
  for (let i = 0; i < 240; i++) {
    const x = rand(-max, max),
      z = rand(-max, max);
    if (
      !wet(x, z) &&
      Math.hypot(x - player.x, z - player.z) > min &&
      shoreRadius(x, z) > 1.3
    )
      return [x, z];
  }
  return [25, 20];
}
function groundSlope(x, z) {
  const dx = (height(x + 0.25, z) - height(x - 0.25, z)) * 2;
  const dz = (height(x, z + 0.25) - height(x, z - 0.25)) * 2;
  return Math.hypot(dx, dz);
}
// Las normales son datos lineales; no deben convertirse de sRGB.
function normalFromTexture(map, strength = 2, tileSize = map.image.width) {
  const image = map.image,
    w = image.width,
    h = image.height;
  const pixels = image.getContext("2d").getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  function luminance(x, y, bx, by) {
    const xx = bx + ((x - bx + tileSize) % tileSize);
    const yy = by + ((y - by + tileSize) % tileSize);
    const i = (yy * w + xx) * 4;
    return (
      (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) /
      255
    );
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const bx = Math.floor(x / tileSize) * tileSize,
        by = Math.floor(y / tileSize) * tileSize;
      const dx =
        (luminance(x - 1, y, bx, by) - luminance(x + 1, y, bx, by)) * strength;
      const dy =
        (luminance(x, y - 1, bx, by) - luminance(x, y + 1, bx, by)) * strength;
      const length = Math.hypot(dx, dy, 1),
        i = (y * w + x) * 4;
      out[i] = ((dx / length) * 0.5 + 0.5) * 255;
      out[i + 1] = ((dy / length) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  const result = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.magFilter = THREE.LinearFilter;
  result.flipY = map.flipY;
  result.generateMipmaps = true;
  result.needsUpdate = true;
  return result;
}
const groundAtlas = texture(512, (ctx) => {
  const bases = [
    [127, 112, 86],
    [115, 111, 76],
    [108, 129, 72],
    [110, 104, 87],
  ];
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile % 2) * 256,
      oy = Math.floor(tile / 2) * 256;
    const pixels = ctx.createImageData(256, 256),
      base = bases[tile];
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const coarse = noise2(x * 0.038 + tile * 30, y * 0.038) - 0.5;
        const fine = terrainHash(x, y + tile * 257) - 0.5;
        const n = coarse * 35 + fine * (tile === 3 ? 8 : 24);
        const i = (y * 256 + x) * 4;
        for (let k = 0; k < 3; k++) pixels.data[i + k] = base[k] + n;
        pixels.data[i + 3] = 255;
      }
    ctx.putImageData(pixels, ox, oy);
    if (tile === 1) {
      for (let j = 0; j < 210; j++) {
        const x = terrainHash(j, 4) * 256,
          y = terrainHash(j, 8) * 256;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, 256, 256);
        ctx.clip();
        ctx.translate(ox + x, oy + y);
        ctx.rotate(terrainHash(j, 9) * TAU);
        ctx.fillStyle = ["#9b8856", "#756d43", "#b09b64", "#605c3d"][j % 4];
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          2 + terrainHash(j, 6) * 3,
          5 + terrainHash(j, 7) * 7,
          0,
          0,
          TAU,
        );
        ctx.fill();
        ctx.strokeStyle = "#504b3244";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (tile === 3) {
      ctx.strokeStyle = "#736c5625";
      ctx.lineWidth = 1;
      for (let j = 0; j < 40; j++) {
        ctx.beginPath();
        const y = oy + j * 6;
        ctx.moveTo(ox, y);
        ctx.bezierCurveTo(ox + 80, y + 3, ox + 150, y - 3, ox + 256, y);
        ctx.stroke();
      }
    }
  }
});
groundAtlas.flipY = false; // Orden de celdas idéntico en albedo y normales.
const groundNormalAtlas = normalFromTexture(groundAtlas, 2.4, 256);
const barkNormal = normalFromTexture(barkMap, 3);
barkNormal.repeat.copy(barkMap.repeat);
for (const name of ["bark", "root", "wood"]) {
  mats[name].normalMap = barkNormal;
  mats[name].normalScale = new THREE.Vector2(0.55, 0.55);
}
const groundUniforms = { uGroundNormal: { value: 1 } };
const terrainGeo = new THREE.PlaneGeometry(108, 108, 180, 180);
terrainGeo.rotateX(-Math.PI / 2);
const groundWeights = [];
for (let i = 0; i < terrainGeo.attributes.position.count; i++) {
  const x = terrainGeo.attributes.position.getX(i),
    z = terrainGeo.attributes.position.getZ(i),
    y = height(x, z);
  terrainGeo.attributes.position.setY(i, y);
  const slope = groundSlope(x, z),
    cover = canopyCover(x, z),
    path = pathMask(x, z);
  const mud = 1 - smooth(y, waterLevel + 0.12, waterLevel + 0.92);
  const moss =
    cover *
    (1 - smooth(slope, 0.25, 0.85)) *
    (1 - path) *
    (0.25 + 0.75 * noise2(x * 0.13, z * 0.13));
  const litter = cover * (1 - path) * 0.85;
  let weights = [
    0.3 + path * 2 + smooth(slope, 0.4, 1.2),
    litter,
    moss,
    mud * 3,
  ];
  if (y < waterLevel) weights = [0.05, 0, 0, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  groundWeights.push(...weights.map((w) => w / total));
}
terrainGeo.setAttribute(
  "groundBlend",
  new THREE.Float32BufferAttribute(groundWeights, 4),
);
terrainGeo.computeVertexNormals();
const terrainMat = material(0xffffff, {
  map: groundAtlas,
  normalMap: groundNormalAtlas,
  normalScale: new THREE.Vector2(0.65, 0.65),
});
terrainMat.onBeforeCompile = (shader) => {
  shader.uniforms.uGroundNormal = groundUniforms.uGroundNormal;
  shader.vertexShader =
    "attribute vec4 groundBlend; varying vec4 vGroundBlend; varying vec2 vGroundUV;\n" +
    shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvGroundBlend=groundBlend;vGroundUV=vec2(position.x,-position.z)*.46;",
  );
  shader.fragmentShader =
    "varying vec4 vGroundBlend; varying vec2 vGroundUV; uniform float uGroundNormal;\n" +
    shader.fragmentShader;
  // Un atlas para cuatro superficies: padding de texel para no mezclar celdas.
  const atlasFunctions = `
    vec2 groundUV(vec2 cell){return cell*.5+vec2(.003)+fract(vGroundUV)*.494;}
    vec4 sampleGround(sampler2D atlas){
      return texture2D(atlas,groundUV(vec2(0.,0.)))*vGroundBlend.x
        +texture2D(atlas,groundUV(vec2(1.,0.)))*vGroundBlend.y
        +texture2D(atlas,groundUV(vec2(0.,1.)))*vGroundBlend.z
        +texture2D(atlas,groundUV(vec2(1.,1.)))*vGroundBlend.w;
    }
  `;
  shader.fragmentShader = shader.fragmentShader.replace(
    "void main() {",
    atlasFunctions + "\nvoid main() {",
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <map_fragment>",
    "diffuseColor *= sampleGround(map);",
  );
  const normalChunk = THREE.ShaderChunk.normal_fragment_maps.replaceAll(
    "texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0",
    "mix(vec3(0.0,0.0,1.0),sampleGround(normalMap).xyz*2.0-1.0,uGroundNormal)",
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <normal_fragment_maps>",
    normalChunk,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <roughnessmap_fragment>",
    "#include <roughnessmap_fragment>\nroughnessFactor=mix(.98,.68,vGroundBlend.w);",
  );
};
terrainMat.customProgramCacheKey = () => "umbral-ground-phase1-v1";
const terrain = part(scene, terrainGeo, terrainMat);
terrain.castShadow = false;
// ---------- Fase 2: cielo continuo y agua procedural ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    day: { value: 1 },
    sun: { value: new THREE.Vector3(-0.5, 0.7, -0.5) },
    time: { value: 0 },
    rain: { value: 0 },
  },
  vertexShader: `varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec3 v;uniform float day,time,rain;uniform vec3 sun;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  float fb(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
  void main(){vec3 d=normalize(v);float h=smoothstep(-.12,.85,d.y);float dusk=pow(1.-abs(sun.y),5.);
    vec3 horizon=mix(vec3(.68,.72,.60),vec3(1.,.43,.13),dusk*.94);
    vec3 col=mix(mix(vec3(.025,.055,.095),vec3(.006,.018,.05),h),mix(horizon,vec3(.12,.34,.48),h),day);
    float sd=max(dot(d,normalize(sun)),0.);col+=vec3(1.,.72,.35)*(pow(sd,2200.)*5.+pow(sd,28.)*.16)*smoothstep(-.04,.08,sun.y);
    float md=max(dot(d,-normalize(sun)),0.);col+=vec3(.55,.68,.86)*(smoothstep(.99965,.99985,md)*1.4+pow(md,160.)*.15)*(1.-day);
    vec2 st=vec2(atan(d.z,d.x),asin(d.y))*250.;float star=step(.993,hash(floor(st)))*pow(max(0.,1.-length(fract(st)-.5)*2.),10.);
    col+=star*(1.-day)*(1.-rain)*smoothstep(0.,.2,d.y)*(1.2+.3*sin(time+hash(floor(st))*50.));
    vec2 uv=d.xz/max(d.y+.12,.08)*1.5+vec2(time*.006,0.);
    float cloud=smoothstep(.49-rain*.12,.77,fb(uv))*smoothstep(.02,.3,d.y);
    col=mix(col,mix(vec3(.055,.08,.12),vec3(.83,.88,.82),day)*(1.-rain*.32),cloud*.86);
    gl_FragColor=vec4(col,1.);
  }`,
});
const sky = part(scene, new THREE.SphereGeometry(170, 32, 16), skyMat);
sky.castShadow = sky.receiveShadow = false;
// Sky-only cube capture: six inexpensive draws, no second forest render.
const reflectionScene = new THREE.Scene();
reflectionScene.add(new THREE.Mesh(sky.geometry, skyMat));
const skyReflection = new THREE.WebGLCubeRenderTarget(64, {
  type: THREE.HalfFloatType, generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const skyCapture = new THREE.CubeCamera(0.1, 200, skyReflection);
let reflectionFrame = 0, reflectionQuality = null;
const bedSize = 192,
  bedPixels = new Uint8Array(bedSize * bedSize * 4);
for (let z = 0; z < bedSize; z++)
  for (let x = 0; x < bedSize; x++) {
    const value =
      clamp(
        (height(
          (x / (bedSize - 1)) * 108 - 54,
          (z / (bedSize - 1)) * 108 - 54,
        ) +
          4) /
          16,
        0,
        1,
      ) * 255;
    const i = (z * bedSize + x) * 4;
    bedPixels[i] = bedPixels[i + 1] = bedPixels[i + 2] = value;
    bedPixels[i + 3] = 255;
  }
const bedMap = new THREE.DataTexture(bedPixels, bedSize, bedSize);
bedMap.magFilter = bedMap.minFilter = THREE.LinearFilter;
bedMap.needsUpdate = true;
const rippleEvents = Array.from(
  { length: 6 },
  () => new THREE.Vector4(0, 0, -100, 0),
);
let rippleIndex = 0;
function ripple(x, z, power = 0.06) {
  rippleEvents[rippleIndex++ % 6].set(x, z, state.time, power);
}
const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    time: { value: 0 },
    clean: { value: 1 },
    day: { value: 1 },
    bed: { value: bedMap },
    sun: { value: new THREE.Vector3(-0.5, 0.8, -0.5) },
    ripples: { value: rippleEvents },
    skyReflection: { value: skyReflection.texture },
    reflectionStrength: { value: 1 },
  },
  vertexShader: `uniform float time;varying vec3 p;void main(){vec3 q=(modelMatrix*vec4(position,1.)).xyz;q.y+=sin(q.x*.7+time*.8)*.025+sin(q.z*.9-time*.6)*.018;p=q;gl_Position=projectionMatrix*viewMatrix*vec4(q,1.);}`,
  fragmentShader: `uniform float time,clean,day,reflectionStrength;uniform sampler2D bed;uniform samplerCube skyReflection;uniform vec3 sun;uniform vec4 ripples[6];varying vec3 p;
  void main(){float ground=texture2D(bed,(p.xz+54.)/108.).r*16.-4.;float depth=p.y-ground;if(depth<-.03)discard;
    vec2 slope=vec2(cos(p.x*.7+time*.8)*.04,cos(p.z*.9-time*.6)*.035);float rings=0.;
    for(int i=0;i<6;i++){float age=time-ripples[i].z;if(age<0.||age>5.)continue;float r=length(p.xz-ripples[i].xy);float ring=sin(r*19.-age*13.)*exp(-pow((r-age*1.8)*2.4,2.))*exp(-age*.9);rings+=ring*ripples[i].w;slope+=normalize(p.xz-ripples[i].xy+vec2(.001))*ring*ripples[i].w;}
    vec3 n=normalize(vec3(-slope.x,1.,-slope.y)),eye=normalize(cameraPosition-p);float fres=.035+.965*pow(1.-max(dot(eye,n),0.),4.);
    vec3 shallow=mix(vec3(.22,.19,.045),vec3(.16,.39,.30),clean),deep=mix(vec3(.075,.10,.022),vec3(.018,.12,.14),clean);
    vec3 base=mix(shallow,deep,smoothstep(0.,1.9,depth));
    float caustic=pow(max(0.,sin(p.x*5.+slope.x*15.+time)*sin(p.z*4.8-time*.6)),12.)*.055*clean*exp(-depth);base+=caustic;
    vec3 reflected=reflect(-eye,n);vec3 skyColor=mix(vec3(.43,.59,.53),vec3(.13,.33,.46),max(0.,reflected.y));
    if(reflectionStrength>.5)skyColor=textureCube(skyReflection,reflected).rgb;
    vec3 col=mix(base,skyColor,fres*.78);float glint=pow(max(dot(reflect(-normalize(sun),n),eye),0.),180.);
    float foamNoise=sin(p.x*9.+sin(p.z*7.-time*.6))*sin(p.z*11.+sin(p.x*6.+time*.7));
    float foam=(1.-smoothstep(.025,.24+foamNoise*.07,depth))*smoothstep(-.03,.025,depth)*smoothstep(-.45,.7,foamNoise);
    col+=vec3(.55,.67,.57)*max(0.,foam)*.27+glint*vec3(1.,.8,.5)*.8;
    float film=(.5+.5*sin(p.x*2.+p.z*3.+sin(p.z*4.+time*.2)))*(1.-clean);col=mix(col,vec3(.32,.29,.08),film*.6);
    gl_FragColor=vec4((col+rings*.1)*(.24+.76*day),mix(.48,.94,clamp(depth,0.,1.))+(1.-clean)*.03);
  }`,
});
const waterGeo = new THREE.PlaneGeometry(46, 34, 92, 68);
waterGeo.rotateX(-Math.PI / 2);
const lake = part(scene, waterGeo, waterMat, [0, waterLevel, -3]);
lake.castShadow = lake.receiveShadow = false;
// Arroyo estrecho siguiendo el relieve hasta la laguna, sin geometría externa.
const streamPositions = [],
  streamUV = [],
  streamIndices = [];
for (let i = 0; i <= 64; i++) {
  const z = -36 + (i / 64) * 24,
    x = Math.sin(z * 0.23) * 1.4 - 2;
  for (const side of [-1, 1]) {
    const xx = x + side * 0.43;
    streamPositions.push(xx, Math.max(waterLevel, height(xx, z) + 0.12), z);
    streamUV.push((side + 1) / 2, i / 8);
  }
  if (i < 64) {
    const k = i * 2;
    streamIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
}
const streamGeo = new THREE.BufferGeometry();
streamGeo.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(streamPositions, 3),
);
streamGeo.setAttribute("uv", new THREE.Float32BufferAttribute(streamUV, 2));
streamGeo.setIndex(streamIndices);
streamGeo.computeVertexNormals();
const stream = part(scene, streamGeo, waterMat);
stream.castShadow = stream.receiveShadow = false;

// ---------- Fase 1: árboles por especie, LOD y sotobosque por hábitat ----------
const windUniform = { value: 0 };
const plantTiles = [],
  treeDetails = [];
const matrixDummy = new THREE.Object3D();
const sceneryStats = {
  nearTrees: 0,
  midTrees: 0,
  farTrees: 0,
  visibleTiles: 0,
};
const windGLSL = `
  uniform float uWind;
  vec3 forestSway(vec3 p) {
    float phase=modelMatrix[3].x*.19+modelMatrix[3].z*.23;
    float upper=smoothstep(1.5,13.,p.y);
    float breeze=sin(uWind*.65+phase)*.11+sin(uWind*.29+phase*1.3)*.05;
    return vec3(breeze*upper,0.,cos(uWind*.53+phase)*.055*upper);
  }
`;
const windTransform = `
  #include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 anchor=(instanceMatrix*vec4(position,1.)).xyz;
    vec3 gust=forestSway(anchor);
    float instancePhase=dot(instanceMatrix[3].xyz,vec3(2.17,3.31,1.73));
    float flutter=(sin(uWind*3.7+instancePhase)*.018+sin(uWind*7.3+instancePhase*1.9)*.008)*(position.y+.6);
    vec3 c0=instanceMatrix[0].xyz,c1=instanceMatrix[1].xyz,c2=instanceMatrix[2].xyz;
    transformed+=vec3(dot(gust,c0)/max(dot(c0,c0),.001),dot(gust,c1)/max(dot(c1,c1),.001),dot(gust,c2)/max(dot(c2,c2),.001));
    transformed.z+=flutter;
  #else
    transformed+=forestSway(position);
  #endif
`;
function applyForestWind(shader) {
  shader.uniforms.uWind = windUniform;
  shader.vertexShader = windGLSL + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    windTransform,
  );
}
function windMaterial(base = mats.leaf) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    applyForestWind(shader);
    shader.uniforms.uLeafLight = leafLight;
    shader.uniforms.uTransmission = leafTransmission;
    shader.fragmentShader = 'uniform vec3 uLeafLight; uniform float uTransmission;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float throughLeaf=pow(max(0.,dot(-normal,normalize(uLeafLight))),2.);
      outgoingLight+=diffuseColor.rgb*vec3(1.1,1.0,.42)*throughLeaf*uTransmission;
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "forest-transmission-phase2";
  return m;
}
const canopyMat = windMaterial();
canopyMat.color.set(0xd3dfb4);
const leafDepth = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking,
  map: leafMap,
  alphaTest: 0.45,
  side: THREE.DoubleSide,
});
leafDepth.onBeforeCompile = applyForestWind;
leafDepth.customProgramCacheKey = () => "forest-wind-depth-phase1";
const barkDepth = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking,
});
barkDepth.onBeforeCompile = applyForestWind;
barkDepth.customProgramCacheKey = () => "forest-bark-depth-phase1";
const treeBarkMat = mats.bark.clone();
treeBarkMat.onBeforeCompile = (shader) => {
  applyForestWind(shader);
  shader.vertexShader = "varying vec3 vBarkPosition;\n" + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvBarkPosition=position;",
  );
  shader.fragmentShader =
    "varying vec3 vBarkPosition;\n" + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <map_fragment>",
    `#include <map_fragment>
    float moss=(1.-smoothstep(.15,3.2,vBarkPosition.y))*(.55+.25*sin(vBarkPosition.x*9.+vBarkPosition.z*7.));
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.83,1.2,.69),moss);`,
  );
};
treeBarkMat.customProgramCacheKey = () => "forest-moss-bark-phase1";
const leafGeo = new THREE.PlaneGeometry(1, 1, 2, 3);
for (let i = 0; i < leafGeo.attributes.position.count; i++) {
  const x = leafGeo.attributes.position.getX(i),
    y = leafGeo.attributes.position.getY(i);
  leafGeo.attributes.position.setZ(
    i,
    Math.sin((y + 0.5) * Math.PI) * 0.085 + Math.abs(x) * 0.09,
  );
}
leafGeo.computeVertexNormals();
const clusterMap = texture(256, (ctx) => {
  for (let i = 0; i < 13; i++) {
    ctx.save();
    ctx.translate(128 + Math.sin(i * 2.4) * 65, 128 + Math.cos(i * 2.4) * 65);
    ctx.rotate(i * 2.4);
    ctx.drawImage(leafMap.image, -28, -52, 56, 104);
    ctx.restore();
  }
});
const distantLeafMat = windMaterial(
  material(0x94ac75, {
    map: clusterMap,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
  }),
);
function finishInstances(m, padding = 0.35) {
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  if (m.boundingSphere) m.boundingSphere.radius += padding;
  m.frustumCulled = true;
}
function canopyMesh(records, stride, scale, mat) {
  const selected = records.filter((_, i) => i % stride === 0);
  const mesh = new THREE.InstancedMesh(leafGeo, mat, selected.length);
  selected.forEach((r, i) => {
    matrixDummy.position.copy(r.position);
    matrixDummy.rotation.copy(r.rotation);
    matrixDummy.scale.set(r.sx * scale, r.sy * scale, 1);
    matrixDummy.updateMatrix();
    mesh.setMatrixAt(i, matrixDummy.matrix);
    mesh.setColorAt(i, r.color);
  });
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = leafDepth;
  finishInstances(mesh, 0.6);
  return mesh;
}
// Contrafuertes en forma de aleta: base ancha y unión alta con el tronco.
function buttressGeometry(a, reach, h, width, r) {
  const points = [
    [r * 0.3, 0, -width],
    [reach, 0, -width * 0.15],
    [r * 0.25, h, -width * 0.32],
    [r * 0.3, 0, width],
    [reach, 0, width * 0.15],
    [r * 0.25, h, width * 0.32],
  ];
  const faces = [
    0, 1, 2, 3, 5, 4, 0, 3, 4, 0, 4, 1, 2, 1, 4, 2, 4, 5, 0, 2, 5, 0, 5, 3,
  ];
  const p = [],
    uv = [];
  for (const id of faces) {
    const [x, y, z] = points[id];
    p.push(
      x * Math.cos(a) - z * Math.sin(a),
      y,
      x * Math.sin(a) + z * Math.cos(a),
    );
    uv.push(x * 0.6, y * 0.4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}
function mergeAndRelease(geometries) {
  const compatible = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(compatible);
  new Set([...geometries, ...compatible]).forEach((g) => g.dispose());
  return merged;
}
function makeTree(x, z, size = 1, kind = "ceiba", decorative = false) {
  const group = new THREE.Group();
  group.position.set(x, height(x, z), z);
  scene.add(group);
  const ceiba = kind === "ceiba",
    h = rand(ceiba ? 12 : 8, ceiba ? 17 : 12) * size;
  const r = rand(ceiba ? 0.48 : 0.27, ceiba ? 0.72 : 0.43) * size,
    leanX = rand(-0.7, 0.7) * size,
    leanZ = rand(-0.5, 0.5) * size;
  const trunk = [],
    details = [],
    records = [];
  const e = register(group, {
    kind: "tree",
    species: kind,
    title: ceiba ? "Ceiba" : "Ramón",
    alive: true,
    decorative,
    size,
    restore: 0,
    height: h,
  });
  const joints = [
    [0, -0.08, 0],
    [leanX * 0.15, h * 0.18, leanZ * 0.2],
    [leanX * 0.55, h * 0.43, leanZ * 0.6],
    [leanX, h * 0.68, leanZ],
  ];
  for (let j = 0; j < 3; j++)
    trunk.push(
      branchGeometry(
        joints[j],
        joints[j + 1],
        r * (1.25 - j * 0.27),
        r * (1 - j * 0.25),
        ceiba ? 11 : 9,
      ),
    );
  const roots = ceiba ? 7 : 4,
    rotation = rand(0, TAU);
  for (let j = 0; j < roots; j++) {
    const a = rotation + (j * TAU) / roots + rand(-0.25, 0.25),
      reach = rand(ceiba ? 1.5 : 0.8, ceiba ? 2.4 : 1.5) * size;
    trunk.push(
      buttressGeometry(
        a,
        reach,
        rand(ceiba ? 1.6 : 0.7, ceiba ? 3 : 1.5) * size,
        r * 0.4,
        r,
      ),
    );
    const endX = Math.cos(a) * reach * 1.55,
      endZ = Math.sin(a) * reach * 1.55;
    const endY = height(x + endX, z + endZ) - group.position.y + 0.045;
    details.push(
      branchGeometry(
        [Math.cos(a) * reach * 0.6, 0.12, Math.sin(a) * reach * 0.6],
        [endX, endY, endZ],
        r * 0.19,
        0.025,
        6,
      ),
    );
  }
  const branches = ceiba ? 7 : 8;
  for (let j = 0; j < branches; j++) {
    const a = rotation + j * 2.399 + rand(-0.35, 0.35),
      reach = rand(ceiba ? 3.1 : 2.4, ceiba ? 5.1 : 3.8) * size;
    const tier = j % 3,
      cy =
        h * (ceiba ? 0.76 : 0.65) + tier * h * 0.082 + rand(-0.4, 0.4) * size;
    const start = [leanX * 0.8, h * (0.49 + tier * 0.062), leanZ * 0.8];
    const elbow = [
      Math.cos(a) * reach * 0.43 + leanX,
      cy - 1.1 * size,
      Math.sin(a) * reach * 0.43 + leanZ,
    ];
    const tip = [Math.cos(a) * reach + leanX, cy, Math.sin(a) * reach + leanZ];
    trunk.push(branchGeometry(start, elbow, r * 0.46, 0.12 * size, 7));
    trunk.push(branchGeometry(elbow, tip, 0.12 * size, 0.035 * size, 6));
    for (let k = 0; k < 2; k++) {
      const fork = a + (k ? -0.55 : 0.45),
        cx = tip[0] + Math.cos(fork) * 0.85 * size,
        cz = tip[2] + Math.sin(fork) * 0.85 * size;
      const yy = cy + rand(-0.1, 0.7) * size;
      details.push(branchGeometry(elbow, [cx, yy, cz], 0.07 * size, 0.015, 5));
      const radius = rand(1.25, 1.9) * size;
      for (let l = 0; l < 64; l++) {
        const theta = rand(0, TAU),
          rad = Math.sqrt(rng()) * radius;
        records.push({
          position: new THREE.Vector3(
            cx + Math.cos(theta) * rad,
            yy + rand(-0.35, 0.8) * size - rad * 0.18,
            cz + Math.sin(theta) * rad,
          ),
          rotation: new THREE.Euler(
            rand(-1.7, -0.45),
            rand(0, TAU),
            rand(-0.75, 0.75),
          ),
          sx: rand(0.7, 1.15) * size,
          sy: rand(0.9, 1.55) * size,
          color: new THREE.Color(
            pick(
              ceiba
                ? [0x8ea16c, 0xa3b982, 0x749454]
                : [0x729552, 0x839e60, 0x9caf6d],
            ),
          ).offsetHSL(rand(-0.014, 0.014), 0, rand(-0.035, 0.035)),
        });
      }
    }
  }
  const skeleton = mergeAndRelease(trunk);
  const trunkMesh = part(group, skeleton, treeBarkMat);
  trunkMesh.customDepthMaterial = barkDepth;
  const detailGroup = new THREE.Group();
  group.add(detailGroup);
  const twigs = mergeAndRelease(details);
  const fine = part(detailGroup, twigs, treeBarkMat);
  fine.customDepthMaterial = barkDepth;
  // Lianas suspendidas y epífitas pegadas a las bifurcaciones.
  for (let j = 0; j < (ceiba ? 2 : 1); j++) {
    const a = rotation + j * 1.5;
    const xx = Math.cos(a) * size,
      zz = Math.sin(a) * size;
    tube(
      detailGroup,
      [
        [xx, h * 0.7, zz],
        [xx + 0.5, h * 0.48, zz + 0.2],
        [xx + 0.3, h * 0.27, zz + 0.15],
      ],
      0.023 * size,
      mats.root,
    );
  }
  const epiphyte = new THREE.InstancedMesh(leafGeo, canopyMat, 18);
  detailGroup.add(epiphyte);
  for (let j = 0; j < 18; j++) {
    const base = j < 9 ? h * 0.35 : h * 0.56,
      a = (j * TAU) / 9;
    matrixDummy.position.set(
      leanX * 0.4 + Math.cos(a) * 0.3,
      base + Math.sin(a) * 0.06,
      leanZ * 0.4 + Math.sin(a) * 0.3,
    );
    matrixDummy.rotation.set(-0.3, a, 0.8);
    matrixDummy.scale.set(0.19, 0.75, 1);
    matrixDummy.updateMatrix();
    epiphyte.setMatrixAt(j, matrixDummy.matrix);
  }
  finishInstances(epiphyte);
  const lod = new THREE.LOD();
  lod.autoUpdate = false;
  group.add(lod);
  const close = canopyMesh(records, 1, 1, canopyMat),
    medium = canopyMesh(records, 3, 1.45, canopyMat),
    far = canopyMesh(records, 10, 3, distantLeafMat);
  lod.addLevel(close, 0);
  lod.addLevel(medium, 28, 0.14);
  lod.addLevel(far, 58, 0.17);
  e.foliage = { lod, close, medium, far, detailGroup };
  treeDetails.push(e);
  trees.push(e);
  return e;
}
forestLayout.forEach(([x, z, s], i) =>
  makeTree(x, z, s, i % 2 ? "ramon" : "ceiba"),
);

// Cinturón escénico fuera del límite transitable: oculta el borde del mapa.
// No cuenta como recurso ni modifica los treinta árboles del modelo ecológico.
const backdropGroves = [];
const backdropTrunkGeo = new THREE.CylinderGeometry(0.17, 0.38, 1, 6);
for (let sector = 0; sector < 8; sector++) {
  const group = new THREE.Group();
  scene.add(group);
  const trunks = new THREE.InstancedMesh(backdropTrunkGeo, mats.bark, 12);
  const crowns = new THREE.InstancedMesh(leafGeo, distantLeafMat, 12 * 24);
  group.add(trunks, crowns);
  for (let i = 0; i < 12; i++) {
    const id = sector * 12 + i,
      a = (id / 96) * TAU;
    const radius =
      (51 + terrainHash(id, 12) * 2) /
      Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const x = Math.cos(a) * radius,
      z = Math.sin(a) * radius;
    const y = height(x, z),
      h = 7 + terrainHash(id, 13) * 7;
    matrixDummy.position.set(x, y + h * 0.5, z);
    matrixDummy.rotation.set(0, 0, 0);
    matrixDummy.scale.set(1, h, 1);
    matrixDummy.updateMatrix();
    trunks.setMatrixAt(i, matrixDummy.matrix);
    for (let j = 0; j < 24; j++) {
      const theta = j * 2.399,
        r = 1 + terrainHash(id, j) * 2.5;
      matrixDummy.position.set(
        x + Math.cos(theta) * r,
        y + h + Math.sin(j * 1.7) * 1.3,
        z + Math.sin(theta) * r,
      );
      matrixDummy.rotation.set(-0.5 - terrainHash(j, id) * 1.2, theta, 0.2);
      matrixDummy.scale.set(4.2, 5.3, 1);
      matrixDummy.updateMatrix();
      crowns.setMatrixAt(i * 24 + j, matrixDummy.matrix);
      crowns.setColorAt(
        i * 24 + j,
        new THREE.Color().setHSL(
          0.23 + terrainHash(id, 4) * 0.035,
          0.23,
          0.45 + terrainHash(j, 7) * 0.13,
        ),
      );
    }
  }
  finishInstances(trunks);
  finishInstances(crowns, 0.8);
  trunks.castShadow = crowns.castShadow = false;
  backdropGroves.push(group);
}

// Helechos pinnados: textura distinta de las hojas enteras del ramón.
const fernMap = texture(256, (ctx) => {
  ctx.strokeStyle = "#a7b876";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(128, 252);
  ctx.quadraticCurveTo(135, 105, 128, 6);
  ctx.stroke();
  for (let j = 0; j < 20; j++) {
    const y = 239 - j * 11,
      t = j / 20,
      span = Math.sin((t * 0.88 + 0.05) * Math.PI) * 93;
    for (const s of [-1, 1]) {
      ctx.fillStyle = j % 2 ? "#a0b474" : "#7c9958";
      ctx.beginPath();
      ctx.moveTo(129, y + 5);
      ctx.bezierCurveTo(
        128 + s * span * 0.55,
        y + 9,
        128 + s * span,
        y - 3,
        128 + s * span,
        y - 13,
      );
      ctx.bezierCurveTo(128 + s * span * 0.55, y - 8, 133, y - 5, 129, y + 5);
      ctx.fill();
    }
  }
});
const fernGeo = new THREE.PlaneGeometry(0.75, 1.35, 2, 7);
fernGeo.translate(0, 0.675, 0);
for (let i = 0; i < fernGeo.attributes.position.count; i++) {
  const y = fernGeo.attributes.position.getY(i),
    x = fernGeo.attributes.position.getX(i);
  fernGeo.attributes.position.setZ(i, y * y * 0.36 + Math.abs(x) * 0.12);
}
fernGeo.computeVertexNormals();
const fernMat = windMaterial(
  material(0x9dbb77, { map: fernMap, alphaTest: 0.4, side: THREE.DoubleSide }),
);
const grassGeo = new THREE.BufferGeometry();
grassGeo.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(
    [
      -0.025, 0, 0, 0.025, 0, 0, -0.015, 0.28, 0.04, 0.02, 0.28, 0.04, 0.04,
      0.57, 0.13,
    ],
    3,
  ),
);
grassGeo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
grassGeo.computeVertexNormals();
const grassMat = windMaterial(material(0x7b985c, { side: THREE.DoubleSide }));
function habitat(x, z) {
  const y = height(x, z),
    slope = groundSlope(x, z),
    path = pathMask(x, z),
    cover = canopyCover(x, z);
  const moist = 1 - smooth(Math.abs(y - waterLevel - 0.6), 0.2, 2);
  return {
    y,
    slope,
    path,
    cover,
    density: clamp(
      (0.15 + cover * 0.65 + moist * 0.35) *
        (1 - path * 0.98) *
        (1 - smooth(slope, 0.5, 1.3)),
      0,
      1,
    ),
  };
}
function plantPoint() {
  for (let i = 0; i < 300; i++) {
    const [x, z] = dryPoint(2, 46),
      h = habitat(x, z);
    if (h.y > waterLevel + 0.18 && rng() < h.density) return [x, z, h];
  }
  const x = 25,
    z = 20;
  return [x, z, habitat(x, z)];
}
const tileRecords = new Map();
function recordPlant(kind, x, z, scale, rotation, color) {
  const key = Math.floor(x / 16) + ":" + Math.floor(z / 16);
  if (!tileRecords.has(key))
    tileRecords.set(key, { fern: [], broad: [], grass: [], litter: [] });
  tileRecords.get(key)[kind].push({
    position: new THREE.Vector3(x, height(x, z) + 0.025, z),
    scale,
    rotation,
    color: new THREE.Color(color),
  });
}
for (let i = 0; i < 230; i++) {
  const [x, z] = plantPoint();
  for (let j = 0; j < 7; j++)
    recordPlant(
      "fern",
      x,
      z,
      new THREE.Vector3(rand(0.7, 1), rand(0.55, 1.1), 1),
      new THREE.Euler(rand(0.4, 0.75), (j * TAU) / 7 + rand(-0.1, 0.1), 0),
      pick([0x94ab6d, 0x9cae74, 0x789456]),
    );
}
for (let i = 0; i < 135; i++) {
  const [x, z] = plantPoint();
  for (let j = 0; j < 5; j++)
    recordPlant(
      "broad",
      x + rand(-0.25, 0.25),
      z + rand(-0.25, 0.25),
      new THREE.Vector3(rand(0.5, 0.8), rand(0.9, 1.6), 1),
      new THREE.Euler(rand(-0.2, 0.5), j * 2.4, rand(-0.6, 0.6)),
      pick([0x80a36e, 0x719b5e, 0x9bb67b]),
    );
}
for (let i = 0; i < 570; i++) {
  const [x, z] = plantPoint();
  for (let j = 0; j < 5; j++)
    recordPlant(
      "grass",
      x + rand(-0.3, 0.3),
      z + rand(-0.3, 0.3),
      new THREE.Vector3(rand(0.7, 1.4), rand(0.5, 1.2), 1),
      new THREE.Euler(0, rand(0, TAU), rand(-0.1, 0.1)),
      pick([0x809c60, 0x9baa6b, 0x6e8c52]),
    );
}
for (let i = 0; i < 650; i++) {
  const [x, z, h] = plantPoint();
  recordPlant(
    "litter",
    x,
    z,
    new THREE.Vector3(rand(0.08, 0.17), rand(0.13, 0.28), 1),
    new THREE.Euler(-Math.PI / 2, 0, rand(0, TAU)),
    pick([0xb2a06f, 0x9e9865, 0xc6ac76]),
  );
}
const litterMat = material(0xc1aa73, {
  map: leafMap,
  alphaTest: 0.45,
  side: THREE.DoubleSide,
});
const plantTypes = {
  fern: [fernGeo, fernMat],
  broad: [fernGeo, canopyMat],
  grass: [grassGeo, grassMat],
  litter: [leafGeo, litterMat],
};
for (const [key, types] of tileRecords) {
  const [tx, tz] = key.split(":").map(Number),
    group = new THREE.Group();
  group.position.set(tx * 16 + 8, 0, tz * 16 + 8);
  scene.add(group);
  const tile = { group, meshes: [], center: group.position.clone() };
  for (const [kind, records] of Object.entries(types)) {
    if (!records.length) continue;
    const [geo, mat] = plantTypes[kind],
      mesh = new THREE.InstancedMesh(geo, mat, records.length);
    group.add(mesh);
    records.forEach((p, i) => {
      matrixDummy.position.copy(p.position).sub(group.position);
      matrixDummy.rotation.copy(p.rotation);
      matrixDummy.scale.copy(p.scale);
      matrixDummy.updateMatrix();
      mesh.setMatrixAt(i, matrixDummy.matrix);
      mesh.setColorAt(i, p.color);
    });
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    finishInstances(mesh, 0.2);
    tile.meshes.push({ mesh, total: records.length, kind });
  }
  plantTiles.push(tile);
}
// Rocas erosionadas: cinco formas compartidas y musgo en la cara superior.
const rockShapes = Array.from({ length: 5 }, (_, index) => {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const n = 0.88 + noise2(x * 2.8 + index * 20, z * 2.8 + y) * 0.2;
    p.setXYZ(i, x * n, y * (0.82 + n * 0.12), z * n);
  }
  g.computeVertexNormals();
  return g;
});
const rockMat = mats.rock.clone();
rockMat.map = floorMap;
rockMat.normalMap = normalFromTexture(floorMap, 1.4);
rockMat.normalScale = new THREE.Vector2(0.32, 0.32);
rockMat.onBeforeCompile = (s) => {
  s.vertexShader = "varying float vMossTop;\n" + s.vertexShader;
  s.vertexShader = s.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvMossTop=smoothstep(-.1,.75,normal.y)*smoothstep(-.5,.35,position.y);",
  );
  s.fragmentShader = "varying float vMossTop;\n" + s.fragmentShader;
  s.fragmentShader = s.fragmentShader.replace(
    "#include <map_fragment>",
    "#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.76,1.13,.55),vMossTop*.7);",
  );
};
rockMat.customProgramCacheKey = () => "forest-moss-rock-phase1";
for (let j = 0; j < 5; j++) {
  const mesh = new THREE.InstancedMesh(rockShapes[j], rockMat, 26);
  mesh.receiveShadow = mesh.castShadow = true;
  scene.add(mesh);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, TAU),
      r = rand(1.36, 1.61);
    let [x, z] =
      i < 19
        ? [Math.cos(a) * 15 * r, Math.sin(a) * 10 * r - 3]
        : dryPoint(2, 44);
    if (pathMask(x, z) > 0.4) {
      x += 1.8;
      z += 0.6;
    }
    matrixDummy.position.set(x, height(x, z) + 0.04, z);
    matrixDummy.rotation.set(rand(-0.1, 0.1), rand(0, TAU), rand(-0.1, 0.1));
    matrixDummy.scale.set(rand(0.35, 1.35), rand(0.25, 0.7), rand(0.45, 1));
    matrixDummy.updateMatrix();
    mesh.setMatrixAt(i, matrixDummy.matrix);
  }
  finishInstances(mesh);
}
// Siluetas lejanas asimétricas y suaves: la cámara nunca llega a estas crestas.
for (let i = 0; i < 12; i++) {
  const a = (i * TAU) / 12,
    geo = new THREE.SphereGeometry(1, 18, 12);
  const p = geo.attributes.position;
  for (let j = 0; j < p.count; j++) {
    const x = p.getX(j),
      y = p.getY(j),
      z = p.getZ(j);
    p.setY(j, y * (0.88 + noise2(x * 3 + i, z * 3) * 0.25));
  }
  geo.computeVertexNormals();
  const hill = part(
    scene,
    geo,
    mats.moss,
    [Math.cos(a) * 76, -6, Math.sin(a) * 76],
    [rand(15, 24), rand(17, 24), rand(14, 24)],
  );
  hill.castShadow = false;
}
let forestRefresh = 0;
function updateForestLOD(dt = 1, force = false) {
  forestRefresh -= dt;
  if (!force && forestRefresh > 0) return;
  forestRefresh = 0.16;
  camera.updateMatrixWorld();
  const high = state.quality === "high",
    low = state.quality === "low";
  sceneryStats.nearTrees =
    sceneryStats.midTrees =
    sceneryStats.farTrees =
    sceneryStats.visibleTiles =
      0;
  for (const e of treeDetails) {
    const { lod, close, medium, far, detailGroup } = e.foliage;
    lod.levels[1].distance = high ? 30 : low ? 12 : 23;
    lod.levels[2].distance = high ? 64 : low ? 35 : 48;
    lod.update(camera);
    const distance = camera.position.distanceTo(e.obj.position);
    detailGroup.visible = distance < (high ? 35 : low ? 14 : 25);
    close.castShadow = !low && distance < 32;
    medium.castShadow = high && distance < 40;
    far.castShadow = false;
    if (e.obj.visible) {
      if (close.visible) sceneryStats.nearTrees++;
      else if (medium.visible) sceneryStats.midTrees++;
      else sceneryStats.farTrees++;
    }
  }
  for (const tile of plantTiles) {
    const distance = Math.hypot(
      camera.position.x - tile.center.x,
      camera.position.z - tile.center.z,
    );
    const maxDistance = high ? 66 : low ? 33 : 48;
    tile.group.visible = distance < maxDistance;
    if (tile.group.visible) {
      sceneryStats.visibleTiles++;
      const budget =
        (high ? 1 : low ? 0.48 : 0.75) * (distance > 24 ? 0.55 : 1);
      for (const { mesh, total } of tile.meshes)
        mesh.count = Math.max(1, Math.floor(total * budget));
    }
  }
}
function makeBush(x, z) {
  const g = new THREE.Group();
  g.position.set(x, height(x, z), z);
  scene.add(g);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    branch(
      g,
      [0, 0, 0],
      [Math.cos(a) * 0.5, 0.6 + rand(0, 0.5), Math.sin(a) * 0.5],
      0.035,
      0.01,
      mats.root,
    );
    for (let j = 0; j < 3; j++) {
      const leaf = part(
        g,
        fernGeo,
        mats.leaf,
        [Math.cos(a) * 0.45, 0.45 + j * 0.18, Math.sin(a) * 0.45],
        [2, 0.6, 1],
      );
      leaf.rotation.set(0.7, a + j, 0);
    }
  }
  const berries = [];
  for (let j = 0; j < 5; j++)
    berries.push(
      ellipsoid(
        g,
        mats.fruit,
        [Math.sin(j * 2) * 0.55, 0.65 + rand(0, 0.3), Math.cos(j * 2) * 0.55],
        [0.1, 0.13, 0.1],
      ),
    );
  const e = register(g, {
    kind: "bush",
    species: "frutos",
    title: "Frutos del sotobosque",
    berries,
    ready: true,
    regrow: 0,
  });
  bushes.push(e);
  return e;
}
makeBush(-4, 14);
makeBush(-10, 20);
for (let i = 0; i < 26; i++) {
  const [x, z] = dryPoint(4, 40);
  makeBush(x, z);
}
const endGrainMap = texture(128, (c, s) => {
  c.fillStyle = "#b2a47a";
  c.fillRect(0, 0, s, s);
  c.strokeStyle = "#756448";
  c.lineWidth = 1.4;
  for (let ring = 5; ring < 64; ring += 5) {
    c.beginPath();
    for (let j = 0; j <= 80; j++) {
      const a = (j / 80) * TAU,
        r = ring + Math.sin(a * 3 + ring) * 1.5;
      const x = 64 + Math.cos(a) * r,
        y = 64 + Math.sin(a) * r;
      if (j) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
  }
});
const endGrainMat = material(0xd3be8a, { map: endGrainMap });
const logEndGeo = new THREE.CircleGeometry(1, 14);
function makeWood(x, z, fallenLog = false) {
  const g = new THREE.Group();
  g.position.set(x, height(x, z) + 0.1, z);
  g.rotation.y = rand(0, TAU);
  scene.add(g);
  const length = fallenLog ? 1.8 : 0.65,
    radius = fallenLog ? 0.24 : 0.095;
  branch(
    g,
    [-length, radius, 0],
    [length, radius + 0.06, 0.12],
    radius,
    radius * 0.72,
    mats.wood,
  );
  branch(
    g,
    [0.2, radius, 0.1],
    [0.5, radius + 0.26, -0.4],
    radius * 0.5,
    0.02,
    mats.wood,
  );
  for (const sign of [-1, 1]) {
    const cap = part(
      g,
      logEndGeo,
      endGrainMat,
      [
        sign * (length + 0.006),
        radius + (sign > 0 ? 0.06 : 0),
        sign > 0 ? 0.12 : 0,
      ],
      [radius * (sign > 0 ? 0.72 : 1), radius * (sign > 0 ? 0.72 : 1), 1],
    );
    cap.rotation.y = (sign * Math.PI) / 2;
  }
  if (fallenLog) {
    for (let i = 0; i < 3; i++) {
      const tuft = part(
        g,
        fernGeo,
        fernMat,
        [rand(-1, 1), radius * 1.6, 0],
        [0.35, 0.38, 0.35],
      );
      tuft.rotation.y = rand(0, TAU);
      tuft.castShadow = false;
    }
  }
  register(g, {
    kind: "wood",
    title: fallenLog ? "Tronco caído · madera aprovechable" : "Rama caída",
    species: "madera",
    taken: false,
  });
}
[
  [-5, 16],
  [-3, 20],
  [-8, 13],
  [0, 17],
  [-11, 24],
  [5, 20],
].forEach((p) => makeWood(...p));
for (let i = 0; i < 18; i++) makeWood(...dryPoint(4, 40));
for (let i = 0; i < 8; i++) {
  const [x, z] = plantPoint();
  makeWood(x, z, true);
}
for (let i = 0; i < 18; i++) {
  const [x, z] = i === 0 ? [-8, 17] : dryPoint(3, 38),
    g = new THREE.Group();
  g.position.set(x, height(x, z), z);
  scene.add(g);
  for (let j = 0; j < 4; j++) {
    const xx = rand(-0.3, 0.3),
      zz = rand(-0.3, 0.3),
      h = rand(0.14, 0.32);
    branch(g, [xx, 0, zz], [xx, h, zz], 0.025, 0.016, mats.ivory);
    const cap = part(
      g,
      new THREE.SphereGeometry(0.13, 10, 6, 0, TAU, 0, Math.PI * 0.6),
      material(0xacc394, { emissive: 0x4f8762, emissiveIntensity: 0.25 }),
      [xx, h, zz],
      [1, 0.5, 1],
    );
    glows.push(cap);
  }
  register(g, {
    kind: "fungus",
    species: "hongos",
    title: "Hongos descomponedores",
  });
}
for (let i = 0; i < 23; i++) {
  const a = rand(0, TAU),
    r = rand(0.2, 0.94),
    x = Math.cos(a) * 15 * r,
    z = Math.sin(a) * 10 * r - 3;
  const pad = part(
    scene,
    new THREE.CircleGeometry(rand(0.18, 0.4), 20, 0.1, TAU - 0.3),
    material(0x728d52),
    [x, 0.16, z],
  );
  pad.rotation.x = -Math.PI / 2;
  pad.castShadow = false;
}
// Polen y luciérnagas circulares, sin los cuadrados de las partículas anteriores.
function particles(n, color, size, opacity) {
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = rand(-35, 35);
    arr[i * 3 + 1] = rand(0.5, 12);
    arr[i * 3 + 2] = rand(-35, 35);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  const p = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      map: dotMap,
      color,
      size,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(p);
  return p;
}
const pollen = particles(180, 0xf5e6ad, 0.055, 0.36),
  fireflies = particles(90, 0xbbe879, 0.15, 0);
const rainPositions = new Float32Array(800 * 6);
for (let i = 0; i < 800; i++) {
  const x = rand(-25, 25),
    y = rand(0, 24),
    z = rand(-25, 25);
  rainPositions.set([x, y, z, x - 0.04, y - 0.5, z], i * 6);
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
const rain = new THREE.LineSegments(
  rainGeo,
  new THREE.LineBasicMaterial({
    color: 0xc6dfca,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  }),
);
rain.visible = false;
scene.add(rain);

// Haces suaves, sin conos opacos: la densidad se desvanece en todos sus bordes.
const shaftMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms: { strength: { value: 0.045 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv;uniform float strength;void main(){float edge=pow(max(0.,1.-abs(vUv.x-.5)*2.),3.);float ends=sin(vUv.y*3.14159);gl_FragColor=vec4(.95,.85,.55,edge*ends*strength);}`,
});
const lightShafts = [];
for (const [x, z] of [
  [-14, 5],
  [6, -8],
  [18, -18],
]) {
  const beam = part(scene, new THREE.PlaneGeometry(3.5, 15), shaftMat, [
    x,
    8,
    z,
  ]);
  beam.rotation.z = -0.3;
  beam.rotation.y = 0.2;
  beam.castShadow = beam.receiveShadow = false;
  lightShafts.push(beam);
}

// ---------- Audio sintetizado, activado únicamente tras un gesto ----------
class ForestAudio {
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.2;
    this.master.connect(this.ctx.destination);
    const n = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * 3,
        this.ctx.sampleRate,
      ),
      data = n.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * 0.16;
    this.noise = n;
    const src = this.ctx.createBufferSource();
    src.buffer = n;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    this.ambient = this.ctx.createGain();
    this.ambient.gain.value = 0.16;
    src.connect(filter).connect(this.ambient).connect(this.master);
    src.start();
    this.ctx.resume();
  }
  tone(f, d = 0.15, volume = 0.15, slide = 0, type = "sine") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(t + d);
  }
  rustle(f = 400, volume = 0.12, d = 0.12) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(),
      g = this.ctx.createGain(),
      filter = this.ctx.createBiquadFilter();
    s.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.value = f;
    g.gain.setValueAtTime(volume, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + d);
    s.connect(filter).connect(g).connect(this.master);
    s.start();
    s.stop(this.ctx.currentTime + d);
  }
  mute() {
    state.muted = !state.muted;
    if (this.ctx)
      this.master.gain.setTargetAtTime(
        state.muted ? 0 : 0.2,
        this.ctx.currentTime,
        0.1,
      );
    $("audio-button").textContent = state.muted ? "♪" : "♫";
    $("audio-button").ariaLabel = state.muted
      ? "Activar sonido"
      : "Silenciar sonido";
  }
}
const sound = new ForestAudio();

// ---------- Fauna articulada y fichas de observación ----------
const species = {
  ceiba: {
    name: "Ceiba",
    latin: "Ceiba pentandra",
    role: "PRODUCTOR · ÁRBOL DEL DOSEL",
    body: "Una copa emergente captura luz sobre el dosel. Su tronco con contrafuertes sostiene una arquitectura que ofrece refugio y sombra.",
    fact: "Fotosíntesis: la energía solar entra en la red de vida a través de las plantas. La pérdida de cobertura también altera el microclima.",
  },
  ramon: {
    name: "Ramón",
    latin: "Brosimum alicastrum",
    role: "PRODUCTOR · ALIMENTO Y REFUGIO",
    body: "Árbol representativo de las selvas húmedas de México. Forma parte del dosel y aporta alimento a la fauna.",
    fact: "Plantas y consumidores están conectados: menos árboles significa menos alimento y menos lugares para vivir.",
  },
  frutos: {
    name: "Frutos del sotobosque",
    latin: "Recurso vegetal · representación didáctica",
    role: "PRODUCTOR · RECURSO RENOVABLE",
    body: "Recolecta sin arrancar la planta. Las reservas de fruto vuelven con el tiempo, si la vegetación y los dispersores siguen presentes.",
    fact: "En este modelo, perder dispersores retrasa la regeneración del alimento. No es una guía para identificar frutos comestibles reales.",
  },
  hongos: {
    name: "Hongos de hojarasca",
    latin: "Reino Fungi",
    role: "DESCOMPONEDORES · CICLO DE NUTRIENTES",
    body: "La hojarasca no es basura: hongos y otros organismos transforman materia orgánica y devuelven nutrientes al suelo.",
    fact: "La energía fluye y se disipa; los nutrientes circulan. Sin descomponedores, se acumularían restos y disminuiría el reciclaje de nutrientes.",
  },
  jaguar: {
    name: "Jaguar",
    latin: "Panthera onca",
    role: "CONSUMIDOR · DEPREDADOR",
    body: "Cuerpo robusto, mandíbula ancha y rosetas oscuras. Observa desde lejos. Puede acercarse, acechar y atacar si invades su espacio.",
    fact: "La depredación conecta poblaciones. La pérdida de grandes carnívoros puede alterar otras relaciones de la red alimentaria.",
  },
  tapir: {
    name: "Tapir centroamericano",
    latin: "Tapirus bairdii",
    role: "CONSUMIDOR · DISPERSOR DE SEMILLAS",
    body: "Herbívoro de cuerpo robusto y hocico flexible. Se alimenta de partes vegetales y transporta semillas al desplazarse.",
    fact: "Dispersión: los animales llevan semillas a otros lugares. Perder dispersores limita oportunidades de regeneración del bosque.",
  },
  mono: {
    name: "Mono araña",
    latin: "Ateles geoffroyi",
    role: "CONSUMIDOR · DISPERSOR",
    body: "Extremidades largas y cola prensil adaptadas a las copas. A veces deja caer frutos que puedes recuperar.",
    fact: "Los claros entre árboles fragmentan sus rutas. La conectividad del dosel importa tanto como el número de árboles.",
  },
  tucan: {
    name: "Tucán pico iris",
    latin: "Ramphastos sulfuratus",
    role: "CONSUMIDOR · DISPERSOR",
    body: "Su gran pico ligero contrasta con el plumaje oscuro. Consume frutos y también otros alimentos: la red real tiene múltiples conexiones.",
    fact: "Un fruto puede alimentar un ave y una semilla dispersada puede originar un árbol. Es una relación que beneficia a ambos.",
  },
  rana: {
    name: "Rana arborícola",
    latin: "Anfibio de selva · representación estilizada",
    role: "CONSUMIDOR · BIOINDICADOR",
    body: "Los anfibios relacionan ambientes acuáticos y terrestres. Observa las riberas y los cambios de actividad cuando el agua se altera.",
    fact: "Su piel permeable y ciclo de vida los hacen sensibles a cambios ambientales. Una sola observación no diagnostica por sí misma contaminación.",
  },
  caiman: {
    name: "Cocodriliano de la laguna",
    latin: "Reptil acuático · representación estilizada",
    role: "CONSUMIDOR · DEPREDADOR ACUÁTICO",
    body: "Ojos elevados y cola aplanada le permiten desplazarse con el cuerpo sumergido. Conserva distancia en el agua.",
    fact: "El agua conecta peces, anfibios y depredadores. Su contaminación se propaga por distintas relaciones ecológicas.",
  },
  serpiente: {
    name: "Nauyaca",
    latin: "Bothrops asper",
    role: "CONSUMIDOR · DEPREDADOR",
    body: "Se camufla entre la hojarasca. Su mordedura aplica veneno en el juego; la defensa prudente consiste en mantener distancia.",
    fact: "Las serpientes forman parte de redes que incluyen pequeños vertebrados. Alterar su hábitat cambia esos encuentros y relaciones.",
  },
};
const animalMats = {
  fur: material(0xc5a063),
  spots: material(0x30271e),
  tapir: material(0x5e5b50),
  belly: material(0xb7b09c),
  skin: material(0x586447),
  frog: material(0x91ae50),
  monkey: material(0x554633),
  bill: material(0xd0a34b),
};
const expandedWildlife = [
  ['coati','Coatí','Nasua narica','Mamíferos','Suelo','Omnívoro',0x8b704c,.64],
  ['pecari','Pecarí de collar','Pecari tajacu','Mamíferos','Suelo','Omnívoro',0x555347,.83],
  ['venado','Venado temazate','Mazama · representación estilizada','Mamíferos','Suelo','Herbívoro',0xa7754d,.91],
  ['armadillo','Armadillo','Dasypus novemcinctus','Mamíferos','Suelo','Insectívoro',0x938779,.53],
  ['hormiguero','Tamandúa','Tamandua mexicana','Mamíferos','Suelo','Insectívoro',0xc5b885,.73],
  ['martucha','Martucha','Potos flavus','Mamíferos','Dosel','Frugívoro',0xb39a60,.61],
  ['mapache','Mapache','Procyon lotor','Mamíferos','Ribera','Omnívoro',0x878577,.65],
  ['tepezcuintle','Tepezcuintle','Cuniculus paca','Mamíferos','Suelo','Frugívoro',0x765444,.59],
  ['nutria','Nutria neotropical','Lontra longicaudis','Mamíferos','Agua','Consumidor acuático',0x6d5942,.79],
  ['aullador','Mono aullador','Alouatta · representación del género','Mamíferos','Dosel','Folívoro / frugívoro',0x393c2c,.86],
  ['ocelote','Ocelote','Leopardus pardalis','Mamíferos','Suelo','Depredador',0xb79966,.65],
  ['puma','Puma','Puma concolor','Mamíferos','Suelo','Depredador',0xa98d64,1],
  ['guacamaya','Guacamaya roja','Ara macao','Aves','Dosel','Consumidor de frutos y semillas',0xbc3327,.96],
  ['loro','Loro de selva','Psittacidae · representación de grupo','Aves','Dosel','Consumidor de frutos y semillas',0x55974b,.62],
  ['hocofaisan','Hocofaisán','Crax rubra','Aves','Suelo','Consumidor de frutos',0x252f2a,.91],
  ['aguila','Águila de selva','Accipitridae · representación de grupo','Aves','Cielo','Depredador',0x686859,1.2],
  ['iguana','Iguana verde','Iguana iguana','Reptiles','Ribera','Herbívoro',0x669251,.82],
  ['tortuga','Tortuga casquito','Kinosternon · representación del género','Reptiles','Ribera','Consumidor acuático',0x636b42,.54],
  ['boa','Boa','Boa · representación del género','Reptiles','Suelo','Depredador',0x88774d,.91],
  ['murcielago','Murciélago frugívoro','Chiroptera · representación de grupo','Mamíferos','Dosel','Frugívoro',0x635340,.56],
  ['mariposa','Mariposa de selva','Lepidoptera · representación de grupo','Invertebrados','Sotobosque','Visitante floral',0x397ed1,.4],
  ['escarabajo','Escarabajo del suelo','Coleoptera · representación de grupo','Invertebrados','Suelo','Reciclaje de materia',0x344c35,.24],
  ['hormiga','Hormiga cortadora','Atta · representación del género','Invertebrados','Suelo','Cultivador de hongos',0x78462a,.15],
  ['abeja','Abeja nativa','Apidae · representación de grupo','Invertebrados','Sotobosque','Polinizador',0xb89542,.18],
];
const expandedWildlifeInfo = new Map();
const expandedMaterials = new Map();
function wildlifeMaterial(color) {
  if (!expandedMaterials.has(color)) expandedMaterials.set(color, material(color, { roughness: .86 }));
  return expandedMaterials.get(color);
}
for (const [id, name, latin, category, habitat, role, color, size] of expandedWildlife) {
  const info = { id, name, latin, category, habitat, role, color, size,
    nocturnal: ['martucha', 'tepezcuintle', 'murcielago', 'ocelote'].includes(id) };
  expandedWildlifeInfo.set(id, info);
  species[id] = {
    name, latin, role: role.toUpperCase(),
    body: `Representación procedural de ${name.toLowerCase()} en el ${habitat.toLowerCase()}.`,
    fact: `Cumple el papel de ${role.toLowerCase()} en este modelo didáctico. Las rutinas y densidades están simplificadas para jugar.`,
  };
}
function leg(g, mat, x, y, z, len, r) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  g.add(pivot);
  branch(pivot, [0, 0, 0], [0, -len, 0], r, r * 0.72, mat);
  ellipsoid(pivot, mat, [0, -len, -r * 0.4], [r * 1.15, r * 0.55, r * 1.65]);
  return pivot;
}
function eyes(g, x, y, z, size = 0.045) {
  for (const side of [-1, 1]) {
    ellipsoid(g, mats.gold, [side * x, y, z], [size * 1.4, size, size]);
    ellipsoid(
      g,
      mats.dark,
      [side * (x + 0.015), y, z - 0.025],
      [size * 0.55, size * 0.85, size * 0.5],
    );
  }
}
function makeAnimal(kind, x, z) {
  const g = new THREE.Group(),
    legs = [];
  scene.add(g);
  g.position.set(x, height(x, z), z);
  let wings = null,
    tail = null;
  if (kind === "jaguar") {
    const m = animalMats.fur;
    ellipsoid(g, m, [0, 0.85, 0], [0.4, 0.43, 0.93]);
    ellipsoid(g, m, [0, 1, -0.65], [0.4, 0.46, 0.4]);
    ellipsoid(g, m, [0, 1.12, -1.03], [0.35, 0.29, 0.36]);
    ellipsoid(g, animalMats.belly, [0, 1, -1.3], [0.25, 0.13, 0.18]);
    ellipsoid(g, mats.dark, [0, 1.06, -1.47], [0.075, 0.045, 0.05]);
    for (const s of [-1, 1])
      ellipsoid(g, m, [s * 0.25, 1.37, -0.92], [0.12, 0.14, 0.07]);
    eyes(g, 0.25, 1.19, -1.28);
    for (const xx of [-0.28, 0.28])
      for (const zz of [-0.55, 0.62])
        legs.push(leg(g, m, xx, 0.72, zz, 0.62, 0.11));
    tail = tube(
      g,
      [
        [0, 0.85, 0.8],
        [0.1, 0.8, 1.2],
        [0.15, 0.65, 1.7],
        [0.3, 0.85, 1.95],
      ],
      0.055,
      m,
    );
    const spots = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.038, 0.012, 4, 7),
      animalMats.spots,
      80,
    );
    g.add(spots);
    for (let i = 0; i < 80; i++) {
      const a = rand(0, TAU),
        zz = rand(-0.58, 0.7);
      matrixDummy.position.set(
        Math.sin(a) * 0.39,
        0.85 + Math.cos(a) * 0.415,
        zz,
      );
      matrixDummy.rotation.set(Math.PI / 2 - a, 0, rand(0, TAU));
      matrixDummy.scale.setScalar(rand(0.65, 1.45));
      matrixDummy.updateMatrix();
      spots.setMatrixAt(i, matrixDummy.matrix);
    }
  } else if (kind === "tapir") {
    const m = animalMats.tapir;
    ellipsoid(g, m, [0, 0.82, 0], [0.54, 0.62, 0.97]);
    ellipsoid(g, m, [0, 1, -0.86], [0.34, 0.4, 0.52]);
    tube(
      g,
      [
        [0, 0.94, -1.18],
        [0, 0.7, -1.5],
        [0, 0.6, -1.55],
      ],
      0.12,
      m,
    );
    for (const s of [-1, 1]) {
      ellipsoid(g, m, [s * 0.26, 1.39, -0.75], [0.13, 0.18, 0.075]);
      ellipsoid(
        g,
        animalMats.belly,
        [s * 0.26, 1.42, -0.79],
        [0.09, 0.12, 0.035],
      );
    }
    eyes(g, 0.29, 1.11, -1.11, 0.03);
    for (const xx of [-0.37, 0.37])
      for (const zz of [-0.5, 0.55])
        legs.push(leg(g, m, xx, 0.64, zz, 0.54, 0.13));
  } else if (kind === "caiman") {
    const m = animalMats.skin;
    ellipsoid(g, m, [0, 0.16, 0], [0.42, 0.24, 1.1]);
    ellipsoid(g, m, [0, 0.18, -1.12], [0.33, 0.16, 0.62]);
    ellipsoid(g, m, [0, 0.14, -1.62], [0.24, 0.095, 0.35]);
    eyes(g, 0.22, 0.36, -0.96, 0.065);
    tail = tube(
      g,
      [
        [0, 0.15, 0.8],
        [0.1, 0.13, 1.5],
        [0.35, 0.1, 2.35],
        [0.5, 0.08, 2.8],
      ],
      0.12,
      m,
    );
    for (let i = 0; i < 9; i++)
      part(g, new THREE.ConeGeometry(0.085, 0.13, 4), m, [
        0,
        0.41,
        i * 0.22 - 0.5,
      ]);
    for (const side of [-1, 1])
      for (const zz of [-0.55, 0.65]) {
        branch(
          g,
          [side * 0.3, 0.16, zz],
          [side * 0.7, 0.04, zz + 0.18],
          0.1,
          0.07,
          m,
        );
      }
  } else if (kind === "serpiente") {
    tail = tube(
      g,
      [
        [0, 0.13, -0.8],
        [0.2, 0.11, -0.2],
        [-0.16, 0.11, 0.5],
        [0.2, 0.1, 1.1],
        [0, 0.1, 1.7],
      ],
      0.09,
      animalMats.skin,
    );
    ellipsoid(g, animalMats.skin, [0, 0.15, -0.9], [0.14, 0.085, 0.2]);
    eyes(g, 0.11, 0.2, -1, 0.018);
    g.scale.setScalar(0.85);
  } else if (kind === "rana") {
    ellipsoid(g, animalMats.frog, [0, 0.14, 0], [0.18, 0.11, 0.23]);
    ellipsoid(g, animalMats.frog, [0, 0.21, -0.14], [0.17, 0.1, 0.13]);
    for (const s of [-1, 1]) {
      ellipsoid(g, animalMats.frog, [s * 0.2, 0.09, 0.13], [0.1, 0.08, 0.17]);
      branch(
        g,
        [s * 0.12, 0.16, -0.05],
        [s * 0.23, 0.04, -0.2],
        0.03,
        0.02,
        animalMats.frog,
      );
    }
    eyes(g, 0.115, 0.28, -0.17, 0.05);
  } else if (kind === "mono") {
    const m = animalMats.monkey;
    ellipsoid(g, m, [0, 0.8, 0], [0.25, 0.4, 0.22]);
    ellipsoid(g, m, [0, 1.28, -0.04], [0.23, 0.24, 0.22]);
    ellipsoid(g, animalMats.belly, [0, 1.26, -0.21], [0.16, 0.14, 0.055]);
    eyes(g, 0.08, 1.3, -0.27, 0.025);
    legs.push(
      leg(g, m, -0.17, 0.6, 0, 0.57, 0.07),
      leg(g, m, 0.17, 0.6, 0, 0.57, 0.07),
    );
    branch(g, [-0.2, 1, 0], [-0.6, 0.42, -0.06], 0.08, 0.055, m);
    branch(g, [0.2, 1, 0], [0.48, 1.6, 0.03], 0.08, 0.055, m);
    tail = tube(
      g,
      [
        [0, 0.55, 0.1],
        [0, 0.3, 0.5],
        [0.1, 0.65, 0.85],
        [0.2, 1.2, 0.6],
      ],
      0.045,
      m,
    );
  } else if (kind === "tucan") {
    ellipsoid(g, mats.dark, [0, 0, 0], [0.2, 0.24, 0.42]);
    ellipsoid(g, mats.dark, [0, 0.23, -0.3], [0.19, 0.21, 0.22]);
    ellipsoid(g, mats.fruit, [0, 0.24, -0.64], [0.105, 0.13, 0.3]);
    ellipsoid(g, mats.ivory, [0, 0.02, -0.28], [0.14, 0.18, 0.14]);
    eyes(g, 0.175, 0.3, -0.36, 0.027);
    wings = [];
    for (const s of [-1, 1]) {
      const w = ellipsoid(
        g,
        mats.dark,
        [s * 0.31, 0.02, 0.03],
        [0.38, 0.045, 0.28],
      );
      wings.push(w);
    }
    tail = ellipsoid(g, mats.dark, [0, -0.07, 0.5], [0.12, 0.06, 0.29]);
  }
  const e = register(g, {
    kind: "animal",
    species: kind,
    title: species[kind].name,
    legs,
    wings,
    tail,
    home: new THREE.Vector3(x, 0, z),
    goal: new THREE.Vector3(x, 0, z),
    ai: "patrol",
    aiTime: rand(1, 5),
    flee: 0,
    attackAt: 0,
    phase: rand(0, TAU),
    active: true,
    hostile: ["jaguar", "caiman", "serpiente"].includes(kind),
    lastFruit: 0,
  });
  animals.push(e);
  return e;
}
makeAnimal("tapir", -12, 12);
makeAnimal("jaguar", 27, -7);
makeAnimal("caiman", 9, -4);
makeAnimal("serpiente", -24, 18);
const monkey = makeAnimal("mono", -11, 10);
monkey.obj.position.y = height(-11, 10) + 5.6;
branch(
  scene,
  [-14, height(-14, 10) + 5.2, 10],
  [-9, height(-11, 10) + 5.2, 10],
  0.11,
  0.07,
);
makeAnimal("tucan", -7, 7);
makeAnimal("rana", -8, 11);
makeAnimal("rana", 13, 9);
for (let i = 0; i < 12; i++) {
  const g = new THREE.Group();
  ellipsoid(g, material(0xacc39d), [0, 0, 0], [0.08, 0.1, 0.28]);
  const fin = part(
    g,
    new THREE.ConeGeometry(0.11, 0.16, 3),
    mats.water,
    [0, 0, 0.32],
  );
  fin.rotation.x = Math.PI / 2;
  scene.add(g);
  fish.push({ obj: g, phase: rand(0, TAU), radius: rand(2, 9) });
}

// Herramienta tridimensional en primera persona, renderizada con el mundo.
scene.add(camera);
const spear = new THREE.Group();
camera.add(spear);
spear.position.set(0.43, -0.53, -0.7);
spear.rotation.set(-0.13, 0, -0.1);
branch(spear, [0, -1, 0.42], [0, 0.68, -0.65], 0.025, 0.018, mats.wood);
const spearTip = part(
  spear,
  new THREE.ConeGeometry(0.06, 0.3, 4),
  material(0x9da797, { metalness: 0.35, roughness: 0.45 }),
  [0, 0.77, -0.71],
);
spearTip.rotation.x = -0.55;
spear.traverse((m) => {
  m.castShadow = false;
});
spear.visible = false;

// Expedición activa: tres destinos con suministros y una observación breve.
const fieldSites = [
  { id: 'soil', title: 'El suelo vivo', x: -18, z: 18, reward: { fiber: 3 }, loot: '+3 fibra', fact: 'Hongos y hojarasca devuelven nutrientes al suelo. Recoger madera caída conserva el dosel.' },
  { id: 'shore', title: 'Guardianes de la ribera', x: 22, z: 6, reward: { fruit: 2 }, loot: '+2 fruta', fact: 'Las raíces sujetan el suelo. Una ribera con vegetación ayuda a proteger el agua.' },
  { id: 'canopy', title: 'Rutas del dosel', x: 7, z: -26, reward: { seeds: 1, wood: 2 }, loot: '+1 semilla · +2 madera', fact: 'Las copas conectadas dan rutas y refugio a la fauna que dispersa semillas.' },
];
for (const [i, site] of fieldSites.entries()) {
  const g = new THREE.Group();
  g.position.set(site.x, height(site.x, site.z), site.z);
  scene.add(g);
  branch(g, [0, 0, 0], [0, 1.7, 0], .065, .045, mats.wood);
  const signMap = texture(256, (ctx, size) => {
    ctx.fillStyle = '#173e31'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#d6b575'; ctx.lineWidth = 7; ctx.strokeRect(10, 10, size-20, size-20);
    ctx.fillStyle = '#efe9d6'; ctx.textAlign = 'center';
    ctx.font = 'bold 100px sans-serif'; ctx.fillText(String(i+1), 128, 130);
    ctx.font = '22px sans-serif'; ctx.fillText('ESTACIÓN DE CAMPO', 128, 183);
    ctx.font = '18px sans-serif'; ctx.fillText('E · EXPLORAR', 128, 218);
  });
  part(g, new THREE.BoxGeometry(.95, .85, .07), material(0xffffff, { map: signMap }), [0, 1.35, 0]);
  site.entity = register(g, { kind: 'station', title: site.title, site });
}
function visitSite(e) {
  const site = e.site;
  if (state.sites.has(site.id)) {
    toast(site.fact);
    return;
  }
  state.sites.add(site.id);
  state.fieldScore += 75;
  for (const [resource, count] of Object.entries(site.reward)) state[resource] += count;
  gesture('gather', e.obj.position);
  sound.tone(520, .3, .08, 300);
  toast(`${state.sites.size}/3 estaciones · ${site.loot} · +75 puntos. ${site.fact}`);
  updateHUD();
}
function expeditionReady() {
  return state.observed.size >= 3 && state.planted >= 2 && state.shelter && state.sites.size === 3;
}
function expeditionGuide() {
  let options = [];
  let instruction = '';
  if (state.food < 35 && !state.explore) {
    if (state.fruit) return 'C · Come una fruta para recuperar alimento';
    options = bushes.filter(e => e.ready); instruction = 'Busca alimento';
  } else if (state.observed.size < 3) {
    options = entities.filter(e => species[e.species] && !state.observed.has(e.species) && e.kind !== 'sapling');
    instruction = 'E · Registra una especie';
  } else if (state.sites.size < 3) {
    options = fieldSites.filter(s => !state.sites.has(s.id)).map(s => s.entity);
    instruction = 'E · Explora la estación';
  } else if (state.wood < (!state.shelter ? 6 : state.planted < 2 ? 1 : 0)) {
    options = entities.filter(e => e.kind === 'wood' && !e.taken); instruction = 'E · Recoge madera';
  } else if (!state.shelter) {
    if (state.fiber < 3) { options = bushes.filter(e => e.ready); instruction = 'E · Recolecta fibra'; }
    else return 'B · Construye tu campamento en un claro seco';
  } else if (state.planted < 2) {
    if (!state.seeds) return 'Busca frutos bajo el mono: aportan nuevas semillas';
    return 'P · Planta en suelo seco, dejando espacio entre brotes';
  } else if (!state.won) {
    if (state.eco < 70) return 'J · Restaura el escenario o planta para recuperar equilibrio';
    options = [{ obj: state.shelter, title: 'Tu campamento' }]; instruction = 'Regresa al refugio';
  } else return `Reto extra: registra 8 especies sin talar ni cazar · ${Math.min(8,state.observed.size)}/8`;
  const nearest = options.filter(e => e.obj.visible && e.visualTarget !== 0).sort((a,b) => horizontalDistance(player,a.obj.position)-horizontalDistance(player,b.obj.position))[0];
  if (!nearest) return 'Explora los senderos y consulta tus hallazgos con J';
  const p = nearest.obj.position;
  const bearing = Math.atan2(-(p.x-player.x), -(p.z-player.z));
  const relative = Math.atan2(Math.sin(bearing-yaw),Math.cos(bearing-yaw));
  const arrows = ['↑','↖','←','↙','↓','↘','→','↗'];
  const arrow = arrows[(Math.round(relative/(Math.PI/4))+8)%8];
  return `${arrow} ${nearest.title} · ${Math.ceil(horizontalDistance(player,p))} m\n${instruction}`;
}

// ---------- Reglas ecológicas, inventario y consecuencias ----------
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  toastUntil = performance.now() + 4400;
}
function isPlaying() {
  return state.screen === "playing";
}
function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function hasShelter() {
  return (
    state.shelter && horizontalDistance(player, state.shelter.position) < 6
  );
}
function ecology() {
  const forest = clamp(
    100 -
      state.cut * 3 +
      state.planted * 2 -
      (state.scenario === "forest" ? 42 : 0),
    0,
    100,
  );
  const biodiversity = clamp(
    100 -
      state.hunted * 15 -
      (state.scenario === "dispersers" ? 60 : 0) -
      (100 - forest) * 0.4,
    0,
    100,
  );
  const water = clamp(
    100 - (100 - forest) * 0.7 - (state.scenario === "water" ? 65 : 0),
    0,
    100,
  );
  return {
    forest,
    biodiversity,
    water,
    eco: forest * 0.4 + biodiversity * 0.3 + water * 0.3,
  };
}
function updateTreeVisibility() {
  trees.forEach((e, i) => {
    e.visualTarget =
      e.alive && !(state.scenario === "forest" && i % 3 === 0) ? 1 : 0;
    e.visualAmount ??= 1;
    if (e.visualTarget) e.obj.visible = true;
  });
  backdropGroves.forEach((g, i) => {
    g.userData.target = state.scenario !== "forest" || i % 3 !== 0 ? 1 : 0;
    if (g.userData.target) g.visible = true;
  });
}
function scenarioChange(name) {
  state.scenario = name;
  updateTreeVisibility();
  const stats = ecology();
  Object.assign(state, stats);
  renderJournal();
  updateHUD();
  sound.tone(320, 0.2, 0.07, 130);
  toast(
    name === "none"
      ? "Escenario restaurado. Las decisiones de tu partida se conservan."
      : "Escenario aplicado. Sal del cuaderno y observa el agua, la fauna y el bosque.",
  );
}
function observe(e) {
  if (!species[e.species]) return;
  const fresh = !state.observed.has(e.species);
  state.observed.add(e.species);
  if (fresh) {
    state.fieldScore += 25;
    sound.tone(660, 0.2, 0.05, 200);
    toast("+25 puntos · Hallazgo: " + species[e.species].name);
  }
  updateHUD();
}
function consume() {
  if (!isPlaying()) return;
  if (!state.fruit) {
    toast("Recolecta fruta en los arbustos antes de comer.");
    return;
  }
  state.fruit--;
  gesture("eat");
  state.food = clamp(state.food + 28, 0, 100);
  state.health = clamp(state.health + 3, 0, 100);
  sound.tone(360, 0.15, 0.05, 140);
  toast("Fruta consumida · +28 alimento");
  updateHUD();
}
function gather(e, type) {
  if (!e.ready) return;
  const n = type === "fruit" ? 2 : 3;
  state[type] += n;
  gesture("gather", e.obj.position);
  e.ready = false;
  e.regrow = state.time + 30 * (100 / Math.max(25, state.biodiversity));
  e.berries.forEach((m) => (m.visible = false));
  sound.rustle(750);
  toast(
    type === "fruit"
      ? "+2 fruta. Pulsa C para comer."
      : "+3 fibra. La planta volverá a regenerarse.",
  );
  resume();
}
function collectWood(e) {
  if (e.taken || !['playing','dialog'].includes(state.screen)) return;
  gesture("gather", e.obj.position);
  e.taken = true;
  e.obj.visible = false;
  state.wood += 3;
  sound.rustle(180, 0.25);
  toast("+3 madera caída · Conservaste un árbol vivo.");
  if (state.screen === 'dialog') resume();
  updateHUD();
}
function fell(e) {
  if (!e.alive) return;
  e.alive = false;
  state.cut++;
  state.wood += 5;
  const stump = part(
    scene,
    new THREE.CylinderGeometry(0.45, 0.6, 0.42, 9),
    mats.bark,
    [
      e.obj.position.x,
      height(e.obj.position.x, e.obj.position.z) + 0.2,
      e.obj.position.z,
    ],
  );
  updateTreeVisibility();
  sound.rustle(120, 0.5, 0.5);
  toast(
    "Tala: +5 madera, menos cobertura. Aumentan erosión y presión sobre el hábitat.",
  );
  resume();
}
function placeAhead(distance) {
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  return player.clone().addScaledVector(direction, distance);
}
function plant() {
  if (!isPlaying()) return;
  if (state.seeds < 1 || state.wood < 1) {
    toast("Plantar requiere 1 semilla y 1 madera para proteger el brote.");
    return;
  }
  const p = placeAhead(2.5);
  if (wet(p.x, p.z) || Math.abs(p.x) > 47 || Math.abs(p.z) > 47) {
    toast("Busca suelo firme para plantar.");
    return;
  }
  if (trees.some((e) => e.alive && horizontalDistance(p, e.obj.position) < 2)) {
    toast("Deja un poco más de espacio entre árboles.");
    return;
  }
  if (entities.some(e => e.kind === 'sapling' && horizontalDistance(p,e.obj.position)<2) || (state.shelter && horizontalDistance(p,state.shelter.position)<3)) {
    toast('Deja espacio para que el árbol crezca, lejos del refugio y otros brotes.');
    return;
  }
  state.seeds--;
  state.wood--;
  state.planted++;
  state.fieldScore += 30;
  gesture("plant", p);
  const g = new THREE.Group();
  g.position.set(p.x, height(p.x, p.z), p.z);
  scene.add(g);
  branch(g, [0, 0, 0], [0, 0.95, 0], 0.055, 0.02);
  for (let i = 0; i < 6; i++) {
    const m = part(g, fernGeo, mats.leaf, [0, 0.2 + i * 0.1, 0], [1.5, 0.5, 1]);
    m.rotation.set(0.7, i * 2.4, 0);
  }
  g.scale.setScalar(0.15);
  g.userData.growth = 0;
  growingPlants.push(g);
  register(g, { kind: "sapling", species: "ceiba", title: "Ceiba joven" });
  sound.tone(440, 0.35, 0.07, 320);
  toast(
    "Plantón protegido. Restaurar un bosque real requiere años y seguimiento.",
  );
  updateHUD();
}
function build() {
  if (!isPlaying()) return;
  if (state.shelter) {
    toast("Ya tienes refugio. Su fogata marca una zona segura.");
    return;
  }
  if (state.wood < 6 || state.fiber < 3) {
    toast("Refugio: 6 madera + 3 fibra. Busca ramas caídas y arbustos.");
    return;
  }
  const p = placeAhead(3.4);
  if (
    wet(p.x, p.z) ||
    Math.abs(p.x) > 45 ||
    Math.abs(p.z) > 45 ||
    trees.some((e) => e.alive && horizontalDistance(p, e.obj.position) < 2.5) ||
    entities.some(e => e.kind === 'sapling' && horizontalDistance(p,e.obj.position)<3)
  ) {
    toast("Busca un claro seco con espacio para el refugio.");
    return;
  }
  const g = new THREE.Group();
  g.position.set(p.x, height(p.x, p.z), p.z);
  g.rotation.y = yaw;
  scene.add(g);
  for (const z of [-1.2, 1.2]) {
    branch(g, [-1.5, 0, z], [0, 2, z], 0.075, 0.05);
    branch(g, [1.5, 0, z], [0, 2, z], 0.075, 0.05);
  }
  branch(g, [0, 2, -1.5], [0, 2, 1.5], 0.055, 0.055);
  const cover = new THREE.BufferGeometry();
  cover.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -1.5, 0.15, -1.3, 0, 2, -1.3, -1.5, 0.15, 1.3, 0, 2, 1.3, 1.5, 0.15,
        -1.3, 1.5, 0.15, 1.3,
      ],
      3,
    ),
  );
  cover.setIndex([0, 2, 1, 2, 3, 1, 1, 3, 4, 3, 5, 4]);
  cover.computeVertexNormals();
  part(g, cover, material(0xa39d76, { side: THREE.DoubleSide }));
  const fire = new THREE.Group();
  fire.position.set(0, 0, 2.25);
  g.add(fire);
  for (let i = 0; i < 7; i++) {
    const a = (i * TAU) / 7;
    part(
      fire,
      ico,
      mats.rock,
      [Math.cos(a) * 0.43, 0.1, Math.sin(a) * 0.43],
      [0.15, 0.12, 0.13],
    );
  }
  branch(fire, [-0.23, 0.1, -0.15], [0.23, 0.1, 0.15], 0.07, 0.07, mats.wood);
  branch(fire, [-0.2, 0.13, 0.17], [0.2, 0.13, -0.17], 0.07, 0.07, mats.wood);
  const flame = part(
    fire,
    new THREE.ConeGeometry(0.2, 0.65, 7),
    material(0xffb052, { emissive: 0xff7b24, emissiveIntensity: 3 }),
    [0, 0.38, 0],
  );
  const light = new THREE.PointLight(0xffba6f, 15, 9, 2);
  light.position.set(0, 0.7, 2.25);
  g.add(light);
  g.userData = { flame, light };
  state.shelter = g;
  state.fieldScore += 50;
  gesture("build", p);
  state.wood -= 6;
  state.fiber -= 3;
  sound.rustle(250, 0.3, 0.4);
  toast(
    "Refugio construido. La fogata repele depredadores cercanos y permite recuperarte.",
  );
  updateHUD();
}
function defend() {
  if (!isPlaying() || state.thrust > 0) return;
  state.thrust = 0.45;
  sound.rustle(850, 0.25);
  camera.getWorldDirection(direction);
  let repelled = false;
  for (const e of animals) {
    if (!e.hostile || !e.active) continue;
    tmp.copy(e.obj.position).sub(player);
    tmp.y = 0;
    if (tmp.length() < 3.6 && tmp.normalize().dot(direction) > 0.25) {
      e.ai = "flee";
      e.flee = state.time + 8;
      const away = e.obj.position.clone().sub(player).setY(0).normalize();
      e.goal.copy(e.obj.position).addScaledVector(away, 9);
      repelled = true;
    }
  }
  if (repelled) {
    sound.tone(80, 0.35, 0.09, -30, "sawtooth");
    toast("El animal retrocede. Dale espacio para retirarse.");
  }
}
function drink() {
  if (state.water < 50) {
    damage(8, "agua contaminada");
    state.poison = 20;
    toast(
      "Agua alterada: perdiste salud. Conserva la ribera y evita beber aquí.",
    );
  } else {
    state.food = clamp(state.food + 4, 0, 100);
    state.oxygen = clamp(state.oxygen + 12, 0, 100);
    toast("Agua limpia · Recuperaste resistencia.");
  }
  sound.rustle(480, 0.2, 0.25);
  resume();
}
function damage(n, cause) {
  if (state.explore) return;
  state.health = Math.max(0, state.health - n);
  state.lastCause = cause;
  state.attack = 0.5;
  damageKick = Math.min(0.07, damageKick + n * 0.004);
  if (state.health <= 0) finish(false);
}
function hunt(e) {
  if (!e.active) return;
  e.active = false;
  e.obj.visible = false;
  state.hunted++;
  state.food = clamp(state.food + 35, 0, 100);
  toast(
    "Caza: +35 alimento. Perdiste un dispersor y la biodiversidad disminuyó.",
  );
  resume();
}
function dropFruit(e) {
  const g = ellipsoid(
    scene,
    mats.fruit,
    [
      e.obj.position.x,
      height(e.obj.position.x, e.obj.position.z) + 0.2,
      e.obj.position.z,
    ],
    [0.13, 0.17, 0.13],
  );
  const d = register(g, {
    kind: "drop",
    title: "Fruto dispersado",
    taken: false,
  });
  drops.push(d);
}

// ---------- Estado único de interfaz: imposible superponer pausa y partida ----------
const screens = {
  welcome: "welcome",
  paused: "pause",
  dialog: "dialog",
  journal: "journal",
  ending: "ending",
};
function setScreen(next) {
  state.screen = next;
  keys.clear();
  dragging = false;
  Object.values(screens).forEach((id) => ($(id).hidden = true));
  if (screens[next]) $(screens[next]).hidden = false;
  $("hud").hidden = next === "welcome";
  spear.visible = next === "playing";
  arms.visible = next === "playing";
  if (next !== "playing") {
    velocity.set(0, 0, 0);
    interactionRing.visible = false;
  }
  if (next !== "playing" && document.pointerLockElement)
    document.exitPointerLock();
  if (next !== "playing") {
    setTimeout(() => {
      const root = $(screens[next]);
      root
        ?.querySelector("button:not(:disabled)")
        ?.focus({ preventScroll: true });
    }, 0);
  }
}
async function lockMouse() {
  if (
    !isPlaying() ||
    document.pointerLockElement === renderer.domElement ||
    lockPending ||
    state.controller
  )
    return;
  lockPending = true;
  try {
    await renderer.domElement.requestPointerLock();
  } catch {
    toast(
      "Este visor no permite capturar el ratón. Mantén clic derecho y arrastra para mirar.",
    );
  } finally {
    lockPending = false;
  }
}
function resume() {
  setScreen("playing");
  lockMouse();
}
function begin(explore = false) {
  state.explore = explore;
  sound.init();
  player.y = height(player.x, player.z);
  resume();
  toast(
    explore
      ? "Exploración libre: sin daño ni hambre. Abre J para cambiar escenarios."
      : "Recoge ramas caídas y registra tres especies con E.",
  );
}
function pause() {
  if (isPlaying()) setScreen("paused");
  else if (state.screen === "paused") resume();
}
function dialog(e) {
  if (!isPlaying()) return;
  const s = species[e.species];
  if (s) observe(e);
  $("dialog-category").textContent = s?.role || "RECURSO DE CAMPO";
  $("dialog-title").textContent = e.title;
  $("dialog-latin").textContent = s?.latin || "";
  $("dialog-body").textContent =
    s?.body ||
    "Aprovechar recursos caídos reduce la necesidad de talar árboles vivos.";
  $("dialog-fact").textContent =
    s?.fact || "El bosque ofrece recursos que pueden aprovecharse con cuidado.";
  const box = $("dialog-actions");
  box.replaceChildren();
  const action = (label, fn, primary = false, disabled = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = primary ? "primary" : "secondary";
    b.disabled = disabled;
    b.onclick = fn;
    box.appendChild(b);
  };
  if (e.kind === "wood")
    action("Recoger rama · +3 madera", () => collectWood(e), true, e.taken);
  if (e.kind === "bush") {
    action(
      e.ready ? "Recolectar · +2 fruta" : "La planta está regenerándose",
      () => gather(e, "fruit"),
      true,
      !e.ready,
    );
    action("Recolectar · +3 fibra", () => gather(e, "fiber"), false, !e.ready);
  }
  if (e.kind === "tree")
    action(
      "Talar · +5 madera / reduce cobertura",
      () => fell(e),
      false,
      !e.alive,
    );
  if (e.species === "tapir")
    action("Cazar · +35 alimento / pierdes un dispersor", () => hunt(e));
  if (e.kind === "water") {
    $("dialog-title").textContent = "La laguna";
    $("dialog-category").textContent = "FACTOR ABIÓTICO · AGUA";
    $("dialog-body").textContent =
      "El agua sostiene a productores, consumidores y descomponedores. La vegetación de la ribera ayuda a proteger el suelo.";
    $("dialog-fact").textContent =
      `Calidad del agua en el modelo: ${Math.round(state.water)}%. La contaminación afecta primero al medio acuático y después a sus relaciones.`;
    action("Beber agua", drink, true);
  }
  action("Continuar explorando →", resume);
  setScreen("dialog");
}
function interact() {
  if (!isPlaying() || !target || target.taken) return;
  if (target.kind === 'station') { visitSite(target); return; }
  if (target.kind === 'wood') { collectWood(target); target = null; return; }
  if (target.kind === "drop") {
    target.taken = true;
    target.obj.visible = false;
    state.fruit++;
    state.seeds++;
    gesture('gather', target.obj.position);
    toast("+1 fruto y +1 semilla. La dispersión conecta fauna y flora.");
    target = null;
    updateHUD();
    return;
  }
  dialog(target);
}

function openJournal() {
  if (state.screen === "journal") {
    closeJournal();
    return;
  }
  if (!["playing", "paused"].includes(state.screen)) return;
  journalReturn = state.screen;
  setScreen("journal");
  renderJournal();
}
function closeJournal() {
  if (journalReturn === "paused") setScreen("paused");
  else resume();
}
function renderJournal() {
  document
    .querySelectorAll("[data-page]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.page === journalPage),
    );
  let html = "";
  const data = ecology();
  if (journalPage === "identity")
    html = `<div class="journal-grid"><article><span class="eyebrow">IDENTIDAD DEL ECOSISTEMA</span><h3>Selva tropical húmeda</h3><p>Esta expedición está inspirada en las selvas húmedas de Chiapas, en el sureste de México. Es una interpretación artística; no reproduce una reserva ni un mapa real.</p><p>El clima cálido y la abundancia de lluvia permiten una vegetación densa. El dosel intercepta luz y genera un sotobosque más sombreado y húmedo.</p><h3>Un bosque en varias alturas</h3><p>Árboles emergentes → dosel → sotobosque → suelo y hojarasca. Cada estrato ofrece condiciones y refugios distintos.</p></article><article><span class="eyebrow">COMPONENTES</span><h3>Bióticos: lo vivo</h3><p>Ceiba y ramón; plantas del sotobosque; jaguar, tapir, mono araña y tucán; anfibios, reptiles y hongos. La fauna y vegetación se representan de forma estilizada.</p><h3>Abióticos: el medio</h3><p>Agua, luz solar, aire, temperatura, humedad, minerales y relieve. La lluvia y la sombra modifican las condiciones de vida.</p><h3>Recursos naturales</h3><p>Agua, frutos, fibras, madera y suelo. El bosque también ofrece hábitat y regulación ambiental.</p></article></div><p class="consequence"><strong>Nota científica:</strong> talar unos árboles no reduce de inmediato el oxígeno atmosférico hasta asfixiar a una persona. Aquí, “oxígeno / resistencia” representa esfuerzo y estrés ambiental. El crecimiento, la regeneración y las respuestas ecológicas se aceleran para hacer visible el sistema.</p><p>Referencia de identidad y especies: <a href="https://www.biodiversidad.gob.mx/ecosistemas/selvaHumeda" target="_blank" rel="noopener">CONABIO · Selvas húmedas</a>. No uses el juego como guía de supervivencia o identificación de alimentos.</p>`;
  if (journalPage === "network")
    html = `<span class="eyebrow">ENERGÍA QUE FLUYE / NUTRIENTES QUE CIRCULAN</span><h3>Ninguna especie vive aislada</h3><div class="network"><span>☀<br>Luz solar</span><b>→</b><span>Productores<br>Árboles y plantas</span><b>→</b><span>Consumidores<br>Herbívoros y frugívoros</span><b>→</b><span>Depredadores<br>Jaguar y reptiles</span></div><div class="network"><span>Restos de todos los niveles</span><b>→</b><span>Hongos y otros descomponedores</span><b>→</b><span>Nutrientes del suelo</span><b>→</b><span>Plantas</span></div><div class="journal-grid"><article><h3>Dispersión y conectividad</h3><p>Tapir, mono y tucán consumen frutos y transportan semillas. El bosque les proporciona alimento y refugio. Cuando desaparecen dispersores o se fragmenta el dosel, se alteran las oportunidades de regeneración.</p></article><article><h3>Competencia y depredación</h3><p>Los organismos compiten por recursos limitados. Los depredadores consumen otros animales; una alteración puede extenderse a otras poblaciones. Esta es una red simplificada, no una lista de dietas exclusivas.</p></article></div><p class="consequence">En el juego: cortar árboles reduce cobertura → empeora el agua por presión sobre el suelo → aumenta el riesgo al beber. Perder dispersores reduce biodiversidad → se retrasa la disponibilidad de frutos.</p>`;
  if (journalPage === "scenarios")
    html = `<span class="eyebrow">LABORATORIO DE CONSECUENCIAS</span><h3>¿Qué pasaría si una pieza cambiara?</h3><p>Elige una alteración, cierra el cuaderno y explora sus efectos. Puedes restaurar el escenario para comparar; tus decisiones de supervivencia permanecen.</p><div class="scenario-grid"><button class="scenario ${state.scenario === "forest" ? "active" : ""}" data-scenario="forest">01 / COBERTURA<strong>Perdemos bosque</strong>Retira una parte del dosel.<br>Menos refugio y protección del suelo.</button><button class="scenario ${state.scenario === "water" ? "active" : ""}" data-scenario="water">02 / AGUA<strong>La laguna se contamina</strong>Agua turbia, menos actividad acuática y riesgo al beber.</button><button class="scenario ${state.scenario === "dispersers" ? "active" : ""}" data-scenario="dispersers">03 / BIODIVERSIDAD<strong>Faltan dispersores</strong>Desaparecen tapir, mono y tucán.<br>La fruta se regenera más lento.</button></div><p class="consequence">${state.scenario === "forest" ? "Pérdida de dosel → menos sombra y hábitat → más presión sobre suelo y agua → menor equilibrio." : state.scenario === "water" ? "Contaminación → deterioro del medio acuático → menos peces y ranas visibles → riesgo para consumidores, incluido el jugador." : state.scenario === "dispersers" ? "Pérdida de fauna frugívora → menos dispersión de semillas → regeneración vegetal limitada → menos alimento futuro." : "El bosque conserva sus relaciones. Selecciona un escenario para experimentar."}</p><div class="result-grid"><span>${Math.round(data.forest)}%<small>COBERTURA</small></span><span>${Math.round(data.water)}%<small>AGUA</small></span><span>${Math.round(data.biodiversity)}%<small>BIODIVERSIDAD</small></span></div><button class="reset-scenario" id="reset-scenario">Restaurar escenario inicial</button><p>Porcentajes ilustrativos de un modelo de juego. No son mediciones científicas ni pronósticos.</p>`;
  if (journalPage === "discoveries")
    html = `<span class="eyebrow">REGISTROS DE CAMPO</span><h3>${state.observed.size} hallazgos · ${state.fieldScore} puntos</h3><p>Registra 3 especies, visita las 3 estaciones, construye tu campamento y planta 2 árboles. Vuelve al refugio con al menos 70% de equilibrio para completar la expedición.</p><div>${[...state.observed].map((key) => `<span class="discovery">✓ ${species[key].name}<br><small>${species[key].role}</small></span>`).join("") || '<p>Empieza por el hongo o el arbusto cercano al sendero.</p>'}</div><h3>Tu ruta de campo</h3>${fieldSites.map(site => `<article class="consequence"><strong>${state.sites.has(site.id)?'✓':'○'} ${site.title}</strong><p>${state.sites.has(site.id)?site.fact:'Explora esta estación para conocer su función en el bosque.'}</p><small>Suministros: ${site.loot} · 75 puntos, una sola vez.</small></article>`).join('')}<h3>Tu huella en el bosque</h3><p>${state.planted} plantones · ${state.cut} árboles talados · ${state.hunted} animales cazados · ${state.shelter?'campamento construido':'sin campamento'}.</p><p class="consequence">${state.naturalistBadge?'★ Insignia Naturalista conseguida':'Reto extra: registra 8 especies sin talar ni cazar para ganar la insignia Naturalista y 150 puntos.'}</p>`;
  $("journal-content").innerHTML = html;
  document
    .querySelectorAll("[data-scenario]")
    .forEach((b) => (b.onclick = () => scenarioChange(b.dataset.scenario)));
  $("reset-scenario")?.addEventListener("click", () => scenarioChange("none"));
}
function finish(won) {
  if (state.screen === "ending") return;
  state.won = won || state.won;
  setScreen("ending");
  $("ending-label").textContent = won
    ? "EXPEDICIÓN COMPLETADA"
    : "FIN DE LA EXPEDICIÓN";
  $("ending-title").textContent = won
    ? "Dejaste vida."
    : "El equilibrio importa.";
  const cause = state.lastCause;
  $("ending-copy").textContent = won
    ? "Comprendiste relaciones, aprovechaste recursos caídos y protegiste nuevos árboles. En la realidad, restaurar requiere continuidad: una plantación no reemplaza de inmediato un bosque maduro."
    : cause === "hambre"
      ? "Se agotaron tus reservas. La diversidad y la recolección responsable sostienen el alimento a lo largo del tiempo."
      : cause === "agua contaminada"
        ? "El agua alterada deterioró tu salud. Proteger la vegetación de las riberas y prevenir vertidos conserva relaciones entre tierra y agua."
        : cause === "veneno"
          ? "El veneno debilitó tu salud. Conserva distancia de la fauna y usa el refugio para recuperarte."
          : "Las heridas acabaron con la expedición. La observación a distancia y un refugio son parte de sobrevivir sin eliminar la fauna.";
  $("ending-stats").innerHTML =
    `<span>${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, "0")}<small>TIEMPO</small></span><span>${Math.round(state.eco)}%<small>EQUILIBRIO</small></span><span>${state.fieldScore}<small>PUNTOS DE CAMPO</small></span>`;
  $("continue").hidden = !won;
}
function updateHUD() {
  for (const [id, v] of [
    ["health", state.health],
    ["oxygen", state.oxygen],
    ["food", state.food],
  ]) {
    $(id + "-value").textContent = Math.ceil(v);
    $(id + "-bar").style.width = v + "%";
    $(id + "-bar")
      .closest(".vital")
      .classList.toggle("critical", v < 25);
  }
  for (const id of ["wood", "fiber", "fruit", "seeds"])
    $(id).textContent = state[id];
  $("eco-value").innerHTML = `${Math.round(state.eco)}<small>%</small>`;
  $("eco-ring").style.strokeDashoffset = 113.1 * (1 - state.eco / 100);
  const minutes = (384 + (state.time / 300) * 1440) % 1440;
  $("day").textContent =
    `DÍA ${String(1 + Math.floor(state.time / 300)).padStart(2, "0")} · ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;
  $("weather").textContent = state.rain
    ? "Lluvia tropical"
    : state.daylight < 0.25
      ? "Noche del bosque"
      : "Bruma de la selva";
  $("temperature").textContent =
    `${Math.round(23 + state.daylight * 5 + (100 - state.eco) * 0.045)} °C · ${Math.round(80 + Number(state.rain) * 15)}% humedad`;
  let label, copy;
  if (state.observed.size < 3) {
    label = "Aprende a mirar";
    copy = `Registra tres especies distintas con E. ${state.observed.size}/3`;
  } else if (state.sites.size < 3) {
    label = 'Sigue las pistas del bosque';
    copy = `Explora las estaciones y recupera suministros. ${state.sites.size}/3`;
  } else if (!state.shelter) {
    label = "Un refugio con cuidado";
    copy = "Recoge 6 madera caída y 3 fibra. Construye con B.";
  } else if (state.planted < 2) {
    label = "Devuelve algo al bosque";
    copy = `Planta con P: 1 semilla + 1 madera. ${state.planted}/2`;
  } else {
    label = 'Vuelve a casa';
    copy = 'Regresa a tu refugio con al menos 70% de equilibrio para completar la expedición.';
  }
  if (state.won) {
    label = "Expedición completada";
    copy = 'Sigue descubriendo especies o experimenta con los escenarios de J.';
  }
  $("mission-title").textContent = label;
  $("mission-copy").textContent = copy;
  $("mission-progress").innerHTML = [state.observed.size>=3,state.sites.size===3,!!state.shelter,state.planted>=2,state.won]
    .map((done) => `<i class="${done ? "done" : ""}"></i>`)
    .join("");
  $('expedition-guide').textContent = expeditionGuide();
  $('expedition-score').textContent = `${state.fieldScore} puntos · ${state.observed.size} especies · ${state.sites.size}/3 estaciones${state.naturalistBadge?' · ★ Naturalista':''}`;
  const degrees = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
  const headings = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  $("heading").textContent =
    headings[Math.round(degrees / 45) % 8] + " " + Math.round(degrees) + "°";
  $("status-tags").textContent = [
    state.explore ? "EXPLORACIÓN LIBRE" : "",
    state.poison > 0 ? "VENENO / MALESTAR" : "",
    state.exhausted ? 'RECUPERANDO RESISTENCIA' : '',
    hasShelter() ? "ZONA DE REFUGIO" : "",
    state.scenario !== "none" ? "ESCENARIO ALTERADO" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---------- Entradas de teclado, ratón y mando ----------
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer.domElement;
  const lost = wasLocked && !locked;
  wasLocked = locked;
  if (lost && isPlaying() && !state.controller) setScreen("paused");
});
document.addEventListener("mousemove", (e) => {
  if (!isPlaying()) return;
  if (document.pointerLockElement === renderer.domElement || dragging) {
    yaw -= e.movementX * 0.002;
    pitch = clamp(pitch - e.movementY * 0.002, -1.25, 1.25);
  }
});
renderer.domElement.addEventListener("mousedown", (e) => {
  if (!isPlaying()) return;
  if (e.button === 2) {
    dragging = true;
    return;
  }
  if (e.button === 0) {
    if (document.pointerLockElement === renderer.domElement || state.controller)
      interact();
    else lockMouse();
  }
});
document.addEventListener("mouseup", () => (dragging = false));
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("blur", () => {
  keys.clear();
  if (isPlaying()) setScreen("paused");
});
document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape") {
    if (state.screen === "dialog") setScreen("paused");
    else if (state.screen === "journal") closeJournal();
    else if (isPlaying()) setScreen("paused");
    return;
  }
  if (e.code === "KeyM") {
    sound.mute();
    return;
  }
  if (e.code === "KeyJ") {
    openJournal();
    return;
  }
  if (!isPlaying()) return;
  keys.add(e.code);
  if (e.code === "KeyE") interact();
  if (e.code === "KeyF") defend();
  if (e.code === "KeyP") plant();
  if (e.code === "KeyB") build();
  if (e.code === "KeyC") consume();
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
function menuButtons() {
  const root = $(screens[state.screen]);
  return root
    ? [...root.querySelectorAll("button:not(:disabled),select")].filter(
        (b) => !b.hidden && b.getClientRects().length,
      )
    : [];
}
function pollPad(dt) {
  const gp = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (!gp) {
    state.controller = false;
    return null;
  }
  if (!state.controller) {
    state.controller = true;
    toast("Mando conectado · A investigar / View cuaderno / Start pausa");
  }
  const pressed = (i) => gp.buttons[i]?.pressed && !padPrevious[i];
  if (pressed(9)) {
    if (isPlaying()) setScreen("paused");
    else if (state.screen === "paused") resume();
  } else if (pressed(8)) openJournal();
  else if (isPlaying()) {
    if (pressed(0)) interact();
    if (pressed(1)) defend();
    if (pressed(2)) build();
    if (pressed(3)) plant();
    if (pressed(7)) consume();
  } else {
    const buttons = menuButtons();
    padNav -= dt;
    const vertical = gp.axes[1] || 0;
    if (
      (pressed(12) ||
        pressed(13) ||
        (Math.abs(vertical) > 0.65 && padNav <= 0)) &&
      buttons.length
    ) {
      const step = pressed(12) || vertical < -0.65 ? -1 : 1;
      const current = buttons.indexOf(document.activeElement);
      buttons[(current + step + buttons.length) % buttons.length].focus();
      padNav = 0.25;
    }
    if (pressed(0)) {
      const focused = document.activeElement;
      if (buttons.includes(focused)) focused.click();
    }
    if (pressed(1)) {
      if (state.screen === "journal") closeJournal();
      else if (state.screen === "dialog" || state.screen === "paused") resume();
    }
  }
  padPrevious = gp.buttons.map((b) => b.pressed);
  return gp;
}
function axis(value = 0) {
  return Math.abs(value) < 0.17
    ? 0
    : (Math.sign(value) * (Math.abs(value) - 0.17)) / 0.83;
}
$("start").onclick = () => begin(false);
$("explore").onclick = () => begin(true);
$("resume").onclick = resume;
$("restart").onclick = $("retry").onclick = () => {
  disposeExpedition();
  location.reload();
};
$("continue").onclick = resume;
$("pause-button").onclick = pause;
$("journal-button").onclick = $("pause-journal").onclick = openJournal;
$("journal-close").onclick = closeJournal;
$("dialog-close").onclick = resume;
$("build-button").onclick = build;
$("plant-button").onclick = plant;
$("eat-button").onclick = consume;
$("audio-button").onclick = () => sound.mute();
document.querySelectorAll("[data-page]").forEach(
  (b) =>
    (b.onclick = () => {
      journalPage = b.dataset.page;
      renderJournal();
    }),
);
function quality(name) {
  state.quality = name;
  const atmospheric = name !== 'low';
  staticContact.visible = contact.visible = clouds.visible = atmospheric;
  for (const beam of lightShafts) beam.visible = atmospheric && state.daylight > 0.02;
  coolFill.intensity = atmospheric ? 0.06 + state.daylight * 0.18 : 0;
  leafTransmission.value = atmospheric ? state.daylight * 0.28 : 0;
  waterVisualUniforms.light.value = state.daylight * (name === 'high' ? 1 : atmospheric ? 0.55 : 0);
  waterMat.uniforms.reflectionStrength.value = atmospheric ? 1 : 0;
  const factor = name === "high" ? 1.5 : name === "medium" ? 0.9 : 0.7;
  renderer.setPixelRatio(Math.min(devicePixelRatio, factor));
  composer.setPixelRatio(Math.min(devicePixelRatio, factor));
  sun.shadow.mapSize.setScalar(name === "high" ? 2048 : 1024);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  bloom.enabled = name !== "low";
  groundUniforms.uGroundNormal.value = name === "low" ? 0 : 1;
  const anisotropy = Math.min(
    renderer.capabilities.getMaxAnisotropy(),
    name === "high" ? 4 : name === "medium" ? 2 : 1,
  );
  for (const map of [
    groundAtlas,
    groundNormalAtlas,
    barkMap,
    barkNormal,
    leafMap,
    fernMap,
  ]) {
    map.anisotropy = anisotropy;
    map.needsUpdate = true;
  }
  if (typeof finishPass !== "undefined") {
    finishPass.uniforms.detail.value =
      name === "high" ? 1 : name === "medium" ? 0.55 : 0;
  }
  $("quality").value = name;
  $("quality-pause").value = name;
  updateForestLOD(1, true);
}
$("quality").onchange = (e) => {
  preferredQuality = e.target.value;
  quality(e.target.value);
  qualityCooldown = 12;
};
$("quality-pause").onchange = $("quality").onchange;
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- Simulación y animación: los menús detienen todo el mundo ----------
function updatePlayer(dt, gp) {
  if (state.oxygen <= 15) state.exhausted = true;
  else if (state.oxygen >= 35) state.exhausted = false;
  let x =
      (keys.has("KeyD") ? 1 : 0) -
      (keys.has("KeyA") ? 1 : 0) +
      axis(gp?.axes[0]),
    z =
      (keys.has("KeyW") ? 1 : 0) -
      (keys.has("KeyS") ? 1 : 0) -
      axis(gp?.axes[1]);
  if (gp) {
    yaw -= axis(gp.axes[2]) * dt * 2.2;
    pitch = clamp(pitch - axis(gp.axes[3]) * dt * 1.8, -1.25, 1.25);
  }
  const move = Math.hypot(x, z),
    sprint =
      (keys.has("ShiftLeft") ||
        keys.has("ShiftRight") ||
        gp?.buttons[4]?.pressed) &&
      !state.exhausted &&
      move > 0.1;
  const old = player.clone();
  if (move > 0.05 || velocity.lengthSq() > 0.002) {
    x /= Math.max(move, 1);
    z /= Math.max(move, 1);
    const speed = (sprint ? 5.3 : 2.9) * (wet(player.x, player.z) ? 0.6 : 1);
    const response = 1 - Math.exp(-dt * (move > 0.05 ? 9 : 13));
    velocity.x = mix(
      velocity.x,
      (Math.cos(yaw) * x - Math.sin(yaw) * z) * speed,
      response,
    );
    velocity.z = mix(
      velocity.z,
      (-Math.sin(yaw) * x - Math.cos(yaw) * z) * speed,
      response,
    );
    player.addScaledVector(velocity, dt);
    for (const c of rockColliders) {
      const dx = player.x - c.x,
        dz = player.z - c.z,
        d = Math.hypot(dx, dz);
      if (d < c.r && d > 0.001) {
        const push = (c.r - d) * (1 - Math.exp(-dt * 24));
        player.x += (dx / d) * push;
        player.z += (dz / d) * push;
      }
    }

    player.x = clamp(player.x, -47, 47);
    player.z = clamp(player.z, -47, 47);
    for (const e of trees) {
      if (!e.obj.visible || e.visualTarget === 0) continue;
      const dx = player.x - e.obj.position.x,
        dz = player.z - e.obj.position.z,
        d = Math.hypot(dx, dz),
        radius = 0.58 * e.size + 0.25;
      if (d < radius) {
        player.x = e.obj.position.x + (dx / (d || 1)) * radius;
        player.z = e.obj.position.z + (dz / (d || 1)) * radius;
      }
    }
    if (height(player.x, player.z) - height(old.x, old.z) > 0.65)
      player.copy(old);
    if (state.time - state.lastStep > (sprint ? 0.29 : 0.48)) {
      const submerged = wet(player.x, player.z);
      sound.rustle(
        (submerged ? 520 : pathMask(player.x, player.z) > 0.4 ? 230 : 950) *
          rand(0.85, 1.15),
        submerged ? 0.14 : 0.09,
        submerged ? 0.18 : 0.11,
      );
      if (submerged) ripple(player.x, player.z, 0.1);
      state.lastStep = state.time;
    }
  }
  player.y = mix(
    player.y,
    Math.max(height(player.x, player.z), waterLevel - 1.05),
    Math.min(dt * 12, 1),
  );
  const bob =
    move > 0.05
      ? Math.sin(state.time * (sprint ? 12 : 8)) * 0.027
      : Math.sin(state.time * 1.4) * 0.008;
  camera.position.set(player.x, player.y + eye + bob, player.z);
  const waterDepth = waterLevel - height(player.x, player.z);
  if (waterDepth > 0 && !wasInWater) ripple(player.x, player.z, 0.16);
  wasInWater = waterDepth > 0;
  locomotion = mix(
    locomotion,
    Math.min(1, velocity.length() / 3),
    1 - Math.exp(-dt * 8),
  );
  camera.fov = mix(
    camera.fov,
    sprint ? 71 : waterDepth > 1 ? 63 : 65,
    1 - Math.exp(-dt * 5),
  );
  camera.updateProjectionMatrix();
  camera.rotation.set(
    pitch + damageKick * Math.sin(state.time * 27),
    yaw,
    Math.sin(state.time * 8) * locomotion * 0.003,
    "YXZ",
  );
  damageKick *= Math.exp(-dt * 10);
  if (!state.explore) {
    state.oxygen = clamp(
      state.oxygen + dt * (sprint ? -9 : 6 - (100 - state.eco) * 0.025),
      0,
      100,
    );
    state.food = clamp(state.food - dt * (0.13 + (sprint ? 0.1 : 0)), 0, 100);
  }
}
function updateAim() {
  target = null;
  camera.getWorldDirection(direction);
  let best = Infinity;
  // Selección por centro y radio: las ranas pequeñas también son accesibles.
  for (const e of entities) {
    if (!e.obj.visible || e.taken || e.visualTarget === 0) continue;
    const pos = e.obj.position.clone();
    pos.y +=
      e.kind === "tree"
        ? 1.5
        : e.kind === "bush"
          ? 0.7
          : e.kind === 'station' ? 1.35 : e.kind === "animal"
            ? 0.5
            : 0.2;
    const delta = pos.sub(camera.position),
      dist = delta.length();
    const reach =
      e.kind === "animal" && (["mono", "tucan"].includes(e.species) || ['air','canopy'].includes(e.travel)) ? 12 : 4;
    const alignment = delta.normalize().dot(direction);
    if (dist < reach && alignment > (e.kind === "tree" ? 0.8 : 0.86)) {
      const score = dist + (1 - alignment) * 8;
      if (score < best) {
        best = score;
        target = e;
      }
    }
  }
  if (!target && wet(player.x, player.z))
    target = { kind: "water", title: "Agua de la laguna" };
  $("interact-hint").hidden = !target;
  if (target)
    $("interact-hint").textContent =
      (state.controller ? "A" : "E") +
      " · " +
      (target.kind === "water" ? "Agua de la laguna" : target.title);
}
// Fase 3: decisions run in seconds; each animal retains its destination.
// A separate deterministic sequence keeps wildlife decisions out of gameplay RNG.
function wildlifeRandom(e) {
  return terrainHash(++e.decision, e.phase + 173);
}
function wildlifeHabitat(e, x, z) {
  if (Math.abs(x) > 43 || Math.abs(z) > 43) return false;
  if (e.travel === 'air' || e.travel === 'canopy') return true;
  if (e.travel === 'water') return wet(x, z) && height(x,z) < waterLevel - .35;
  return !wet(x,z) && groundSlope(x,z) < .85 &&
    !trees.some(tree => tree.alive && tree.visualTarget !== 0 && horizontalDistance({x,z},tree.obj.position) < tree.size*.65+.35);
}
function wildlifeGoal(e, fleeing = false) {
  const p = e.obj.position;
  for (let attempt=0;attempt<16;attempt++) {
    const angle = fleeing
      ? Math.atan2(p.z-player.z,p.x-player.x)+(wildlifeRandom(e)-.5)*1.2
      : wildlifeRandom(e)*TAU;
    const range = e.travel === 'canopy' ? .65 : e.travel === 'air' ? (e.smallFlyer ? 1.5 : 6) : 4;
    const distance = (fleeing ? 3 : .8) + wildlifeRandom(e)*range;
    const origin = fleeing ? p : e.home;
    const x=origin.x+Math.cos(angle)*distance, z=origin.z+Math.sin(angle)*distance;
    if (!wildlifeHabitat(e,x,z)) continue;
    e.goal.set(x,e.home.y,z);
    if(e.travel==='air')e.goal.y=e.home.y + (wildlifeRandom(e)-.5)*(e.smallFlyer?.6:2);
    if(e.travel==='canopy') { // Remain on the support branch.
      e.goal.x=e.home.x+(wildlifeRandom(e)-.5)*1.1;
      e.goal.z=e.home.z;
    }
    e.goalChanges++;
    return true;
  }
  e.goal.copy(p);
  return false;
}
function setupWildlifeMotion(e, travel, groundY, perchY) {
  e.travel=travel;
  if(travel==='ground' && !wildlifeHabitat(e,e.home.x,e.home.z)) {
    for(let i=0;i<96;i++) {
      const radius=.6+Math.floor(i/12)*.6,angle=(i%12)*TAU/12;
      const x=e.home.x+Math.cos(angle)*radius,z=e.home.z+Math.sin(angle)*radius;
      if(!wildlifeHabitat(e,x,z))continue;
      e.home.x=e.obj.position.x=x;e.home.z=e.obj.position.z=z;
      groundY=height(x,z);break;
    }
  }
  e.decision=0;
  e.goalChanges=0;
  e.smallFlyer=['abeja','mariposa'].includes(e.species);
  e.home.y=travel==='air' ? (perchY ?? groundY+(e.smallFlyer?1.25:6)) : travel==='canopy' ? perchY : groundY;
  e.obj.position.y=travel==='water'?waterLevel-.18:e.home.y;
  e.goal.copy(e.obj.position);
  e.ai='rest';
  e.aiTime=1+wildlifeRandom(e)*4;
  e.replan=0;
  e.stride=0;
  e.motion=0;
  e.turnRate=e.smallFlyer?3.5:1.65;
}
function updateWildlife(e, dt) {
  const p=e.obj.position;
  const nearby=p.distanceTo(new THREE.Vector3(player.x,player.y+.7,player.z));
  const nocturnal=e.info?.nocturnal && state.daylight>.6;
  e.aiTime-=dt;
  e.replan-=dt;
  if(nearby<(e.smallFlyer?1.1:3.4) && e.travel!=='canopy') {
    if(e.ai!=='flee' || e.replan<=0) {
      wildlifeGoal(e,true);
      e.replan=1.2;
    }
    e.ai='flee';e.flee=state.time+2;
  } else if(e.ai==='flee' && e.flee>state.time) {
    // Keep the escape destination until its timer expires.
  } else if(nocturnal) {
    if(e.travel==='air' && !e.smallFlyer && p.distanceTo(e.home)>.14) {
      e.goal.copy(e.home);e.ai='return';e.aiTime=15;
    } else e.ai='rest';
  } else if(e.aiTime<=0 || e.ai==='flee') {
    if(e.ai==='travel' || e.ai==='flee') {
      e.ai=e.travel==='air' && !e.smallFlyer?'return':wildlifeRandom(e)>.45?'feed':'rest';
      if(e.ai==='return')e.goal.copy(e.home);
      e.aiTime=2.5+wildlifeRandom(e)*5;
    } else if(e.ai==='return') {
      e.aiTime=10;
    } else {
      e.ai=wildlifeGoal(e)?'travel':'rest';
      e.aiTime=8+wildlifeRandom(e)*5;
    }
  }
  const delta=e.goal.clone().sub(p);
  if(e.travel!=='air')delta.y=0;
  const distance=delta.length();
  let moving=['travel','flee','return'].includes(e.ai) && distance>.12;
  if(!moving && ['travel','flee','return'].includes(e.ai)) {
    if(e.ai!=='return' && e.travel==='air' && !e.smallFlyer) {
      e.goal.copy(e.home);e.ai='return';e.aiTime=15;
    } else {e.ai='rest';e.aiTime=2+wildlifeRandom(e)*3;}
  }
  const slow=['tortuga','escarabajo','hormiga','armadillo'].includes(e.species);
  const speed=e.ai==='flee'?(slow?.45:2.1):e.travel==='air'?(e.smallFlyer?.55:1.8):slow?.17:e.travel==='canopy'?.28:.65;
  e.motion=mix(e.motion,moving?speed:0,1-Math.exp(-dt*5));
  if(moving) {
    const desired=Math.atan2(-delta.x,-delta.z);
    const angle=Math.atan2(Math.sin(desired-e.obj.rotation.y),Math.cos(desired-e.obj.rotation.y));
    e.obj.rotation.y+=clamp(angle,-e.turnRate*dt,e.turnRate*dt);
    const step=Math.min(distance,e.motion*dt)*Math.max(.15,Math.cos(angle));
    const next=p.clone().addScaledVector(delta.normalize(),step);
    if(wildlifeHabitat(e,next.x,next.z))p.copy(next);
    else {e.ai='rest';e.aiTime=1.5;e.motion=0;moving=false;}
  }
  if(e.travel==='water')p.y=waterLevel-.18+Math.sin(state.time*1.3+e.phase)*.025;
  else if(e.travel==='ground')p.y=height(p.x,p.z);
  else if(e.travel==='canopy')p.y=e.home.y;
  e.stride+=e.motion*dt*(slow?9:6);
  e.legs.forEach((limb,i)=>{
    const phase=e.stride+(i===0||i===3?0:Math.PI);
    limb.rotation.x=mix(limb.rotation.x,moving?Math.sin(phase)*.35:0,1-Math.exp(-dt*12));
  });
  if(e.head) {
    e.head.rotation.x=mix(e.head.rotation.x,e.ai==='feed'?.3:0,1-Math.exp(-dt*3));
    e.head.rotation.y=mix(e.head.rotation.y,moving?0:Math.sin(state.time*.45+e.phase)*.12,1-Math.exp(-dt*3));
  }
  if(e.tail)e.tail.rotation.y=Math.sin(e.stride*.6+e.phase)*.09;
  const flying=e.travel==='air' && (moving || e.smallFlyer);
  e.wings?.forEach((wing,i)=>{
    const flap=e.species==='abeja'?32:e.species==='mariposa'?7:9;
    const amplitude=e.species==='aguila'?.14:.55;
    const pose=flying?Math.sin(state.time*flap+e.phase)*amplitude:.95;
    wing.rotation.z=mix(wing.rotation.z,pose*(i?1:-1),1-Math.exp(-dt*18));
  });
}
function updateAnimals(dt) {
  for (const e of animals) {
    const kind = e.species;
    const scenarioMissing =
      (state.scenario === "dispersers" &&
        (["tapir", "mono", "tucan"].includes(kind) || e.info?.role.toLowerCase().includes('frugívoro'))) ||
      (state.water < 45 && kind === "rana") || e.perchTree?.visualTarget === 0;
    e.presence = mix(
      e.presence ?? 1,
      scenarioMissing ? 0 : 1,
      1 - Math.exp(-dt * 1.2),
    );
    e.obj.scale.copy(e.baseScale).multiplyScalar(Math.max(0.001, e.presence));
    e.obj.visible = e.active && e.presence > 0.025;
    if (!e.obj.visible) continue;
    if (e.expanded) {
      updateWildlife(e,dt);
      continue;
    }
    if (e.head) {
      const look = clamp(
        Math.atan2(player.x - e.obj.position.x, player.z - e.obj.position.z) -
          e.obj.rotation.y -
          Math.PI,
        -0.5,
        0.5,
      );
      e.head.rotation.y = mix(
        e.head.rotation.y,
        horizontalDistance(player, e.obj.position) < 8 ? look : 0,
        1 - Math.exp(-dt * 4),
      );
      e.head.rotation.x = mix(
        e.head.rotation.x,
        e.ai === "feed" ? 0.26 : 0,
        1 - Math.exp(-dt * 3),
      );
    }
    if (kind === "tucan") {
      updateWildlife(e,dt);
      continue;
    }
    if (kind === "mono") {
      e.obj.position.y =
        height(e.home.x, e.home.z) + 5.6 + Math.sin(state.time * 1.8) * 0.07;
      e.legs.forEach(
        (l, i) => (l.rotation.x = Math.sin(state.time * 2 + i * Math.PI) * 0.2),
      );
      e.obj.rotation.y = Math.sin(state.time * 0.5) * 0.4;
      e.tail.rotation.y = Math.sin(state.time) * 0.18;
      if (state.time - e.lastFruit > 35) {
        e.lastFruit = state.time;
        dropFruit(e);
      }
      continue;
    }
    if (kind === "rana") {
      const hop =
        Math.max(0, Math.sin(state.time * 1.5 + e.phase) - 0.72) * 1.5;
      e.obj.position.y = height(e.obj.position.x, e.obj.position.z) + hop;
      e.obj.scale.y =
        e.presence * (1 + Math.sin(state.time * 3 + e.phase) * 0.04);
      continue;
    }
    const d = horizontalDistance(e.obj.position, player),
      territory = kind === "caiman" ? wet(player.x, player.z) : true;
    if ((!e.hostile && d < 5) || scenarioMissing) {
      e.flee = state.time + 2;
      e.goal
        .copy(e.obj.position)
        .addScaledVector(
          e.obj.position.clone().sub(player).setY(0).normalize(),
          7,
        );
    }
    const prey =
      kind === "jaguar"
        ? animals.find(
            (a) => a.species === "tapir" && a.active && a.obj.visible,
          )
        : null;
    if (e.flee > state.time) e.ai = "flee";
    else if (
      prey &&
      d > 10 &&
      horizontalDistance(e.obj.position, prey.obj.position) < 12
    ) {
      e.ai = "stalk";
      e.goal.copy(prey.obj.position);
      prey.flee = state.time + 3;
      prey.goal
        .copy(prey.obj.position)
        .addScaledVector(
          prey.obj.position.clone().sub(e.obj.position).setY(0).normalize(),
          9,
        );
    } else if (e.hostile && d < 9 && territory && !hasShelter()) {
      e.ai = d < 2 ? "attack" : "stalk";
      e.goal.copy(player);
    } else if (e.hostile && hasShelter() && d < 9) {
      e.ai = "flee";
      e.flee = state.time + 3;
      e.goal
        .copy(e.obj.position)
        .addScaledVector(
          e.obj.position.clone().sub(player).setY(0).normalize(),
          7,
        );
    } else {
      e.ai = "patrol";
      e.aiTime -= dt;
      if (e.aiTime < 0 || horizontalDistance(e.obj.position, e.goal) < 0.5) {
        e.aiTime = rand(4, 9);
        e.goal.set(e.home.x + rand(-6, 6), 0, e.home.z + rand(-5, 5));
      }
    }
    const delta = e.goal.clone().sub(e.obj.position).setY(0);
    if (e.ai === "patrol" && Math.sin(state.time * 0.35 + e.phase) > 0.65)
      e.ai = "feed";
    const moving = delta.length() > 0.35 && e.ai !== "feed";
    const speed =
      e.ai === "flee"
        ? 3.5
        : e.ai === "stalk"
          ? 1.6
          : kind === "serpiente"
            ? 0.25
            : 0.5;
    e.motion = mix(e.motion ?? 0, moving ? speed : 0, 1 - Math.exp(-dt * 5));
    if (moving) {
      delta.normalize();
      const nx = clamp(e.obj.position.x + delta.x * speed * dt, -45, 45),
        nz = clamp(e.obj.position.z + delta.z * speed * dt, -45, 45);
      if (kind === "caiman" ? shoreRadius(nx, nz) < 1.12 : !wet(nx, nz)) {
        e.obj.position.x = nx;
        e.obj.position.z = nz;
      } else e.aiTime = 0;
      const desired = Math.atan2(-delta.x, -delta.z);
      e.obj.rotation.y +=
        Math.atan2(
          Math.sin(desired - e.obj.rotation.y),
          Math.cos(desired - e.obj.rotation.y),
        ) * Math.min(1, dt * 4);
    }
    e.obj.position.y =
      kind === "caiman"
        ? waterLevel - 0.14
        : height(e.obj.position.x, e.obj.position.z);
    e.legs.forEach(
      (l, i) =>
        (l.rotation.x = moving
          ? Math.sin(state.time * 5 + (i === 0 || i === 3 ? 0 : Math.PI)) *
            Math.min(0.65, e.motion * 0.5)
          : 0),
    );
    e.obj.scale.y *= 1 + Math.sin(state.time * 2 + e.phase) * 0.012;
    if (e.tail)
      e.tail.rotation.y =
        Math.sin(state.time * (kind === "serpiente" ? 5 : 2) + e.phase) *
        (kind === "serpiente" ? 0.25 : 0.1);
    if (e.body)
      e.body.position.y =
        Math.sin(state.time * 8 + e.phase) * Math.min(0.025, e.motion * 0.008);
    if (e.ai === "attack" && state.time - e.attackAt > 2.5) {
      e.attackAt = state.time;
      damage(
        kind === "serpiente" ? 6 : 12,
        kind === "serpiente" ? "veneno" : "heridas",
      );
      if (kind === "serpiente") state.poison = 22;
      sound.tone(85, 0.35, 0.14, -40, "sawtooth");
      toast("Mantén distancia. F / B del mando para repeler.");
    }
  }
  fish.forEach((f, i) => {
    f.obj.visible = state.water > 40 || i < 3;
    const a = state.time * 0.32 + f.phase;
    f.obj.position.set(
      Math.sin(a) * f.radius,
      waterLevel - 0.45 + Math.sin(a * 2) * 0.1,
      Math.cos(a) * f.radius * 0.6 - 3,
    );
    f.obj.rotation.y = a + Math.PI / 2;
    f.obj.children[1].rotation.y = Math.sin(state.time * 9 + f.phase) * 0.4;
  });
}
function environment(dt, t) {
  const phase = (t / 300 + 0.265) * TAU,
    day = clamp(Math.sin(phase) * 1.3, 0, 1);
  state.daylight = day;
  sun.position.set(
    -30 * Math.sin(phase),
    38 * Math.sin(phase),
    -30 * Math.cos(phase),
  );
  sun.intensity = 0.1 + day * 3;
  hemi.intensity = 0.65 + day * 1.45;
  moon.intensity = 0.12 + (1 - day) * 0.7;
  coolFill.intensity = state.quality === 'low' ? 0 : 0.06 + day * 0.18;
  coolFill.position.copy(sun.position).multiplyScalar(-1).setY(18);
  leafLight.value.copy(sun.position).sub(sun.target.position).transformDirection(camera.matrixWorldInverse);
  leafTransmission.value = state.quality === 'low' ? 0 : day * 0.28;
  skyMat.uniforms.day.value = day;
  skyMat.uniforms.sun.value.copy(sun.position).normalize();
  waterMat.uniforms.time.value = t;
  waterMat.uniforms.day.value = day;
  waterMat.uniforms.clean.value = mix(
    waterMat.uniforms.clean.value,
    state.water / 100,
    1 - Math.exp(-dt * 0.9),
  );
  skyMat.uniforms.time.value = t;
  skyMat.uniforms.rain.value = mix(
    skyMat.uniforms.rain.value,
    state.rain ? 1 : 0,
    1 - Math.exp(-dt * 0.7),
  );
  waterMat.uniforms.sun.value.copy(sun.position).normalize();
  const fog = new THREE.Color(0x839d80).lerp(
    new THREE.Color(0x172e39),
    1 - day,
  );
  fog.lerp(new THREE.Color(0xaaa184), (100 - state.eco) / 170);
  scene.fog.color.copy(fog);
  scene.fog.density =
    0.013 +
    (1 - day) * 0.008 +
    (100 - state.eco) * 0.00015 +
    (state.rain ? 0.012 : 0);
  renderer.toneMappingExposure = 1.05 + (1 - day) * 0.1;
  shaftMat.uniforms.strength.value = day * (state.rain ? 0.008 : 0.075);
  for (const beam of lightShafts) {
    beam.visible = state.quality !== 'low' && day > 0.02;
    const up = sun.position.clone().sub(sun.target.position).normalize();
    const side = new THREE.Vector3().subVectors(camera.position, beam.position).cross(up).normalize();
    const front = new THREE.Vector3().crossVectors(side, up).normalize();
    beam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, front));
  }
  clouds.visible = state.quality !== 'low';
  cloudMaterial.color.setRGB(0.28 + day * 0.66, 0.35 + day * 0.56, 0.44 + day * 0.39);
  cloudMaterial.color.multiplyScalar(state.rain ? 0.66 : 1);
  cloudMaterial.opacity = 0.19 + day * 0.15;
  clouds.position.x = Math.sin(t * 0.004) * 7;
  clouds.position.z = Math.cos(t * 0.003) * 5;
  waterVisualUniforms.time.value = t;
  waterVisualUniforms.light.value = day * (state.quality === 'high' ? 1 : state.quality === 'medium' ? 0.55 : 0);
  staticContact.visible = contact.visible = state.quality !== 'low';
  windUniform.value = t * 0.7;
  pollen.rotation.y = t * 0.003;
  fireflies.material.opacity = (1 - day) * 0.85;
  fireflies.rotation.y = -t * 0.01;
  glows.forEach((m) => (m.material.emissiveIntensity = 0.15 + (1 - day) * 2));
  const raining = t % 120 > 75 && t % 120 < 106;
  if (raining !== state.rain) {
    state.rain = raining;
    rain.visible = raining;
    if (state.time > 2)
      toast(
        raining
          ? "Lluvia tropical · Se acelera la regeneración de los frutos."
          : "La lluvia dejó de caer.",
      );
  }
  if (state.rain) {
    rain.position.set(player.x, player.y, player.z);
    const arr = rainGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= dt * 18;
      arr[i + 4] -= dt * 18;
      if (arr[i + 1] < 0) {
        arr[i + 1] = 24;
        arr[i + 4] = 23.5;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  if (sound.ctx)
    sound.ambient.gain.setTargetAtTime(
      state.rain ? 0.9 : 0.16,
      sound.ctx.currentTime,
      0.4,
    );
  if (state.shelter) {
    const f = state.shelter.userData;
    f.flame.scale.set(1 + Math.sin(t * 13) * 0.1, 1 + Math.sin(t * 9) * 0.2, 1);
    f.light.intensity = 13 + Math.sin(t * 11) * 2;
  }
}
// ---------- Fases 3–5: fauna, presencia del jugador y acabado ----------
const velocity = new THREE.Vector3(),
  rockColliders = [],
  growingPlants = [];
let locomotion = 0,
  wasInWater = false,
  damageKick = 0,
  actionTime = 0,
  actionKind = "gather",
  animationFrame = 0,
  disposed = false;
let preferredQuality = "medium",
  qualityCooldown = 12,
  qualityWindow = 0,
  qualityFrames = 0;
const qualityOrder = ["low", "medium", "high"];
function updateAdaptiveQuality(dt) {
  if (!$("auto-quality").checked) {
    qualityWindow = qualityFrames = 0;
    return;
  }
  if (!isPlaying() || document.hidden || !Number.isFinite(dt) || dt > 0.25)
    return;
  qualityCooldown -= dt;
  qualityWindow += dt;
  qualityFrames++;
  if (qualityWindow < 4) return;
  const fps = qualityFrames / qualityWindow;
  qualityWindow = 0;
  qualityFrames = 0;
  const current = qualityOrder.indexOf(state.quality),
    ceiling = qualityOrder.indexOf(preferredQuality);
  if (qualityCooldown > 0) return;
  if (fps < 34 && current > 0) {
    quality(qualityOrder[current - 1]);
    qualityCooldown = 18;
    toast("Calidad ajustada para mantener la fluidez.");
  } else if (fps > 57 && current < ceiling) {
    quality(qualityOrder[current + 1]);
    qualityCooldown = 30;
  }
}
// Colisiones aproximadas, compartidas por las rocas instanciadas.
const colliderMatrix = new THREE.Matrix4(),
  colliderPos = new THREE.Vector3(),
  colliderScale = new THREE.Vector3(),
  colliderRotation = new THREE.Quaternion();
scene.traverse((o) => {
  if (o.isInstancedMesh && o.material === rockMat)
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, colliderMatrix);
      colliderMatrix.decompose(colliderPos, colliderRotation, colliderScale);
      if (colliderScale.y > 0.38)
        rockColliders.push({
          x: colliderPos.x,
          z: colliderPos.z,
          r: Math.min(colliderScale.x, colliderScale.z) * 0.7 + 0.2,
        });
    }
});
// Materiales de piel/pelo: detalle sobre superficies, sin cientos de piezas flotantes.
const jaguarMap = texture(512, (c, s) => {
  c.fillStyle = "#c4a05e";
  c.fillRect(0, 0, s, s);
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 12; col++) {
      const id = row * 12 + col,
        x = ((col + 0.5) * s) / 12 + (terrainHash(id, 2) - 0.5) * 13,
        y = ((row + 0.5) * s) / 9;
      c.strokeStyle = "#392f20";
      c.lineWidth = 3 + terrainHash(id, 3) * 2;
      c.beginPath();
      for (let j = 0; j <= 14; j++) {
        const a = (j / 14) * TAU,
          r = 9 + terrainHash(id, j) * 4;
        const xx = x + Math.cos(a) * r,
          yy = y + Math.sin(a) * r * 0.8;
        if (j) c.lineTo(xx, yy);
        else c.moveTo(xx, yy);
      }
      c.stroke();
      c.fillStyle = "#483624";
      c.beginPath();
      c.arc(x + 2, y, 2.1, 0, TAU);
      c.fill();
    }
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = i % 2 ? "#ffffff0d" : "#33221115";
    c.fillRect(terrainHash(i, 4) * s, terrainHash(i, 5) * s, 1, 3);
  }
});
animalMats.fur.map = jaguarMap;
animalMats.fur.color.set(0xffffff);
animalMats.fur.normalMap = normalFromTexture(jaguarMap, 0.7);
animalMats.fur.normalScale.set(0.2, 0.2);
animalMats.fur.needsUpdate = true;
const skinMap = texture(128, (c, s) => {
  c.fillStyle = "#b9b7a4";
  c.fillRect(0, 0, s, s);
  for (let i = 0; i < 1800; i++) {
    c.fillStyle = i % 2 ? "#51574e44" : "#e0ddc830";
    c.fillRect(terrainHash(i, 1) * s, terrainHash(i, 2) * s, 1, 2);
  }
});
for (const key of ["tapir", "monkey", "skin", "frog"]) {
  animalMats[key].map = skinMap;
  animalMats[key].normalMap = normalFromTexture(skinMap, 0.65);
  animalMats[key].normalScale.set(0.16, 0.16);
  animalMats[key].roughness = key === "frog" ? 0.4 : 0.85;
  animalMats[key].needsUpdate = true;
}
const billMap = texture(128, (c, s) => {
  const g = c.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, "#e5b841");
  g.addColorStop(0.38, "#7aac47");
  g.addColorStop(0.72, "#e59130");
  g.addColorStop(1, "#a93522");
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
});
const billMaterial = material(0xffffff, { map: billMap, roughness: 0.5 });
// Agrupa piezas estáticas por material; conserva articulaciones separadas.
function batchStaticParts(group, excluded = new Set()) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (
      !child.isMesh ||
      child.isInstancedMesh ||
      excluded.has(child) ||
      Array.isArray(child.material)
    )
      continue;
    child.updateMatrix();
    let geo = child.geometry.clone();
    geo.applyMatrix4(child.matrix);
    if (geo.index) {
      const raw = geo.toNonIndexed();
      geo.dispose();
      geo = raw;
    }
    // Normalizar atributos antes de fusionar cilindros, esferas y tubos.
    for (const key of Object.keys(geo.attributes))
      if (!["position", "normal", "uv"].includes(key)) geo.deleteAttribute(key);
    if (!geo.attributes.uv)
      geo.setAttribute(
        "uv",
        new THREE.BufferAttribute(
          new Float32Array(geo.attributes.position.count * 2),
          2,
        ),
      );
    if (!buckets.has(child.material)) buckets.set(child.material, []);
    buckets.get(child.material).push(geo);
    group.remove(child);
  }
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (merged) part(group, merged, mat);
  }
}
for (const e of animals) {
  e.baseScale = e.obj.scale.clone();
  e.presence = 1;
  e.motion = 0;
  if (e.species === "jaguar")
    for (const child of [...e.obj.children])
      if (child.isInstancedMesh) {
        e.obj.remove(child);
        child.geometry.dispose();
      }
  if (e.species === "tucan")
    for (const child of e.obj.children)
      if (child.material === mats.fruit) child.material = billMaterial;
  const pivot = new THREE.Group();
  const kind = e.species;
  const headZ =
    kind === "jaguar"
      ? -0.8
      : kind === "tapir"
        ? -0.7
        : kind === "mono"
          ? -0.03
          : kind === "tucan"
            ? -0.3
            : kind === "caiman"
              ? -0.8
              : -0.1;
  pivot.position.set(
    0,
    kind === "tucan"
      ? 0.2
      : kind === "mono"
        ? 1.1
        : kind === "caiman"
          ? 0.15
          : kind === "rana"
            ? 0.16
            : 1,
    headZ,
  );
  const eligible = [...e.obj.children].filter(
    (o) =>
      o.isMesh &&
      !o.isInstancedMesh &&
      o !== e.tail &&
      !e.wings?.includes(o) &&
      (kind === "mono"
        ? o.position.y > 1.1
        : kind === "rana"
          ? o.position.z < -0.08
          : kind === "serpiente"
            ? false
            : o.position.z < headZ),
  );
  for (const child of eligible) {
    e.obj.remove(child);
    child.position.sub(pivot.position);
    pivot.add(child);
  }
  e.obj.add(pivot);
  e.head = pivot;
  batchStaticParts(pivot);
  batchStaticParts(e.obj, new Set([e.tail, ...(e.wings || [])]));
  for (const limb of e.legs) batchStaticParts(limb);
  if (kind === "mono") {
    const arm = leg(e.obj, animalMats.monkey, -0.22, 1.06, 0, 0.77, 0.055);
    e.legs.push(arm);
  }
  if (kind === 'tucan') {
    const tree=trees[1];
    e.perchTree=tree;
    e.home.set(tree.obj.position.x+1.15,0,tree.obj.position.z);
    e.obj.position.copy(e.home);
    const perchY=tree.obj.position.y+tree.height*.65;
    branch(tree.obj,[0,tree.height*.65-.08,0],[2.15,tree.height*.65-.08,0],.07,.025);
    setupWildlifeMotion(e,'air',tree.obj.position.y,perchY);
  }
}
function makeExpandedWildlife(info, x, z, index) {
  const g = new THREE.Group();
  const legs = [], wings = [];
  const materialBody = wildlifeMaterial(info.color);
  const dark = wildlifeMaterial(0x292c25);
  const cream = wildlifeMaterial(0xcfc3a0);
  const id = info.id;
  const isBird = ['guacamaya', 'loro', 'aguila'].includes(info.id);
  const isInsect = ['mariposa', 'escarabajo', 'hormiga', 'abeja'].includes(info.id);
  const isClimber = ['martucha', 'aullador'].includes(info.id);
  const isWater = id === 'nutria';
  const head = new THREE.Group();
  g.add(head);
  let tail = null;
  g.position.set(x, height(x, z), z);
  g.scale.setScalar(info.size);
  scene.add(g);
  // Anatomical families share materials, never a single generic quadruped mesh.
  function limb(px,py,pz,length,radius,mat=materialBody) {
    const joint=leg(g,mat,px,py,pz,length,radius);
    legs.push(joint);return joint;
  }
  function face(width,sy,sz) {
    for(const side of [-1,1]) {
      ellipsoid(head,cream,[side*width,sy,sz],[.035,.04,.025]);
      ellipsoid(head,dark,[side*width,sy,sz-.017],[.019,.027,.018]);
    }
  }
  function wing(side,span,mat,membrane=false) {
    const pivot=new THREE.Group();pivot.position.set(side*.16,.35,0);g.add(pivot);
    if(membrane) {
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute([
        0,0,0,side*span,0,-.18,side*span*.65,0,.45,
        0,0,0,side*span*.65,0,.45,side*span*.3,0,.28,
      ],3));geo.computeVertexNormals();
      part(pivot,geo,mat);
      branch(pivot,[0,0,0],[side*span,0,-.18],.018,.008,dark);
    } else {
      ellipsoid(pivot,mat,[side*span*.48,0,0],[span*.58,.035,.28]);
      for(let j=0;j<4;j++)ellipsoid(pivot,mat,[side*span*(.42+j*.16),0,.18+j*.025],[span*.13,.024,.3-j*.025]);
    }
    wings.push(pivot);
  }
  if (isInsect) {
    const butterfly=id==='mariposa', ant=id==='hormiga';
    ellipsoid(g,materialBody,[0,.2,.15],[ant?.12:.2,.14,ant?.24:.32]);
    ellipsoid(g,dark,[0,.2,-.16],[.11,.12,.16]);
    head.position.set(0,.2,-.35);
    ellipsoid(head,dark,[0,0,0],[.12,.11,.12]);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++)
        limb(side*.18,.18,i*.15-.2,.17,.018,dark);
      branch(head,[side*.05,.07,-.03],[side*.15,.28,-.18],.012,.006,dark);
      if(butterfly) {
        const w=new THREE.Group();w.position.set(side*.08,.25,0);g.add(w);wings.push(w);
        ellipsoid(w,materialBody,[side*.48,0,-.15],[.48,.016,.4]);
        ellipsoid(w,materialBody,[side*.32,0,.3],[.32,.016,.28]);
        ellipsoid(w,dark,[side*.58,.018,-.15],[.15,.008,.17]);
        ellipsoid(w,cream,[side*.58,.03,-.15],[.065,.008,.075]);
      } else if(id==='abeja') {
        const w=ellipsoid(g,cream,[side*.28,.35,0],[.3,.014,.24]);wings.push(w);
      }
    }
    if(id==='abeja')for(let j=0;j<3;j++)ellipsoid(g,dark,[0,.2,.02+j*.13],[.203,.145,.025]);
    if(id==='escarabajo') {
      for(const side of [-1,1])ellipsoid(g,materialBody,[side*.095,.28,.15],[.11,.09,.3]);
      branch(g,[0,.34,-.1],[0,.34,.4],.012,.012,dark);
    }
  } else if(id==='boa') {
    const points=[];
    for(let j=0;j<13;j++)points.push([Math.sin(j*.7)*.28,.12,j*.23-.8]);
    tail=tube(g,points,.11,materialBody);
    head.position.set(0,.14,-.94);
    ellipsoid(head,materialBody,[0,0,0],[.14,.09,.23]);face(.11,.04,-.13);
    for(let j=0;j<9;j++)ellipsoid(g,dark,[Math.sin(j*.7)*.28,.2,j*.23-.65],[.10,.025,.06]);
  } else if(id==='tortuga') {
    ellipsoid(g,materialBody,[0,.26,0],[.48,.3,.63]);
    ellipsoid(g,cream,[0,.13,0],[.43,.08,.57]);
    head.position.set(0,.22,-.65);
    ellipsoid(head,materialBody,[0,0,-.06],[.12,.11,.2]);face(.10,.04,-.18);
    for(const side of [-1,1])for(const zz of [-.35,.38])limb(side*.37,.18,zz,.15,.08);
    for(let j=0;j<5;j++)ellipsoid(g,dark,[0,.54-Math.abs(j-2)*.035,(j-2)*.2],[.18,.017,.085]);
  } else if(id==='iguana') {
    ellipsoid(g,materialBody,[0,.24,0],[.24,.2,.67]);
    head.position.set(0,.32,-.65);
    ellipsoid(head,materialBody,[0,0,0],[.18,.16,.28]);face(.16,.06,-.17);
    ellipsoid(head,cream,[0,-.17,.04],[.025,.2,.18]);
    for(const side of [-1,1])for(const zz of [-.4,.4])limb(side*.29,.19,zz,.17,.05);
    tail=tube(g,[[0,.2,.48],[.1,.15,1],[.3,.1,1.65],[.55,.06,2]],.06,materialBody);
    for(let j=0;j<10;j++)part(g,new THREE.ConeGeometry(.055,.16,3),cream,[0,.43,j*.12-.55]);
  } else if(id==='murcielago') {
    ellipsoid(g,materialBody,[0,.3,0],[.15,.21,.28]);
    head.position.set(0,.4,-.23);ellipsoid(head,materialBody,[0,0,0],[.14,.13,.12]);
    for(const side of [-1,1]) {
      part(head,new THREE.ConeGeometry(.06,.2,4),materialBody,[side*.1,.14,0]);
      const mat=wildlifeMaterial(0x65515c);mat.side=THREE.DoubleSide;
      wing(side,.95,mat,true);
    }
    face(.075,.02,-.1);
  } else if(id==='hocofaisan') {
    ellipsoid(g,materialBody,[0,.7,0],[.32,.4,.52]);
    head.position.set(0,1.05,-.38);
    ellipsoid(head,materialBody,[0,0,0],[.16,.22,.18]);
    ellipsoid(head,wildlifeMaterial(0xd4a638),[0,-.01,-.2],[.08,.065,.13]);
    for(let j=0;j<5;j++)ellipsoid(head,dark,[0,.22+j*.012,j*.04-.06],[.025,.065,.035]);
    for(const side of [-1,1])limb(side*.17,.43,0,.4,.035,dark);
    tail=ellipsoid(g,materialBody,[0,.8,.7],[.21,.07,.55]);tail.rotation.x=-.35;
    ellipsoid(g,cream,[0,.4,.12],[.22,.07,.3]);face(.12,.03,-.14);
  } else if (isBird) {
    const eagle=id==='aguila',macaw=id==='guacamaya';
    ellipsoid(g,materialBody,[0,.35,0],[.23,.25,.45]);
    head.position.set(0,.57,-.3);
    ellipsoid(head,eagle?cream:materialBody,[0,0,0],[.18,.2,.2]);
    if(macaw)for(const side of [-1,1])ellipsoid(head,cream,[side*.16,0,-.05],[.025,.12,.13]);
    ellipsoid(head,eagle?wildlifeMaterial(0xcda94d):dark,[0,-.04,-.23],[.075,.12,.12]);face(.15,.025,-.13);
    for (const side of [-1, 1]) {
      wing(side,eagle?1.25:macaw?.85:.55,macaw?wildlifeMaterial(0x356bb0):materialBody);
      limb(side*.1,.17,.05,.14,.025,dark);
    }
    tail=ellipsoid(g,macaw?materialBody:dark,[0,.28,macaw?.75:.48],[.13,.035,macaw?.55:.25]);
  } else if(isClimber) {
    const kinkajou=id==='martucha';
    ellipsoid(g,materialBody,[0,kinkajou?.45:.72,0],kinkajou?[.23,.23,.46]:[.25,.4,.32]);
    head.position.set(0,kinkajou?.64:1.07,kinkajou?-.38:-.18);
    ellipsoid(head,materialBody,[0,0,0],[.23,.24,.2]);
    ellipsoid(head,id==='aullador'?dark:cream,[0,-.025,-.16],[.15,.13,.08]);face(.1,.05,-.2);
    for(const side of [-1,1]) {
      if(kinkajou)for(const zz of [-.28,.28])limb(side*.17,.34,zz,.3,.045);
      else {
        limb(side*.18,.43,.12,.4,.065);
        limb(side*.29,.94,-.12,.68,.047);
      }
      ellipsoid(head,materialBody,[side*.23,.025,0],[.075,.095,.055]);
    }
    tail=tube(g,[[0,.5,.18],[.15,.35,.75],[.25,.7,1.1],[.12,1.05,.95]],.045,materialBody);
  } else {
    const profiles={
      coati:[.28,.28,.58,.48,.34], pecari:[.42,.43,.67,.59,.27],
      venado:[.29,.42,.66,.92,.65], armadillo:[.32,.24,.62,.31,.14],
      hormiguero:[.28,.34,.62,.55,.34], mapache:[.33,.32,.53,.49,.26],
      tepezcuintle:[.4,.33,.59,.43,.16], nutria:[.23,.2,.8,.25,.15],
      ocelote:[.27,.3,.7,.54,.35], puma:[.35,.36,.86,.69,.48],
    };
    const [width,tall,long,bodyY,legLength]=profiles[id];
    const bodyScale=[width,tall,long];
    ellipsoid(g, materialBody, [0, bodyY, 0], bodyScale);
    const deer=id==='venado',anteater=id==='hormiguero',cat=['ocelote','puma'].includes(id);
    if(deer)ellipsoid(g,materialBody,[0,1.15,-.48],[.18,.4,.2]);
    head.position.set(0,deer?1.52:bodyY+.1,-long*.88);
    ellipsoid(head,materialBody,[0,0,0],[deer?.15:.23,deer?.18:.23,.26]);
    const snout=anteater?.62:id==='coati'?.38:cat?.14:.23;
    if(cat)for(const side of [-1,1])ellipsoid(head,cream,[side*.065,-.09,-.23],[.09,.065,.1]);
    else branch(head,[0,-.045,-.13],[0,-.10,-.25-snout],anteater?.11:.14,.045,materialBody);
    ellipsoid(head,dark,[0,-.075,cat?-.32:-.25-snout],[.06,.045,.045]);
    face(deer?.12:.18,.06,-.18);
    for (const side of [-1, 1]) {
      for(const zz of [-long*.6,long*.6])limb(side*width*.72,legLength+.045,zz,legLength,deer?.045:cat?.07:.085);
      const ear=cat?part(head,new THREE.ConeGeometry(.085,.18,4),materialBody,[side*.17,.23,0]):ellipsoid(head,materialBody,[side*(deer?.15:.18),.21,-.01],[deer?.09:.07,deer?.22:.1,.045]);
      ear.rotation.z=side*-.35;
      if(deer)branch(head,[side*.07,.15,.05],[side*.1,.42,.03],.023,.006,cream);
      if(id==='mapache')ellipsoid(head,dark,[side*.16,.05,-.20],[.10,.055,.05]);
      if(id==='tepezcuintle')for(let j=0;j<8;j++)ellipsoid(g,cream,[side*width*.93,bodyY+.08+(j%2)*.09,-.4+j*.1],[.018,.032,.036]);
      if(id==='ocelote')for(let j=0;j<12;j++)ellipsoid(g,dark,[side*width*.94,bodyY-.03+(j%3)*.08,-.5+j*.08],[.018,.038,.055]);
    }
    if(!['pecari','tepezcuintle','venado'].includes(id)) {
      tail=new THREE.Group();tail.position.set(0,bodyY,long*.7);g.add(tail);
      const upright=id==='coati',thick=['mapache','hormiguero'].includes(id);
      tube(tail,[[0,0,0],[.05,upright?.35:0,.4],[.13,upright?.8:-.08,.85]],thick?.11:isWater?.08:.045,materialBody);
      if(['mapache','coati'].includes(id))for(let j=0;j<5;j++)ellipsoid(tail,dark,[.03+j*.023,upright?j*.15:0,.12+j*.14],[thick?.12:.06,.045,.055]);
    }
    if(id==='pecari') {
      const collar=part(g,new THREE.TorusGeometry(.35,.045,5,18),cream,[0,bodyY,-.36]);
      collar.scale.set(1,1.05,1);
    }
    if(id==='hormiguero')for(const side of [-1,1])ellipsoid(g,dark,[side*.265,bodyY,-.08],[.045,.3,.3]);
    if(id==='armadillo')for(let j=0;j<7;j++) {
      const band=part(g,new THREE.TorusGeometry(.29,.037,5,18,Math.PI),cream,[0,.27,-.38+j*.12]);
      band.scale.y=.85;
    }
  }
  batchStaticParts(head);
  batchStaticParts(g,new Set([tail,...wings]));
  for(const limbPart of legs)batchStaticParts(limbPart);
  for(const wingPart of wings)if(wingPart.isGroup)batchStaticParts(wingPart);
  const e = register(g, {
    kind: 'animal', species: info.id, title: info.name, expanded: true, info,
    legs, wings, head, tail,
    home: new THREE.Vector3(x, height(x, z), z), goal: new THREE.Vector3(x, 0, z),
    ai: 'patrol', aiTime: 2 + index % 4, flee: 0, attackAt: 0,
    phase: index * 2.399, active: true, hostile: false, lastFruit: 0,
    baseScale: g.scale.clone(), presence: 1, motion: 0,
    visualMeshes: [],
  });
  const flying=isBird || ['murcielago','abeja','mariposa'].includes(id);
  const travel=flying?'air':isClimber?'canopy':isWater?'water':'ground';
  const tree=trees.reduce((a,b)=>horizontalDistance(a.obj.position,g.position)<horizontalDistance(b.obj.position,g.position)?a:b);
  const perchY=tree.obj.position.y+tree.height*.65;
  if((flying && !['abeja','mariposa'].includes(id)) || isClimber) {
    e.perchTree=tree;
    e.home.x=tree.obj.position.x+1.15;e.home.z=tree.obj.position.z;
    g.position.x=e.home.x;g.position.z=e.home.z;
    branch(tree.obj,[0,tree.height*.65-.08,0],[2.15,tree.height*.65-.08,0],.07,.025);
  }
  setupWildlifeMotion(e,travel,height(x,z),(flying && !['abeja','mariposa'].includes(id)) || isClimber?perchY:undefined);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; e.visualMeshes.push(o); } });
  animals.push(e);
  return e;
}
let expandedSeed = seed;
seed = 762331;
expandedWildlife.forEach(([id], index) => {
  const info = expandedWildlifeInfo.get(id);
  const [x, z] = info.habitat === 'Agua'
    ? [-5 + Math.sin(index) * 5, -5 + Math.cos(index) * 3]
    : info.habitat === 'Dosel' || info.habitat === 'Cielo'
      ? [trees[(index * 3) % trees.length].obj.position.x, trees[(index * 3) % trees.length].obj.position.z]
      : dryPoint(7, 38);
  makeExpandedWildlife(info, x, z, index);
});
seed = expandedSeed;
// También se fusionan arbustos y hongos sin eliminar sus frutos animados.
for (const e of entities) {
  if (e.kind === "bush") batchStaticParts(e.obj, new Set(e.berries));
  if (e.kind === "wood") batchStaticParts(e.obj);
}
// Brazos, guantes y dedos con articulación de recogida/comida.
const arms = new THREE.Group();
camera.add(arms);
arms.visible = false;
const sleeveMat = material(0x627369, { roughness: 1 }),
  gloveMat = material(0xa28b63, { roughness: 0.95 });
const leftHand = new THREE.Group(),
  rightHand = new THREE.Group();
arms.add(leftHand);
spear.add(rightHand);
function makeHand(parent, side) {
  branch(
    parent,
    [side * 0.36, -0.68, -0.08],
    [side * 0.27, -0.44, -0.45],
    0.072,
    0.063,
    sleeveMat,
  );
  ellipsoid(
    parent,
    gloveMat,
    [side * 0.25, -0.41, -0.48],
    [0.067, 0.052, 0.095],
  );
  for (let i = 0; i < 4; i++)
    branch(
      parent,
      [side * (0.21 + i * 0.023), -0.4, -0.49],
      [side * (0.21 + i * 0.023), -0.43, -0.56],
      0.015,
      0.012,
      gloveMat,
    );
  branch(
    parent,
    [side * 0.3, -0.41, -0.46],
    [side * 0.32, -0.45, -0.5],
    0.02,
    0.015,
    gloveMat,
  );
  batchStaticParts(parent);
  parent.traverse((o) => {
    o.castShadow = false;
    o.frustumCulled = false;
  });
}
makeHand(leftHand, -1);
makeHand(rightHand, 1);
rightHand.position.set(-0.25, 0.65, 0.45);
const heldFruit = ellipsoid(
  leftHand,
  mats.fruit,
  [-0.25, -0.39, -0.52],
  [0.065, 0.067, 0.065],
);
heldFruit.visible = false;
heldFruit.castShadow = false;
const interactionRing = part(
  scene,
  new THREE.TorusGeometry(0.36, 0.012, 4, 32),
  new THREE.MeshBasicMaterial({
    color: 0xe2d79d,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  }),
);
interactionRing.rotation.x = -Math.PI / 2;
interactionRing.castShadow = interactionRing.receiveShadow = false;
interactionRing.visible = false;
// Partículas reutilizables de contacto: polvo, fibras y semillas, sin gore.
const burstCount = 96,
  burstPositions = new Float32Array(burstCount * 3),
  burstVelocities = new Float32Array(burstCount * 3),
  burstLives = new Float32Array(burstCount);
burstPositions.fill(-1000);
const burstGeo = new THREE.BufferGeometry();
burstGeo.setAttribute("position", new THREE.BufferAttribute(burstPositions, 3));
const burst = new THREE.Points(
  burstGeo,
  new THREE.PointsMaterial({
    color: 0xc6c086,
    size: 0.055,
    transparent: true,
    opacity: 0.85,
    map: dotMap,
    depthWrite: false,
  }),
);
burst.frustumCulled = false;
scene.add(burst);
let burstCursor = 0;
function gesture(kind, position) {
  actionKind = kind;
  actionTime = 0.8;
  if (!position) return;
  for (let j = 0; j < 18; j++) {
    const i = burstCursor++ % burstCount;
    burstLives[i] = 1;
    burstPositions.set([position.x, position.y + 0.3, position.z], i * 3);
    burstVelocities.set(
      [rand(-0.7, 0.7), rand(0.4, 1.7), rand(-0.7, 0.7)],
      i * 3,
    );
  }
  if (wet(position.x, position.z)) ripple(position.x, position.z, 0.12);
}
// Sombra de contacto ligera bajo la fauna, independiente de la calidad de sombras.
const contactGeo = new THREE.PlaneGeometry(1, 1);
contactGeo.rotateX(-Math.PI / 2);
const contact = new THREE.InstancedMesh(
  contactGeo,
  new THREE.MeshBasicMaterial({
    color: 0x13221b,
    map: dotMap,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }),
  animals.length,
);
scene.add(contact);
contact.frustumCulled = false;
// Conforming contact decals: terrain-sampled vertices avoid floating on slopes.
const contactParts = [];
function contactPatch(x, z, radius) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 4, 4);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const xx = x + p.getX(i), zz = z + p.getZ(i);
    p.setXYZ(i, xx, height(xx, zz) + 0.018, zz);
  }
  return geo;
}
const staticContact = new THREE.Group();
scene.add(staticContact);
for (const e of trees) {
  const decal = new THREE.Mesh(contactPatch(e.obj.position.x,e.obj.position.z,e.size*1.65),contact.material);
  staticContact.add(decal);
  e.contactDecal = decal;
}
scene.traverse((o) => {
  if (!o.isInstancedMesh || o.material !== rockMat) return;
  for (let i=0;i<o.count;i++) {
    o.getMatrixAt(i,colliderMatrix);
    colliderMatrix.decompose(colliderPos,colliderRotation,colliderScale);
    contactParts.push(contactPatch(colliderPos.x,colliderPos.z,Math.max(colliderScale.x,colliderScale.z)*.9));
  }
});
staticContact.add(new THREE.Mesh(mergeAndRelease(contactParts),contact.material));
// Layered clouds use a deterministic Canvas atlas; gameplay RNG is untouched.
const cloudMap = texture(128,(ctx,s) => {
  for(let i=0;i<28;i++) {
    const x=24+terrainHash(i,92)*80,y=40+terrainHash(i,93)*48,r=12+terrainHash(i,94)*20;
    const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
    gradient.addColorStop(0,'rgba(255,255,255,.22)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,s,s);
  }
});
const cloudMaterial = new THREE.MeshBasicMaterial({map:cloudMap,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false});
const clouds = new THREE.Group();
scene.add(clouds);
const cloudGeometry = new THREE.PlaneGeometry(1,1);
for(let i=0;i<9;i++) {
  const cloud=new THREE.Mesh(cloudGeometry,cloudMaterial);
  cloud.position.set((i%3-1)*48,38+Math.floor(i/3)*9,-65+Math.floor(i/3)*32);
  cloud.rotation.x=-Math.PI/2;cloud.scale.set(65,38,1);clouds.add(cloud);
}
// Bruma baja en capas, hojas que caen y humedad progresiva.
const mistMat = new THREE.MeshBasicMaterial({
  color: 0x9eada3,
  map: dotMap,
  transparent: true,
  opacity: 0.035,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const mist = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1, 1),
  mistMat,
  18,
);
scene.add(mist);
mist.frustumCulled = false;
const falling = new THREE.InstancedMesh(leafGeo, litterMat, 36);
scene.add(falling);
falling.frustumCulled = false;
let dampness = 0;
const wetUniform = { value: 0 };
const waterVisualUniforms = {time:{value:0},light:{value:0.55}};
const oldGroundCompile = terrainMat.onBeforeCompile;
terrainMat.onBeforeCompile = (shader) => {
  oldGroundCompile(shader);
  shader.uniforms.uWet = wetUniform;
  shader.uniforms.uCausticTime = waterVisualUniforms.time;
  shader.uniforms.uCausticLight = waterVisualUniforms.light;
  shader.vertexShader = 'varying vec3 vWaterGround;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWaterGround=(modelMatrix*vec4(position,1.)).xyz;');
  shader.fragmentShader = "varying vec3 vWaterGround; uniform float uWet,uCausticTime,uCausticLight;\n" + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
    if(uCausticLight>0. && vWaterGround.y<.45 && vWaterGround.y>-1.8) {
      vec2 uv=vWaterGround.xz*2.3;vec2 cell=floor(uv),f=fract(uv);
      float first=8.,second=8.;
      for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
        vec2 offset=vec2(float(x),float(y));
        vec2 h=fract(sin(vec2(dot(cell+offset,vec2(127.1,311.7)),dot(cell+offset,vec2(269.5,183.3))))*43758.5453);
        vec2 point=offset+.5+.34*sin(uCausticTime*.7+6.2831*h)-f;
        float dist=dot(point,point);second=min(second,max(first,dist));first=min(first,dist);
      }
      float shore=(1.-smoothstep(.08,.45,vWaterGround.y))*smoothstep(-1.8,-.9,vWaterGround.y);
      outgoingLight+=vec3(.28,.38,.22)*(1.-smoothstep(.02,.16,second-first))*shore*uCausticLight;
    }
    #include <opaque_fragment>`);
  shader.fragmentShader = shader.fragmentShader.replace(
    "roughnessFactor=mix(.98,.68,vGroundBlend.w);",
    "roughnessFactor=mix(mix(.98,.68,vGroundBlend.w),.38,uWet*.65);diffuseColor.rgb*=1.-uWet*.16;",
  );
};
terrainMat.customProgramCacheKey = () => "umbral-ground-caustics-v3";
terrainMat.needsUpdate = true;
// Profundidad reutilizada: bruma por altura, oclusión ligera y DOF sutil.
for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
  rt.depthTexture = new THREE.DepthTexture(
    rt.width,
    rt.height,
    THREE.UnsignedIntType,
  );
}
const finishPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    time: { value: 0 },
    damage: { value: 0 },
    eco: { value: 1 },
    detail: { value: 0.55 },
    day: { value: 1 },
    resolution: { value: new THREE.Vector2() },
    focusDistance: { value: 0 },
    invProjection: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() },
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv;uniform sampler2D tDiffuse,tDepth;uniform float time,damage,eco,detail,day,focusDistance;uniform vec2 resolution;uniform mat4 invProjection,cameraWorld;
    float linearD(float d){return .08*240./(240.-d*(240.-.08));}
    void main(){float d=texture2D(tDepth,vUv).x;float z=linearD(d);vec3 col=texture2D(tDiffuse,vUv).rgb;
      if(detail>.8&&d<.99999){vec2 texel=1./resolution;float center=focusDistance;float blur=smoothstep(4.,35.,z-center)*.45*step(.1,focusDistance);
        vec3 soft=(texture2D(tDiffuse,vUv+texel*1.6).rgb+texture2D(tDiffuse,vUv-texel*1.6).rgb)*.5;col=mix(col,soft,blur);
        float ao=0.;for(int i=0;i<4;i++){float a=float(i)*1.570796;float dz=z-linearD(texture2D(tDepth,vUv+vec2(cos(a),sin(a))*texel*3.).x);ao+=smoothstep(.03,.3,dz)*(1.-smoothstep(.3,1.5,dz));}col*=1.-ao*.018*detail;
      }
      vec4 view=invProjection*vec4(vUv*2.-1.,d*2.-1.,1.);view/=view.w;vec3 world=(cameraWorld*view).xyz;
      float mist=(1.-exp(-z*.009))*exp(-max(0.,world.y)*.22)*step(d,.9999);col=mix(col,mix(vec3(.035,.07,.095),vec3(.35,.46,.40),day),mist*.23);
      float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,.78+eco*.24);col*=mix(vec3(1.06,.95,.85),vec3(.98,1.015,1.01),eco);
      if(detail>0.)col=mix(col,mat3(1.025,.006,-.006,.012,1.012,.004,-.008,.005,.975)*col,.65);
      float vignette=smoothstep(.22,.72,length((vUv-.5)*vec2(1.,.8)));col*=1.-vignette*.15;
      float grain=fract(sin(dot(vUv*resolution+mod(time,100.),vec2(12.9898,78.233)))*43758.5453)-.5;col+=grain*.0035*detail;
      col=mix(col,col*vec3(1.15,.55,.43),damage*vignette);gl_FragColor=vec4(max(col,vec3(0.)),1.);
    }`,
});
const finishRender = finishPass.render.bind(finishPass);
finishPass.render = (r, write, read, ...rest) => {
  finishPass.uniforms.tDepth.value = read.depthTexture;
  finishPass.uniforms.invProjection.value.copy(camera.projectionMatrixInverse);
  finishPass.uniforms.cameraWorld.value.copy(camera.matrixWorld);
  finishPass.uniforms.day.value = state.daylight;
  finishRender(r, write, read, ...rest);
};
composer.insertPass(finishPass, 2);
function updatePolish(dt) {
  const t = state.time;
  for (const e of trees) {
    e.visualAmount ??= 1;
    if(e.contactDecal)e.contactDecal.visible=e.alive && e.visualTarget!==0;
    e.visualTarget ??= e.alive ? 1 : 0;
    e.visualAmount = mix(
      e.visualAmount,
      e.visualTarget,
      1 - Math.exp(-dt * 1.7),
    );
    if (e.visualTarget === 0) {
      e.obj.rotation.z = (1 - e.visualAmount) * 1.38;
      e.obj.position.y =
        height(e.obj.position.x, e.obj.position.z) - (1 - e.visualAmount) * 3;
    } else {
      e.obj.rotation.z *= Math.exp(-dt * 4);
      e.obj.position.y = height(e.obj.position.x, e.obj.position.z);
    }
    e.obj.visible = e.visualAmount > 0.015;
  }
  for (const g of backdropGroves) {
    g.userData.amount = mix(
      g.userData.amount ?? 1,
      g.userData.target ?? 1,
      1 - Math.exp(-dt * 1.7),
    );
    g.scale.y = Math.max(0.001, g.userData.amount);
    g.visible = g.userData.amount > 0.02;
  }
  for (const g of growingPlants) {
    g.userData.growth = Math.min(1, g.userData.growth + dt * 0.16);
    g.scale.setScalar(0.15 + 0.85 * smooth(g.userData.growth, 0, 1));
  }
  interactionRing.visible = isPlaying() && !!target?.obj;
  if (interactionRing.visible) {
    interactionRing.position.copy(target.obj.position);
    interactionRing.position.y =
      height(target.obj.position.x, target.obj.position.z) + 0.06;
    interactionRing.scale.setScalar(target.kind === "tree" ? 2 : 1);
    interactionRing.material.opacity = 0.35 + Math.sin(t * 4) * 0.12;
  }
  for (let i = 0; i < burstCount; i++) {
    if (burstLives[i] <= 0) continue;
    burstLives[i] -= dt;
    const k = i * 3;
    for (let j = 0; j < 3; j++)
      burstPositions[k + j] += burstVelocities[k + j] * dt;
    burstVelocities[k + 1] -= dt * 2;
    if (burstLives[i] <= 0) burstPositions[k + 1] = -1000;
  }
  burstGeo.attributes.position.needsUpdate = true;
  animals.forEach((e, i) => {
    matrixDummy.position.set(
      e.obj.position.x,
      height(e.obj.position.x, e.obj.position.z) + 0.035,
      e.obj.position.z,
    );
    matrixDummy.rotation.set(0, e.obj.rotation.y, 0);
    const contactScale=(e.baseScale?.x ?? 1)*(e.presence ?? 1);
    matrixDummy.scale.set(e.obj.visible ? 1.4*contactScale : 0, 1, e.obj.visible ? 2*contactScale : 0);
    if (["mono", "tucan"].includes(e.species) || ['air','canopy'].includes(e.travel))
      matrixDummy.scale.multiplyScalar(0.35);
    matrixDummy.updateMatrix();
    contact.setMatrixAt(i, matrixDummy.matrix);
  });
  contact.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4,
      x = Math.cos(a) * randStable(i, 18) + Math.sin(t * 0.03 + i) * 2,
      z = Math.sin(a) * randStable(i, 22) - 3;
    matrixDummy.position.set(x, Math.max(0.3, height(x, z)) + 0.65, z);
    matrixDummy.quaternion.copy(camera.quaternion);
    matrixDummy.scale.set(8, 1.8, 1);
    matrixDummy.updateMatrix();
    mist.setMatrixAt(i, matrixDummy.matrix);
  }
  mist.instanceMatrix.needsUpdate = true;
  mistMat.opacity =
    (state.rain ? 0.065 : 0.024) * (state.quality === "low" ? 0.3 : 1);
  mist.visible = state.quality !== "low";
  for (let i = 0; i < 36; i++) {
    const e = trees[i % trees.length],
      cycle = (t * 0.28 + i * 0.77) % 6;
    matrixDummy.position.set(
      e.obj.position.x + Math.sin(t * 0.5 + i) * 2,
      height(e.obj.position.x, e.obj.position.z) + 7 - cycle,
      e.obj.position.z + Math.cos(t * 0.4 + i) * 2,
    );
    matrixDummy.rotation.set(t * 0.8 + i, i, t * 0.5);
    matrixDummy.scale.setScalar(e.obj.visible ? 0.15 : 0);
    matrixDummy.updateMatrix();
    falling.setMatrixAt(i, matrixDummy.matrix);
  }
  falling.instanceMatrix.needsUpdate = true;
  dampness = mix(
    dampness,
    state.rain ? 1 : 0,
    1 - Math.exp(-dt * (state.rain ? 0.3 : 0.025)),
  );
  wetUniform.value = dampness;
  rockMat.roughness = 0.92 - dampness * 0.45;
  // Ajustar volumen de sombra al entorno inmediato y estabilizar en texeles.
  const extent = state.quality === "high" ? 30 : 23,
    step = (extent * 2) / sun.shadow.mapSize.x;
  sun.target.position.set(
    Math.round(player.x / step) * step,
    0,
    Math.round(player.z / step) * step,
  );
  sun.target.updateMatrixWorld();
  Object.assign(sun.shadow.camera, {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
  });
  sun.shadow.camera.updateProjectionMatrix();
}
function randStable(i, range) {
  return 6 + terrainHash(i, 81) * range;
}
function disposeExpedition() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(animationFrame);
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        materials.add(m),
      );
    if (o.customDepthMaterial) materials.add(o.customDepthMaterial);
  });
  for (const m of materials) {
    for (const value of Object.values(m))
      if (value?.isTexture) textures.add(value);
    for (const u of Object.values(m.uniforms || {}))
      if (u.value?.isTexture) textures.add(u.value);
    m.dispose();
  }
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  for (const pass of composer.passes) pass.dispose?.();
  composer.dispose();
  skyReflection.dispose();
  sun.shadow.map?.dispose();
  renderer.dispose();
  sound.ctx?.close();
  renderer.domElement.remove();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) disposeExpedition();
});

let hudTimer = 0,
  birdTimer = 3;
function tick(dt, gp) {
  state.time += dt;
  Object.assign(state, ecology());
  updatePlayer(dt, gp);
  updateAim();
  updateAnimals(dt);
  updatePolish(dt);
  environment(dt, state.time);
  bushes.forEach((e) => {
    if (!e.ready) {
      e.regrow -= state.rain ? dt : 0.0;
      if (state.time > e.regrow) {
        e.ready = true;
        e.berries.forEach((m) => (m.visible = true));
      }
    }
  });
  if (!state.explore) {
    if (state.food <= 0) damage(dt * 1.4, "hambre");
    if (state.poison > 0) {
      state.poison = Math.max(0, state.poison - dt * (hasShelter() ? 3 : 1));
      damage(dt * 0.3, "veneno");
    }
    if (hasShelter() && state.food > 20)
      state.health = clamp(state.health + dt * 0.7, 0, 100);
  }
  state.attack = Math.max(0, state.attack - dt);
  $("hurt").style.opacity =
    state.attack > 0 ? 0.6 : state.health < 25 ? 0.25 : 0;
  state.thrust = Math.max(0, state.thrust - dt);
  actionTime = Math.max(0, actionTime - dt);
  const swing = Math.sin((state.thrust / 0.45) * Math.PI);
  spear.position.set(
    0.43 - swing * 0.13,
    -0.53 + swing * 0.1,
    -0.7 - swing * 0.65,
  );
  const action = Math.sin(Math.PI * clamp(1 - actionTime / 0.8, 0, 1));
  spear.position.x += Math.sin(state.time * 8) * locomotion * 0.012;
  spear.position.y +=
    Math.cos(state.time * 16) * locomotion * 0.012 - action * 0.12;
  spear.rotation.x = -0.13 - swing * 0.4 + action * 0.22;
  arms.visible = isPlaying();
  arms.position.y = Math.cos(state.time * 8) * locomotion * 0.012;
  leftHand.rotation.x = action * (actionKind === "eat" ? -1.25 : 0.6);
  leftHand.position.z = -action * 0.2;
  leftHand.position.y = 0.17 + action * (actionKind === "eat" ? 0.22 : -0.06);
  heldFruit.visible = actionTime > 0 && actionKind === "eat";
  birdTimer -= dt;
  if (birdTimer < 0) {
    birdTimer = rand(4, 9);
    if (state.biodiversity > 45) {
      sound.tone(rand(1700, 2300), 0.14, 0.025, 350);
      setTimeout(() => sound.tone(1900, 0.1, 0.015, -300), 150);
    }
  }
  hudTimer -= dt;
  if (hudTimer <= 0) {
    updateHUD();
    hudTimer = 0.15;
  }
  if (!state.naturalistBadge && state.observed.size>=8 && state.cut===0 && state.hunted===0) {
    state.naturalistBadge=true;
    state.fieldScore+=150;
    sound.tone(700,.5,.08,500);
    toast('★ Naturalista · 8 especies sin talar ni cazar. +150 puntos');
    updateHUD();
  }
  if (
    !state.won &&
    expeditionReady() &&
    hasShelter() &&
    state.eco >= 70 &&
    state.health > 0
  )
    finish(true);
}
function frame() {
  if (disposed) return;
  animationFrame = requestAnimationFrame(frame);
  const rawDelta = clock.getDelta(),
    dt = Math.min(rawDelta, 0.05);
  updateAdaptiveQuality(rawDelta);
  const gp = pollPad(dt);
  if (isPlaying()) tick(dt, gp);
  else if (state.screen === "welcome") {
    const t = performance.now() * 0.00008;
    camera.position.set(-8.5 + Math.sin(t) * 0.55, height(-8.5, 16) + 2.55 + Math.sin(t*.7)*.08, 16 + Math.cos(t*.8)*.25);
    camera.lookAt(2, 3.4, -7);
    environment(dt, 0);
    windUniform.value = performance.now() * 0.0006;
  }
  if (performance.now() > toastUntil) $("toast").classList.remove("show");
  updateForestLOD(dt);
  if(state.quality !== 'low' && (reflectionQuality !== state.quality || reflectionFrame++ % 30 === 0)) {
    const cubeSize=state.quality==='high'?128:64;
    if(skyReflection.width!==cubeSize)skyReflection.setSize(cubeSize,cubeSize);
    skyCapture.update(renderer,reflectionScene);
    reflectionQuality=state.quality;
  }
  waterMat.uniforms.reflectionStrength.value=state.quality==='low'?0:1;
  finishPass.uniforms.focusDistance.value=target?.obj && isPlaying()?camera.position.distanceTo(target.obj.position):0;
  finishPass.uniforms.time.value = state.time;
  finishPass.uniforms.damage.value = state.attack > 0 ? 0.4 : 0;
  finishPass.uniforms.eco.value = state.eco / 100;
  finishPass.uniforms.resolution.value.set(
    renderer.domElement.width,
    renderer.domElement.height,
  );
  composer.render();
}
player.y = height(player.x, player.z);
camera.position.set(player.x, player.y + eye, player.z);
camera.rotation.set(pitch, yaw, 0, "YXZ");
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  setScreen("paused");
  $("fatal-message").textContent =
    "Se perdió el contexto gráfico. Recarga y selecciona calidad Ligera.";
  $("fatal").hidden = false;
});
scene.updateMatrixWorld(true);
updatePolish(0);
quality("medium");
renderer.compile(scene, camera);
updateHUD();
$("start").disabled = false;
$("explore").disabled = false;
$("start").innerHTML = "Comenzar expedición <span>→</span>";
$("load-status").textContent = "SONIDO PROCEDURAL · AURICULARES RECOMENDADOS";
frame();
