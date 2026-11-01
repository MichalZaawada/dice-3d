import { useRef, useState } from 'react';
import { DIE_TYPES, getDieInfo, isD20Error, type D20Theme, type DieInfo, type DieType, type DieValue, type MotionMode } from 'dice-3d';
import { DieView, type DieViewHandle } from 'dice-3d-react';

const THEMES: Record<string, Partial<D20Theme>> = {
  ivory: {},
  obsidian: { bodyColor: '#2b2f3a', edgeColor: '#a7adbb', numberColor: '#f3f0e8' },
};

/** The application decides the result; the library only animates it. */
function randomValue(values: readonly DieValue[]): DieValue {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return values[random[0]! % values.length]!;
}

export function App() {
  const die = useRef<DieViewHandle>(null);
  const [type, setType] = useState<DieType>('d20');
  const [value, setValue] = useState<DieValue>(20);
  const [rolling, setRolling] = useState(false);
  const [motion, setMotion] = useState<MotionMode>('system');
  const [theme, setTheme] = useState('ivory');
  const [error, setError] = useState<string | null>(null);
  const info: DieInfo = getDieInfo(type);
  const rollId = useRef(0);

  async function roll() {
    const next = randomValue(info.values);
    const id = ++rollId.current;
    setRolling(true);
    // rollTo animates even when the result repeats; the value prop then matches the die.
    const result = await die.current?.rollTo(next as never);
    if (id !== rollId.current) return;
    if (!result || result.status === 'completed' || result.reason === 'disposed') {
      setValue(next);
      setRolling(false);
    }
  }

  function changeType(next: DieType) {
    // A pending roll of the old die resolves as disposed; ignore it.
    rollId.current++;
    setRolling(false);
    setType(next);
    setValue(getDieInfo(next).defaultValue);
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>dice-3d — React</h1>
      <DieView
        ref={die}
        type={type}
        value={value as never}
        motion={motion}
        theme={THEMES[theme]}
        style={{ width: 160, height: 160 }}
        onError={(reason) => setError(isD20Error(reason) ? `${reason.code}: ${reason.message}` : String(reason))}
      />
      {/* The canvas is decorative: the result is always rendered as text. */}
      <p>
        Result: <output aria-live="polite" data-testid="result">{rolling ? 'Rolling…' : info.format(value)}</output>
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={roll}>
        Roll
      </button>{' '}
      <label>
        Die{' '}
        <select value={type} onChange={(event) => changeType(event.target.value as DieType)}>
          {DIE_TYPES.map((option) => (
            <option key={option} value={option}>
              {getDieInfo(option).name}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Show value{' '}
        <select value={String(value)} onChange={(event) => setValue(info.values.find((v) => String(v) === event.target.value)!)}>
          {info.values.map((option) => (
            <option key={String(option)} value={String(option)}>
              {info.format(option)}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Motion{' '}
        <select value={motion} onChange={(event) => setMotion(event.target.value as MotionMode)}>
          <option value="system">system</option>
          <option value="full">full</option>
          <option value="reduced">reduced</option>
          <option value="none">none</option>
        </select>
      </label>{' '}
      <label>
        Theme{' '}
        <select value={theme} onChange={(event) => setTheme(event.target.value)}>
          <option value="ivory">Ivory</option>
          <option value="obsidian">Obsidian</option>
        </select>
      </label>
    </main>
  );
}
