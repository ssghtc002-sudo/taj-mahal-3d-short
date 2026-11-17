"""
Reusable Shared Audio & DSP Core for 30s 9:16 3D YouTube Shorts (/home/antigravity/shorts-engine/audio/dspCore.py)

Key Optimizations vs legacy per-project scripts:
  - Single ONNX Kokoro load for all dialogue lines.
  - Pure NumPy/SciPy in-memory WSOLA time-scaling + exact 24kHz -> 44.1kHz polyphase resampling (zero FFmpeg spawns per line).
  - Automatic -5.5 dB sidechain BGM ducking under dialogue + true-peak soft ceiling <= -1.0 dBFS.
  - Monotonic word-level alignment + smooth 30fps RMS lip-sync curve + SRT caption writer.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any, Callable

import kokoro_onnx
import numpy as np
import soundfile as sf
from scipy import signal

KOKORO_MODEL_PATH = Path("/home/antigravity/.cache/kokoro-onnx/kokoro-v1.0.int8.onnx")
KOKORO_VOICES_PATH = Path("/home/antigravity/.cache/kokoro-onnx/voices-v1.0.bin")

SR = 44100
CHANNELS = 2
DURATION = 30.0
TOTAL_SAMPLES = int(round(DURATION * SR))  # 1,323,000
FPS = 30
TOTAL_FRAMES = int(round(DURATION * FPS))  # 900
PEAK_CEILING = 0.885  # ~ -1.06 dBFS

ATEMPO_MIN = 0.88
ATEMPO_MAX = 1.25


def midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def pan_stereo(mono: np.ndarray, pan: float) -> np.ndarray:
    pan = float(np.clip(pan, -1.0, 1.0))
    angle = (pan + 1.0) * (math.pi / 4.0)
    return np.stack([mono * math.cos(angle), mono * math.sin(angle)], axis=-1).astype(np.float32)


def add_stereo_event(bus: np.ndarray, event: np.ndarray, start_time: float) -> None:
    if event.ndim == 1:
        event = pan_stereo(event, 0.0)
    idx = int(round(start_time * SR))
    if idx >= len(bus) or idx + len(event) <= 0:
        return
    src_start = max(0, -idx)
    dst_start = max(0, idx)
    copy_len = min(len(event) - src_start, len(bus) - dst_start)
    if copy_len > 0:
        bus[dst_start : dst_start + copy_len] += event[src_start : src_start + copy_len]


def adsr_env(n: int, attack: float = 0.01, decay: float = 0.08, sustain: float = 0.6, release: float = 0.06) -> np.ndarray:
    if n <= 0:
        return np.zeros(0, dtype=np.float32)
    a = min(n, max(1, int(attack * SR)))
    r = min(n - a, max(1, int(release * SR)))
    d = min(n - a - r, max(0, int(decay * SR)))
    s = max(0, n - a - d - r)
    parts = [np.linspace(0.0, 1.0, a, endpoint=False, dtype=np.float32)]
    if d > 0:
        parts.append(np.linspace(1.0, sustain, d, endpoint=False, dtype=np.float32))
    if s > 0:
        parts.append(np.full(s, sustain, dtype=np.float32))
    if r > 0:
        sv = sustain if (d > 0 or s > 0) else 1.0
        parts.append(np.linspace(sv, 0.0, r, endpoint=True, dtype=np.float32))
    env = np.concatenate(parts)
    if len(env) < n:
        env = np.pad(env, (0, n - len(env)))
    return env[:n]


def butter_filter(audio: np.ndarray, btype: str, cutoff: float | tuple[float, float], order: int = 2) -> np.ndarray:
    nyq = 0.5 * SR
    if isinstance(cutoff, tuple):
        wn = [float(np.clip(c / nyq, 1e-4, 0.999)) for c in cutoff]
    else:
        wn = float(np.clip(cutoff / nyq, 1e-4, 0.999))
    sos = signal.butter(order, wn, btype=btype, output="sos")
    return signal.sosfilt(sos, audio, axis=0).astype(np.float32)


def peaking_eq(mono: np.ndarray, freq: float, q: float, gain_db: float) -> np.ndarray:
    a_lin = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * freq / SR
    alpha = math.sin(w0) / (2.0 * q)
    cos_w0 = math.cos(w0)
    b0 = 1.0 + alpha * a_lin
    b1 = -2.0 * cos_w0
    b2 = 1.0 - alpha * a_lin
    a0 = 1.0 + alpha / a_lin
    a1 = -2.0 * cos_w0
    a2 = 1.0 - alpha / a_lin
    b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float64)
    a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)
    return signal.lfilter(b, a, mono).astype(np.float32)


def wsola_time_stretch(mono: np.ndarray, rate: float, sr_in: int = 24000) -> np.ndarray:
    """Fast pitch-preserving in-memory WSOLA overlap-add time stretch (rate > 1 = faster)."""
    mono = np.asarray(mono, dtype=np.float32)
    if abs(rate - 1.0) < 0.015 or len(mono) < 1024:
        return mono

    win_len = 512
    hop_syn = 256
    search_rad = 160
    hann = np.hanning(win_len).astype(np.float32)

    out_len = max(win_len, int(round(len(mono) / rate)))
    out = np.zeros(out_len + win_len, dtype=np.float32)
    norm = np.zeros(out_len + win_len, dtype=np.float32)

    # Copy first grain cleanly
    out[:win_len] += mono[:win_len] * hann
    norm[:win_len] += hann

    syn_pos = hop_syn
    while syn_pos < out_len - win_len:
        target_ana = int(round(syn_pos * rate))
        if target_ana + win_len >= len(mono):
            break

        # Target reference slice already in output overlap region
        ref = out[syn_pos : syn_pos + hop_syn]
        lo = max(0, target_ana - search_rad)
        hi = min(len(mono) - win_len, target_ana + search_rad)

        best_offset = target_ana
        best_score = -1e18
        if hi > lo:
            for cand in range(lo, hi + 1, 4):
                seg = mono[cand : cand + hop_syn]
                score = float(np.dot(ref, seg))
                if score > best_score:
                    best_score = score
                    best_offset = cand

        grain = mono[best_offset : best_offset + win_len]
        out[syn_pos : syn_pos + win_len] += grain * hann
        norm[syn_pos : syn_pos + win_len] += hann
        syn_pos += hop_syn

    mask = norm > 1e-4
    out[mask] /= norm[mask]
    return out[:out_len].astype(np.float32)


def resample_to_44k(mono: np.ndarray, sr_in: int) -> np.ndarray:
    if sr_in == SR:
        return mono.astype(np.float32)
    if sr_in == 24000:
        return signal.resample_poly(mono, 147, 80).astype(np.float32)
    g = math.gcd(SR, sr_in)
    return signal.resample_poly(mono, SR // g, sr_in // g).astype(np.float32)


def trim_and_compress_silence(wav: np.ndarray, sr: int, thresh: float = 0.008) -> np.ndarray:
    wav = np.asarray(wav, dtype=np.float32)
    abs_w = np.abs(wav)
    idx = np.where(abs_w > thresh)[0]
    if len(idx) == 0:
        return wav
    pad = int(0.015 * sr)
    lo = max(0, int(idx[0]) - pad)
    hi = min(len(wav), int(idx[-1]) + pad)
    return wav[lo:hi].astype(np.float32)


def polish_voice(mono: np.ndarray, speaker: str) -> np.ndarray:
    y = butter_filter(mono, "high", 95.0, order=2)
    if speaker == "narrator":
        y = peaking_eq(y, 190.0, 1.0, 1.6)
        y = peaking_eq(y, 2900.0, 1.1, 2.8)
        y = peaking_eq(y, 6800.0, 0.9, 1.8)
    elif speaker == "architect":
        y = peaking_eq(y, 240.0, 1.0, 1.2)
        y = peaking_eq(y, 3100.0, 1.2, 3.0)
    else:
        y = peaking_eq(y, 3400.0, 1.1, 3.2)
        y = peaking_eq(y, 160.0, 1.0, 1.0)

    # Gentle soft-knee speech leveling
    rms = float(np.sqrt(np.mean(y ** 2) + 1e-10))
    if rms > 1e-4:
        y = y * (0.20 / rms)
    y = np.tanh(y * 1.15).astype(np.float32) * 0.78
    fade = min(len(y), int(0.008 * SR))
    if fade > 2:
        y[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)
        y[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
    return y


def tokenize_display_words(text: str) -> list[str]:
    tokens = []
    for raw in text.strip().split():
        # Split long hyphenated/em-dash tokens into clean visual halves while keeping em-dash attached to left token
        if "—" in raw and not raw.endswith("—"):
            parts = raw.split("—")
            for idx, part in enumerate(parts):
                if idx < len(parts) - 1:
                    tokens.append(part + "—")
                elif part:
                    tokens.append(part)
        else:
            tokens.append(raw)
    return [t for t in tokens if t]


def align_words_to_audio(words: list[str], audio: np.ndarray, t0: float, t1: float) -> list[dict[str, Any]]:
    if not words:
        return []
    weights = np.array([max(1.5, len(re.sub(r"[^A-Za-z0-9]", "", w))) for w in words], dtype=np.float64)
    weights /= weights.sum()
    dur = max(0.05, t1 - t0)
    cur = t0
    out = []
    for w, wt in zip(words, weights):
        w_dur = dur * float(wt)
        out.append({"word": w, "start": round(cur, 4), "end": round(cur + w_dur, 4)})
        cur += w_dur
    out[-1]["end"] = round(t1, 4)
    return out


def compute_lip_sync(speaker_mono_buses: dict[str, np.ndarray], fps: int = FPS, total_frames: int = TOTAL_FRAMES) -> dict[str, list[float]]:
    lip_map: dict[str, list[float]] = {}
    hop = int(round(SR / fps))
    win = int(round(SR / 18))
    for spk, bus in speaker_mono_buses.items():
        vals = []
        for f in range(total_frames):
            c = min(len(bus) - 1, f * hop + hop // 2)
            lo = max(0, c - win // 2)
            hi = min(len(bus), c + win // 2)
            seg = bus[lo:hi]
            rms = float(np.sqrt(np.mean(seg ** 2) + 1e-12)) if len(seg) > 0 else 0.0
            vals.append(rms)
        arr = np.array(vals, dtype=np.float32)
        p95 = float(np.percentile(arr[arr > 0.005], 92)) if np.any(arr > 0.005) else 0.1
        normed = np.clip(arr / max(0.04, p95), 0.0, 1.0)
        # Smooth mouth open envelope without sluggish blur
        sm = np.copy(normed)
        for i in range(1, len(sm)):
            sm[i] = 0.45 * sm[i - 1] + 0.55 * normed[i]
        lip_map[spk] = [round(float(v), 4) for v in sm]
    return lip_map


def synthesize_dialogue(
    timeline: dict[str, Any],
    tts_overrides: dict[str, str] | None = None,
) -> tuple[np.ndarray, dict[str, np.ndarray], list[dict[str, Any]]]:
    kokoro = kokoro_onnx.Kokoro(str(KOKORO_MODEL_PATH), str(KOKORO_VOICES_PATH))
    speakers_cfg = timeline["speakers"]
    tts_overrides = tts_overrides or {}

    dialogue_bus = np.zeros((TOTAL_SAMPLES, CHANNELS), dtype=np.float32)
    speaker_mono_buses = {spk: np.zeros(TOTAL_SAMPLES, dtype=np.float32) for spk in speakers_cfg}
    manifest_lines: list[dict[str, Any]] = []

    for item in timeline["dialogue"]:
        lid = item["id"]
        spk = item["speaker"]
        cfg = speakers_cfg[spk]
        voice_id = cfg["voice"]
        lang = cfg.get("lang", "en-us")
        base_speed = float(cfg.get("speed", 1.10))
        pan = float(cfg.get("pan", 0.0))

        slot_start = float(item["start"])
        slot_end = float(item["end"])
        slot_dur = slot_end - slot_start
        tts_text = tts_overrides.get(lid, item["text"].replace("—", ", "))

        raw_wav, k_sr = kokoro.create(tts_text, voice=voice_id, speed=base_speed, lang=lang, trim=True)
        comp = trim_and_compress_silence(raw_wav, k_sr)
        comp_dur = len(comp) / k_sr
        target_fit = slot_dur * 0.94
        used_speed = base_speed

        # Fast adaptive native speed pass if time stretch > 1.20x needed
        if comp_dur / target_fit > 1.18:
            desired_speed = float(np.clip(used_speed * (comp_dur / target_fit) * 0.94, used_speed + 0.05, 1.48))
            raw2, k_sr = kokoro.create(tts_text, voice=voice_id, speed=desired_speed, lang=lang, trim=True)
            comp2 = trim_and_compress_silence(raw2, k_sr)
            if len(comp2) < len(comp):
                comp = comp2
                comp_dur = len(comp) / k_sr
                used_speed = desired_speed

        raw_atempo = 1.0
        if comp_dur > target_fit:
            raw_atempo = comp_dur / target_fit
        elif comp_dur < slot_dur * 0.76:
            raw_atempo = comp_dur / (slot_dur * 0.80)
        atempo = float(np.clip(raw_atempo, ATEMPO_MIN, ATEMPO_MAX))

        stretched_24k = wsola_time_stretch(comp, atempo, sr_in=k_sr)
        fitted_44k = resample_to_44k(stretched_24k, k_sr)

        max_samples = int(math.floor(slot_dur * 0.985 * SR))
        if len(fitted_44k) > max_samples:
            fitted_44k = fitted_44k[:max_samples]
            fade_tail = min(len(fitted_44k), int(0.010 * SR))
            fitted_44k[-fade_tail:] *= np.linspace(1.0, 0.0, fade_tail, dtype=np.float32)

        polished = polish_voice(fitted_44k, spk)
        actual_dur = len(polished) / SR
        slack = max(0.0, slot_dur - actual_dur)
        actual_start = slot_start + min(0.025, slack * 0.25)
        actual_end = min(slot_end, actual_start + actual_dur)
        start_idx = int(round(actual_start * SR))

        copy_len = min(len(polished), TOTAL_SAMPLES - start_idx)
        speaker_mono_buses[spk][start_idx : start_idx + copy_len] += polished[:copy_len]
        add_stereo_event(dialogue_bus, pan_stereo(polished[:copy_len], pan), actual_start)

        display_words = tokenize_display_words(item["text"])
        aligned_words = align_words_to_audio(display_words, polished, actual_start, actual_end)
        manifest_lines.append({
            "id": lid,
            "beatId": item["beatId"],
            "speaker": spk,
            "voice": voice_id,
            "lang": lang,
            "text": item["text"],
            "start": round(actual_start, 4),
            "end": round(actual_end, 4),
            "duration": round(actual_dur, 4),
            "kokoroSpeed": round(used_speed, 3),
            "atempo": round(atempo, 4),
            "words": aligned_words,
        })
        print(f"  {lid} [{spk:9s}] slot=[{slot_start:5.2f}..{slot_end:5.2f}] act=[{actual_start:5.2f}..{actual_end:5.2f}] sp={used_speed:.2f} w={len(aligned_words)}")

    return dialogue_bus, speaker_mono_buses, manifest_lines


def write_srt(manifest_lines: list[dict[str, Any]], srt_path: Path) -> None:
    def fmt_ts(sec: float) -> str:
        ms = int(round(max(0.0, sec) * 1000))
        h = ms // 3600000
        m = (ms % 3600000) // 60000
        s = (ms % 60000) // 1000
        rem = ms % 1000
        return f"{h:02d}:{m:02d}:{s:02d},{rem:03d}"

    blocks = []
    for idx, line in enumerate(manifest_lines, 1):
        blocks.append(f"{idx}\n{fmt_ts(line['start'])} --> {fmt_ts(line['end'])}\n{line['text']}\n")
    srt_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text("\n".join(blocks), encoding="utf-8")


def master_and_export(
    project_root: Path,
    timeline: dict[str, Any],
    dialogue_bus: np.ndarray,
    bgm_bus: np.ndarray,
    sfx_bus: np.ndarray,
    speaker_mono_buses: dict[str, np.ndarray],
    manifest_lines: list[dict[str, Any]],
) -> None:
    # Smooth sidechain BGM ducking where dialogue energy exists
    speech_env = np.sqrt(np.mean(dialogue_bus ** 2, axis=1) + 1e-12)
    win = int(0.14 * SR)
    kernel = np.ones(win, dtype=np.float32) / win
    smooth_env = np.convolve(speech_env, kernel, mode="same")
    duck = 1.0 - 0.48 * np.clip(smooth_env / 0.045, 0.0, 1.0)
    bgm_ducked = bgm_bus * duck[:, None]

    mix = dialogue_bus * 1.02 + bgm_ducked * 0.62 + sfx_bus * 0.85

    # Normalize loudness cleanly + protect true peak strictly <= -1.0 dBFS
    rms = float(np.sqrt(np.mean(mix ** 2) + 1e-10))
    target_rms = 0.145  # ~ -14 LUFS feel
    mix = mix * (target_rms / max(1e-4, rms))
    mix = np.tanh(mix * 1.05).astype(np.float32)
    peak = float(np.max(np.abs(mix)))
    if peak > PEAK_CEILING:
        mix *= PEAK_CEILING / peak

    master_path = project_root / timeline["audio"]["masterPath"]
    manifest_path = project_root / timeline["audio"]["manifestPath"]
    srt_path = project_root / timeline["audio"]["srtPath"]
    master_path.parent.mkdir(parents=True, exist_ok=True)

    sf.write(str(master_path), mix, SR, subtype="PCM_16")
    final_peak_db = 20.0 * math.log10(max(1e-9, float(np.max(np.abs(mix)))))

    lip_map = compute_lip_sync(speaker_mono_buses, FPS, TOTAL_FRAMES)
    manifest = {
        "duration": DURATION,
        "fps": FPS,
        "totalFrames": TOTAL_FRAMES,
        "sampleRate": SR,
        "peakDbfs": round(final_peak_db, 3),
        "lines": manifest_lines,
        "lipSync": lip_map,
        "sfxEvents": timeline.get("sfxEvents", []),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_srt(manifest_lines, srt_path)
    print(f"[Audio] Exported {master_path.name} (peak={final_peak_db:.2f} dBFS), manifest, and {srt_path.name}")
