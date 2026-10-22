import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRose, bloomPoint } from '../src/rose.js';
import { createPetalTextures } from '../src/materials.js';

test('rose retains a complete, finite botanical structure within the geometry budget', () => {
  const rose = createRose();
  assert.deepEqual(rose.userData, { petals: 40, leaflets: 9, sepals: 5, prickles: 13 });
  let triangles = 0, meshes = 0;
  rose.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    for (const name of ['position', 'normal', 'uv']) {
      assert.ok(geometry.attributes[name], `${object.name}: missing ${name}`);
      assert.ok(geometry.attributes[name].array.every(Number.isFinite), `${object.name}: nonfinite ${name}`);
    }
    assert.ok(geometry.index.array.every((index) => index < geometry.attributes.position.count));
    triangles += geometry.index.count / 3;
  });
  const bounds = new THREE.Box3().setFromObject(rose);
  assert.ok(bounds.min.y < -3 && bounds.max.y > 2.9);
  assert.ok(bounds.max.x - bounds.min.x > 2.5);
  assert.ok(meshes <= 10, 'keep the flower, leaves and veins batched');
  assert.ok(triangles < 140_000, `geometry budget exceeded: ${triangles}`);
  rose.traverse((object) => {
    object.geometry?.dispose();
    if (object.material) {
      for (const value of Object.values(object.material)) if (value?.isTexture) value.dispose();
      object.material.dispose();
    }
  });
});

test('the folded bloom stays attached at its root and narrows towards its centre', () => {
  for (let theta = 2.5 * Math.PI; theta <= 24.5 * Math.PI; theta += 0.2) {
    assert.ok(bloomPoint(0, theta).distanceTo(new THREE.Vector3(0, 1.56, 0)) < 0.00001);
    for (const r of [0.1, 0.5, 0.9, 1]) assert.ok(bloomPoint(r, theta).toArray().every(Number.isFinite));
  }
  const outer = bloomPoint(1, 3 * Math.PI), inner = bloomPoint(1, 23 * Math.PI);
  assert.ok(Math.hypot(outer.x, outer.z) > Math.hypot(inner.x, inner.z) * 4);
  assert.ok(inner.y > outer.y + 0.3);
});

test('procedural petal textures have useful relief and valid mipmap settings', () => {
  const textures = createPetalTextures(64);
  for (const texture of Object.values(textures)) {
    assert.equal(texture.image.data.length, 64 * 64 * 4);
    assert.ok(texture.generateMipmaps);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    const values = Array.from(texture.image.data).filter((_, i) => i % 4 !== 3);
    assert.ok(Math.max(...values) - Math.min(...values) > 15);
    texture.dispose();
  }
});

test('the shaded bud remains opaque when viewed through the petal roots from the side', () => {
  const rose = createRose({ bouquet: true, mobile: true });
  rose.updateMatrixWorld(true);
  const bloom = rose.getObjectByName('Layered rose petals');
  const ray = new THREE.Raycaster();
  for (const height of [1.85, 2.15, 2.45]) {
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      const origin = new THREE.Vector3(Math.cos(angle) * 3, height, Math.sin(angle) * 3);
      ray.set(origin, new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle)));
      assert.ok(ray.intersectObject(bloom).length > 0, `open bud at ${height}, ${angle}`);
    }
  }
});
