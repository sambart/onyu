"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fetchMemberProfiles } from "@/app/lib/user-detail-api";
import {
  computeChannelStats,
  computeDailyTrends,
  computeSummary,
  computeUserStats,
  fetchVoiceDaily,
  type VoiceChannelStat,
  type VoiceDailyRecord,
  type VoiceDailyTrend,
  type VoiceSummary,
  type VoiceUserStat,
} from "@/app/lib/voice-dashboard-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import ChannelBarChart from "./components/ChannelBarChart";
import DailyTrendChart from "./components/DailyTrendChart";
import MicDistributionChart from "./components/MicDistributionChart";
import SummaryCards from "./components/SummaryCards";
import UserDetailView from "./components/UserDetailView";
import UserRankingTable from "./components/UserRankingTable";

type Period = "7d" | "14d" | "30d";

function getDateRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = formatYmd(now);
  const days = period === "7d" ? 7 : period === "14d" ? 14 : 30;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  const from = formatYmd(fromDate);
  return { from, to };
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export default function VoiceDashboardPage() {
  const t = useTranslations("dashboard");
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get("userId");

  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<VoiceSummary | null>(null);
  const [trends, setTrends] = useState<VoiceDailyTrend[]>([]);
  const [channelStats, setChannelStats] = useState<VoiceChannelStat[]>([]);
  const [rawRecords, setRawRecords] = useState<VoiceDailyRecord[]>([]);
  const [userStats, setUserStats] = useState<VoiceUserStat[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { userName: string; avatarUrl: string | null }>>({});

  useEffect(() => {
    if (selectedUserId) return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = getDateRange(period);
        const data = await fetchVoiceDaily(guildId, from, to);
        if (cancelled) return;
        setRawRecords(data);
        setSummary(computeSummary(data));
        setTrends(computeDailyTrends(data));
        setChannelStats(computeChannelStats(data));
        const stats = computeUserStats(data);
        setUserStats(stats);

        const userIds = stats.slice(0, 20).map((u) => u.userId);
        if (userIds.length > 0) {
          const p = await fetchMemberProfiles(guildId, userIds);
          if (!cancelled) setProfiles(p);
        }
      } catch {
        if (!cancelled) setError(t("error.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [guildId, period, selectedUserId]);

  function handleUserSelect(userId: string) {
    router.push(`/dashboard/guild/${guildId}/voice?userId=${userId}`);
  }

  function handleBackToGuild() {
    router.push(`/dashboard/guild/${guildId}/voice`);
  }

  if (selectedUserId) {
    return (
      <div className="p-4 md:p-6">
        <UserDetailView
          guildId={guildId}
          userId={selectedUserId}
          onBack={handleBackToGuild}
          onUserSelect={handleUserSelect}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">{t("voice.title")}</h1>
        <Select
          value={period}
          // select onChange: value는 런타임에 Period 유니온 멤버만 가능
          onValueChange={(v) => setPeriod(v as Period)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t("voice.period.7d")}</SelectItem>
            <SelectItem value="14d">{t("voice.period.14d")}</SelectItem>
            <SelectItem value="30d">{t("voice.period.30d")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-red-500">{error}</div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground">{t("common.loading")}</div>
        </div>
      ) : (
        <>
          {summary && <SummaryCards summary={summary} />}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DailyTrendChart data={trends} />
            </div>
            <div>
              {summary && <MicDistributionChart summary={summary} />}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChannelBarChart data={channelStats} records={rawRecords} />
            <UserRankingTable
              data={userStats}
              guildId={guildId}
              profiles={profiles}
              onUserSelect={handleUserSelect}
            />
          </div>
        </>
      )}
    </div>
  );
}
