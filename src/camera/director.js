/**
 * Taj Mahal 6-Beat Camera Director (/home/antigravity/taj-mahal-3d-short/src/camera/director.js)
 * Built on shared baseDirector.js with exact portrait 9:16 NDC safe-zone math across every beat.
 */
import { createBaseDirector, clamp01, lerp } from '../engine/baseDirector.js';

export function createTajDirector(camera, timeline) {
  function evaluateShot(shotName, t, activeBeat, state, outPos, outLook, outScalars) {
    const u = clamp01((t - activeBeat.start) / Math.max(0.1, activeBeat.end - activeBeat.start));

    switch (shotName) {
      case 'yamuna_blueprint_hook': {
        // Beat 1 (0..3.5s): Tight crisp two-shot + glowing hologram blueprint, clear below top hook pill and above captions!
        outPos.set(lerp(-0.14, 0.08, u), lerp(1.18, 1.10, u), lerp(5.75, 5.25, u));
        outLook.set(lerp(-0.02, -0.04, u), 0.56, 1.38);
        outScalars.fov = 46;
        outScalars.roll = 0;
        outScalars.swayAmp = 0.65;
        break;
      }

      case 'river_wells_foundation': {
        // Beat 2 (3.5..8.2s): Unobstructed front-left view inside tree corridor showing mud splat + subterranean river brick wells & sal-wood piers
        outPos.set(lerp(-0.85, -0.45, u), lerp(1.24, 1.16, u), lerp(5.15, 4.88, u));
        outLook.set(lerp(-0.08, 0.12, u), lerp(0.46, 0.34, u), lerp(1.15, 0.78, u));
        outScalars.fov = 48;
        outScalars.roll = 0.010 * (1 - u);
        outScalars.swayAmp = 0.65;
        break;
      }

      case 'ramp_dome_montage': {
        // Beat 3 (8.2..15.0s): Hero low-angle ascending sweep showing marble spiral ramp, lotus dome, golden finial, and grounded Architect
        outPos.set(lerp(-1.45, 0.22, u), lerp(1.52, 2.15, u), lerp(7.65, 9.55, u));
        outLook.set(lerp(0.05, 0.25, u), lerp(1.55, 2.45, u), lerp(-0.35, -0.65, u));
        outScalars.fov = lerp(48, 49, u);
        outScalars.roll = 0;
        outScalars.swayAmp = 0.55;
        break;
      }

      case 'leaning_minarets_twist': {
        // Beat 4 (15.0..20.8s): Clean full-body two-shot framing leaning front-left minaret & expanding quake shockwave above captions
        outPos.set(lerp(-0.12, -0.38, u), lerp(1.22, 1.32, u), lerp(6.35, 7.25, u));
        outLook.set(lerp(-0.10, -0.18, u), lerp(0.88, 1.05, u), lerp(0.55, 0.15, u));
        outScalars.fov = 49;
        outScalars.roll = 0;
        outScalars.swayAmp = 0.65;
        break;
      }

      case 'sunset_moonlight_glow': {
        // Beat 5 (20.8..25.8s): Two-shot capturing golden Taj sunset melting into moonlight + monocle drop + shades snap!
        outPos.set(lerp(0.18, -0.05, u), lerp(1.12, 1.08, u), lerp(5.75, 5.45, u));
        outLook.set(lerp(0.0, -0.05, u), lerp(0.68, 0.66, u), 1.45);
        outScalars.fov = 46;
        outScalars.roll = 0;
        outScalars.swayAmp = 0.50;
        break;
      }

      case 'charbagh_reflection_finale':
      default: {
        // Beat 6 (25.8..30.0s): Majestic Charbagh water reflection foreground + cheering duo on marble plinth + glowing Taj!
        outPos.set(lerp(0.18, 0.25, u), lerp(1.58, 1.62, u), lerp(9.05, 8.35, u));
        outLook.set(0.32, lerp(2.08, 2.18, u), -0.65);
        outScalars.fov = 48;
        outScalars.roll = 0;
        outScalars.swayAmp = 0.45;
        break;
      }
    }
  }

  return createBaseDirector(camera, timeline, evaluateShot, {
    transitions: {
      river_wells_foundation: { duration: 0.42, whipFov: 4.0, whipRoll: 0.032 },
      ramp_dome_montage: { duration: 0.45, whipFov: 4.5, whipRoll: -0.025 },
      leaning_minarets_twist: { duration: 0.35, whipFov: 5.0, whipRoll: 0.042 },
      sunset_moonlight_glow: { duration: 0.45, whipFov: 3.2, whipRoll: -0.02 },
      charbagh_reflection_finale: { duration: 0.50, whipFov: 3.8, whipRoll: 0.02 },
    },
  });
}
