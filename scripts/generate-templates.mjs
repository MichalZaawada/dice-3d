// Generates packages/core/templates/d20-net-v1.{json,svg} and <type>-grid-v1.{json,svg} for every other
// built-in die from the library's own tables.
// Run with `npm run templates`; a unit test fails when the files drift from the source.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCoreModule } from './load-source.mjs';

const { D20_NET_V1, d20NetV1PixelFaces } = await loadCoreModule('geometry/d20NetV1.ts');
const { labelPolylines, GLYPH_STROKE_WIDTH } = await loadCoreModule('renderer/glyphs.ts');
const { ATLAS_GLYPH_SCALE } = await loadCoreModule('renderer/numberAtlas.ts');
const { DEFAULT_LABEL_SIZE } = await loadCoreModule('renderer/dieMesh.ts');

const outDir = fileURLToPath(new URL('../packages/core/templates/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const BLEED_PX = 24;
const values = Array.from({ length: 20 }, (_, index) => index + 1);
const pixels = d20NetV1PixelFaces();
const round = (n) => Math.round(n * 100) / 100;

const json = {
  template: D20_NET_V1.id,
  version: D20_NET_V1.version,
  description:
    'UV layout of the official dice-3d D20 net. Coordinates are normalized; (0, 0) is the top-left corner of the image.',
  width: D20_NET_V1.width,
  height: D20_NET_V1.height,
  aspectRatio: D20_NET_V1.aspectRatio,
  uvOrigin: 'top-left',
  vertexOrder: ['A', 'B', 'C'],
  vertexConvention:
    'Seen from outside with the face turned to the viewer: A is the top vertex, B the bottom-left and C the bottom-right one.',
  triangleSide: D20_NET_V1.triangleSide,
  recommendedBleedPx: BLEED_PX,
  faces: Object.fromEntries(values.map((value) => [String(value), D20_NET_V1.faces[value]])),
};
writeFileSync(`${outDir}d20-net-v1.json`, `${JSON.stringify(json, null, 2)}\n`);

// Pixels per model unit: the die has edge length 4 / sqrt(10 + 2 sqrt(5)) for circumradius 1.
const modelEdge = 4 / Math.sqrt(10 + 2 * Math.sqrt(5));
const pxPerModelUnit = D20_NET_V1.triangleSide / modelEdge;
const glyphUnitPx = DEFAULT_LABEL_SIZE * ATLAS_GLYPH_SCALE * pxPerModelUnit;

function faceGeometry(value) {
  const [a, b, c] = pixels[value];
  const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  // Image-space angle of the label's up direction (towards A); y grows downwards.
  const up = [a[0] - centroid[0], a[1] - centroid[1]];
  const rotation = (Math.atan2(up[0], -up[1]) * 180) / Math.PI;
  return { a, b, c, centroid, rotation };
}

const points = (list) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');

const pointKey = ([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`;
const edgeKey = (p, q) => [pointKey(p), pointKey(q)].sort().join('|');
const edgeUse = new Map();
for (const value of values) {
  const [a, b, c] = pixels[value];
  for (const [p, q] of [[a, b], [b, c], [c, a]]) edgeUse.set(edgeKey(p, q), (edgeUse.get(edgeKey(p, q)) ?? 0) + 1);
}

/** Bleed line: an outer net edge moved outwards by `distance` (and lengthened to meet its neighbors). */
function bleedLine(p, q, centroid, distance) {
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const direction = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
  let normal = [-direction[1], direction[0]];
  if (normal[0] * (p[0] - centroid[0]) + normal[1] * (p[1] - centroid[1]) < 0) normal = [-normal[0], -normal[1]];
  const extend = distance / Math.tan(Math.PI / 3);
  const start = [p[0] + normal[0] * distance - direction[0] * extend, p[1] + normal[1] * distance - direction[1] * extend];
  const end = [q[0] + normal[0] * distance + direction[0] * extend, q[1] + normal[1] * distance + direction[1] * extend];
  return `      <line class="bleed" x1="${round(start[0])}" y1="${round(start[1])}" x2="${round(end[0])}" y2="${round(end[1])}"/>`;
}

const numberPaths = values
  .map((value) => {
    const { centroid, rotation } = faceGeometry(value);
    const d = labelPolylines(value)
      .map((line) => `M${line.map(([x, y]) => `${round(x * glyphUnitPx)} ${round(y * glyphUnitPx)}`).join(' L')}`)
      .join(' ');
    return `    <path id="number-${value}" transform="translate(${round(centroid[0])} ${round(centroid[1])}) rotate(${round(rotation)})" d="${d}"/>`;
  })
  .join('\n');

const guideFaces = values
  .map((value) => {
    const { a, b, c, centroid } = faceGeometry(value);
    const bleed = [[a, b], [b, c], [c, a]]
      .filter(([p, q]) => edgeUse.get(edgeKey(p, q)) === 1)
      .map(([p, q]) => bleedLine(p, q, centroid, BLEED_PX));
    return [
      `    <g id="guide-face-${value}">`,
      ...bleed,
      `      <polygon class="cut" points="${points([a, b, c])}"/>`,
      `      <circle class="vertex-a" cx="${round(a[0] + (((b[0] + c[0]) / 2 - a[0]) * 0.12))}" cy="${round(a[1] + (((b[1] + c[1]) / 2 - a[1]) * 0.12))}" r="7"/>`,
      `    </g>`,
    ].join('\n');
  })
  .join('\n');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${D20_NET_V1.width}" height="${D20_NET_V1.height}" viewBox="0 0 ${D20_NET_V1.width} ${D20_NET_V1.height}">
  <title>dice-3d D20 net template (d20-net-v1)</title>
  <desc>
    Paint on the "artwork" layer and export the whole page as PNG at any resolution with a ${D20_NET_V1.aspectRatio}:1 aspect ratio
    (2048 x 1024 recommended). Hide the "guides" layer before exporting. Keep the "numbers" layer for
    numbers: 'in-texture', or hide it for numbers: 'overlay'. Solid lines are face edges; extend artwork to the
    dashed bleed lines (${BLEED_PX}px at 2048 x 1024) to avoid seams. The dot marks vertex A: the face is upright
    when A points up. Triangle positions and the aspect ratio must not change.
  </desc>
  <g id="artwork" inkscape:groupmode="layer" inkscape:label="artwork">
    <rect id="artwork-background" x="0" y="0" width="${D20_NET_V1.width}" height="${D20_NET_V1.height}" fill="#f2ede4"/>
  </g>
  <g id="numbers" inkscape:groupmode="layer" inkscape:label="numbers" fill="none" stroke="#1d1b18" stroke-width="${round(GLYPH_STROKE_WIDTH * glyphUnitPx)}" stroke-linecap="round" stroke-linejoin="round">
${numberPaths}
  </g>
  <g id="guides" inkscape:groupmode="layer" inkscape:label="guides (hide before export)">
    <style>
      #guides .cut { fill: none; stroke: #e0007a; stroke-width: 2; }
      #guides .bleed { fill: none; stroke: #0090e0; stroke-width: 1.5; stroke-dasharray: 8 6; }
      #guides .vertex-a { fill: #e0007a; }
    </style>
${guideFaces}
  </g>
</svg>
`;
writeFileSync(`${outDir}d20-net-v1.svg`, svg);
console.log(`Wrote ${outDir}d20-net-v1.json and d20-net-v1.svg`);

const { DIE_TYPES, getDieInfo, getDieTemplate, createDieTemplateSvg } = await loadCoreModule('index.ts');
for (const type of DIE_TYPES) {
  if (type === 'd20') continue;
  const info = getDieInfo(type);
  const template = getDieTemplate(type);
  const grid = {
    template: template.id,
    version: template.version,
    die: type,
    description: `UV layout of the dice-3d ${info.name} skin template. Coordinates are normalized; (0, 0) is the top-left corner of the image. Every face is upright in its own cell, in face index order.`,
    width: template.width,
    height: template.height,
    aspectRatio: template.aspectRatio,
    uvOrigin: 'top-left',
    vertexConvention: 'Face polygons are listed counter-clockwise on screen, in the order used by array skin layouts.',
    faces: template.faces.map((face) => ({
      index: face.index,
      value: face.value,
      label: face.label,
      uv: face.uv,
      labels: face.labels.map(({ label, center, rotation, size }) => ({ label, center, rotation, size })),
    })),
  };
  writeFileSync(`${outDir}${template.id}.json`, `${JSON.stringify(grid, null, 2)}\n`);
  writeFileSync(`${outDir}${template.id}.svg`, createDieTemplateSvg(type));
}
console.log(`Wrote ${DIE_TYPES.length - 1} grid templates`);
