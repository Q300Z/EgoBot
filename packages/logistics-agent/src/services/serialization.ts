export function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function decimalToString(value: { toString(): string }): string {
  return value.toString();
}
