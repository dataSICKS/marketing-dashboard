import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetSettings();
  const { mutate: update, isPending } = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "設定を保存しました" });
      },
      onError: () => {
        toast({ title: "保存に失敗しました", variant: "destructive" });
      },
    },
  });

  const [clarityTargetUrl, setClarityTargetUrl] = useState("");

  useEffect(() => {
    if (settings?.clarityTargetUrl != null) {
      setClarityTargetUrl(settings.clarityTargetUrl);
    }
  }, [settings]);

  const handleSave = () => {
    update({ clarityTargetUrl: clarityTargetUrl || null });
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <h1 className="text-xl font-bold mb-6" style={{ color: "#1A1A1A" }}>設定</h1>

      <div className="rounded-xl border p-6" style={{ background: "#fff", borderColor: "#EBEBEB" }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "#374151" }}>
          CVRレポート — Microsoft Clarity
        </h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "#6B7280" }}>
            対象URL（前方一致でフィルター）
          </label>
          {isLoading ? (
            <div className="h-9 rounded-lg animate-pulse" style={{ background: "#F3F4F6" }} />
          ) : (
            <input
              type="url"
              value={clarityTargetUrl}
              onChange={(e) => setClarityTargetUrl(e.target.value)}
              placeholder="https://example.com/lp/"
              className="h-9 rounded-lg border px-3 text-sm outline-none transition-colors"
              style={{
                borderColor: "#E5E7EB",
                color: "#1A1A1A",
                background: "#FAFAFA",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#FBBF24")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          )}
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            Clarityのスクロールデータを指定URLのページに絞り込みます。空欄の場合は全ページが対象になります。
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || isLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "#FBBF24", color: "#fff" }}
          >
            {isPending ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
