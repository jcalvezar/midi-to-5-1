import sys
import json
import os
import subprocess
import tempfile

import pathlib
import mido
SCRIPT_DIR = pathlib.Path(__file__).parent.resolve()
SOUNDFONT = str(SCRIPT_DIR.parent.parent / "Musyng Kite.sf2")
SAMPLE_RATE = "48000"

STATUS_FILE = None
steps = []


def filter_midi_by_channel(midi_path, channel, output_path):
    mid = mido.MidiFile(midi_path)
    new_mid = mido.MidiFile(type=1, ticks_per_beat=mid.ticks_per_beat)

    def collect_events(tracks, predicate):
        events = []
        for track in tracks:
            abs_tick = 0
            for msg in track:
                abs_tick += msg.time
                if predicate(msg):
                    events.append((abs_tick, msg.copy()))
        return events

    def make_track(events):
        events.sort(key=lambda x: x[0])
        t = mido.MidiTrack()
        last = 0
        for abs_tick, msg in events:
            delta = max(0, abs_tick - last)
            msg.time = delta
            last = abs_tick
            t.append(msg)
        return t

    cond_pred = lambda m: m.type in ('set_tempo', 'time_signature', 'key_signature')
    inst_pred = lambda m: hasattr(m, 'channel') and m.channel == channel

    new_mid.tracks.append(make_track(collect_events(mid.tracks, cond_pred)))
    new_mid.tracks.append(make_track(collect_events(mid.tracks, inst_pred)))
    new_mid.save(output_path)


def build_steps(selections):
    s = []
    for sel in selections:
        ch = sel["channel"]
        s.append({"label": f"Generating WAV: {sel.get('name', f'Track {ch}')}", "status": "pending"})
    s.append({"label": "Mixing front channels (L/R)", "status": "pending"})
    s.append({"label": "Mixing center channel", "status": "pending"})
    s.append({"label": "Mixing rear channels (L/R)", "status": "pending"})
    s.append({"label": "Extracting subwoofer (LFE)", "status": "pending"})
    s.append({"label": "Extracting 5.1 channel WAVs", "status": "pending"})
    s.append({"label": "Assembling 5.1 WAV", "status": "pending"})
    s.append({"label": "Encoding DTS 5.1", "status": "pending"})
    s.append({"label": "Encoding AC3 5.1", "status": "pending"})
    return s


def flush_status(overall, current_step, total):
    label = steps[current_step - 1]["label"] if 0 < current_step <= len(steps) else ""
    data = {"status": overall, "step": current_step, "total": total, "label": label, "steps": steps}
    if overall == "error":
        data["error"] = label or "Unknown error"
    with open(STATUS_FILE, "w") as f:
        json.dump(data, f)


def log(msg):
    print(json.dumps({"type": "log", "message": msg}), flush=True)


def progress(step_idx, total, label):
    if step_idx > 1:
        steps[step_idx - 2]["status"] = "completed"
    steps[step_idx - 1]["status"] = "processing"
    flush_status("processing", step_idx, total)
    print(json.dumps({"type": "progress", "step": step_idx, "total": total, "label": label}), flush=True)


def fail(error):
    found = False
    for s in steps:
        if s["status"] in ("processing", "pending"):
            s["status"] = "error"
            found = True
            break
    if not found and steps:
        steps[-1]["status"] = "error"
    flush_status("error", 0, 0)
    print(json.dumps({"type": "error", "message": str(error)}), flush=True)
    sys.exit(1)


def done():
    steps[-1]["status"] = "completed"
    flush_status("completed", 0, 0)
    print(json.dumps({"type": "done"}), flush=True)


CMD_TIMEOUT = 600

def run_cmd(cmd, desc):
    log(f"Running: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=CMD_TIMEOUT)
    except subprocess.TimeoutExpired:
        fail(f"{desc} timed out after {CMD_TIMEOUT}s")
        return ""
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
        SOUNDFONT, midi_path,
    ]
    run_cmd(cmd, "FluidSynth render")


def pad_wav_to_duration(wav_path, target_dur):
    current = get_wav_duration(wav_path)
    if current >= target_dur - 0.1:
        return
    tmp = wav_path + ".tmp.wav"
    run_cmd([
        "ffmpeg", "-y", "-i", wav_path,
        "-af", f"apad,atrim=0:{target_dur}",
        "-ac", "2", "-ar", SAMPLE_RATE, tmp
    ], "Pad WAV duration")
    os.replace(tmp, wav_path)


