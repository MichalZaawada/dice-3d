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
  await page.selectOption('#motion', 'none');
  await page.selectOption('#value', '6');
  await page.selectOption('#theme', 'ivory');
  await page.selectOption('#skin', 'custom');
  await page.selectOption('#numbers', 'overlay');
  await page.selectOption('#size', '320');
  await page.uncheck('#dark');
  await page.reload();
  for (const [id, value] of Object.entries({
    motion: 'system', value: '20', theme: 'jade', skin: 'default',
    numbers: 'in-texture', size: '160',
  })) {
    await expect(page.locator(`#${id}`)).toHaveValue(value);
  }
  await expect(page.locator('#dark')).toBeChecked();
  await expect(page.locator('body')).toHaveClass('dark');
  await expect(page.locator('#result')).toHaveText('20');
  await expect(page.locator('#dice canvas')).toHaveJSProperty('clientWidth', 160);
  await expect(page.locator('#upload')).toHaveValue('');
  await expect(page.locator('#error')).toBeHidden();
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
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
