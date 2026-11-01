# RPG dice support

Status: **implemented**. Every preset below is available through `createDie` (core) and
`<DieView>` (React), verified by unit tests and by browser tests in Chromium, Firefox and
WebKit (see [testing](testing.md)). `createD20`, the D20 types, numbering, orientations and the
`d20-net-v1` template are unchanged.

## Presets

| Family | Types | Shape | Results and labels |
| --- | --- | --- | --- |
| Standard RPG set | `d4`, `d6`, `d8`, `d10`, `d12`, `d20` | tetrahedron, cube, octahedron, pentagonal trapezohedron, dodecahedron, icosahedron | Integers 1–N, printed as numbers. D4: read at the top corner (below). D10 prints `10`. |
| Percentile | `d100`, `d10-tens` | two pentagonal trapezohedra; one pentagonal trapezohedron | D100: 1–100, drawn as a tens die (`00`–`90`) and a units die (`0`–`9`) side by side in one canvas; `00` + `0` is 100. Tens die alone: 0, 10, …, 90 with 0 printed `00`. `info.labelsFor(37)` → `['30', '7']`. |
| Small dice | `d2`, `d3` | coin; triangular prism ("log") | 1–2 on the coin faces (blank rim); 1–3 on the long faces (blank end caps). |
| Extended numeric | `d5`, `d7`, `d14`, `d16`, `d24`, `d30`, `d48`, `d60`, `d120` | pentagonal and heptagonal prisms; heptagonal and octagonal trapezohedra; tetrakis hexahedron; rhombic triacontahedron; disdyakis dodecahedron; pentakis dodecahedron; disdyakis triacontahedron | Integers 1–N. |
| Fudge / Fate | `df` | cube | Two faces each of −1 (`−`), 0 (blank) and +1 (`+`); opposite faces are + / − and blank / blank. |
| Custom / symbolic | `defineDie({ id, shape, faces })` | any built-in numeric shape, `{ prism: 3–24 }`, `{ trapezohedron: 3–24 }` | Numbers or strings as results, repeats allowed; labels from `0–9 + - −` (≤ 4 characters), drawn stroke symbols, or blank. |

“Every RPG die” is open-ended: the presets cover the table above and custom definitions are
the extension point. Rendering a die does not implement a game's rules, pools, modifiers or
probabilities; the application always chooses the result.

### Conventions

- **Numbering**: opposite faces sum to N + 1 wherever a die has opposite faces (D16: kites half
  a turn apart); prisms count around their axis; built-in face i shows i + 1.
- **D4**: every face prints the number of each corner near that corner, pointing at it. The
  result is the upright number at the top corner of the face turned to the viewer (equivalently,
  the number repeated around the top vertex). Each result has three equivalent poses.
- **Repeated outcomes** (DF, D4, custom): the value is chosen by the caller; the physical face is
  the equivalent pose nearest to the current rotation (ties: first in face order), so the same
  state and value always land on the same face.
- **Labels vs. results**: `info.values` are results, `info.faces[i].label` and
  `info.labelsFor(value)` are what is printed, `info.format(value)` is readable result text
  (`'+1'`, `'00'`, `'37'`).
- **Orientation markers**: labels that read as another label of the same die upside down are
  underlined (6/9 on most dice; also 16/91, 66/99, 68/89 … on the D120).
- **Distribution for demos**: uniform over `info.values` matches every built-in die (DF: two
  faces per result).

## Contract checklist

| Requirement | Implementation |
| --- | --- |
| Typed factory and registry | `createDie(container, { type, … })`, `DieType`, `DieValueMap`/`DieValueOf`, `DIE_TYPES`, `getDieInfo`, `getDieTemplate`, `createDieTemplateSvg`, `defineDie`. |
| D20 compatibility | `createD20`, `D20*` types, `D20_NET_V1` and `D20View` unchanged; D20 orientations are bit-identical to the original frames (tested). |
| Shared lifecycle | All types use the same controller: immediate values, `orientTo`, `rollTo`, themes, motion modes, snapshots, subscriptions, abort/replace/dispose cancellation (tested for every type). |
| Caller-chosen results, validation first | `INVALID_ARGUMENT` before any state change for values outside the type. |
| Polygon faces | Fan triangulation; internal diagonals are never drawn (tested per type); one label per region, D4 corner kites. |
| Skins per type | `<type>-grid-v1` templates (SVG + JSON shipped for every built-in type except the D20, which keeps `d20-net-v1`), explicit per-face UV polygons; layouts of other types are rejected and the previous skin stays. |
| Runtime constraints | WebGL2, no runtime dependencies, SSR-safe imports, idle rendering, 21.0 kB gzip core (200 kB budget unchanged). |
| React | `<DieView type value …>`; changing `type` disposes the die and creates one new instance; `D20View` unchanged. |
| Demo | Die-type selector with every preset; see the root README. |

## Limitations

- The D100 is a single instance with two bodies in one canvas, not two independent dice.
- High-face-count dice (D60, D120) have small labels; they need a large view (≥ 240 CSS px for
  the D120) to be read comfortably. The D120 font is uniformly smaller because of three-digit
  labels.
- No text font: labels are digits, `+`, `−` or user stroke symbols; letters need a symbol or a skin.
- Custom geometry is limited to the built-in shapes, prisms and trapezohedra.
- Coin rims and prism end caps are not in the skin templates and keep the body color.
- Browser coverage is automated headless Chromium, Firefox and WebKit on macOS (and Linux CI);
  physical Android/iOS devices have not been tested.
