import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Results } from '@mediapipe/face_mesh';

export interface Point {
  x: number;
  y: number;
}

interface Orientation {
  yaw: number;
  pitch: number;
  roll: number;
  distance: number;
}

interface Observation {
  raw: Point;
  orientation: Orientation;
  timestamp: number;
  confidence: number;
}

interface CalibrationSample {
  gaze: Point;
  target: Point;
  orientation: Orientation;
}

interface CalibrationTransform {
  x: [number, number, number];
  y: [number, number, number];
}

export interface CalibrationTarget {
  id: number;
  label: string;
  position: Point;
}

export interface CalibrationState {
  mode: 'idle' | 'running' | 'complete';
  currentIndex: number;
  total: number;
  instructions: string;
  lastError?: string;
}

export interface TrackerStatus {
  cameraReady: boolean;
  trackerReady: boolean;
  permissionGranted: boolean;
  message: string;
}

export interface UseGazeTrackerResult {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  pointer: Point | null;
  pointerVisible: boolean;
  setPointerVisible: (visible: boolean) => void;
  isActive: boolean;
  start: () => Promise<void>;
  stop: () => void;
  calibration: {
    state: CalibrationState;
    targets: CalibrationTarget[];
    start: () => void;
    cancel: () => void;
    capture: () => void;
  };
  status: TrackerStatus;
}

const LEFT_EYE_CORNERS = { outer: 33, inner: 133, top: 159, bottom: 145 };
const RIGHT_EYE_CORNERS = { outer: 362, inner: 263, top: 386, bottom: 374 };
const LEFT_IRIS = [468, 469, 470, 471];
const RIGHT_IRIS = [473, 474, 475, 476];

const FOREHEAD = 10;
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

