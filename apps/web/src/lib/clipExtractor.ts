// Physical clip extraction: play the marked in→out range of a video through
// an offscreen <video> and re-record it with MediaRecorder. Works for any
// format the device can PLAY (iPhone HEVC on Safari, webm on Android — the
// formats phones actually produce), needs no wasm, and outputs MP4 where the
// browser supports it (Safari, branded Chrome) with a WebM fallback.
// Runs at playback speed — a 30s clip takes ~30s, hence the progress callback.

const PREFERRED_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
];

export function pickRecorderType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

/** File extension for a recorder mime type */
export function clipExtension(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

export interface ClipProgress {
  /** Seconds of the clip captured so far */
  done: number;
  total: number;
}

/**
 * Extract [inS, outS] from a video blob by real-time re-recording.
 * Rejects if the device can't play the source or can't record.
 */
export function extractClip(
  source: Blob,
  inS: number,
  outS: number,
  onProgress?: (p: ClipProgress) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mimeType = pickRecorderType();
    if (!mimeType) return reject(new Error('this device cannot record video clips'));
    if (!(outS > inS)) return reject(new Error('clip end must be after clip start'));

    const url = URL.createObjectURL(source);
    const video = document.createElement('video');
    video.src = url;
    video.playsInline = true;
    video.volume = 0; // silent playback; captureStream still carries the audio track
    video.style.position = 'fixed';
    video.style.left = '-10000px';
    video.style.width = '640px';
    document.body.appendChild(video);

    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    let finished = false;

    const cleanup = () => {
      video.pause();
      video.remove();
      URL.revokeObjectURL(url);
    };
    const fail = (err: Error) => {
      if (finished) return;
      finished = true;
      try {
        recorder?.stop();
      } catch {
        /* already stopped */
      }
      cleanup();
      reject(err);
    };

    const guard = setTimeout(
      () => fail(new Error('clip extraction timed out')),
      (outS - inS) * 1000 + 30000,
    );

    video.onerror = () => fail(new Error('this device cannot play the video'));
    video.onloadedmetadata = () => {
      video.currentTime = inS;
    };
    video.onseeked = () => {
      if (recorder) return; // only the initial seek starts recording
      const stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        cleanup();
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (blob.size === 0) reject(new Error('extraction produced no data'));
        else resolve(blob);
      };
      recorder.start(500);
      void video.play().catch(() => fail(new Error('playback failed during extraction')));
    };
    video.ontimeupdate = () => {
      onProgress?.({ done: Math.max(0, video.currentTime - inS), total: outS - inS });
      if (video.currentTime >= outS && recorder && recorder.state === 'recording') {
        video.pause();
        recorder.stop();
      }
    };
    video.onended = () => {
      // source shorter than the out mark — take what we got
      if (recorder && recorder.state === 'recording') recorder.stop();
    };
  });
}
