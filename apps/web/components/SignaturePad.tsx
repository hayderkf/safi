"use client";
// لوحة توقيع بسيطة (canvas) — ترسم بالمؤشّر وتُصدِّر dataURL عند انتهاء كل خطّة.
import { useRef, useState } from "react";

export default function SignaturePad({
  value,
  onChange,
}: {
  value?: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(!!value);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    c.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = c.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2c2c2a";
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    onChange(ref.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="sig">
      <canvas
        ref={ref}
        width={320}
        height={120}
        className="sig-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button type="button" className="del-btn" onClick={clear} disabled={!hasInk}>
        مسح التوقيع
      </button>
    </div>
  );
}
