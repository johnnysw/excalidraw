import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/image.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  let mode = 'error', active = true, time = 0;
  const images = [], timers = new Map(), revoked = [], requests = [];
  class Image {
    onload = null; onerror = null;
    async decode() {}
    set src(value) {
      this.source = value;
      if (!value) return;
      images.push(this);
      if (value.startsWith('blob:') || mode === 'success') queueMicrotask(() => this.onload?.());
      else if (mode === 'error') queueMicrotask(() => this.onerror?.());
    }
  }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Image, Blob, Response, ReadableStream, Uint8Array, queueMicrotask,
    URL: { createObjectURL: () => 'blob:runtime-only', revokeObjectURL: value => revoked.push(value) },
    setTimeout: (job, delay) => { const id = Symbol(); timers.set(id, { job, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    Date: class extends Date { static now() { return time; } },
    require: name => name === '@excalidraw/common'
      ? { MIME_TYPES: { binary: 'application/octet-stream' }, SVG_NS: 'svg' }
      : { isInitializedImageElement: element => element.type === 'image' },
  });
  let read = async () => new Response('image-bytes', { headers: { 'content-type': 'image/png' } });
  let scope = 'A';
  exports.configureImageResourceReader(() => ({
    scope,
    assertCurrent() { if (!active) throw new Error('session changed'); },
    read: async (...args) => { requests.push(args); return read(...args); },
  }));
  const files = { picture: { id: 'picture', dataURL: 'https://private.example.test/expired.png?Signature=old', mimeType: 'image/png' } };
  const cache = new Map();
  return {
    ...exports, files, cache, images, revoked, requests,
    setMode: value => { mode = value; }, setRead: value => { read = value; },
    switchOwner: () => { active = false; }, setScope: value => { scope = value; },
    advance: ms => { time += ms; },
    timeout: delay => { for (const [id, timer] of timers) if (timer.delay === delay) { timers.delete(id); timer.job(); } },
    update: () => exports.updateImageCache({ files, fileIds: ['picture'], imageCache: cache }),
  };
}

test('ordinary image loading recovers an expired URL once through authorized bytes without changing scene files', async () => {
  const f = fixture(); const original = JSON.stringify(f.files);
  const result = await f.update();
  assert.equal(result.erroredFiles.size, 0);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0], [f.files.picture.dataURL, 'picture']);
  assert.equal(f.cache.get('picture').image.source, 'blob:runtime-only');
  assert.deepEqual(f.revoked, ['blob:runtime-only']);
  assert.equal(JSON.stringify(f.files), original);
});

test('a hung direct URL has a 15 second bound and then uses the same authorized recovery', async () => {
  const f = fixture(); f.setMode('hang');
  const pending = f.update(); f.timeout(15_000);
  assert.equal((await pending).erroredFiles.size, 0);
  assert.equal(f.requests.length, 1);
});

test('failed promises leave the runtime cache and render retries are bounded; same file can recover later', async () => {
  const f = fixture(); f.setRead(async () => new Response('', { status: 403 }));
  assert.equal((await f.update()).erroredFiles.size, 1);
  assert.equal(f.cache.size, 0);
  assert.equal((await f.update()).updatedFiles.size, 0);
  assert.equal(f.requests.length, 1);
  f.advance(30_001);
  f.setRead(async () => new Response('recovered', { headers: { 'content-type': 'image/png' } }));
  assert.equal((await f.update()).erroredFiles.size, 0);
  assert.equal(f.requests.length, 2);
});

test('a changed file source or session scope is not trapped in the old failure cooldown', async () => {
  const f = fixture(); f.setRead(async () => new Response('', { status: 403 }));
  await f.update(); f.setScope('B'); await f.update();
  f.files.picture.dataURL += '&renewed=1'; await f.update();
  assert.equal(f.requests.length, 3);
});

test('a late direct response after account change never becomes a drawable cached image', async () => {
  const f = fixture(); f.setMode('hang');
  const pending = f.update(); f.switchOwner(); f.images[0].onload();
  const result = await pending;
  assert.equal(f.cache.size, 0); assert.equal(result.updatedFiles.size, 0);
  assert.equal(f.requests.length, 0);
});

test('late promises cannot overwrite a newer file with the same file ID', async () => {
  const f = fixture(); f.setMode('hang'); const old = f.update();
  const oldImage = f.images[0];
  f.files.picture.dataURL = 'https://private.example.test/latest.png'; f.setMode('success');
  await f.update(); oldImage.onload(); await old;
  assert.equal(f.cache.get('picture').image.source, 'https://private.example.test/latest.png');
});

test('the authorized fallback enforces its byte bound while streaming, before creating a blob URL', async () => {
  const f = fixture(); let cancelled = false;
  f.setRead(async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'image/png' } }));
  assert.equal((await f.update()).erroredFiles.size, 1);
  assert.equal(cancelled, true); assert.equal(f.cache.size, 0); assert.equal(f.revoked.length, 0);
});
