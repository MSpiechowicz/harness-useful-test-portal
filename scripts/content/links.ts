/**
 * What an HTTP status says about a source link: 2xx/3xx are fine, 404/410 and other client errors mean the page is
 * gone, and statuses that usually come from bot protection or a busy server only warrant a look.
 */
export function classifyStatus(status: number): 'ok' | 'warn' | 'fail' {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 401 || status === 403 || status === 429 || status === 999 || status >= 500) return 'warn';

  return 'fail';
}
