import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, Check } from "lucide-react";

interface Props {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  accentColor?: string;
}

export default function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = "全体",
  accentColor = "#6366F1",
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        popoverRef.current && !popoverRef.current.contains(t)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openDropdown() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popupWidth = Math.max(rect.width, 260);
      const left = Math.min(rect.left, window.innerWidth - popupWidth - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left), width: rect.width });
    }
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
        onClick={openDropdown}
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
            maxHeight: 320,
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
              <div className="px-4 py-3 text-xs text-center" style={{ color: "#9CA3AF" }}>見つかりません</div>
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
