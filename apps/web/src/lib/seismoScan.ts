// On-device OCR for Instantel seismograph printout photos.
//
// Tesseract runs fully in the browser from self-hosted assets (public/ocr/),
// so scanning works offline in the field once the app is installed. The
// parse itself (label matching, sanity limits) lives in @shotlog/shared.

import { createWorker, OEM, type Worker } from 'tesseract.js';
import { parseInstantelPrintout, type InstantelReading } from '@shotlog/shared';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/tesseract-core-simd-lstm.wasm.js',
    langPath: '/ocr',
  });
  return workerPromise;
}

/** Decode EXIF-upright, downscale, grayscale with a percentile contrast stretch */
async function toCanvas(file: Blob, maxDim = 2200): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const lum = new Uint8Array(d.length / 4);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
  }
  // Percentile stretch: dark phone photos of thermal paper need the lift
  const hist = new Uint32Array(256);
  for (const v of lum) hist[v]++;
  const total = lum.length;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.05) { lo = v; break; }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total * 0.05) { hi = v; break; }
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < lum.length; i++) {
    const v = Math.max(0, Math.min(255, ((lum[i] - lo) * 255) / range)) | 0;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function rotated(src: HTMLCanvasElement, deg: 90 | 180 | 270): HTMLCanvasElement {
  const out = document.createElement('canvas');
  const swap = deg !== 180;
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/** Raw text of the winning OCR pass — diagnostics only */
export let lastOcrText = '';

export interface ScanProgress {
  /** 1-based attempt number (each is one rotation of the photo) */
  attempt: number;
  attempts: number;
}

/**
 * OCR the photo at each rotation until the parse looks solid; return the
 * best result, or null when nothing readable was found.
 */
export async function scanSeismoPrintout(
  file: Blob,
  onProgress?: (p: ScanProgress) => void,
): Promise<InstantelReading | null> {
  const base = await toCanvas(file);
  const worker = await getWorker();
  const rotations = [0, 270, 90, 180] as const;
  let best: InstantelReading | null = null;
  for (let i = 0; i < rotations.length; i++) {
    onProgress?.({ attempt: i + 1, attempts: rotations.length });
    const deg = rotations[i];
    const canvas = deg === 0 ? base : rotated(base, deg);
    const { data } = await worker.recognize(canvas);
    const parsed = parseInstantelPrintout(data.text);
    if (!best || parsed.score > best.score) {
      best = parsed;
      lastOcrText = data.text;
      (window as unknown as { __lastOcrText?: string }).__lastOcrText = data.text;
    }
    if (parsed.score >= 8) break; // solid read — stop burning battery
  }
  return best && best.score >= 3 ? best : null;
}
