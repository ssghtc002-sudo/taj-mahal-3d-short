/**
 * Reusable Beat Camera Director Engine (/home/antigravity/shorts-engine/camera/baseDirector.js)
 * Zero per-frame heap allocations, easeOutQuint whip-pans, organic handheld sway, and SFX impact shakes.
 */
import * as THREE from 'three';

export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) {
  const u = clamp01((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
}
export function easeOutQuint(x) {
  const u = clamp01(x);
  return 1 - Math.pow(1 - u, 5);
}

export function createBaseDirector(camera, timeline, evaluateShotFn, options = {}) {
  const beats = Array.isArray(timeline?.beats) ? timeline.beats : [];
  const sfxEvents = Array.isArray(timeline?.sfxEvents) ? timeline.sfxEvents : [];
  const transitions = options.transitions || {};
  const defaultTrans = { duration: 0.36, whipFov: 3.4, whipRoll: 0.030 };

  const currPos = new THREE.Vector3();
  const currLook = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const prevLook = new THREE.Vector3();
  const finalPos = new THREE.Vector3();
  const finalLook = new THREE.Vector3();

  const currScalars = { fov: 46, roll: 0, swayAmp: 0.72 };
  const prevScalars = { fov: 46, roll: 0, swayAmp: 0.72 };

  function findBeatAt(t) {
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (t >= b.start && (t < b.end || i === beats.length - 1)) return b;
    }
    return beats[0] || { id: 'default', start: 0, end: 30, shot: 'default' };
  }

  function evalImpactShake(t) {
    let best = 0;
    for (let i = 0; i < sfxEvents.length; i++) {
      const ev = sfxEvents[i];
      const dt = t - ev.time;
      if (dt >= 0 && dt < 0.50) {
        const w = ev.type === 'sonic_boom' || ev.type === 'pile_slam' || ev.type === 'quake_rumble' ? 0.85
          : ev.type === 'vine_boom' || ev.type === 'splash_mud' || ev.type === 'wind_shred' ? 0.55 : 0.25;
        best = Math.max(best, w * Math.exp(-dt * 9.8));
      }
    }
    return clamp01(best);
  }

  function update(t = 0, state = {}) {
    const activeBeat = state.activeBeat || findBeatAt(t);
    const shotName = activeBeat.shot || activeBeat.id;

    evaluateShotFn(shotName, t, activeBeat, state, currPos, currLook, currScalars);

    let blendedFov = currScalars.fov;
    let blendedRoll = currScalars.roll;
    let swayAmp = currScalars.swayAmp;

    finalPos.copy(currPos);
    finalLook.copy(currLook);

    const beatIdx = beats.indexOf(activeBeat);
    const trans = transitions[shotName] || defaultTrans;
    const elapsed = t - activeBeat.start;

    if (beatIdx > 0 && trans.duration > 0.001 && elapsed >= 0 && elapsed < trans.duration) {
      const prevBeat = beats[beatIdx - 1];
      const prevShot = prevBeat.shot || prevBeat.id;
      evaluateShotFn(prevShot, activeBeat.start, prevBeat, state, prevPos, prevLook, prevScalars);

      const u = clamp01(elapsed / trans.duration);
      const eased = easeOutQuint(u);
      const bell = Math.sin(u * Math.PI);

      finalPos.lerpVectors(prevPos, currPos, eased);
      finalLook.lerpVectors(prevLook, currLook, eased);
      blendedFov = lerp(prevScalars.fov, currScalars.fov, eased) + bell * (trans.whipFov || 0);
      blendedRoll = lerp(prevScalars.roll, currScalars.roll, eased) + bell * (trans.whipRoll || 0);
      swayAmp = lerp(prevScalars.swayAmp, currScalars.swayAmp, eased);
    }

    const swayX = (Math.sin(t * 1.15) * 0.010 + Math.sin(t * 2.41) * 0.004) * swayAmp;
    const swayY = (Math.cos(t * 1.48) * 0.008 + Math.cos(t * 0.73) * 0.004) * swayAmp;
    const swayRoll = Math.sin(t * 0.89) * 0.005 * swayAmp;

    const rawShake = state.sfxShake !== undefined ? state.sfxShake : evalImpactShake(t);
    const shake = clamp01(rawShake);
    const shakeX = shake * (Math.sin(t * 54.0) * 0.065 + Math.cos(t * 88.0) * 0.028);
    const shakeY = shake * (Math.cos(t * 62.0) * 0.065 + Math.sin(t * 94.0) * 0.026);
    const shakeRoll = shake * (Math.sin(t * 46.0) * 0.032 + Math.cos(t * 78.0) * 0.014);

    camera.position.set(finalPos.x + swayX + shakeX, finalPos.y + swayY + shakeY, finalPos.z);
    camera.lookAt(finalLook.x + shakeX * 0.35, finalLook.y + shakeY * 0.35, finalLook.z);
    camera.rotateZ(blendedRoll + swayRoll + shakeRoll);

    if (Math.abs(camera.fov - blendedFov) > 1e-4) {
      camera.fov = blendedFov;
      camera.updateProjectionMatrix();
    }
  }

  return { update, findBeatAt };
}
