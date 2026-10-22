const ECC_LEVELS = Object.freeze({
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
});

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./";

// Data-codeword groups for versions 1–6. Each entry is error-correction
// codewords per block, then the data-codeword length of every block.
const VERSION_BLOCKS = Object.freeze({
  1: {
    L: [7, [19]],
    M: [10, [16]],
    Q: [13, [13]],
    H: [17, [9]],
  },
  2: {
    L: [10, [34]],
    M: [16, [28]],
    Q: [22, [22]],
    H: [28, [16]],
  },
  3: {
    L: [15, [55]],
    M: [26, [44]],
    Q: [18, [17, 17]],
    H: [22, [13, 13]],
  },
  4: {
    L: [20, [80]],
    M: [18, [32, 32]],
    Q: [26, [24, 24]],
    H: [16, [9, 9, 9, 9]],
  },
  5: {
    L: [26, [108]],
    M: [24, [43, 43]],
    Q: [18, [15, 15, 16, 16]],
    H: [22, [11, 11, 12, 12]],
  },
  6: {
    L: [18, [68, 68]],
    M: [16, [27, 27, 27, 27]],
    Q: [24, [19, 19, 19, 19]],
    H: [28, [15, 15, 15, 15]],
  },
});

const ALIGNMENT_CENTERS = Object.freeze({
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
});

const GALOIS_EXP = new Uint8Array(512);
const GALOIS_LOG = new Uint8Array(256);
let galoisReady = false;

function initGalois() {
  if (galoisReady) return;
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GALOIS_EXP[index] = value;
    GALOIS_LOG[value] = index;
    value <<= 1;
    if (value >= 256) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) GALOIS_EXP[index] = GALOIS_EXP[index - 255];
  galoisReady = true;
}

function galoisMultiply(left, right) {
  if (left === 0 || right === 0) return 0;
  return GALOIS_EXP[GALOIS_LOG[left] + GALOIS_LOG[right]];
}

function reedSolomonDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let cursor = 0; cursor < degree; cursor += 1) {
      result[cursor] = galoisMultiply(result[cursor], root);
      if (cursor + 1 < degree) result[cursor] ^= result[cursor + 1];
    }
    root = galoisMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data, degree) {
  const divisor = reedSolomonDivisor(degree);
  const result = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[degree - 1] = 0;
    if (factor === 0) continue;
    for (let index = 0; index < degree; index += 1) {
      result[index] ^= galoisMultiply(divisor[index], factor);
    }
  }
  return result;
}

function dataCapacity(version, level) {
  return VERSION_BLOCKS[version][level][1].reduce((sum, size) => sum + size, 0);
}

function pushBits(bits, value, length) {
  for (let shift = length - 1; shift >= 0; shift -= 1) bits.push((value >>> shift) & 1);
}

function encodePayload(text, version, level) {
  const capacity = dataCapacity(version, level) * 8;
  const alphanumeric = [...text].every((character) => ALPHANUMERIC.includes(character));
  const bits = [];
  if (alphanumeric) {
    pushBits(bits, 0b0010, 4);
    pushBits(bits, text.length, version <= 9 ? 9 : 11);
    for (let index = 0; index < text.length; index += 2) {
      const first = ALPHANUMERIC.indexOf(text[index]);
      if (index + 1 < text.length) {
        const second = ALPHANUMERIC.indexOf(text[index + 1]);
        pushBits(bits, first * 45 + second, 11);
      } else {
        pushBits(bits, first, 6);
      }
    }
  } else {
    const bytes = new TextEncoder().encode(text);
    pushBits(bits, 0b0100, 4);
    pushBits(bits, bytes.length, version <= 9 ? 8 : 16);
    for (const byte of bytes) pushBits(bits, byte, 8);
  }
  if (bits.length > capacity) return null;
  pushBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0 && bits.length < capacity) bits.push(0);
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (bits.length + 8 <= capacity) {
    pushBits(bits, pads[padIndex], 8);
    padIndex ^= 1;
  }
  if (bits.length !== capacity) return null;
  return bits;
}

