import {
  createDie,
  createDieTemplateSvg,
  DIE_TYPES,
  getDieInfo,
  getDieTemplate,
  isD20Error,
  type D20Theme,
  type Die,
  type DieInfo,
  type DieOptions,
  type DieSkin,
  type DieType,
  type DieValue,
  type MotionMode,
} from 'dice-3d';
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
const detail = $<HTMLSpanElement>('#result-detail');
const errorBox = $<HTMLParagraphElement>('#error');
const typeSelect = $<HTMLSelectElement>('#die-type');
const valueSelect = $<HTMLSelectElement>('#value');
const skinSelect = $<HTMLSelectElement>('#skin');
const numbersSelect = $<HTMLSelectElement>('#numbers');
const motionSelect = $<HTMLSelectElement>('#motion');
const themeSelect = $<HTMLSelectElement>('#theme');
const uploadInput = $<HTMLInputElement>('#upload');
const templateSvg = $<HTMLAnchorElement>('#template-svg');
const templateJson = $<HTMLAnchorElement>('#template-json');
const percentileNote = $<HTMLParagraphElement>('#percentile-note');
const controls = $<HTMLFormElement>('#controls');

const themes: Record<string, Partial<D20Theme>> = {
  ivory: { bodyColor: '#f2ede4', edgeColor: '#4a443c', numberColor: '#1d1b18' },
  obsidian: { bodyColor: '#2b2f3a', edgeColor: '#a7adbb', numberColor: '#f3f0e8' },
  jade: { bodyColor: '#2f7d62', edgeColor: '#16392c', numberColor: '#f5f1e6' },
};

const DEFAULT_TYPE: DieType = 'd20';
for (const type of DIE_TYPES) {
  const info = getDieInfo(type);
  typeSelect.add(new Option(info.name, type, type === DEFAULT_TYPE, type === DEFAULT_TYPE));
}

// Browsers can restore form values independently of the newly created die.
controls.reset();
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) controls.reset();
});

function showError(error: unknown): void {
  errorBox.hidden = false;
  errorBox.textContent = isD20Error(error) ? `${error.code}: ${error.message}` : String(error);
}

let info: DieInfo = getDieInfo(DEFAULT_TYPE);
let die: Die | undefined;
/** Incremented whenever the die is replaced; async work started for an older die is ignored. */
let generation = 0;

/** Readable result plus, for the percentile dice, what the dice show. */
function describe(value: DieValue): { text: string; detail: string } {
  const text = info.format(value);
  if (info.type === 'd100') {
    const [tens, units] = info.labelsFor(value);
    return { text, detail: `Tens die ${tens} + units die ${units}${value === 100 ? ' (00 + 0 = 100)' : ''}` };
  }
  if (info.type === 'df') return { text, detail: value === 1 ? 'Plus face' : value === -1 ? 'Minus face' : 'Blank face' };
  if (info.type === 'd4') return { text, detail: 'Read at the top corner' };
  return { text, detail: '' };
}

function showResult(value: DieValue | null): void {
  if (value === null) {
    output.textContent = '…';
    return;
  }
  const { text, detail: extra } = describe(value);
  output.textContent = text;
  detail.textContent = extra;
  detail.hidden = extra === '';
}

/** The application decides the result; the library only animates it. Uniform over the documented results. */
function randomValue(): DieValue {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  // DF: uniform over the six physical faces equals uniform over −1, 0 and +1 (two faces each).
  return info.values[random[0]! % info.values.length]!;
}

