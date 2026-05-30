# Midiar

Convert MIDI files to multi-channel DTS/AC3 5.1.

## Requirements

- **Node.js** 20+
- **Python 3** with [`mido`](https://github.com/mido/mido) (`pip install mido`)
- **FluidSynth** with a SoundFont (e.g. `Musyng Kite.sf2`)
- **FFmpeg** with `dca` and `ac3` codecs

## Usage

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Upload**: drag & drop or select a `.mid`/`.midi` file
2. **Tracks**: set position (front/center/rear) and enable subwoofer per instrument
3. **Process**: generates per-track WAVs, mixes 5.1, and encodes to DTS and AC3
4. **Download**: links to download `.dts` and `.ac3` files

## Pipeline

1. `fluidsynth` renders each track to WAV
2. Mixes front (stereo), center (mono), rear (stereo) channels
3. Extracts subwoofer (low-pass 120Hz)
4. Combines into 5.1 and encodes to DTS (dca 1536k) and AC3 (640k)
