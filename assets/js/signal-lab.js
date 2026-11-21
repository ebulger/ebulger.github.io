/*
 * Synthetic signal playground | November 2026 | Eli Bulger
 * Steps: Generate a seeded synthetic oscillatory time series; add noise; apply a centered
 * moving average; draw the original and smoothed traces on an SVG chart.
 * Inputs: Oscillation frequency, noise level, and moving-average window controls.
 * Outputs: Interactive SVG curves and parameter readouts; no data are uploaded.
 */
(() => {
  'use strict';

  const controls = {
    noise: document.getElementById('noise'),
    window: document.getElementById('window'),
    frequency: document.getElementById('frequency')
  };
  if (Object.values(controls).some((element) => !element)) return;

  const rawPath = document.getElementById('raw-path');
  const filteredPath = document.getElementById('filtered-path');
  const readout = document.getElementById('lab-readout');
  const sampleRate = 100;
  const sampleCount = 201;

  // Deterministic noise keeps the waveform comparable as the controls change.
  let seed = 1729;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed + .5) / 4294967296;
  };
  const noise = Array.from({ length: sampleCount }, () => {
    const u = Math.max(random(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  });

  function draw() {
    const intensity = Number(controls.noise.value) / 100;
    const windowSize = Number(controls.window.value);
    const hz = Number(controls.frequency.value);
    const measured = noise.map((value, i) => {
      const time = i / sampleRate;
      const signal = Math.sin(2 * Math.PI * hz * time) + .24 * Math.sin(2 * Math.PI * 2.5 * time + .4);
      return signal + intensity * 1.45 * value;
    });
    const half = Math.floor(windowSize / 2);
    const smoothed = measured.map((_, i) => {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(measured.length - 1, i + half); j++) {
        sum += measured[j];
        n++;
      }
      return sum / n;
    });
    const toPath = (values) => values.map((value, i) => {
      const x = 29 + (661 * i / (sampleCount - 1));
      const y = Math.max(35, Math.min(239, 142 - 43 * value));
      return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    rawPath.setAttribute('d', toPath(measured));
    filteredPath.setAttribute('d', toPath(smoothed));
    document.getElementById('noise-output').value = `${controls.noise.value}%`;
    document.getElementById('window-output').value = `${windowSize} ${windowSize === 1 ? 'sample' : 'samples'}`;
    document.getElementById('frequency-output').value = `${hz} Hz`;
    readout.textContent = `Window: ${windowSize * 10} ms`;
  }

  Object.values(controls).forEach((input) => input.addEventListener('input', draw));
  draw();
})();
