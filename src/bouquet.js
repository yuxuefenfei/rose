import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRose } from './rose.js';
import { createPetalMaterial } from './materials.js';

const TAU = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);
const point = (x, y, z) => new THREE.Vector3(x, y, z);

function merge(parts) {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return geometry;
}

function mesh(geometry, material, name) {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = result.receiveShadow = true;
  return result;
}

function instances(geometry, material, matrices, name) {
  const result = new THREE.InstancedMesh(geometry, material, matrices.length);
  result.name = name;
  matrices.forEach((matrix, index) => result.setMatrixAt(index, matrix));
  result.instanceMatrix.needsUpdate = true;
  result.castShadow = result.receiveShadow = true;
  result.computeBoundingSphere();
  return result;
}

function tube(points, radius, segments = 12, sides = 5) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, sides, false);
}

function arrangement() {
  const flowers = [{ neck: point(0, 1.32, 0), scale: 0.56, tone: 'red', spin: 0.8, tilt: 0 }];
  for (let i = 0; i < 6; i++) {
    const angle = 0.20 + i * TAU / 6;
    flowers.push({
      neck: point(Math.cos(angle) * 1.04, 0.86 + 0.055 * Math.sin(i * 2.1), Math.sin(angle) * 1.04),
      scale: 0.52 + 0.012 * Math.cos(i * 3), tone: i % 2 === 0 ? 'white' : 'red', spin: i * 1.7, tilt: 0.56,
    });
  }
  for (let i = 0; i < 4; i++) {
    const angle = 0.72 + i * TAU / 4;
    flowers.push({
      neck: point(Math.cos(angle) * 1.13, 0.23 + 0.055 * Math.sin(i * 2.7), Math.sin(angle) * 1.13),
      scale: 0.475 + 0.012 * Math.sin(i * 1.8), tone: i % 2 === 0 ? 'red' : 'white', spin: i * 2.39 + 0.3, tilt: 0.95,
    });
  }
  return flowers.map((flower) => {
    const direction = point(flower.neck.x * flower.tilt, 1, flower.neck.z * flower.tilt).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(up, direction);
    orientation.multiply(new THREE.Quaternion().setFromAxisAngle(up, flower.spin));
    flower.matrix = new THREE.Matrix4().compose(flower.neck, orientation, point(flower.scale, flower.scale, flower.scale));
    return flower;
  });
}
// A ribbon is a two-sided strip with a gently twisting frame, rather than a tube.
function ribbonStrip(points, width, twist = 0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const positions = [], uvs = [], indices = [];
  const segments = 40;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const across = new THREE.Vector3().crossVectors(tangent, point(0, 0, 1)).normalize();
    across.applyAxisAngle(tangent, Math.sin(t * Math.PI) * twist);
    for (const side of [-1, 1]) {
      positions.push(...center.clone().addScaledVector(across, side * width / 2).toArray());
      uvs.push((side + 1) / 2, t);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRibbon() {
  const band = new THREE.CylinderGeometry(0.205, 0.185, 0.28, 36, 1, true);
  band.translate(0, -1.08, 0);
  const parts = [band];
  for (const side of [-1, 1]) {
    parts.push(ribbonStrip([
      point(0, -1.04, 0.22), point(side * 0.35, -0.79, 0.26),
      point(side * 0.68, -0.86, 0.13), point(side * 0.53, -1.12, 0.24), point(0, -1.07, 0.26),
    ], 0.145, side * 0.75));
    parts.push(ribbonStrip([
      point(side * 0.05, -1.09, 0.25), point(side * 0.24, -1.36, 0.32),
      point(side * 0.31, -1.68, 0.18), point(side * 0.43, -1.98 + side * 0.10, 0.29),
    ], 0.18, side * 0.65));
  }
  const knot = new THREE.SphereGeometry(0.12, 16, 12);
  knot.scale(1, 0.75, 0.65);
  knot.translate(0, -1.06, 0.275);
  parts.push(knot);
  return mesh(merge(parts), new THREE.MeshPhysicalMaterial({
    color: '#6d1834', side: THREE.DoubleSide, roughness: 0.55,
    sheen: 0.8, sheenColor: '#bc5b72', sheenRoughness: 0.6,
  }), 'Hand-tied satin ribbon');
}

function createGypsophila(mobile) {
  const group = new THREE.Group();
  group.name = 'Gypsophila';
  const branches = [], florets = [];
  const clusters = [];
  // The first two rings fill the gaps inside the rose crown; the last softens its edge.
  for (const [count, radius, height, phase] of [[4, 0.72, 1.85, 1.10], [8, 1.42, 1.42, 0.62], [9, 1.75, 0.97, 0.18]]) {
    for (let i = 0; i < count; i++) {
      const angle = phase + i * TAU / count;
      clusters.push(point(Math.cos(angle) * radius, height + 0.10 * Math.sin(i * 2.4), Math.sin(angle) * radius));
    }
  }
  clusters.forEach((center, index) => {
    const angle = Math.atan2(center.z, center.x);
    const root = point(0.11 * Math.cos(angle), -1.04, 0.11 * Math.sin(angle));
    const junction = center.clone().add(point(-0.03, -0.28, 0.02));
    branches.push(tube([root, root.clone().lerp(junction, 0.60).add(point(0.04, 0.04, 0)), junction], 0.008, mobile ? 12 : 18, 4));
    for (let j = 0; j < 4; j++) {
      const theta = angle + j * TAU / 4 + index * 0.73;
      const tip = center.clone().add(point(Math.cos(theta) * 0.13, 0.055 * Math.sin(index + j), Math.sin(theta) * 0.13));
      const fork = junction.clone().lerp(tip, 0.68);
      branches.push(tube([junction, fork, tip], 0.0045, mobile ? 5 : 7, mobile ? 3 : 4));
      for (let k = 0; k < 4; k++) {
        const theta2 = theta + k * 2.4;
        const flower = tip.clone().add(point(Math.cos(theta2) * 0.10, 0.04 + k * 0.024, Math.sin(theta2) * 0.10));
        branches.push(tube([fork, tip.clone().lerp(flower, 0.65), flower], 0.0025, mobile ? 3 : 4, 3));
        const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35 * Math.sin(index + k), theta2, 0.35 * Math.cos(j + index)));
        const scale = 0.82 + 0.23 * Math.sin(index * 3.1 + j + k) ** 2;
        florets.push(new THREE.Matrix4().compose(flower, orientation, point(scale, scale, scale)));
      }
    }
  });
  // Five cupped, overlapping lobes keep each tiny flower readable at close range.
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * TAU / 5;
    const petal = new THREE.SphereGeometry(0.019, mobile ? 5 : 7, mobile ? 3 : 5);
    petal.scale(0.83, 0.40, 1.22);
    petal.rotateX(-0.24);
    petal.translate(0, 0.003, 0.017);
    petal.rotateY(angle);
    petals.push(petal);
  }
  group.add(mesh(merge(branches), new THREE.MeshStandardMaterial({ color: '#627750', roughness: 0.9 }), 'Fine branching stems'));
  group.add(instances(merge(petals), new THREE.MeshStandardMaterial({ color: '#f5f1df', roughness: 0.85 }), florets, 'Tiny white florets'));
  const center = new THREE.SphereGeometry(0.007, mobile ? 5 : 6, mobile ? 3 : 4);
  center.translate(0, 0.009, 0);
  group.add(instances(center, new THREE.MeshStandardMaterial({ color: '#d4be72', roughness: 0.9 }), florets, 'Floret centres'));
  group.userData = { sprigs: clusters.length, florets: florets.length };
  return group;
}

