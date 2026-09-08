// Small images that ride INSIDE synced records (2026-09-08, sync-volume
// round): the site-sketch snapshot on a shot and the signature on every
// signed record. They stay in the record because the PDF needs them offline
// on whatever device files the day — so they are made as small as a
// printout can bear: a snapshot capped at 1280 px and JPEG 0.7 (~10 KB
// instead of ~35), a signature cropped to its ink and downscaled (~3 KB
// instead of ~15). Both helpers are pure canvas work, no dependencies.

export const SNAPSHOT_MAX_DIM = 1280;
export const SNAPSHOT_QUALITY = 0.7;
export const SIGNATURE_MAX_WIDTH = 600;

/** Encode a canvas as a JPEG no larger than `maxDim` on its long side */
export async function encodeCanvasJpeg(
  source: HTMLCanvasElement,
  maxDim = SNAPSHOT_MAX_DIM,
  quality = SNAPSHOT_QUALITY,
): Promise<Blob | null> {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  let canvas = source;
  if (scale < 1) {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/** The ink's bounding box on a white-backed signature canvas (device pixels) */
export function inkBounds(ctx: CanvasRenderingContext2D, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // ink = anything darker than near-white (the pad's background is white)
      const dark = data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] < 600;
      if (dark) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Crop a signature canvas to its ink (with a margin), downscale so it is at
 *  most `maxWidth` px wide, and encode as PNG on white. */
export async function compactSignature(source: HTMLCanvasElement, maxWidth = SIGNATURE_MAX_WIDTH): Promise<Blob | null> {
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const bounds = inkBounds(ctx, source.width, source.height);
  if (!bounds) return null;
  const pad = Math.round(Math.max(bounds.w, bounds.h) * 0.06) + 4;
  const x = Math.max(0, bounds.x - pad);
  const y = Math.max(0, bounds.y - pad);
  const w = Math.min(source.width - x, bounds.w + pad * 2);
  const h = Math.min(source.height - y, bounds.h + pad * 2);
  const scale = Math.min(1, maxWidth / w);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(source, x, y, w, h, 0, 0, out.width, out.height);
  // Flatten to two colours: anti-aliased grey edges are what a PNG pays for,
  // and at ≤600 px a signature prints at ~300 dpi either way
  const img = octx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const ink = d[i] + d[i + 1] + d[i + 2] < 600;
    d[i] = d[i + 1] = d[i + 2] = ink ? 0 : 255;
    d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
}
