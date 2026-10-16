/** Zod pieces shared by the agent tools. */
import { z } from 'zod';

/** A Sydney calendar date, `YYYY-MM-DD`. Add `.describe()` at the use site. */
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
