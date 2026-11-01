import { dot, subtract, type Vec3 } from '../animation/vector.js';
import { GLYPH_STROKE_WIDTH, labelPolylines } from '../renderer/glyphs.js';
import { fittingScale } from '../renderer/numberAtlas.js';
import type { DieTemplate, DieTemplateLabel, UV } from '../types.js';
import { D20_DEFINITION } from './d20.js';
import { D20_NET_V1, d20NetV1PixelFaces } from './d20NetV1.js';
import type { DieModel } from './dice.js';
import type { ModelFace } from './model.js';

type TemplateLabel = DieTemplateLabel;

const REFERENCE_WIDTH = 2048;
/** Free space around each face inside its cell, relative to the face size. */
const CELL_MARGIN = 0.08;

const round = (value: number) => Math.round(value * 1e6) / 1e6;

function local(face: ModelFace, point: Vec3): readonly [number, number] {
  const offset = subtract(point, face.centroid);
  return [dot(offset, face.right), dot(offset, face.up)];
}

function labelsOf(model: DieModel, face: ModelFace, toPixel: (point: readonly [number, number]) => readonly [number, number], pxPerUnit: number, glyphScale: number, width: number, height: number): TemplateLabel[] {
  return face.labels.map((label) => {
    const center = local(face, label.center);
    const [x, y] = toPixel(center);
    const [tx, ty] = toPixel([center[0] + dot(label.up, face.right), center[1] + dot(label.up, face.up)]);
    const marker = model.atlasLabels.find((entry) => entry.key === label.key)?.marker ?? false;
    return {
      label: label.key,
      center: [round(x / width), round(y / height)] as UV,
      rotation: round((Math.atan2(tx - x, y - ty) * 180) / Math.PI),
      size: round(label.size * pxPerUnit),
      glyphScale: round(glyphScale),
      marker,
      ...('symbol' in label.content ? { symbol: label.content.symbol } : {}),
    };
  });
}

/** The D20 template: the `d20-net-v1` unfolding with value-ordered faces. */
function d20Template(model: DieModel, glyphScale: number): DieTemplate {
  const pixels = d20NetV1PixelFaces();
  const modelEdge = 4 / Math.sqrt(10 + 2 * Math.sqrt(5));
  const pxPerUnit = D20_NET_V1.triangleSide / modelEdge;
  const faces = model.faces.map((face, index) => {
    const value = D20_DEFINITION.faces[index]!.value;
    const [a, b, c] = pixels[value];
    const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3] as const;
    // Face-local (right, up) to image pixels: up points from the centroid to A.
    const upLength = Math.hypot(a[0] - centroid[0], a[1] - centroid[1]);
    const ux = (a[0] - centroid[0]) / upLength;
    const uy = (a[1] - centroid[1]) / upLength;
    const toPixel = ([x, y]: readonly [number, number]) =>
      [centroid[0] + (y * ux - x * uy) * pxPerUnit, centroid[1] + (y * uy + x * ux) * pxPerUnit] as const;
    return {
      index,
      value: face.value as number,
      label: face.text,
      uv: D20_NET_V1.faces[value],
      labels: labelsOf(model, face, toPixel, pxPerUnit, glyphScale, D20_NET_V1.width, D20_NET_V1.height),
    };
  });
  return Object.freeze({
    id: D20_NET_V1.id,
    version: D20_NET_V1.version,
    width: D20_NET_V1.width,
    height: D20_NET_V1.height,
    aspectRatio: D20_NET_V1.aspectRatio,
    aspectTolerance: D20_NET_V1.aspectTolerance,
    faces: Object.freeze(faces),
  });
}

/**
 * Grid template: every face upright (label up = image up) and centered in
 * its own cell, in face index order, row by row.
 */
