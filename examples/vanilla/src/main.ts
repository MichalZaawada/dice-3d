import { createD20, D20_VALUES, isD20Error, type D20, type D20Skin, type D20Theme, type D20Value, type MotionMode } from 'dice-3d';
import templateSvgUrl from 'dice-3d/templates/d20-net-v1.svg?url';
import templateJsonUrl from 'dice-3d/templates/d20-net-v1.json?url';
import { createCustomAtlas, createTemplateArtwork } from './skins';

const $ = <T extends HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
};

const host = $<HTMLDivElement>('#dice');
const output = $<HTMLOutputElement>('#result');
const errorBox = $<HTMLParagraphElement>('#error');
const valueSelect = $<HTMLSelectElement>('#value');
const controls = $<HTMLFormElement>('#controls');
$<HTMLAnchorElement>('#template-svg').href = templateSvgUrl;
$<HTMLAnchorElement>('#template-json').href = templateJsonUrl;

const themes: Record<string, Partial<D20Theme>> = {
  ivory: { bodyColor: '#f2ede4', edgeColor: '#4a443c', numberColor: '#1d1b18' },
  obsidian: { bodyColor: '#2b2f3a', edgeColor: '#a7adbb', numberColor: '#f3f0e8' },
  jade: { bodyColor: '#2f7d62', edgeColor: '#16392c', numberColor: '#f5f1e6' },
};

for (const value of D20_VALUES) valueSelect.add(new Option(String(value), String(value), value === 20, value === 20));

// Browsers can restore form values independently of the newly created die.
controls.reset();
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) controls.reset();
});

function showError(error: unknown): void {
  errorBox.hidden = false;
  errorBox.textContent = isD20Error(error) ? `${error.code}: ${error.message}` : String(error);
}

let die: D20 | undefined;
try {
  die = createD20(host, { value: 20, motion: 'system', theme: themes.jade });
} catch (error) {
  // Without WebGL2 the text result keeps working.
  showError(error);
}

/** The application decides the result; the library only animates it. */
function randomValue(): D20Value {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return ((random[0]! % 20) + 1) as D20Value;
}

const history: number[] = [];
function recordRoll(value: D20Value): void {
  history.unshift(value);
  history.splice(8);
  $('#history').replaceChildren(...history.map((number) => {
    const item = document.createElement('li');
    item.textContent = String(number);
    return item;
  }));
}

async function roll(value: D20Value): Promise<void> {
  output.textContent = '…';
  try {
    const result = await die?.rollTo(value);
    if (!die || result?.status === 'completed') {
      output.textContent = String(value);
      valueSelect.value = String(value);
      recordRoll(value);
    }
  } catch (error) {
    output.textContent = String(die?.getSnapshot().value ?? value);
    showError(error);
  }
}

$('#roll').addEventListener('click', () => { void roll(randomValue()); });
$('#roll-target').addEventListener('click', () => { void roll(Number(valueSelect.value) as D20Value); });
$('#controls').addEventListener('submit', (event) => event.preventDefault());

valueSelect.addEventListener('change', async () => {
  const value = Number(valueSelect.value) as D20Value;
  try {
    const result = await die?.orientTo(value);
    if (!die || result?.status === 'completed') output.textContent = String(value);
  } catch (error) { showError(error); }
});

$('#set-value').addEventListener('click', () => {
  const value = Number(valueSelect.value) as D20Value;
  die?.setValue(value);
  output.textContent = String(value);
});

$<HTMLSelectElement>('#motion').addEventListener('change', (event) => {
  die?.setMotion((event.target as HTMLSelectElement).value as MotionMode);
});

$<HTMLSelectElement>('#theme').addEventListener('change', (event) => {
  die?.setTheme(themes[(event.target as HTMLSelectElement).value] ?? {});
});

let templateArtwork: HTMLCanvasElement | undefined;
let customAtlas: ReturnType<typeof createCustomAtlas> | undefined;
let activeSkin: D20Skin | null = null;
function applySkin(skin: D20Skin | null): void {
  try {
    die?.setSkin(skin);
    activeSkin = skin;
    errorBox.hidden = true;
  } catch (error) {
    // A failed swap keeps the previous appearance.
    showError(error);
  }
}

$<HTMLSelectElement>('#skin').addEventListener('change', (event) => {
  const choice = (event.target as HTMLSelectElement).value;
  if (choice === 'net') {
    templateArtwork ??= createTemplateArtwork();
    applySkin({ source: templateArtwork, layout: 'd20-net-v1', numbers: 'overlay' });
  } else if (choice === 'custom') {
    customAtlas ??= createCustomAtlas();
    applySkin({ ...customAtlas, numbers: 'in-texture' });
  } else {
    applySkin(null);
  }
});

let uploadVersion = 0;
$<HTMLInputElement>('#upload').addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const version = ++uploadVersion;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (version !== uploadVersion) return;
    // Keep a canvas copy so the numbers mode can be changed after upload.
    const source = document.createElement('canvas');
    source.width = bitmap.width;
    source.height = bitmap.height;
    const context = source.getContext('2d');
    if (!context) throw new Error('Unable to decode the texture');
    context.drawImage(bitmap, 0, 0);
    const numbers = $<HTMLSelectElement>('#numbers').value as 'overlay' | 'in-texture';
    applySkin({ source, layout: 'd20-net-v1', numbers });
  } catch (error) { showError(error); }
  finally { bitmap?.close(); }
});

$<HTMLSelectElement>('#numbers').addEventListener('change', (event) => {
  if (activeSkin) applySkin({ ...activeSkin, numbers: (event.target as HTMLSelectElement).value as 'overlay' | 'in-texture' });
});

$<HTMLSelectElement>('#size').addEventListener('change', (event) => {
  host.className = `dice size-${(event.target as HTMLSelectElement).value}`;
});

$<HTMLInputElement>('#dark').addEventListener('change', (event) => {
  document.body.classList.toggle('dark', (event.target as HTMLInputElement).checked);
});

die?.subscribe((snapshot) => {
  host.dataset.state = snapshot.state;
  $('#status').textContent = snapshot.state === 'animating' ? 'In motion' : snapshot.state === 'disposed' ? 'Unavailable' : 'Ready';
});

window.addEventListener('pagehide', () => die?.dispose());