const DEFAULT_TRANSFORM: CalibrationTransform = {
  x: [1, 0, 0],
  y: [0, 1, 0],
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const average = (values: number[]) => values.reduce((acc, value) => acc + value, 0) / values.length;

const computeDistance = (a: Point & { z?: number }, b: Point & { z?: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const computeIrisCenter = (landmarks: Results['multiFaceLandmarks'][number], indices: number[]) => {
  const points = indices.map((index) => landmarks[index]);
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
    z: average(points.map((point) => point.z ?? 0)),
  };
};

const computeEyeFeatures = (
  landmarks: Results['multiFaceLandmarks'][number],
  corners: typeof LEFT_EYE_CORNERS,
  irisIndices: number[]
) => {
  const irisCenter = computeIrisCenter(landmarks, irisIndices);
  const outerCorner = landmarks[corners.outer];
  const innerCorner = landmarks[corners.inner];
  const top = landmarks[corners.top];
  const bottom = landmarks[corners.bottom];

  const horizontalRange = innerCorner.x - outerCorner.x;
  const verticalRange = top.y - bottom.y;

  const normalizedHorizontal = clamp((irisCenter.x - outerCorner.x) / horizontalRange, 0, 1);
  const normalizedVertical = clamp((irisCenter.y - bottom.y) / verticalRange, 0, 1);

  return {
    iris: irisCenter,
    normalizedHorizontal,
    normalizedVertical,
    eyeWidth: Math.abs(horizontalRange),
    eyeHeight: Math.abs(verticalRange),
  };
};

const computeRawGaze = (landmarks: Results['multiFaceLandmarks'][number]): { gaze: Point; confidence: number } => {
  const leftEye = computeEyeFeatures(landmarks, LEFT_EYE_CORNERS, LEFT_IRIS);
  const rightEye = computeEyeFeatures(landmarks, RIGHT_EYE_CORNERS, RIGHT_IRIS);

  const horizontal = (leftEye.normalizedHorizontal + (1 - rightEye.normalizedHorizontal)) / 2;
  const vertical = (leftEye.normalizedVertical + rightEye.normalizedVertical) / 2;

  const eyeWidth = (leftEye.eyeWidth + rightEye.eyeWidth) / 2;
  const eyeHeight = (leftEye.eyeHeight + rightEye.eyeHeight) / 2;

  const confidence = clamp(1 - Math.abs(leftEye.normalizedHorizontal - rightEye.normalizedHorizontal), 0, 1) *
    clamp(eyeWidth * 4, 0, 1) *
    clamp(eyeHeight * 8, 0, 1);

  return {
    gaze: {
      x: clamp(horizontal, 0, 1),
      y: clamp(vertical, 0, 1),
    },
    confidence,
  };
};

const computeOrientation = (landmarks: Results['multiFaceLandmarks'][number]): Orientation => {
  const forehead = landmarks[FOREHEAD];
  const nose = landmarks[NOSE_TIP];
  const chin = landmarks[CHIN];
  const leftCheek = landmarks[LEFT_CHEEK];
  const rightCheek = landmarks[RIGHT_CHEEK];

  const leftEye = computeIrisCenter(landmarks, LEFT_IRIS);
  const rightEye = computeIrisCenter(landmarks, RIGHT_IRIS);

  const yaw = Math.atan2(rightCheek.z - leftCheek.z, rightCheek.x - leftCheek.x);
  const pitch = Math.atan2(nose.z - forehead.z, nose.y - forehead.y);
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const distance = computeDistance(leftEye, rightEye) + computeDistance(forehead, chin);

  return { yaw, pitch, roll, distance };
};

const applyOrientationCompensation = (
  raw: Point,
  orientation: Orientation,
  baseline: Orientation | null
): Point => {
  if (!baseline) {
    return raw;
  }

  const yawDelta = orientation.yaw - baseline.yaw;
  const pitchDelta = orientation.pitch - baseline.pitch;
  const distanceRatio = baseline.distance / orientation.distance;

  const compensatedX = clamp(raw.x + yawDelta * 0.6, 0, 1);
  const compensatedY = clamp(raw.y + pitchDelta * 0.8, 0, 1);
  const zoomCompensation = 0.5 + (distanceRatio - 1) * 0.5;

  return {
    x: clamp((compensatedX - 0.5) * zoomCompensation + 0.5, 0, 1),
    y: clamp((compensatedY - 0.5) * zoomCompensation + 0.5, 0, 1),
  };
};

const applyCalibrationTransform = (point: Point, transform: CalibrationTransform): Point => {
  const x = transform.x[0] * point.x + transform.x[1] * point.y + transform.x[2];
  const y = transform.y[0] * point.x + transform.y[1] * point.y + transform.y[2];
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
  };
};

const invert3x3 = (matrix: number[][]): number[][] | null => {
  const [a, b, c] = matrix;
  const det =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);

  if (Math.abs(det) < 1e-6) {
    return null;
  }

  const invDet = 1 / det;

  const result = [
    [
      (b[1] * c[2] - b[2] * c[1]) * invDet,
      (a[2] * c[1] - a[1] * c[2]) * invDet,
      (a[1] * b[2] - a[2] * b[1]) * invDet,
    ],
    [
      (b[2] * c[0] - b[0] * c[2]) * invDet,
      (a[0] * c[2] - a[2] * c[0]) * invDet,
      (a[2] * b[0] - a[0] * b[2]) * invDet,
    ],
    [
      (b[0] * c[1] - b[1] * c[0]) * invDet,
      (a[1] * c[0] - a[0] * c[1]) * invDet,
      (a[0] * b[1] - a[1] * b[0]) * invDet,
    ],
  ];

  return result;
};

const multiplyMatrixVector = (matrix: number[][], vector: number[]) =>
  matrix.map((row) => row.reduce((acc, value, index) => acc + value * vector[index], 0));

