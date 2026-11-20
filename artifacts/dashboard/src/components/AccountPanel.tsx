import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLogout,
  useRegenerateBackupCodes,
  getGetAuthMeQueryKey,
} from "@workspace/api-client-react";
import { LogOut, KeyRound, X } from "lucide-react";
import { useAuthUser } from "@/components/AuthGate";

const BORDER = "#EBEBEB";
const TEXT = "#1A1A1A";
const MUTED = "#6B7280";
const YELLOW = "#FBBF24";

/** サイドバー下部の「誰でログインしているか」とログアウト。 */
export default function AccountPanel({ collapsed }: { collapsed?: boolean }) {
  const { email, name, backupCodesRemaining } = useAuthUser();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const regenerate = useRegenerateBackupCodes();
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  if (!email) return null;

  const initial = (name ?? email).trim().charAt(0).toUpperCase();

  const signOut = () => {
    logout.mutateAsync({ data: {} }).finally(() => {
      queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
    });
  };

  if (collapsed) {
    return (
      <div className="p-2 shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={signOut}
          title={`${email} からログアウト`}
          className="w-full flex items-center justify-center py-2 rounded-lg"
          style={{ color: MUTED }}
          data-testid="button-logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
          style={{ background: "#F3F4F6", color: TEXT }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: TEXT }} data-testid="text-account-email">
            {name || email}
          </div>
          {name && (
            <div className="text-[10px] truncate" style={{ color: MUTED }}>
              {email}
            </div>
          )}
        </div>
      </div>

      {typeof backupCodesRemaining === "number" && backupCodesRemaining <= 3 && (
        <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#B45309" }}>
          バックアップコードの残りが{backupCodesRemaining}本です。作り直しておいてください。
        </p>
      )}

      <button
        onClick={() => {
          regenerate.mutateAsync().then(
            (data) => {
              setNewCodes(data.backupCodes);
              queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
            },
            () => setNewCodes(null),
          );
        }}
        disabled={regenerate.isPending}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px]"
        style={{ color: MUTED }}
        data-testid="button-regenerate-backup-codes"
      >
        <KeyRound size={12} />
        バックアップコードを作り直す
      </button>
      <button
        onClick={signOut}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px]"
        style={{ color: MUTED }}
        data-testid="button-logout"
      >
        <LogOut size={12} />
        ログアウト
      </button>

      {newCodes && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "#fff", border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-base font-bold" style={{ color: TEXT }}>
                新しいバックアップコード
              </h2>
              <button onClick={() => setNewCodes(null)} style={{ color: MUTED }} data-testid="button-close-codes">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: MUTED }}>
              古いコードはすべて無効になりました。この10本は今だけ表示されます。
            </p>
            <div
              className="rounded-lg p-4 grid grid-cols-2 gap-2 font-mono text-sm mb-4"
              style={{ background: "#F9FAFB", border: `1px solid ${BORDER}`, color: TEXT }}
              data-testid="text-new-backup-codes"
            >
              {newCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <button
              onClick={() => setNewCodes(null)}
              className="w-full h-10 rounded-lg text-sm"
              style={{ background: YELLOW, color: "#fff", fontWeight: 600 }}
              data-testid="button-codes-done"
            >
              保存しました
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
