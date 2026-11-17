/**
 * Sub-1-Second Node Pre-Flight Gate (/home/antigravity/shorts-engine/verifyScene.mjs)
 * Evaluates matrices, bounding boxes, foot grounding, draw-call/tri/material budgets, and NDC frustum overlap before browser launch.
 */
import * as THREE from 'three';

export function countSceneMetrics(root) {
  let meshCount = 0;
  let instancedCount = 0;
  let totalTris = 0;
  let shadowCasters = 0;
  const uniqueMaterials = new Set();
  const lights = [];

  function walk(obj) {
    if (!obj.visible) return;
    if (obj.isLight) lights.push(obj);

    if (obj.isInstancedMesh) {
      instancedCount++;
      meshCount++;
      if (obj.material) uniqueMaterials.add(obj.material);
      if (obj.castShadow) shadowCasters++;
      const g = obj.geometry;
      const trisPerInst = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
      totalTris += Math.round(trisPerInst * obj.count);
    } else if (obj.isMesh || obj.isSprite) {
      meshCount++;
      if (obj.material) uniqueMaterials.add(obj.material);
      if (obj.castShadow) shadowCasters++;
      if (obj.geometry) {
        const g = obj.geometry;
        const tris = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
        totalTris += Math.round(tris);
      }
    }

    for (let i = 0; i < obj.children.length; i++) {
      walk(obj.children[i]);
    }
  }
  walk(root);

  return {
    meshCount,
    instancedCount,
    totalTris,
    uniqueMaterials: uniqueMaterials.size,
    lightCount: lights.length,
    shadowCasters,
  };
}

export function projectToNdc(worldPoint, camera) {
  const v = worldPoint.clone().project(camera);
  return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
}

export function hasNaNMatrix(obj) {
  let bad = null;
  obj.traverse((c) => {
    if (bad) return;
    for (let i = 0; i < 16; i++) {
      if (!Number.isFinite(c.matrixWorld.elements[i])) {
        bad = c.name || c.type;
        return;
      }
    }
  });
  return bad;
}

