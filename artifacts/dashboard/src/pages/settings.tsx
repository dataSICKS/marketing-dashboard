import { useState, useEffect } from "react";
import { Plus, X, Link2 } from "lucide-react";
import { useGetSettings, useUpdateSettings, useGetClarityFiles } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useGetSettings();
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

  const { data: clarityFiles, isLoading: filesLoading } = useGetClarityFiles();

  const [urls, setUrls] = useState<string[]>([""]);

  useEffect(() => {
    if (settings) {
      setUrls(settings.clarityTargetUrls.length > 0 ? settings.clarityTargetUrls : [""]);
    }
  }, [settings]);

  const addUrl = () => setUrls((prev) => [...prev, ""]);

  const removeUrl = (i: number) =>
    setUrls((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length === 0 ? [""] : next;
    });

  const changeUrl = (i: number, val: string) =>
    setUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)));

  const handleSave = () => {
    const filtered = urls.map((u) => u.trim()).filter(Boolean);
    update({ clarityTargetUrls: filtered });
  };

  const dates = clarityFiles?.dates ?? [];

  return (
    <div className="p-6 md:p-8 max-w-2xl flex flex-col gap-6">
      <h1 className="text-xl font-bold" style={{ color: "#1A1A1A" }}>設定</h1>

      {/* URL フィルター設定 */}
      <div className="rounded-xl border p-6" style={{ background: "#fff", borderColor: "#EBEBEB" }}>
        <h2 className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>
          CVRレポート — Microsoft Clarity
        </h2>
        <p className="text-xs mb-4" style={{ color: "#9CA3AF" }}>
          スクロールデータを絞り込む対象URL（前方一致）を設定します。空欄の場合は全ページが対象になります。
        </p>

        <div className="flex flex-col gap-2">
          {(settingsLoading ? [""] : urls).map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              {settingsLoading ? (
                <div className="flex-1 h-9 rounded-lg animate-pulse" style={{ background: "#F3F4F6" }} />
              ) : (
                <input
                  type="url"
                  value={url}
                  onChange={(e) => changeUrl(i, e.target.value)}
                  placeholder="https://example.com/lp/"
                  className="flex-1 h-9 rounded-lg border px-3 text-sm outline-none transition-colors"
                  style={{ borderColor: "#E5E7EB", color: "#1A1A1A", background: "#FAFAFA" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#FBBF24")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#E5E7EB")}
                />
              )}
              <button
                onClick={() => removeUrl(i)}
                disabled={urls.length === 1}
                className="p-1.5 rounded-md transition-colors disabled:opacity-30"
                style={{ color: "#9CA3AF" }}
                title="削除"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addUrl}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: "#FBBF24" }}
        >
          <Plus size={13} /> URL を追加
        </button>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending || settingsLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "#FBBF24", color: "#fff" }}
          >
            {isPending ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>

      {/* Clarity 取得済みデータ一覧 */}
      <div className="rounded-xl border p-6" style={{ background: "#fff", borderColor: "#EBEBEB" }}>
        <h2 className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>
          Clarity — 取得済みデータ
        </h2>
        <p className="text-xs mb-4" style={{ color: "#9CA3AF" }}>
          Clarity ストレージに保存されているデータの日付一覧です。
        </p>

        {filesLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-7 rounded animate-pulse" style={{ background: "#F3F4F6" }} />
            ))}
          </div>
        ) : dates.length === 0 ? (
          <p className="text-sm" style={{ color: "#9CA3AF" }}>データがありません</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {dates.map((d) => (
              <li
                key={d}
                className="flex items-center gap-2 text-sm rounded-lg px-3 py-2"
                style={{ background: "#F9FAFB", color: "#374151" }}
              >
                <Link2 size={13} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
