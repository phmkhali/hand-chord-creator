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
  transposeChord,
} from "./chords";
import { isClosedFist } from "./gesture";

const STORAGE_KEY = "chordspace-wheel-v2";
const LEGACY_STORAGE_KEY = "chordspace-wheel-v1";
const SESSION_NAME_KEY = "chordspace-wheel-name";
const MAX_CHORDS = 16;
const MAX_CANVAS_DENSITY = 1.5;
const NORMAL_TRACKING_INTERVAL_MS = 50;
const REDUCED_TRACKING_INTERVAL_MS = 80;
const SLOW_FRAME_THRESHOLD_MS = 32;
const RECOVERY_FRAME_THRESHOLD_MS = 20;
const MAX_CONSECUTIVE_TRACKING_FAILURES = 3;
const TIP_INDEXES = [4, 8, 12, 16, 20];

type Point = { x: number; y: number };

type WheelChord = Chord & {
  transposedLabel: string | null;
  transposedName: string | null;
};

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
  chords: WheelChord[],
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
    const labelOffset = chords.length <= 10 ? (chord.transposedLabel ? 13 : 7) : (chord.transposedLabel ? 7 : 0);
    context.font = `600 ${Math.max(13, Math.min(18, radius / 15))}px system-ui, sans-serif`;
    context.fillText(chord.label, x, y - labelOffset);
    if (chord.transposedLabel) {
      context.fillStyle = "rgba(255,255,255,.72)";
      context.font = `500 ${Math.max(10, Math.min(13, radius / 20))}px monospace`;
      context.fillText(`(${chord.transposedLabel})`, x, y + (chords.length <= 10 ? 4 : 9));
    }
    if (chords.length <= 10) {
      context.fillStyle = "rgba(255,255,255,.52)";
      context.font = "500 10px monospace";
      context.fillText(chord.notes.join(" · "), x, y + (chord.transposedLabel ? 19 : 10));
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
  const wheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastTrackingTimeRef = useRef(0);
  const averageProcessingTimeRef = useRef(0);
  const trackingIntervalRef = useRef(NORMAL_TRACKING_INTERVAL_MS);
  const trackingFailureCountRef = useRef(0);
  const smoothedTipsRef = useRef<Point[]>([]);
  const chordsRef = useRef<WheelChord[]>(defaultChords.map((chord) => ({
    ...chord,
    transposedLabel: null,
    transposedName: null,
  })));
  const activeIndexRef = useRef<number | null>(null);
  const handDetectedRef = useRef(false);
  const fistClosedRef = useRef(false);
  const audioRef = useRef(new ChordAudioEngine());

  const [chords, setChords] = useState(defaultChords);
  const [transpose, setTranspose] = useState(0);
  const [chordSetName, setChordSetName] = useState("");
  const [isAddSectionExpanded, setIsAddSectionExpanded] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Explore 250+ triads, sevenths, extensions, and suspensions");
  const [launchState, setLaunchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [handDetected, setHandDetected] = useState(false);
  const [fistClosed, setFistClosed] = useState(false);
  const [activeChord, setActiveChord] = useState<WheelChord | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");

  const suggestions = useMemo(() => searchChords(query), [query]);
  const wheelChords = useMemo(
    () => chords.map((chord) => {
      const soundingChord = transposeChord(chord, transpose);
      return {
        ...soundingChord,
        label: chord.label,
        name: chord.name,
        hue: chord.hue,
        transposedLabel: transpose ? soundingChord.label : null,
        transposedName: transpose ? soundingChord.name : null,
      };
    }),
    [chords, transpose],
  );

  const renderWheel = useCallback((activeIndex = activeIndexRef.current) => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const density = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DENSITY);
    const pixelWidth = Math.round(width * density);
    const pixelHeight = Math.round(height * density);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, width, height);
    drawWheel(context, chordsRef.current, activeIndex, width, height);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[] | { chordIds?: string[]; transpose?: number };
        const chordIds = Array.isArray(parsed) ? parsed : parsed.chordIds;
        if (chordIds) {
          setChords(restoreChords(chordIds));
        }
        if (!Array.isArray(parsed) && Number.isFinite(parsed.transpose)) {
          setTranspose(Math.max(-12, Math.min(12, parsed.transpose || 0)));
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setChordSetName(window.sessionStorage.getItem(SESSION_NAME_KEY) || "");
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    chordsRef.current = wheelChords;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      chordIds: chords.map((chord) => chord.id),
      transpose,
    }));
    if (activeIndexRef.current !== null) {
      activeIndexRef.current = null;
      setActiveChord(null);
      audioRef.current.stop();
    }
    renderWheel(null);
  }, [chords, renderWheel, storageReady, transpose, wheelChords]);

  useEffect(() => {
    if (!storageReady) return;
    window.sessionStorage.setItem(SESSION_NAME_KEY, chordSetName);
  }, [chordSetName, storageReady]);

  useEffect(() => {
    const handleResize = () => renderWheel();
    window.addEventListener("resize", handleResize);
    renderWheel();
    return () => window.removeEventListener("resize", handleResize);
  }, [renderWheel]);

  const renderFrame = useCallback(function renderTrackingFrame(timestamp: number) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    animationRef.current = window.requestAnimationFrame(renderTrackingFrame);
    if (
      document.hidden
      || timestamp - lastTrackingTimeRef.current < trackingIntervalRef.current
    ) {
      return;
    }
    lastTrackingTimeRef.current = timestamp;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const density = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DENSITY);
    const pixelWidth = Math.round(width * density);
    const pixelHeight = Math.round(height * density);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, width, height);

    let tips: Point[] = [];
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const processingStartedAt = performance.now();
      let landmarks: NormalizedLandmark[] | undefined;
      try {
        const result = landmarker.detectForVideo(video, timestamp);
        landmarks = result.landmarks[0] as NormalizedLandmark[] | undefined;
        trackingFailureCountRef.current = 0;
      } catch (error) {
        trackingFailureCountRef.current += 1;
        if (trackingFailureCountRef.current >= MAX_CONSECUTIVE_TRACKING_FAILURES) {
          if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          handLandmarkerRef.current?.close();
          handLandmarkerRef.current = null;
          audioRef.current.stop();
          setErrorMessage(error instanceof Error ? error.message : "Hand tracking stopped unexpectedly.");
          setLaunchState("error");
        }
        return;
      }
      const processingDuration = performance.now() - processingStartedAt;
      averageProcessingTimeRef.current = averageProcessingTimeRef.current
        ? averageProcessingTimeRef.current * 0.9 + processingDuration * 0.1
        : processingDuration;
      if (averageProcessingTimeRef.current > SLOW_FRAME_THRESHOLD_MS) {
        trackingIntervalRef.current = REDUCED_TRACKING_INTERVAL_MS;
      } else if (averageProcessingTimeRef.current < RECOVERY_FRAME_THRESHOLD_MS) {
        trackingIntervalRef.current = NORMAL_TRACKING_INTERVAL_MS;
      }
      if (landmarks) {
        const fist = isClosedFist(landmarks);
        if (fist !== fistClosedRef.current) {
          fistClosedRef.current = fist;
          setFistClosed(fist);
        }
        if (fist) {
          smoothedTipsRef.current = [];
        } else {
          const rawTips = TIP_INDEXES.map((index) => ({ x: landmarks[index].x, y: landmarks[index].y }));
          if (!smoothedTipsRef.current.length) smoothedTipsRef.current = rawTips;
          smoothedTipsRef.current = rawTips.map((tip, index) => ({
            x: smoothedTipsRef.current[index].x + (tip.x - smoothedTipsRef.current[index].x) * 0.7,
            y: smoothedTipsRef.current[index].y + (tip.y - smoothedTipsRef.current[index].y) * 0.7,
          }));
        }
        if (!handDetectedRef.current) {
          handDetectedRef.current = true;
          setHandDetected(true);
        }
      } else {
        smoothedTipsRef.current = [];
        if (fistClosedRef.current) {
          fistClosedRef.current = false;
          setFistClosed(false);
        }
        if (handDetectedRef.current) {
          handDetectedRef.current = false;
          setHandDetected(false);
        }
      }
    }

    if (smoothedTipsRef.current.length && video.videoWidth && video.videoHeight) {
      tips = smoothedTipsRef.current.map((tip) => mapLandmark(tip, video, width, height));
    }
    const detected = tips.length === TIP_INDEXES.length && !fistClosedRef.current;

    let cursor: Point | null = null;
    let activeIndex: number | null = fistClosedRef.current ? activeIndexRef.current : null;
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
      renderWheel(activeIndex);
    }

    if (cursor) drawHand(context, tips, cursor);
  }, [renderWheel]);

  const selectCamera = useCallback(async (deviceId?: string) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 960, max: 1280 },
        height: { ideal: 540, max: 720 },
        frameRate: { ideal: 24, max: 30 },
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
      lastTrackingTimeRef.current = 0;
      averageProcessingTimeRef.current = 0;
      trackingIntervalRef.current = NORMAL_TRACKING_INTERVAL_MS;
      trackingFailureCountRef.current = 0;
      renderWheel();
      animationRef.current = window.requestAnimationFrame(renderFrame);
    } catch (error) {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      handLandmarkerRef.current?.close();
      handLandmarkerRef.current = null;
      try {
        await audioRef.current.close();
      } catch (cleanupError) {
        console.error("audio cleanup failed after instrument startup error", cleanupError);
      }
      const detail = error instanceof Error ? error.message : "Camera or hand tracking could not start.";
      setErrorMessage(detail);
      setLaunchState("error");
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = isVisible;
      });
      if (!isVisible) {
        if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
        videoRef.current?.pause();
        activeIndexRef.current = null;
        setActiveChord(null);
        audioRef.current.stop();
        renderWheel(null);
        return;
      }
      if (launchState === "ready" && animationRef.current === null) {
        lastVideoTimeRef.current = -1;
        lastTrackingTimeRef.current = 0;
        const playback = videoRef.current?.play();
        playback?.catch((error) => {
          if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setErrorMessage(error instanceof Error ? error.message : "Camera preview could not resume.");
          setLaunchState("error");
        });
        animationRef.current = window.requestAnimationFrame(renderFrame);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [launchState, renderFrame, renderWheel]);

  useEffect(() => () => {
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    handLandmarkerRef.current?.close();
    void audioRef.current.close().catch((error) => {
      console.error("audio cleanup failed", error);
    });
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

  const removeAllChords = () => {
    setChords([]);
    setMessage("All chords removed");
    activeIndexRef.current = null;
    setActiveChord(null);
    audioRef.current.stop();
  };

  return (
    <main className="instrument-shell">
      <video ref={videoRef} className="camera-feed" playsInline muted aria-label="Mirrored camera preview" />
      <div className="ambient-grid" />
      <canvas ref={wheelCanvasRef} className="wheel-canvas" aria-hidden="true" />
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
          <span>{launchState === "ready" ? (fistClosed ? "Cursor hidden · chord held" : handDetected ? "Hand linked" : "Show your hand") : "Instrument idle"}</span>
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
          <div className="panel-tools">
            <div className="transpose-control" aria-label="Global transpose">
              <button type="button" onClick={() => setTranspose((value) => Math.max(-12, value - 1))} aria-label="Transpose down one semitone">−</button>
              <span>{transpose > 0 ? `+${transpose}` : transpose} st</span>
              <button type="button" onClick={() => setTranspose((value) => Math.min(12, value + 1))} aria-label="Transpose up one semitone">+</button>
            </div>
            <span className="chord-count">{chords.length}/{MAX_CHORDS}</span>
          </div>
        </div>
        <input
          className="chord-set-name"
          value={chordSetName}
          onChange={(event) => setChordSetName(event.target.value)}
          placeholder="Name this chord set"
          aria-label="Chord set name"
          maxLength={48}
        />
        <div className="chord-chips">
          {wheelChords.map((chord) => (
            <span className="chord-chip" key={chord.id} style={{ "--chord-hue": chord.hue } as React.CSSProperties}>
              <span>{chord.label}{chord.transposedLabel && <small> ({chord.transposedLabel})</small>}</span>
              <button type="button" onClick={() => removeChord(chord.id)} aria-label={`Remove ${chord.name}`}>×</button>
            </span>
          ))}
          {!chords.length && <span className="empty-library">No chords yet</span>}
        </div>
        <div className="library-actions">
          <button
            type="button"
            className="add-section-toggle"
            onClick={() => setIsAddSectionExpanded((isExpanded) => !isExpanded)}
            aria-expanded={isAddSectionExpanded}
            aria-controls="chord-add-section"
          >
            <span>Add chords</span>
            <span aria-hidden="true">{isAddSectionExpanded ? "−" : "+"}</span>
          </button>
          <button
            type="button"
            className="remove-all-button"
            onClick={removeAllChords}
            disabled={!chords.length}
          >
            Remove all
          </button>
        </div>
        <div
          id="chord-add-section"
          className={`add-section ${isAddSectionExpanded ? "expanded" : ""}`}
          hidden={!isAddSectionExpanded}
        >
          <form className="chord-search" onSubmit={submitChord}>
            <div className="search-field">
              <span className="search-symbol">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try Cmaj7, F#m9, or Bb13"
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
        </div>
        <p className="editor-message" aria-live="polite">{message}</p>
      </section>

      <div className={`now-playing ${activeChord ? "visible" : ""}`} aria-live="polite">
        <span className="level-bars"><i /><i /><i /></span>
        <div>
          <span>Now playing</span>
          <strong>{activeChord ? `${activeChord.name}${activeChord.transposedName ? ` (${activeChord.transposedName})` : ""}` : "—"}</strong>
        </div>
        <code>{activeChord?.notes.join("  ")}</code>
      </div>

      {launchState !== "ready" && (
        <section className="launch-overlay" aria-label="Start instrument">
          <div className="launch-card">
            <div className="launch-orbit"><span /><i /><i /><i /><i /><i /></div>
            <p className="eyebrow">A camera-powered instrument</p>
            <h2>Your hand becomes<br />the harmony.</h2>
            <p className="launch-copy">Five fingertips converge into one responsive cursor. Move into the wheel and sound follows instantly. Close your fist to hide the cursor while holding the chord.</p>
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