export function runPreFlightAudit({
  scene,
  camera,
  updateAtTime,
  getTrackedPoints,
  getCharacters,
  timestamps = [0.2, 0.8, 1.8, 2.8, 4.0, 5.8, 7.5, 9.5, 12.0, 14.2, 15.8, 18.2, 20.2, 22.0, 24.8, 27.2, 29.2],
  budgets = {
    maxDraws: 65,
    maxTris: 65000,
    maxMaterials: 25,
    maxLights: 3,
    maxShadowCasters: 45,
  },
}) {
  const errors = [];
  const warnings = [];
  let maxMetrics = { meshCount: 0, totalTris: 0, uniqueMaterials: 0, lightCount: 0, shadowCasters: 0 };

  for (const t of timestamps) {
    updateAtTime(t);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const nanNode = hasNaNMatrix(scene);
    if (nanNode) errors.push(`t=${t.toFixed(2)}s NaN matrix at ${nanNode}`);

    const m = countSceneMetrics(scene);
    maxMetrics.meshCount = Math.max(maxMetrics.meshCount, m.meshCount);
    maxMetrics.totalTris = Math.max(maxMetrics.totalTris, m.totalTris);
    maxMetrics.uniqueMaterials = Math.max(maxMetrics.uniqueMaterials, m.uniqueMaterials);
    maxMetrics.lightCount = Math.max(maxMetrics.lightCount, m.lightCount);
    maxMetrics.shadowCasters = Math.max(maxMetrics.shadowCasters, m.shadowCasters);

    // Character grounding check when standing upright on ground/deck
    const chars = getCharacters ? getCharacters(t) : [];
    for (const ch of chars) {
      if (ch.expectedFloorY !== null && ch.expectedFloorY !== undefined && ch.checkFeet !== false) {
        const bL = new THREE.Box3().setFromObject(ch.rig.legL.shoe);
        const bR = new THREE.Box3().setFromObject(ch.rig.legR.shoe);
        const minY = Math.min(bL.min.y, bR.min.y);
        const err = Math.abs(minY - ch.expectedFloorY);
        if (err > 0.025) {
          errors.push(`t=${t.toFixed(2)}s ${ch.name} foot gap=${err.toFixed(3)}m (minY=${minY.toFixed(3)}, expected=${ch.expectedFloorY.toFixed(3)})`);
        }
      }
    }

    // NDC Frustum & Overlap checks
    const tracked = getTrackedPoints ? getTrackedPoints(t) : [];
    const activeHeads = [];
    for (const pt of tracked) {
      const ndc = projectToNdc(pt.worldPos, camera);
      const inFront = ndc.z >= -1 && ndc.z <= 1;
      if (!inFront && pt.required) {
        errors.push(`t=${t.toFixed(2)}s ${pt.label} behind/outside clip z=${ndc.z}`);
        continue;
      }
      if (pt.required) {
        if (Math.abs(ndc.x) > 0.90) {
          errors.push(`t=${t.toFixed(2)}s ${pt.label} clipped X side ndcX=${ndc.x}`);
        }
        const minYBound = pt.allowCaptionMargin !== undefined ? pt.allowCaptionMargin : -0.58;
        if (ndc.y < minYBound) {
          errors.push(`t=${t.toFixed(2)}s ${pt.label} overlapped caption zone ndcY=${ndc.y} (< ${minYBound})`);
        }
        const maxYBound = t < 3.25 ? 0.78 : 0.90;
        if (ndc.y > maxYBound) {
          errors.push(`t=${t.toFixed(2)}s ${pt.label} overlapped top hook zone ndcY=${ndc.y} (> ${maxYBound})`);
        }
      }
      if (pt.kind === 'head') activeHeads.push({ label: pt.label, ndc });
      if (pt.kind === 'overhead') {
        for (const h of activeHeads) {
          if (Math.abs(pt.ndc?.x ?? ndc.x - h.ndc.x) < 0.16 && Math.abs(ndc.y - h.ndc.y) < 0.20) {
            warnings.push(`t=${t.toFixed(2)}s overhead ${pt.label} close to ${h.label}`);
          }
        }
      }
    }

    // Check head-vs-head overlap
    for (let i = 0; i < activeHeads.length; i++) {
      for (let j = i + 1; j < activeHeads.length; j++) {
        const dx = Math.abs(activeHeads[i].ndc.x - activeHeads[j].ndc.x);
        const dy = Math.abs(activeHeads[i].ndc.y - activeHeads[j].ndc.y);
        if (dx < 0.16 && dy < 0.18) {
          errors.push(`t=${t.toFixed(2)}s Head overlap ${activeHeads[i].label} vs ${activeHeads[j].label} (dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)})`);
        }
      }
    }
  }

  if (maxMetrics.meshCount > budgets.maxDraws) {
    errors.push(`Draw budget exceeded: peak visible meshes=${maxMetrics.meshCount} > ${budgets.maxDraws}`);
  }
  if (maxMetrics.totalTris > budgets.maxTris) {
    errors.push(`Triangle budget exceeded: peak tris=${maxMetrics.totalTris} > ${budgets.maxTris}`);
  }
  if (maxMetrics.uniqueMaterials > budgets.maxMaterials) {
    errors.push(`Material budget exceeded: ${maxMetrics.uniqueMaterials} > ${budgets.maxMaterials}`);
  }
  if (maxMetrics.lightCount > budgets.maxLights) {
    errors.push(`Light budget exceeded: ${maxMetrics.lightCount} > ${budgets.maxLights}`);
  }
  if (maxMetrics.shadowCasters > budgets.maxShadowCasters) {
    warnings.push(`Shadow casters elevated: ${maxMetrics.shadowCasters} > ${budgets.maxShadowCasters}`);
  }

  return {
    passed: errors.length === 0,
    maxMetrics,
    errors,
    warnings,
  };
}
