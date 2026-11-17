"""
Taj Mahal Audio & Cultural BGM Generator (/home/antigravity/taj-mahal-3d-short/audio/generate_audio.py)
Combines shared Kokoro DSP Core with custom Mughal Indian Cinema Score (Tanpura + Bansuri + Santoor + Tabla)
and 19 crisp Foley SFX.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from dspCore import (
    CHANNELS,
    DURATION,
    SR,
    TOTAL_SAMPLES,
    add_stereo_event,
    adsr_env,
    butter_filter,
    master_and_export,
    midi_to_hz,
    pan_stereo,
    synthesize_dialogue,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TIMELINE_PATH = PROJECT_ROOT / "config" / "timeline.json"


def synth_bansuri_note(freq: float, dur: float, gain: float = 0.20) -> np.ndarray:
    n = int(round(dur * SR))
    if n <= 0:
        return np.zeros(0, dtype=np.float32)
    t = np.linspace(0.0, dur, n, endpoint=False, dtype=np.float32)
    vib = 1.0 + 0.0045 * np.sin(2.0 * math.pi * 5.2 * t) * np.clip(t / 0.14, 0.0, 1.0)
    phase = 2.0 * math.pi * freq * np.cumsum(vib) / SR
    tone = 0.72 * np.sin(phase) + 0.20 * np.sin(phase * 2.0) + 0.06 * np.sin(phase * 3.0)
    breath = butter_filter(np.random.randn(n).astype(np.float32) * 0.055, "band", (900.0, 3200.0), order=2)
    env = adsr_env(n, attack=0.055, decay=0.10, sustain=0.72, release=0.09)
    return ((tone + breath) * env * gain).astype(np.float32)


def synth_santoor_pluck(freq: float, dur: float, gain: float = 0.22) -> np.ndarray:
    n = int(round(dur * SR))
    if n <= 0:
        return np.zeros(0, dtype=np.float32)
    t = np.linspace(0.0, dur, n, endpoint=False, dtype=np.float32)
    sig = (
        0.55 * np.sin(2.0 * math.pi * freq * t)
        + 0.28 * np.sin(2.0 * math.pi * freq * 2.002 * t) * np.exp(-t * 5.5)
        + 0.15 * np.sin(2.0 * math.pi * freq * 3.005 * t) * np.exp(-t * 9.0)
    )
    env = np.exp(-t * 4.2) * np.clip(t / 0.004, 0.0, 1.0)
    return (sig * env * gain).astype(np.float32)


def synth_tabla_bayan(dur: float = 0.36, gain: float = 0.42) -> np.ndarray:
    n = int(round(dur * SR))
    t = np.linspace(0.0, dur, n, endpoint=False, dtype=np.float32)
    f = 98.0 * (0.64 ** np.clip(t / 0.18, 0.0, 1.0)) + 4.0 * np.sin(2.0 * math.pi * 12.0 * t)
    ph = 2.0 * math.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.8)
    click = np.sin(2.0 * math.pi * 240.0 * t) * np.exp(-t * 48.0) * 0.22
    return ((body + click) * gain).astype(np.float32)


def synth_tabla_dayan(accent: bool = False, gain: float = 0.26) -> np.ndarray:
    dur = 0.16
    n = int(round(dur * SR))
    t = np.linspace(0.0, dur, n, endpoint=False, dtype=np.float32)
    ring = (np.sin(2.0 * math.pi * (330.0 if accent else 295.0) * t) * 0.55 + np.sin(2.0 * math.pi * 640.0 * t) * 0.25) * np.exp(-t * 24.0)
    snap = butter_filter(np.random.randn(n).astype(np.float32), "band", (1400.0, 5200.0), order=2) * np.exp(-t * 55.0) * 0.45
    return ((ring + snap) * gain).astype(np.float32)


def generate_bgm() -> np.ndarray:
    np.random.seed(1632)
    bgm = np.zeros((TOTAL_SAMPLES, CHANNELS), dtype=np.float32)
    t_all = np.linspace(0.0, DURATION, TOTAL_SAMPLES, endpoint=False, dtype=np.float32)

    # 1. Warm Tanpura Drone (C2=65.41, G2=98.00, C3=130.81) with breathing filter swell
    sa = np.sin(2.0 * math.pi * 65.41 * t_all) * 0.45
    pa = np.sin(2.0 * math.pi * 98.00 * t_all + 0.3 * np.sin(2.0 * math.pi * 0.25 * t_all)) * 0.34
    sa_hi = np.sin(2.0 * math.pi * 130.81 * t_all) * 0.22
    jawari = np.sin(2.0 * math.pi * 196.00 * t_all) * (0.08 + 0.04 * np.sin(2.0 * math.pi * 0.65 * t_all))
    drone_mono = (sa + pa + sa_hi + jawari) * 0.14
    drone_l = drone_mono * (0.95 + 0.05 * np.sin(2.0 * math.pi * 0.18 * t_all))
    drone_r = drone_mono * (0.95 - 0.05 * np.sin(2.0 * math.pi * 0.18 * t_all))
    bgm[:, 0] += drone_l
    bgm[:, 1] += drone_r

    # 2. Raag Yaman/Bhupali Santoor Arpeggios on 0.25s grid (120 BPM)
    # C-major pentatonic with luminous raised 4th F# touches in Beats 5-6
    scale_main = [60, 62, 64, 67, 69, 72, 74, 76]
    scale_suspense = [60, 61, 64, 66, 67, 72, 73, 76]
    step = 0.25
    cur = 0.0
    step_idx = 0
    while cur < DURATION - 0.25:
        is_quake = 15.0 <= cur < 20.5
        sc = scale_suspense if is_quake else scale_main
        pattern = [0, 2, 3, 5, 4, 3, 2, 1]
        note_midi = sc[pattern[step_idx % len(pattern)]]
        freq = midi_to_hz(note_midi)
        g = 0.10 if is_quake else (0.17 if cur >= 20.8 else 0.14)
        pan = -0.30 if (step_idx % 2 == 0) else 0.30
        add_stereo_event(bgm, pan_stereo(synth_santoor_pluck(freq, 0.55, gain=g), pan), cur)
        cur += step
        step_idx += 1

    # 3. Expressive Bansuri Flute Heroic Phrases (synced to Beat energy)
    flute_phrases = [
        # Beat 1 Hook (heroic call)
        (0.25, 72, 0.45, 0.18), (0.72, 76, 0.40, 0.18), (1.15, 79, 0.65, 0.21), (2.40, 74, 0.50, 0.16),
        # Beat 2 River Engineering
        (3.80, 67, 0.48, 0.16), (4.35, 72, 0.52, 0.17), (5.90, 74, 0.45, 0.18), (6.45, 76, 0.60, 0.20),
        # Beat 3 Marble Dome Montages (soaring)
        (8.45, 72, 0.40, 0.18), (8.90, 74, 0.40, 0.19), (9.35, 76, 0.55, 0.21), (10.0, 79, 0.85, 0.23),
        (11.6, 81, 0.55, 0.22), (12.2, 84, 0.90, 0.24), (13.3, 79, 0.70, 0.20),
        # Beat 4 Leaning Minarets (tense shimmer)
        (15.3, 73, 0.55, 0.15), (16.1, 72, 0.65, 0.15), (18.2, 78, 0.60, 0.17), (19.0, 79, 0.85, 0.21),
        # Beat 5 Sunset -> Moonlight Luminous Theme
        (21.0, 76, 0.65, 0.21), (21.75, 79, 0.65, 0.22), (22.5, 84, 0.95, 0.24),
        (23.6, 83, 0.55, 0.20), (24.25, 79, 0.75, 0.21),
        # Beat 6 Charbagh Finale Celebration
        (26.1, 72, 0.42, 0.21), (26.55, 76, 0.42, 0.22), (27.0, 79, 0.52, 0.24),
        (27.6, 84, 1.35, 0.26), (29.0, 84, 0.85, 0.18),
    ]
    for st, midi, dur, gain in flute_phrases:
        add_stereo_event(bgm, pan_stereo(synth_bansuri_note(midi_to_hz(midi), dur, gain=gain), -0.18), st)

    # 4. Crisp Tabla / Dholak Groove (500ms beat pulse)
    beat = 0.0
    b_idx = 0
    while beat < DURATION - 0.35:
        if not (15.0 <= beat < 17.6):
            if b_idx % 2 == 0:
                add_stereo_event(bgm, pan_stereo(synth_tabla_bayan(0.32, gain=0.34 if beat >= 25.8 else 0.26), -0.06), beat)
            add_stereo_event(bgm, pan_stereo(synth_tabla_dayan(accent=(b_idx % 4 == 0), gain=0.22), 0.12), beat)
            add_stereo_event(bgm, pan_stereo(synth_tabla_dayan(accent=False, gain=0.14), 0.16), beat + 0.25)
        beat += 0.50
        b_idx += 1

    # Soft master fade-in and clean 0.4s tail fade
    fade_in = int(0.18 * SR)
    fade_out = int(0.45 * SR)
    bgm[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)[:, None]
    bgm[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)[:, None]
    return bgm


def synth_sfx(sfx_type: str) -> np.ndarray:
    if sfx_type == "vine_boom":
        dur = 0.85
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        f = 130.0 * (0.28 ** np.clip(t / 0.25, 0.0, 1.0)) + 28.0
        sub = np.sin(2.0 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 4.5)
        hit = np.random.randn(n).astype(np.float32) * np.exp(-t * 32.0) * 0.28
        return np.tanh((sub * 0.95 + hit) * 1.4).astype(np.float32)

    if sfx_type in ("whoosh", "wind_shred"):
        dur = 0.55
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        env = np.sin(math.pi * t / dur) ** 1.4
        noise = np.random.randn(n).astype(np.float32)
        filt = butter_filter(noise, "band", (450.0, 2900.0 if sfx_type == "whoosh" else 4200.0), order=2)
        return (filt * env * 0.55).astype(np.float32)

    if sfx_type == "boing":
        dur = 0.50
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        f = 220.0 + 340.0 * np.exp(-t * 4.5) * np.sin(2.0 * math.pi * 9.0 * t)
        return (np.sin(2.0 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 5.2) * 0.55).astype(np.float32)

    if sfx_type == "splash_mud":
        dur = 0.62
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        noise = butter_filter(np.random.randn(n).astype(np.float32), "band", (220.0, 2600.0), order=2)
        bubbles = np.sin(2.0 * math.pi * (240.0 + 480.0 * t) * t) * np.exp(-t * 8.0) * 0.25
        return ((noise * np.exp(-t * 6.5) * 0.72) + bubbles).astype(np.float32)

    if sfx_type == "pile_slam":
        dur = 0.65
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        f = 160.0 * (0.25 ** np.clip(t / 0.14, 0.0, 1.0)) + 34.0
        thud = np.sin(2.0 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 6.2)
        wood = butter_filter(np.random.randn(n).astype(np.float32), "band", (300.0, 1500.0), order=2) * np.exp(-t * 22.0) * 0.55
        return np.tanh((thud + wood) * 1.35).astype(np.float32) * 0.85

    if sfx_type in ("chisel_chime", "clank_marble"):
        dur = 0.55
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        f1 = 1180.0 if sfx_type == "chisel_chime" else 680.0
        ring = (np.sin(2.0 * math.pi * f1 * t) * 0.55 + np.sin(2.0 * math.pi * (f1 * 1.48) * t) * 0.30) * np.exp(-t * 11.0)
        return (ring * 0.65).astype(np.float32)

    if sfx_type == "pulley_ratchet":
        dur = 0.90
        n = int(dur * SR)
        out = np.zeros(n, dtype=np.float32)
        for idx in range(7):
            st = int((idx * 0.11) * SR)
            c_len = int(0.04 * SR)
            tt = np.linspace(0, 0.04, c_len, endpoint=False, dtype=np.float32)
            clk = (np.sin(2.0 * math.pi * (540.0 + idx * 35.0) * tt) * 0.5 + np.random.randn(c_len).astype(np.float32) * 0.25) * np.exp(-tt * 65.0)
            if st + c_len < n:
                out[st : st + c_len] += clk * 0.55
        return out

    if sfx_type in ("hydraulic_charge", "sparkle_sweep", "moon_shimmer"):
        dur = 0.95
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        if sfx_type == "hydraulic_charge":
            f = 180.0 + 680.0 * (t / dur) ** 1.6
            env = np.sin(math.pi * t / dur)
            return (np.sin(2.0 * math.pi * np.cumsum(f) / SR) * env * 0.45).astype(np.float32)
        freqs = [523.25, 659.25, 783.99, 1046.5, 1318.5] if sfx_type == "sparkle_sweep" else [587.33, 739.99, 880.0, 1174.66]
        out = np.zeros(n, dtype=np.float32)
        for i, fr in enumerate(freqs):
            delay = int(i * 0.08 * SR)
            m = n - delay
            tt = t[:m]
            out[delay:] += np.sin(2.0 * math.pi * fr * tt) * np.exp(-tt * 3.8) * 0.22
        return out

    if sfx_type == "sonic_boom":
        dur = 1.05
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        f = 190.0 * (0.18 ** np.clip(t / 0.22, 0.0, 1.0)) + 32.0
        sub = np.sin(2.0 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2) * 0.95
        bell = (np.sin(2.0 * math.pi * 1046.5 * t) + 0.5 * np.sin(2.0 * math.pi * 1567.98 * t)) * np.exp(-t * 5.0) * 0.35
        return np.tanh((sub + bell) * 1.25).astype(np.float32) * 0.85

    if sfx_type == "record_scratch":
        dur = 0.42
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        f = 720.0 - 520.0 * (t / dur) + 180.0 * np.sin(2.0 * math.pi * 24.0 * t)
        scr = np.sin(2.0 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 5.0)
        return np.tanh(scr * 1.8).astype(np.float32) * 0.52

    if sfx_type == "quake_rumble":
        dur = 1.65
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        rum = butter_filter(np.random.randn(n).astype(np.float32), "low", 145.0, order=3)
        sub = np.sin(2.0 * math.pi * (42.0 + 14.0 * np.sin(2.0 * math.pi * 5.5 * t)) * t)
        env = np.sin(math.pi * t / dur) ** 0.7
        return np.tanh((rum * 1.8 + sub * 0.7) * env).astype(np.float32) * 0.80

    if sfx_type == "camera_flash":
        dur = 0.38
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        snap = butter_filter(np.random.randn(n).astype(np.float32), "high", 2400.0, order=2) * np.exp(-t * 65.0) * 0.8
        whine = np.sin(2.0 * math.pi * (1800.0 + 950.0 * (t / dur)) * t) * np.exp(-t * 10.0) * 0.25
        return (snap + whine).astype(np.float32)

    if sfx_type == "outro_sting":
        dur = 1.4
        n = int(dur * SR)
        t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
        out = np.zeros(n, dtype=np.float32)
        for m in [48, 60, 64, 67, 72, 76]:
            fr = midi_to_hz(m)
            out += (np.sin(2.0 * math.pi * fr * t) + 0.35 * np.sin(2.0 * math.pi * fr * 2.0 * t)) * np.exp(-t * 2.4) * 0.16
        return np.tanh(out).astype(np.float32) * 0.85

    return np.zeros(int(0.1 * SR), dtype=np.float32)


def main() -> None:
    timeline = json.loads(TIMELINE_PATH.read_text(encoding="utf-8"))
    print("[Audio] Synthesizing Kokoro dialogue lines...")
    dialogue_bus, speaker_mono_buses, manifest_lines = synthesize_dialogue(timeline)

    print("[Audio] Synthesizing cultural Mughal BGM...")
    bgm_bus = generate_bgm()

    print(f"[Audio] Synthesizing {len(timeline['sfxEvents'])} SFX events...")
    sfx_bus = np.zeros((TOTAL_SAMPLES, CHANNELS), dtype=np.float32)
    for ev in timeline["sfxEvents"]:
        wav = synth_sfx(ev["type"]) * float(ev.get("gain", 0.75))
        add_stereo_event(sfx_bus, pan_stereo(wav, float(ev.get("pan", 0.0))), float(ev["time"]))

    master_and_export(PROJECT_ROOT, timeline, dialogue_bus, bgm_bus, sfx_bus, speaker_mono_buses, manifest_lines)


if __name__ == "__main__":
    main()
