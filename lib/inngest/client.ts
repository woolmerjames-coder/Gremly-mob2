import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'gremly',
  // In production, set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY env vars
});
