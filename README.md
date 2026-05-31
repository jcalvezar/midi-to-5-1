# Midiar

Web application that converts standard MIDI files into 5.1 surround sound DTS and AC3 audio files. Each instrument in the MIDI can be independently positioned (front, center, or rear) and routed to the subwoofer, creating an immersive listening experience from any multitrack MIDI.

## Requirements

- **Node.js** 20+
- **Python 3** with [`mido`](https://github.com/mido/mido) (`pip install mido`)
- **FluidSynth** with a SoundFont (e.g. `Musyng Kite.sf2`)
- **FFmpeg** with `dca` and `ac3` codecs
- **SoX** (for multi-channel WAV assembly)

The SoundFont must be placed at `../Musyng Kite.sf2` relative to the project root (one level above).

## Usage

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Upload**: drag & drop or select a `.mid`/`.midi` file
2. **Tracks**: the app parses the MIDI and lists every instrument found (by GM program number and channel). For each instrument, choose its position (front/center/rear) and toggle subwoofer
3. **Process**: starts the conversion pipeline. A progress bar shows each step (render, mix, encode)
4. **Download**: once complete, links to download `.dts` (1536 kbps) and `.ac3` (640 kbps) files, which are named after the original MIDI file

## Pipeline

### 1. Channel filtering (`filter_midi_by_channel`)
The original MIDI is read with `mido`. For each selected instrument channel, a temporary MIDI file is created containing:
- All tempo/time-signature events (to preserve timing)
- Only the note/program/controller events for that specific channel

Delta times are recalculated from absolute tick positions, so timing is preserved even when events from other channels are removed.

### 2. Audio rendering (`fluidsynth`)
Each filtered MIDI is rendered to a stereo WAV:
```
fluidsynth -F track_N.wav -r 48000 -g 1.0 -a float Musyng\ Kite.sf2 track_N.mid
```
Every track WAV is produced independently, containing only the target instrument.

### 3. Duration padding (`pad_wav_to_duration`)
All track WAVs are padded with silence via `ffmpeg apad,atrim=0:{max_dur}` so they match the length of the longest track. This guarantees all channels have the same timeline.

### 4. Mix buses

| Bus | Input tracks | Process | Output |
|-----|-------------|---------|--------|
| Front | Tracks marked as **front** | `amix` (sample-sum, stereo) | `front.wav` (stereo) |
| Center | Tracks marked as **center** | `amix` + `pan=mono\|c0=c0+c1` | `center.wav` (mono) |
| Rear | Tracks marked as **rear** | `amix` (sample-sum, stereo) | `rear.wav` (stereo) |
| Subwoofer | Tracks with **subwoofer** enabled | `amix` + `pan=mono\|c0=c0+c1` + `lowpass=f=120,volume=1.5` | `sub.wav` (mono) |

### 5. Channel extraction (`extract_mono_channel`)
From the stereo mix buses, individual mono channels are extracted with `pan=mono|c0=cN`:

| Source | Extraction | Output |
|--------|-----------|--------|
| `front.wav` L | `pan=mono\|c0=c0` | `FL.wav` |
| `front.wav` R | `pan=mono\|c0=c1` | `FR.wav` |
| `rear.wav` L | `pan=mono\|c0=c0` | `SL.wav` |
| `rear.wav` R | `pan=mono\|c0=c1` | `SR.wav` |
| `center.wav` | (already mono) | `FC.wav` |
| `sub.wav` | (already mono) | `LFE.wav` |

### 6. 5.1 assembly (`assemble_51`)
All six mono WAVs are combined into a single 5.1 WAV with SoX:
```
sox -M -b 16 FL.wav FR.wav center.wav sub.wav SL.wav SR.wav temp_51.wav rate 48000
```
The `-M` (merge) flag places each input in one output channel, preserving the order: FL, FR, FC, LFE, SL, SR.

### 7. Encoding

**DTS** (Digital Theater Systems):
```
ffmpeg -y -channel_layout 5.1 -i temp_51.wav -c:a dca -strict experimental -b:a 1536k -ar 48000 output.dts
```

**AC3** (Dolby Digital):
```
ffmpeg -y -channel_layout 5.1 -i temp_51.wav -c:a ac3 -b:a 640k -ar 48000 output.ac3
```

The output files inherit the original MIDI filename (e.g. `The_power_of_love.dts` and `The_power_of_love.ac3`).

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
