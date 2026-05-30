import sys
import json
import os
import subprocess

import pathlib
SCRIPT_DIR = pathlib.Path(__file__).parent.resolve()
SOUNDFONT = str(SCRIPT_DIR.parent / "Musyng Kite.sf2")
SAMPLE_RATE = "48000"

STATUS_FILE = None

def write_status(data):
    with open(STATUS_FILE, "w") as f:
        json.dump(data, f)

def log(msg):
    st = {"status": "processing", "step": 0, "total": 0, "label": msg}
    write_status(st)
    print(json.dumps({"type": "log", "message": msg}), flush=True)

def progress(step, total, label):
    st = {"status": "processing", "step": step, "total": total, "label": label}
    write_status(st)
    print(json.dumps({"type": "progress", "step": step, "total": total, "label": label}), flush=True)

def fail(error):
    st = {"status": "error", "step": 0, "total": 0, "label": "", "error": str(error)}
    write_status(st)
    print(json.dumps({"type": "error", "message": str(error)}), flush=True)
    sys.exit(1)

def done():
    write_status({"status": "completed", "step": 0, "total": 0, "label": "Completado"})

def run_cmd(cmd, desc):
    log(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        log(f"STDERR: {result.stderr}")
        fail(f"{desc} failed: {result.stderr}")
    return result.stdout

def render_track(midi_path, output_wav):
    if not os.path.exists(SOUNDFONT):
        fail(f"Soundfont not found: {SOUNDFONT}")
    cmd = [
        "fluidsynth", "-F", output_wav, "-r", SAMPLE_RATE,
        "-g", "1.0", "-a", "float",
        SOUNDFONT, midi_path
    ]
    run_cmd(cmd, "FluidSynth render")

def process_midi(midi_path, output_dir, selections):
    os.makedirs(output_dir, exist_ok=True)
    wavs_dir = os.path.join(output_dir, "wavs")
    mixes_dir = os.path.join(output_dir, "mixes")
    final_dir = os.path.join(output_dir, "final")
    os.makedirs(wavs_dir, exist_ok=True)
    os.makedirs(mixes_dir, exist_ok=True)
    os.makedirs(final_dir, exist_ok=True)

    total_steps = len(selections) + 6
    current_step = 0

    for i, sel in enumerate(selections):
        current_step += 1
        ch = sel["channel"]
        label = f"Generando WAV: {sel.get('name', f'Track {ch}')}"
        progress(current_step, total_steps, label)
        wav_path = os.path.join(wavs_dir, f"track_{i}.wav")
        try:
            render_track(midi_path, wav_path)
        except Exception as e:
            fail(f"Error rendering track {i}: {e}")

    current_step += 1
    progress(current_step, total_steps, "Mezclando canales frontales (L/R)")
    front_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s["position"] == "front"]
    if front_tracks:
        mix_stereo(front_tracks, os.path.join(mixes_dir, "front.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "front.wav"), 2)

    current_step += 1
    progress(current_step, total_steps, "Mezclando canal central")
    center_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s["position"] == "center"]
    if center_tracks:
        mix_mono(center_tracks, os.path.join(mixes_dir, "center.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "center.wav"), 1)

    current_step += 1
    progress(current_step, total_steps, "Mezclando canales traseros (L/R)")
    rear_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s["position"] == "rear"]
    if rear_tracks:
        mix_stereo(rear_tracks, os.path.join(mixes_dir, "rear.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "rear.wav"), 2)

    current_step += 1
    progress(current_step, total_steps, "Extrayendo subwoofer (LFE)")
    sub_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s.get("subwoofer", False)]
    if sub_tracks:
        extract_subwoofer(sub_tracks, os.path.join(mixes_dir, "sub.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "sub.wav"), 1)

    current_step += 1
    progress(current_step, total_steps, "Generando mezcla DTS 5.1")
    generate_dts(mixes_dir, os.path.join(final_dir, "output.dts"))

    current_step += 1
    progress(current_step, total_steps, "Generando mezcla AC3 5.1")
    generate_ac3(mixes_dir, os.path.join(final_dir, "output.ac3"))

    done()

def get_wav_duration(wav_path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
        wav_path
    ], capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except:
        return 0

def get_max_duration(wav_paths):
    max_dur = 0
    for w in wav_paths:
        if os.path.exists(w):
            dur = get_wav_duration(w)
            if dur > max_dur:
                max_dur = dur
    return max_dur if max_dur > 0 else 10

def mix_stereo(input_wavs, output_wav):
    existing = [w for w in input_wavs if os.path.exists(w)]
    if not existing:
        create_silent_wav(output_wav, 2)
        return
    duration = get_max_duration(existing)
    if duration <= 0:
        duration = 10
    mix_inputs = []
    for w in existing:
        mix_inputs.extend(["-i", w])
    ch = len(existing)
    if ch == 1:
        filter_str = f"[0:a]apad,atrim=0:{duration}[a];[a]amerge=inputs=1,pan=stereo|c0=c0|c1=c0[m]"
    elif ch == 2:
        filter_str = f"amerge=inputs={ch}[m]"
    else:
        filter_str = f"amerge=inputs={ch},pan=stereo|c0=c0+c1|c1=c2+c3[m]"
    cmd = ["ffmpeg", "-y", *mix_inputs, "-filter_complex", filter_str,
           "-map", "[m]", "-ac", "2", "-ar", SAMPLE_RATE, output_wav]
    run_cmd(cmd, "Stereo mix")

def mix_mono(input_wavs, output_wav):
    existing = [w for w in input_wavs if os.path.exists(w)]
    if not existing:
        create_silent_wav(output_wav, 1)
        return
    duration = get_max_duration(existing)
    if duration <= 0:
        duration = 10
    mix_inputs = []
    for w in existing:
        mix_inputs.extend(["-i", w])
    filter_str = f"amerge=inputs={len(existing)},pan=mono|c0={'+'.join([f'c{i}' for i in range(len(existing))])}[m]"
    cmd = ["ffmpeg", "-y", *mix_inputs, "-filter_complex", filter_str,
           "-map", "[m]", "-ac", "1", "-ar", SAMPLE_RATE, output_wav]
    run_cmd(cmd, "Mono mix")

def extract_subwoofer(input_wavs, output_wav):
    existing = [w for w in input_wavs if os.path.exists(w)]
    if not existing:
        create_silent_wav(output_wav, 1)
        return
    duration = get_max_duration(existing)
    if duration <= 0:
        duration = 10
    mix_inputs = []
    for w in existing:
        mix_inputs.extend(["-i", w])
    filter_str = (
        f"amerge=inputs={len(existing)},pan=mono|c0={'+'.join([f'c{i}' for i in range(len(existing))])}"
        f",lowpass=f=120,volume=1.5[m]"
    )
    cmd = ["ffmpeg", "-y", *mix_inputs, "-filter_complex", filter_str,
           "-map", "[m]", "-ac", "1", "-ar", SAMPLE_RATE, output_wav]
    run_cmd(cmd, "Subwoofer extract")

def create_silent_wav(output_wav, channels):
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r={SAMPLE_RATE}:cl=mono",
           "-ac", str(channels), "-ar", SAMPLE_RATE, "-t", "1", output_wav]
    run_cmd(cmd, "Silent WAV")

def generate_dts(mixes_dir, output_path):
    temp_51 = os.path.join(mixes_dir, "temp_51.wav")
    ch_map = {
        "front": os.path.join(mixes_dir, "front.wav"),
        "center": os.path.join(mixes_dir, "center.wav"),
        "rear": os.path.join(mixes_dir, "rear.wav"),
        "sub": os.path.join(mixes_dir, "sub.wav"),
    }
    durations = []
    for p in ch_map.values():
        if os.path.exists(p):
            durations.append(get_wav_duration(p))
    max_dur = max(durations) if durations else 10
    if max_dur <= 0:
        max_dur = 10
    inputs = []
    for name in ["front", "center", "sub", "rear"]:
        p = ch_map[name]
        if os.path.exists(p):
            inputs.extend(["-i", p])
        else:
            dummy = os.path.join(mixes_dir, f"{name}_dummy.wav")
            create_silent_wav(dummy, 2 if name in ("front", "rear") else 1)
            inputs.extend(["-i", dummy])
    fc = (
        f"[0:a]atrim=0:{max_dur}[a0];[1:a]atrim=0:{max_dur}[a1];"
        f"[2:a]atrim=0:{max_dur}[a2];[3:a]atrim=0:{max_dur}[a3];"
        f"[a0][a1][a2][a3]amerge=inputs=4,pan=5.1(side)"
        f"|FL=FL|FR=FR|FC=c2|LFE=c4|BL=c5|BR=c6[m]"
    )
    run_cmd(["ffmpeg", "-y", *inputs, "-filter_complex", fc,
             "-map", "[m]", "-c:a", "pcm_s16le", "-ar", SAMPLE_RATE, temp_51], "Create 5.1 WAV")
    run_cmd(["ffmpeg", "-y", "-i", temp_51, "-c:a", "dca",
             "-strict", "experimental", "-b:a", "1536k", "-ar", SAMPLE_RATE, output_path], "DTS encode")

def generate_ac3(mixes_dir, output_path):
    temp_51 = os.path.join(mixes_dir, "temp_51_ac3.wav")
    ch_map = {
        "front": os.path.join(mixes_dir, "front.wav"),
        "center": os.path.join(mixes_dir, "center.wav"),
        "rear": os.path.join(mixes_dir, "rear.wav"),
        "sub": os.path.join(mixes_dir, "sub.wav"),
    }
    durations = []
    for p in ch_map.values():
        if os.path.exists(p):
            durations.append(get_wav_duration(p))
    max_dur = max(durations) if durations else 10
    if max_dur <= 0:
        max_dur = 10
    inputs = []
    for name in ["front", "center", "sub", "rear"]:
        p = ch_map[name]
        if os.path.exists(p):
            inputs.extend(["-i", p])
        else:
            dummy = os.path.join(mixes_dir, f"{name}_dummy.wav")
            create_silent_wav(dummy, 2 if name in ("front", "rear") else 1)
            inputs.extend(["-i", dummy])
    fc = (
        f"[0:a]atrim=0:{max_dur}[a0];[1:a]atrim=0:{max_dur}[a1];"
        f"[2:a]atrim=0:{max_dur}[a2];[3:a]atrim=0:{max_dur}[a3];"
        f"[a0][a1][a2][a3]amerge=inputs=4,pan=5.1(side)"
        f"|FL=FL|FR=FR|FC=c2|LFE=c4|BL=c5|BR=c6[m]"
    )
    run_cmd(["ffmpeg", "-y", *inputs, "-filter_complex", fc,
             "-map", "[m]", "-c:a", "pcm_s16le", "-ar", SAMPLE_RATE, temp_51], "Create 5.1 WAV")
    run_cmd(["ffmpeg", "-y", "-i", temp_51, "-c:a", "ac3",
             "-b:a", "640k", "-ar", SAMPLE_RATE, output_path], "AC3 encode")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        msg = "Usage: process_midi.py <midi_path> <output_dir> <selections_json>"
        print(json.dumps({"type": "error", "message": msg}))
        sys.exit(1)

    midi_path = sys.argv[1]
    output_dir = sys.argv[2]
    selections = json.loads(sys.argv[3])

    STATUS_FILE = os.path.join(output_dir, "status.json")

    write_status({"status": "pending", "step": 0, "total": len(selections) + 6, "label": "Iniciando..."})

    try:
        process_midi(midi_path, output_dir, selections)
    except Exception as e:
        fail(str(e))
