export function createId(prefix = 'id'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
