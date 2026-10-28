/** Resolves a file in /public against the deployment base (works at '/' and under a Pages subpath). */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
