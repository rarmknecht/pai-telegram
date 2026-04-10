#!/usr/bin/env python3
"""
Transcribe an audio file using faster-whisper.
Usage: python transcribe.py <audio_file_path>
Prints transcript text to stdout.
"""

import sys
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: transcribe.py <audio_file>", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"File not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    from faster_whisper import WhisperModel

    # Use tiny model for speed; downloads on first run (~75MB)
    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio_path, beam_size=1)

    transcript = " ".join(segment.text.strip() for segment in segments)
    print(transcript)

if __name__ == "__main__":
    main()
