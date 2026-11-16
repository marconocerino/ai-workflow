// `npm run plan`: regenerate PLAN.md from docs/backlog.csv.
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { PLAN_PATH, ROOT, buildPlanFromDisk } from './backlog.mjs';

writeFileSync(PLAN_PATH, buildPlanFromDisk());
console.log(`Wrote ${relative(ROOT, PLAN_PATH)}`);
