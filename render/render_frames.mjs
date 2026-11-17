/**
 * Taj Mahal Render Runner (/home/antigravity/taj-mahal-3d-short/render/render_frames.mjs)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFastRender } from './fastRenderer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const qaMode = args.has('--qa-only');
const workersArg = [...args].find((a) => a.startsWith('--workers='));
const batchArg = [...args].find((a) => a.startsWith('--batch-size='));
const framesArg = [...args].find((a) => a.startsWith('--frames='));
const latencyArg = [...args].find((a) => a.startsWith('--latency='));
const workers = workersArg ? Number(workersArg.split('=')[1]) : 1;
const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 150;
const maxFrames = framesArg ? Number(framesArg.split('=')[1]) : null;
const latencyMode = latencyArg ? latencyArg.split('=')[1] : 'realtime';

await runFastRender({
  projectRoot: PROJECT_ROOT,
  mp4Filename: 'taj_mahal_making_short.mp4',
  qaMode,
  workers,
  batchSize,
  maxFrames,
  latencyMode,
  qaTimes: [0.6, 2.5, 4.2, 7.2, 9.8, 14.0, 16.0, 19.3, 22.8, 28.0],
});
