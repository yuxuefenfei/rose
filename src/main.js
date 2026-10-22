import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBouquet } from './bouquet.js';
import { createRenderQuality, getRenderWindow } from './quality.js';
import './style.css';
import petalAlbedoUrl from './assets/rose-petal-albedo.webp';

const viewport = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const errorPanel = document.querySelector('#error');
const autoButton = document.querySelector('#rotate');
const label = document.querySelector('#view-label');
const presetButtons = [...document.querySelectorAll('[data-view]')];
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const about = document.querySelector('#about');

document.querySelector('#about-open').addEventListener('click', () => about.showModal());
document.querySelector('#about-close').addEventListener('click', () => about.close());
about.addEventListener('click', (event) => {
  const rect = about.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) about.close();
});
document.querySelector('#reload').addEventListener('click', () => location.reload());

function showError(message) {
  loading.hidden = true;
  errorPanel.hidden = false;
  if (message) document.querySelector('#error-message').textContent = message;
  document.querySelectorAll('.toolbar button, .view-presets button').forEach((button) => { button.disabled = true; });
}

async function start() {
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  const quality = createRenderQuality(mobile, window.devicePixelRatio || 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.08, 80);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '红白玫瑰与满天星组成的立体花束。拖动或用方向键旋转，滚轮、双指或加减键缩放，Home 键复位。');
  viewport.append(canvas);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.38;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#fff4e9', '#617449', mobile ? 0.8 : 0.4));
  const key = new THREE.DirectionalLight('#fff2e7', 3.4);
  key.position.set(3.8, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3.5;
  key.shadow.camera.right = 3.5;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -3.5;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 18;
  key.shadow.normalBias = 0.006;
  key.shadow.bias = -0.00015;
  key.shadow.radius = 3;
  key.shadow.blurSamples = 8;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#e3e9ed', 0.6);
  fill.position.set(-5, 2, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#fff0db', 1.6);
  rim.position.set(1, 4, -5);
  scene.add(rim);
  const lowerFill = new THREE.DirectionalLight('#e0e8d5', 0.2);
  lowerFill.position.set(-2, -4, 3);
  if (!mobile) scene.add(lowerFill);

  const bouquet = createBouquet({ mobile });
  const petalAlbedo = await new THREE.TextureLoader().loadAsync(petalAlbedoUrl);
  petalAlbedo.colorSpace = THREE.SRGBColorSpace;
  petalAlbedo.anisotropy = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  bouquet.traverse((object) => {
    if (!object.material?.userData.tone) return;
    object.material.map = petalAlbedo;
    object.material.needsUpdate = true;
  });
  scene.add(bouquet);
  const controls = new OrbitControls(camera, mobile ? viewport : canvas);
  controls.enableDamping = !mobile && !motionPreference.matches;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.65;
  controls.minDistance = 2.6;
  controls.maxDistance = 40;
  controls.autoRotateSpeed = 0.55;
  const updateControls = controls.update.bind(controls);
  // Touch events only accumulate input; camera transforms are applied once per frame.
  if (mobile) controls.update = () => { requestRender(); return false; };
  controls.target.set(0, 0.05, 0);
  camera.position.set(4.8, 6.6, 10.5);

  let frame = 0;
  let previousTime = 0;
  let cameraTransition = null;
  let failed = false;
  let activeView = 'whole';
  let animationFrames = 0;
  let interacting = false;

  function requestRender() {
    if (!frame && !document.hidden && !failed) frame = requestAnimationFrame(render);
  }

  function markView(name) {
    activeView = name;
    presetButtons.forEach((button) => {
      const selected = button.dataset.view === name;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    label.textContent = ({ whole: '全束观察', bloom: '花冠细节', top: '顶部观察' })[name] || '自由观察';
  }

  function setAuto(value) {
    controls.autoRotate = value;
    autoButton.setAttribute('aria-pressed', String(value));
    requestRender();
  }

  function changeView(name, immediate = false) {
    const aspect = viewport.clientWidth / viewport.clientHeight;
    const fit = Math.max(1, (viewport.clientWidth < 640 ? 0.69 : 0.82) / aspect);
    const views = {
      whole: { target: new THREE.Vector3(0, -0.05, 0), offset: new THREE.Vector3(4.8, 6.6, 10.5).multiplyScalar(fit) },
      bloom: { target: new THREE.Vector3(0, 1.10, 0), offset: new THREE.Vector3(3.8, 5.2, 7.2).multiplyScalar(fit) },
      top: { target: new THREE.Vector3(0, 1.02, 0), offset: new THREE.Vector3(0.015, 11.2, 0.015).multiplyScalar(fit) },
    };
    const next = views[name];
    if (!next) return;
    setAuto(false);
    updateControls();
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const to = new THREE.Spherical().setFromVector3(next.offset);
    // Interpolate around the flower so an opposite-side reset never flies through it.
    to.theta = from.theta + THREE.MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, Math.PI * 2) - Math.PI;
    cameraTransition = { start: performance.now(), from, to, fromTarget: controls.target.clone(), target: next.target };
    if (immediate || motionPreference.matches) {
      controls.target.copy(next.target);
      camera.position.copy(next.target).add(next.offset);
      cameraTransition = null;
    }
    markView(name);
    requestRender();
  }

  function zoom(scale) {
    cameraTransition = null;
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * scale, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    requestRender();
  }

  function render(time) {
    frame = 0;
    if (failed || document.hidden) return;
    if (quality.sampleFrame(previousTime && !interacting && (controls.autoRotate || cameraTransition) ? time - previousTime : 0)) renderer.setPixelRatio(quality.pixelRatio);
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
    previousTime = time;
    if (cameraTransition) {
      const progress = Math.min((time - cameraTransition.start) / 760, 1);
      const t = 1 - Math.pow(1 - progress, 4);
      const { from, to, fromTarget, target } = cameraTransition;
      const spherical = new THREE.Spherical(
        THREE.MathUtils.lerp(from.radius, to.radius, t),
        THREE.MathUtils.lerp(from.phi, to.phi, t),
        THREE.MathUtils.lerp(from.theta, to.theta, t),
      );
      controls.target.lerpVectors(fromTarget, target, t);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      if (progress === 1) cameraTransition = null;
    }
    const changed = updateControls(delta);
    renderer.render(scene, camera);
    animationFrames++;
    if (controls.autoRotate || cameraTransition || interacting || changed) requestRender();
  }

  function resize() {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    camera.aspect = width / height;
    // Leave room for the botanical caption without moving the orbit's centre.
    const horizontalOffset = width < 640 ? -width * 0.035 : -width * 0.09;
    const renderWindow = getRenderWindow(width, height, mobile);
    camera.setViewOffset(width, height, horizontalOffset, renderWindow.top, width, renderWindow.height);
    camera.updateProjectionMatrix();
    canvas.style.position = 'absolute';
    canvas.style.top = `${renderWindow.top}px`;
    renderer.setSize(width, renderWindow.height);
    if (activeView) {
      const wasRotating = controls.autoRotate;
      changeView(activeView, true);
      setAuto(wasRotating);
    }
    requestRender();
  }

  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', () => {
    interacting = true;
    cameraTransition = null;
    setAuto(false);
    markView(null);
  });
  controls.addEventListener('end', () => { interacting = false; requestRender(); });
  autoButton.addEventListener('click', () => { cameraTransition = null; setAuto(!controls.autoRotate); });
  document.querySelector('#reset').addEventListener('click', () => changeView('whole'));
  document.querySelector('#zoom-in').addEventListener('click', () => zoom(0.83));
  document.querySelector('#zoom-out').addEventListener('click', () => zoom(1.2));
  presetButtons.forEach((button) => button.addEventListener('click', () => changeView(button.dataset.view)));
  canvas.addEventListener('keydown', (event) => {
    if (['+', '=', '-', '_', 'Home', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    else return;
    if (event.key === 'Home') return changeView('whole');
    if (event.key === '+' || event.key === '=') return zoom(0.85);
    if (event.key === '-' || event.key === '_') return zoom(1.18);
    cameraTransition = null;
    setAuto(false);
    markView(null);
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const step = 0.12;
    if (event.key === 'ArrowLeft') spherical.theta -= step;
    if (event.key === 'ArrowRight') spherical.theta += step;
    if (event.key === 'ArrowUp') spherical.phi -= step;
    if (event.key === 'ArrowDown') spherical.phi += step;
    spherical.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    requestRender();
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  document.addEventListener('visibilitychange', () => {
    previousTime = 0;
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestRender();
  });
  motionPreference.addEventListener('change', () => {
    controls.enableDamping = !mobile && !motionPreference.matches;
    if (motionPreference.matches) setAuto(false);
    requestRender();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    failed = true;
    cancelAnimationFrame(frame);
    showError('图形上下文已中断。请关闭占用显卡的其他页面，然后重新加载。');
  });

  changeView('whole', true);
  setAuto(!motionPreference.matches);
  resize();
  updateControls();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  loading.classList.add('is-done');
  loading.addEventListener('transitionend', () => { loading.hidden = true; }, { once: true });
  if (motionPreference.matches) loading.hidden = true;
  document.documentElement.dataset.ready = 'true';

  if (import.meta.env.DEV) {
    window.__roseStudy = {
      scene, camera, controls, renderer, bouquet,
      stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, frames: animationFrames, activeView, mobile, pixelRatio: quality.pixelRatio }),
    };
  }
  if (import.meta.hot) import.meta.hot.dispose(() => {
    failed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    controls.dispose();
    scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      object.geometry?.dispose();
      if (object.material) for (const material of [].concat(object.material)) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
    environment.dispose();
    renderer.dispose();
    canvas.remove();
    delete window.__roseStudy;
  });
}

start().catch((error) => {
  console.error('Unable to initialize the rose scene:', error);
  showError();
});
