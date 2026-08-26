import { cookies } from 'next/headers';
import { ADMIN_COOKIE } from '@/lib/admin-session';
import { handleError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    (await cookies()).delete(ADMIN_COOKIE);
    return ok({ authorized: false });
  } catch (error) {
    return handleError('POST /api/admin/logout', error);
  }
}
