import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** Finger signature on a canvas. Calls onChange with a PNG data URL, or null when cleared. */
export function SignaturePad({ onChange, label }: { onChange: (dataUrl: string | null) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * ratio;
    c.height = h * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={ref}
          aria-label={label}
          className="h-40 w-full touch-none rounded-[16px] border-2 border-dashed border-line-strong bg-white"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const ctx = e.currentTarget.getContext('2d')!;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext('2d')!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            if (empty) setEmpty(false);
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            if (!empty) onChange(e.currentTarget.toDataURL('image/png'));
          }}
        />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-[15px] text-[#888]">{label}</span>}
      </div>
      {!empty && (
        <button type="button" onClick={clear} className="mt-1 text-[14px] text-muted underline underline-offset-2">
          Clear
        </button>
      )}
    </div>
  );
}