const computeCalibrationTransform = (samples: CalibrationSample[]): CalibrationTransform => {
  if (samples.length < 3) {
    return DEFAULT_TRANSFORM;
  }

  const designMatrix = samples.map((sample) => [sample.gaze.x, sample.gaze.y, 1]);
  const targetX = samples.map((sample) => sample.target.x);
  const targetY = samples.map((sample) => sample.target.y);

  const xtx = designMatrix.reduce(
    (acc, row) => {
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          acc[i][j] += row[i] * row[j];
        }
      }
      return acc;
    },
    [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ] as number[][]
  );

  const xtxInv = invert3x3(xtx);
  if (!xtxInv) {
    return DEFAULT_TRANSFORM;
  }

  const xtyX = [0, 0, 0];
  const xtyY = [0, 0, 0];

  designMatrix.forEach((row, index) => {
    xtyX[0] += row[0] * targetX[index];
    xtyX[1] += row[1] * targetX[index];
    xtyX[2] += row[2] * targetX[index];

    xtyY[0] += row[0] * targetY[index];
    xtyY[1] += row[1] * targetY[index];
    xtyY[2] += row[2] * targetY[index];
  });

  const coefficientsX = multiplyMatrixVector(xtxInv, xtyX);
  const coefficientsY = multiplyMatrixVector(xtxInv, xtyY);

  return {
    x: [coefficientsX[0], coefficientsX[1], coefficientsX[2]],
    y: [coefficientsY[0], coefficientsY[1], coefficientsY[2]],
  };
};

const smoothing = (previous: Point | null, next: Point, factor: number) => {
  if (!previous) {
    return next;
  }

  return {
    x: previous.x * (1 - factor) + next.x * factor,
    y: previous.y * (1 - factor) + next.y * factor,
  };
};

const createCalibrationTargets = (): CalibrationTarget[] => {
  const grid = [0.15, 0.5, 0.85];
  const targets: CalibrationTarget[] = [];
  let id = 0;

  grid.forEach((y) => {
    grid.forEach((x) => {
      id += 1;
      targets.push({
        id,
        label: `${id}`,
        position: { x, y },
      });
    });
  });

  return targets;
};

const waitForVideoReady = (video: HTMLVideoElement) =>
  new Promise<void>((resolve) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }

    const handleLoadedData = () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      resolve();
    };

    video.addEventListener('loadeddata', handleLoadedData, { once: true });
  });

