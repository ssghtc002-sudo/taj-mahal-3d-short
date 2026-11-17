/**
 * Taj Mahal Stylized Hero Characters & Beat Acting Choreography (/home/antigravity/taj-mahal-3d-short/src/characters/tajCharacters.js)
 * Built on shared baseRig.js with comic gags (hatPop, monocleDrop, shades snap, mud kick) & frame-accurate audio lip-sync.
 */
import * as THREE from 'three';
import { buildPixarHumanoid } from '../engine/baseRig.js';

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * clamp01(t); }
function smoothstep(e0, e1, x) {
  const u = clamp01((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
}

export function buildTajCharacters(scene, registry) {
  const architect = buildPixarHumanoid(
    {
      id: 'architect',
      skinColor: '#C7885C',
      suitColor: '#164C78',
      accentColor: '#E5AF44',
      trouserColor: '#E8E0CE',
      shoeColor: '#4B251A',
      hairColor: '#1E1715',
      irisColor: '#3E2716',
      hasMustache: true,
      hasGoatee: true,
      headgear: 'royal_turban',
      turbanColor: '#A62639',
      hasMonocle: false,
      castShadow: true,
    },
    registry
  );
  architect.root.scale.setScalar(0.95);
  scene.add(architect.root);

  const inspector = buildPixarHumanoid(
    {
      id: 'inspector',
      skinColor: '#D39B73',
      suitColor: '#74233C',
      accentColor: '#E5AF44',
      trouserColor: '#E8E0CE',
      shoeColor: '#4B251A',
      hairColor: '#1E1715',
      irisColor: '#3E522B',
      hasMustache: true,
      hasGoatee: false,
      headgear: 'skeptic_turban',
      turbanColor: '#C67F24',
      hasMonocle: true,
      castShadow: true,
    },
    registry
  );
  inspector.root.scale.setScalar(0.92);
  scene.add(inspector.root);

  // Small Comic Props mounted strictly to hands when active (sharing existing marble & gold materials!)
  const scrollMat = registry.getStandard('trouser_#E8E0CE', { color: '#E8E0CE', roughness: 0.72 });
  const cupMat = registry.getStandard('accent_#E5AF44', { color: '#E5AF44', roughness: 0.34, metalness: 0.62 });
  const scrollProp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.24, 10), scrollMat);
  scrollProp.rotation.z = Math.PI * 0.5;
  architect.armR.propMount.add(scrollProp);

  const gobletProp = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, 0.095, 10), cupMat);
  inspector.armL.propMount.add(gobletProp);

  function getLipValue(manifest, spk, frameIdx) {
    const arr = manifest?.lipSync?.[spk];
    if (!arr || arr.length === 0) return 0;
    return arr[Math.max(0, Math.min(arr.length - 1, frameIdx))] || 0;
  }

  // Computes exact world-space hero tracking points for pre-flight verification
  function getTrackingState(t) {
    if (t < 3.5) {
      return { archFloorY: 0.0, inspFloorY: 0.0, checkFeetArch: true, checkFeetInsp: true };
    }
    if (t < 8.2) {
      const hopping = t >= 3.65 && t <= 4.35;
      return { archFloorY: 0.0, inspFloorY: 0.0, checkFeetArch: true, checkFeetInsp: !hopping };
    }
    if (t < 15.0) {
      return { archFloorY: 0.42, inspFloorY: 0.0, checkFeetArch: true, checkFeetInsp: false };
    }
    if (t < 20.8) {
      return { archFloorY: 0.0, inspFloorY: 0.0, checkFeetArch: true, checkFeetInsp: true };
    }
    if (t < 25.8) {
      return { archFloorY: 0.0, inspFloorY: 0.0, checkFeetArch: true, checkFeetInsp: true };
    }
    return { archFloorY: 0.42, inspFloorY: 0.42, checkFeetArch: true, checkFeetInsp: true };
  }

  function update(t, manifest, fps = 30) {
    const frameIdx = Math.round(t * fps);
    const lipArch = getLipValue(manifest, 'architect', frameIdx);
    const lipInsp = getLipValue(manifest, 'inspector', frameIdx);

    architect.resetPose();
    inspector.resetPose();
    architect.root.visible = true;
    inspector.root.visible = true;
    scrollProp.visible = false;
    gobletProp.visible = false;

    const breathe = Math.sin(t * 2.6) * 0.02;

    if (t < 3.5) {
      // Beat 1: Mud Hook Blueprint Pitch
      architect.root.position.set(0.42, 0.0, 1.48);
      architect.root.rotation.y = -0.32;
      architect.chestGroup.rotation.x = breathe;
      architect.armL.shoulder.rotation.set(-0.65 - Math.sin(t * 4.5) * 0.14, 0.25, 0.35);
      architect.armL.elbow.rotation.set(-0.65, 0, 0);
      architect.armR.shoulder.rotation.set(-0.42, -0.2, -0.24);
      architect.armR.elbow.rotation.set(-0.72, 0, 0);
      architect.headGroup.rotation.y = 0.22;
      scrollProp.visible = true;

      inspector.root.position.set(-0.46, 0.0, 1.44);
      inspector.root.rotation.y = 0.34;
      gobletProp.visible = true;
      const gaspU = smoothstep(2.15, 2.45, t);
      inspector.chestGroup.rotation.x = -0.14 * gaspU;
      inspector.headGroup.rotation.x = -0.16 * gaspU;
      inspector.armL.shoulder.rotation.set(-0.62, 0, 0.22);
      inspector.armL.elbow.rotation.set(-0.92, 0, 0);
      inspector.armR.shoulder.rotation.set(-0.35 - 0.55 * gaspU, 0, -0.20 - 0.35 * gaspU);
      const hatPop = t >= 2.25 ? Math.sin(clamp01((t - 2.25) / 0.95) * Math.PI) : 0;
      inspector.setHatPop(hatPop);
      inspector.eyeL.brow.position.y += 0.025 * gaspU;
    } else if (t < 8.2) {
      // Beat 2: River Mud Splash & Subterranean Timber Wells
      architect.root.position.set(0.24, 0.0, 1.62);
      architect.root.rotation.y = -0.36;
      const slamPulse = t >= 5.55 ? Math.sin(clamp01((t - 5.55) / 1.8) * Math.PI * 2) * 0.35 : 0;
      architect.armL.shoulder.rotation.set(-0.82 - slamPulse, 0.15, -0.22);
      architect.armL.elbow.rotation.set(-0.45, 0, 0);
      architect.armR.shoulder.rotation.set(-0.75 + slamPulse, -0.18, 0.22);
      architect.armR.elbow.rotation.set(-0.48, 0, 0);
      architect.headGroup.rotation.y = 0.18;

      inspector.root.position.set(-0.58, 0.0, 1.46);
      inspector.root.rotation.y = 0.38;
      // Kick mud reaction at t=3.72..4.25 with outward flailing arms
      const kick = t >= 3.68 && t <= 4.32 ? Math.sin(clamp01((t - 3.68) / 0.64) * Math.PI) : 0;
      inspector.legR.hip.rotation.x = -0.68 * kick;
      inspector.legR.knee.rotation.x = 0.78 * kick;
      inspector.armL.shoulder.rotation.set(-0.55, 0, -0.42 - kick * 0.48);
      inspector.armR.shoulder.rotation.set(-0.55, 0, 0.42 + kick * 0.48);
      inspector.headGroup.rotation.x = 0.22 * (1 - kick) - 0.15 * kick;
    } else if (t < 15.0) {
      // Beat 3: Monumental Marble & Dome Montage (Architect standing clearly on front-left marble terrace [-0.52, 0.42, 0.96], clear of minaret!)
      architect.root.position.set(-0.52, 0.42, 0.96);
      architect.root.rotation.y = 0.36;
      const waveU = Math.sin(t * 3.8);
      architect.armL.shoulder.rotation.set(-0.35 + waveU * 0.14, 0.15, -2.15);
      architect.armL.elbow.rotation.set(-0.25, 0, 0);
      architect.armR.shoulder.rotation.set(-0.65 - waveU * 0.12, -0.15, 0.25);
      architect.headGroup.rotation.x = -0.22;
      architect.headGroup.rotation.y = 0.22;

      inspector.root.visible = false;
      inspector.root.position.set(-4.5, 0.0, 2.0);
    } else if (t < 20.8) {
      // Beat 4: Outward-Leaning Minarets & Quake Shake Twist!
      architect.root.position.set(0.44, 0.0, 1.52);
      architect.root.rotation.y = -0.26;
      inspector.root.position.set(-0.44, 0.0, 1.50);
      inspector.root.rotation.y = 0.28;

      if (t < 17.65) {
        // Skeptic points clearly outward-upward toward the leaning Front-Left minaret!
        const pan = Math.sin(t * 14.0) * 0.05;
        inspector.armL.shoulder.rotation.set(-1.68 + pan, 0.05, -0.52);
        inspector.armL.elbow.rotation.set(-0.18, 0, 0);
        inspector.armR.shoulder.rotation.set(-0.85, 0.15, 0.22);
        inspector.armR.elbow.rotation.set(-0.85, 0, 0);
        inspector.headGroup.rotation.x = -0.26;
        inspector.setHatPop(0.35 + Math.abs(Math.sin(t * 9.0)) * 0.28);

        architect.armR.shoulder.rotation.set(-0.35, 0, 0.25);
        architect.armR.elbow.rotation.set(-0.95, 0, 0);
      } else {
        // Quake shake! Architect stands heroic while Skeptic wobbles dramatically with outward arms
        const qU = clamp01((t - 17.75) / 2.6);
        const w = Math.sin(qU * Math.PI) * Math.sin(qU * 28.0);
        inspector.chestGroup.rotation.z = w * 0.18;
        inspector.armL.shoulder.rotation.set(-0.72, 0, -0.68 + w * 0.35);
        inspector.armR.shoulder.rotation.set(-0.72, 0, 0.68 + w * 0.35);
        inspector.setHatPop(Math.abs(w) * 0.45);

        architect.armL.shoulder.rotation.set(-1.05, 0.25, -0.25);
        architect.armL.elbow.rotation.set(-0.45, 0, 0);
        architect.armR.shoulder.rotation.set(-0.55, 0, 0.22);
      }
    } else if (t < 25.8) {
      // Beat 5: Sunset -> Moonlight + Monocle Drop + Starlight Shades Reveal!
      architect.root.position.set(0.45, 0.0, 1.88);
      architect.root.rotation.y = -0.24;
      inspector.root.position.set(-0.45, 0.0, 1.88);
      inspector.root.rotation.y = 0.24;

      architect.armL.shoulder.rotation.set(-0.95, 0.25, 0.35);
      architect.armR.shoulder.rotation.set(-0.42, 0, 0.22);

      // Skeptic jaw drop + monocle drops cleanly at t=23.3
      const dropU = smoothstep(23.25, 24.05, t);
      inspector.setMonocleDrop(dropU);
      const shadesOn = t >= 24.55;
      inspector.sunglassesGroup.visible = shadesOn;
      if (inspector.monocleGroup) inspector.monocleGroup.visible = !shadesOn;
      if (shadesOn) {
        inspector.chestGroup.rotation.x = -0.10;
        inspector.armR.shoulder.rotation.set(-1.12, -0.1, 0.22);
        inspector.armR.elbow.rotation.set(-0.95, 0, 0);
        inspector.armL.shoulder.rotation.set(-0.65, 0.35, -0.18);
      } else {
        inspector.armL.shoulder.rotation.set(-0.95, 0.15, 0.35);
        inspector.armR.shoulder.rotation.set(-0.95, -0.15, -0.35);
      }
    } else {
      // Beat 6: Charbagh Mirror Pool Symmetry Finale — wide outward V-cheer leaving faces 100% open!
      architect.root.position.set(-0.42, 0.42, 0.90);
      architect.root.rotation.y = 0.18;
      inspector.root.position.set(1.32, 0.42, 0.90);
      inspector.root.rotation.y = -0.22;
      inspector.sunglassesGroup.visible = true;
      if (inspector.monocleGroup) inspector.monocleGroup.visible = false;

      const cheer = Math.sin(t * 6.5) * 0.14;
      architect.armL.shoulder.rotation.set(-0.25, 0, -2.35 + cheer);
      architect.armL.elbow.rotation.set(0, 0, -0.25);
      architect.armR.shoulder.rotation.set(-0.25, 0, 2.35 - cheer);
      architect.armR.elbow.rotation.set(0, 0, 0.25);

      inspector.armL.shoulder.rotation.set(-0.25, 0, -2.35 - cheer);
      inspector.armL.elbow.rotation.set(0, 0, -0.25);
      inspector.armR.shoulder.rotation.set(-0.25, 0, 2.35 + cheer);
      inspector.armR.elbow.rotation.set(0, 0, 0.25);
    }

    architect.setLipSync(lipArch, 0.35);
    inspector.setLipSync(lipInsp, t > 24.5 ? 0.65 : -0.1);
  }

  return { architect, inspector, update, getTrackingState };
}
