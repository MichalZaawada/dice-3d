// Visual review sheet: all faces, 6/9 markers, 96/160/320 CSS px, light and dark backgrounds, skins.
// Browsers cap the number of live WebGL contexts (about 16 in Chromium), so face sheets are captured
// from a single die per theme: each `setValue` renders synchronously, and drawing the WebGL canvas
// in the same task copies that frame.
import { createD20, createDie, D20_NET_V1, D20_VALUES, DIE_TYPES, getDieInfo, type D20, type D20Value } from '@ticonemarsicano/dice-3d';

function figure(sectionId: string, label: string, className = 'die'): HTMLElement {
  const item = document.createElement('figure');
  const host = document.createElement('div');
  host.className = className;
  const caption = document.createElement('figcaption');
  caption.textContent = label;
  item.append(host, caption);
  document.getElementById(sectionId)!.append(item);
  return host;
}

/** Copies the die's current frame into a new figure. */
function capture(sectionId: string, label: string, die: D20, host: HTMLElement, className: string): void {
  const source = host.querySelector('canvas')!;
  const target = document.createElement('canvas');
  target.width = source.width;
  target.height = source.height;
  target.className = className;
  target.getContext('2d')!.drawImage(source, 0, 0);
  const item = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = `${label} (${die.getSnapshot().value})`;
  item.append(target, caption);
  document.getElementById(sectionId)!.append(item);
}

const darkTheme = { bodyColor: '#2b2f3a', edgeColor: '#a7adbb', numberColor: '#f3f0e8' };

function artworkNet(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#3a6ea5');
  gradient.addColorStop(1, '#8e3b8a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(255,255,255,0.35)';
  context.lineWidth = 3;
  for (let x = -canvas.height; x < canvas.width; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + canvas.height, canvas.height);
    context.stroke();
  }
  // Mark vertex A of every face so orientation is visible.
  for (const value of D20_VALUES) {
    const [a, b, c] = D20_NET_V1.faces[value];
    const x = a[0] * 0.75 + ((b[0] + c[0]) / 2) * 0.25;
    const y = a[1] * 0.75 + ((b[1] + c[1]) / 2) * 0.25;
    context.fillStyle = '#ffd400';
    context.beginPath();
    context.arc(x * canvas.width, y * canvas.height, 9, 0, Math.PI * 2);
    context.fill();
  }
  return canvas;
}

const staging = document.getElementById('staging')!;
function stagedDie(options: Parameters<typeof createD20>[1]): { die: D20; host: HTMLElement } {
  const host = document.createElement('div');
  host.className = 's160';
  staging.append(host);
  return { die: createD20(host, options), host };
}

const light = stagedDie({ motion: 'none' });
const dark = stagedDie({ motion: 'none', theme: darkTheme });
const skinned = stagedDie({ motion: 'none', theme: { numberColor: '#ffffff' }, skin: { source: artworkNet(), layout: 'd20-net-v1' } });

for (const value of D20_VALUES) {
  for (const [section, { die, host }] of [['faces-light', light], ['faces-dark', dark], ['skins', skinned]] as const) {
    die.setValue(value);
    capture(section, section.replace('faces-', ''), die, host, 'capture');
  }
}
for (const staged of [light, dark, skinned]) staged.die.dispose();

// Every die type at its lowest, middle and highest result, one live context at a time.
// WebKit counts disposed contexts until they are collected, so yield between types.
for (const type of DIE_TYPES) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const host = document.createElement('div');
  host.className = 's160';
  staging.append(host);
  const die = createDie(host, { type, motion: 'none' });
  const values = getDieInfo(type).values;
  for (const value of [values[0]!, values[Math.floor(values.length / 2)]!, values[values.length - 1]!]) {
    die.setValue(value);
    const source = host.querySelector('canvas')!;
    const target = document.createElement('canvas');
    target.width = source.width;
    target.height = source.height;
    target.className = 'capture-type';
    target.getContext('2d')!.drawImage(source, 0, 0);
    const item = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = `${die.info.name} ${die.info.format(value)}`;
    item.append(target, caption);
    document.getElementById('types')!.append(item);
  }
  die.dispose();
  host.remove();
}
staging.remove();

for (const [size, value] of [['die', 6], ['s160', 9], ['s320', 20]] as const) {
  createD20(figure('sizes-light', `${value} @ ${size}`, size), { value: value as D20Value, motion: 'none' });
  createD20(figure('sizes-dark', `${value} @ ${size}`, size), { value: value as D20Value, motion: 'none', theme: darkTheme });
}
(window as unknown as { reviewReady: boolean }).reviewReady = true;
