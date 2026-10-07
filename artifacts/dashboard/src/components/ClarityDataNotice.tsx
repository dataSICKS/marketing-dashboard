import type { ClarityDeviceTab, ClarityPoint } from "@/lib/clarity-scroll";

interface ClarityNoticeData {
  pageViews: Partial<Record<string, number>>;
  points: readonly ClarityPoint[];
  excludedEmptyExports?: readonly { date: string; device: string }[];
}

export default function ClarityDataNotice({
  data, device, label,
}: {
  data?: ClarityNoticeData;
  device: ClarityDeviceTab;
  label: string;
}) {
  if (!data) return null;
  const devices = device === "合計" ? ["Desktop", "Mobile"] as const : [device];
  const messages = devices.flatMap((selectedDevice) => {
    const result: string[] = [];
    const dates = [...new Set((data.excludedEmptyExports ?? [])
      .filter((entry) => entry.device === selectedDevice)
      .map((entry) => entry.date.replace(/-/g, "/")))].sort();
    if (dates.length > 0) {
      result.push(`${label} ${selectedDevice}: ${dates.join("、")}のCSVが空のため、当日を除いた有効データのみで集計しています（期間全体の値ではありません）。`);
    }
    if (data.pageViews[selectedDevice] == null && data.points.some((point) =>
      point[selectedDevice === "Desktop" ? "desktop" : "mobile"] != null,
    )) {
      result.push(`${label} ${selectedDevice}: 訪問者数に対応するPVが未取得のため、到達率を表示できません。`);
    }
    return result;
  });
  if (messages.length === 0) return null;
  return (
    <div role="status" className="px-4 py-2 text-[11px] leading-relaxed" style={{ color: "#92400E", background: "#FFFBEB" }}>
      {messages.map((message) => <p key={message}>{message}</p>)}
    </div>
  );
}
