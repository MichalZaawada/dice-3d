export type Easing = (t: number) => number;

export const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const linear: Easing = (t) => clamp01(t);

export const easeInOutCubic: Easing = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

export const easeOutCubic: Easing = (t) => 1 - (1 - clamp01(t)) ** 3;

export const easeOutQuart: Easing = (t) => 1 - (1 - clamp01(t)) ** 4;
