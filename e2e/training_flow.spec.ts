import { test } from '@playwright/test';
import { onboard, signUp, uniqueEmail } from './helpers';
import { runTrainingFlow } from './trainingFlowScenario';

test('warmup, unilateral cable, offline rest resume and separated history', async ({ page, context }, info) => {
  test.setTimeout(150000);
  await page.emulateMedia({ colorScheme: 'light' });
  await signUp(page, uniqueEmail('flow'));
  await onboard(page);
  await runTrainingFlow(page, context, `docs/evidence/training-flow/${info.project.name}`);
});