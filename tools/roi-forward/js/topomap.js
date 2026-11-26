/* November 2026 | Eli Bulger
 * Canvas rendering of FieldTrip's dense-channel positions and outlines.
 * Input: layout_dense.json and channel-level predicted delta HbO (uM).
 * Output: live, local smooth channel topography, contours and channel tooltips.
 */
const RESOLUTION = 176;
const NEIGHBORS = 12;
const CONTOUR_LEVELS = [-.8, -.6, -.4, -.2, .2, .4, .6, .8];
const PLOT_RANGE = 1.24; // layout units across the square

function divergingColor(value) {
  const x = Math.max(-1, Math.min(1, value));
  const neutral = [247, 248, 246];
  const target = x > 0 ? [185, 77, 69] : [58, 106, 166];
  const t = Math.pow(Math.abs(x), 0.8);
  return neutral.map((v, i) => Math.round(v + t * (target[i] - v)));
}

export class ChannelTopomap {
  constructor(canvas, tooltip, layout) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.positions = layout.positions;
    this.labels = layout.labels;
    this.outlines = layout.outline;
    this.showSensors = false;
    this.values = new Float64Array(this.labels.length);
    this.mode = 'auto';
    this.pixelCanvas = document.createElement('canvas');
    this.pixelCanvas.width = this.pixelCanvas.height = RESOLUTION;
    this.pixelContext = this.pixelCanvas.getContext('2d');
    this.prepareInterpolation();
    this.bindEvents();
    new ResizeObserver(() => this.draw()).observe(canvas);
    this.draw();
  }

  prepareInterpolation() {
    const nPixels = RESOLUTION * RESOLUTION;
    this.nearest = new Uint16Array(nPixels * NEIGHBORS);
    this.weights = new Float32Array(nPixels * NEIGHBORS);
    this.inMask = new Uint8Array(nPixels);
    this.field = new Float64Array(nPixels);

    for (let iy = 0; iy < RESOLUTION; iy++) {
      const y = (0.5 - (iy + .5) / RESOLUTION) * PLOT_RANGE;
      for (let ix = 0; ix < RESOLUTION; ix++) {
        const x = ((ix + .5) / RESOLUTION - .5) * PLOT_RANGE;
        const pixel = iy * RESOLUTION + ix;
        if (x * x + y * y > .25) continue;
        this.inMask[pixel] = 1;
        const distances = new Float32Array(NEIGHBORS).fill(Infinity);
        const candidates = new Uint16Array(NEIGHBORS);
        for (let ch = 0; ch < this.positions.length; ch++) {
          const p = this.positions[ch];
          const dx = x - p[0], dy = y - p[1];
          const distance = dx * dx + dy * dy;
          if (distance >= distances[NEIGHBORS - 1]) continue;
          let insertion = NEIGHBORS - 1;
          while (insertion > 0 && distance < distances[insertion - 1]) {
            distances[insertion] = distances[insertion - 1];
            candidates[insertion] = candidates[insertion - 1];
            insertion--;
          }
          distances[insertion] = distance;
          candidates[insertion] = ch;
        }
        // Modified Shepard interpolation: compact support and a smooth taper.
        // The local support radius adapts to channel spacing.
        const radius = Math.max(Math.sqrt(distances[NEIGHBORS - 1]), 1e-8);
        let normalization = 0;
        for (let neighbor = 0; neighbor < NEIGHBORS; neighbor++) {
          const index = pixel * NEIGHBORS + neighbor;
          this.nearest[index] = candidates[neighbor];
          const distance = Math.sqrt(distances[neighbor]);
          const taper = Math.max(0, 1 - distance / radius);
          const weight = taper * taper / (distances[neighbor] + 1e-12);
          this.weights[index] = weight;
          normalization += weight;
        }
        for (let neighbor = 0; neighbor < NEIGHBORS; neighbor++) {
          this.weights[pixel * NEIGHBORS + neighbor] = normalization > 0
            ? this.weights[pixel * NEIGHBORS + neighbor] / normalization : 1 / NEIGHBORS;
        }
      }
    }
  }

  setValues(values, mode) {
    if (values.length !== this.labels.length) {
      throw new Error('Layout and Jacobian channel counts do not match.');
    }
    this.values = values;
    this.mode = mode;
    this.draw();
  }

  screenPoint(point, width, height) {
    return [(0.5 + point[0] / PLOT_RANGE) * width,
            (0.5 - point[1] / PLOT_RANGE) * height];
  }

  draw() {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const valueMax = this.values.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    this.scale = this.mode === 'fixed' ? 0.05 : Math.max(1e-10, valueMax);

    const image = this.pixelContext.createImageData(RESOLUTION, RESOLUTION);
    for (let pixel = 0; pixel < this.inMask.length; pixel++) {
      if (!this.inMask[pixel]) continue;
      const offset = pixel * NEIGHBORS;
      let value = 0;
      for (let k = 0; k < NEIGHBORS; k++) {
        value += this.values[this.nearest[offset + k]] * this.weights[offset + k];
      }
      this.field[pixel] = value / this.scale;
      const rgb = divergingColor(this.field[pixel]);
      const rgba = pixel * 4;
      image.data[rgba] = rgb[0]; image.data[rgba + 1] = rgb[1];
      image.data[rgba + 2] = rgb[2]; image.data[rgba + 3] = 255;
    }
    this.pixelContext.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.pixelCanvas, 0, 0, width, height);
    if (valueMax > 1e-10) this.drawContours(ctx, width, height, dpr);

    const stroke = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#62706a';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, dpr * 1.1);
    this.outlines.forEach(outline => {
      ctx.beginPath();
      outline.forEach((p, i) => {
        const [px, py] = this.screenPoint(p, width, height);
        if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    if (this.showSensors) {
      ctx.lineWidth = Math.max(0.6, dpr * .55);
      for (let ch = 0; ch < this.positions.length; ch++) {
        const [x, y] = this.screenPoint(this.positions[ch], width, height);
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, dpr * 1.2), 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(37,42,40,0.83)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      }
    }
    document.getElementById('scale-positive').textContent = `+${this.scale.toPrecision(2)}`;
    document.getElementById('scale-negative').textContent = `−${this.scale.toPrecision(2)}`;
  }

  drawContours(ctx, width, height, dpr) {
    // Trace isolines on the same interpolated field used for the color map.
    // Marching triangles avoids ambiguous saddle cases in square cells.
    const n = RESOLUTION;
    const sx = width / n, sy = height / n;
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const triangles = [[0, 1, 2], [0, 2, 3]];
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width / (2 * PLOT_RANGE),
                height / (2 * PLOT_RANGE), 0, 0, 2 * Math.PI);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const level of CONTOUR_LEVELS) {
      ctx.beginPath();
      for (let y = 0; y < n - 1; y++) {
        for (let x = 0; x < n - 1; x++) {
          const i = y * n + x;
          const ids = [i, i + 1, i + n + 1, i + n];
          if (!ids.every(j => this.inMask[j])) continue;
          const v = ids.map(j => this.field[j]);
          if (Math.min(...v) >= level || Math.max(...v) < level) continue;
          for (const tri of triangles) {
            const points = [];
            for (let k = 0; k < 3; k++) {
              const a = tri[k], b = tri[(k + 1) % 3];
              if ((v[a] >= level) === (v[b] >= level)) continue;
              const t = (level - v[a]) / (v[b] - v[a]);
              points.push([(x + .5 + corners[a][0] + t * (corners[b][0] - corners[a][0])) * sx,
                           (y + .5 + corners[a][1] + t * (corners[b][1] - corners[a][1])) * sy]);
            }
            if (points.length === 2) {
              ctx.moveTo(...points[0]);
              ctx.lineTo(...points[1]);
            }
          }
        }
      }
      ctx.strokeStyle = 'rgba(35,42,40,0.35)';
      ctx.lineWidth = dpr * .7;
      ctx.stroke();
    }
    ctx.restore();
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const bounds = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - bounds.left) / bounds.width - .5) * PLOT_RANGE;
      const y = (.5 - (e.clientY - bounds.top) / bounds.height) * PLOT_RANGE;
      let index = -1;
      let closest = Infinity;
      for (let i = 0; i < this.positions.length; i++) {
        const dx = x - this.positions[i][0];
        const dy = y - this.positions[i][1];
        const distance = dx * dx + dy * dy;
        if (distance < closest) { closest = distance; index = i; }
      }
      if (closest < 0.001 && index !== -1) {
        this.tooltip.textContent = `${this.labels[index]}: ${this.values[index].toFixed(4)} µM`;
        this.tooltip.classList.add('active');
      } else {
        this.tooltip.classList.remove('active');
      }
    });
    this.canvas.addEventListener('mouseleave', () => this.tooltip.classList.remove('active'));
  }
}
