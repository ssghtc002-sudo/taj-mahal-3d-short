/**
 * Shared Parametric Pixar Character Rig & Visual Helper Engine (/home/antigravity/shorts-engine/characters/baseRig.js)
 * Built strictly for <= 65 draw calls / <= 25 shared materials / ~6k-8k tris per hero via safe static sub-part merging.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

export function safeMerge(geometries) {
  const prep = geometries.map((g) => {
    const cloned = g.index ? g.toNonIndexed() : g.clone();
    if (!cloned.attributes.normal) cloned.computeVertexNormals();
    if (!cloned.attributes.uv) {
      const count = cloned.attributes.position.count;
      cloned.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    return cloned;
  });
  const merged = mergeGeometries(prep, false);
  for (const g of prep) g.dispose();
  return merged;
}

export function createRadialGlowTexture(colorHex = '#FFE79A') {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(colorHex);
  const r = Math.round(col.r * 255);
  const g = Math.round(col.g * 255);
  const b = Math.round(col.b * 255);
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.28)`);
  grad.addColorStop(1.0, `rgba(${r},${g},${b},0.0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createGlowSprite(colorHex = '#FFE79A', size = 1.0, opacity = 0.85) {
  const tex = createRadialGlowTexture(colorHex);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, 1);
  return sp;
}

export function createContactShadowTexture() {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0.0, 'rgba(10,12,20,0.58)');
  grad.addColorStop(0.55, 'rgba(10,12,20,0.26)');
  grad.addColorStop(1.0, 'rgba(10,12,20,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowDisc(radius = 0.34, opacity = 0.82, sharedMat = null) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI * 0.5);
  const mat =
    sharedMat ||
    new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
    });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.004;
  mesh.renderOrder = 2;
  return mesh;
}

export function createIrisTexture(irisHex = '#3D2717') {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 54);
  g.addColorStop(0, '#0C0F14');
  g.addColorStop(0.32, '#0C0F14');
  g.addColorStop(0.36, irisHex);
  g.addColorStop(0.84, irisHex);
  g.addColorStop(0.95, '#191C24');
  g.addColorStop(1, '#191C24');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(48, 46, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(76, 78, 4.5, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class MaterialRegistry {
  constructor() {
    this.map = new Map();
    this.contactShadowTex = createContactShadowTexture();
    this.contactShadowMat = this.getBasic('shared_contact_shadow', {
      map: this.contactShadowTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
  }

  getStandard(key, props) {
    if (this.map.has(key)) return this.map.get(key);
    const mat = new THREE.MeshStandardMaterial(props);
    this.map.set(key, mat);
    return mat;
  }

  getBasic(key, props) {
    if (this.map.has(key)) return this.map.get(key);
    const mat = new THREE.MeshBasicMaterial(props);
    this.map.set(key, mat);
    return mat;
  }

  count() {
    return this.map.size;
  }
}

export function buildPixarHumanoid(opts = {}, registry = new MaterialRegistry()) {
  const {
    id = 'character',
    skinColor = '#C88D66',
    suitColor = '#1E406B',
    accentColor = '#E2A63C',
    trouserColor = '#1D2230',
    shoeColor = '#3A2318',
    hairColor = '#1F1815',
    irisColor = '#3E2716',
    hasMustache = false,
    hasGoatee = false,
    headgear = 'none',
    turbanColor = '#9B2635',
    hasMonocle = false,
    castShadow = true,
  } = opts;

  const root = new THREE.Group();
  root.name = `char_${id}`;

  const rig = new THREE.Group();
  rig.name = `${id}_rig`;
  root.add(rig);

  // Shared materials
  const skinMat = registry.getStandard(`skin_${skinColor}`, { color: skinColor, roughness: 0.42, metalness: 0.04 });
  const suitMat = registry.getStandard(`suit_${suitColor}`, { color: suitColor, roughness: 0.62, metalness: 0.05 });
  const accentMat = registry.getStandard(`accent_${accentColor}`, { color: accentColor, roughness: 0.34, metalness: 0.62 });
  const trouserMat = registry.getStandard(`trouser_${trouserColor}`, { color: trouserColor, roughness: 0.72, metalness: 0.04 });
  const shoeMat = registry.getStandard(`shoe_${shoeColor}`, { color: shoeColor, roughness: 0.36, metalness: 0.08 });
  const hairMat = registry.getStandard(`hair_${hairColor}`, { color: hairColor, roughness: 0.65, metalness: 0.04 });
  const teethMat = registry.getStandard('trouser_#E8E0CE', { color: '#F6F2E8', roughness: 0.25, metalness: 0.0 });
  const irisTex = createIrisTexture(irisColor);
  const irisMat = registry.getStandard(`eyeball_${irisColor}`, {
    map: irisTex || null,
    color: irisTex ? '#FFFFFF' : '#F4F4F4',
    roughness: 0.14,
    metalness: 0.04,
  });
  const cavityMat = registry.getBasic('mouth_cavity', { color: '#2A0B0F' });
  const lipMat = registry.getStandard('lip_shared', {
    color: '#9C5147',
    roughness: 0.44,
    metalness: 0.02,
  });

  // Pelvis (coat skirt naturally covers hip cleanly — avoids occluded mesh draw call)
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.58, 0);
  rig.add(pelvis);

  // Chest
  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 0.06, 0);
  pelvis.add(chestGroup);

  const coatProfile = [
    new THREE.Vector2(0.01, -0.18),
    new THREE.Vector2(0.182, -0.18),
    new THREE.Vector2(0.165, -0.04),
    new THREE.Vector2(0.155, 0.08),
    new THREE.Vector2(0.172, 0.22),
    new THREE.Vector2(0.158, 0.34),
    new THREE.Vector2(0.085, 0.40),
    new THREE.Vector2(0.005, 0.41),
  ];
  const coatGeo = new THREE.LatheGeometry(coatProfile, 18);
  coatGeo.scale(1.06, 1.0, 0.84);
  chestGroup.add(new THREE.Mesh(coatGeo, suitMat));

  // Merge sash + collar + curved chest placket into 1 mesh
  const sashGeo = new THREE.TorusGeometry(0.156, 0.028, 8, 18);
  sashGeo.rotateX(Math.PI * 0.5);
  sashGeo.scale(1.07, 1.0, 0.86);
  sashGeo.translate(0, 0.04, 0);

  const collarGeo = new THREE.CylinderGeometry(0.084, 0.094, 0.075, 14);
  collarGeo.translate(0, 0.39, 0);

  const placketProfile = [
    new THREE.Vector2(0.164, 0.06),
    new THREE.Vector2(0.160, 0.14),
    new THREE.Vector2(0.175, 0.24),
    new THREE.Vector2(0.160, 0.35),
    new THREE.Vector2(0.092, 0.40),
  ];
  const placketGeo = new THREE.LatheGeometry(placketProfile, 5, -0.15, 0.30);
  placketGeo.scale(1.06, 1.0, 0.855);

  const mergedChestAccent = safeMerge([sashGeo, collarGeo, placketGeo]);
  chestGroup.add(new THREE.Mesh(mergedChestAccent, accentMat));

  // Head Group
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.44, 0);
  chestGroup.add(headGroup);

  // Merge neck + skull + ears + nose into 1 clean skin mesh
  const neckGeo = new THREE.CylinderGeometry(0.056, 0.068, 0.09, 12);
  neckGeo.translate(0, 0.02, 0);

  const skullGeo = new THREE.SphereGeometry(0.186, 22, 16);
  skullGeo.scale(0.95, 1.04, 0.94);
  skullGeo.translate(0, 0.21, 0);

  const earLGeo = new THREE.SphereGeometry(0.038, 10, 8);
  earLGeo.scale(0.55, 1.05, 0.72);
  earLGeo.translate(-0.176, 0.205, -0.01);

  const earRGeo = new THREE.SphereGeometry(0.038, 10, 8);
  earRGeo.scale(0.55, 1.05, 0.72);
  earRGeo.translate(0.176, 0.205, -0.01);

  const noseGeo = new THREE.SphereGeometry(0.036, 12, 10);
  noseGeo.scale(0.9, 0.85, 1.25);
  noseGeo.translate(0, 0.195, 0.176);

  const headSkinMesh = new THREE.Mesh(safeMerge([neckGeo, skullGeo, earLGeo, earRGeo, noseGeo]), skinMat);
  headGroup.add(headSkinMesh);

  // Unified UV-projected 3D glossy eyeballs (L+R in 1 mesh) + merged movable brows
  const eyeParts = [];
  const browParts = [];

  for (const side of [-1, 1]) {
    const eGeo = new THREE.SphereGeometry(0.041, 16, 12);
    const pos = eGeo.attributes.position;
    const uv = eGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (z > 0) {
        uv.setXY(
          i,
          Math.max(0.02, Math.min(0.98, 0.5 + x / 0.072)),
          Math.max(0.02, Math.min(0.98, 0.5 + y / 0.072))
        );
      } else {
        uv.setXY(i, 0.02, 0.02); // pure white sclera back
      }
    }
    eGeo.scale(0.96, 1.04, 0.68);
    eGeo.translate(side * 0.064, 0.242, 0.146);
    eyeParts.push(eGeo);

    const bGeo = new THREE.CapsuleGeometry(0.012, 0.052, 5, 8);
    bGeo.rotateZ(Math.PI * 0.5 - side * 0.08);
    bGeo.translate(side * 0.064, 0, 0);
    browParts.push(bGeo);
  }
  headGroup.add(new THREE.Mesh(safeMerge(eyeParts), irisMat));

  const browMesh = new THREE.Mesh(safeMerge(browParts), hairMat);
  browMesh.position.set(0, 0.300, 0.159);
  browMesh.userData.baseY = 0.300;
  browMesh.userData.baseRotZ = 0;
  headGroup.add(browMesh);

  const eyeL = { brow: browMesh };
  const eyeR = { brow: browMesh };

  // Mouth Assembly (dark cavity + crisp teeth + articulated lower lip)
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, 0.125, 0.158);
  headGroup.add(mouthGroup);

  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 8), cavityMat);
  cavity.scale.set(1.22, 0.65, 0.55);
  cavity.position.z = -0.008;
  mouthGroup.add(cavity);

  const teeth = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.018, 10, 1, false, -0.7, 1.4), teethMat);
  teeth.position.set(0, 0.016, 0.002);
  mouthGroup.add(teeth);

  const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.010, 0.054, 5, 8), lipMat);
  lowerLip.rotation.z = Math.PI * 0.5;
  lowerLip.position.set(0, -0.018, 0.018);
  mouthGroup.add(lowerLip);

  // Merge tucked mustache + goatee cleanly
  const hairParts = [];
  if (hasMustache) {
    for (const s of [-1, 1]) {
      const wing = new THREE.CapsuleGeometry(0.012, 0.034, 5, 8);
      wing.rotateZ(s * 1.24);
      wing.rotateY(s * 0.25);
      wing.translate(s * 0.026, 0.156, 0.168);
      hairParts.push(wing);
    }
  }
  if (hasGoatee) {
    const beardGeo = new THREE.SphereGeometry(0.058, 12, 8);
    beardGeo.scale(0.86, 0.92, 0.62);
    beardGeo.translate(0, 0.072, 0.132);
    hairParts.push(beardGeo);
  }
  if (hairParts.length > 0) {
    headGroup.add(new THREE.Mesh(safeMerge(hairParts), hairMat));
  }

  // Headgear Group (detachable for comedic hatPop)
  const headgearGroup = new THREE.Group();
  headgearGroup.name = 'headgear';
  headgearGroup.position.set(0, 0.345, -0.005);
  headgearGroup.userData.baseY = 0.345;
  headgearGroup.visible = headgear !== 'none';

  const hatBaseMat = registry.getStandard(`turban_${turbanColor}`, {
    color: turbanColor,
    roughness: 0.56,
    metalness: 0.06,
  });

  if (headgear === 'royal_turban' || headgear === 'skeptic_turban') {
    const crownProfile = [
      new THREE.Vector2(0.01, -0.04),
      new THREE.Vector2(0.185, -0.035),
      new THREE.Vector2(0.215, 0.02),
      new THREE.Vector2(0.195, 0.095),
      new THREE.Vector2(0.13, 0.145),
      new THREE.Vector2(0.01, 0.165),
    ];
    const crownGeo = new THREE.LatheGeometry(crownProfile, 18);
    const wrapGeo = new THREE.TorusGeometry(0.188, 0.032, 8, 18);
    wrapGeo.rotateX(Math.PI * 0.5 + 0.18);
    wrapGeo.translate(0, 0.035, 0);
    headgearGroup.add(new THREE.Mesh(safeMerge([crownGeo, wrapGeo]), hatBaseMat));

    if (headgear === 'royal_turban') {
      const jewelGeo = new THREE.TorusGeometry(0.192, 0.012, 8, 18);
      jewelGeo.rotateX(Math.PI * 0.5 - 0.12);
      jewelGeo.translate(0, 0.02, 0);
      const feather = new THREE.ConeGeometry(0.032, 0.14, 10);
      feather.rotateX(-0.25);
      feather.translate(0, 0.16, 0.11);
      headgearGroup.add(new THREE.Mesh(safeMerge([jewelGeo, feather]), accentMat));
    }
  }
  headGroup.add(headgearGroup);

  // Monocle (1 crisp gold ring when worn)
  let monocleGroup = null;
  if (hasMonocle) {
    monocleGroup = new THREE.Group();
    monocleGroup.position.set(0.064, 0.242, 0.182);
    monocleGroup.userData.basePos = monocleGroup.position.clone();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 8, 16), accentMat);
    monocleGroup.add(ring);
    headGroup.add(monocleGroup);
  }

  // Sunglasses (2 draws -> lenses merged + bridge)
  const sunglassesGroup = new THREE.Group();
  sunglassesGroup.position.set(0, 0.242, 0.186);
  sunglassesGroup.visible = false;
  const frameMat = registry.getStandard('shades_frame', { color: '#111622', roughness: 0.22, metalness: 0.4 });
  const lensL = new THREE.BoxGeometry(0.072, 0.044, 0.012);
  lensL.translate(-0.062, 0, 0);
  const lensR = new THREE.BoxGeometry(0.072, 0.044, 0.012);
  lensR.translate(0.062, 0, 0);
  const bridge = new THREE.BoxGeometry(0.055, 0.012, 0.012);
  bridge.translate(0, 0.008, 0);
  sunglassesGroup.add(new THREE.Mesh(safeMerge([lensL, lensR, bridge]), frameMat));
  headGroup.add(sunglassesGroup);

  // Arms
  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.184, 0.31, 0);
    chestGroup.add(shoulder);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.195, 6, 10), suitMat);
    upper.position.y = -0.105;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.220, 0);
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.040, 0.165, 6, 10), suitMat);
    forearm.position.y = -0.092;
    elbow.add(forearm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skinMat);
    hand.scale.set(0.88, 1.08, 0.78);
    hand.position.y = -0.200;
    elbow.add(hand);

    const propMount = new THREE.Group();
    propMount.position.set(0, -0.212, 0.03);
    elbow.add(propMount);

    return { shoulder, elbow, hand, propMount };
  }
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // Legs
  function buildLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.088, -0.02, 0);
    pelvis.add(hip);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.215, 6, 10), trouserMat);
    thigh.position.y = -0.132;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.252, 0);
    hip.add(knee);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.215, 6, 10), trouserMat);
    shin.position.y = -0.125;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.255, 0);
    knee.add(ankle);

    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.105, 6, 10), shoeMat);
    shoe.rotation.x = Math.PI * 0.5;
    shoe.scale.set(1.0, 0.78, 1.0);
    shoe.position.set(0, -0.022, 0.042);
    ankle.add(shoe);

    return { hip, knee, ankle, shoe };
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // Ground Contact Shadow Disc
  const contactShadow = createContactShadowDisc(0.35, 0.78, registry.contactShadowMat);
  root.add(contactShadow);

  // Selective shadow casting ONLY on primary body/limb/head meshes (huge SwiftShader speedup!)
  if (castShadow) {
    [
      chestGroup.children[0],
      headSkinMesh,
      headgearGroup.children[0],
      legL.thigh,
      legL.shin,
      legR.thigh,
      legR.shin,
    ].forEach((m) => {
      if (m && m.isMesh) m.castShadow = true;
    });
    armL.shoulder.children[0].castShadow = true;
    armR.shoulder.children[0].castShadow = true;
  }

  let baseSoleOffset = 0;
  function groundFeet(surfaceY = 0) {
    rig.position.y = 0;
    rig.updateMatrixWorld(true);
    const boxL = new THREE.Box3().setFromObject(legL.shoe);
    const boxR = new THREE.Box3().setFromObject(legR.shoe);
    const minWorldY = Math.min(boxL.min.y, boxR.min.y);
    const delta = surfaceY - minWorldY;
    rig.position.y += delta;
    baseSoleOffset = rig.position.y;
    rig.updateMatrixWorld(true);
    contactShadow.position.y = 0.004;
    return delta;
  }

  groundFeet(0);

  function setLipSync(open01 = 0, smile = 0.25) {
    const o = Math.max(0, Math.min(1, open01));
    cavity.visible = o > 0.04;
    cavity.scale.set(1.18 + smile * 0.15, 0.22 + o * 0.95, 0.55);
    lowerLip.position.y = -0.012 - o * 0.032;
    teeth.visible = o > 0.10 || smile > 0.48;
  }

  function setHatPop(pop01 = 0) {
    if (!headgearGroup.visible && headgear === 'none') return;
    const p = Math.max(0, Math.min(1, pop01));
    headgearGroup.position.y = 0.345 + p * 0.26;
    headgearGroup.rotation.z = p * 0.22;
    headgearGroup.rotation.y = p * 1.4;
  }

  function setMonocleDrop(drop01 = 0) {
    if (!monocleGroup) return;
    const p = Math.max(0, Math.min(1, drop01));
    const bp = monocleGroup.userData.basePos;
    monocleGroup.position.set(bp.x + p * 0.055, bp.y - p * 0.22, bp.z + p * 0.04);
    monocleGroup.rotation.z = p * 1.2;
  }

  function resetPose() {
    rig.position.set(0, baseSoleOffset, 0);
    rig.rotation.set(0, 0, 0);
    pelvis.rotation.set(0, 0, 0);
    chestGroup.rotation.set(0, 0, 0);
    headGroup.rotation.set(0, 0, 0);
    eyeL.brow.rotation.z = eyeL.brow.userData.baseRotZ;
    eyeR.brow.rotation.z = eyeR.brow.userData.baseRotZ;
    eyeL.brow.position.y = eyeL.brow.userData.baseY;
    eyeR.brow.position.y = eyeR.brow.userData.baseY;
    armL.shoulder.rotation.set(0, 0, 0.14);
    armL.elbow.rotation.set(-0.22, 0, 0);
    armR.shoulder.rotation.set(0, 0, -0.14);
    armR.elbow.rotation.set(-0.22, 0, 0);
    legL.hip.rotation.set(0, 0, 0);
    legL.knee.rotation.set(0, 0, 0);
    legR.hip.rotation.set(0, 0, 0);
    legR.knee.rotation.set(0, 0, 0);
    setHatPop(0);
    setMonocleDrop(0);
    if (monocleGroup) monocleGroup.visible = true;
    sunglassesGroup.visible = false;
  }

  return {
    root,
    rig,
    pelvis,
    chestGroup,
    headGroup,
    headgearGroup,
    monocleGroup,
    sunglassesGroup,
    eyeL,
    eyeR,
    armL,
    armR,
    legL,
    legR,
    contactShadow,
    groundFeet,
    setLipSync,
    setHatPop,
    setMonocleDrop,
    resetPose,
  };
}
