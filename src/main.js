/**
 * Taj Mahal 3D Short Main Application & Deterministic Frame Engine (/home/antigravity/taj-mahal-3d-short/src/main.js)
 */
import * as THREE from 'three';
import { MaterialRegistry } from './engine/baseRig.js';
import { createFrameCompositor, createHudCompositor } from './engine/hudCompositor.js';
import { buildAgraWorld } from './scene/agraWorld.js';
import { buildTajMahalRig } from './scene/tajMahalRig.js';
import { buildTajCharacters } from './characters/tajCharacters.js';
import { createTajDirector } from './camera/director.js';

async function init() {
  const [timeline, manifest] = await Promise.all([
    fetch('/config/timeline.json').then((r) => r.json()),
    fetch('/audio/output/voice_manifest.json').then((r) => r.json()).catch(() => null),
  ]);

  const width = timeline.resolution?.width || 1080;
  const height = timeline.resolution?.height || 1920;
  const fps = timeline.fps || 30;
  const duration = timeline.duration || 30.0;

  const webglCanvas = document.getElementById('webgl-canvas');
  const hudCanvas = document.getElementById('hud-canvas');

  const renderer = new THREE.WebGLRenderer({
    canvas: webglCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe9c193, 0.015);

  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 140);

  // Strict 3-Light Compiled Cap (Hemi + Tight Shadow Key DirLight + Colored Rim DirLight)
  const hemiLight = new THREE.HemisphereLight(0xffebd0, 0x8d583f, 0.95);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff1da, 2.05);
  keyLight.position.set(4.5, 9.5, 5.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -3.8;
  keyLight.shadow.camera.right = 3.8;
  keyLight.shadow.camera.top = 3.8;
  keyLight.shadow.camera.bottom = -3.8;
  keyLight.shadow.camera.near = 1.0;
  keyLight.shadow.camera.far = 24.0;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x7cc4ff, 0.85);
  rimLight.position.set(-5.0, 5.5, -6.5);
  scene.add(rimLight);

  // Shared Scene Assembly
  const registry = new MaterialRegistry();
  const world = buildAgraWorld(scene, registry);
  const taj = buildTajMahalRig(registry, timeline.worldContract?.monumentOrigin || [0.45, 0, -0.65]);
  scene.add(taj.root);

  const chars = buildTajCharacters(scene, registry);
  const director = createTajDirector(camera, timeline);
  const hud = createHudCompositor(timeline, manifest, hudCanvas);
  const compositor = createFrameCompositor(webglCanvas, hudCanvas, width, height);

  function renderFrame(frameIdx) {
    const f = Math.max(0, Math.min((timeline.totalFrames || 900) - 1, Math.round(frameIdx)));
    const t = f / fps;

    const atmo = world.update(t, scene.fog);
    taj.update(t);
    chars.update(t, manifest, fps);

    // Light updates
    hemiLight.color.copy(atmo.hemiSky);
    hemiLight.groundColor.copy(atmo.hemiGround);
    keyLight.color.copy(atmo.keyColor);
    keyLight.intensity = atmo.keyIntensity;
    keyLight.position.copy(atmo.sunDir).multiplyScalar(11.0);
    rimLight.color.copy(atmo.rimColor);

    director.update(t);
    renderer.render(scene, camera);
    hud.draw(t);

    return {
      frame: f,
      t: +t.toFixed(4),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      materials: registry.count(),
    };
  }

  window.__RENDER_FRAME__ = renderFrame;
  window.__GET_COMPOSITE_CANVAS__ = () => compositor.composite();
  window.__TIMELINE__ = timeline;
  window.__SCENE_READY__ = true;

  // Render frame 0 initially
  renderFrame(0);

  // Interactive preview loop if not running automated render
  const params = new URLSearchParams(window.location.search);
  if (!params.has('render')) {
    const startMs = performance.now();
    function tick() {
      const elapsed = ((performance.now() - startMs) / 1000) % duration;
      renderFrame(Math.round(elapsed * fps));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
}

init().catch((err) => {
  console.error('[Main Init Error]', err);
});
