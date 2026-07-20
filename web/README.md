# Chordspace web app

Chordspace is a desktop-first browser instrument controlled by the center of five tracked fingertips. It combines MediaPipe Tasks hand tracking, a Canvas chord wheel, and low-latency Web Audio synthesis.

## Run locally

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal. Camera access works on localhost; deployed versions must use HTTPS. Select **Enter Chordspace** to grant camera permission and unlock browser audio.

## Features

- full-window mirrored camera
- five fingertip markers converging on one hand cursor
- immediate chord activation with short audio transitions
- automatic preference for the built-in MacBook or FaceTime camera
- manual camera selector when multiple cameras are present
- searchable major, minor, and diminished chord catalog
- locally persisted wheel configuration
- responsive glass interface designed for desktop browsers

## Build

```bash
npm run build
```
