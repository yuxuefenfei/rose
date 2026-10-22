import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPetalMaterial } from './materials.js';

const TAU = Math.PI * 2;
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const palette = {
  petalRoot: new THREE.Color('#3d3d3d'),
  petalBody: new THREE.Color('#ededed'),
  petalEdge: new THREE.Color('#f5f5f5'),
  leafRoot: new THREE.Color('#102b18'),
  leafEdge: new THREE.Color('#304e29'),
};

function surface(rows, columns, sample) {
  const positions = [], colors = [], uvs = [], indices = [];
  const counts = [], offsets = [];
  for (let j = 0; j <= rows; j++) {
    const count = typeof columns === 'function' ? columns(j / rows) : columns;
    counts.push(count);
    offsets.push(positions.length / 3);
    for (let i = 0; i <= count; i++) {
      const u = i / count, v = j / rows;
      const { point, color, uv } = sample(u, v);
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
      uvs.push(...(uv || [u, v]));
    }
  }
  for (let j = 0; j < rows; j++) {
    let a = 0, b = 0;
    while (a < counts[j] || b < counts[j + 1]) {
      const i = offsets[j] + a, k = offsets[j + 1] + b;
      if (b === counts[j + 1] || (a < counts[j] && (a + 1) / counts[j] <= (b + 1) / counts[j + 1])) {
        indices.push(i, k, i + 1);
        a++;
      } else {
        indices.push(i, k, k + 1);
        b++;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
// Rose-fold coordinates follow Paul Nylander's rose surface; the height profile
// and asymmetry keep the outer petals relaxed and the centre tightly cupped.
export function bloomPoint(r, theta) {
  const phi = Math.PI / 2 * Math.exp(-theta / (8 * Math.PI))
    * (1 + 0.065 * Math.sin(theta * 1.27) + 0.025 * Math.cos(theta * 2.3));
  const phase = THREE.MathUtils.euclideanModulo(3.6 * theta, TAU) / Math.PI;
  const outline = 1 - 0.38 * Math.pow(1.25 * Math.pow(1 - phase, 2) - 0.25, 2);
  const fold = 1.95653 * (1 + 0.16 * Math.sin(theta * 0.77)) * r * r * Math.pow(1.27689 * r - 1, 2) * Math.sin(phi);
  const radius = outline * (r * Math.sin(phi) + fold * Math.cos(phi));
  const rise = outline * (r * Math.cos(phi) - fold * Math.sin(phi));
  const height = (1 - Math.exp(-2 * rise)) / (1 - Math.exp(-2));
  const lip = smooth(0.82, 1, r);
  const wrinkle = Math.sin(theta * 11.4) * 0.006 * lip;
  const angle = theta + 0.012 * Math.sin(theta * 1.7);
  return new THREE.Vector3(
    radius * Math.sin(angle) * 1.48 * (1 + 0.045 * Math.sin(theta * 0.8) + 0.018 * Math.sin(theta * 3.9) * r * r),
    1.56 + height * 1.48 + wrinkle + 0.025 * Math.sin(theta * 1.37) * r * r,
    radius * Math.cos(angle) * 1.48,
  );
}

function bloomGeometry(index, rows, columns, adaptive) {
  const angleStart = (index + 5) * TAU / 3.6;
  const attachment = new THREE.Vector3(0, 1.56, 0);
  const rotation = new THREE.Euler(0.035 * Math.sin(index * 2.17), 0.045 * Math.sin(index * 3.7), 0.03 * Math.cos(index * 1.83));
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
  // Keep the organic spiral profile and smooth its lighting independently of tessellation.
  const radial = (v) => 1 - Math.pow(1 - v, 1.4);
  const pointAt = (u, v) => {
    const r = radial(v);
    const point = bloomPoint(r, angleStart + u * TAU / 3.6).sub(attachment);
    const guard = Math.max(0, 1 - index / 8) * smooth(0.72, 1, r);
    point.y += guard * 0.24;
    point.x *= 1 - guard * 0.10;
    point.z *= 1 - guard * 0.10;
    return point.applyMatrix4(matrix).add(attachment);
  };
  const angularSamples = adaptive ? (v) => Math.max(4, Math.round(columns * (0.3 + 0.7 * smooth(0.12, 0.8, v)))) : columns;
  const geometry = surface(rows, angularSamples, (u, v) => {
    const theta = angleStart + u * TAU / 3.6;
    const r = radial(v);
    const color = palette.petalRoot.clone().lerp(palette.petalBody, smooth(0, 0.62, r));
    color.lerp(palette.petalEdge, Math.pow(r, 7) * 0.22);
    color.multiplyScalar(0.91 + 0.07 * Math.sin(index * 2.43) + 0.02 * Math.sin(theta * 4.1));
    return { point: pointAt(u, v), color, uv: [u, radial(v)] };
  });
  // Sample the curve's derivatives so coarse mobile meshes keep smooth highlights.
  const normals = geometry.attributes.normal, uv = geometry.attributes.uv;
  const epsilon = 0.001;
  for (let i = 0; i < normals.count; i++) {
    const u = uv.getX(i), v = Math.max(epsilon, 1 - Math.pow(1 - uv.getY(i), 1 / 1.4));
    const du = pointAt(Math.min(1, u + epsilon), v).sub(pointAt(Math.max(0, u - epsilon), v));
    const dv = pointAt(u, Math.min(1, v + epsilon)).sub(pointAt(u, Math.max(0, v - epsilon)));
    const normal = dv.cross(du).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }  return geometry;
}

function mergedMesh(geometries, material, name) {
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((part) => part.dispose());
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function tube(points, radius, segments = 12, sides = 5) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, sides, false);
}

function leafPoint(u, v, length, width) {
  const w = u * 2 - 1;
  const outline = Math.pow(Math.sin(Math.PI * v), 0.8);
  const tooth = 1 + 0.045 * Math.sin(v * Math.PI * 34);
  return new THREE.Vector3(
    w * width * outline * tooth,
    0.12 * Math.sin(v * Math.PI) - 0.13 * w * w * outline + 0.045 * Math.sin(v * 7) * w,
    v * length,
  );
}

function makeLeaf(length, width, matrix, leaves, veins, mobile) {
  const leaf = surface(36, mobile ? 8 : 12, (u, v) => {
    const color = palette.leafRoot.clone().lerp(palette.leafEdge, Math.abs(u * 2 - 1) * 0.45 + v * 0.25);
    color.multiplyScalar(0.92 + 0.08 * Math.cos(v * 40 + u * 9));
    return { point: leafPoint(u, v, length, width), color };
  });
  leaf.applyMatrix4(matrix);
  leaves.push(leaf);
  const central = [];
  for (let i = 0; i <= 10; i++) {
    const point = leafPoint(0.5, i / 10, length, width);
    point.y += 0.008;
    central.push(point);
  }
  veins.push(tube(central, 0.0045, mobile ? 12 : 20).applyMatrix4(matrix));
  for (let i = 1; i <= (mobile ? 4 : 8); i++) {
    const v = i / (mobile ? 5 : 10);
    for (const side of [-1, 1]) {
      const points = [0, 0.45, 0.85].map((t) => {
        const point = leafPoint(0.5 + side * t * 0.47, v + t * 0.13, length, width);
        point.y += 0.009;
        return point;
      });
      veins.push(tube(points, 0.0018, mobile ? 3 : 5, 3).applyMatrix4(matrix));
    }
  }
}

export function createRose({ bouquet = false, mobile = false } = {}) {
  const rose = new THREE.Group();
  rose.name = 'Rose';
  const petalMaterial = createPetalMaterial('red', mobile);
  const petals = Array.from({ length: 40 }, (_, index) => bloomGeometry(index, mobile ? 16 : bouquet ? 22 : 40, mobile ? 14 : bouquet ? 16 : 32, mobile));
  const heart = new THREE.SphereGeometry(0.036, mobile ? 10 : 16, mobile ? 8 : 12);
  heart.scale(1, 1.3, 1);
  heart.translate(0, 2.97, 0);
  const heartColors = [];
  const heartColor = palette.petalRoot.clone().lerp(palette.petalBody, 0.5);
  for (let i = 0; i < heart.attributes.position.count; i++) heartColors.push(heartColor.r, heartColor.g, heartColor.b);
  heart.setAttribute('color', new THREE.Float32BufferAttribute(heartColors, 3));
  petals.push(heart);
  // A shaded bud core prevents background and stems showing through petal roots.
  const core = new THREE.SphereGeometry(0.64, mobile ? 12 : 20, mobile ? 10 : 16);
  core.scale(1, 0.78, 1);
  core.translate(0, 2.15, 0);
  const coreColor = palette.petalRoot.clone().lerp(palette.petalBody, 0.42);
  const coreColors = new Float32Array(core.attributes.position.count * 3);
  for (let i = 0; i < core.attributes.position.count; i++) coreColor.toArray(coreColors, i * 3);
  core.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));
  petals.push(core);
  const bloom = mergedMesh(petals, petalMaterial, 'Layered rose petals');
  const flower = new THREE.Group();
  flower.name = 'Flower';
  flower.add(bloom);
  rose.add(flower);

  const green = new THREE.MeshStandardMaterial({ color: '#3d5c2b', roughness: 0.84 });
  const calyx = new THREE.Mesh(new THREE.SphereGeometry(0.16, mobile ? 12 : 20, mobile ? 8 : 16), green);
  calyx.name = 'Flower receptacle';
  calyx.position.y = 1.54;
  calyx.scale.set(1, 1.5, 1);
  rose.add(calyx);
  const sepals = [];
  for (let i = 0; i < 5; i++) {
    const theta = i * TAU / 5 + 0.2;
    const geometry = surface(mobile ? 12 : 20, mobile ? 5 : 8, (u, v) => {
      const width = Math.sin(Math.PI * v) * 0.12;
      const angle = theta + (u * 2 - 1) * width / (0.12 + v * 0.7);
      const radius = 0.1 + v * 0.67;
      return {
        point: new THREE.Vector3(Math.sin(angle) * radius, 1.53 + 0.24 * Math.sin(v * Math.PI) - 0.23 * v * v, Math.cos(angle) * radius),
        color: new THREE.Color('#36552a').lerp(new THREE.Color('#6d783b'), v * 0.5),
      };
    });
    sepals.push(geometry);
  }
  rose.add(mergedMesh(sepals, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), 'Five sepals'));

  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.09, -3.08, 0.06), new THREE.Vector3(-0.035, -2.1, 0),
    new THREE.Vector3(0.055, -1.1, -0.035), new THREE.Vector3(-0.07, 0.2, 0.01),
    new THREE.Vector3(0, 1.56, 0),
  ]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 90, 0.046, 10, false), green);
  stem.name = 'Curved stem';
  stem.castShadow = true;
  stem.receiveShadow = true;
  rose.add(stem);

  const leaves = [], veins = [], branches = [], thorns = [];
  const leafLocations = [
    { t: 0.27, angle: -1.35, length: 1.10 },
    { t: 0.49, angle: 1.65, length: 1.17 },
    { t: 0.71, angle: -0.70, length: 0.90 },
  ];
  leafLocations.slice(bouquet ? 1 : 0).forEach(({ t, angle, length }) => {
    const origin = stemCurve.getPoint(t);
    const branchGroup = new THREE.Object3D();
    branchGroup.position.copy(origin);
    branchGroup.rotation.set(-0.31, angle, 0.16);
    branchGroup.updateMatrix();
    const branchMatrix = branchGroup.matrix;
    branches.push(tube([new THREE.Vector3(), new THREE.Vector3(0, 0.04, 0.38), new THREE.Vector3(0, 0.08, 0.8)], 0.017, 15).applyMatrix4(branchMatrix));
    const arrangements = [
      { x: 0, z: 0.72, yaw: 0, scale: 1 },
      { x: 0.015, z: 0.38, yaw: 1.05, scale: 0.66 },
      { x: -0.015, z: 0.43, yaw: -1.12, scale: 0.64 },
    ];
    arrangements.forEach(({ x, z, yaw, scale }) => {
      const local = new THREE.Object3D();
      local.position.set(x, 0.07, z);
      local.rotation.set(-0.06, yaw, yaw * 0.10);
      local.updateMatrix();
      const matrix = new THREE.Matrix4().multiplyMatrices(branchMatrix, local.matrix);
      makeLeaf(length * scale, length * scale * 0.29, matrix, leaves, veins, mobile);
    });
  });
  rose.add(mergedMesh(leaves, new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.50, clearcoat: 0.14, clearcoatRoughness: 0.68 }), 'Nine serrated leaflets'));
  rose.add(mergedMesh(veins, new THREE.MeshStandardMaterial({ color: '#365331', roughness: 0.9 }), 'Branching leaf veins'));
  rose.add(mergedMesh(branches, green, 'Leaf stalks'));

  for (let i = 0; i < 13; i++) {
    const t = 0.09 + i * 0.064;
    const origin = stemCurve.getPoint(t);
    const angle = i * 2.39996;
    const length = 0.11 + Math.sin(i * 9) * 0.025;
    const geometry = new THREE.ConeGeometry(0.04, length, 7, 5);
    const positions = geometry.attributes.position;
    for (let j = 0; j < positions.count; j++) {
      const y = positions.getY(j);
      const tip = (y + length / 2) / length;
      positions.setXYZ(j, positions.getX(j) + tip * tip * 0.045, y, positions.getZ(j));
    }
    geometry.rotateZ(-Math.PI / 2 - 0.42);
    geometry.translate(0.065, -0.015, 0);
    geometry.rotateY(angle);
    geometry.translate(origin.x, origin.y, origin.z);
    geometry.computeVertexNormals();
    thorns.push(geometry);
  }
  rose.add(mergedMesh(thorns, new THREE.MeshStandardMaterial({ color: '#65513a', roughness: 0.8 }), 'Thirteen curved prickles'));
  rose.rotation.y = -0.4;
  rose.userData = { petals: 40, leaflets: 9, sepals: 5, prickles: 13 };
  return rose;
}
