import { test } from '@playwright/test';
import { onboard, signUp, uniqueEmail } from './helpers';
import { runTrainingFlow } from './trainingFlowScenario';

test('warmup, unilateral cable, offline rest resume and separated history', async ({ page, context }, info) => {
  test.setTimeout(150000);
  await page.emulateMedia({ colorScheme: 'light' });
  await signUp(page, uniqueEmail('flow'));
  await onboard(page);
  if(info.project.name==='iphone-webkit')info.annotations.push({type:'limitation',description:'Windows WebKit: reload online; actual offline PWA needs iPhone testing.'});
  await runTrainingFlow(page, context, `docs/evidence/ux-2026-10-18/training-flow/${info.project.name}`, info.project.name!=='iphone-webkit');
});