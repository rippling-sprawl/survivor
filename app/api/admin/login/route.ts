import { cookies } from 'next/headers';
import {
  createSessionToken,
  passcodeMatches,
  sessionCookieOptions,
} from '@/lib/admin-session';
import { fail, handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const expected = process.env.ADMIN_PASSCODE;
    const secret = process.env.SESSION_SECRET;
    if (!expected || !secret) {
      return fail('Admin is not configured. Set ADMIN_PASSCODE and SESSION_SECRET.', 503);
    }

    const body = (await request.json()) as { passcode?: string };
    if (!body.passcode || !passcodeMatches(body.passcode, expected)) {
      return fail('That passcode is not right.', 401);
    }

    const store = await cookies();
    store.set({ ...sessionCookieOptions, value: await createSessionToken(secret) });
    return ok({ authorized: true });
  } catch (error) {
    return handleError('POST /api/admin/login', error);
  }
}
