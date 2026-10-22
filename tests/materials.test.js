import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPetalMaterial } from '../src/materials.js';

test('mobile petal shaders retain pigment and scattering with the correct lightweight material fields', () => {
  for (const tone of ['red', 'white']) {
    const mobile = createPetalMaterial(tone, true);
    const desktop = createPetalMaterial(tone, false);
    assert.equal(mobile.type, 'MeshPhongMaterial');
    assert.equal(desktop.type, 'MeshPhysicalMaterial');
    assert.ok(mobile.bumpMap && mobile.bumpScale > 0);
    const shader = { vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader, uniforms: {} };
    mobile.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes('material.diffuseColor'));
    assert.ok(!shader.fragmentShader.includes('material.diffuseContribution'));
    assert.ok(!shader.fragmentShader.includes('#include <envmap_fragment>'));
    assert.ok(shader.uniforms.petalPigment);
    assert.notEqual(mobile.customProgramCacheKey(), desktop.customProgramCacheKey());
  }
});
