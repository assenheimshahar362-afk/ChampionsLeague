export type IdenticonShape = "circle" | "diamond" | "pill" | "square";

export type IdenticonTile = {
  column: number;
  row: number;
  shape: IdenticonShape;
  color: string;
};

type IdenticonPalette = {
  background: string;
  foreground: string;
  accent: string;
};

const PALETTES: IdenticonPalette[] = [
  { background: "#071b33", foreground: "#38bdf8", accent: "#818cf8" },
  { background: "#21112d", foreground: "#e879f9", accent: "#a78bfa" },
  { background: "#0d2821", foreground: "#34d399", accent: "#a3e635" },
  { background: "#2d1910", foreground: "#fb923c", accent: "#facc15" },
  { background: "#28151d", foreground: "#fb7185", accent: "#f9a8d4" },
  { background: "#092431", foreground: "#22d3ee", accent: "#2dd4bf" },
  { background: "#171b3b", foreground: "#60a5fa", accent: "#c084fc" },
  { background: "#27210d", foreground: "#facc15", accent: "#4ade80" },
];

const SHAPES: IdenticonShape[] = ["square", "circle", "diamond", "pill"];

export function createIdenticon(seed: string) {
  const random = createRandom(hashSeed(seed));
  const palette = PALETTES[random() % PALETTES.length];
  const tiles: IdenticonTile[] = [];

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const visible = random() % 100 < 68 || (row === 2 && column === 2);
      const shape = SHAPES[random() % SHAPES.length];
      const color = random() % 4 === 0 ? palette.accent : palette.foreground;

      if (!visible) continue;

      tiles.push({ column, row, shape, color });
      if (column !== 2) {
        tiles.push({ column: 4 - column, row, shape, color });
      }
    }
  }

  return { palette, tiles };
}

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRandom(seed: number) {
  let state = seed || 1;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}
