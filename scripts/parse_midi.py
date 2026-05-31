import sys
import json
import mido

GM_INSTRUMENTS = [
    "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
    "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
    "Celesta", "Glockenspiel", "Music Box", "Vibraphone",
    "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
    "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ",
    "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
    "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
    "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
    "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
    "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
    "Violin", "Viola", "Cello", "Contrabass",
    "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
    "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
    "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
    "Trumpet", "Trombone", "Tuba", "Muted Trumpet",
    "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
    "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax",
    "Oboe", "English Horn", "Bassoon", "Clarinet",
    "Piccolo", "Flute", "Recorder", "Pan Flute",
    "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
    "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)",
    "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
    "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)",
    "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
    "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)",
    "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
    "Sitar", "Banjo", "Shamisen", "Koto",
    "Kalimba", "Bag pipe", "Fiddle", "Shanai",
    "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock",
    "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
    "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet",
    "Telephone Ring", "Helicopter", "Applause", "Gunshot"
]

DRUM_CHANNEL = 9

def get_instrument_name(program):
    if 0 <= program < len(GM_INSTRUMENTS):
        return GM_INSTRUMENTS[program]
    return f"Program {program}"

def parse_midi(filepath):
    mid = mido.MidiFile(filepath)
    tracks = []
    seen = set()

    tempo = 500000
    for i, track in enumerate(mid.tracks):
        track_name = f"Track {i}"
        per_channel = {}
        abs_time = 0
        for msg in track:
            abs_time += msg.time
            if msg.type == 'track_name' and msg.name:
                track_name = msg.name
            elif msg.type == 'program_change':
                ch = msg.channel
                if ch not in per_channel:
                    per_channel[ch] = {"program": 0, "note_count": 0}
                per_channel[ch]["program"] = msg.program
            elif msg.type == 'note_on' and msg.velocity > 0:
                ch = msg.channel
                if ch not in per_channel:
                    per_channel[ch] = {"program": 0, "note_count": 0}
                per_channel[ch]["note_count"] += 1
            elif msg.type == 'set_tempo':
                tempo = msg.tempo

        for ch, info in per_channel.items():
            if info["note_count"] == 0:
                continue
            is_drum = (ch == DRUM_CHANNEL)
            key = (track_name, ch)
            if key not in seen:
                seen.add(key)
                inst_name = "Drums" if is_drum else get_instrument_name(info["program"])
                tracks.append({
                    "track": i,
                    "name": track_name,
                    "instrument": inst_name,
                    "program": info["program"],
                    "channel": ch,
                    "is_drum": is_drum,
                    "note_count": info["note_count"],
                })

    bpm = mido.tempo2bpm(tempo)
    duration = mid.length if hasattr(mid, 'length') and mid.length else 0

    return {
        "tracks": tracks,
        "bpm": round(bpm, 1),
        "duration": round(duration, 2),
        "tempo_us": tempo,
        "total_tracks": len(tracks),
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file specified"}))
        sys.exit(1)
    try:
        result = parse_midi(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
