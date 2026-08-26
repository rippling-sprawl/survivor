/**
 * Environment access with useful failure messages. A missing variable should say which one and
 * where it goes, not surface as an unrelated crash three layers down.
 */

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local (see .env.example).`);
  return value;
}

export function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}
