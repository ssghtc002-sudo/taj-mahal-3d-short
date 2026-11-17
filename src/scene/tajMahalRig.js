/**
 * Parametric Makrana White Marble Taj Mahal Rig (/home/antigravity/taj-mahal-3d-short/src/scene/tajMahalRig.js)
 * Features multi-stage architectural assembly, spiral construction ramps, outward-leaning anti-quake minarets,
 * lotus onion dome, glowing golden Kalash finial, and seismic wave visualization.
 */
import * as THREE from 'three';
import { createGlowSprite, safeMerge } from '../engine/baseRig.js';

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

function createMakranaMarbleTexture() {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F7F3EA';
  ctx.fillRect(0, 0, 256, 256);

  // Soft pearl veining + ashlar stone lines
  ctx.strokeStyle = 'rgba(205, 194, 178, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * 19) % 256);
    ctx.bezierCurveTo(85, ((i * 29) + 20) % 256, 170, ((i * 11) + 45) % 256, 256, (i * 31) % 256);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(186, 175, 160, 0.22)';
  ctx.lineWidth = 1.5;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutBack(u) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(u) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

export function buildTajMahalRig(registry, origin = [0.45, 0.0, -0.65]) {
  const root = new THREE.Group();
  root.name = 'taj_mahal_rig';
  root.position.set(origin[0], origin[1], origin[2]);

  const marbleTex = createMakranaMarbleTexture();
  const marbleMat = registry.getStandard('makrana_marble', {
    map: marbleTex || null,
    color: '#F7F3EA',
    roughness: 0.38,
    metalness: 0.04,
  });
  const alcoveMat = registry.getStandard('shoe_#4B251A', {
    color: '#4B251A',
    roughness: 0.72,
    metalness: 0.05,
  });
  const goldMat = registry.getStandard('accent_#E5AF44', {
    color: '#E5AF44',
    roughness: 0.30,
    metalness: 0.72,
  });
  const timberRampMat = registry.getStandard('sal_timber', {
    color: '#5E3B22',
    roughness: 0.78,
  });

  // 1. Marble Plinth Base (top = 0.42m)
  const plinthGeos = [];
  const pMain = new THREE.BoxGeometry(3.45, 0.42, 3.45);
  pMain.translate(0, 0.21, 0);
  plinthGeos.push(pMain);
  // Wide front approach stairs
  for (let st = 0; st < 4; st++) {
    const stepGeo = new THREE.BoxGeometry(1.15 - st * 0.04, 0.105, 0.14);
    stepGeo.translate(0, 0.052 + st * 0.105, 1.92 - st * 0.11);
    plinthGeos.push(stepGeo);
  }
  const plinthMesh = new THREE.Mesh(safeMerge(plinthGeos), marbleMat);
  plinthMesh.receiveShadow = true;
  plinthMesh.castShadow = true;
  root.add(plinthMesh);

  // 2. Main Chamfered Mausoleum Core + Pishtaq Arches + Niche Alcoves (y = 0.42 .. 1.60)
  const mausoleumGroup = new THREE.Group();
  root.add(mausoleumGroup);

  const bodyGeos = [];
  const mainBlock = new THREE.BoxGeometry(1.68, 1.14, 1.68);
  mainBlock.translate(0, 0.42 + 0.57, 0);
  bodyGeos.push(mainBlock);

  // Chamfered 45° corners
  for (const ang of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const corner = new THREE.CylinderGeometry(0.98, 0.98, 1.14, 4);
    corner.rotateY(ang);
    corner.translate(Math.cos(ang) * 0.12, 0.42 + 0.57, Math.sin(ang) * 0.12);
    bodyGeos.push(corner);
  }

  // Sculpted Front & Back Pishtaq Frame Projections (tall majestic frame peaking slightly above terrace 1.56)
  for (const dir of [-1, 1]) {
    const frameL = new THREE.BoxGeometry(0.18, 1.32, 0.24);
    frameL.translate(-0.36, 0.42 + 0.66, dir * 0.88);
    const frameR = new THREE.BoxGeometry(0.18, 1.32, 0.24);
    frameR.translate(0.36, 0.42 + 0.66, dir * 0.88);
    const frameTop = new THREE.BoxGeometry(0.90, 0.22, 0.24);
    frameTop.translate(0, 0.42 + 1.21, dir * 0.88);
    bodyGeos.push(frameL, frameR, frameTop);
  }
  // Side Pishtaqs
  for (const dir of [-1, 1]) {
    const frameL = new THREE.BoxGeometry(0.24, 1.32, 0.18);
    frameL.translate(dir * 0.88, 0.42 + 0.66, -0.36);
    const frameR = new THREE.BoxGeometry(0.24, 1.32, 0.18);
    frameR.translate(dir * 0.88, 0.42 + 0.66, 0.36);
    const frameTop = new THREE.BoxGeometry(0.24, 0.22, 0.90);
    frameTop.translate(dir * 0.88, 0.42 + 1.21, 0);
    bodyGeos.push(frameL, frameR, frameTop);
  }

  const mausoleumMesh = new THREE.Mesh(safeMerge(bodyGeos), marbleMat);
  mausoleumMesh.castShadow = true;
  mausoleumMesh.receiveShadow = true;
  mausoleumGroup.add(mausoleumMesh);

  // Dark Recessed Iwan Arch Alcoves + Flanking Bays (1 merged mesh for crisp Mughal contrast!)
  const alcoves = [];
  for (const dir of [-1, 1]) {
    const centerIwan = new THREE.BoxGeometry(0.52, 0.98, 0.10);
    centerIwan.translate(0, 0.42 + 0.50, dir * 0.91);
    const iwanArch = new THREE.CylinderGeometry(0.26, 0.26, 0.10, 12);
    iwanArch.rotateX(Math.PI * 0.5);
    iwanArch.translate(0, 0.42 + 0.98, dir * 0.91);
    alcoves.push(centerIwan, iwanArch);
  }
  for (const dir of [-1, 1]) {
    const sideIwan = new THREE.BoxGeometry(0.10, 0.98, 0.52);
    sideIwan.translate(dir * 0.91, 0.42 + 0.50, 0);
    const sArch = new THREE.CylinderGeometry(0.26, 0.26, 0.10, 12);
    sArch.rotateZ(Math.PI * 0.5);
    sArch.translate(dir * 0.91, 0.42 + 0.98, 0);
    alcoves.push(sideIwan, sArch);
  }
  mausoleumGroup.add(new THREE.Mesh(safeMerge(alcoves), alcoveMat));

  // Gold Inlaid Spandrels + Roof Guldasta Pinnacles (1 merged gold trim mesh!)
  const trimGeos = [];
  for (const dir of [-1, 1]) {
    const topStrip = new THREE.BoxGeometry(0.84, 0.045, 0.04);
    topStrip.translate(0, 0.42 + 1.32, dir * 0.99);
    trimGeos.push(topStrip);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const guldasta = new THREE.ConeGeometry(0.035, 0.22, 8);
      guldasta.translate(sx * 0.46, 0.42 + 1.42, sz * 0.92);
      trimGeos.push(guldasta);
    }
  }
  mausoleumGroup.add(new THREE.Mesh(safeMerge(trimGeos), goldMat));

  // 3. Central Drum + 4 Octagonal Corner Chhatris (y = 1.56 .. 3.25)
  const roofGroup = new THREE.Group();
  root.add(roofGroup);

  const roofGeos = [];
  // High drum cylinder under main dome
  const drum = new THREE.CylinderGeometry(0.56, 0.59, 1.58, 22);
  drum.translate(0, 1.56 + 0.79, 0);
  roofGeos.push(drum);
  const drumCornice = new THREE.TorusGeometry(0.59, 0.045, 8, 22);
  drumCornice.rotateX(Math.PI * 0.5);
  drumCornice.translate(0, 1.56 + 1.56, 0);
  roofGeos.push(drumCornice);

  // 4 Chhatri pavilions around roof corners
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * 0.62;
      const cz = sz * 0.62;
      const baseRing = new THREE.CylinderGeometry(0.22, 0.24, 0.10, 8);
      baseRing.translate(cx, 1.56 + 0.05, cz);
      roofGeos.push(baseRing);
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        const col = new THREE.CylinderGeometry(0.022, 0.025, 0.36, 6);
        col.translate(cx + Math.cos(a) * 0.16, 1.56 + 0.28, cz + Math.sin(a) * 0.16);
        roofGeos.push(col);
      }
      const chDome = new THREE.SphereGeometry(0.21, 12, 10);
      chDome.scale(1.0, 1.15, 1.0);
      chDome.translate(cx, 1.56 + 0.56, cz);
      roofGeos.push(chDome);
    }
  }
  const roofMesh = new THREE.Mesh(safeMerge(roofGeos), marbleMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);

  // 4. Bulbous Lotus Onion Dome (y = 3.12 .. 4.95m)
  const domeGroup = new THREE.Group();
  root.add(domeGroup);

  const domeProfile = [
    new THREE.Vector2(0.01, 3.12),
    new THREE.Vector2(0.56, 3.14),
    new THREE.Vector2(0.68, 3.45),
    new THREE.Vector2(0.71, 3.78),
    new THREE.Vector2(0.60, 4.18),
    new THREE.Vector2(0.37, 4.55),
    new THREE.Vector2(0.14, 4.82),
    new THREE.Vector2(0.04, 4.95),
    new THREE.Vector2(0.002, 4.96),
  ];
  const domeGeo = new THREE.LatheGeometry(domeProfile, 28);
  const domeMesh = new THREE.Mesh(domeGeo, marbleMat);
  domeMesh.castShadow = true;
  domeMesh.receiveShadow = true;
  domeGroup.add(domeMesh);

  // 5. Golden Kalash Finial (y = 4.95 .. 5.85m) + Additive Glory Halo
  const finialGroup = new THREE.Group();
  root.add(finialGroup);

  const finProfile = [
    new THREE.Vector2(0.09, 4.95),
    new THREE.Vector2(0.04, 5.05),
    new THREE.Vector2(0.075, 5.14),
    new THREE.Vector2(0.032, 5.26),
    new THREE.Vector2(0.055, 5.36),
    new THREE.Vector2(0.020, 5.52),
    new THREE.Vector2(0.015, 5.84),
    new THREE.Vector2(0.002, 5.86),
  ];
  const finLathe = new THREE.LatheGeometry(finProfile, 14);
  const crescent = new THREE.TorusGeometry(0.08, 0.014, 8, 14, Math.PI * 1.15);
  crescent.rotateZ(-Math.PI * 0.58);
  crescent.translate(0, 5.72, 0);
  const finialMesh = new THREE.Mesh(safeMerge([finLathe, crescent]), goldMat);
  finialGroup.add(finialMesh);

  const finialGlow = createGlowSprite('#FFE484', 1.45, 0.0);
  finialGlow.position.set(0, 5.45, 0);
  finialGroup.add(finialGlow);

  // 6. Four Outward-Tilting Three-Tier Minarets (1 merged mesh per minaret!)
  const minaretOffsets = [
    [-1.44, 0.42, 1.44],   // 0: Front-Left (hero featured in Beat 4)
    [1.44, 0.42, 1.44],    // 1: Front-Right
    [-1.44, 0.42, -1.44],  // 2: Back-Left
    [1.44, 0.42, -1.44],   // 3: Back-Right
  ];
  const minarets = [];
  for (let i = 0; i < 4; i++) {
    const [mx, my, mz] = minaretOffsets[i];
    const piv = new THREE.Group();
    piv.position.set(mx, my, mz);
    root.add(piv);

    const mGeos = [];
    // Base octagonal plinth
    const b = new THREE.CylinderGeometry(0.20, 0.22, 0.24, 8);
    b.translate(0, 0.12, 0);
    mGeos.push(b);
    // Tier 1, 2, 3 shafts & balconies
    const t1 = new THREE.CylinderGeometry(0.145, 0.17, 0.90, 14);
    t1.translate(0, 0.69, 0);
    const bal1 = new THREE.CylinderGeometry(0.21, 0.17, 0.09, 14);
    bal1.translate(0, 1.14, 0);
    const t2 = new THREE.CylinderGeometry(0.12, 0.145, 0.80, 14);
    t2.translate(0, 1.56, 0);
    const bal2 = new THREE.CylinderGeometry(0.185, 0.145, 0.08, 14);
    bal2.translate(0, 1.98, 0);
    const t3 = new THREE.CylinderGeometry(0.10, 0.12, 0.72, 14);
    t3.translate(0, 2.36, 0);
    const bal3 = new THREE.CylinderGeometry(0.165, 0.125, 0.08, 14);
    bal3.translate(0, 2.74, 0);
    // Open Chhatri Cupola top
    const cup = new THREE.SphereGeometry(0.125, 12, 10);
    cup.scale(1.0, 1.2, 1.0);
    cup.translate(0, 2.98, 0);
    mGeos.push(t1, bal1, t2, bal2, t3, bal3, cup);

    const minMesh = new THREE.Mesh(safeMerge(mGeos), marbleMat);
    minMesh.castShadow = true;
    minMesh.receiveShadow = true;
    piv.add(minMesh);

    const outDir = new THREE.Vector2(mx, mz).normalize();
    minarets.push({ piv, outDir });
  }

  // 7. Beat 3 Construction Spiral Timber Ramp (InstancedMesh, visible t in [7.8 .. 14.15])
  const rampGroup = new THREE.Group();
  root.add(rampGroup);
  const rampSteps = 36;
  const rampInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.14, 0.36), timberRampMat, rampSteps);
  rampInst.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < rampSteps; i++) {
    const u = i / (rampSteps - 1);
    const ang = u * Math.PI * 3.1;
    const rad = 1.34 - u * 0.34;
    dummy.position.set(Math.cos(ang) * rad, 0.48 + u * 2.85, Math.sin(ang) * rad);
    dummy.rotation.set(0, -ang, 0.18);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rampInst.setMatrixAt(i, dummy.matrix);
  }
  rampInst.instanceMatrix.needsUpdate = true;
  rampGroup.add(rampInst);

  // Moving marble block hanging near dome during montage
  const hoistBlock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), marbleMat);
  rampGroup.add(hoistBlock);

  // 8. Beat 4 Plumb-Line vs Outward Tilt Angle Guide + Seismic Shockwave Ring
  const quakeGroup = new THREE.Group();
  root.add(quakeGroup);

  const guideCyanMat = registry.getBasic('holo_blueprint', { color: '#5CE1E6', transparent: true, opacity: 0.85 });
  const guideCoralMat = registry.getBasic('turban_#A62639_coral', { color: '#FF6B6B', transparent: true, opacity: 0.90 });

  // Angle caliper showing vertical plumb vs outward minaret tilt beside Front-Left minaret
  const plumbBeam = new THREE.CylinderGeometry(0.014, 0.014, 2.20, 8);
  plumbBeam.translate(-1.26, 0.42 + 1.12, 1.62);
  const tiltBeam = new THREE.CylinderGeometry(0.016, 0.016, 2.24, 8);
  tiltBeam.rotateZ(0.11);
  tiltBeam.translate(-1.40, 0.42 + 1.12, 1.62);
  const angleBridge = new THREE.CylinderGeometry(0.010, 0.010, 0.28, 8);
  angleBridge.rotateZ(Math.PI * 0.5);
  angleBridge.translate(-1.39, 0.42 + 2.18, 1.62);
  const angleCaliper = new THREE.Mesh(safeMerge([plumbBeam, tiltBeam, angleBridge]), guideCoralMat);
  quakeGroup.add(angleCaliper);

  // Expanding seismic shockwave ring
  const shockRingMat = registry.getBasic('quake_shock_ring', {
    color: '#FF9E64',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shockRingGeo = new THREE.RingGeometry(0.85, 1.0, 36);
  shockRingGeo.rotateX(-Math.PI * 0.5);
  const shockRing = new THREE.Mesh(shockRingGeo, shockRingMat);
  shockRing.position.set(0, 0.44, 0);
  quakeGroup.add(shockRing);

  function update(t) {
    // Stage assembly progression
    // Plinth visible lightly in Beat 1 (0.35), ducks low while Beat 2 cutaway exposes wells (3.4..7.25), then rises full height by 8.15s!
    let plinthBuild = 1.0;
    if (t < 3.4) {
      plinthBuild = 0.35;
    } else if (t < 7.25) {
      const duck = clamp01((t - 3.4) / 0.45);
      plinthBuild = 0.35 - duck * 0.21;
    } else if (t < 8.15) {
      plinthBuild = 0.14 + clamp01((t - 7.25) / 0.90) * 0.86;
    }
    plinthMesh.scale.set(1, plinthBuild, 1);

    // Minarets rise cleanly in Beat 2.8 .. 10.5
    const minBuild = clamp01((t - 7.8) / 2.2);
    // Mausoleum rises in Beat 3 (8.0 .. 10.2)
    const bodyBuild = clamp01((t - 7.9) / 1.9);
    mausoleumGroup.visible = bodyBuild > 0.01;
    mausoleumGroup.scale.set(1, Math.max(0.01, easeOutBack(bodyBuild)), 1);

    // Roof drum + chhatris (9.8 .. 11.8)
    const roofBuild = clamp01((t - 9.8) / 1.8);
    roofGroup.visible = roofBuild > 0.01;
    roofGroup.scale.set(1, Math.max(0.01, roofBuild), 1);

    // Bulbous Lotus Dome descends/pops smoothly (11.3 .. 13.3)
    const domeBuild = clamp01((t - 11.3) / 1.8);
    domeGroup.visible = domeBuild > 0.01;
    if (domeGroup.visible) {
      const e = easeOutBack(domeBuild);
      domeGroup.position.y = (1 - clamp01(domeBuild)) * 1.45;
      domeGroup.scale.setScalar(0.25 + 0.75 * e);
    }

    // Golden Kalash Finial crowns spire cleanly onto dome apex (13.0 .. 13.85, glow burst at 14.15!)
    const finBuild = clamp01((t - 13.0) / 0.85);
    finialGroup.visible = finBuild > 0.01;
    if (finialGroup.visible) {
      finialGroup.position.y = (1 - clamp01(finBuild)) * 0.95;
      const boomPulse = Math.max(0, 1 - Math.abs(t - 14.15) / 0.85);
      const nightGlow = clamp01((t - 22.0) / 2.0) * 0.45;
      finialGlow.material.opacity = Math.max(boomPulse * 0.95, nightGlow);
      finialGlow.visible = finialGlow.material.opacity > 0.01;
      finialGlow.scale.setScalar(1.35 + boomPulse * 1.8);
    }

    // Construction Ramp + Hoist block (7.8 .. 14.15)
    rampGroup.visible = t >= 7.8 && t <= 14.15;
    if (rampGroup.visible) {
      const u = clamp01((t - 7.8) / 6.0);
      const fadeOut = t > 13.4 ? clamp01(1 - (t - 13.4) / 0.75) : 1.0;
      rampGroup.scale.set(1, fadeOut, 1);
      const ang = (u * 5.0) % (Math.PI * 2);
      hoistBlock.position.set(Math.cos(ang) * 1.15, 1.0 + u * 2.4, Math.sin(ang) * 1.15);
      hoistBlock.rotation.y = ang;
    }

    // 4 Minarets: rise in Beat 3, then demonstrate outward architectural 2.2° tilt + Beat 4 quake sway
    const swayU = t >= 17.85 && t <= 20.35 ? clamp01((t - 17.85) / 2.4) : 0;
    const quakeWave = swayU > 0 ? Math.sin(swayU * Math.PI) * (0.095 + 0.045 * Math.sin(swayU * 26.0)) : 0;
    const realTiltRad = 0.038 + quakeWave; // ~2.2° permanent outward lean + ~6.5° dramatized safe sway away from dome

    for (let i = 0; i < 4; i++) {
      const m = minarets[i];
      m.piv.visible = minBuild > 0.01;
      m.piv.scale.set(1, Math.max(0.01, easeOutBack(minBuild)), 1);
      // Tilt around perpendicular horizontal axis so minaret leans outward along outDir
      m.piv.rotation.z = -m.outDir.x * realTiltRad;
      m.piv.rotation.x = m.outDir.y * realTiltRad;
    }

    // Beat 4 Quake Angle Guide & Expanding Shockwave Ring
    const showGuide = t >= 15.05 && t <= 20.4;
    quakeGroup.visible = showGuide;
    if (showGuide) {
      const inWave = t >= 17.75;
      angleCaliper.visible = !inWave;
      const shockU = clamp01((t - 17.85) / 1.9);
      shockRing.visible = inWave && shockU > 0 && shockU < 1;
      shockRing.scale.setScalar(0.8 + shockU * 4.2);
      shockRingMat.opacity = Math.sin(shockU * Math.PI) * 0.78;
    }
  }

  return {
    root,
    plinthMesh,
    mausoleumGroup,
    domeGroup,
    finialGroup,
    minarets,
    update,
  };
}
