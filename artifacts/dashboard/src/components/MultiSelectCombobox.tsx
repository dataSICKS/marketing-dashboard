import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, Check } from "lucide-react";

interface Props {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  accentColor?: string;
  /** 候補が1件も無いときの文言。読み込み中や取得失敗を黙って「見つかりません」にしないため。 */
  emptyMessage?: string;
}

const POPOVER_MAX_HEIGHT = 320;

export default function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = "全体",
  accentColor = "#6366F1",
  emptyMessage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  /** トリガーの位置に合わせてポップオーバーを置く。下に入らなければ上に出す。 */
  const reposition = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const popupWidth = Math.max(rect.width, 260);
    const left = Math.min(rect.left, window.innerWidth - popupWidth - 8);
    const below = window.innerHeight - rect.bottom;
    // 下に 320px 入らず、かつ上の方が広いなら上側に出す（画面外に描画されて「消えた」ように見えるのを防ぐ）
    const flip = below < POPOVER_MAX_HEIGHT && rect.top > below;
    const top = flip
      ? Math.max(8, rect.top - Math.min(POPOVER_MAX_HEIGHT, rect.top - 8) - 4)
      : rect.bottom + 4;
    setPos({ top, left: Math.max(8, left), width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return;

    const isInside = (event: Event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const target = event.target as Node | null;
      for (const node of [triggerRef.current, popoverRef.current]) {
        if (!node) continue;
        if (path.includes(node)) return true;
        if (target && node.contains(target)) return true;
      }
      return false;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    // 開く操作そのものがこのリスナーに届いて即座に閉じるのを防ぐため、次のタスクから購読する。
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    document.addEventListener("keydown", onKeyDown);
    // スクロールや画面サイズ変更で position:fixed のポップオーバーだけ取り残されないようにする。
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, close, reposition]);

  /** トリガーは開く専用ではなくトグル。閉じられずに固まるのを防ぐ。 */
  function toggleDropdown() {
    if (open) {
      close();
      return;
    }
    reposition();
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function remove(value: string, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const accentLight = `${accentColor}18`;

  return (
    <div ref={triggerRef} className="w-full">
      {/* Trigger */}
      <div
        onClick={toggleDropdown}
        className="w-full min-h-[34px] text-xs px-2 py-1.5 rounded-md cursor-pointer flex items-start gap-1 flex-wrap"
        style={{
          border: `1px solid ${open ? accentColor : "#E5E7EB"}`,
          background: open ? accentLight : "#F9FAFB",
        }}
      >
        {selected.length === 0 ? (
          <span className="flex-1 leading-5" style={{ color: "#9CA3AF" }}>{placeholder}</span>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 flex-1">
              {selected.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium max-w-[180px]"
                  style={{ background: accentLight, color: accentColor, border: `1px solid ${accentColor}30` }}
                >
                  <span className="truncate">{v}</span>
                  <button
                    onClick={(e) => remove(v, e)}
                    className="shrink-0 hover:opacity-70"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <button onClick={clearAll} className="shrink-0 self-center hover:opacity-70" style={{ color: "#9CA3AF" }}>
              <X size={12} />
            </button>
          </>
        )}
        <ChevronDown
          size={12}
          color="#9CA3AF"
          style={{ marginLeft: "auto", alignSelf: "center", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </div>

      {/* Dropdown via portal */}
      {open && createPortal(
        <div
          ref={popoverRef}
          className="bg-white rounded-xl shadow-2xl"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: Math.max(pos.width, 260),
            zIndex: 9999,
            border: "1px solid #E5E7EB",
            maxHeight: POPOVER_MAX_HEIGHT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Search input */}
          <div className="px-3 pt-3 pb-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              <Search size={12} color="#9CA3AF" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="検索..."
                className="flex-1 text-xs outline-none bg-transparent"
                style={{ color: "#374151" }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="hover:opacity-70">
                  <X size={11} color="#9CA3AF" />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-center" style={{ color: "#9CA3AF" }}>
                {options.length === 0 ? (emptyMessage ?? "候補がありません") : "見つかりません"}
              </div>
            ) : (
              <>
                {/* Select all / clear */}
                {options.length > 1 && !search && (
                  <div className="px-3 py-1.5" style={{ borderBottom: "1px solid #F9FAFB" }}>
                    <button
                      onClick={() => onChange(selected.length === options.length ? [] : options)}
                      className="text-[10px] font-medium"
                      style={{ color: accentColor }}
                    >
                      {selected.length === options.length ? "すべて解除" : "すべて選択"}
                    </button>
                  </div>
                )}
                {filtered.map((opt) => {
                  const isSelected = selected.includes(opt);
                  return (
                    <div
                      key={opt}
                      onClick={() => toggle(opt)}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer text-xs hover:bg-gray-50"
                      style={{ color: isSelected ? accentColor : "#374151" }}
                    >
                      <div
                        className="shrink-0 w-4 h-4 rounded flex items-center justify-center"
                        style={{
                          border: `1.5px solid ${isSelected ? accentColor : "#D1D5DB"}`,
                          background: isSelected ? accentColor : "#fff",
                        }}
                      >
                        {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
                      </div>
                      <span className="flex-1 leading-4">{opt}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer */}
          {selected.length > 0 && (
            <div className="px-3 py-2 text-[10px]" style={{ borderTop: "1px solid #F3F4F6", color: "#9CA3AF" }}>
              {selected.length}件選択中
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
