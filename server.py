#!/usr/bin/env python3
import os
import sys
import time
import glob
import shutil
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = "/home/mobydural/tetris-effect-3d"
TRACKS_DIR = os.path.join(BASE_DIR, "audio_tracks")
os.makedirs(TRACKS_DIR, exist_ok=True)

STAGE_FILES = ["abismo.mp3", "cyberpunk.mp3", "cosmos.mp3"]

def auto_scan_downloads():
    """Periodically scans ChromeOS shared Downloads and Linux ~/Downloads for the 3 newest audio files."""
    candidate_dirs = [
        "/mnt/chromeos/MyFiles/Downloads",
        "/home/mobydural/Downloads"
    ]
    while True:
        try:
            for d in candidate_dirs:
                if not os.path.isdir(d):
                    continue
                files = []
                for ext in ("*.mp3", "*.wav", "*.ogg", "*.m4a"):
                    files.extend(glob.glob(os.path.join(d, ext)))
                if len(files) >= 3:
                    # Take the 3 most recently modified files, then sort those 3 chronologically (oldest -> newest)
                    files.sort(key=lambda f: os.path.getmtime(f), reverse=True)
                    latest_three = sorted(files[:3], key=lambda f: os.path.getmtime(f))
                    for idx, src in enumerate(latest_three):
                        dst = os.path.join(TRACKS_DIR, STAGE_FILES[idx])
                        if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
                            shutil.copy2(src, dst)
                            print(f"[AutoScan] Copied Stage {idx} ({STAGE_FILES[idx]}) from {src}", flush=True)
        except Exception as e:
            pass
        time.sleep(2.0)

class TetrisHTTPRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        pass

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/save-track":
            qs = parse_qs(parsed.query)
            stage_str = qs.get("stage", ["0"])[0]
            try:
                stage_idx = max(0, min(2, int(stage_str)))
            except ValueError:
                stage_idx = 0
            length = int(self.headers.get("Content-Length", "0"))
            data = self.rfile.read(length) if length > 0 else b""
            if data:
                dst = os.path.join(TRACKS_DIR, STAGE_FILES[stage_idx])
                with open(dst, "wb") as f:
                    f.write(data)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
                return
        self.send_response(400)
        self.end_headers()

if __name__ == "__main__":
    t = threading.Thread(target=auto_scan_downloads, daemon=True)
    t.start()
    server = ThreadingHTTPServer(("0.0.0.0", 8095), TetrisHTTPRequestHandler)
    print("Serving Tetris Effect 3D on 0.0.0.0:8095", flush=True)
    server.serve_forever()