export function createBouquet({ mobile = false } = {}) {
  const bouquet = new THREE.Group();
  bouquet.name = 'Hand-tied rose bouquet';
  const flowers = arrangement();
  const template = createRose({ bouquet: true, mobile });
  const retainedGeometries = new Set(), retainedMaterials = new Set();
  const retain = (object) => {
    retainedGeometries.add(object.geometry);
    retainedMaterials.add(object.material);
    return object;
  };
  const bloom = retain(template.getObjectByName('Layered rose petals'));
  bloom.geometry.translate(0, -1.56, 0);
  for (const tone of ['red', 'white']) {
    const matrices = flowers.filter((flower) => flower.tone === tone).map((flower) => flower.matrix);
    bouquet.add(instances(bloom.geometry, tone === 'red' ? bloom.material : createPetalMaterial('white', mobile), matrices, `${tone === 'red' ? 'Red' : 'White'} roses`));
  }
  for (const name of ['Flower receptacle', 'Five sepals']) {
    const part = retain(template.getObjectByName(name));
    part.updateMatrix();
    part.geometry.applyMatrix4(part.matrix).translate(0, -1.56, 0);
    bouquet.add(instances(part.geometry, part.material, flowers.map((flower) => flower.matrix), name));
  }
  const cutMatrices = [];
  const stemParts = flowers.map(({ neck }, index) => {
    const angle = index * 2.39996;
    const bottom = point(0.23 * Math.cos(angle), -2.70 + 0.08 * Math.sin(index * 2), 0.23 * Math.sin(angle));
    cutMatrices.push(new THREE.Matrix4().makeTranslation(bottom.x, bottom.y - 0.001, bottom.z));
    return tube([
      bottom,
      point(0.12 * Math.cos(angle), -1.08, 0.12 * Math.sin(angle)),
      point(neck.x * 0.42, -0.06, neck.z * 0.42), neck,
    ], 0.027, mobile ? 24 : 32, mobile ? 5 : 6);
  });
  bouquet.add(mesh(merge(stemParts), new THREE.MeshStandardMaterial({ color: '#3d5c2b', roughness: 0.84 }), 'Converging rose stems'));
  const cutSurface = new THREE.CircleGeometry(0.0265, 6).rotateX(Math.PI / 2);
  bouquet.add(instances(cutSurface, new THREE.MeshStandardMaterial({ color: '#95a66b', roughness: 0.95 }), cutMatrices, 'Freshly cut stem ends'));
  const leafMatrices = Array.from({ length: 3 }, (_, index) => new THREE.Matrix4().compose(
    point(0, 0.65, 0), new THREE.Quaternion().setFromAxisAngle(up, index * TAU / 3), point(0.80, 0.80, 0.80),
  ));
  for (const name of ['Nine serrated leaflets', 'Branching leaf veins', 'Leaf stalks']) {
    const part = retain(template.getObjectByName(name));
    bouquet.add(instances(part.geometry, part.material, leafMatrices, name === 'Nine serrated leaflets' ? 'Serrated foliage' : name));
  }
  // Only the source parts used by the bouquet survive the temporary single-rose template.
  template.traverse((object) => {
    if (object.geometry && !retainedGeometries.has(object.geometry)) object.geometry.dispose();
    if (object.material && !retainedMaterials.has(object.material)) object.material.dispose();
  });
  bouquet.add(createGypsophila(mobile), createRibbon());
  bouquet.userData = { roses: flowers.length, red: 6, white: 5 };
  return bouquet;
}
