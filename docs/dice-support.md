# RPG dice support specification

Status: implementation target. The currently shipped API supports **D20 only**.
This document defines the remaining work; it does not advertise unimplemented APIs.

## Required dice

| Family | Required types | Result semantics |
| --- | --- | --- |
| Standard RPG set | D4, D6, D8, D10, D12, D20 | Integers 1 through N. |
| Percentile | D100 and percentile D10 | D100 returns 1–100; a tens die displays 00, 10, …, 90. With a units die displaying 0–9, 00 + 0 means 100. Keep display labels separate from numeric results. |
| Small dice | D2, D3 | Results 1–2 and 1–3; coin or repeated-label geometry is acceptable when documented. |
| Extended numeric set | D5, D7, D14, D16, D24, D30, D48, D60, D120 | Integers 1 through N; document the chosen physical shape and numbering. |
| Fudge / Fate | DF (six faces) | Two faces each of −1, 0, +1; display minus, blank and plus. A roll selects a result, with a deterministic choice among equivalent physical faces. |
| Custom / symbolic | User-defined face labels and outcomes | Extensible definitions for other side counts, repeated outcomes and game-specific symbols. No bundled proprietary artwork. |

“Every RPG die” is an open-ended requirement: games can define new side counts and
symbols. Built-in presets cover the table above; custom definitions provide the
extension point instead of claiming a finite list is exhaustive. Rendering a die
does not implement a game's rules, dice pools, modifiers or result probabilities.

## Core contract

- Provide a typed common factory and die-type registry, with documented values,
  labels, geometry and defaults. Exact export names are finalized with implementation.
- Preserve existing `createD20`, D20 types, numbering, orientations and `d20-net-v1`
  textures. Existing consumers must continue to compile and behave the same way.
- Every built-in type supports immediate values, orientation, rolling, themes,
  motion preferences, snapshots, cancellation and disposal through the shared lifecycle.
- Results are chosen by the caller, never by the renderer. Reject invalid results
  before changing state. Numeric values and rendered labels are distinct concepts.
- Triangulate polygonal faces without visible internal diagonals or duplicated labels.
  D4 needs an explicit, legible result convention; repeated labels need separate
  physical face identity. High-face-count dice must remain readable when enlarged.
- Support skins for each type through documented per-type UV layouts or templates.
  Never apply the D20 net silently to another shape. Reject incompatible skins
  without corrupting the previous appearance.
- Maintain WebGL2, SSR-safe imports, no runtime dependencies, idle rendering and
  deterministic caller-selected results. Expose equivalent support in the React
  adapter while preserving `D20View`.

## Demo

Keep the existing minimal layout: dice-3d logo plus die preview and controls.
Add a labeled die-type selector containing every implemented built-in preset.
Switching type must dispose the old instance, create exactly one new canvas,
update result choices and labels, and reset incompatible skin/upload state and
recent history. Preserve compatible theme, size and motion settings. Handle rapid
switches and pending rolls without letting old results update the new die.

The demo chooses random outcomes from the selected type's documented distribution
(uniform numeric results; equal probability for the six physical DF faces).
Percentile display must explain the 00/0 convention. Keep result text accessible
and ensure controls and die agree after reload. All controls must work on narrow
screens and with keyboard input.

## Acceptance and documentation

- Test geometry, outward winding, face frames, numbering, result validation and
  target orientations for all presets, including repeated and symbolic labels.
- Test polygon rendering, skin validation, percentile boundaries, DF outcomes,
  cancellation and disposal, React switching, rapid demo switching and reload.
- Exercise browser behavior in Chromium, Firefox and WebKit; distinguish automated
  engine tests from tests on physical Android/iOS devices.
- Run repository checks and browser tests. Investigate bundle budget regressions;
  do not silently increase the budget to make checks pass.
- Update core and React READMEs, architecture, skins documentation, examples and
  demo screenshots to describe the actual implemented API and limitations.
- Mark presets as available only after implementation and verification. Document
  any remaining scope explicitly instead of presenting placeholders as support.
