export function stamp(at: number): string {
  return new Date(at).toISOString().replaceAll(':', '-').replaceAll('.', '-')
}
