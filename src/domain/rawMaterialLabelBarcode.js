const CODE39_PATTERNS = Object.freeze({
  0: "nnnwwnwnn", 1: "wnnwnnnnw", 2: "nnwwnnnnw", 3: "wnwwnnnnn", 4: "nnnwwnnnw",
  5: "wnnwwnnnn", 6: "nnwwwnnnn", 7: "nnnwnnwnw", 8: "wnnwnnwnn", 9: "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
  F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
  P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
  U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
  Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
});

export function normalizeRawMaterialBarcodeValue(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return "";
  return [...normalized].map((character) => (CODE39_PATTERNS[character] ? character : "-")).join("");
}

export function buildRawMaterialCode39Bars(value, options = {}) {
  const narrow = Math.max(1, Number(options.narrowWidth) || 1);
  const wide = Math.max(narrow * 2, Number(options.wideWidth) || narrow * 3);
  const gap = Math.max(narrow, Number(options.characterGap) || narrow);
  const encoded = `*${normalizeRawMaterialBarcodeValue(value)}*`;
  const bars = [];
  let cursor = 0;

  [...encoded].forEach((character, characterIndex) => {
    const pattern = CODE39_PATTERNS[character];
    [...pattern].forEach((widthCode, elementIndex) => {
      const width = widthCode === "w" ? wide : narrow;
      if (elementIndex % 2 === 0) bars.push({ x: cursor, width });
      cursor += width;
    });
    if (characterIndex < encoded.length - 1) cursor += gap;
  });

  return { bars, encodedValue: encoded, normalizedValue: encoded.slice(1, -1), width: cursor };
}
