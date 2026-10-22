import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRenderQuality, getRenderWindow } from '../src/quality.js';

function sample(quality, milliseconds, frames = 90) {
  let changes = 0;
  for (let i = 0; i < frames; i++) changes += Number(quality.sampleFrame(milliseconds));
  return changes;
}

test('drawing density preserves mobile clarity without raising a lower device ratio', () => {
  assert.equal(createRenderQuality(true, 3).pixelRatio, 1.75);
  assert.equal(createRenderQuality(false, 3).pixelRatio, 1.75);
  assert.equal(createRenderQuality(true, 1).pixelRatio, 1);
  assert.equal(createRenderQuality(true, 0.8).pixelRatio, 0.8);
});

test('sustained slow frames can reduce resolution without falling below the clarity floor', () => {
  const quality = createRenderQuality(true, 3);
  assert.equal(sample(quality, 33.3, 89), 0);
  assert.equal(quality.pixelRatio, 1.75);
  assert.equal(quality.sampleFrame(33.3), true);
  assert.equal(quality.pixelRatio, 1.5);
  assert.equal(sample(quality, 33.3, 180), 0);
  assert.equal(quality.pixelRatio, 1.5);
});

test('normal frames and long idle gaps do not trigger a reduction', () => {
  const quality = createRenderQuality(true, 3);
  assert.equal(sample(quality, 16.7, 180), 0);
  sample(quality, 33.3, 89);
  assert.equal(quality.sampleFrame(5000), false);
  assert.equal(quality.sampleFrame(33.3), false);
  assert.equal(quality.pixelRatio, 1.75);
  const desktop = createRenderQuality(false, 3);
  assert.equal(sample(desktop, 40, 360), 0);
  assert.equal(desktop.pixelRatio, 1.75);
});

test('a cropped mobile buffer preserves the full-page projection', () => {
  const width = 430, height = 932;
  const window = getRenderWindow(width, height, true);
  assert.deepEqual(window, { top: 158, height: 578 });
  assert.ok(window.height < height * 0.65);
  assert.deepEqual(getRenderWindow(width, height, false), { top: 0, height });
  assert.deepEqual(getRenderWindow(932, 430, true), { top: 0, height: 430 });
  const full = new THREE.PerspectiveCamera(34, width / height, 0.08, 80);
  full.position.set(4.8, 6.6, 10.5);
  full.lookAt(0, -0.05, 0);
  full.updateMatrixWorld();
  full.setViewOffset(width, height, -width * 0.035, 0, width, height);
  const crop = full.clone();
  crop.setViewOffset(width, height, -width * 0.035, window.top, width, window.height);
  for (const point of [[0, 1.3, 0], [1.1, 0.8, 0.5], [0, -2.7, 0]]) {
    const a = new THREE.Vector3(...point).project(full);
    const b = new THREE.Vector3(...point).project(crop);
    assert.ok(Math.abs(a.x - b.x) < 0.00001);
    assert.ok(Math.abs((1 - a.y) / 2 * height - (window.top + (1 - b.y) / 2 * window.height)) < 0.00001);
  }
});
