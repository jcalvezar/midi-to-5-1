# Midiar

Convierte archivos MIDI a DTS/AC3 5.1 multicanal.

## Requisitos

- **Node.js** 20+
- **Python 3** con [`mido`](https://github.com/mido/mido) (`pip install mido`)
- **FluidSynth** con un SoundFont (ej: `Musyng Kite.sf2`)
- **FFmpeg** con codecs `dca` y `ac3`

## Uso

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

1. **Upload**: arrastrar o seleccionar un archivo `.mid`/`.midi`
2. **Pistas**: elegir posición (adelante/central/atrás) y activar subwoofer por instrumento
3. **Procesar**: genera WAVs por pista, mezcla 5.1, y codifica a DTS y AC3
4. **Descargar**: links para bajar los archivos `.dts` y `.ac3`

## Pipeline

1. `fluidsynth` renderiza cada pista a WAV
2. Mezcla canales frontales (stéreo), central (mono), traseros (stéreo)
3. Extrae subwoofer (low-pass 120Hz)
4. Combina en 5.1 y codifica a DTS (dca 1536k) y AC3 (640k)