function bitsToBytes(bits) {
  const bytes = [];
  for (let index = 0; index < bits.length; index += 8) {
    let value = 0;
    for (let shift = 0; shift < 8; shift += 1) value = (value << 1) | bits[index + shift];
    bytes.push(value);
  }
  return bytes;
}

function interleave(version, level, bytes) {
  const [eccPerBlock, blockSizes] = VERSION_BLOCKS[version][level];
  const blocks = [];
  let offset = 0;
  for (const size of blockSizes) {
    const data = bytes.slice(offset, offset + size);
    offset += size;
    blocks.push({ data, ecc: reedSolomonRemainder(data, eccPerBlock) });
  }
  const interleaved = [];
  const longestData = Math.max(...blockSizes);
  for (let index = 0; index < longestData; index += 1) {
    for (const block of blocks) {
      if (index < block.data.length) interleaved.push(block.data[index]);
    }
  }
  for (let index = 0; index < eccPerBlock; index += 1) {
    for (const block of blocks) interleaved.push(block.ecc[index]);
  }
  return interleaved;
}

function createMatrix(size) {
  return {
    dark: Array.from({ length: size }, () => Array(size).fill(false)),
    fn: Array.from({ length: size }, () => Array(size).fill(false)),
  };
}

function setFunction(matrix, x, y, dark) {
  const size = matrix.dark.length;
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  matrix.dark[y][x] = dark;
  matrix.fn[y][x] = true;
}

function drawFinder(matrix, x, y) {
  for (let row = -1; row <= 7; row += 1) {
    for (let column = -1; column <= 7; column += 1) {
      const distance = Math.max(Math.abs(row - 3), Math.abs(column - 3));
      const inside = row >= 0 && row <= 6 && column >= 0 && column <= 6;
      const dark = inside && (distance !== 2);
      setFunction(matrix, x + column, y + row, dark);
    }
  }
}

function drawAlignment(matrix, x, y) {
  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      const dark = Math.max(Math.abs(row), Math.abs(column)) !== 1;
      setFunction(matrix, x + column, y + row, dark);
    }
  }
}

function drawFunctionPatterns(matrix, version) {
  const size = matrix.dark.length;
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, size - 7, 0);
  drawFinder(matrix, 0, size - 7);
  const centers = ALIGNMENT_CENTERS[version];
  for (const row of centers) {
    for (const column of centers) {
      const overlapsFinder = (row === 6 && column === 6)
        || (row === 6 && column === centers[centers.length - 1])
        || (column === 6 && row === centers[centers.length - 1]);
      if (!overlapsFinder) drawAlignment(matrix, column, row);
    }
  }
  for (let index = 0; index < size; index += 1) {
    if (!matrix.fn[index][6]) setFunction(matrix, 6, index, index % 2 === 0);
    if (!matrix.fn[6][index]) setFunction(matrix, index, 6, index % 2 === 0);
  }
  setFunction(matrix, 8, size - 8, true);
  for (let index = 0; index < 9; index += 1) {
    setFunction(matrix, 8, index, matrix.dark[index][8]);
    setFunction(matrix, index, 8, matrix.dark[8][index]);
  }
  for (let index = 0; index < 8; index += 1) {
    setFunction(matrix, size - 1 - index, 8, matrix.dark[8][size - 1 - index]);
    setFunction(matrix, 8, size - 1 - index, matrix.dark[size - 1 - index][8]);
  }
}

function placeData(matrix, bytes) {
  const size = matrix.dark.length;
  const bits = [];
  for (const byte of bytes) pushBits(bits, byte, 8);
  const remainder = versionRemainderBits(size);
  for (let index = 0; index < remainder; index += 1) bits.push(0);
  let cursor = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (matrix.fn[y][x]) continue;
        matrix.dark[y][x] = cursor < bits.length ? Boolean(bits[cursor]) : false;
        cursor += 1;
      }
    }
  }
}

function versionRemainderBits(size) {
  const version = (size - 17) / 4;
  if (version === 1) return 0;
  return 7;
}

