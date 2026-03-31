"use client";

import { LogIn } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import DashboardSidebar from "../../../components/DashboardSidebar";
import type { Guild } from "../../../components/Header";

export default function DashboardGuildLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ guildId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("auth");
  const guildId = params.guildId;

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);

  useEffect(() => {
    fetch("/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setIsLoggedIn(true);
          const userGuilds: Guild[] = data.user.guilds ?? [];
          setGuilds(userGuilds);
          if (!userGuilds.some((g) => g.id === guildId)) {
            router.replace("/select-guild?mode=dashboard");
          }
        }
      })
      .catch(() => {
        setIsNetworkError(true);
      })
      .finally(() => setIsLoading(false));
  }, [guildId, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)]">
        <div className="hidden md:block w-64 bg-white border-r border-gray-200 animate-pulse" />
        <main className="flex-1 p-4 md:p-8 bg-gray-50" />
      </div>
    );
  }

  if (isNetworkError) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {t("networkError")}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {t("networkErrorPrompt")}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <LogIn className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {t("loginRequired")}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {t("loginPrompt")}
          </p>
          <a
            href={`/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium inline-block"
          >
            {t("loginButton")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <DashboardSidebar guilds={guilds} selectedGuildId={guildId} />
      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  );
}
