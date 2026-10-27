import {test} from '@playwright/test';
import {signUp,onboard,uniqueEmail} from './helpers';
import {runManualDoseScenario} from './manualDoseScenario';

test('selected lower load is visible on the light day and supports a trial on the next comparable day',async({page},info)=>{
  test.setTimeout(150_000);
  await signUp(page,uniqueEmail('manual-dose'));await onboard(page);
  await runManualDoseScenario(page,`docs/evidence/adaptation-2026-10-26/browser/${info.project.name}`);
});
