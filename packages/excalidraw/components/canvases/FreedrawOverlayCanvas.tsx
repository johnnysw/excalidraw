import React, { useEffect, useRef } from "react";

type FreedrawOverlayCanvasProps = {
  width: number;
  height: number;
  scale: number;
  registerCanvas: (canvas: HTMLCanvasElement | null) => void;
};

const FreedrawOverlayCanvas = ({
  width,
  height,
  scale,
  registerCanvas,
}: FreedrawOverlayCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    registerCanvas(canvasRef.current);
    return () => registerCanvas(null);
  }, [registerCanvas]);

  return (
    <canvas
      className="excalidraw__canvas freedraw-overlay"
      style={{ width, height, pointerEvents: "none" }}
      width={width * scale}
      height={height * scale}
      ref={canvasRef}
    />
  );
};

export default React.memo(FreedrawOverlayCanvas);
