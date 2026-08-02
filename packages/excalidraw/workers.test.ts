import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkerPool } from "./workers";

class FakeWorker {
  public static instances: FakeWorker[] = [];

  public onmessage: ((event: MessageEvent<string>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public terminated = false;
  public postedMessages: unknown[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  public postMessage(data: unknown) {
    this.postedMessages.push(data);
  }

  public terminate() {
    this.terminated = true;
  }

  public emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
}

describe("WorkerPool", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps an active worker alive beyond the idle TTL", async () => {
    const pool = WorkerPool.create<{ value: number }, string>(
      new URL("https://example.com/worker.js"),
      { ttl: 1000, jobTimeout: 5000 },
    );

    const result = pool.postMessage({ value: 1 }, {});
    const worker = FakeWorker.instances[0];

    await vi.advanceTimersByTimeAsync(1001);
    expect(worker.terminated).toBe(false);

    worker.emitMessage("done");
    await expect(result).resolves.toBe("done");

    await vi.advanceTimersByTimeAsync(999);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.terminated).toBe(true);
  });

  it("terminates and rejects an unresponsive active worker after the job timeout", async () => {
    const pool = WorkerPool.create<{ value: number }, string>(
      new URL("https://example.com/worker.js"),
      { ttl: 1000, jobTimeout: 5000 },
    );

    const result = pool.postMessage({ value: 1 }, {});
    const worker = FakeWorker.instances[0];

    const rejection = expect(result).rejects.toThrow(
      "Active worker did not respond for 5000ms!",
    );
    await vi.advanceTimersByTimeAsync(5000);

    await rejection;
    expect(worker.terminated).toBe(true);
  });

  it("cancels idle termination when reusing a worker", async () => {
    const pool = WorkerPool.create<{ value: number }, string>(
      new URL("https://example.com/worker.js"),
      { ttl: 1000, jobTimeout: 5000 },
    );

    const first = pool.postMessage({ value: 1 }, {});
    const worker = FakeWorker.instances[0];
    await vi.advanceTimersByTimeAsync(0);
    worker.emitMessage("first");
    await expect(first).resolves.toBe("first");

    await vi.advanceTimersByTimeAsync(500);
    const second = pool.postMessage({ value: 2 }, {});
    expect(FakeWorker.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(worker.terminated).toBe(false);

    worker.emitMessage("second");
    await expect(second).resolves.toBe("second");
  });

  it("warms up and reuses an idle worker for the first job", async () => {
    const pool = WorkerPool.create<{ value: number }, string>(
      new URL("https://example.com/worker.js"),
      { ttl: 1000, jobTimeout: 5000 },
    );

    await pool.warmup();
    expect(FakeWorker.instances).toHaveLength(1);

    const result = pool.postMessage({ value: 1 }, {});
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].postedMessages).toEqual([{ value: 1 }]);

    FakeWorker.instances[0].emitMessage("done");
    await expect(result).resolves.toBe("done");
  });
});
