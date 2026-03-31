"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { MemberProfile, VoiceHistoryPage } from "@/app/lib/user-detail-api";
import {
  fetchMemberProfile,
  fetchUserVoiceDaily,
  fetchUserVoiceHistory,
} from "@/app/lib/user-detail-api";
import {
  computeCategoryStats,
  computeChannelStats,
  computeDailyTrends,
  type VoiceCategoryStat,
  type VoiceChannelStat,
  type VoiceDailyRecord,
  type VoiceDailyTrend,
} from "@/app/lib/voice-dashboard-api";
import { Button } from "@/components/ui/button";

import UserChannelPieChart from "./UserChannelPieChart";
import UserDailyBarChart from "./UserDailyBarChart";
import UserHistoryTable from "./UserHistoryTable";
import UserInfoSection from "./UserInfoSection";
import UserMicPieChart from "./UserMicPieChart";
import UserSearchDropdown from "./UserSearchDropdown";
import UserSummaryCards from "./UserSummaryCards";

type Period = "7d" | "14d" | "30d";

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getDateRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = formatYmd(now);
  const days = period === "7d" ? 7 : period === "14d" ? 14 : 30;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  const from = formatYmd(fromDate);
  return { from, to };
}

function computeUserSummary(records: VoiceDailyRecord[]): {
  totalDurationSec: number;
  totalMicOnSec: number;
  totalMicOffSec: number;
  totalAloneSec: number;
} {
  const globalRecords = records.filter((r) => r.channelId === "GLOBAL");
  const channelRecords = records.filter((r) => r.channelId !== "GLOBAL");

  return {
    totalDurationSec: channelRecords.reduce(
      (sum, r) => sum + r.channelDurationSec,
      0,
    ),
    totalMicOnSec: globalRecords.reduce((sum, r) => sum + r.micOnSec, 0),
    totalMicOffSec: globalRecords.reduce((sum, r) => sum + r.micOffSec, 0),
    totalAloneSec: globalRecords.reduce((sum, r) => sum + r.aloneSec, 0),
  };
}

const HISTORY_LIMIT = 20;

// Period labels are resolved inside the component using t()

interface Props {
  guildId: string;
  userId: string;
  onBack: () => void;
  onUserSelect: (userId: string) => void;
}

export default function UserDetailView({
  guildId,
  userId,
  onBack,
  onUserSelect,
}: Props) {
  const t = useTranslations("dashboard");
  const [period, setPeriod] = useState<Period>("7d");
  const [dailyRecords, setDailyRecords] = useState<VoiceDailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyData, setHistoryData] = useState<VoiceHistoryPage | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [profile, setProfile] = useState<MemberProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMemberProfile(guildId, userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [guildId, userId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setIsHistoryLoading(true);
      setHistoryPage(1);
      setError(null);

      try {
        const { from, to } = getDateRange(period);

        const [records, history] = await Promise.all([
          fetchUserVoiceDaily(guildId, userId, from, to),
          fetchUserVoiceHistory(guildId, userId, {
            from,
            to,
            page: 1,
            limit: HISTORY_LIMIT,
          }),
        ]);

        if (cancelled) return;

        setDailyRecords(records);
        setHistoryData(history);
      } catch {
        if (!cancelled) setError("데이터를 불러오는 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsHistoryLoading(false);
        }
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [guildId, userId, period]);

  useEffect(() => {
    if (historyPage === 1) return;

    let cancelled = false;

    async function loadHistory() {
      setIsHistoryLoading(true);
      try {
        const { from, to } = getDateRange(period);
        const history = await fetchUserVoiceHistory(guildId, userId, {
          from,
          to,
          page: historyPage,
          limit: HISTORY_LIMIT,
        });
        if (cancelled) return;
        setHistoryData(history);
      } catch {
        // 히스토리 페이징 실패는 조용히 무시 — 이전 데이터 유지
      } finally {
        if (!cancelled) setIsHistoryLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, userId, historyPage]);

  const summary = computeUserSummary(dailyRecords);
  const trends: VoiceDailyTrend[] = computeDailyTrends(dailyRecords);
  const channelStats: VoiceChannelStat[] = computeChannelStats(dailyRecords);
  const categoryStats: VoiceCategoryStat[] = computeCategoryStats(dailyRecords);

  const userName =
    profile?.userName ??
    dailyRecords.find((r) => r.channelId === "GLOBAL")?.userName ??
    dailyRecords[0]?.userName ??
    userId;
  const avatarUrl = profile?.avatarUrl ?? null;

  return (
    <div className="space-y-6">
      {/* 헤더: 뒤로가기 + 타이틀 + 유저 검색 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("voice.userDetail.backButton")}
          </Button>
        </div>
        <UserSearchDropdown guildId={guildId} onSelect={onUserSelect} />
      </div>

      {/* 유저 기본 정보 + 기간 선택 */}
      <div className="flex items-center justify-between">
        <UserInfoSection userName={userName} userId={userId} avatarUrl={avatarUrl} />
        <div className="flex gap-2">
          {(["7d", "14d", "30d"] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {t(`voice.periodLabel.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-red-500">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : (
        <>
          <UserSummaryCards
            totalDurationSec={summary.totalDurationSec}
            totalMicOnSec={summary.totalMicOnSec}
            totalMicOffSec={summary.totalMicOffSec}
            totalAloneSec={summary.totalAloneSec}
          />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <UserDailyBarChart data={trends} />
            </div>
            <div>
              <UserMicPieChart
                micOnSec={summary.totalMicOnSec}
                micOffSec={summary.totalMicOffSec}
              />
            </div>
          </div>

          <UserChannelPieChart
            channelStats={channelStats}
            categoryStats={categoryStats}
          />

          <UserHistoryTable
            data={historyData}
            loading={isHistoryLoading}
            currentPage={historyPage}
            onPageChange={setHistoryPage}
          />
        </>
      )}
    </div>
  );
}
