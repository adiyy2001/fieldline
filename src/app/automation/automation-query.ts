export const AUTOMATION_QUERY_PARAMETER = 'automation';

export function isAutomationRequested(search: string): boolean {
  return new URLSearchParams(search).has(AUTOMATION_QUERY_PARAMETER);
}
