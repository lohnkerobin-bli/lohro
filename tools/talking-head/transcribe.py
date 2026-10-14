"""Word-level transcription with faster-whisper. Usage: transcribe.py MODEL OUT_DIR WAV..."""
import sys, json, wave, os, numpy as np
from faster_whisper import WhisperModel

def load16k(path):
    w = wave.open(path)
    sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if sr != 16000:  # simple resample via linear interpolation (input is clean 48k)
        n = int(len(a) * 16000 / sr)
        a = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)
    return a

model_name, out_dir, wavs = sys.argv[1], sys.argv[2], sys.argv[3:]
m = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=4)
for wav in wavs:
    segs, info = m.transcribe(load16k(wav), language="en", word_timestamps=True,
                              beam_size=5, vad_filter=False,
                              initial_prompt="Um, uh, so, yeah. I mean, like, you know.")
    out = {"file": os.path.basename(wav), "language": info.language, "segments": []}
    for s in segs:
        out["segments"].append({"start": s.start, "end": s.end, "text": s.text,
            "words": [{"w": w.word, "s": w.start, "e": w.end, "p": w.probability} for w in s.words]})
    base = os.path.splitext(os.path.basename(wav))[0]
    json.dump(out, open(os.path.join(out_dir, base + ".json"), "w"), indent=1)
    print("done", base, flush=True)