const history: string[] = [];
function renderHistory(): void {
  const list = $('#history');
  if (history.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Your story starts with a roll.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...history.map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

function recordRoll(value: DieValue): void {
  history.unshift(info.format(value));
  history.splice(8);
  renderHistory();
}

const valueOf = (key: string): DieValue => info.values.find((value) => String(value) === key) ?? info.defaultValue;

function populateValues(): void {
  valueSelect.replaceChildren(...info.values.map((value) => {
    const { text, detail: extra } = describe(value);
    const label = info.type === 'd100' ? `${text} (${info.labelsFor(value).join(' + ')})` : extra && info.type === 'df' ? `${text} · ${extra}` : text;
    return new Option(label, String(value), value === info.defaultValue, value === info.defaultValue);
  }));
}

let blobUrls: string[] = [];
function updateTemplateLinks(type: DieType): void {
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = [];
  if (type === 'd20') {
    templateSvg.href = templateSvgUrl;
    templateJson.href = templateJsonUrl;
    templateSvg.download = 'd20-net-v1.svg';
    templateJson.download = 'd20-net-v1.json';
    return;
  }
  const template = getDieTemplate(type);
  const svg = URL.createObjectURL(new Blob([createDieTemplateSvg(type)], { type: 'image/svg+xml' }));
  const json = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' }));
  blobUrls = [svg, json];
  templateSvg.href = svg;
  templateJson.href = json;
  templateSvg.download = `${template.id}.svg`;
  templateJson.download = `${template.id}.json`;
}

let activeSkin: DieSkin | null = null;
function applySkin(skin: DieSkin | null): void {
  try {
    die?.setSkin(skin);
    activeSkin = skin;
    errorBox.hidden = true;
  } catch (error) {
    // A failed swap keeps the previous appearance.
    showError(error);
  }
}

/** The selected built-in skin for the current type (procedural skins are generated per type, so they always fit). */
function selectedSkin(): DieSkin | null {
  const type = info.type as DieType;
  if (skinSelect.value === 'net') return { source: createTemplateArtwork(type), layout: info.templateId, numbers: 'overlay' };
  if (skinSelect.value === 'custom') return { ...createCustomAtlas(type), numbers: 'in-texture' };
  return null;
}

function updateStatus(state: string): void {
  host.dataset.state = state;
  $('#status').textContent = state === 'animating' ? 'In motion' : state === 'disposed' ? 'Unavailable' : 'Ready';
}

/** Disposes the current die (cancelling its animation) and creates exactly one die of `type`. */
function switchType(type: DieType): void {
  generation++;
  die?.dispose();
  die = undefined;
  host.replaceChildren();
  info = getDieInfo(type);
  host.dataset.type = type;
  $('#die-name').textContent = info.name;
  $('#die-shape').textContent = `${info.shape} · ${info.faces.length} faces${info.reading === 'vertex' ? ' · read at the top corner' : ''}`;
  percentileNote.hidden = type !== 'd100' && type !== 'd10-tens';
  percentileNote.textContent =
    type === 'd100'
      ? 'Percentile pair: the tens die shows 00–90, the units die 0–9. Add them; 00 + 0 means 100.'
      : 'Percentile tens die: 00, 10, …, 90. Pair it with a units die (0–9); 00 + 0 means 100.';
  populateValues();
  history.length = 0;
  renderHistory();
  showResult(info.defaultValue);
  // An uploaded image was painted for the previous template: drop it.
  uploadInput.value = '';
  uploadVersion++;
  updateTemplateLinks(type);
  errorBox.hidden = true;
  try {
    const skin = selectedSkin();
    const options: DieOptions = {
      type,
      value: info.defaultValue,
      motion: motionSelect.value as MotionMode,
      theme: themes[themeSelect.value] ?? {},
      ...(skin ? { skin } : {}),
    };
    die = createDie(host, options);
    activeSkin = skin;
  } catch (error) {
    // Without WebGL2 the text result keeps working.
    activeSkin = null;
    showError(error);
    updateStatus('disposed');
    return;
  }
  updateStatus('idle');
  die.subscribe((snapshot) => updateStatus(snapshot.state));
}

async function roll(value: DieValue): Promise<void> {
  const current = generation;
  showResult(null);
  try {
    const result = await die?.rollTo(value);
    if (current !== generation) return;
    if (!die || result?.status === 'completed') {
      showResult(value);
      valueSelect.value = String(value);
      recordRoll(value);
    }
  } catch (error) {
    if (current !== generation) return;
    showResult(die?.getSnapshot().value ?? value);
    showError(error);
  }
}

$('#roll').addEventListener('click', () => { void roll(randomValue()); });
$('#roll-target').addEventListener('click', () => { void roll(valueOf(valueSelect.value)); });
controls.addEventListener('submit', (event) => event.preventDefault());

typeSelect.addEventListener('change', () => switchType(typeSelect.value as DieType));

valueSelect.addEventListener('change', async () => {
  const current = generation;
  const value = valueOf(valueSelect.value);
  try {
    const result = await die?.orientTo(value);
    if (current === generation && (!die || result?.status === 'completed')) showResult(value);
  } catch (error) { if (current === generation) showError(error); }
});

$('#set-value').addEventListener('click', () => {
  const value = valueOf(valueSelect.value);
  try {
    die?.setValue(value);
    showResult(value);
  } catch (error) { showError(error); }
});

motionSelect.addEventListener('change', () => die?.setMotion(motionSelect.value as MotionMode));
themeSelect.addEventListener('change', () => die?.setTheme(themes[themeSelect.value] ?? {}));
skinSelect.addEventListener('change', () => applySkin(selectedSkin()));

let uploadVersion = 0;
uploadInput.addEventListener('change', async () => {
  const file = uploadInput.files?.[0];
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
    applySkin({ source, layout: info.templateId, numbers: numbersSelect.value as 'overlay' | 'in-texture' });
  } catch (error) { if (version === uploadVersion) showError(error); }
  finally { bitmap?.close(); }
});

numbersSelect.addEventListener('change', () => {
  if (activeSkin) applySkin({ ...activeSkin, numbers: numbersSelect.value as 'overlay' | 'in-texture' });
});

$<HTMLSelectElement>('#size').addEventListener('change', (event) => {
  host.className = `dice size-${(event.target as HTMLSelectElement).value}`;
});

$<HTMLInputElement>('#dark').addEventListener('change', (event) => {
  document.body.classList.toggle('dark', (event.target as HTMLInputElement).checked);
});

switchType(typeSelect.value as DieType);
window.addEventListener('pagehide', () => die?.dispose());
