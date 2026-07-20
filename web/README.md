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

- full-window mirrored camera without a dimming filter
- five fingertip markers converging on one hand cursor
- closed-fist hold that hides the cursor while the active chord keeps sounding
- immediate chord activation with short audio transitions
- automatic preference for the built-in MacBook or FaceTime camera
- manual camera selector when multiple cameras are present
- 252 searchable chords spanning triads, suspensions, sixths, sevenths, ninths, elevenths, and thirteenths
- global semitone transpose controls that retain each entered chord label and show the sounding chord in brackets
- locally persisted wheel configuration
- responsive glass interface designed for desktop browsers

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. Push the repository to GitHub, choose **GitHub Actions** as the Pages source under **Settings → Pages**, and push the `main` branch. The workflow builds the static export from `web/` and publishes it automatically.
