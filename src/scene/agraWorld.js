/**
 * Agra World, Yamuna Cutaway, Charbagh Mirror Pool & Dynamic Sky (/home/antigravity/taj-mahal-3d-short/src/scene/agraWorld.js)
 * Built within strict SwiftShader performance budget: merged geometries + InstancedMesh + THREE.FogExp2 + radial glow halos.
 */
import * as THREE from 'three';
import {
  createContactShadowDisc,
  createGlowSprite,
  safeMerge,
} from '../engine/baseRig.js';

function lerpColor(hexA, hexB, u, out = new THREE.Color()) {
  const cA = new THREE.Color(hexA);
  const cB = new THREE.Color(hexB);
  return out.copy(cA).lerp(cB, Math.max(0, Math.min(1, u)));
}

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

function createSandstoneTexture() {
  const c = makeCanvas(256, 256);
  if (!c) return null;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#A85038';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle horizontal sedimentary striations + stone paver grid
  for (let y = 0; y < 256; y += 4) {
    const shade = (Math.sin(y * 0.25) * 10 + (y % 16 === 0 ? -18 : 6)) | 0;
    const r = Math.min(255, Math.max(0, 172 + shade));
    const g = Math.min(255, Math.max(0, 82 + Math.floor(shade * 0.5)));
    const b = Math.min(255, Math.max(0, 58 + Math.floor(shade * 0.4)));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, 256, 4);
  }
  ctx.strokeStyle = 'rgba(65, 25, 18, 0.28)';
  ctx.lineWidth = 2;
  for (let x = 0; x < 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createEarthStrataTexture() {
  const c = makeCanvas(128, 128);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.0, '#6B4930');
  g.addColorStop(0.4, '#4E3728');
  g.addColorStop(0.8, '#382B24');
  g.addColorStop(1.0, '#26201E');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function getAtmosphereForTime(t) {
  // Smooth keyframe interpolation across the 6 beats
  const s = (e0, e1) => {
    const u = Math.max(0, Math.min(1, (t - e0) / (e1 - e0)));
    return u * u * (3 - 2 * u);
  };

  const toQuake = s(14.8, 15.8) * (1.0 - s(19.8, 20.8));
  const toSunset = s(20.4, 22.0) * (1.0 - s(23.5, 25.0));
  const toNight = s(22.2, 24.4);

  const skyTop = lerpColor('#2D6DA3', '#172349', toQuake);
  skyTop.lerp(new THREE.Color('#6F366A'), toSunset * 0.75);
  skyTop.lerp(new THREE.Color('#09132E'), toNight);

  const skyHorizon = lerpColor('#F4C389', '#B97867', toQuake);
  skyHorizon.lerp(new THREE.Color('#FF8B58'), toSunset);
  skyHorizon.lerp(new THREE.Color('#1B3766'), toNight);

  const fogColor = lerpColor('#E9C193', '#B08575', toQuake * 0.75);
  fogColor.lerp(new THREE.Color('#E37C63'), toSunset * 0.8);
  fogColor.lerp(new THREE.Color('#13254D'), toNight);

  const fogDensity = 0.022 + toSunset * 0.005 + toNight * 0.006;

  const keyColor = lerpColor('#FFF1DA', '#FFD6B8', toQuake);
  keyColor.lerp(new THREE.Color('#FF9E64'), toSunset);
  keyColor.lerp(new THREE.Color('#BBD6FF'), toNight);

  const rimColor = lerpColor('#7CC4FF', '#FF785A', toQuake);
  rimColor.lerp(new THREE.Color('#FF6D9E'), toSunset);
  rimColor.lerp(new THREE.Color('#FFE094'), toNight);

  const hemiSky = lerpColor('#FFEBD0', '#AFC6F0', toNight);
  const hemiGround = lerpColor('#8D583F', '#182442', toNight);

  const keyIntensity = 2.05 - toNight * 0.72;
  const sunAngle = -0.35 + (t / 30.0) * 1.1;
  const sunDir = new THREE.Vector3(Math.sin(sunAngle) * 6.0, 9.5 - toSunset * 3.5, 5.5).normalize();

  return {
    skyTop,
    skyHorizon,
    fogColor,
    fogDensity,
    keyColor,
    keyIntensity,
    rimColor,
    hemiSky,
    hemiGround,
    sunDir,
    nightMix: toNight,
    sunsetMix: toSunset,
    quakeMix: toQuake,
    moonAlpha: s(22.0, 23.6),
    lanternAlpha: s(20.6, 22.8),
  };
}

export function buildAgraWorld(scene, registry) {
  const worldGroup = new THREE.Group();
  worldGroup.name = 'agra_world';
  scene.add(worldGroup);

  // 1. Dynamic Procedural Sky Dome (1 draw call)
  const skyUniforms = {
    uTopColor: { value: new THREE.Color('#2D6DA3') },
    uHorizonColor: { value: new THREE.Color('#F4C389') },
    uNightMix: { value: 0.0 },
    uTime: { value: 0.0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform float uNightMix;
      uniform float uTime;
      varying vec3 vWorldPos;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      void main() {
        vec3 d = normalize(vWorldPos);
        float h = clamp(d.y * 1.35 + 0.08, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.72));
        if (uNightMix > 0.02 && d.y > 0.08) {
          float lat = asin(clamp(d.y, -1.0, 1.0));
          vec2 suv = vec2(atan(d.x, -d.z) * max(0.35, cos(lat)) * 42.0, lat * 42.0);
          vec2 gid = floor(suv);
          vec2 fuv = fract(suv) - 0.5;
          float rnd = hash(gid);
          if (rnd > 0.925) {
            float starDist = length(fuv - (vec2(rnd, fract(rnd * 17.3)) - 0.5) * 0.45);
            float star = smoothstep(0.085, 0.015, starDist);
            float tw = 0.65 + 0.35 * sin(uTime * 3.8 + rnd * 90.0);
            col += vec3(0.95, 0.98, 1.0) * star * tw * uNightMix * smoothstep(0.08, 0.28, d.y);
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(85, 20, 14), skyMat);
  worldGroup.add(skyDome);

  // 2. Moon + Additive Halo (Beat 5-6 — radial glow sprite renders luminous moon core + halo in 1 draw)
  const moonGroup = new THREE.Group();
  moonGroup.position.set(-4.8, 8.8, -22.0);
  const moonHalo = createGlowSprite('#E8F1FF', 10.5, 0.0);
  moonHalo.material.fog = false;
  moonGroup.add(moonHalo);
  worldGroup.add(moonGroup);

  // 3. Merged Static Red Sandstone Plaza + Charbagh Walkways + Wide Horizon Apron (1 draw call)
  const sandstoneTex = createSandstoneTexture();
  const sandstoneMat = registry.getStandard('agra_sandstone', {
    map: sandstoneTex || null,
    color: '#C76548',
    roughness: 0.86,
    metalness: 0.02,
  });

  const sandstoneGeos = [];
  const addBox = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    sandstoneGeos.push(g);
  };

  // Broad Agra sandstone plaza extending deep into FogExp2 horizon (120m x 72m back to z=-69m)
  addBox(120, 0.4, 72, 0, -0.20, -33.15);
  // Left & Right Charbagh promenades flanking the reflecting canal (z in [2.85..34])
  addBox(35.45, 0.4, 32.0, -18.275, -0.20, 18.85);
  addBox(35.45, 0.4, 32.0, 18.275, -0.20, 18.85);
  // Pool basin bed below water + marble pool curbing strips
  addBox(1.5, 0.25, 18.0, 0.0, -0.26, 11.85);
  addBox(0.14, 0.09, 12.1, -0.62, 0.045, 8.92);
  addBox(0.14, 0.09, 12.1, 0.62, 0.045, 8.92);
  addBox(1.38, 0.09, 0.14, 0.0, 0.045, 2.86);
  // Side framing Agra Jawaab & Mosque silhouettes in distance
  addBox(2.4, 2.4, 4.2, -6.2, 1.2, -2.1);
  addBox(2.6, 0.7, 3.0, -6.2, 2.75, -2.1);
  addBox(2.4, 2.4, 4.2, 7.1, 1.2, -2.1);
  addBox(2.6, 0.7, 3.0, 7.1, 2.75, -2.1);

  // Planter bases for 14 Charbagh Cypress trees widened cleanly to x=+-1.75m (never blocks foreground Beat 2 camera!)
  for (let row = 0; row < 7; row++) {
    const zPos = 4.25 + row * 1.18;
    for (const s of [-1, 1]) {
      addBox(0.32, 0.14, 0.32, s * 1.75, 0.07, zPos);
    }
  }

  const sandstoneMesh = new THREE.Mesh(safeMerge(sandstoneGeos), sandstoneMat);
  sandstoneMesh.receiveShadow = true;
  worldGroup.add(sandstoneMesh);

  // 4. Charbagh Symmetric Green Lawns (1 merged mesh)
  const lawnMat = registry.getStandard('charbagh_lawn', { color: '#316236', roughness: 0.88, metalness: 0.0 });
  const lawnGeos = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(3.8, 0.05, 9.2);
    g.translate(s * 3.45, 0.025, 8.2);
    lawnGeos.push(g);
  }
  const lawnMesh = new THREE.Mesh(safeMerge(lawnGeos), lawnMat);
  lawnMesh.receiveShadow = true;
  worldGroup.add(lawnMesh);

  // 5. Instanced Cypress Trees flanking the Charbagh pool (1 InstancedMesh draw call)
  const treeCount = 14;
  const timberMat = registry.getStandard('sal_timber', { color: '#5E3B22', roughness: 0.78 });
  const crownInst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 1.85, 10), lawnMat, treeCount);
  const dummy = new THREE.Object3D();
  let tIdx = 0;
  for (let row = 0; row < 7; row++) {
    const zPos = 4.25 + row * 1.18;
    for (const s of [-1, 1]) {
      const xPos = s * 1.75;
      const sc = 0.88 + (row % 3) * 0.08;
      dummy.position.set(xPos, 0.14 + 0.90 * sc, zPos);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      crownInst.setMatrixAt(tIdx, dummy.matrix);
      tIdx++;
    }
  }
  crownInst.frustumCulled = false;
  worldGroup.add(crownInst);

  // 6. Animated Charbagh Reflecting Pool Water Shader (1 draw call)
  const waterUniforms = {
    uTime: { value: 0 },
    uNightMix: { value: 0 },
    uSunsetMix: { value: 0 },
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uNightMix;
      uniform float uSunsetMix;
      varying vec2 vUv;
      void main() {
        float w1 = sin(vUv.y * 55.0 - uTime * 2.6 + sin(vUv.x * 16.0) * 1.4);
        float w2 = cos(vUv.y * 38.0 + uTime * 1.9 + vUv.x * 12.0);
        float rip = (w1 + w2) * 0.5;

        vec3 baseDay = vec3(0.14, 0.44, 0.56);
        vec3 baseSunset = vec3(0.46, 0.30, 0.42);
        vec3 baseNight = vec3(0.06, 0.16, 0.34);
        vec3 col = mix(baseDay, baseSunset, uSunsetMix);
        col = mix(col, baseNight, uNightMix);

        // Inverted soft marble dome silhouette reflection in center strip
        float centerGlow = exp(-pow((vUv.x - 0.5) * 3.8, 2.0)) * smoothstep(0.1, 0.85, vUv.y);
        float marbleSil = centerGlow * (0.45 + 0.18 * rip);
        vec3 reflCol = mix(vec3(0.95, 0.91, 0.82), vec3(0.84, 0.91, 1.0), uNightMix);
        col = mix(col, reflCol, marbleSil * 0.58);

        // Shimmering water glints
        float glint = smoothstep(0.72, 0.98, rip) * centerGlow;
        col += vec3(1.0, 0.92, 0.72) * glint * (0.28 + 0.42 * uNightMix);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const waterGeo = new THREE.PlaneGeometry(1.12, 10.9, 1, 1);
  waterGeo.rotateX(-Math.PI * 0.5);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(0.0, 0.02, 8.38);
  worldGroup.add(waterMesh);

  // 7. Beat 2 Subterranean River Wells Cutaway Pit (visible Beats 1-3)
  const cutawayGroup = new THREE.Group();
  cutawayGroup.name = 'yamuna_cutaway';
  worldGroup.add(cutawayGroup);

  const mudBed = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.25, 0.95), timberMat);
  mudBed.position.set(0.45, -0.59, 0.82);
  cutawayGroup.add(mudBed);

  const riverWaterMat = registry.getStandard('yamuna_water', {
    color: '#1F7A8C',
    roughness: 0.16,
    metalness: 0.08,
    transparent: true,
    opacity: 0.68,
  });
  const riverWaterBox = new THREE.Mesh(new THREE.BoxGeometry(3.06, 0.52, 0.98), riverWaterMat);
  riverWaterBox.position.set(0.45, -0.14, 0.83);
  cutawayGroup.add(riverWaterBox);

  // 21 Instanced Brick Wells + Sal-Wood Timber Piers inside foreground cutaway
  const wellCount = 21;
  const wellInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.10, 0.10, 1.05, 12), sandstoneMat, wellCount);
  const timberInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 10), timberMat, wellCount);
  wellInst.frustumCulled = false;
  timberInst.frustumCulled = false;
  cutawayGroup.add(wellInst, timberInst);

  // Petrified Timber Strength Glow Halo (Beat 2 impact)
  const timberGlow = createGlowSprite('#5CE1E6', 2.4, 0.0);
  timberGlow.position.set(0.45, 0.08, 1.15);
  cutawayGroup.add(timberGlow);

  // Mud splash droplets (Beat 2 comic splash_mud reusing timberMat)
  const mudDropCount = 12;
  const mudInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.042, 8, 6), timberMat, mudDropCount);
  mudInst.frustumCulled = false;
  cutawayGroup.add(mudInst);

  // 8. Beat 1 Holographic Drafting Pedestal & Wireframe Miniature Taj ([-0.18, 0, 1.38])
  const easelGroup = new THREE.Group();
  easelGroup.position.set(-0.04, 0.0, 1.24);
  worldGroup.add(easelGroup);

  const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.78, 14), sandstoneMat);
  pedBase.position.y = 0.39;
  pedBase.castShadow = true;
  easelGroup.add(pedBase);

  const holoMat = registry.getBasic('holo_blueprint', {
    color: '#6CF2FF',
    wireframe: true,
    transparent: true,
    opacity: 0.88,
  });
  const holoBody = new THREE.BoxGeometry(0.26, 0.16, 0.26);
  holoBody.translate(0, 0.08, 0);
  const holoDome = new THREE.SphereGeometry(0.095, 12, 8);
  holoDome.translate(0, 0.22, 0);
  const holoFin = new THREE.ConeGeometry(0.015, 0.09, 6);
  holoFin.translate(0, 0.34, 0);
  const holoGeos = [holoBody, holoDome, holoFin];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = new THREE.CylinderGeometry(0.015, 0.022, 0.22, 6);
      m.translate(sx * 0.16, 0.11, sz * 0.16);
      holoGeos.push(m);
    }
  }
  const holoMesh = new THREE.Mesh(safeMerge(holoGeos), holoMat);
  holoMesh.position.y = 0.86;
  easelGroup.add(holoMesh);

  const holoGlow = createGlowSprite('#5CE1E6', 0.82, 0.65);
  holoGlow.position.set(0, 1.02, 0);
  easelGroup.add(holoGlow);

  // 9. Instanced Golden Lanterns (Beats 5-6)
  const lanternCount = 24;
  const lanternMat = registry.getStandard('sky_lantern', {
    color: '#FFE08A',
    emissive: '#FF9F2E',
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
  const lanternInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.04, 0.14, 8), lanternMat, lanternCount);
  lanternInst.frustumCulled = false;
  worldGroup.add(lanternInst);

  // Update world animation cleanly per time t
  const wellGrid = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      wellGrid.push({
        x: 0.45 + (col - 3) * 0.38,
        z: 0.98 - row * 0.28,
        phase: (row * 7 + col) * 0.05,
      });
    }
  }

  function update(t, fog) {
    const atmo = getAtmosphereForTime(t);
    skyUniforms.uTopColor.value.copy(atmo.skyTop);
    skyUniforms.uHorizonColor.value.copy(atmo.skyHorizon);
    skyUniforms.uNightMix.value = atmo.nightMix;
    skyUniforms.uTime.value = t;

    waterUniforms.uTime.value = t;
    waterUniforms.uNightMix.value = atmo.nightMix;
    waterUniforms.uSunsetMix.value = atmo.sunsetMix;

    if (fog) {
      fog.color.copy(atmo.fogColor);
      fog.density = atmo.fogDensity;
    }

    // Moon fade
    moonGroup.visible = atmo.moonAlpha > 0.01;
    if (moonGroup.visible) {
      moonHalo.material.opacity = atmo.moonAlpha * 0.92;
      moonGroup.position.y = 7.6 + atmo.moonAlpha * 1.4;
    }

    // Beat 1 Hologram Easel (0 .. 3.7s)
    easelGroup.visible = t < 3.75;
    if (easelGroup.visible) {
      const fadeOut = t > 3.25 ? Math.max(0, 1 - (t - 3.25) / 0.5) : 1.0;
      holoMesh.rotation.y = t * 1.45;
      holoMesh.position.y = 0.86 + Math.sin(t * 3.2) * 0.025;
      holoMat.opacity = 0.88 * fadeOut;
      holoGlow.material.opacity = 0.62 * fadeOut;
      easelGroup.position.y = t > 3.25 ? -(1 - fadeOut) * 0.4 : 0;
    }

    // Beat 2 Cutaway Pit + Pile Slams (3.2 .. 8.8s)
    cutawayGroup.visible = t >= 3.2 && t <= 8.8;
    if (cutawayGroup.visible) {
      const openU = Math.min(1, Math.max(0, (t - 3.3) / 0.6));
      const closeU = t > 7.55 ? Math.max(0, 1 - (t - 7.55) / 0.60) : 1.0;
      const scaleY = openU * closeU;
      cutawayGroup.position.y = (1 - scaleY) * -1.4;

      // Drop brick wells and sal timber piles down at t=5.3..6.7
      const pileDrop = Math.min(1, Math.max(0, (t - 5.3) / 1.4));
      for (let i = 0; i < wellCount; i++) {
        const w = wellGrid[i];
        const dropLocal = Math.min(1, Math.max(0, (pileDrop - w.phase * 0.25) / 0.65));
        const wellY = -0.18 + (1 - dropLocal) * 0.85;
        dummy.position.set(w.x, wellY, w.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wellInst.setMatrixAt(i, dummy.matrix);

        const timberY = -0.04 + (1 - dropLocal) * 1.15;
        dummy.position.set(w.x, timberY, w.z);
        dummy.updateMatrix();
        timberInst.setMatrixAt(i, dummy.matrix);
      }
      wellInst.instanceMatrix.needsUpdate = true;
      timberInst.instanceMatrix.needsUpdate = true;

      // Petrified strength flash
      const pulse1 = Math.max(0, 1 - Math.abs(t - 5.9) / 0.55);
      const pulse2 = Math.max(0, 1 - Math.abs(t - 6.6) / 0.70);
      timberGlow.material.opacity = Math.max(pulse1, pulse2) * 0.85;
      timberGlow.visible = timberGlow.material.opacity > 0.01;

      // Mud splat droplets around Skeptic foot [-0.58, 0, 1.15] at t=3.72..4.5
      const dtMud = t - 3.72;
      mudInst.visible = dtMud >= 0 && dtMud <= 0.85;
      if (mudInst.visible) {
        for (let i = 0; i < mudDropCount; i++) {
          const ang = (i / mudDropCount) * Math.PI * 2;
          const rad = 0.08 + dtMud * (0.45 + (i % 3) * 0.2);
          const vy = 1.85 * dtMud - 4.5 * dtMud * dtMud;
          const sc = Math.max(0.05, 1.0 - dtMud * 1.1);
          dummy.position.set(-0.56 + Math.cos(ang) * rad, Math.max(0.02, vy), 1.16 + Math.sin(ang) * rad);
          dummy.scale.set(sc, sc, sc);
          dummy.updateMatrix();
          mudInst.setMatrixAt(i, dummy.matrix);
        }
        mudInst.instanceMatrix.needsUpdate = true;
      }
    }

    // Beats 5-6 Floating Pool & Sky Lanterns (t >= 20.6)
    lanternInst.visible = atmo.lanternAlpha > 0.01;
    if (lanternInst.visible) {
      for (let i = 0; i < lanternCount; i++) {
        const isPool = i < 10;
        if (isPool) {
          const side = i % 2 === 0 ? -0.34 : 0.34;
          const z = 3.2 + Math.floor(i / 2) * 1.35 + Math.sin(t * 0.8 + i) * 0.08;
          dummy.position.set(side + Math.sin(t + i * 2) * 0.04, 0.08 + Math.sin(t * 2.2 + i) * 0.015, z);
          dummy.scale.setScalar(0.85 * atmo.lanternAlpha);
        } else {
          const idx = i - 10;
          const x = -4.2 + (idx % 7) * 1.4 + Math.sin(t * 0.5 + idx) * 0.25;
          const z = -2.5 - Math.floor(idx / 7) * 3.8;
          const rise = ((t - 20.6) * 0.32 + idx * 0.4) % 5.5;
          dummy.position.set(x, 1.2 + rise, z);
          dummy.scale.setScalar(1.15 * atmo.lanternAlpha);
        }
        dummy.updateMatrix();
        lanternInst.setMatrixAt(i, dummy.matrix);
      }
      lanternInst.instanceMatrix.needsUpdate = true;
    }

    return atmo;
  }

  return { worldGroup, easelGroup, update };
}
