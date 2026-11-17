# How They Built The Taj Mahal — 30s 3D Animated YouTube Short

A 30-second, cinema-grade vertical (`1080×1920`, `30 fps`, `900` frames) 3D animated engineering story produced with Three.js + Kokoro TTS + Google Chrome WebCodecs H.264 High Profile (`15 Mbps`), using the modular [`shorts-engine`](../shorts-engine/) architecture.

## Direct Download / Play MP4
- **Direct MP4 (Mobile & Desktop Ready)**: [`output/taj_mahal_making_short.mp4`](https://github.com/ssghtc002-sudo/taj-mahal-3d-short/raw/main/output/taj_mahal_making_short.mp4)

## 6-Beat Engineering Story Arc
1. **Agra 1632 Hook (`0.0–3.5s`)**: On the muddy Yamuna riverbank, the Royal Architect pitches a 73-meter white Makrana marble monument on a glowing hologram easel while the Royal Skeptic pops his turban in disbelief.
2. **River Wells Foundation (`3.5–8.2s`)**: A mud splatter reveals 21 brick wells driven deep into the submerged sal-wood foundation—kept wet by the Yamuna river so timber petrifies stone-hard instead of rotting.
3. **Spiral Ramp & Lotus Dome (`8.2–15.0s`)**: A colossal spiral timber construction ramp hauls carved marble aloft before seating the central lotus onion dome and glowing golden Kalash spire.
4. **Outward-Leaning Minarets (`15.0–20.8s`)**: The Skeptic panics at the crooked towers until a seismic shockwave triggers, proving the 2° outward architectural tilt protects the central dome by falling *away* during earthquakes.
5. **Sunset to Moonlight Glow (`20.8–25.8s`)**: Golden Agra dusk melts into luminous full-moon glow; the Skeptic drops his monocle and snaps on starlight shades.
6. **Charbagh Reflection Finale (`25.8–30.0s`)**: Mirrored Charbagh reflection canal, glowing sky/water lanterns, crisp atmospheric fog (`THREE.FogExp2`), and full monument symmetry finale.

## Engineering & Performance Highlights
- **Scene Efficiency (`verify_scene.mjs`)**: `65` draw calls (`<= 65`), `21,994` triangles (`<= 65k`), `24` shared material instances (`<= 25`), `3` dynamic lights, `18` selective shadow casters (`1024×1024` tight orthographic PCF shadows).
- **Audio Production (`audio/generate_audio.py`)**: Single-load Kokoro multi-speaker voices (`am_puck`, `bm_lewis`, `am_fenrir`), procedural Mughal score (Tanpura drone, Bansuri flute, Santoor arpeggios, Tabla groove) dynamically ducked `-5 dB` beneath speech, plus 19 synchronized Foley SFX mastered to `44.1 kHz` stereo WAV.
- **Zero-PNG WebCodecs Pipeline (`render/fastRenderer.mjs`)**: In-browser H.264 High Profile (`avc1.64002a`, `15 Mbps` Annex-B) dual-worker encoding inside `/usr/bin/google-chrome`, followed by zero-reencode FFmpeg `-c:v copy` audio muxing.

## Rebuild Locally
```bash
npm install
node verify_scene.mjs
node render/render_frames.mjs --qa-only
node render/render_frames.mjs
```
