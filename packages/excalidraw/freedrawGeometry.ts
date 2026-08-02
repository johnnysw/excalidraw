import { promiseTry } from "@excalidraw/common";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { WorkerInTheMainChunkError, WorkerUrlNotDefinedError } from "./errors";
import { WorkerPool } from "./workers";

import type {
  FreedrawGeometryWorkerRequest,
  FreedrawGeometryWorkerResponse,
} from "./freedrawGeometryWorker";

const initialWorkerEnvironment = {
  isBrowser: typeof window !== "undefined",
  hasWorker: typeof Worker !== "undefined",
};
let shouldUseWorkers =
  initialWorkerEnvironment.isBrowser && initialWorkerEnvironment.hasWorker;
let workerPool: Promise<
  WorkerPool<FreedrawGeometryWorkerRequest, FreedrawGeometryWorkerResponse>
> | null = null;

const getOrCreateWorkerPool = () => {
  if (!workerPool) {
    workerPool = promiseTry(async () => {
      const { WorkerUrl } = await import("./freedrawGeometryWorker");
      return WorkerPool.create<
        FreedrawGeometryWorkerRequest,
        FreedrawGeometryWorkerResponse
      >(WorkerUrl, { ttl: 60_000, jobTimeout: 10_000 });
    });
  }
  return workerPool;
};

export const requestFreedrawGeometry = async (
  element: ExcalidrawFreeDrawElement,
): Promise<FreedrawGeometryWorkerResponse | null> => {
  if (!shouldUseWorkers) {
    throw new Error(
      `freedraw geometry Worker unavailable (browser=${initialWorkerEnvironment.isBrowser}, Worker=${initialWorkerEnvironment.hasWorker})`,
    );
  }

  const pointData = new Float64Array(element.points.length * 2);
  element.points.forEach((point, index) => {
    pointData[index * 2] = point[0];
    pointData[index * 2 + 1] = point[1];
  });
  const pressureData = new Float64Array(element.pressures);

  try {
    const pool = await getOrCreateWorkerPool();
    return await pool.postMessage(
      {
        elementId: element.id,
        version: element.version,
        versionNonce: element.versionNonce,
        simulatePressure: element.simulatePressure,
        strokeWidth: element.strokeWidth,
        points: pointData.buffer,
        pressures: pressureData.buffer,
        pointCount: element.points.length,
      },
      { transfer: [pointData.buffer, pressureData.buffer] },
    );
  } catch (error) {
    if (
      error instanceof WorkerUrlNotDefinedError ||
      error instanceof WorkerInTheMainChunkError
    ) {
      shouldUseWorkers = false;
    } else {
      const failedPool = workerPool;
      workerPool = null;
      void failedPool?.then((pool) => pool.clear()).catch(() => {});
    }
    throw error;
  }
};

export const prepareFreedrawGeometryWorker = () => {
  if (!shouldUseWorkers) {
    return;
  }

  void getOrCreateWorkerPool()
    .then((pool) => pool.warmup())
    .catch((error) => {
      if (
        error instanceof WorkerUrlNotDefinedError ||
        error instanceof WorkerInTheMainChunkError
      ) {
        shouldUseWorkers = false;
      }
      workerPool = null;
    });
};