export const useGazeTracker = (): UseGazeTrackerResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceMeshRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [pointer, setPointer] = useState<Point | null>(null);
  const [pointerVisible, setPointerVisible] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<TrackerStatus>({
    cameraReady: false,
    trackerReady: false,
    permissionGranted: false,
    message: 'Autorisez l\'accès à la caméra pour commencer.',
  });

  const calibrationTargets = useMemo(() => createCalibrationTargets(), []);
  const [calibrationState, setCalibrationState] = useState<CalibrationState>({
    mode: 'idle',
    currentIndex: 0,
    total: calibrationTargets.length,
    instructions: 'Cliquez sur "Démarrer" puis suivez les points affichés.',
  });

  const calibrationSamplesRef = useRef<CalibrationSample[]>([]);
  const calibrationTransformRef = useRef<CalibrationTransform>(DEFAULT_TRANSFORM);
  const baselineOrientationRef = useRef<Orientation | null>(null);
  const latestObservationRef = useRef<Observation | null>(null);

  const teardown = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }
    faceMeshRef.current?.close?.();
    faceMeshRef.current = null;
    const canvasElement = canvasRef.current;
    if (canvasElement) {
      const context = canvasElement.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  const handleResults = useCallback(
    (results: Results) => {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        setStatus((prev) => ({
          ...prev,
          trackerReady: false,
          message: 'Visage non détecté. Positionnez-vous face à la caméra.',
        }));
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];
      const { gaze, confidence } = computeRawGaze(landmarks);
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;

      if (videoElement && canvasElement) {
        const context = canvasElement.getContext('2d');
        if (context) {
          const width = videoElement.videoWidth || canvasElement.width || 640;
          const height = videoElement.videoHeight || canvasElement.height || 480;
          if (canvasElement.width !== width || canvasElement.height !== height) {
            canvasElement.width = width;
            canvasElement.height = height;
          }
          context.clearRect(0, 0, width, height);
          context.beginPath();
          context.arc(gaze.x * width, gaze.y * height, 14, 0, Math.PI * 2);
          context.strokeStyle = 'rgba(56, 189, 248, 0.65)';
          context.lineWidth = 3;
          context.stroke();
        }
      }
      const orientation = computeOrientation(landmarks);

      latestObservationRef.current = {
        raw: gaze,
        orientation,
        timestamp: performance.now(),
        confidence,
      };

      if (!isActive) {
        return;
      }

      setStatus((prev) => ({
        ...prev,
        trackerReady: true,
        message: confidence < 0.2
          ? 'Clignez moins les yeux et restez dans le cadre.'
          : 'Suivi actif.',
      }));

      const compensated = applyOrientationCompensation(gaze, orientation, baselineOrientationRef.current);
      const calibrated = applyCalibrationTransform(compensated, calibrationTransformRef.current);

      setPointer((previous) => smoothing(previous, calibrated, 0.25));
    },
    [isActive]
  );

  const ensureTracker = useCallback(async () => {
    if (!videoRef.current) {
      throw new Error('La vidéo n\'est pas prête.');
    }

    if (!faceMeshRef.current) {
      const { FaceMesh } = await import('@mediapipe/face_mesh');
      faceMeshRef.current = new FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });
      faceMeshRef.current.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      faceMeshRef.current.onResults(handleResults);
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const message = 'Votre navigateur ne prend pas en charge l\'accès à la caméra.';
      setStatus({
        cameraReady: false,
        trackerReady: false,
        permissionGranted: false,
        message,
      });
      throw new Error(message);
    }

    if (!mediaStreamRef.current) {
      try {
        setStatus({
          cameraReady: false,
          trackerReady: false,
          permissionGranted: false,
          message: 'Demande d\'autorisation de la caméra en cours...',
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
        });
        mediaStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        await waitForVideoReady(videoRef.current);
        setStatus({
          cameraReady: true,
          trackerReady: false,
          permissionGranted: true,
          message: 'Caméra initialisée. Positionnez votre visage dans le cadre.',
        });
      } catch (error) {
        console.error(error);
        setStatus({
          cameraReady: false,
          trackerReady: false,
          permissionGranted: false,
          message: 'Impossible d\'accéder à la caméra. Vérifiez les autorisations.',
        });
        throw error;
      }
    }

    if (animationFrameRef.current === null) {
      const renderFrame = async () => {
        if (!videoRef.current || !faceMeshRef.current) {
          animationFrameRef.current = null;
          return;
        }

        try {
          await faceMeshRef.current.send({ image: videoRef.current });
        } catch (error) {
          console.error('Erreur lors du traitement de la frame', error);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          void renderFrame();
        });
      };

      animationFrameRef.current = requestAnimationFrame(() => {
        void renderFrame();
      });
    }
  }, [handleResults]);

  const start = useCallback(async () => {
    if (isActive) {
      return;
    }
    try {
      await ensureTracker();
      setIsActive(true);
      setPointer({ x: 0.5, y: 0.5 });
      setStatus((prev) => ({ ...prev, message: 'Suivi activé. Lancez l\'étalonnage pour de meilleurs résultats.' }));
    } catch (error) {
      console.error(error);
    }
  }, [ensureTracker, isActive]);

  const stop = useCallback(() => {
    if (!isActive) {
      return;
    }
    teardown();
    setIsActive(false);
    setPointer(null);
    baselineOrientationRef.current = null;
    calibrationTransformRef.current = DEFAULT_TRANSFORM;
    calibrationSamplesRef.current = [];
    setCalibrationState({
      mode: 'idle',
      currentIndex: 0,
      total: calibrationTargets.length,
      instructions: 'Suivi arrêté. Vous pouvez relancer l\'étalonnage après avoir réactivé le suivi.',
    });
    setStatus({
      cameraReady: false,
      trackerReady: false,
      permissionGranted: false,
      message: 'Suivi arrêté.',
    });
  }, [calibrationTargets.length, isActive, teardown]);

  const startCalibration = useCallback(() => {
    if (!isActive) {
      setStatus((prev) => ({
        ...prev,
        message: 'Activez le suivi avant de lancer l\'étalonnage.',
      }));
      return;
    }
    calibrationSamplesRef.current = [];
    baselineOrientationRef.current = null;
    calibrationTransformRef.current = DEFAULT_TRANSFORM;
    setCalibrationState({
      mode: 'running',
      currentIndex: 0,
      total: calibrationTargets.length,
      instructions: 'Regardez le point surligné puis appuyez sur Entrée ou cliquez sur "Valider le point".',
    });
    setStatus((prev) => ({
      ...prev,
      message: 'Étalonnage en cours... maintenez votre tête droite.',
    }));
  }, [calibrationTargets.length, isActive]);

  const finishCalibration = useCallback(() => {
    const transform = computeCalibrationTransform(calibrationSamplesRef.current);
    calibrationTransformRef.current = transform;
    if (calibrationSamplesRef.current.length > 0) {
      const orientationAverage: Orientation = calibrationSamplesRef.current.reduce(
        (acc, sample) => ({
          yaw: acc.yaw + sample.orientation.yaw,
          pitch: acc.pitch + sample.orientation.pitch,
          roll: acc.roll + sample.orientation.roll,
          distance: acc.distance + sample.orientation.distance,
        }),
        { yaw: 0, pitch: 0, roll: 0, distance: 0 }
      );
      const count = calibrationSamplesRef.current.length;
      baselineOrientationRef.current = {
        yaw: orientationAverage.yaw / count,
        pitch: orientationAverage.pitch / count,
        roll: orientationAverage.roll / count,
        distance: orientationAverage.distance / count,
      };
    }

    setCalibrationState((prev) => ({
      ...prev,
      mode: 'complete',
      instructions: 'Étalonnage terminé ! Vous pouvez désormais contrôler l\'interface avec votre regard.',
    }));

    setStatus((prev) => ({
      ...prev,
      message: 'Étalonnage terminé. Ajustez votre posture si nécessaire.',
    }));
  }, []);

  const captureCalibrationPoint = useCallback(() => {
    const observation = latestObservationRef.current;
    setCalibrationState((prev) => {
      if (prev.mode !== 'running') {
        return prev;
      }

      if (!observation || observation.confidence < 0.2) {
        return {
          ...prev,
          lastError: 'Nous ne pouvons pas valider ce point. Stabilisez votre regard et réessayez.',
        };
      }

      const target = calibrationTargets[prev.currentIndex];
      calibrationSamplesRef.current.push({
        gaze: observation.raw,
        target: target.position,
        orientation: observation.orientation,
      });

      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= calibrationTargets.length) {
        finishCalibration();
        return {
          ...prev,
          currentIndex: calibrationTargets.length - 1,
          lastError: undefined,
        };
      }

      return {
        ...prev,
        currentIndex: nextIndex,
        lastError: undefined,
      };
    });
  }, [calibrationTargets, finishCalibration]);

  const cancelCalibration = useCallback(() => {
    calibrationSamplesRef.current = [];
    setCalibrationState({
      mode: 'idle',
      currentIndex: 0,
      total: calibrationTargets.length,
      instructions: 'Étalonnage annulé. Vous pouvez recommencer à tout moment.',
    });
    setStatus((prev) => ({
      ...prev,
      message: 'Étalonnage annulé.',
    }));
  }, [calibrationTargets.length]);

  return {
    videoRef,
    canvasRef,
    pointer,
    pointerVisible,
    setPointerVisible,
    isActive,
    start,
    stop,
    calibration: {
      state: calibrationState,
      targets: calibrationTargets,
      start: startCalibration,
      cancel: cancelCalibration,
      capture: captureCalibrationPoint,
    },
    status,
  };
};
