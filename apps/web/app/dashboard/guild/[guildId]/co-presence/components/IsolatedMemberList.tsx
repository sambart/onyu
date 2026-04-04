'use client';

import { useTranslations } from 'next-intl';

import type { IsolatedMember } from '@/app/lib/co-presence-api';
import { formatMinutesI18n } from '@/app/lib/format-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface IsolatedMemberListProps {
  members: IsolatedMember[];
}

export default function IsolatedMemberList({ members }: IsolatedMemberListProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('coPresence.isolated.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('coPresence.isolated.description')}</p>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t('coPresence.isolated.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 text-left font-medium text-muted-foreground">
                    {t('coPresence.isolated.username')}
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    {t('coPresence.isolated.totalVoice')}
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    {t('coPresence.isolated.lastVoiceDate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => (
                  <tr key={member.userId} className="hover:bg-muted/50">
                    <td className="py-3 font-medium">{member.userName}</td>
                    <td className="py-3 text-right text-muted-foreground">
                      {formatMinutesI18n(member.totalVoiceMinutes, tc)}
                    </td>
                    <td className="py-3 text-right text-muted-foreground">
                      {member.lastVoiceDate.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
