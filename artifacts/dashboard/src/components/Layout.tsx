import { useState } from "react";
import { useLocation, Link } from "wouter";
import { BarChart2, Mail, MousePointerClick, Settings, Menu, X } from "lucide-react";

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: Mail, label: "メルマガ分析", href: "/" },
  { icon: MousePointerClick, label: "EFO CVRレポート", href: "/efo" },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col h-full bg-white" style={{ borderRight: "1px solid #EBEBEB" }}>
      <div className="px-5 h-14 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #EBEBEB" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: YELLOW }}>
            <BarChart2 size={14} color="#fff" />
          </div>
          <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>Mail Analytics</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: "#9CA3AF" }}>
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-semibold" style={{ color: "#BBBBBB", letterSpacing: "0.1em" }}>分析</div>
        {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm no-underline"
              style={active ? { background: YELLOW_LIGHT, color: YELLOW_DARK, fontWeight: 600 } : { color: "#6B7280" }}
            >
              <Icon size={16} color={active ? YELLOW_DARK : "#9CA3AF"} />
              {label}
            </Link>
          );
        })}
        <div className="px-3 py-2 text-[10px] font-semibold mt-2" style={{ color: "#BBBBBB", letterSpacing: "0.1em" }}>設定</div>
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm" style={{ color: "#6B7280" }}>
          <Settings size={16} color="#9CA3AF" />
          設定
        </div>
      </nav>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter','Noto Sans JP',sans-serif", background: "#F7F8FA" }}>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col" style={{ minHeight: "100vh" }}>
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setDrawerOpen(false)} />
          <div className="relative w-64 h-full z-10 shadow-xl">
            <SidebarContent onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content area — pages render their own header + body */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile menu button injected at top-left */}
        <button
          className="md:hidden absolute top-3.5 left-4 z-40 p-1.5 rounded-lg"
          style={{ color: "#6B7280" }}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
