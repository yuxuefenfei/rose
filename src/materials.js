import * as THREE from 'three';

const fract = (value) => value - Math.floor(value);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), fx),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy,
  );
}

export function createPetalTextures(size = 512) {
  const relief = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1);
      const cells = noise(u * 48, v * 70);
      const grain = hash(x, y);
      const veins = Math.sin((u - 0.5) * (360 + v * 110) + Math.sin(v * 13 + u * 6) * 1.2);
      const wrinkles = noise(u * 13, v * 21);
      const h = 0.5 + veins * 0.035 + (cells - 0.5) * 0.09 + (grain - 0.5) * 0.12 + (wrinkles - 0.5) * 0.05;
      const r = 0.76 + cells * 0.13 + grain * 0.04;
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        relief[index + channel] = Math.round(h * 255);
        roughness[index + channel] = Math.round(r * 255);
      }
      relief[index + 3] = roughness[index + 3] = 255;
    }
  }
  const make = (data) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  };
  return { bump: make(relief), roughness: make(roughness) };
}

export function createPetalMaterial(tone = 'red', mobile = false) {
  const white = tone === 'white';
  const textures = createPetalTextures();
  const material = mobile ? new THREE.MeshPhongMaterial({
    color: '#ffffff', vertexColors: true, side: THREE.DoubleSide,
    bumpMap: textures.bump, bumpScale: 0.016,
    specular: white ? '#141310' : '#100506', shininess: 12,
    reflectivity: 0,
  }) : new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, side: THREE.DoubleSide,
    roughness: white ? 0.72 : 0.64, roughnessMap: textures.roughness,
    bumpMap: textures.bump, bumpScale: 0.035,
    metalness: 0, ior: 1.38, specularIntensity: 0.45,
    sheen: 0.16, sheenColor: white ? '#eee4d0' : '#c36b79', sheenRoughness: 0.92,
    clearcoat: 0,
  });
  if (mobile) textures.roughness.dispose();
  material.userData.tone = tone;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPetalUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPetalUv = uv;');
    shader.uniforms.petalPigment = { value: new THREE.Color(white ? '#e9e2d6' : mobile ? '#ae1531' : '#9e0d28') };
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPetalUv;\nuniform vec3 petalPigment;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
        ${white ? 'diffuseColor.rgb = petalPigment * mix(0.62, 1.0, clamp(diffuseColor.r * 3.0, 0.0, 1.0));' : 'diffuseColor.rgb = mix(petalPigment, diffuseColor.rgb, 0.42);'}
      #endif
    `);
    if (mobile) shader.fragmentShader = shader.fragmentShader.replace('#include <envmap_fragment>', '');
    // Thin-sheet scattering follows each light, including its shadow attenuation.
    const direct = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replaceAll(direct, `${direct}
        {
        vec3 petalHalf = ${mobile ? 'directLight.direction' : 'normalize(directLight.direction + geometryNormal * 0.35)'};
        float petalScatterBase = saturate(dot(geometryViewDir, -petalHalf));
        float petalScatter = petalScatterBase * petalScatterBase * petalScatterBase;
        float petalBack = saturate(dot(-geometryNormal, directLight.direction));
        float petalThin = smoothstep(0.15, 0.95, vPetalUv.y);
        reflectedLight.directDiffuse += directLight.color * material.${mobile ? 'diffuseColor' : 'diffuseContribution'}
          * ${white ? 'vec3(0.9, 0.86, 0.76)' : 'vec3(1.0, 0.52, 0.4)'} * petalThin * (petalScatter * 0.42 + petalBack * 0.06);
        }
      `));
  };
  material.customProgramCacheKey = () => `rose-thin-petal-v4-${tone}-${mobile}`;
  return material;
}
