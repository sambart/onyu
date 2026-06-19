import { redirect } from 'next/navigation';

interface AdminGuildDetailPageProps {
  params: Promise<{ guildId: string }>;
}

/**
 * /admin/guilds/[guildId] → /dashboard/guild/[guildId]/overview 서버 사이드 리다이렉트.
 * URL 직접 진입 및 향후 딥링크 호환을 위한 진입점.
 */
export default async function AdminGuildDetailPage({ params }: AdminGuildDetailPageProps) {
  const { guildId } = await params;
  redirect(`/dashboard/guild/${guildId}/overview`);
}
