import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Tap-to-sign field storing the signature as a PNG Blob.
 *
 * Collapsed: shows the saved signature image (or a "Tap to sign" prompt).
 * Expanded: a signature_pad canvas with Save / Clear / Cancel.
 */
export function SignatureField({
  value,
  onChange,
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}) {
  const [signing, setSigning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  // Object URL for the saved signature image. Created in an effect (not
  // useMemo) so each mount owns its URL — StrictMode's double-mount would
  // otherwise revoke a URL that is still in use.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!value) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  // Mount signature pad when the canvas opens; scale for devicePixelRatio
  useEffect(() => {
    if (!signing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
    padRef.current = pad;
    return () => {
      pad.off();
      padRef.current = null;
    };
  }, [signing]);

  const save = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setSigning(false);
      return;
    }
    canvasRef.current?.toBlob((blob) => {
      if (blob) onChange(blob);
      setSigning(false);
    }, 'image/png');
  };

  if (signing) {
    return (
      <div className="space-y-2">
        <canvas
          ref={canvasRef}
          className="w-full h-40 border-2 border-navy rounded-lg touch-none bg-white"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setSigning(false)}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={() => padRef.current?.clear()}>
            Clear
          </Button>
          <Button size="sm" onClick={save}>
            Save Signature
          </Button>
        </div>
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="relative border border-gray-200 rounded-lg bg-white">
        <img src={imageUrl} alt="Signature" className="h-24 mx-auto object-contain" />
        <button
          type="button"
          title="Clear signature"
          className="absolute top-1 right-1 p-2 text-gray-400 hover:text-gray-600"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center gap-2 text-gray-400 hover:border-navy hover:text-navy transition-colors"
      onClick={() => setSigning(true)}
    >
      <PenLine className="h-5 w-5" />
      Tap to sign
    </button>
  );
}
