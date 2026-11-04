"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Touch/mouse signature canvas. Calls onChange with a PNG data URL whenever a
 * stroke finishes, or null when cleared.
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#111";
    }
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const move = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }, [onChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-md border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{hasInk ? "Signature captured" : "Sign above"}</span>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
