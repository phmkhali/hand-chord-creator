"use client";

import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChordAudioEngine } from "./audio-engine";
import {
  type Chord,
  defaultChords,
  findChord,
  restoreChords,
  searchChords,
} from "./chords";

const STORAGE_KEY = "chordspace-wheel-v1";
const MAX_CHORDS = 12;
const TIP_INDEXES = [4, 8, 12, 16, 20];

type Point = { x: number; y: number };

const wheelGeometry = (width: number, height: number) => {
  const radius = Math.max(150, Math.min(width * 0.225, height * 0.36));
  return {
    center: { x: width - radius - Math.max(38, width * 0.035), y: height / 2 },
    radius,
  };
};

const mapLandmark = (
  landmark: Point,
  video: HTMLVideoElement,
  width: number,
  height: number,
): Point => {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const renderedWidth = video.videoWidth * scale;
  const renderedHeight = video.videoHeight * scale;
  return {
    x: (width - renderedWidth) / 2 + (1 - landmark.x) * renderedWidth,
    y: (height - renderedHeight) / 2 + landmark.y * renderedHeight,
  };
};

const sectionAtPoint = (point: Point, chords: Chord[], width: number, height: number) => {
  if (!chords.length) return null;
  const { center, radius } = wheelGeometry(width, height);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (dx * dx + dy * dy > radius * radius) return null;
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return Math.min(Math.floor(angle / ((Math.PI * 2) / chords.length)), chords.length - 1);
};

const roundedPolygon = (
  context: CanvasRenderingContext2D,
  points: Point[],
) => {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
};

const drawWheel = (
  context: CanvasRenderingContext2D,
  chords: Chord[],
  activeIndex: number | null,
  width: number,
  height: number,
) => {
  const { center, radius } = wheelGeometry(width, height);
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = 50;
  context.beginPath();
  context.arc(center.x, center.y, radius + 11, 0, Math.PI * 2);
  context.fillStyle = "rgba(6, 9, 14, 0.28)";
  context.fill();
  context.restore();

  if (!chords.length) {
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255,255,255,.2)";
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.68)";
    context.font = "500 16px Geist, sans-serif";
    context.textAlign = "center";
    context.fillText("Add a chord to begin", center.x, center.y + 5);
    return;
  }

  const sectionAngle = (Math.PI * 2) / chords.length;
  chords.forEach((chord, index) => {
    const start = index * sectionAngle - Math.PI / 2;
    const points = [center];
    for (let step = 0; step <= 24; step += 1) {
      const angle = start + (sectionAngle * step) / 24;
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
    roundedPolygon(context, points);
    const isActive = activeIndex === index;
    const gradient = context.createRadialGradient(center.x, center.y, radius * 0.05, center.x, center.y, radius);
    gradient.addColorStop(0, `hsla(${chord.hue}, 72%, 62%, ${isActive ? 0.48 : 0.17})`);
    gradient.addColorStop(1, `hsla(${chord.hue}, 78%, 58%, ${isActive ? 0.78 : 0.28})`);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = isActive ? "rgba(255,255,255,.74)" : "rgba(255,255,255,.16)";
    context.lineWidth = isActive ? 2 : 1;
    context.stroke();

    const middle = start + sectionAngle / 2;
    const labelRadius = radius * 0.67;
    const x = center.x + Math.cos(middle) * labelRadius;
    const y = center.y + Math.sin(middle) * labelRadius;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(255,255,255,.96)";
    context.font = `600 ${Math.max(13, Math.min(18, radius / 15))}px Geist, sans-serif`;
    context.fillText(chord.label, x, y - (chords.length <= 10 ? 7 : 0));
    if (chords.length <= 10) {
      context.fillStyle = "rgba(255,255,255,.52)";
      context.font = "500 10px Geist Mono, monospace";
      context.fillText(chord.notes.join(" · "), x, y + 10);
    }
  });

  context.beginPath();
  context.arc(center.x, center.y, Math.max(31, radius * 0.1), 0, Math.PI * 2);
  context.fillStyle = "rgba(7,10,15,.78)";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.18)";
  context.stroke();
};

