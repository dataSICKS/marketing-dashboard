import { useState } from "react";
import {
  useListCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
} from "@workspace/api-client-react";
import type { Campaign, CampaignInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Check, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const QUERY_KEY = ["/api/campaigns"];

function fmt(d: string) {
  return d.replace(/-/g, "/");
}

function toInputDate(d: string) {
  return d.slice(0, 10);
}

const ACCENT = "#1A1A1A";

// ─── Category constants ───────────────────────────────────────────────
export const CAMPAIGN_CATEGORIES: { value: string; label: string; color: string; bg: string }[] = [
  { value: "メルマガ", label: "メルマガ", color: "#1D4ED8", bg: "#DBEAFE" },
  { value: "CVR",     label: "CVR",      color: "#065F46", bg: "#D1FAE5" },
];

function getCategoryStyle(category: string | null | undefined) {
  const found = CAMPAIGN_CATEGORIES.find((c) => c.value === category);
  if (found) return { color: found.color, bg: found.bg };
  return { color: "#6B7280", bg: "#F3F4F6" };
}

// ─── Form Modal ──────────────────────────────────────────────────────
interface FormValues {
  title: string;
  startDate: string;
  endDate: string;
  memo: string;
  category: string;
}

function CampaignFormModal({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial: FormValues;
  onSave: (v: CampaignInput) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!v.title.trim()) { setError("タイトルを入力してください"); return; }
    if (!v.startDate)    { setError("開始日を入力してください"); return; }
    if (!v.endDate)      { setError("終了日を入力してください"); return; }
    if (v.endDate < v.startDate) { setError("終了日は開始日以降にしてください"); return; }
    setError(null);
    onSave({
      title: v.title.trim(),
      startDate: v.startDate,
      endDate: v.endDate,
      memo: v.memo.trim() || null,
      category: v.category || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#fff" }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #F0F0F0" }}>
          <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>施策を{initial.title ? "編集" : "追加"}</span>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: "#9CA3AF" }}><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>タイトル <span style={{ color: "#EF4444" }}>*</span></label>
            <input
              type="text"
              value={v.title}
              onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))}
              placeholder="施策名を入力"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid #E5E7EB", color: "#1A1A1A" }}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>カテゴリー</label>
            <div className="flex gap-2 flex-wrap">
              {CAMPAIGN_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setV((p) => ({ ...p, category: p.category === cat.value ? "" : cat.value }))}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                  style={
                    v.category === cat.value
                      ? { background: cat.bg, color: cat.color, border: `1.5px solid ${cat.color}` }
                      : { background: "#fff", color: "#6B7280", border: "1.5px solid #E5E7EB" }
                  }
                >
                  {cat.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setV((p) => ({ ...p, category: "" }))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                style={
                  !v.category
                    ? { background: "#1A1A1A", color: "#fff", border: "1.5px solid #1A1A1A" }
                    : { background: "#fff", color: "#6B7280", border: "1.5px solid #E5E7EB" }
                }
              >
                なし
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>開始日 <span style={{ color: "#EF4444" }}>*</span></label>
              <input
                type="date"
                value={v.startDate}
                onChange={(e) => setV((p) => ({ ...p, startDate: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid #E5E7EB", color: "#1A1A1A" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>終了日 <span style={{ color: "#EF4444" }}>*</span></label>
              <input
                type="date"
                value={v.endDate}
                onChange={(e) => setV((p) => ({ ...p, endDate: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid #E5E7EB", color: "#1A1A1A" }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7280" }}>メモ</label>
            <textarea
              value={v.memo}
              onChange={(e) => setV((p) => ({ ...p, memo: e.target.value }))}
              placeholder="施策の詳細・目的など"
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ border: "1px solid #E5E7EB", color: "#1A1A1A" }}
            />
          </div>
          {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: "1px solid #F0F0F0" }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#F3F4F6", color: "#374151" }}
          >キャンセル</button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: ACCENT, color: "#fff", opacity: isSaving ? 0.6 : 1 }}
          >
            <Check size={14} />
            {isSaving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline Bar ────────────────────────────────────────────────────
const BAR_COLORS = [
  "#6366F1", "#F59E0B", "#10B981", "#3B82F6", "#EC4899",
  "#8B5CF6", "#14B8A6", "#F97316", "#EF4444", "#84CC16",
];

function TimelineSection({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) return null;

  const allDates = campaigns.flatMap((c) => [c.startDate, c.endDate]);
  const minDate = new Date(allDates.reduce((a, b) => (a < b ? a : b)));
  const maxDate = new Date(allDates.reduce((a, b) => (a > b ? a : b)));

  const rangeStart = new Date(minDate); rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd   = new Date(maxDate); rangeEnd.setDate(rangeEnd.getDate() + 7);
  const totalDays  = Math.max(1, (rangeEnd.getTime() - rangeStart.getTime()) / 86400000);

  const pct = (d: string) => {
    const days = (new Date(d).getTime() - rangeStart.getTime()) / 86400000;
    return Math.max(0, Math.min(100, (days / totalDays) * 100));
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayPct = pct(today);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E7EB", background: "#fff" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid #F0F0F0" }}>
        <div className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>タイムライン</div>
        <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
          {fmt(rangeStart.toISOString().slice(0, 10))} 〜 {fmt(rangeEnd.toISOString().slice(0, 10))}
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {campaigns.map((c, i) => {
          const left = pct(c.startDate);
          const right = pct(c.endDate);
          const catStyle = getCategoryStyle(c.category);
          const color = c.category ? catStyle.color : BAR_COLORS[i % BAR_COLORS.length];
          return (
            <div key={c.id} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 shrink-0" style={{ width: 116 }}>
                {c.category && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: catStyle.bg, color: catStyle.color }}
                  >
                    {c.category}
                  </span>
                )}
                <div className="text-xs text-right truncate" style={{ color: "#6B7280", flex: 1 }} title={c.title}>
                  {c.title}
                </div>
              </div>
              <div className="flex-1 relative" style={{ height: 20 }}>
                <div className="absolute inset-0 rounded-full" style={{ background: "#F3F4F6" }} />
                <div
                  className="absolute top-0 bottom-0 rounded-full"
                  style={{ left: `${left}%`, width: `${Math.max(0.5, right - left)}%`, background: color, opacity: 0.85 }}
                />
                {todayPct >= 0 && todayPct <= 100 && (
                  <div
                    className="absolute top-0 bottom-0"
                    style={{ left: `${todayPct}%`, width: 1.5, background: "#EF4444", zIndex: 10 }}
                  />
                )}
              </div>
              <div className="text-[10px] shrink-0" style={{ color: "#9CA3AF", width: 80 }}>
                {fmt(c.startDate)} 〜
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "#9CA3AF", marginTop: 4 }}>
          <span className="inline-block w-2 rounded-full" style={{ height: 2, background: "#EF4444" }} />
          今日
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Card ───────────────────────────────────────────────────
function CampaignCard({
  campaign,
  color,
  onEdit,
  onDelete,
}: {
  campaign: Campaign;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isActive = campaign.startDate <= today && today <= campaign.endDate;
  const isPast   = campaign.endDate < today;
  const catStyle = getCategoryStyle(campaign.category);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E7EB", background: "#fff" }}>
      <div className="h-1.5" style={{ background: campaign.category ? catStyle.color : color }} />
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={
                  isActive
                    ? { background: "#D1FAE5", color: "#065F46" }
                    : isPast
                    ? { background: "#F3F4F6", color: "#9CA3AF" }
                    : { background: "#EEF2FF", color: "#4338CA" }
                }
              >
                {isActive ? "実施中" : isPast ? "終了" : "予定"}
              </span>
              {campaign.category && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: catStyle.bg, color: catStyle.color }}
                >
                  {campaign.category}
                </span>
              )}
            </div>
            <div className="text-sm font-semibold truncate" style={{ color: "#1A1A1A" }}>{campaign.title}</div>
            <div className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
              <CalendarDays size={11} className="inline mr-1" />
              {fmt(campaign.startDate)} 〜 {fmt(campaign.endDate)}
            </div>
            {campaign.memo && (
              <div className="text-xs mt-2 line-clamp-2" style={{ color: "#6B7280" }}>{campaign.memo}</div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-lg" style={{ color: "#9CA3AF", background: "#F9FAFB" }}><Pencil size={13} /></button>
            <button onClick={onDelete} className="p-1.5 rounded-lg" style={{ color: "#EF4444", background: "#FEF2F2" }}><Trash2 size={13} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListCampaigns();
  const campaigns = data?.campaigns ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const { mutate: create, isPending: isCreating } = useCreateCampaign({
    mutation: { onSuccess: () => { setModalOpen(false); invalidate(); } },
  });
  const { mutate: update, isPending: isUpdating } = useUpdateCampaign({
    mutation: { onSuccess: () => { closeModal(); invalidate(); } },
  });
  const { mutate: remove } = useDeleteCampaign({
    mutation: { onSuccess: invalidate },
  });

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit   = (c: Campaign) => { setEditTarget(c); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditTarget(null); };

  const handleSave = (input: CampaignInput) => {
    if (editTarget) update({ id: editTarget.id, input });
    else create(input);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("この施策を削除しますか？")) remove(id);
  };

  const sorted = [...campaigns].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = new Date().toISOString().slice(0, 10);
  const active   = sorted.filter((c) => c.startDate <= today && today <= c.endDate);
  const upcoming = sorted.filter((c) => c.startDate > today);
  const past     = sorted.filter((c) => c.endDate < today);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ background: "#F8F8F8" }}>
      <div className="px-6 py-4 shrink-0" style={{ borderBottom: "1px solid #EBEBEB", background: "#fff" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: "#1A1A1A" }}>施策カレンダー</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>施策の登録・管理。グラフに変更タイミングラインとして反映されます。</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: ACCENT, color: "#fff" }}
          >
            <Plus size={15} />
            施策を追加
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {isLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <TimelineSection campaigns={sorted} />
        )}

        {!isLoading && campaigns.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "実施中", count: active.length, color: "#10B981" },
              { label: "予定", count: upcoming.length, color: "#6366F1" },
              { label: "終了", count: past.length, color: "#9CA3AF" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-4 py-3 text-center" style={{ background: "#fff", border: "1px solid #E5E7EB" }}>
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</div>
                <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl flex flex-col items-center justify-center py-16 gap-3" style={{ border: "1px dashed #E5E7EB", background: "#fff" }}>
            <CalendarDays size={32} style={{ color: "#D1D5DB" }} />
            <div className="text-sm" style={{ color: "#9CA3AF" }}>施策がまだ登録されていません</div>
            <button
              onClick={openCreate}
              className="px-4 py-2 rounded-lg text-sm font-medium mt-1"
              style={{ background: ACCENT, color: "#fff" }}
            >最初の施策を追加</button>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section>
                <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: "#10B981" }}>実施中</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {active.map((c, i) => (
                    <CampaignCard key={c.id} campaign={c} color={BAR_COLORS[i % BAR_COLORS.length]} onEdit={() => openEdit(c)} onDelete={() => handleDelete(c.id)} />
                  ))}
                </div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: "#6366F1" }}>予定</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcoming.map((c, i) => (
                    <CampaignCard key={c.id} campaign={c} color={BAR_COLORS[i % BAR_COLORS.length]} onEdit={() => openEdit(c)} onDelete={() => handleDelete(c.id)} />
                  ))}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: "#9CA3AF" }}>終了</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {past.map((c, i) => (
                    <CampaignCard key={c.id} campaign={c} color={BAR_COLORS[i % BAR_COLORS.length]} onEdit={() => openEdit(c)} onDelete={() => handleDelete(c.id)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <CampaignFormModal
          initial={
            editTarget
              ? { title: editTarget.title, startDate: toInputDate(editTarget.startDate), endDate: toInputDate(editTarget.endDate), memo: editTarget.memo ?? "", category: editTarget.category ?? "" }
              : { title: "", startDate: "", endDate: "", memo: "", category: "" }
          }
          onSave={handleSave}
          onClose={closeModal}
          isSaving={isCreating || isUpdating}
        />
      )}
    </div>
  );
}
