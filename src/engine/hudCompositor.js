/**
 * Shared 2D Canvas HUD & Subtitle Compositor (/home/antigravity/shorts-engine/hud/hudCompositor.js)
 * Renders high-DPI 1080x1920 HUD overlays directly onto <canvas> for both live DOM preview and zero-PNG WebCodecs encoding.
 */

export function createHudCompositor(timeline, manifest = null, canvas = null) {
  const width = timeline?.resolution?.width || 1080;
  const height = timeline?.resolution?.height || 1920;
  const duration = Number(timeline?.duration || 30.0);

  if (!canvas && typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  }
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;

  const hookBadge = timeline?.hookBadge || '';
  const hookTitle = timeline?.title || '';
  const hookEmoji = timeline?.hookEmoji || '';
  const speakersCfg = timeline?.speakers || {};
  const sfxEvents = Array.isArray(timeline?.sfxEvents) ? timeline.sfxEvents : [];

  // Build clean 6-word / 42-char subtitle pages from manifest (or fallback timeline lines)
  const rawLines = Array.isArray(manifest?.lines) && manifest.lines.length > 0
    ? manifest.lines
    : (timeline?.dialogue || []).map((d) => ({
        ...d,
        words: buildFallbackWords(d.text, d.start, d.end),
      }));

  const subtitlePages = [];
  for (const line of rawLines) {
    const pages = splitWordsIntoPages(line.words || [], 5, 36);
    for (const p of pages) {
      subtitlePages.push({
        id: line.id,
        speaker: line.speaker,
        start: p.start,
        end: p.end,
        words: p.words,
      });
    }
  }

  function buildFallbackWords(text, start, end) {
    const raw = String(text || '').trim().split(/\s+/).filter(Boolean);
    const words = [];
    for (const tok of raw) {
      if (tok.includes('—') && !tok.endsWith('—')) {
        const parts = tok.split('—');
        parts.forEach((pt, idx) => {
          if (idx < parts.length - 1) words.push(pt + '—');
          else if (pt) words.push(pt);
        });
      } else {
        words.push(tok);
      }
    }
    const dur = Math.max(0.05, end - start);
    const step = dur / Math.max(1, words.length);
    return words.map((w, i) => ({
      word: w,
      start: start + i * step,
      end: start + (i + 1) * step,
    }));
  }

  function splitWordsIntoPages(words, maxWords = 6, maxChars = 42) {
    if (!words || words.length === 0) return [];
    const pages = [];
    let buf = [];
    let charCount = 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wLen = w.word.length + (buf.length > 0 ? 1 : 0);
      if (buf.length > 0 && (buf.length >= maxWords || charCount + wLen > maxChars)) {
        pages.push({
          start: buf[0].start,
          end: w.start,
          words: buf,
        });
        buf = [w];
        charCount = w.word.length;
      } else {
        buf.push(w);
        charCount += wLen;
      }
    }
    if (buf.length > 0) {
      pages.push({
        start: buf[0].start,
        end: buf[buf.length - 1].end,
        words: buf,
      });
    }
    return pages;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function drawRoundedRect(c, x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    c.beginPath();
    c.moveTo(x + rad, y);
    c.lineTo(x + w - rad, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rad);
    c.lineTo(x + w, y + h - rad);
    c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    c.lineTo(x + rad, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rad);
    c.lineTo(x, y + rad);
    c.quadraticCurveTo(x, y, x + rad, y);
    c.closePath();
  }

  function getActiveSubtitlePage(t) {
    for (let i = 0; i < subtitlePages.length; i++) {
      const p = subtitlePages[i];
      if (t >= p.start - 0.03 && t <= p.end + 0.08) {
        return p;
      }
    }
    return null;
  }

  function getFlashAlpha(t) {
    let alpha = 0;
    for (let i = 0; i < sfxEvents.length; i++) {
      const ev = sfxEvents[i];
      const dt = t - ev.time;
      if (dt >= 0 && dt < 0.28) {
        let strength = 0;
        if (ev.type === 'camera_flash') strength = 0.72;
        else if (ev.type === 'sonic_boom' || ev.type === 'pile_slam') strength = 0.34;
        else if (ev.type === 'vine_boom' || ev.type === 'quake_rumble') strength = 0.24;
        if (strength > 0) {
          alpha = Math.max(alpha, strength * Math.exp(-dt * 12.5));
        }
      }
    }
    return clamp01(alpha);
  }

  function wrapLinesForWidth(c, words, maxLinePx) {
    const lines = [];
    let current = [];
    let currentPx = 0;

    c.font = '900 52px "DejaVu Sans", sans-serif';
    const spacePx = c.measureText(' ').width * 1.25;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const noSpaceBefore = i > 0 && words[i - 1].word.endsWith('—');
      const wPx = c.measureText(w.word).width;
      const addPx = (current.length > 0 && !noSpaceBefore ? spacePx : 0) + wPx;

      if (current.length > 0 && currentPx + addPx > maxLinePx && !noSpaceBefore) {
        lines.push(current);
        current = [w];
        currentPx = wPx;
      } else {
        current.push({ ...w, noSpaceBefore });
        currentPx += addPx;
      }
    }
    if (current.length > 0) lines.push(current);
    return lines;
  }

  let vigCanvas = null;
  if (typeof document !== 'undefined') {
    vigCanvas = document.createElement('canvas');
    vigCanvas.width = width;
    vigCanvas.height = height;
    const vctx = vigCanvas.getContext('2d');
    const vig = vctx.createRadialGradient(width * 0.5, height * 0.46, height * 0.26, width * 0.5, height * 0.5, height * 0.68);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.75, 'rgba(6,10,20,0.12)');
    vig.addColorStop(1, 'rgba(4,7,14,0.46)');
    vctx.fillStyle = vig;
    vctx.fillRect(0, 0, width, height);
  }
  const barGrad = ctx ? (() => {
    const g = ctx.createLinearGradient(0, 0, width, 0);
    g.addColorStop(0, '#FFD93D');
    g.addColorStop(0.55, '#5CE1E6');
    g.addColorStop(1, '#FF9E64');
    return g;
  })() : null;

  function draw(t, hudState = {}) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // 1. Subtle cinema vignette (pre-baked 1080x1920 layer)
    if (vigCanvas) {
      ctx.drawImage(vigCanvas, 0, 0);
    }

    // 2. Impact flash overlay
    const flash = Math.max(getFlashAlpha(t), hudState.flashAlpha || 0);
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(255, 250, 232, ${flash.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }

    // 3. Top progress bar
    const prog = clamp01(t / duration);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, 0, width, 9);
    ctx.fillStyle = barGrad || '#FFD93D';
    ctx.fillRect(0, 0, width * prog, 9);

    // 4. Top Hook Banner (0.0s .. 3.25s)
    if (t <= 3.25) {
      const fadeIn = clamp01(t / 0.22);
      const fadeOut = t > 2.75 ? clamp01(1 - (t - 2.75) / 0.50) : 1.0;
      const alpha = fadeIn * fadeOut;
      const slideY = (1 - fadeIn) * -28;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(0, slideY);

      // Pill badge
      ctx.font = '800 28px "DejaVu Sans", sans-serif';
      const badgeText = `${hookEmoji ? hookEmoji + ' ' : ''}${hookBadge}`;
      const badgeW = Math.min(760, ctx.measureText(badgeText).width + 58);
      const badgeX = (width - badgeW) * 0.5;
      const badgeY = 44;

      drawRoundedRect(ctx, badgeX, badgeY, badgeW, 54, 27);
      ctx.fillStyle = 'rgba(11, 18, 34, 0.84)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFD93D';
      ctx.stroke();

      ctx.fillStyle = '#FFD93D';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, width * 0.5, badgeY + 28);

      // Bold Hook Title
      ctx.font = '900 50px "DejaVu Sans", sans-serif';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 11;
      ctx.strokeStyle = '#070B14';
      ctx.strokeText(hookTitle, width * 0.5, 146);
      ctx.fillStyle = '#FFF9E8';
      ctx.fillText(hookTitle, width * 0.5, 146);

      ctx.restore();
    }

    // 5. Subtitle Card + Karaoke Word Highlighting
    const page = getActiveSubtitlePage(t);
    if (page) {
      const spkCfg = speakersCfg[page.speaker] || { label: String(page.speaker || '').toUpperCase(), color: '#FFD93D' };
      const lines = wrapLinesForWidth(ctx, page.words, 880);
      const lineH = 66;
      const baseCenterY = lines.length === 1 ? 1605 : 1575;

      // Speaker Badge above caption
      ctx.save();
      ctx.font = '800 26px "DejaVu Sans", sans-serif';
      const spkText = spkCfg.label;
      const spkW = ctx.measureText(spkText).width + 44;
      const spkX = (width - spkW) * 0.5;
      const spkY = baseCenterY - 82;

      drawRoundedRect(ctx, spkX, spkY, spkW, 44, 22);
      ctx.fillStyle = 'rgba(8, 13, 25, 0.88)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = spkCfg.color;
      ctx.stroke();

      ctx.fillStyle = spkCfg.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(spkText, width * 0.5, spkY + 23);

      // Draw each wrapped line with dual-stroke and active word pop
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.font = '900 52px "DejaVu Sans", sans-serif';
      const spacePx = ctx.measureText(' ').width * 1.25;

      for (let li = 0; li < lines.length; li++) {
        const lineWords = lines[li];
        const y = baseCenterY + li * lineH;

        let totalPx = 0;
        const widths = lineWords.map((w, wi) => {
          const wp = ctx.measureText(w.word).width;
          totalPx += wp + (wi > 0 && !w.noSpaceBefore ? spacePx : 0);
          return wp;
        });

        let x = (width - totalPx) * 0.5;
        for (let wi = 0; wi < lineWords.length; wi++) {
          const w = lineWords[wi];
          const wp = widths[wi];
          if (wi > 0 && !w.noSpaceBefore) x += spacePx;

          const isActive = t >= w.start - 0.02 && t <= w.end + 0.04;
          const isSpoken = t > w.end + 0.04;

          ctx.save();
          const cx = x + wp * 0.5;
          ctx.translate(cx, y);
          if (isActive) {
            ctx.scale(1.06, 1.06);
          }

          ctx.lineWidth = 12;
          ctx.strokeStyle = '#070B14';
          ctx.strokeText(w.word, -wp * 0.5, 0);

          if (isActive) {
            ctx.shadowColor = 'rgba(255, 217, 61, 0.55)';
            ctx.shadowBlur = 14;
            ctx.fillStyle = '#FFD93D';
          } else if (isSpoken) {
            ctx.fillStyle = '#D5E2F5';
          } else {
            ctx.fillStyle = '#FFFFFF';
          }
          ctx.fillText(w.word, -wp * 0.5, 0);
          ctx.restore();

          x += wp;
        }
      }
      ctx.restore();
    }

    // 6. Optional outro pill badge in Beat 6 (26.2 .. 30.0)
    if (t >= 26.2) {
      const a = clamp01((t - 26.2) / 0.35);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '800 24px "DejaVu Sans", sans-serif';
      const cta = 'SUBSCRIBE FOR THE NEXT WONDER ✨';
      const w = ctx.measureText(cta).width + 50;
      drawRoundedRect(ctx, (width - w) * 0.5, 1732, w, 46, 23);
      ctx.fillStyle = 'rgba(255, 217, 61, 0.94)';
      ctx.fill();
      ctx.fillStyle = '#090D16';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cta, width * 0.5, 1756);
      ctx.restore();
    }
  }

  return {
    canvas,
    draw,
    getActiveSubtitlePage,
    subtitlePages,
  };
}

export function createFrameCompositor(webglCanvas, hudCanvas, width = 1080, height = 1920) {
  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const ctx = compCanvas.getContext('2d', { alpha: false });

  function composite() {
    ctx.drawImage(webglCanvas, 0, 0, width, height);
    if (hudCanvas) {
      ctx.drawImage(hudCanvas, 0, 0, width, height);
    }
    return compCanvas;
  }

  return { canvas: compCanvas, composite };
}
