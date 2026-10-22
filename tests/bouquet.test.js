import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBouquet } from '../src/bouquet.js';

const bouquet = createBouquet();

test('red and white roses form one crown above a tied bundle of stems', () => {
  const red = bouquet.getObjectByName('Red roses');
  const white = bouquet.getObjectByName('White roses');
  assert.equal(red.count, 6);
  assert.equal(white.count, 5);
  assert.equal(red.geometry, white.geometry, 'both colours reuse one folded bloom geometry');
  assert.notEqual(red.material.customProgramCacheKey(), white.material.customProgramCacheKey());
  for (const flowers of [red, white]) {
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < flowers.count; i++) {
      flowers.getMatrixAt(i, matrix);
      const root = new THREE.Vector3().setFromMatrixPosition(matrix);
      assert.ok(root.y > 0.15 && Math.hypot(root.x, root.z) < 1.45);
    }
  }
  const stems = bouquet.getObjectByName('Converging rose stems').geometry.attributes.position;
  let cuts = 0, tiedSection = 0;
  for (let i = 0; i < stems.count; i++) {
    const x = stems.getX(i), y = stems.getY(i), z = stems.getZ(i);
    if (y < -2.5) cuts++;
    if (Math.abs(y + 1.08) < 0.08) {
      tiedSection++;
      assert.ok(Math.hypot(x, z) < 0.20, 'every stem must fit through the ribbon');
    }
  }
  assert.ok(cuts > 50 && tiedSection > 20);
  assert.equal(bouquet.getObjectByName('Freshly cut stem ends').count, 11);
  assert.ok(bouquet.getObjectByName('Hand-tied satin ribbon'));
});

test('baby’s breath includes tiny three-dimensional flowers inside the rose crown', () => {
  const gypsophila = bouquet.getObjectByName('Gypsophila');
  const florets = gypsophila.getObjectByName('Tiny white florets');
  assert.equal(gypsophila.userData.sprigs, 21);
  assert.equal(florets.count, 336);
  let inner = 0, outer = 0;
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < florets.count; i++) {
    florets.getMatrixAt(i, matrix);
    const root = new THREE.Vector3().setFromMatrixPosition(matrix);
    const radius = Math.hypot(root.x, root.z);
    if (radius < 1.5) inner++;
    else outer++;
    assert.ok(root.y > 0.85 && root.y < 2.2);
  }
  assert.ok(inner > 100 && outer > 100, 'fill the centre and edges, not only an outer halo');
  const bounds = new THREE.Box3().setFromBufferAttribute(florets.geometry.attributes.position);
  assert.ok(bounds.max.y > bounds.min.y && bounds.getSize(new THREE.Vector3()).length() < 0.12);
});

test('bouquet geometry and instance transforms stay finite within the rendering budget', () => {
  let triangles = 0, calls = 0;
  bouquet.traverse((object) => {
    if (!object.isMesh) return;
    calls++;
    for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite), object.name);
    if (object.isInstancedMesh) assert.ok(object.instanceMatrix.array.every(Number.isFinite), object.name);
    triangles += object.geometry.index.count / 3 * (object.isInstancedMesh ? object.count : 1);
  });
  assert.ok(calls <= 13, `too many draw calls: ${calls}`);
  assert.ok(triangles < 530_000, `too many triangles: ${triangles}`);
  const bounds = new THREE.Box3().setFromObject(bouquet);
  assert.ok(bounds.min.y < -2.6 && bounds.max.y > 2.0);
  assert.ok(bounds.getSize(new THREE.Vector3()).x < 5.1);
});

test('mobile preserves the arrangement and flowers within its smoother petal budget', () => {
  const mobile = createBouquet({ mobile: true });
  const triangles = (group) => {
    let count = 0;
    group.traverse((object) => {
      if (!object.isMesh) return;
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite), object.name);
      assert.ok(object.geometry.index.array.every((i) => i < object.geometry.attributes.position.count), object.name);
      count += object.geometry.index.count / 3 * (object.isInstancedMesh ? object.count : 1);
    });
    return count;
  };
  assert.deepEqual(mobile.userData, bouquet.userData);
  for (const name of ['Red roses', 'White roses', 'Tiny white florets', 'Floret centres']) {
    const original = bouquet.getObjectByName(name), optimized = mobile.getObjectByName(name);
    assert.equal(optimized.count, original.count);
    assert.deepEqual(optimized.instanceMatrix.array, original.instanceMatrix.array, name);
    if (name.endsWith('roses')) {
      assert.equal(optimized.material.type, 'MeshPhongMaterial');
      assert.equal(original.material.type, 'MeshPhysicalMaterial');
      assert.ok(optimized.material.bumpMap, 'retain the tissue relief');
    }
  }
  const mobileTriangles = triangles(mobile), desktopTriangles = triangles(bouquet);
  assert.ok(mobileTriangles < 230_000 && mobileTriangles < desktopTriangles * 0.46, `${mobileTriangles} vs ${desktopTriangles}`);
  const desktopBounds = new THREE.Box3().setFromObject(bouquet);
  const mobileBounds = new THREE.Box3().setFromObject(mobile);
  assert.ok(desktopBounds.min.distanceTo(mobileBounds.min) < 0.04);
  assert.ok(desktopBounds.max.distanceTo(mobileBounds.max) < 0.04);
  assert.equal(mobile.getObjectByName('Gypsophila').userData.florets, 336);
});