export function buildTemplate(model: DieModel): DieTemplate {
  const glyphScale = fittingScale(model.atlasLabels);
  if (model.templateId === D20_NET_V1.id) return d20Template(model, glyphScale);
  const flat = model.faces.map((face) => face.corners.map((corner) => local(face, corner)));
  const boxes = flat.map((points) => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  });
  const cellWidth = Math.max(...boxes.map((box) => box.maxX - box.minX)) * (1 + 2 * CELL_MARGIN);
  const cellHeight = Math.max(...boxes.map((box) => box.maxY - box.minY)) * (1 + 2 * CELL_MARGIN);
  const count = model.faces.length;
  const columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt((count * cellHeight) / cellWidth))));
  const rows = Math.ceil(count / columns);
  const pxPerUnit = REFERENCE_WIDTH / (columns * cellWidth);
  const width = REFERENCE_WIDTH;
  const height = Math.round(rows * cellHeight * pxPerUnit);

  const faces = model.faces.map((face, index) => {
    const box = boxes[index]!;
    const cx = ((index % columns) + 0.5) * cellWidth * pxPerUnit;
    const cy = (Math.floor(index / columns) + 0.5) * cellHeight * pxPerUnit;
    const bx = (box.minX + box.maxX) / 2;
    const by = (box.minY + box.maxY) / 2;
    const toPixel = ([x, y]: readonly [number, number]) => [cx + (x - bx) * pxPerUnit, cy - (y - by) * pxPerUnit] as const;
    return Object.freeze({
      index,
      value: face.value as DieTemplate['faces'][number]['value'],
      label: face.text,
      uv: Object.freeze(flat[index]!.map((point) => {
        const [x, y] = toPixel(point);
        return Object.freeze([round(x / width), round(y / height)]) as UV;
      })),
      labels: Object.freeze(labelsOf(model, face, toPixel, pxPerUnit, glyphScale, width, height)),
    });
  });
  return Object.freeze({
    id: model.templateId,
    version: 1,
    width,
    height,
    aspectRatio: width / height,
    aspectTolerance: 0.01,
    faces: Object.freeze(faces),
  });
}

const svgNumber = (value: number) => String(Math.round(value * 100) / 100);

/**
 * SVG artwork template: an `artwork` layer to paint on, a `numbers` layer
 * with the overlay labels and a `guides` layer (face outlines and a dot at the
 * label's top) to hide before exporting.
 */
export function templateToSvg(template: DieTemplate, title: string): string {
  const { width, height } = template;
  const unit = (label: DieTemplateLabel) => label.size * label.glyphScale;
  const strokeWidth = Math.min(...template.faces.flatMap((face) => face.labels.map((label) => unit(label) * GLYPH_STROKE_WIDTH)));
  const numbers: string[] = [];
  const guides: string[] = [];
  for (const face of template.faces) {
    const points = face.uv.map(([u, v]) => `${svgNumber(u * width)},${svgNumber(v * height)}`).join(' ');
    guides.push(`    <polygon id="guide-face-${face.index}" class="cut" points="${points}"/>`);
    face.labels.forEach((label, labelIndex) => {
      const scale = unit(label);
      const x = label.center[0] * width;
      const y = label.center[1] * height;
      const lines = labelPolylines(label.symbol ?? label.label, label.marker);
      const d = lines.map((line) => `M${line.map(([px, py]) => `${svgNumber(px * scale)} ${svgNumber(py * scale)}`).join(' L')}`).join(' ');
      const transform = `translate(${svgNumber(x)} ${svgNumber(y)}) rotate(${svgNumber(label.rotation)})`;
      numbers.push(`    <path id="number-${face.index}-${labelIndex}" transform="${transform}" d="${d}"/>`);
      guides.push(`    <circle class="label-top" transform="${transform}" cx="0" cy="${svgNumber(-label.size * 0.42)}" r="${svgNumber(Math.max(3, label.size * 0.03))}"/>`);
    });
  }
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${escape(title)} (${template.id})</title>
  <desc>
    Paint on the "artwork" layer and export the whole page as PNG with the same aspect ratio
    (${width} x ${height} recommended). Hide the "guides" layer before exporting. Keep the "numbers"
    layer for numbers: 'in-texture', or hide it for numbers: 'overlay'. Every face is upright in its
    own cell; extend artwork slightly beyond the outlines to avoid seams. The dot marks the top of
    each label. Cell positions and the aspect ratio must not change.
  </desc>
  <g id="artwork" inkscape:groupmode="layer" inkscape:label="artwork">
    <rect id="artwork-background" x="0" y="0" width="${width}" height="${height}" fill="#f2ede4"/>
  </g>
  <g id="numbers" inkscape:groupmode="layer" inkscape:label="numbers" fill="none" stroke="#1d1b18" stroke-width="${svgNumber(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">
${numbers.join('\n')}
  </g>
  <g id="guides" inkscape:groupmode="layer" inkscape:label="guides (hide before export)">
    <style>
      #guides .cut { fill: none; stroke: #e0007a; stroke-width: 2; }
      #guides .label-top { fill: #e0007a; }
    </style>
${guides.join('\n')}
  </g>
</svg>
`;
}
