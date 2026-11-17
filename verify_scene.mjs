/**
 * Sub-1-Second Node Pre-Flight Verification (/home/antigravity/taj-mahal-3d-short/verify_scene.mjs)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MaterialRegistry } from './src/engine/baseRig.js';
import { runPreFlightAudit } from './src/engine/verifyScene.mjs';
import { buildAgraWorld } from './src/scene/agraWorld.js';
import { buildTajMahalRig } from './src/scene/tajMahalRig.js';
import { buildTajCharacters } from './src/characters/tajCharacters.js';
import { createTajDirector } from './src/camera/director.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const timeline = JSON.parse(await fs.readFile(path.join(__dirname, 'config', 'timeline.json'), 'utf-8'));
const manifest = JSON.parse(
  await fs.readFile(path.join(__dirname, 'audio', 'output', 'voice_manifest.json'), 'utf-8')
).catch?.(() => null) || JSON.parse(await fs.readFile(path.join(__dirname, 'audio', 'output', 'voice_manifest.json'), 'utf-8'));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe9c193, 0.015);
const camera = new THREE.PerspectiveCamera(46, 1080 / 1920, 0.1, 140);

// 3 compiled lights
scene.add(new THREE.HemisphereLight(0xffebd0, 0x8d583f, 0.95));
const key = new THREE.DirectionalLight(0xfff1da, 2.05);
scene.add(key);
scene.add(new THREE.DirectionalLight(0x7cc4ff, 0.85));

const registry = new MaterialRegistry();
const world = buildAgraWorld(scene, registry);
const taj = buildTajMahalRig(registry, timeline.worldContract.monumentOrigin);
scene.add(taj.root);
const chars = buildTajCharacters(scene, registry);
const director = createTajDirector(camera, timeline);

const vTmp = new THREE.Vector3();

const report = runPreFlightAudit({
  scene,
  camera,
  updateAtTime: (t) => {
    world.update(t, scene.fog);
    taj.update(t);
    chars.update(t, manifest, 30);
    director.update(t);
  },
  getCharacters: (t) => {
    const tr = chars.getTrackingState(t);
    const out = [{ name: 'architect', rig: chars.architect, expectedFloorY: tr.archFloorY, checkFeet: tr.checkFeetArch }];
    if (chars.inspector.root.visible) {
      out.push({ name: 'inspector', rig: chars.inspector, expectedFloorY: tr.inspFloorY, checkFeet: tr.checkFeetInsp });
    }
    return out;
  },
  getTrackedPoints: (t) => {
    const pts = [];
    // Architect head & feet
    chars.architect.headGroup.getWorldPosition(vTmp);
    pts.push({ label: 'architect_head', kind: 'head', required: true, worldPos: vTmp.clone().add(new THREE.Vector3(0, 0.36, 0)) });
    pts.push({ label: 'architect_feet', kind: 'feet', required: true, worldPos: chars.architect.root.position.clone() });

    if (chars.inspector.root.visible) {
      chars.inspector.headGroup.getWorldPosition(vTmp);
      pts.push({ label: 'inspector_head', kind: 'head', required: true, worldPos: vTmp.clone().add(new THREE.Vector3(0, 0.36, 0)) });
      pts.push({ label: 'inspector_feet', kind: 'feet', required: t < 3.5 || t >= 15.0, worldPos: chars.inspector.root.position.clone() });
    }
    if (t >= 26.0) {
      pts.push({
        label: 'taj_finial_tip',
        kind: 'landmark',
        required: true,
        worldPos: new THREE.Vector3(0.45, 5.85, -0.65),
      });
    }
    return pts;
  },
  budgets: {
    maxDraws: 65,
    maxTris: 65000,
    maxMaterials: 25,
    maxLights: 3,
    maxShadowCasters: 35,
  },
});

console.log('[VerifyScene] Metrics:', JSON.stringify(report.maxMetrics));
if (report.warnings.length > 0) {
  console.log('[VerifyScene] Warnings:');
  for (const w of report.warnings) console.log('  WARN:', w);
}
if (!report.passed) {
  console.error('[VerifyScene] FAILED Errors:');
  for (const e of report.errors) console.error('  ERR:', e);
  process.exit(1);
}
console.log('[VerifyScene] ALL PRE-FLIGHT GATES PASSED!');
