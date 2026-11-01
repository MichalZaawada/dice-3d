import { D20_NET_V1, D20_VALUES, type D20Value, type FaceUV } from 'dice-3d';

/** Artwork painted on the d20-net-v1 template (a canvas is a valid skin source). */
export function createTemplateArtwork(width = 2048): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width / D20_NET_V1.aspectRatio;
  const context = canvas.getContext('2d')!;
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
  // A star near vertex A of every face shows that the artwork follows the face orientation.
  for (const value of D20_VALUES) {
    const [a, b, c] = D20_NET_V1.faces[value];
    const x = (a[0] * 0.72 + ((b[0] + c[0]) / 2) * 0.28) * canvas.width;
    const y = (a[1] * 0.72 + ((b[1] + c[1]) / 2) * 0.28) * canvas.height;
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.arc(x, y, canvas.width / 180, 0, Math.PI * 2);
    context.fill();
  }
  return canvas;
}

/**
 * A custom layout: twenty upright triangles in a 5 × 4 grid, each with its own
 * color and number drawn by the application (`numbers: 'in-texture'`).
 */
export function createCustomAtlas(): { source: HTMLCanvasElement; layout: Record<D20Value, FaceUV> } {
  const cell = 256;
  const source = document.createElement('canvas');
  source.width = cell * 5;
  source.height = cell * 4;
  const context = source.getContext('2d')!;
  const layout = {} as Record<D20Value, FaceUV>;
  context.fillStyle = '#222';
  context.fillRect(0, 0, source.width, source.height);
  for (const value of D20_VALUES) {
    const column = (value - 1) % 5;
    const row = Math.floor((value - 1) / 5);
    const x = column * cell;
    const y = row * cell;
    context.fillStyle = `hsl(${value * 18} 60% 42%)`;
    context.fillRect(x, y, cell, cell);
    context.fillStyle = '#ffffff';
    context.font = `bold ${cell * 0.28}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(value), x + cell / 2, y + cell * 0.62);
    if (value === 6 || value === 9) context.fillRect(x + cell * 0.38, y + cell * 0.78, cell * 0.24, cell * 0.03);
    // A (top), B (bottom-left), C (bottom-right), counter-clockwise on screen.
    const inset = cell * 0.04;
    layout[value] = [
      [(x + cell / 2) / source.width, (y + inset) / source.height],
      [(x + inset) / source.width, (y + cell - inset) / source.height],
      [(x + cell - inset) / source.width, (y + cell - inset) / source.height],
    ];
  }
  return { source, layout };
}
