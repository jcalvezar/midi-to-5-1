# Midiar

Web application that converts standard MIDI files into 5.1 surround sound DTS and AC3 audio files. Each instrument in the MIDI can be independently positioned (front, center, or rear), routed to the subwoofer, and have its volume adjusted, creating an immersive listening experience from any multitrack MIDI.

## Requirements

- **Node.js** 20+
- **Python 3** with [`mido`](https://github.com/mido/mido) (`pip install mido`)
- **FluidSynth** with a SoundFont (e.g. `Musyng Kite.sf2`)
- **FFmpeg** with `dca` and `ac3` codecs
- **SoX** (for multi-channel WAV assembly)

By default the project looks for `Musyng Kite.sf2` in the project root. Custom SoundFonts can be uploaded from the web UI.

### Installing system dependencies (Debian/Ubuntu)

```bash
sudo apt install fluidsynth ffmpeg sox python3-pip
pip install mido
```

## Usage

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Upload**: drag & drop or select a `.mid`/`.midi` file
2. **Tracks**: the app parses the MIDI and lists every instrument found (by GM program number and channel). For each instrument, choose its position (front/center/rear), toggle subwoofer, and adjust volume (0–150%). You can also pick or upload a SoundFont. All settings persist across visits.
3. **Process**: starts the conversion pipeline. A progress bar shows each step (render, mix, encode)
4. **Download**: once complete, links to download `.dts` (1536 kbps) and `.ac3` (640 kbps) files, named after the original MIDI file and the SoundFont used

## Audio quality

The entire chain runs at **48 kHz / 16-bit**. Details:

| Step | Format |
|------|--------|
| FluidSynth render | 48 kHz, 32-bit float (internal), written as 16-bit WAV |
| Per-track gain (FFmpeg `volume` filter) | 48 kHz, 16-bit PCM |
| Padding, mixing, extraction (FFmpeg) | 48 kHz, 16-bit PCM |
| 5.1 assembly (SoX `-b 16`) | 48 kHz, 16-bit PCM |
| DTS encode | 48 kHz, 1536 kbps |
| AC3 encode | 48 kHz, 640 kbps |

## Pipeline

### 1. Channel filtering (`filter_midi_by_channel`)
The original MIDI is read with `mido`. For each selected instrument channel, a temporary MIDI file is created containing:
- All tempo/time-signature events (to preserve timing)
- Only the note/program/controller events for that specific channel

Delta times are recalculated from absolute tick positions, so timing is preserved even when events from other channels are removed.

### 2. Audio rendering (`fluidsynth`)
Each filtered MIDI is rendered to a stereo WAV at full gain (`-g 1.0`):
```
fluidsynth -F track_N.wav -r 48000 -g 1.0 -a float Musyng\ Kite.sf2 track_N.mid
```
Every track WAV is produced independently, containing only the target instrument.

### 3. Per-track volume adjustment (`apply_gain`)
FluidSynth's `-g` flag is unreliable, so gain is applied post-render with FFmpeg:
```
ffmpeg -y -i track_N.wav -af "volume=<gain>" track_N.wav
```
The gain is the slider value divided by 100 (0% → 0.0, 100% → 1.0, 150% → 1.5). If gain is 1.0 the step is skipped.

### 4. Duration padding (`pad_wav_to_duration`)
All track WAVs are padded with silence via `ffmpeg apad,atrim=0:{max_dur}` so they match the length of the longest track. This guarantees all channels have the same timeline.

### 5. Mix buses

| Bus | Input tracks | Process | Output |
|-----|-------------|---------|--------|
| Front | Tracks marked as **front** | `amix` (sample-sum, stereo) | `front.wav` (stereo) |
| Center | Tracks marked as **center** | `amix` + `pan=mono\|c0=0.5*c0+0.5*c1` | `center.wav` (mono) |
| Rear | Tracks marked as **rear** | `amix` (sample-sum, stereo) | `rear.wav` (stereo) |
| Subwoofer | Tracks with **subwoofer** enabled | `amix` + `pan=mono\|c0=0.5*c0+0.5*c1` + `lowpass=f=120` + `volume=0.5` | `sub.wav` (mono) |

Center and subwoofer channels use a 0.5 factor to keep them at the same perceived level as front/rear channels (which split their signal across two speakers).

### 6. Channel extraction (`extract_mono_channel`)
From the stereo mix buses, individual mono channels are extracted with `pan=mono|c0=cN`:

| Source | Extraction | Output |
|--------|-----------|--------|
| `front.wav` L | `pan=mono\|c0=c0` | `FL.wav` |
| `front.wav` R | `pan=mono\|c0=c1` | `FR.wav` |
| `rear.wav` L | `pan=mono\|c0=c0` | `SL.wav` |
| `rear.wav` R | `pan=mono\|c0=c1` | `SR.wav` |
| `center.wav` | (already mono) | `FC.wav` |
| `sub.wav` | (already mono) | `LFE.wav` |

### 7. 5.1 assembly (`assemble_51`)
All six mono WAVs are combined into a single 5.1 WAV with SoX:
```
sox -M -b 16 FL.wav FR.wav center.wav sub.wav SL.wav SR.wav temp_51.wav rate 48000
```
The `-M` (merge) flag places each input in one output channel, preserving the order: FL, FR, FC, LFE, SL, SR.

### 8. Encoding

**DTS** (Digital Theater Systems):
```
ffmpeg -y -channel_layout 5.1 -i temp_51.wav -c:a dca -strict experimental -b:a 1536k -ar 48000 output.dts
```

**AC3** (Dolby Digital):
```
ffmpeg -y -channel_layout 5.1 -i temp_51.wav -c:a ac3 -b:a 640k -ar 48000 output.ac3
```

The output files inherit the original MIDI filename and the SoundFont name (e.g. `The_power_of_love_Musyng Kite.dts`).

## Output structure

For each conversion, files are stored under `uploads/<uuid>/output/`:

```
output/
├── wavs/         → track_0.wav ... track_N.wav   (per-instrument stereo WAVs)
├── mixes/        → FL.wav, FR.wav, FC.wav, LFE.wav, SL.wav, SR.wav
│                    front.wav, center.wav, rear.wav, sub.wav
│                    temp_51.wav
└── final/        → <name>.dts, <name>.ac3
```

Selections (position, subwoofer, volume, SoundFont) are saved on process and restored when revisiting the tracks page. The status of each step is written to `output/status.json` and polled by the frontend.

## Project structure

```
midiar/
├── src/                  # Next.js app (pages, components, API routes)
│   ├── app/              # App router pages
│   └── lib/              # Pipeline modules (render, mix, encode)
├── uploads/              # Uploaded MIDIs and conversion outputs
├── .github/workflows/    # CI / auto-merge workflows
├── public/               # Static assets
├── package.json
└── README.md
```

## Merge queue

Every PR that should be merged to `main` must include a version bump. Instead of doing it manually, the project uses a label-based workflow:

1. **Open a PR** against `main`.
2. **Add the `Merge queue` label** to the PR (already created in the repo).

The workflow will:
1. Bump the patch version (`npm version patch`) on the PR branch
2. Commit, push, enable auto-merge, and merge the PR into `main`
3. Delete the PR branch

The version bump ends up as part of the PR's commits, so no extra commits appear on `main` after the merge.
