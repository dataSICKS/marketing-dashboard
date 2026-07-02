import { useState } from "react";
import { useLocation, Link } from "wouter";
import { BarChart2, Mail, MousePointerClick, Settings, Menu, X, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

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
  { icon: CalendarDays, label: "施策カレンダー", href: "/campaigns" },
];

function SidebarContent({ collapsed, onToggleCollapse, onClose }: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col h-full" style={{ background: "#fff", borderRight: "1px solid #EBEBEB" }}>
      {/* Header */}
      <div
        className="h-14 flex items-center shrink-0"
        style={{
          borderBottom: "1px solid #EBEBEB",
          padding: collapsed ? "0 0 0 0" : "0 12px 0 16px",
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: YELLOW }}>
              <BarChart2 size={14} color="#fff" />
            </div>
            <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>Mail Analytics</span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: YELLOW }}>
            <BarChart2 size={14} color="#fff" />
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md transition-colors"
            style={{ color: "#6B7280" }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: "#6B7280" }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <div className="px-3 py-2 text-[10px] font-semibold" style={{ color: "#BBBBBB", letterSpacing: "0.1em" }}>分析</div>
        )}
        {collapsed && <div className="h-7" />}
        {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              title={collapsed ? label : undefined}
              className="flex items-center rounded-lg cursor-pointer transition-all text-sm no-underline"
              style={{
                gap: collapsed ? 0 : 10,
                padding: collapsed ? "10px 0" : "8px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: active ? (collapsed ? "rgba(251,191,36,0.15)" : YELLOW_LIGHT) : "transparent",
                color: active ? YELLOW_DARK : "#374151",
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={16} color={active ? YELLOW_DARK : "#9CA3AF"} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {!collapsed && (
          <div className="px-3 py-2 text-[10px] font-semibold mt-2" style={{ color: "#BBBBBB", letterSpacing: "0.1em" }}>設定</div>
        )}
        {collapsed && <div className="mt-2" />}
        <div
          className="flex items-center rounded-lg cursor-pointer text-sm"
          style={{
            gap: collapsed ? 0 : 10,
            padding: collapsed ? "10px 0" : "8px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            color: "#6B7280",
          }}
          title={collapsed ? "設定" : undefined}
        >
          <Settings size={16} color="#9CA3AF" />
          {!collapsed && <span>設定</span>}
        </div>
      </nav>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter','Noto Sans JP',sans-serif", background: "#F7F8FA" }}>

      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex shrink-0 flex-col transition-all duration-200"
        style={{ width: collapsed ? 52 : 224, minHeight: "100vh" }}
      >
        <div className="sticky top-0 h-screen">
          <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)} />
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
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
