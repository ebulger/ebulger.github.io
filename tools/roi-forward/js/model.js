/* November 2026 | Eli Bulger
 * Read the full browser-exported chromophore Jacobian and compute ROI predictions.
 * Input: model.bin (column-sparse 2-wavelength Jacobian and GM coordinates).
 * Output: predicted channel-level delta HbO/HbR and selected-node count.
 */
const DECODER = new TextDecoder();

export class ForwardModel {
  constructor(buffer) {
    const view = new DataView(buffer);
    if (DECODER.decode(new Uint8Array(buffer, 0, 8)) !== 'FWDGM002') {
      throw new Error('Unsupported forward-model file. Expected FWDGM002.');
    }
    this.nodeCount = view.getUint32(8, true);
    this.channelCount = view.getUint32(12, true);
    this.nonzeroCount = view.getUint32(16, true);
    if (this.nodeCount < 1 || this.channelCount < 1 || 2 * this.channelCount > 65535) {
      throw new Error('Invalid model dimensions.');
    }

    let offset = 20;
    this.coords = new Float32Array(buffer, offset, 3 * this.nodeCount);
    offset += this.coords.byteLength;
    this.colPtr = new Uint32Array(buffer, offset, 2 * this.nodeCount + 1);
    offset += this.colPtr.byteLength;
    this.rows = new Uint16Array(buffer, offset, this.nonzeroCount);
    offset += this.rows.byteLength;
    offset = (offset + 3) & ~3;
    this.values = new Float32Array(buffer, offset, this.nonzeroCount);
    if (this.colPtr[2 * this.nodeCount] !== this.nonzeroCount) {
      throw new Error('Invalid CSC column-pointer array.');
    }

    this.bounds = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
    for (let i = 0; i < this.nodeCount; i++) {
      const pos = 3 * i;
      for (let axis = 0; axis < 3; axis++) {
        const v = this.coords[pos + axis];
        this.bounds[axis][0] = Math.min(this.bounds[axis][0], v);
        this.bounds[axis][1] = Math.max(this.bounds[axis][1], v);
      }
    }
  }

  nearestNode(position) {
    const p = this.coords;
    let nearest = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < this.nodeCount; i++) {
      const off = i * 3;
      const dx = p[off] - position[0];
      const dy = p[off + 1] - position[1];
      const dz = p[off + 2] - position[2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = i;
      }
    }
    return nearest;
  }

  predict(position, radius, dmua760, dmua850) {
    const nearest = this.nearestNode(position);
    const p = this.coords;
    const base = nearest * 3;
    const center = [p[base], p[base + 1], p[base + 2]];
    const radiusSquared = radius * radius;
    const absorption = [dmua760, dmua850];
    const values = new Float64Array(2 * this.channelCount);
    let count = 0;

    // Iterate spatial nodes; accumulate sparse rows for those in the sphere.
    for (let node = 0; node < this.nodeCount; node++) {
      const i = 3 * node;
      const dx = p[i] - center[0];
      const dy = p[i + 1] - center[1];
      const dz = p[i + 2] - center[2];
      if (dx * dx + dy * dy + dz * dz > radiusSquared) continue;
      count++;
      for (let wave = 0; wave < 2; wave++) {
        const col = node + wave * this.nodeCount;
        for (let entry = this.colPtr[col]; entry < this.colPtr[col + 1]; entry++) {
          values[this.rows[entry]] += absorption[wave] * this.values[entry];
        }
      }
    }
    return {center, count, channelValues: values.subarray(0, this.channelCount),
      hbrValues: values.subarray(this.channelCount)};
  }
}
