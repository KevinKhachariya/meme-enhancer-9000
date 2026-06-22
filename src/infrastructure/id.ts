function safeRandomUUID(): string {
  // crypto.randomUUID() requires a secure context (HTTPS or localhost).
  // When accessed over LAN via HTTP, it may not be available.
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: use getRandomValues which works in all contexts
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  // Set version 4 bits
  arr[6] = (arr[6] & 0x0f) | 0x40;
  // Set variant bits
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `${hex(arr[0])}${hex(arr[1])}${hex(arr[2])}${hex(arr[3])}-${
    hex(arr[4])}${hex(arr[5])}-${hex(arr[6])}${hex(arr[7])}-${
    hex(arr[8])}${hex(arr[9])}-${hex(arr[10])}${hex(arr[11])}${
    hex(arr[12])}${hex(arr[13])}${hex(arr[14])}${hex(arr[15])}`;
}

export function createId(prefix = 'id'): string {
  return `${prefix}-${safeRandomUUID()}`;
}
