# Chordspace

The polished browser version lives in `web/` and is now the recommended way to run the instrument. It uses the browser camera, MediaPipe Tasks, Canvas, and the Web Audio API, so no Python environment is required.

```bash
cd web
npm install
npm run dev
```

Open the displayed local address in Chrome or Safari, select **Enter Chordspace**, and allow camera access. The browser prefers a camera named MacBook or FaceTime over Continuity Camera when both are available. The original Python prototype remains available below.

A desktop prototype that turns the center of your five tracked fingertips—or the mouse—into a cursor for a customizable chord wheel. The mirrored camera fills the window, with the wheel shown as a translucent overlay on the right. Entering a section sustains a synthesized chord, moving between sections crossfades the sound, and leaving the wheel fades it out.

## Requirements

- Python 3.11
- A webcam for hand control (mouse control works without one)
- An audio output device

The app uses OpenCV and MediaPipe for tracking, Pygame for the interface, and sounddevice/NumPy for its real-time synthesizer. No microphone, paid service, or external API is used.

## Installation

Create a virtual environment from this directory:

```bash
python3.11 -m venv .venv
```

On macOS or Linux:

```bash
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python3.11 main.py
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

On Linux, sounddevice uses PortAudio. If installation or device opening fails, install the system package first (for example, `sudo apt install libportaudio2 portaudio19-dev` on Debian/Ubuntu). The macOS and Windows wheels normally include what is needed.

## Controls

- Move your whole hand to control the cursor. All five fingertips are marked, and their guide lines converge on the active cursor.
- Move the cursor into a wheel section to play it immediately; there is no hover delay.
- Click the chord search field, type a symbol such as `C`, `F#m`, or `Bb dim`, and press Enter or choose a suggestion to add it.
- Click the `×` on a chord chip to remove that chord from the wheel.
- Press `M` to switch between hand and mouse control.
- Press `Esc` or close the window to exit.
- Start without a camera using `python main.py --mouse`.
- Choose another camera using `python main.py --camera-index 1`.

The camera preview is mirrored so hand movement feels natural. If camera or MediaPipe startup fails, the app reports the problem and automatically uses mouse mode. Audio startup failure is also reported without closing the interface.

## Permissions

On first run, allow the terminal or Python application to access the camera:

- **macOS:** System Settings → Privacy & Security → Camera.
- **Windows:** Settings → Privacy & security → Camera, then allow desktop apps.
- **Linux:** Ensure the user can access `/dev/video*`; sandboxed application packages may need separate camera permission.

Microphone permission is not required. This app only reads video and writes synthesized audio to the selected output device.

## Editing chords

Use the editor in the lower-left corner to add and remove chords while the app is running. It includes searchable major, minor, and diminished triads for all twelve roots and supports sharp or flat input. The wheel allows up to twelve chords and redistributes its pie sections immediately.

To change the startup selection, edit `CHORDS` in `config.py`. Each entry contains the displayed name, a tuple of note names, and its RGB section color. Restart the app after changing the startup configuration.

## Troubleshooting

- **No webcam or permission denied:** run `python main.py --mouse`, check the permission settings above, or try another `--camera-index`.
- **No hand detected:** use even front lighting, keep the full hand in frame, and point with the palm visible.
- **No audio device:** connect or select a system output device, then restart. On Linux, install PortAudio as described above.
- **MediaPipe installation fails:** confirm the virtual environment is using Python 3.11 and a supported 64-bit operating system. The app pins MediaPipe 0.10.21 because version 0.10.31 removed the legacy hand-tracking API it uses.
- **Slow video:** close other webcam applications and reduce system load. The tracker requests a 640×360 camera frame and uses MediaPipe's lightweight hand model.
