
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { role } = await req.json();
  const res = NextResponse.json({ ok: true });

  if (!role) {
    res.cookies.set({ name: 'role', value: '', path: '/', httpOnly: true, sameSite: 'lax', maxAge: 0 });
    return res;
  }

  res.cookies.set({
    name: 'role',
    value: role,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // secure: true, // bật khi deploy HTTPS
    maxAge: 60 * 60 * 8, // 8 giờ
  });
  return res;
}
