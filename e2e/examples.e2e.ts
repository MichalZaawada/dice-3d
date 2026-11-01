import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  return errors;
}

test('vanilla example renders, rolls and swaps skins', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/examples/vanilla/index.html');
  await expect(page.locator('#dice canvas')).toHaveCount(1);
  await page.selectOption('#motion', 'none');
  await page.click('#roll');
  await expect(page.locator('#result')).toHaveText(/^([1-9]|1\d|20)$/);
  await page.selectOption('#value', '6');
  await expect(page.locator('#result')).toHaveText('6');
  await page.selectOption('#skin', 'net');
  await page.selectOption('#skin', 'custom');
  await page.selectOption('#skin', 'default');
  await page.selectOption('#size', '320');
  await expect(page.locator('#dice canvas')).toHaveJSProperty('clientWidth', 320);
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('vanilla reload resets restored controls along with the die', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/examples/vanilla/index.html');
  await page.selectOption('#die-type', 'df');
  await page.selectOption('#die-type', 'd6');
  await page.selectOption('#motion', 'none');
  await page.selectOption('#value', '6');
  await page.selectOption('#theme', 'ivory');
  await page.selectOption('#skin', 'custom');
  await page.selectOption('#numbers', 'overlay');
  await page.selectOption('#size', '320');
  await page.uncheck('#dark');
  await page.reload();
  for (const [id, value] of Object.entries({
    'die-type': 'd20', motion: 'system', value: '20', theme: 'jade', skin: 'default',
    numbers: 'in-texture', size: '160',
  })) {
    await expect(page.locator(`#${id}`)).toHaveValue(value);
  }
  await expect(page.locator('#dark')).toBeChecked();
  await expect(page.locator('body')).toHaveClass('dark');
  await expect(page.locator('#result')).toHaveText('20');
  await expect(page.locator('#dice canvas')).toHaveAttribute('data-dice-3d', 'd20');
  await expect(page.locator('#value option')).toHaveCount(20);
  await expect(page.locator('#dice canvas')).toHaveJSProperty('clientWidth', 160);
  await expect(page.locator('#upload')).toHaveValue('');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('vanilla die selector switches types, values, labels and skins', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/examples/vanilla/index.html');
  const types = await page.locator('#die-type option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(types).toEqual(['d2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd10', 'd12', 'd14', 'd16', 'd20', 'd24', 'd30', 'd48', 'd60', 'd120', 'd100', 'd10-tens', 'df']);
  await page.selectOption('#motion', 'none');
  await page.selectOption('#theme', 'obsidian');
  await page.selectOption('#size', '320');
  await page.selectOption('#skin', 'net');
  for (const type of types) {
    await page.selectOption('#die-type', type);
    await expect(page.locator('#dice canvas')).toHaveCount(1);
    await expect(page.locator('#dice canvas')).toHaveAttribute('data-dice-3d', type);
    // Compatible settings survive the switch.
    await expect(page.locator('#theme')).toHaveValue('obsidian');
    await expect(page.locator('#dice canvas')).toHaveJSProperty('clientWidth', 320);
    await expect(page.locator('#history li.empty')).toHaveCount(1);
  }
  await expect(page.locator('#error')).toBeHidden();

  await page.selectOption('#die-type', 'df');
  await expect(page.locator('#value option')).toHaveText(['\u22121 · Minus face', '0 · Blank face', '+1 · Plus face']);
  await page.click('#roll');
  await expect(page.locator('#result')).toHaveText(/^(\u22121|0|\+1)$/);
  await expect(page.locator('#history li')).toHaveCount(1);

  await page.selectOption('#die-type', 'd100');
  await expect(page.locator('#percentile-note')).toContainText('00 + 0 means 100');
  await expect(page.locator('#value option')).toHaveCount(100);
  await page.selectOption('#value', '100');
  await expect(page.locator('#result')).toHaveText('100');
  await expect(page.locator('#result-detail')).toHaveText('Tens die 00 + units die 0 (00 + 0 = 100)');
  await expect(page.locator('#history li.empty')).toHaveCount(1);
  await expect(page.locator('#template-svg')).toHaveAttribute('download', 'd100-grid-v1.svg');
  await page.selectOption('#skin', 'custom');
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('vanilla die selector works on a narrow screen with the keyboard', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/examples/vanilla/index.html');
  await page.selectOption('#motion', 'none');
  const select = page.getByLabel('Die type');
  await select.focus();
  await expect(select).toBeFocused();
  // A native <select> stays keyboard-operable; arrow-key behavior differs per engine, so pick the option directly.
  await select.selectOption('d6');
  await page.keyboard.press('Tab');
  await expect(page.locator('#dice canvas')).toHaveAttribute('data-dice-3d', 'd6');
  const box = await select.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  const roll = page.getByRole('button', { name: /Roll the dice/ });
  await roll.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#result')).toHaveText(/^[1-6]$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  expect(errors).toEqual([]);
});

test('vanilla ignores a pending roll from a die that was switched away', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/examples/vanilla/index.html');
  await page.selectOption('#motion', 'full');
  await page.click('#roll');
  await expect(page.locator('#dice')).toHaveAttribute('data-state', 'animating');
  // Rapid switches while the D20 is still rolling.
  for (const type of ['d6', 'd4', 'd120', 'd8']) await page.selectOption('#die-type', type);
  await expect(page.locator('#dice canvas')).toHaveCount(1);
  await page.waitForTimeout(1500);
  await expect(page.locator('#result')).toHaveText('8');
  await expect(page.locator('#history li.empty')).toHaveCount(1);
  await expect(page.locator('#dice')).toHaveAttribute('data-state', 'idle');
  const contexts = await page.evaluate(() => document.querySelectorAll('canvas').length);
  expect(contexts).toBe(1);
  expect(errors).toEqual([]);
});

test('react example renders the adapter and rolls through the ref', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/examples/react/index.html');
  await expect(page.locator('[data-dice-3d-view] canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Roll' }).click();
  await expect(page.getByTestId('result')).toHaveText(/^([1-9]|1\d|20)$/, { timeout: 5_000 });
  await page.getByLabel('Show value').selectOption('9');
  await expect(page.getByTestId('result')).toHaveText('9');
  await page.getByLabel('Die').selectOption('df');
  await expect(page.locator('[data-dice-3d-view] canvas')).toHaveCount(1);
  await expect(page.locator('[data-dice-3d-view] canvas')).toHaveAttribute('data-dice-3d', 'df');
  await expect(page.getByTestId('result')).toHaveText('+1');
  await page.getByLabel('Show value').selectOption('-1');
  await expect(page.getByTestId('result')).toHaveText('\u22121');
  await page.getByRole('button', { name: 'Roll' }).click();
  await page.getByLabel('Die').selectOption('d100');
  await expect(page.getByTestId('result')).toHaveText('100');
  await expect(page.locator('[data-dice-3d-view] canvas')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
