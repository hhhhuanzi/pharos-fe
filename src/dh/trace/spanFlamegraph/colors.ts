/** Service colors: theme tokens so light/dark both switch. Text on bars uses `text-title`. */
const SERVICE_COLOR_VARS = [
  'var(--fc-violet-9)',
  'var(--fc-indigo-9)',
  'var(--fc-green-9)',
  'var(--fc-orange-9)',
  'var(--fc-geekblue-6-color)',
  'var(--fc-purple-6-color)',
  'var(--fc-gold-6-color)',
] as const;

function hashService(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function serviceColorVar(service: string): string {
  return SERVICE_COLOR_VARS[hashService(service) % SERVICE_COLOR_VARS.length];
}

export function uniqueServices(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  names.forEach((name) => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push(name);
  });
  return out;
}