def process_midi(midi_path, output_dir, selections, base_name="output"):
    os.makedirs(output_dir, exist_ok=True)
    wavs_dir = os.path.join(output_dir, "wavs")
    mixes_dir = os.path.join(output_dir, "mixes")
    final_dir = os.path.join(output_dir, "final")
    os.makedirs(wavs_dir, exist_ok=True)
    os.makedirs(mixes_dir, exist_ok=True)
    os.makedirs(final_dir, exist_ok=True)

    total = len(steps)
    current = 0

    for i, sel in enumerate(selections):
        current += 1
        label = steps[current - 1]["label"]
        progress(current, total, label)
        ch = sel["channel"]
        wav_path = os.path.join(wavs_dir, f"track_{i}.wav")
        tmp_midi = os.path.join(output_dir, f"track_{i}.mid")
        try:
            filter_midi_by_channel(midi_path, ch, tmp_midi)
            render_track(tmp_midi, wav_path)
        except Exception as e:
            fail(f"Error rendering track {i}: {e}")
        finally:
            if os.path.exists(tmp_midi):
                os.remove(tmp_midi)

    track_wavs = [os.path.join(wavs_dir, f"track_{i}.wav") for i in range(len(selections))]
    max_track_dur = get_max_duration(track_wavs)
    if max_track_dur > 0:
        for wav in track_wavs:
            pad_wav_to_duration(wav, max_track_dur)

    current += 1
    progress(current, total, steps[current - 1]["label"])
    front_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s["position"] == "front"]
    if front_tracks:
        mix_stereo(front_tracks, os.path.join(mixes_dir, "front.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "front.wav"), 2)

    current += 1
    progress(current, total, steps[current - 1]["label"])
    center_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s["position"] == "center"]
    if center_tracks:
        mix_mono(center_tracks, os.path.join(mixes_dir, "center.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "center.wav"), 1)

    current += 1
    progress(current, total, steps[current - 1]["label"])
    rear_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s["position"] == "rear"]
    if rear_tracks:
        mix_stereo(rear_tracks, os.path.join(mixes_dir, "rear.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "rear.wav"), 2)

    current += 1
    progress(current, total, steps[current - 1]["label"])
    sub_tracks = [wavs_dir + f"/track_{i}.wav" for i, s in enumerate(selections) if s.get("subwoofer", False)]
    if sub_tracks:
        extract_subwoofer(sub_tracks, os.path.join(mixes_dir, "sub.wav"))
    else:
        create_silent_wav(os.path.join(mixes_dir, "sub.wav"), 1)

    current += 1
    progress(current, total, steps[current - 1]["label"])
    extract_mono_channel(os.path.join(mixes_dir, "front.wav"), os.path.join(mixes_dir, "FL.wav"), "c0")
    extract_mono_channel(os.path.join(mixes_dir, "front.wav"), os.path.join(mixes_dir, "FR.wav"), "c1")
    extract_mono_channel(os.path.join(mixes_dir, "rear.wav"), os.path.join(mixes_dir, "SL.wav"), "c0")
    extract_mono_channel(os.path.join(mixes_dir, "rear.wav"), os.path.join(mixes_dir, "SR.wav"), "c1")

    current += 1
    progress(current, total, steps[current - 1]["label"])
    temp_51 = os.path.join(mixes_dir, "temp_51.wav")
    max_dur = get_max_duration([
        os.path.join(mixes_dir, f) for f in ["FL.wav", "FR.wav", "center.wav", "sub.wav", "SL.wav", "SR.wav"]
    ])
    if max_dur <= 0:
        max_dur = 10
    assemble_51(mixes_dir, temp_51, max_dur)

    current += 1
    progress(current, total, steps[current - 1]["label"])
    encode_dts(temp_51, os.path.join(final_dir, f"{base_name}.dts"))

    current += 1
    progress(current, total, steps[current - 1]["label"])
    encode_ac3(temp_51, os.path.join(final_dir, f"{base_name}.ac3"))

    done()


def get_wav_duration(wav_path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
        wav_path,
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
    mix_inputs = []
    for w in existing:
        mix_inputs.extend(["-i", w])
    ch = len(existing)
    filter_str = f"amix=inputs={ch}:duration=longest[m]"
    cmd = ["ffmpeg", "-y", *mix_inputs, "-filter_complex", filter_str,
           "-map", "[m]", "-ac", "2", "-ar", SAMPLE_RATE, output_wav]
    run_cmd(cmd, "Stereo mix")


def mix_mono(input_wavs, output_wav):
    existing = [w for w in input_wavs if os.path.exists(w)]
    if not existing:
        create_silent_wav(output_wav, 1)
        return
    mix_inputs = []
    for w in existing:
        mix_inputs.extend(["-i", w])
    ch = len(existing)
    filter_str = f"amix=inputs={ch}:duration=longest,pan=mono|c0=c0+c1[m]"
    cmd = ["ffmpeg", "-y", *mix_inputs, "-filter_complex", filter_str,
           "-map", "[m]", "-ac", "1", "-ar", SAMPLE_RATE, output_wav]
    run_cmd(cmd, "Mono mix")


def extract_subwoofer(input_wavs, output_wav):
    existing = [w for w in input_wavs if os.path.exists(w)]
    if not existing:
        create_silent_wav(output_wav, 1)
        return
    mix_inputs = []
    for w in existing:
        mix_inputs.extend(["-i", w])
    ch = len(existing)
    filter_str = f"amix=inputs={ch}:duration=longest,pan=mono|c0=c0+c1,lowpass=f=120,volume=1.5[m]"
    cmd = ["ffmpeg", "-y", *mix_inputs, "-filter_complex", filter_str,
           "-map", "[m]", "-ac", "1", "-ar", SAMPLE_RATE, output_wav]
    run_cmd(cmd, "Subwoofer extract")


def create_silent_wav(output_wav, channels):
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r={SAMPLE_RATE}:cl=mono",
           "-ac", str(channels), "-ar", SAMPLE_RATE, "-t", "1", output_wav]
    run_cmd(cmd, "Silent WAV")


def extract_mono_channel(input_wav, output_wav, channel_expr):
    if not os.path.exists(input_wav):
        create_silent_wav(output_wav, 1)
        return
    run_cmd([
        "ffmpeg", "-y", "-i", input_wav,
        "-af", f"pan=mono|c0={channel_expr}",
        "-ac", "1", "-ar", SAMPLE_RATE, output_wav
    ], "Extract mono channel")


def assemble_51(mixes_dir, output_wav, max_dur):
    ch_names = ["FL", "FR", "FC", "LFE", "SL", "SR"]
    names = {"FC": "center.wav", "LFE": "sub.wav"}
    sox_inputs = []
    for cn in ch_names:
        fname = names.get(cn, f"{cn}.wav")
        p = os.path.join(mixes_dir, fname)
        if not os.path.exists(p):
            dummy = os.path.join(mixes_dir, f"{cn}_dummy.wav")
            create_silent_wav(dummy, 1)
            sox_inputs.append(dummy)
        else:
            sox_inputs.append(p)
    # Trim/pad each to exact max_dur, then merge 6 monos into one WAV with sox -M
    trimmed = []
    for i, p in enumerate(sox_inputs):
        tp = p + ".trimmed.wav"
        run_cmd([
            "ffmpeg", "-y", "-i", p,
            "-af", f"atrim=0:{max_dur},apad=whole_dur={max_dur}",
            "-ac", "1", "-ar", SAMPLE_RATE, tp
        ], "Trim channel")
        trimmed.append(tp)
    # sox -M merges in input order: FL, FR, FC, LFE, SL, SR
    cmd = ["sox", "-M", "-b", "16"] + trimmed + [output_wav, "rate", SAMPLE_RATE]
    run_cmd(cmd, "Create 5.1 WAV")
    for tp in trimmed:
        if os.path.exists(tp):
            os.remove(tp)


def encode_dts(input_wav, output_path):
    run_cmd(["ffmpeg", "-y", "-channel_layout", "5.1", "-i", input_wav, "-c:a", "dca",
             "-strict", "experimental", "-b:a", "1536k", "-ar", SAMPLE_RATE, output_path], "DTS encode")


def encode_ac3(input_wav, output_path):
    run_cmd(["ffmpeg", "-y", "-channel_layout", "5.1", "-i", input_wav, "-c:a", "ac3",
             "-b:a", "640k", "-ar", SAMPLE_RATE, output_path], "AC3 encode")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        msg = "Usage: process_midi.py <midi_path> <output_dir> <selections_json>"
        print(json.dumps({"type": "error", "message": msg}))
        sys.exit(1)

    midi_path = sys.argv[1]
    output_dir = sys.argv[2]
    selections = json.loads(sys.argv[3])

    os.makedirs(output_dir, exist_ok=True)

    meta_path = os.path.join(os.path.dirname(output_dir), "meta.json")
    base_name = "output"
    if os.path.exists(meta_path):
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            base_name = meta.get("baseName", base_name)
        except Exception:
            pass

    STATUS_FILE = os.path.join(output_dir, "status.json")

    steps = build_steps(selections)
    flush_status("pending", 0, len(steps))

    try:
        process_midi(midi_path, output_dir, selections, base_name)
    except Exception as e:
        fail(str(e))