function formatBits(level, mask) {
  const data = (ECC_LEVELS[level] << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  return (((data << 10) | (remainder & 0x3ff)) ^ 0x5412) & 0x7fff;
}

function drawFormat(matrix, level, mask) {
  const bits = formatBits(level, mask);
  const size = matrix.dark.length;
  const bit = (index) => ((bits >>> index) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) setFunction(matrix, 8, index, bit(index));
  setFunction(matrix, 8, 7, bit(6));
  setFunction(matrix, 8, 8, bit(7));
  setFunction(matrix, 7, 8, bit(8));
  for (let index = 9; index < 15; index += 1) setFunction(matrix, 14 - index, 8, bit(index));
  for (let index = 0; index < 8; index += 1) setFunction(matrix, size - 1 - index, 8, bit(index));
  for (let index = 8; index < 15; index += 1) setFunction(matrix, 8, size - 15 + index, bit(index));
  setFunction(matrix, 8, size - 8, true);
}

function maskMatches(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(matrix, mask) {
  const size = matrix.dark.length;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!matrix.fn[y][x] && maskMatches(mask, x, y)) matrix.dark[y][x] = !matrix.dark[y][x];
    }
  }
}

function penalty(matrix) {
  const size = matrix.dark.length;
  let score = 0;
  const runPenalty = (cells) => {
    let run = 1;
    for (let index = 1; index < cells.length; index += 1) {
      if (cells[index] === cells[index - 1]) {
        run += 1;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  };
  for (let y = 0; y < size; y += 1) runPenalty(matrix.dark[y]);
  for (let x = 0; x < size; x += 1) runPenalty(matrix.dark.map((row) => row[x]));
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = matrix.dark[y][x];
      if (color === matrix.dark[y][x + 1] && color === matrix.dark[y + 1][x] && color === matrix.dark[y + 1][x + 1]) score += 3;
    }
  }
  const finder = [true, false, true, true, true, false, true];
  const hasFinder = (cells, index) => finder.every((value, offset) => cells[index + offset] === value);
  const finderPenalty = (cells) => {
    for (let index = 0; index <= cells.length - 7; index += 1) {
      if (!hasFinder(cells, index)) continue;
      const leftQuiet = index >= 4 && cells.slice(index - 4, index).every((value) => !value);
      const rightQuiet = index + 11 <= cells.length && cells.slice(index + 7, index + 11).every((value) => !value);
      if (leftQuiet || rightQuiet) score += 40;
    }
  };
  for (let y = 0; y < size; y += 1) finderPenalty(matrix.dark[y]);
  for (let x = 0; x < size; x += 1) finderPenalty(matrix.dark.map((row) => row[x]));
  const darkCount = matrix.dark.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const percent = Math.abs(darkCount * 100 / (size * size) - 50);
  score += Math.floor(percent / 5) * 10;
  return score;
}

function cloneMatrix(matrix) {
  return {
    dark: matrix.dark.map((row) => row.slice()),
    fn: matrix.fn.map((row) => row.slice()),
  };
}

export function buildRawMaterialQrMatrix(value, options = {}) {
  initGalois();
  const text = String(value ?? "").trim();
  if (!text) return null;
  const level = options.level || "M";
  if (!ECC_LEVELS[level] && ECC_LEVELS[level] !== 0) return null;
  let chosen = null;
  for (let version = 1; version <= 6; version += 1) {
    const bits = encodePayload(text, version, level);
    if (!bits) continue;
    chosen = { version, bits };
    break;
  }
  if (!chosen) return null;
  const bytes = interleave(chosen.version, level, bitsToBytes(chosen.bits));
  const size = 17 + chosen.version * 4;
  const base = createMatrix(size);
  drawFunctionPatterns(base, chosen.version);
  placeData(base, bytes);
  let best = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneMatrix(base);
    applyMask(candidate, mask);
    drawFormat(candidate, level, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
      bestMask = mask;
    }
  }
  return {
    level,
    mask: bestMask,
    modules: best.dark,
    size,
    version: chosen.version,
  };
}
