// Physical clip extraction: play the marked in→out range through an
// offscreen <video>, paint each frame onto a canvas, and record the canvas
// stream (+ the element's audio routed through WebAudio). Built ONLY from
// APIs Safari implements — HTMLMediaElement.captureStream() does not exist
// there, which silently stalled the first version of this feature at 0s.
// Runs at playback speed — a 30s clip takes ~30s, hence the progress callback.

const PREFERRED_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
];

/** Longest edge of the extracted clip (bounds bitrate + encode cost) */
const CLIP_MAX_DIM = 1280;

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

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/**
 * Extract [inS, outS] from a video blob by real-time re-recording.
 * Audio: the element's track is routed via WebAudio into the recording
 * (never to the speakers). If unmuted playback is blocked (iOS gesture
 * rules after async hops), retries muted — a silent clip beats no clip.
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
    const video = document.createElement('video') as VideoWithRVFC;
    video.src = url;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.style.position = 'fixed';
    video.style.left = '-10000px';
    video.style.width = '320px';
    document.body.appendChild(video);

    const canvas = document.createElement('canvas');
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) {
      video.remove();
      URL.revokeObjectURL(url);
      return reject(new Error('canvas unavailable'));
    }

    let recorder: MediaRecorder | null = null;
    let audioCtx: AudioContext | null = null;
    let drawing = false;
    let finished = false;
    const chunks: Blob[] = [];

    const cleanup = () => {
      drawing = false;
      video.pause();
      video.remove();
      URL.revokeObjectURL(url);
      void audioCtx?.close().catch(() => undefined);
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

    // Frame pump: paint the current video frame; prefer rVFC (frame-accurate,
    // Safari 15.4+), fall back to rAF.
    const pump = () => {
      if (!drawing) return;
      try {
        ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        /* transient decode gap — keep pumping */
      }
      onProgress?.({ done: Math.max(0, video.currentTime - inS), total: outS - inS });
      if (video.currentTime >= outS) {
        drawing = false;
        video.pause();
        if (recorder && recorder.state === 'recording') recorder.stop();
        return;
      }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(pump);
      else requestAnimationFrame(pump);
    };

    const startRecording = async () => {
      const scale = Math.min(1, CLIP_MAX_DIM / Math.max(video.videoWidth || 1, video.videoHeight || 1));
      canvas.width = Math.max(2, Math.round((video.videoWidth || 320) * scale));
      canvas.height = Math.max(2, Math.round((video.videoHeight || 240) * scale));
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);

      const stream = canvas.captureStream(30);

      // Route the element's audio into the recording, never to the speakers
      try {
        audioCtx = new AudioContext();
        await audioCtx.resume().catch(() => undefined);
        const src = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
      } catch {
        // No audio path (rare) — record video-only
      }

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
      drawing = true;
      pump();

      try {
        await video.play();
      } catch {
        // iOS may refuse unmuted play after async hops — a silent clip
        // beats no clip
        video.muted = true;
        await video.play().catch(() => fail(new Error('playback failed during extraction')));
      }
    };

    video.onerror = () => fail(new Error('this device cannot play the video'));
    video.onloadedmetadata = () => {
      video.currentTime = inS;
    };
    video.onseeked = () => {
      if (recorder) return; // only the initial seek starts recording
      void startRecording().catch((e) =>
        fail(e instanceof Error ? e : new Error('extraction failed to start')),
      );
    };
    video.onended = () => {
      // source shorter than the out mark — take what we got
      drawing = false;
      if (recorder && recorder.state === 'recording') recorder.stop();
    };
  });
}