const drawHand = (context: CanvasRenderingContext2D, tips: Point[], cursor: Point) => {
  context.save();
  context.lineCap = "round";
  for (const tip of tips) {
    const gradient = context.createLinearGradient(tip.x, tip.y, cursor.x, cursor.y);
    gradient.addColorStop(0, "rgba(209,245,255,.74)");
    gradient.addColorStop(1, "rgba(89,217,255,.2)");
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(cursor.x, cursor.y);
    context.strokeStyle = gradient;
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
    context.fillStyle = "rgba(235,251,255,.92)";
    context.fill();
    context.strokeStyle = "rgba(76,207,255,.9)";
    context.lineWidth = 2;
    context.stroke();
  }
  context.shadowColor = "rgba(84,213,255,.85)";
  context.shadowBlur = 24;
  context.beginPath();
  context.arc(cursor.x, cursor.y, 11, 0, Math.PI * 2);
  context.fillStyle = "rgba(8,16,23,.88)";
  context.fill();
  context.strokeStyle = "rgba(235,252,255,.98)";
  context.lineWidth = 2.5;
  context.stroke();
  context.restore();
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const smoothedTipsRef = useRef<Point[]>([]);
  const chordsRef = useRef<Chord[]>(defaultChords);
  const activeIndexRef = useRef<number | null>(null);
  const handDetectedRef = useRef(false);
  const audioRef = useRef(new ChordAudioEngine());

  const [chords, setChords] = useState(defaultChords);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Search major, minor, or diminished chords");
  const [launchState, setLaunchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [handDetected, setHandDetected] = useState(false);
  const [activeChord, setActiveChord] = useState<Chord | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");

  const suggestions = useMemo(() => searchChords(query, 5), [query]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const restored = restoreChords(JSON.parse(stored));
      if (restored.length) window.setTimeout(() => setChords(restored), 0);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    chordsRef.current = chords;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chords.map((chord) => chord.id)));
    if (activeIndexRef.current !== null && activeIndexRef.current >= chords.length) {
      activeIndexRef.current = null;
      setActiveChord(null);
      audioRef.current.stop();
    }
  }, [chords]);

  const renderFrame = useCallback(function renderTrackingFrame(timestamp: number) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== width * density || canvas.height !== height * density) {
      canvas.width = width * density;
      canvas.height = height * density;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, width, height);

    let tips: Point[] = [];
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, timestamp);
      const landmarks = result.landmarks[0] as NormalizedLandmark[] | undefined;
      if (landmarks) {
        const rawTips = TIP_INDEXES.map((index) => ({ x: landmarks[index].x, y: landmarks[index].y }));
        if (!smoothedTipsRef.current.length) smoothedTipsRef.current = rawTips;
        smoothedTipsRef.current = rawTips.map((tip, index) => ({
          x: smoothedTipsRef.current[index].x + (tip.x - smoothedTipsRef.current[index].x) * 0.7,
          y: smoothedTipsRef.current[index].y + (tip.y - smoothedTipsRef.current[index].y) * 0.7,
        }));
      } else {
        smoothedTipsRef.current = [];
      }
    }

    if (smoothedTipsRef.current.length && video.videoWidth && video.videoHeight) {
      tips = smoothedTipsRef.current.map((tip) => mapLandmark(tip, video, width, height));
    }
    const detected = tips.length === TIP_INDEXES.length;
    if (detected !== handDetectedRef.current) {
      handDetectedRef.current = detected;
      setHandDetected(detected);
    }

    let cursor: Point | null = null;
    let activeIndex: number | null = null;
    if (detected) {
      cursor = {
        x: tips.reduce((total, tip) => total + tip.x, 0) / tips.length,
        y: tips.reduce((total, tip) => total + tip.y, 0) / tips.length,
      };
      activeIndex = sectionAtPoint(cursor, chordsRef.current, width, height);
    }

    if (activeIndex !== activeIndexRef.current) {
      activeIndexRef.current = activeIndex;
      const chord = activeIndex === null ? null : chordsRef.current[activeIndex];
      setActiveChord(chord);
      if (chord) audioRef.current.play(chord);
      else audioRef.current.stop();
    }

    drawWheel(context, chordsRef.current, activeIndex, width, height);
    if (cursor) drawHand(context, tips, cursor);
    animationRef.current = window.requestAnimationFrame(renderTrackingFrame);
  }, []);

  const selectCamera = useCallback(async (deviceId?: string) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, min: 24 },
      },
    });
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return stream;
    video.srcObject = stream;
    await video.play();
    const selectedId = stream.getVideoTracks()[0].getSettings().deviceId || "";
    setCameraId(selectedId);
    return stream;
  }, []);

  const startInstrument = async () => {
    setLaunchState("loading");
    setErrorMessage("");
    try {
      await audioRef.current.start();
      const firstStream = await selectCamera();
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
      setCameras(devices);
      const builtIn = devices.find((device) => /macbook|facetime/i.test(device.label) && !/desk view/i.test(device.label));
      const currentId = firstStream.getVideoTracks()[0].getSettings().deviceId;
      if (builtIn?.deviceId && builtIn.deviceId !== currentId) await selectCamera(builtIn.deviceId);

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
      );
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      setLaunchState("ready");
      animationRef.current = window.requestAnimationFrame(renderFrame);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Camera or hand tracking could not start.";
      setErrorMessage(detail);
      setLaunchState("error");
    }
  };

  useEffect(() => () => {
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    handLandmarkerRef.current?.close();
    void audioRef.current.close();
  }, []);

  const addChord = (chord: Chord) => {
    if (chords.some((existing) => existing.id === chord.id)) {
      setMessage(`${chord.name} is already in the wheel`);
      return;
    }
    if (chords.length >= MAX_CHORDS) {
      setMessage(`Keep the wheel focused — ${MAX_CHORDS} chords maximum`);
      return;
    }
    setChords((current) => [...current, chord]);
    setQuery("");
    setMessage(`${chord.name} added`);
  };

  const submitChord = (event: FormEvent) => {
    event.preventDefault();
    const chord = findChord(query) || (suggestions.length === 1 ? suggestions[0] : null);
    if (chord) addChord(chord);
    else setMessage("Choose one of the matching chords");
  };

  const removeChord = (id: string) => {
    const chord = chords.find((entry) => entry.id === id);
    setChords((current) => current.filter((entry) => entry.id !== id));
    setMessage(`${chord?.name ?? "Chord"} removed`);
    activeIndexRef.current = null;
    setActiveChord(null);
    audioRef.current.stop();
  };

  return (
    <main className="instrument-shell">
      <video ref={videoRef} className="camera-feed" playsInline muted aria-label="Mirrored camera preview" />
      <div className="camera-shade" />
      <div className="ambient-grid" />
      <canvas ref={canvasRef} className="tracking-canvas" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <div>
            <strong>Chordspace</strong>
            <span>gesture instrument</span>
          </div>
        </div>
        <div className="system-controls">
          <span className={`status-dot ${launchState === "ready" ? "online" : ""}`} />
          <span>{launchState === "ready" ? (handDetected ? "Hand linked" : "Show your hand") : "Instrument idle"}</span>
          {cameras.length > 1 && (
            <label className="camera-select">
              <span>Camera</span>
              <select
                value={cameraId}
                onChange={(event) => void selectCamera(event.target.value)}
                aria-label="Select camera"
              >
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>{camera.label || "Camera"}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>

      <section className="editor-panel" aria-label="Chord wheel editor">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Wheel library</p>
            <h1>Shape your harmony</h1>
          </div>
          <span className="chord-count">{chords.length}/{MAX_CHORDS}</span>
        </div>
        <div className="chord-chips">
          {chords.map((chord) => (
            <span className="chord-chip" key={chord.id} style={{ "--chord-hue": chord.hue } as React.CSSProperties}>
              <span>{chord.label}</span>
              <button type="button" onClick={() => removeChord(chord.id)} aria-label={`Remove ${chord.name}`}>×</button>
            </span>
          ))}
          {!chords.length && <span className="empty-library">No chords yet</span>}
        </div>
        <form className="chord-search" onSubmit={submitChord}>
          <div className="search-field">
            <span className="search-symbol">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try F#m or Bb dim"
              aria-label="Search for a chord"
              autoComplete="off"
            />
            <button type="submit">Add</button>
          </div>
          {query && (
            <div className="suggestions" role="listbox" aria-label="Chord suggestions">
              {suggestions.map((chord) => (
                <button type="button" key={chord.id} onClick={() => addChord(chord)}>
                  <span className="suggestion-swatch" style={{ "--chord-hue": chord.hue } as React.CSSProperties} />
                  <strong>{chord.name}</strong>
                  <span>{chord.notes.join(" · ")}</span>
                </button>
              ))}
              {!suggestions.length && <p>No matching chord</p>}
            </div>
          )}
        </form>
        <p className="editor-message" aria-live="polite">{message}</p>
      </section>

      <div className={`now-playing ${activeChord ? "visible" : ""}`} aria-live="polite">
        <span className="level-bars"><i /><i /><i /></span>
        <div>
          <span>Now playing</span>
          <strong>{activeChord?.name ?? "—"}</strong>
        </div>
        <code>{activeChord?.notes.join("  ")}</code>
      </div>

      {launchState !== "ready" && (
        <section className="launch-overlay" aria-label="Start instrument">
          <div className="launch-card">
            <div className="launch-orbit"><span /><i /><i /><i /><i /><i /></div>
            <p className="eyebrow">A camera-powered instrument</p>
            <h2>Your hand becomes<br />the harmony.</h2>
            <p className="launch-copy">Five fingertips converge into one responsive cursor. Move into the wheel and sound follows instantly.</p>
            <button type="button" className="launch-button" onClick={() => void startInstrument()} disabled={launchState === "loading"}>
              <span>{launchState === "loading" ? "Preparing instrument" : launchState === "error" ? "Try again" : "Enter Chordspace"}</span>
              <b>↗</b>
            </button>
            {errorMessage && <p className="launch-error">{errorMessage}</p>}
            <div className="permission-note"><span>●</span> Camera stays on this device. No recording or upload.</div>
          </div>
        </section>
      )}
    </main>
  );
}
