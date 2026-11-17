import type { Migration } from '../types';
import { migration001 } from './001-app-meta';

/**
 * All migrations, in order. To change the schema: add `NNN-name.ts` + `NNN-name.spec.ts`,
 * append it here. Versions must be 1, 2, 3, … without gaps (checked at startup and in tests).
 */
export const MIGRATIONS: readonly Migration[] = [migration001];
