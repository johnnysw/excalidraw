import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke } from "@excalidraw/element/freedrawGeometry";

export type FreedrawGeometryWorkerRequest = {
  elementId: string;
  version: number;
  versionNonce: number;
  simulatePressure: boolean;
  strokeWidth: number;
  points: ArrayBuffer;
  pressures: ArrayBuffer;
  pointCount: number;
};

export type FreedrawGeometryWorkerResponse = {
  elementId: string;
  version: number;
  versionNonce: number;
  outline: ArrayBuffer;
  svgPath: string;
};

export const WorkerUrl: URL | undefined = import.meta.url
  ? new URL(import.meta.url)
  : undefined;

const getOutline = (request: FreedrawGeometryWorkerRequest) => {
  const pointData = new Float64Array(request.points);
  const pressureData = new Float64Array(request.pressures);
  const points = Array.from({ length: request.pointCount }, (_, index) => {
    const point = [pointData[index * 2], pointData[index * 2 + 1]];
    if (!request.simulatePressure) {
      point.push(pressureData[index] ?? 0.5);
    }
    return point;
  });

  const outline = getStroke(points, {
    simulatePressure: request.simulatePressure,
    size: request.strokeWidth * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last: true,
  });
  const outlineData = new Float64Array(outline.length * 2);
  outline.forEach((point, index) => {
    outlineData[index * 2] = point[0];
    outlineData[index * 2 + 1] = point[1];
  });

  return {
    elementId: request.elementId,
    version: request.version,
    versionNonce: request.versionNonce,
    outline: outlineData.buffer,
    svgPath: getSvgPathFromStroke(outline),
  } satisfies FreedrawGeometryWorkerResponse;
};

if (typeof window === "undefined" && typeof self !== "undefined") {
  self.onmessage = (event: MessageEvent<FreedrawGeometryWorkerRequest>) => {
    const response = getOutline(event.data);
    self.postMessage(response, { transfer: [response.outline] });
  };
}
