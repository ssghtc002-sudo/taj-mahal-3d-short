/**
 * Shared Fast WebCodecs H.264 Annex-B + Chrome QA Renderer (/home/antigravity/shorts-engine/render/fastRenderer.mjs)
 * Runs `/usr/bin/google-chrome` with SwiftShader WebGL and in-browser VideoEncoder (`avc1.64002a`).
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';

const execFileAsync = promisify(execFile);

const CHROME_EXEC = '/usr/bin/google-chrome';
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--autoplay-policy=no-user-gesture-required',
  '--disk-cache-size=1',
  '--media-cache-size=1',
  '--window-size=1080,1920',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.srt': 'text/plain; charset=utf-8',
};

export async function runFastRender({
  projectRoot,
  mp4Filename,
  qaMode = false,
  workers = 1,
  batchSize = 225,
  maxFrames = null,
  latencyMode = 'realtime',
  qaTimes = [0.6, 2.5, 4.2, 7.2, 9.8, 13.6, 16.0, 19.3, 22.8, 28.0],
}) {
  const timelinePath = path.join(projectRoot, 'config', 'timeline.json');
  const timeline = JSON.parse(await fs.readFile(timelinePath, 'utf-8'));
  const totalFrames = maxFrames ? Math.min(Number(timeline.totalFrames || 900), maxFrames) : Number(timeline.totalFrames || 900);
  const fps = Number(timeline.fps || 30);
  const width = timeline.resolution?.width || 1080;
  const height = timeline.resolution?.height || 1920;

  const segmentsDir = path.join(projectRoot, '.segments');
  const qaDir = path.join(projectRoot, 'render', 'qa_frames');
  const outDir = path.join(projectRoot, 'output');
  await fs.mkdir(segmentsDir, { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const chunkStreams = new Map();

  // Start combined static + binary chunk receiver server
  const server = http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'POST' && parsed.pathname === '/__chunk') {
        const batchId = Number(parsed.searchParams.get('id') || 0);
        const segPath = path.join(segmentsDir, `part_${batchId}.h264`);
        let stream = chunkStreams.get(batchId);
        if (!stream) {
          stream = createWriteStream(segPath, { flags: 'w' });
          chunkStreams.set(batchId, stream);
        }
        const chunks = [];
        for await (const ch of req) chunks.push(ch);
        const buf = Buffer.concat(chunks);
        if (buf.byteLength > 0) {
          await new Promise((resolve, reject) => {
            stream.write(buf, (err) => (err ? reject(err) : resolve()));
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: buf.byteLength }));
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      let reqPath = decodeURIComponent(parsed.pathname);
      if (reqPath === '/') reqPath = '/index.html';
      const targetPath = path.resolve(projectRoot, `.${reqPath}`);
      if (targetPath !== projectRoot && !targetPath.startsWith(projectRoot + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const stat = await fs.stat(targetPath);
      const filePath = stat.isDirectory() ? path.join(targetPath, 'index.html') : targetPath;
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': String(data.byteLength),
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (err) {
      res.writeHead(404);
      res.end(String(err.message || 'Not Found'));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[FastRenderer] Listening on ${baseUrl} (binary: ${CHROME_EXEC})`);

  const tStart = Date.now();
  const partFiles = [];

  try {
    if (qaMode) {
      console.log(`[FastRenderer] Running --qa-only across ${qaTimes.length} keyframes...`);
      const browser = await chromium.launch({ executablePath: CHROME_EXEC, headless: true, args: CHROME_ARGS });
      try {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', (err) => console.error('[Browser PageError]', err));
        page.on('console', (msg) => {
          if (msg.type() === 'error') console.error('[Browser ConsoleError]', msg.text());
        });

        await page.goto(`${baseUrl}/index.html?render=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.__SCENE_READY__), null, { timeout: 30000 });
        const cdp = await context.newCDPSession(page);

        await page.evaluate(() => window.__RENDER_FRAME__(0));

        for (let i = 0; i < qaTimes.length; i++) {
          const ts = qaTimes[i];
          const frame = Math.min(totalFrames - 1, Math.max(0, Math.round(ts * fps)));
          const info = await page.evaluate((f) => {
            const t0 = performance.now();
            const res = window.__RENDER_FRAME__(f);
            return { ...res, ms: +(performance.now() - t0).toFixed(1) };
          }, frame);

          const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
          const outPng = path.join(qaDir, `qa_${String(i + 1).padStart(2, '0')}_t${ts.toFixed(1)}.png`);
          await fs.writeFile(outPng, Buffer.from(data, 'base64'));
          console.log(`  QA [${i + 1}/${qaTimes.length}] t=${ts.toFixed(2)}s f=${frame} render=${info.ms}ms calls=${info.calls} tris=${info.tris} mats=${info.materials} -> ${path.basename(outPng)}`);
        }
        await context.close();
      } finally {
        await browser.close();
      }
      console.log(`[FastRenderer] QA done in ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
      return;
    }

    // Sequential resumable fresh-Chrome batches (zero SwiftShader memory buildup)
    const step = Math.max(1, batchSize);
    const batches = [];
    for (let start = 0, idx = 0; start < totalFrames; start += step, idx++) {
      batches.push({
        batchId: idx,
        startFrame: start,
        endFrame: Math.min(totalFrames - 1, start + step - 1),
      });
    }

    console.log(`[FastRenderer] Starting resumable WebCodecs H.264 encode (${batches.length} sequential batches x <=${step} frames, latencyMode=${latencyMode}, total=${totalFrames} @ ${fps}fps)...`);

    for (const { batchId, startFrame, endFrame } of batches) {
      const segPath = path.join(segmentsDir, `part_${batchId}.h264`);
      const donePath = path.join(segmentsDir, `part_${batchId}.done`);
      partFiles.push(segPath);

      const alreadyDone = await fs.stat(donePath).then(() => true).catch(() => false);
      if (alreadyDone) {
        console.log(`[FastRenderer] Batch ${batchId} (${startFrame}..${endFrame}) already cached -> skipping.`);
        continue;
      }

      // Remove partial leftover if crashed previously
      await fs.rm(segPath, { force: true });

      const browser = await chromium.launch({ executablePath: CHROME_EXEC, headless: true, args: CHROME_ARGS });
      try {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', (err) => console.error(`[Batch ${batchId} PageError]`, err));
        await page.goto(`${baseUrl}/index.html?render=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.__SCENE_READY__), null, { timeout: 30000 });

        page.on('console', (msg) => {
          const txt = msg.text();
          if (txt.startsWith('[WCProgress]')) {
            console.log(`  [B${batchId}] ${txt.slice(13)}`);
          } else if (msg.type() === 'error') {
            console.error(`  [B${batchId} ConsoleErr] ${txt}`);
          }
        });

        const stats = await page.evaluate(
          async ({ batchId, startFrame, endFrame, fps, width, height, latencyMode }) => {
            if (typeof VideoEncoder === 'undefined') {
              throw new Error('VideoEncoder undefined (must run in secure context)');
            }
            let pendingBytes = [];
            let pendingSize = 0;
            let totalEncodedBytes = 0;
            let encodedCount = 0;

            async function flushBytes(force = false) {
              if (!force && pendingSize < 786432) return;
              if (pendingSize === 0) return;
              const merged = new Uint8Array(pendingSize);
              let offset = 0;
              for (const b of pendingBytes) {
                merged.set(b, offset);
                offset += b.byteLength;
              }
              pendingBytes = [];
              pendingSize = 0;
              const resp = await fetch(`/__chunk?id=${batchId}`, { method: 'POST', body: merged });
              if (!resp.ok) throw new Error(`Chunk upload HTTP ${resp.status}`);
            }

            let encodeError = null;
            const encoder = new VideoEncoder({
              output: (chunk) => {
                const buf = new Uint8Array(chunk.byteLength);
                chunk.copyTo(buf);
                pendingBytes.push(buf);
                pendingSize += buf.byteLength;
                totalEncodedBytes += buf.byteLength;
                encodedCount++;
              },
              error: (err) => {
                encodeError = err;
              },
            });

            encoder.configure({
              codec: 'avc1.64002a',
              width,
              height,
              bitrate: 14_000_000,
              bitrateMode: 'variable',
              framerate: fps,
              latencyMode,
              avc: { format: 'annexb' },
            });

            // Single warmup frame
            window.__RENDER_FRAME__(startFrame);
            window.__GET_COMPOSITE_CANVAS__();

            const t0 = performance.now();
            const frameUs = Math.round(1_000_000 / fps);

            for (let f = startFrame; f <= endFrame; f++) {
              if (encodeError) throw encodeError;
              window.__RENDER_FRAME__(f);
              const compCanvas = window.__GET_COMPOSITE_CANVAS__();
              const idx = f - startFrame;
              const vf = new VideoFrame(compCanvas, {
                timestamp: idx * frameUs,
                duration: frameUs,
              });
              encoder.encode(vf, { keyFrame: idx % fps === 0 });
              vf.close();

              while (encoder.encodeQueueSize > 3) {
                await new Promise((r) => setTimeout(r, 4));
              }
              if ((idx + 1) % 25 === 0) {
                await new Promise((r) => setTimeout(r, 8));
              }
              if (pendingSize >= 786432) {
                await flushBytes(true);
              }
              if ((idx + 1) % 50 === 0 || f === endFrame) {
                const elapsed = (performance.now() - t0) / 1000;
                const avgMs = ((elapsed * 1000) / (idx + 1)).toFixed(0);
                console.log(`[WCProgress] f=${f}/${endFrame} (${idx + 1} done, ${avgMs}ms/f)`);
              }
            }

            await encoder.flush();
            if (encodeError) throw encodeError;
            encoder.close();
            await flushBytes(true);

            const totalSec = (performance.now() - t0) / 1000;
            return { encodedCount, totalEncodedBytes, totalSec: +totalSec.toFixed(2) };
          },
          { batchId, startFrame, endFrame, fps, width, height, latencyMode }
        );

        const stream = chunkStreams.get(batchId);
        if (stream) {
          await new Promise((resolve) => stream.end(resolve));
          chunkStreams.delete(batchId);
        }
        await fs.writeFile(donePath, `${stats.encodedCount}\n`);
        console.log(`[FastRenderer] Batch ${batchId} (${startFrame}..${endFrame}) complete: ${stats.encodedCount} frames, ${(stats.totalEncodedBytes / 1048576).toFixed(2)} MB in ${stats.totalSec}s`);
        await context.close();
      } finally {
        await browser.close();
      }
    }
  } finally {
    for (const s of chunkStreams.values()) {
      await new Promise((resolve) => s.end(resolve));
    }
    server.close();
  }

  // Merge Annex-B streams cleanly
  const combinedPath = path.join(segmentsDir, 'video.h264');
  const buffers = await Promise.all(partFiles.map((pf) => fs.readFile(pf)));
  await fs.writeFile(combinedPath, Buffer.concat(buffers));

  const masterAudioPath = path.join(projectRoot, timeline.audio.masterPath);
  const outMp4Path = path.join(outDir, mp4Filename);

  console.log(`[FastRenderer] Muxing H.264 Annex-B + master audio -> ${outMp4Path}`);
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'h264',
    '-r', String(fps),
    '-i', combinedPath,
    '-i', masterAudioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    outMp4Path,
  ]);

  const totalMin = ((Date.now() - tStart) / 60000).toFixed(2);
  console.log(`[FastRenderer] COMPLETE in ${totalMin} min -> ${outMp4Path}`);
}
