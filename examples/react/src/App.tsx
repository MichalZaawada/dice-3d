import { useRef, useState } from 'react';
import { isD20Error, type D20Theme, type D20Value, type MotionMode } from 'dice-3d';
import { D20View, type D20ViewHandle } from 'dice-3d-react';

const THEMES: Record<string, Partial<D20Theme>> = {
  ivory: {},
  obsidian: { bodyColor: '#2b2f3a', edgeColor: '#a7adbb', numberColor: '#f3f0e8' },
};

/** The application decides the result; the library only animates it. */
function randomValue(): D20Value {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return ((random[0]! % 20) + 1) as D20Value;
}

export function App() {
  const die = useRef<D20ViewHandle>(null);
  const [value, setValue] = useState<D20Value>(20);
  const [rolling, setRolling] = useState(false);
  const [motion, setMotion] = useState<MotionMode>('system');
  const [theme, setTheme] = useState('ivory');
  const [error, setError] = useState<string | null>(null);

  async function roll() {
    const next = randomValue();
    setRolling(true);
    // rollTo animates even when the result repeats; the value prop then matches the die.
    const result = await die.current?.rollTo(next);
    if (!result || result.status === 'completed' || result.reason === 'disposed') {
      setValue(next);
      setRolling(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>dice-3d — React</h1>
      <D20View
        ref={die}
        value={value}
        motion={motion}
        theme={THEMES[theme]}
        style={{ width: 160, height: 160 }}
        onError={(reason) => setError(isD20Error(reason) ? `${reason.code}: ${reason.message}` : String(reason))}
      />
      {/* The canvas is decorative: the result is always rendered as text. */}
      <p>
        Result: <output aria-live="polite" data-testid="result">{rolling ? 'Rolling…' : value}</output>
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={roll}>
        Roll
      </button>{' '}
      <label>
        Show value{' '}
        <select value={value} onChange={(event) => setValue(Number(event.target.value) as D20Value)}>
          {Array.from({ length: 20 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              {index + 1}
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
