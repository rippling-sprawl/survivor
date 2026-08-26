import { NextResponse } from 'next/server';
import { ValidationError } from './errors';

/**
 * Shared response helpers so every endpoint fails the same shape. Errors are logged server-side
 * and returned as a plain message — Supabase error text can name tables and columns, which is not
 * something to hand to a browser.
 */

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);

export const fail = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

export function handleError(context: string, error: unknown) {
  // A validation failure is the caller's to fix, so it is passed through verbatim and logged as
  // routine rather than as a fault.
  if (error instanceof ValidationError) {
    console.warn(`[${context}] ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`[${context}]`, error);
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  const configIssue = message.includes('not configured') || message.includes('Missing ');
  return NextResponse.json(
    { error: configIssue ? message : 'Something went wrong. Check the server logs.' },
    { status: configIssue ? 503 : 500 },
  );
}
