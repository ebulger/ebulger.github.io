/* November 2026 | Eli Bulger
 * Lightweight WebGL2 brain-surface viewer with ROI overlay and ray picking.
 * Input: simplified triangular mesh exported from the volumetric FEM model.
 * Output: interactive 3D surface and clicked anatomical coordinates (mm).
 */
const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalized = a => { const length = Math.hypot(...a) || 1; return a.map(v => v / length); };

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = 2 * near * far / (near - far);
  return out;
}

function lookAt(eye, target) {
  const z = normalized(vecSub(eye, target));
  let x = normalized(cross([0, 0, 1], z));
  if (Math.hypot(...x) < 1e-4) x = [1, 0, 0];
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[row + column * 4] = a[row] * b[column * 4] +
        a[row + 4] * b[column * 4 + 1] +
        a[row + 8] * b[column * 4 + 2] +
        a[row + 12] * b[column * 4 + 3];
    }
  }
  return out;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function loadSurface(buffer) {
  if (new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== 'BRNSURF1') {
    throw new Error('Unsupported surface geometry file.');
  }
  const view = new DataView(buffer);
  const count = view.getUint32(8, true);
  const triangles = view.getUint32(12, true);
  const positions = new Float32Array(buffer, 16, count * 3);
  const indices = new Uint16Array(buffer, 16 + positions.byteLength, triangles * 3);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ab = [positions[ib] - positions[ia], positions[ib + 1] - positions[ia + 1], positions[ib + 2] - positions[ia + 2]];
    const ac = [positions[ic] - positions[ia], positions[ic + 1] - positions[ia + 1], positions[ic + 2] - positions[ia + 2]];
    const normal = cross(ab, ac);
    for (const index of [ia, ib, ic]) {
      normals[index] += normal[0]; normals[index + 1] += normal[1]; normals[index + 2] += normal[2];
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = normalized([normals[i], normals[i + 1], normals[i + 2]]);
    normals.set(n, i);
  }
  return {positions, indices, normals};
}

function intersectTriangle(origin, direction, vertices, a, b, c) {
  const va = [vertices[a], vertices[a + 1], vertices[a + 2]];
  const vb = [vertices[b], vertices[b + 1], vertices[b + 2]];
  const vc = [vertices[c], vertices[c + 1], vertices[c + 2]];
  const ab = vecSub(vb, va);
  const ac = vecSub(vc, va);
  const p = cross(direction, ac);
  const determinant = dot(ab, p);
  if (Math.abs(determinant) < 1e-9) return Infinity;
  const inverse = 1 / determinant;
  const t = vecSub(origin, va);
  const u = dot(t, p) * inverse;
  if (u < 0 || u > 1) return Infinity;
  const q = cross(t, ab);
  const v = dot(direction, q) * inverse;
  if (v < 0 || u + v > 1) return Infinity;
  const distance = dot(ac, q) * inverse;
  return distance > 0 ? distance : Infinity;
}

export class BrainViewer {
  constructor(canvas, marker, buffer, onPick) {
    this.canvas = canvas;
    this.marker = marker;
    this.onPick = onPick;
    this.mesh = loadSurface(buffer);
    this.gl = canvas.getContext('webgl2', {alpha: false, antialias: true});
    this.fallback = !this.gl; // Canvas 2D fallback for browsers without WebGL2.
    this.target = [0, 0, 5];
    this.resetCamera(false);
    this.roi = [-70, -10, 9];
    this.radius = 8;
    if (this.gl) this.initGL();
    this.bindEvents();
    new ResizeObserver(() => this.draw()).observe(canvas);
    this.draw();
  }

