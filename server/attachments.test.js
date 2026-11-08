import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'rumbo-uploads-'));
process.env.UPLOAD_DIR = dir;
const A = await import('./attachments.js');

// Smallest valid-looking files for each format (magic bytes + padding)
const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a4649460001', 'hex'), Buffer.alloc(64)]);
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d', 'hex'), Buffer.alloc(64)]);

before(() => A.reset());
after(() => rmSync(dir, { recursive: true, force: true }));

test('adds, lists, finds and removes a photo', () => {
  const a = A.add('F-2026-001', JPEG, 'image/jpeg', 'ticket.jpg');
  assert.equal(a.name, 'ticket.jpg');
  assert.match(a.url, /^\/api\/attachments\//);
  assert.equal(A.list('F-2026-001').length, 1);
  const found = A.find(a.id);
  assert.ok(existsSync(found.path));
  A.remove('F-2026-001', a.id);
  assert.equal(A.list('F-2026-001').length, 0);
  assert.ok(!existsSync(found.path));
});

test('rejects non-images and spoofed types', () => {
  assert.throws(() => A.add('F-2026-001', Buffer.from('%PDF-1.7 hello world'), 'application/pdf', 'x.pdf'), /imágenes/);
  assert.throws(() => A.add('F-2026-001', PNG, 'image/jpeg', 'fake.jpg'), /no parece una imagen/);
});

test('rejects files over the size limit', () => {
  const big = Buffer.concat([JPEG, Buffer.alloc(A.MAX_BYTES)]);
  assert.throws(() => A.add('F-2026-001', big, 'image/jpeg', 'big.jpg'), /10 MB/);
});

test('photos are isolated per invoice', () => {
  A.add('F-2026-002', PNG, 'image/png', 'a.png');
  assert.equal(A.list('F-2026-003').length, 0);
  assert.equal(A.list('F-2026-002').length, 1);
});
