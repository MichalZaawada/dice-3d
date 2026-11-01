import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { D20View, DieView } from '../src/index.js';

describe('D20View on the server', () => {
  it('renders an empty container without touching browser APIs', () => {
    expect(typeof globalThis.window).toBe('undefined');
    const html = renderToString(<D20View value={12} className="dice" />);
    expect(html).toBe('<div class="dice" data-dice-3d-view=""></div>');
    expect(renderToString(<DieView type="d100" value={37} className="dice" />)).toBe(
      '<div class="dice" data-dice-3d-view="" data-die-type="d100"></div>',
    );
  });
});
