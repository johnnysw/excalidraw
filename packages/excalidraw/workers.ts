import { debounce } from "@excalidraw/common";

import { WorkerInTheMainChunkError, WorkerUrlNotDefinedError } from "./errors";

class IdleWorker {
  public instance: Worker;

  constructor(workerUrl: URL) {
    this.instance = new Worker(workerUrl, { type: "module" });
  }

  /**
   * Use to prolong the worker's life by `workerTTL` or terminate it with a flush immediately.
   */
  public debounceTerminate!: ReturnType<typeof debounce>;
}

/**
 * Pool of idle short-lived workers.
 *
 * IMPORTANT: for simplicity it does not limit the number of newly created workers, leaving it up to the caller to manage the pool size.
 */
export class WorkerPool<T, R> {
  private idleWorkers: Set<IdleWorker> = new Set();
  private readonly workerUrl: URL;
  private readonly workerTTL: number;
  private readonly workerJobTimeout: number;
  private warmingWorker: Promise<void> | null = null;

  private constructor(
    workerUrl: URL,
    options: {
      ttl?: number;
      jobTimeout?: number;
    },
  ) {
    this.workerUrl = workerUrl;
    this.workerTTL = options.ttl ?? 1000;
    this.workerJobTimeout = options.jobTimeout ?? 30_000;
  }

  /**
   * Create a new worker pool.
   *
   * @param workerUrl - The URL of the worker file.
   * @param options - The options for the worker pool.
   * @throws If the worker is bundled into the main chunk.
   * @returns A new worker pool instance.
   */
  public static create<T, R>(
    workerUrl: URL | undefined,
    options: {
      ttl?: number;
      jobTimeout?: number;
    } = {},
  ): WorkerPool<T, R> {
    if (!workerUrl) {
      throw new WorkerUrlNotDefinedError();
    }

    if (!import.meta.url || workerUrl.toString() === import.meta.url) {
      // in case the worker code is bundled into the main chunk
      throw new WorkerInTheMainChunkError();
    }

    return new WorkerPool(workerUrl, options);
  }

  /**
   * Take idle worker from the pool or create a new one and post a message to it.
   */
  public async postMessage(
    data: T,
    options: StructuredSerializeOptions,
  ): Promise<R> {
    if (this.warmingWorker) {
      await this.warmingWorker;
    }

    let worker: IdleWorker;

    const idleWorker = Array.from(this.idleWorkers).shift();
    if (idleWorker) {
      this.idleWorkers.delete(idleWorker);
      idleWorker.debounceTerminate.cancel();
      worker = idleWorker;
    } else {
      worker = await this.createWorker();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(jobTimeout);
        worker.instance.onmessage = null;
        worker.instance.onerror = null;
        callback();
      };

      const jobTimeout = setTimeout(() => {
        finish(() => {
          worker.instance.terminate();
          this.idleWorkers.delete(worker);
          reject(
            new Error(
              `Active worker did not respond for ${this.workerJobTimeout}ms!`,
            ),
          );
        });
      }, this.workerJobTimeout);

      worker.instance.onmessage = (event: MessageEvent<R>) => {
        finish(() => {
          this.idleWorkers.add(worker);
          worker.debounceTerminate();
          resolve(event.data);
        });
      };
      worker.instance.onerror = (event: ErrorEvent) => {
        finish(() => {
          worker.instance.terminate();
          this.idleWorkers.delete(worker);
          void this.clear();
          reject(event);
        });
      };

      try {
        worker.instance.postMessage(data, options);
      } catch (error) {
        finish(() => {
          worker.instance.terminate();
          this.idleWorkers.delete(worker);
          reject(error);
        });
      }
    });
  }

  /**
   * Creates an idle worker ahead of the first job so worker construction and
   * module loading never share the pointer-up task.
   */
  public async warmup() {
    if (this.idleWorkers.size || this.warmingWorker) {
      await this.warmingWorker;
      return;
    }

    this.warmingWorker = this.createWorker().then((worker) => {
      this.idleWorkers.add(worker);
      worker.debounceTerminate();
    });

    try {
      await this.warmingWorker;
    } finally {
      this.warmingWorker = null;
    }
  }

  /**
   * Terminate the idle workers in the pool.
   */
  public async clear() {
    for (const worker of this.idleWorkers) {
      worker.debounceTerminate.cancel();
      worker.instance.terminate();
    }

    this.idleWorkers.clear();
  }

  /**
   * Used to get a worker from the pool or create a new one if there is no idle available.
   */
  private async createWorker(): Promise<IdleWorker> {
    const worker = new IdleWorker(this.workerUrl);

    worker.debounceTerminate = debounce((reject?: () => void) => {
      worker.instance.terminate();

      if (this.idleWorkers.has(worker)) {
        this.idleWorkers.delete(worker);

        // eslint-disable-next-line no-console
        console.debug(
          "Job finished! Idle worker has been released from the pool.",
        );
      } else if (reject) {
        reject();
      } else {
        console.error("Worker has been terminated!");
      }
    }, this.workerTTL);

    return worker;
  }
}
