'use client';

import Image from 'next/image';

interface Props {
  userName: string;
  userId: string;
  avatarUrl?: string | null;
}

export default function UserInfoSection({ userName, userId, avatarUrl }: Props) {
  const initial = userName ? userName.charAt(0).toUpperCase() : '?';

  return (
    <div className="flex items-center gap-4">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={userName}
          width={56}
          height={56}
          className="h-14 w-14 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground select-none">
          {initial}
        </div>
      )}
      <div>
        <p className="text-lg font-semibold">{userName}</p>
        <p className="text-sm text-muted-foreground">{userId}</p>
      </div>
    </div>
  );
}
