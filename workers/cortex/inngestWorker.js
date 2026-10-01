/**
 * Calls to the inngest-jobs worker. Cloudflare refuses a fetch from one Worker
 * to another workers.dev Worker on the same account (error 1042), so these go
 * through the INNGEST service binding. The plain fetch is only a fallback for
 * environments without the binding.
 */
export function fetchInngestWorker(env, path, init) {
  const url = `${env.INNGEST_WORKER_URL || 'https://gremly-inngest-jobs'}${path}`;
  return env.INNGEST ? env.INNGEST.fetch(url, init) : fetch(url, init);
}
