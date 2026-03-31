"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <AlertTriangle className="h-12 w-12 text-yellow-500" />
      <h2 className="text-xl font-semibold text-gray-900">
        설정을 불러오는 중 오류가 발생했습니다
      </h2>
      <p className="max-w-md text-center text-sm text-gray-500">
        {error.message || "알 수 없는 오류가 발생했습니다."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
      >
        <RotateCcw className="h-4 w-4" />
        다시 시도
      </button>
    </div>
  );
}
