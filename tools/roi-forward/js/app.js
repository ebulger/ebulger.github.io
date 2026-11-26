/* November 2026 | Eli Bulger
 * Interactive dense fNIRS measurement-prediction prototype.
 * Inputs: simplified brain surface, FieldTrip layout, and full-resolution
 *         sparsified gray-matter chromophore forward operator.
 * Steps: load assets, choose a gray-matter ROI, predict ΔHbO/ΔHbR, render HbO.
 * Output: interactive brain / channel plots. No server-side computation.
 */
import {ForwardModel} from './model.js';
import {BrainViewer} from './viewer.js';
import {ChannelTopomap} from './topomap.js';

// Published task-scaled absorption changes (760 and 850 nm, mm^-1).
const WAVELENGTH_RATIO = 6.18e-7 / 9.95e-5;
const DEFAULT = {x: -70, y: -10, z: 9, radius: 8, amplitude: -4};
const $ = id => document.getElementById(id);
const format = n => Number(n).toLocaleString('en-US');
let model = null;
let viewer = null;
let topomap = null;
let pending = false;

function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function readControls() {
  const dmua850 = 10 ** Number($('roi-amplitude').value);
  return {
    position: [Number($('roi-x').value), Number($('roi-y').value), Number($('roi-z').value)],
    radius: Number($('roi-radius').value),
    dmua760: WAVELENGTH_RATIO * dmua850,
    dmua850,
    colorScale: $('color-scale').value
  };
}

function updateLabels() {
  for (const axis of ['x', 'y', 'z']) {
    const n = Number($(`roi-${axis}`).value);
    $(`roi-${axis}-val`).textContent = `${n.toFixed(0)} mm`;
  }
  $('roi-radius-val').textContent = `${Number($('roi-radius').value).toFixed(1)} mm`;
  const {dmua760, dmua850} = readControls();
  $('roi-amplitude-val').textContent = `${dmua850.toExponential(2)} mm⁻¹`;
  $('roi-amplitude').setAttribute('aria-valuetext', $('roi-amplitude-val').textContent);
  $('roi-amplitude-760').textContent = `760 nm: ${dmua760.toExponential(2)} mm⁻¹ (fixed ratio)`;
}

function recompute() {
  pending = false;
  updateLabels();
  if (!model || !viewer || !topomap) return;
  const controls = readControls();
  const predicted = model.predict(controls.position, controls.radius, controls.dmua760, controls.dmua850);
  viewer.setROI(predicted.center, controls.radius);
  topomap.setValues(predicted.channelValues, controls.colorScale);

  const peak = predicted.channelValues.reduce((current, value) => Math.max(current, Math.abs(value)), 0);
  const active = peak > 1e-10 ? predicted.channelValues.filter(v => Math.abs(v) > peak * .1).length : 0;
  $('selected-count').textContent = `${format(predicted.count)} GM nodes`;
  $('roi-position').textContent = `ROI center: ${predicted.center.map(n => n.toFixed(1)).join(', ')} mm`;
  $('peak-hbo').textContent = `Peak |ΔHbO|: ${peak < 1e-7 ? '≈0' : peak.toFixed(4)} µM`;
  $('active-channels').textContent = `${active} channels above 10% of peak`;
}

function scheduleUpdate() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(recompute);
}

function setPosition(position) {
  ['x', 'y', 'z'].forEach((axis, i) => {
    $(`roi-${axis}`).value = String(Math.round(position[i]));
  });
  scheduleUpdate();
}

function resetROI() {
  for (const [key, value] of Object.entries(DEFAULT)) {
    $(`roi-${key}`).value = String(value);
  }
  scheduleUpdate();
}

function attachControls() {
  for (const name of ['x', 'y', 'z', 'radius', 'amplitude']) {
    $(`roi-${name}`).addEventListener('input', scheduleUpdate);
  }
  $('color-scale').addEventListener('change', scheduleUpdate);
  $('show-sensors').addEventListener('change', e => {
    topomap.showSensors = e.target.checked;
    topomap.draw();
  });
  $('reset-roi').addEventListener('click', resetROI);
  $('reset-view').addEventListener('click', () => viewer.resetCamera());
  document.querySelectorAll('[data-position]').forEach(button => {
    button.addEventListener('click', () => setPosition(button.dataset.position.split(',').map(Number)));
  });
  $('model-file').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      model = new ForwardModel(await file.arrayBuffer());
      initializeModel();
      $('model-file-note').textContent = `Loaded ${file.name} from this computer.`;
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  const themeButton = $('theme-toggle');
  function updateThemeButton() {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeButton.textContent = dark ? 'Light' : 'Dark';
    themeButton.setAttribute('aria-pressed', String(dark));
  }
  themeButton.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('site-theme', theme); } catch (_) { /* optional */ }
    updateThemeButton();
    viewer?.draw();
    topomap?.draw();
  });
  updateThemeButton();
}

function initializeModel() {
  if (model.channelCount !== topomap.labels.length) {
    throw new Error('The forward model does not match the dense layout channel count.');
  }
  for (const [axis, bounds] of model.bounds.entries()) {
    const slider = $(`roi-${['x', 'y', 'z'][axis]}`);
    slider.min = String(Math.floor(bounds[0]));
    slider.max = String(Math.ceil(bounds[1]));
  }
  $('model-summary').textContent = `${format(model.channelCount)} channels · ${format(model.nodeCount)} GM nodes · full chromophore Jacobian`;
  setStatus('');
  scheduleUpdate();
}

async function fetchDefaultModel() {
  if (typeof DecompressionStream === 'function') {
    const direct = await fetch('data/model.bin.gz');
    if (direct.ok && direct.body) {
      return new Response(direct.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    const first = await fetch('data/model-part-00.bin');
    if (first.ok) {
      const remaining = await Promise.all(Array.from({length: 7}, (_, i) =>
        fetch(`data/model-part-${String(i + 1).padStart(2, '0')}.bin`)));
      if (remaining.some(response => !response.ok)) {
        throw new Error('One or more forward-model chunks could not be loaded.');
      }
      const parts = await Promise.all([first, ...remaining].map(response => response.arrayBuffer()));
      return new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
  }
  const response = await fetch('data/model.bin');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function start() {
  attachControls();
  updateLabels();
  try {
    const [surfaceResponse, layoutResponse] = await Promise.all([
      fetch('data/surface.bin'), fetch('data/layout.json')
    ]);
    if (!surfaceResponse.ok || !layoutResponse.ok) throw new Error('Failed to load brain surface or channel layout.');
    const [surfaceBuffer, layout] = await Promise.all([surfaceResponse.arrayBuffer(), layoutResponse.json()]);
    viewer = new BrainViewer($('brain-canvas'), $('roi-marker'), surfaceBuffer, setPosition);
    topomap = new ChannelTopomap($('topomap-canvas'), $('channel-tooltip'), layout);
  } catch (error) {
    setStatus(`Could not initialize visualization: ${error.message}`, true);
    return;
  }
  try {
    model = new ForwardModel(await fetchDefaultModel());
    initializeModel();
  } catch (error) {
    document.querySelector('.data-import').style.display = 'flex';
    setStatus(`Forward model not available (${error.message}). Select a model.bin file below to load it from your computer.`, true);
    $('model-summary').textContent = 'Model file needed';
  }
}

start();
