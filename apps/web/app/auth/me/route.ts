import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

interface JwtPayload {
  sub: string;
  username: string;
  avatar?: string;
  guilds?: Guild[];
  isSuperAdmin?: boolean;
  exp: number;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const payload: JwtPayload = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf-8'),
    );

    if (payload.exp * 1000 < Date.now()) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        discordId: payload.sub,
        username: payload.username,
        avatar: payload.avatar ?? null,
        guilds: payload.guilds ?? [],
        isSuperAdmin: payload.isSuperAdmin ?? false,
      },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
