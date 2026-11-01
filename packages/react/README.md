# dice-3d-react

React adapter for [`dice-3d`](../core/README.md): `<DieView>` for every die type and the
original `<D20View>`. React 18 or 19 is a
peer dependency; the adapter adds no animation logic of its own.

```sh
npm install dice-3d dice-3d-react
```

```tsx
import { useRef, useState } from 'react';
import type { D20Value } from 'dice-3d';
import { D20View, type D20ViewHandle } from 'dice-3d-react';

export function DiceRoller() {
  const die = useRef<D20ViewHandle>(null);
  const [value, setValue] = useState<D20Value>(20);

  async function roll(next: D20Value) {
    // rollTo also animates when the result repeats.
    const result = await die.current?.rollTo(next);
    if (result?.status === 'completed' || result?.reason === 'disposed') setValue(next);
  }

  return (
    <>
      <D20View ref={die} value={value} motion="system" style={{ width: 160, height: 160 }} onError={console.error} />
      {/* The canvas is decorative: always render the value as text. */}
      <output aria-live="polite">{value}</output>
      <button onClick={() => roll(12)}>Roll</button>
    </>
  );
}
```

## Any die: `DieView`

```tsx
import { useState } from 'react';
import { getDieInfo, type DieType, type DieValue } from 'dice-3d';
import { DieView } from 'dice-3d-react';

export function AnyDie() {
  const [type, setType] = useState<DieType>('d6');
  const [value, setValue] = useState<DieValue>(6);
  const info = getDieInfo(type);
  return (
    <>
      <DieView type={type} value={value as never} style={{ width: 160, height: 160 }} />
      <output aria-live="polite">{info.format(value)}</output>
      <button onClick={() => { setType('d100'); setValue(100); }}>Percentile</button>
    </>
  );
}
```

`DieView` takes the props below plus `type` (a built-in type or a `defineDie` definition).
`value` is typed for literal types (`<DieView type="d8" value={9} />` does not compile).
Changing `type` disposes the current die and creates exactly one new one with the current
`value` (which must belong to the new type; otherwise `onError` receives `INVALID_ARGUMENT`
and the view stays empty until a valid value arrives with the next type change). Pending
`rollTo`/`orientTo` promises of the old die resolve `{ status: 'cancelled', reason: 'disposed' }`,
and the ref handle then drives the new die. Custom definitions are compared by reference.
The skin must use a layout for `type`. On the server `DieView` renders
`<div data-dice-3d-view data-die-type="…">`.

## Props

| Prop | Notes |
| --- | --- |
| `value` | Required. Changes animate with `orientTo`; a value that the die is already showing or animating to is skipped. |
| `motion` | `'system'` (default), `'full'`, `'reduced'`, `'none'`. |
| `theme` | `Partial<D20Theme>`; removed keys fall back to the library defaults. Compared by value. |
| `skin` | `D20Skin \| null` (`DieView`: `DieSkin \| null`), compared by reference: keep the object stable (e.g. `useMemo`). |
| `maxPixelRatio` | Creation option; changing it recreates the die. |
| `className`, `style` | Applied to the container `<div>`, which must get its size from CSS. |
| `onError` | Receives `D20Error`s: creation failures (`WEBGL_UNAVAILABLE`), invalid props, skin upload failures, rejected animations and `CONTEXT_LOST` (the view then stays empty). Defaults to `console.error`. |

## Ref handle

`ref` exposes `rollTo(value, options)`, `orientTo(value, options)` and `getSnapshot()` for
animations that a prop cannot express, such as rolling the same value again. Without a die
(WebGL2 unavailable, server rendering, after context loss) the methods resolve
`{ status: 'cancelled', reason: 'disposed' }` and `getSnapshot()` returns `null`.
Update `value` to the rolled result so the prop and the die agree.

## Lifecycle

The die is created in an effect after mount and disposed on unmount. Strict Mode's double
effects create and dispose a die once more and end with exactly one live instance. The adapter
holds no React state, so it never updates state after unmount. On the server it renders an empty
`<div data-dice-3d-view>`.

## License

MIT (see `LICENSE`).
