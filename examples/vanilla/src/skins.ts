import { getDieTemplate, type DieTemplate, type DieType, type FaceUVPolygon } from '@ticonemarsicano/dice-3d';

function canvasFor(template: DieTemplate, width: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width / template.aspectRatio);
  return { canvas, context: canvas.getContext('2d')! };
}

function tracePolygon(context: CanvasRenderingContext2D, uv: FaceUVPolygon, width: number, height: number): void {
  context.beginPath();
  uv.forEach(([u, v], index) => (index === 0 ? context.moveTo(u * width, v * height) : context.lineTo(u * width, v * height)));
  context.closePath();
}

/** Artwork painted on the type's official template (a canvas is a valid skin source). */
export function createTemplateArtwork(type: DieType, width = 2048): HTMLCanvasElement {
  const template = getDieTemplate(type);
  const { canvas, context } = canvasFor(template, width);
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1d4e89');
  gradient.addColorStop(1, '#7b2d74');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  context.lineWidth = canvas.width / 400;
  for (let x = -canvas.height; x < canvas.width; x += canvas.width / 60) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + canvas.height, canvas.height);
    context.stroke();
  }
  // A dot above every label shows that the artwork follows the face orientation.
  context.fillStyle = '#ffd166';
  for (const face of template.faces) {
    for (const label of face.labels) {
      const angle = (label.rotation * Math.PI) / 180;
      const distance = (label.size * 0.42 * canvas.width) / template.width;
      const x = label.center[0] * canvas.width + Math.sin(angle) * distance;
      const y = label.center[1] * canvas.height - Math.cos(angle) * distance;
      context.beginPath();
      context.arc(x, y, Math.max(2, (label.size * 0.05 * canvas.width) / template.width), 0, Math.PI * 2);
      context.fill();
    }
  }
  return canvas;
}

/**
 * An explicit UV layout (one polygon per face, `numbers: 'in-texture'`):
 * every face gets its own color and the application draws the labels.
 */
export function createCustomAtlas(type: DieType, width = 1536): { source: HTMLCanvasElement; layout: FaceUVPolygon[] } {
  const template = getDieTemplate(type);
  const { canvas, context } = canvasFor(template, width);
  context.fillStyle = '#222';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const count = template.faces.length;
  for (const face of template.faces) {
    context.fillStyle = `hsl(${Math.round((face.index * 360) / count)} 60% 42%)`;
    tracePolygon(context, face.uv, canvas.width, canvas.height);
    context.fill();
    // Bleed: stroke the outline in the same color to avoid seams.
    context.strokeStyle = context.fillStyle;
    context.lineWidth = 6;
    context.stroke();
    for (const label of face.labels) {
      const size = (label.size * canvas.width) / template.width;
      context.save();
      context.translate(label.center[0] * canvas.width, label.center[1] * canvas.height);
      context.rotate((label.rotation * Math.PI) / 180);
      context.fillStyle = '#ffffff';
      context.font = `bold ${size * label.glyphScale * 1.25}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(label.label, 0, size * 0.03);
      if (label.marker) context.fillRect(-size * 0.14, size * label.glyphScale * 0.66, size * 0.28, size * 0.035);
      context.restore();
    }
  }
  return { source: canvas, layout: template.faces.map((face) => face.uv) };
}