  initGL() {
    const gl = this.gl;
    const vs = `#version 300 es
      precision highp float;
      in vec3 aPosition; in vec3 aNormal;
      uniform mat4 uViewProj;
      out vec3 vPosition; out vec3 vNormal;
      void main(){vPosition=aPosition;vNormal=aNormal;gl_Position=uViewProj*vec4(aPosition,1.0);}`;
    const fs = `#version 300 es
      precision highp float;
      in vec3 vPosition; in vec3 vNormal;
      uniform vec3 uRoi; uniform float uRadius; uniform float uDark;
      out vec4 outColor;
      void main(){
        vec3 normal=normalize(vNormal);
        float illumination=0.70+0.30*abs(dot(normal,normalize(vec3(0.35,-0.45,0.82))));
        vec3 base=mix(vec3(0.73,0.76,0.75),vec3(0.55,0.59,0.58),uDark);
        vec3 accent=mix(vec3(0.35,0.66,0.49),vec3(0.55,0.84,0.64),uDark);
        float roi=1.0-smoothstep(max(uRadius-1.0,0.0),uRadius+1.0,length(vPosition-uRoi));
        outColor=vec4(mix(base,accent,roi*0.93)*illumination,1.0);
      }`;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    this.program = program;
    this.uniforms = {
      viewProj: gl.getUniformLocation(program, 'uViewProj'),
      roi: gl.getUniformLocation(program, 'uRoi'),
      radius: gl.getUniformLocation(program, 'uRadius'),
      dark: gl.getUniformLocation(program, 'uDark')
    };
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.positions, gl.STATIC_DRAW);
    const attrPos = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(attrPos);
    gl.vertexAttribPointer(attrPos, 3, gl.FLOAT, false, 0, 0);
    const normal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normal);
    gl.bufferData(gl.ARRAY_BUFFER, this.mesh.normals, gl.STATIC_DRAW);
    const attrNormal = gl.getAttribLocation(program, 'aNormal');
    gl.enableVertexAttribArray(attrNormal);
    gl.vertexAttribPointer(attrNormal, 3, gl.FLOAT, false, 0, 0);
    const faces = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, faces);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.vao = vao;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  cameraBasis() {
    const c = Math.cos(this.pitch);
    const delta = [c * Math.cos(this.yaw), c * Math.sin(this.yaw), Math.sin(this.pitch)];
    const origin = this.target.map((v, i) => v + this.distance * delta[i]);
    const forward = normalized(vecSub(this.target, origin));
    const right = normalized(cross(forward, [0, 0, 1]));
    const up = cross(right, forward);
    return {origin, forward, right, up};
  }

  resetCamera(redraw = true) {
    this.yaw = Math.PI;
    this.pitch = 0.23;
    this.distance = 255;
    if (redraw) this.draw();
  }

  setROI(center, radius) {
    this.roi = center;
    this.radius = radius;
    this.draw();
  }

  draw() {
    const canvas = this.canvas;
    const size = canvas.getBoundingClientRect();
    if (!size.width || !size.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(size.width * dpr));
    const height = Math.max(1, Math.round(size.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
    }
    const {origin} = this.cameraBasis();
    const view = lookAt(origin, this.target);
    const projection = perspective(Math.PI / 4, size.width / size.height, 1, 1200);
    const viewProj = multiply(projection, view);
    this.viewProj = viewProj;
    const isDark = document.documentElement.dataset.theme === 'dark';

    if (this.fallback) {
      this.drawFallback(width, height, isDark);
    } else {
      const gl = this.gl;
      gl.viewport(0, 0, width, height);
      gl.clearColor(...(isDark ? [0.11, 0.13, 0.13, 1] : [0.968, 0.975, 0.972, 1]));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.uniforms.viewProj, false, viewProj);
      gl.uniform3fv(this.uniforms.roi, this.roi);
      gl.uniform1f(this.uniforms.radius, this.radius);
      gl.uniform1f(this.uniforms.dark, isDark ? 1 : 0);
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
    this.positionMarker(size);
  }

  drawFallback(width, height, isDark) {
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = isDark ? '#1c2120' : '#f7f9f8';
    ctx.fillRect(0, 0, width, height);
    const proj = this.viewProj;
    const points = this.mesh.positions;
    const xy = new Float32Array(points.length / 3 * 3);
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i], y = points[i + 1], z = points[i + 2];
      const w = proj[3] * x + proj[7] * y + proj[11] * z + proj[15];
      xy[i] = (1 + (proj[0] * x + proj[4] * y + proj[8] * z + proj[12]) / w) * width / 2;
      xy[i + 1] = (1 - (proj[1] * x + proj[5] * y + proj[9] * z + proj[13]) / w) * height / 2;
      xy[i + 2] = (proj[2] * x + proj[6] * y + proj[10] * z + proj[14]) / w;
    }
    const faces = this.mesh.indices;
    const depth = [];
    for (let i = 0; i < faces.length; i += 3) {
      depth.push([i, (xy[3 * faces[i] + 2] + xy[3 * faces[i + 1] + 2] + xy[3 * faces[i + 2] + 2]) / 3]);
    }
    depth.sort((a, b) => b[1] - a[1]);
    const radius2 = this.radius * this.radius;
    for (const [face] of depth) {
      const a = faces[face] * 3, b = faces[face + 1] * 3, c = faces[face + 2] * 3;
      const x = (points[a] + points[b] + points[c]) / 3;
      const y = (points[a + 1] + points[b + 1] + points[c + 1]) / 3;
      const z = (points[a + 2] + points[b + 2] + points[c + 2]) / 3;
      const dx = x - this.roi[0], dy = y - this.roi[1], dz = z - this.roi[2];
      const inside = dx * dx + dy * dy + dz * dz <= radius2;
      const normals = this.mesh.normals;
      const nx = (normals[a] + normals[b] + normals[c]) / 3;
      const ny = (normals[a + 1] + normals[b + 1] + normals[c + 1]) / 3;
      const nz = (normals[a + 2] + normals[b + 2] + normals[c + 2]) / 3;
      const len = Math.hypot(nx, ny, nz) || 1;
      const light = 0.56 + 0.44 * Math.abs((.35 * nx - .45 * ny + .82 * nz) / len);
      const base = inside ? (isDark ? [103, 195, 139] : [99, 174, 126]) :
        (isDark ? [166, 178, 170] : [197, 209, 201]);
      ctx.fillStyle = `rgb(${base.map(v => Math.round(v * light)).join(',')})`;
      ctx.beginPath();
      ctx.moveTo(xy[a], xy[a + 1]);
      ctx.lineTo(xy[b], xy[b + 1]);
      ctx.lineTo(xy[c], xy[c + 1]);
      ctx.closePath();
      ctx.fill();
    }
  }

  positionMarker(size) {
    const m = this.viewProj;
    if (!m) return;
    const p = this.roi;
    const clipX = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const clipY = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    this.marker.hidden = w <= 0;
    if (w > 0) {
      this.marker.style.left = `${(clipX / w + 1) * size.width / 2}px`;
      this.marker.style.top = `${(1 - clipY / w) * size.height / 2}px`;
    }
  }

  pick(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    const nx = 2 * (clientX - bounds.left) / bounds.width - 1;
    const ny = 1 - 2 * (clientY - bounds.top) / bounds.height;
    const basis = this.cameraBasis();
    const tan = Math.tan(Math.PI / 8);
    const aspect = bounds.width / bounds.height;
    const direction = normalized([0, 1, 2].map(i => basis.forward[i] +
      nx * aspect * tan * basis.right[i] + ny * tan * basis.up[i]));
    const indices = this.mesh.indices;
    const positions = this.mesh.positions;
    let nearest = Infinity;
    for (let i = 0; i < indices.length; i += 3) {
      const t = intersectTriangle(basis.origin, direction, positions,
        indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3);
      if (t < nearest) nearest = t;
    }
    if (Number.isFinite(nearest)) {
      this.onPick(basis.origin.map((x, i) => x + direction[i] * nearest));
    }
  }

  bindEvents() {
    let pointer = null;
    this.canvas.addEventListener('pointerdown', e => {
      pointer = {x: e.clientX, y: e.clientY, startX: e.clientX,
                 startY: e.clientY, moved: false};
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!pointer) return;
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      if (Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 5) {
        pointer.moved = true;
      }
      if (pointer.moved) {
        this.yaw -= dx * 0.008;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.008));
        this.draw();
      }
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    });
    this.canvas.addEventListener('pointerup', e => {
      if (pointer && !pointer.moved) this.pick(e.clientX, e.clientY);
      pointer = null;
    });
    this.canvas.addEventListener('pointercancel', () => pointer = null);
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.distance = Math.max(130, Math.min(620, this.distance * Math.exp(e.deltaY * 0.001)));
      this.draw();
    }, {passive: false});
  }
}
