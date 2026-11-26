import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAuthConfig,
  useGetAuthMe,
  useEnrollTotp,
  useVerifyTotp,
  useVerifyBackupCode,
  getGetAuthConfigQueryKey,
  getGetAuthMeQueryKey,
  ApiError,
  type AuthMeResponse,
  type TotpEnrollResponse,
} from "@workspace/api-client-react";
import { BarChart2, ShieldCheck, KeyRound, Loader2, AlertTriangle } from "lucide-react";

const YELLOW = "#FBBF24";
const YELLOW_DARK = "#D97706";
const BORDER = "#EBEBEB";
const TEXT = "#1A1A1A";
const MUTED = "#6B7280";

/**
 * 画面側の門。
 *
 * ここは**体験のための出し分け**であって、保護そのものではない。
 * データ取得・更新APIはサーバー側の requireAuth で止めている。
 * （このファイルを書き換えてもデータは取れない、という作りにしてある）
 */

interface AuthContextValue {
  email: string | null;
  name: string | null;
  pictureUrl: string | null;
  backupCodesRemaining: number | null;
}

const AuthContext = createContext<AuthContextValue>({
  email: null,
  name: null,
  pictureUrl: null,
  backupCodesRemaining: null,
});

export function useAuthUser(): AuthContextValue {
  return useContext(AuthContext);
}

/** Googleのコールバックが `?auth_error=...` を付けて戻してくる。 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed:
    "このアカウントではログインできません。許可されたドメインのアカウントで入り直してください。",
  cancelled: "ログインを中断しました。",
  state_missing: "ログインの有効期限が切れました。もう一度お試しください。",
  state_mismatch: "ログインの検証に失敗しました。もう一度お試しください。",
  disabled: "このアカウントは利用停止になっています。",
  nonce_mismatch: "ログインの検証に失敗しました。もう一度お試しください。",
  email_unverified: "Googleで確認済みのメールアドレスが必要です。",
  expired: "ログインの有効期限が切れました。もう一度お試しください。",
  token_exchange_failed: "Googleとの通信に失敗しました。もう一度お試しください。",
  unexpected: "ログインに失敗しました。もう一度お試しください。",
};

function useAuthErrorFromUrl(): string | null {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth_error");
    if (!code) return;
    setMessage(AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.unexpected);
    // URLに残しておくと再読み込みで出続けるので消す
    params.delete("auth_error");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);
  return message;
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#F7F8FA", fontFamily: "'Inter','Noto Sans JP',sans-serif" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
      >
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: YELLOW }}
          >
            <BarChart2 size={16} color="#fff" />
          </div>
          <span className="text-sm font-bold" style={{ color: TEXT }}>
            Mail Analytics
          </span>
        </div>
        <h1 className="text-lg font-bold mb-2" style={{ color: TEXT }}>
          {title}
        </h1>
        {description && (
          <p className="text-sm mb-6 leading-relaxed" style={{ color: MUTED }}>
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#F7F8FA" }}
    >
      <Loader2 className="animate-spin" size={24} color={MUTED} />
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-3 mb-4 text-sm flex gap-2"
      style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}
    >
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  background: YELLOW,
  color: "#fff",
  fontWeight: 600,
};

/** 環境変数が足りていないとき。何を設定すれば良いかを画面に出す。 */
function NotConfiguredScreen({ missing }: { missing: string[] }) {
  return (
    <Shell
      title="認証が未設定です"
      description="ダッシュボードはログイン必須で動いています。次の環境変数を設定すると開けるようになります。"
    >
      <ul className="text-sm mb-4 space-y-1" style={{ color: TEXT }}>
        {missing.map((name) => (
          <li key={name} className="font-mono text-xs px-2 py-1 rounded" style={{ background: "#F3F4F6" }}>
            {name}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
        設定手順は <span className="font-mono">OPERATIONS.md</span> の「ログイン認証」にあります。
      </p>
    </Shell>
  );
}

function LoginScreen({ allowedDomains }: { allowedDomains: string[] }) {
  const authError = useAuthErrorFromUrl();
  return (
    <Shell
      title="ログイン"
      description="Googleアカウントでログインし、続けて認証アプリの6桁コードを入力します。"
    >
      {authError && <ErrorNote>{authError}</ErrorNote>}
      <a
        href="/api/auth/google/start"
        className="w-full h-11 rounded-lg flex items-center justify-center text-sm no-underline transition-opacity hover:opacity-90"
        style={primaryButtonStyle}
        data-testid="button-google-login"
      >
        Googleでログイン
      </a>
      {allowedDomains.length > 0 && (
        <p className="text-xs mt-4 leading-relaxed" style={{ color: MUTED }}>
          ログインできるのは {allowedDomains.join(" / ")} のアカウントだけです。
        </p>
      )}
    </Shell>
  );
}

/** 6桁コードの入力欄。書式の揺れはサーバー側でも吸収する。 */
function CodeInput({
  value,
  onChange,
  onSubmit,
  disabled,
  label,
  placeholder,
  maxLength,
  testId,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  label: string;
  placeholder: string;
  maxLength: number;
  testId: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold" style={{ color: MUTED }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        inputMode={maxLength === 6 ? "numeric" : "text"}
        autoComplete="one-time-code"
        autoFocus
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        data-testid={testId}
        className="w-full h-12 mt-1.5 rounded-lg px-3 text-center outline-none"
        style={{
          border: `1px solid ${BORDER}`,
          color: TEXT,
          fontSize: 20,
          letterSpacing: maxLength === 6 ? "0.4em" : "0.15em",
          fontVariantNumeric: "tabular-nums",
        }}
      />
    </label>
  );
}

function BackupCodesScreen({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <Shell
      title="バックアップコード"
      description="スマホを無くしたときの入口です。この10本は今だけ表示されます。印刷するかパスワード管理ツールに保存してください。1本につき1回だけ使えます。"
    >
      <div
        className="rounded-lg p-4 mb-4 grid grid-cols-2 gap-2 font-mono text-sm"
        style={{ background: "#F9FAFB", border: `1px solid ${BORDER}`, color: TEXT }}
        data-testid="text-backup-codes"
      >
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <label className="flex items-start gap-2 mb-4 text-sm cursor-pointer" style={{ color: TEXT }}>
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5"
          data-testid="checkbox-backup-saved"
        />
        <span>保存しました</span>
      </label>
      <button
        onClick={onDone}
        disabled={!saved}
        className="w-full h-11 rounded-lg text-sm transition-opacity"
        style={{ ...primaryButtonStyle, opacity: saved ? 1 : 0.5 }}
        data-testid="button-backup-done"
      >
        ダッシュボードへ
      </button>
    </Shell>
  );
}

function EnrollScreen({
  onEnrolled,
}: {
  onEnrolled: (codes: string[]) => void;
}) {
  const [enrollment, setEnrollment] = useState<TotpEnrollResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enroll = useEnrollTotp();
  const verify = useVerifyTotp();

  // 画面を開いた時点で仮シークレットを作る（登録確定は6桁コードが通ってから）
  useEffect(() => {
    let cancelled = false;
    enroll.mutateAsync().then(
      (data) => {
        if (!cancelled) setEnrollment(data);
      },
      (err: unknown) => {
        if (!cancelled) setError(readApiError(err, "認証アプリの登録を開始できませんでした"));
      },
    );
    return () => {
      cancelled = true;
    };
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (verify.isPending || code.trim().length === 0) return;
    setError(null);
    verify.mutateAsync({ data: { code } }).then(
      (data) => {
        onEnrolled(data.backupCodes ?? []);
      },
      (err: unknown) => {
        setError(readApiError(err, "コードが一致しません"));
        setCode("");
      },
    );
  };

  if (error && !enrollment) {
    return (
      <Shell title="認証アプリの登録">
        <ErrorNote>{error}</ErrorNote>
      </Shell>
    );
  }

  if (!enrollment) {
    return <FullScreenLoader />;
  }

  return (
    <Shell
      title="認証アプリを登録"
      description="Google Authenticator・1Password などの認証アプリに下のキーを手入力して登録し、表示された6桁コードを入れてください。"
    >
      <div className="mb-4">
        <span className="text-xs font-semibold" style={{ color: MUTED }}>
          セットアップキー
        </span>
        <div
          className="mt-1.5 rounded-lg px-3 py-3 font-mono text-sm break-all select-all"
          style={{ background: "#F9FAFB", border: `1px solid ${BORDER}`, color: TEXT, letterSpacing: "0.05em" }}
          data-testid="text-totp-secret"
        >
          {enrollment.secretFormatted}
        </div>
        <p className="text-xs mt-2 leading-relaxed" style={{ color: MUTED }}>
          アカウント名は <span className="font-mono">{enrollment.account}</span>、種類は「時間ベース」を選びます。
          スマホでこの画面を開いているなら{" "}
          <a href={enrollment.otpauthUri} style={{ color: YELLOW_DARK }}>
            このリンク
          </a>{" "}
          から直接登録できます。
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <CodeInput
        label="認証アプリの6桁コード"
        placeholder="000000"
        maxLength={6}
        value={code}
        onChange={setCode}
        onSubmit={submit}
        disabled={verify.isPending}
        testId="input-totp-code"
      />
      <button
        onClick={submit}
        disabled={verify.isPending || code.length === 0}
        className="w-full h-11 rounded-lg text-sm mt-4 flex items-center justify-center gap-2 transition-opacity"
        style={{ ...primaryButtonStyle, opacity: verify.isPending || code.length === 0 ? 0.5 : 1 }}
        data-testid="button-totp-submit"
      >
        {verify.isPending && <Loader2 size={16} className="animate-spin" />}
        登録して続ける
      </button>
    </Shell>
  );
}

function CodeScreen() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const verifyTotp = useVerifyTotp();
  const verifyBackup = useVerifyBackupCode();
  const pending = verifyTotp.isPending || verifyBackup.isPending;

  const submit = () => {
    if (pending || code.trim().length === 0) return;
    setError(null);
    const mutation = mode === "totp" ? verifyTotp : verifyBackup;
    mutation.mutateAsync({ data: { code } }).then(
      () => {
        queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
      },
      (err: unknown) => {
        setError(readApiError(err, "コードが一致しません"));
        setCode("");
      },
    );
  };

  return (
    <Shell
      title={mode === "totp" ? "認証アプリのコード" : "バックアップコード"}
      description={
        mode === "totp"
          ? "認証アプリに表示されている6桁のコードを入力してください。"
          : "登録時に保存した XXXX-XXXX 形式のコードを1本入力してください。使ったコードは無効になります。"
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <CodeInput
        label={mode === "totp" ? "6桁コード" : "バックアップコード"}
        placeholder={mode === "totp" ? "000000" : "XXXX-XXXX"}
        maxLength={mode === "totp" ? 6 : 9}
        value={code}
        onChange={setCode}
        onSubmit={submit}
        disabled={pending}
        testId={mode === "totp" ? "input-totp-code" : "input-backup-code"}
      />
      <button
        onClick={submit}
        disabled={pending || code.length === 0}
        className="w-full h-11 rounded-lg text-sm mt-4 flex items-center justify-center gap-2 transition-opacity"
        style={{ ...primaryButtonStyle, opacity: pending || code.length === 0 ? 0.5 : 1 }}
        data-testid="button-code-submit"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
        ログイン
      </button>
      <button
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp");
          setCode("");
          setError(null);
        }}
        className="w-full mt-3 text-xs flex items-center justify-center gap-1.5"
        style={{ color: MUTED }}
        data-testid="button-toggle-backup"
      >
        <KeyRound size={13} />
        {mode === "totp" ? "認証アプリが使えない（バックアップコードを使う）" : "認証アプリのコードを使う"}
      </button>
    </Shell>
  );
}

/** ApiErrorのJSON本文にあるメッセージを拾う。無ければ既定文。 */
function readApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string; retryAfterSeconds?: number } | null;
    if (data?.error) {
      if (data.retryAfterSeconds) {
        const minutes = Math.ceil(data.retryAfterSeconds / 60);
        return `${data.error}（あと約${minutes}分）`;
      }
      return data.error;
    }
  }
  return fallback;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [pendingBackupCodes, setPendingBackupCodes] = useState<string[] | null>(null);

  const config = useGetAuthConfig({
    query: { queryKey: getGetAuthConfigQueryKey(), retry: false, staleTime: 5 * 60 * 1000 },
  });
  const configured = config.data?.configured === true;

  const me = useGetAuthMe({
    query: {
      queryKey: getGetAuthMeQueryKey(),
      enabled: configured,
      retry: false,
      staleTime: 30 * 1000,
      // 開いたまま放置してセッションが切れた場合に、画面がログインへ戻るようにする
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  });

  const contextValue = useMemo<AuthContextValue>(() => {
    const data: AuthMeResponse | undefined = me.data;
    return {
      email: data?.email ?? null,
      name: data?.name ?? null,
      pictureUrl: data?.pictureUrl ?? null,
      backupCodesRemaining: data?.backupCodesRemaining ?? null,
    };
  }, [me.data]);

  if (config.isLoading) return <FullScreenLoader />;

  if (config.isError) {
    return (
      <Shell title="サーバーに接続できません" description="少し待ってから再読み込みしてください。">
        <ErrorNote>認証設定の取得に失敗しました。</ErrorNote>
      </Shell>
    );
  }

  if (!configured) {
    return <NotConfiguredScreen missing={config.data?.missing ?? []} />;
  }

  // 登録直後のバックアップコードは、控えるまで必ず表示する
  if (pendingBackupCodes) {
    return (
      <BackupCodesScreen
        codes={pendingBackupCodes}
        onDone={() => {
          setPendingBackupCodes(null);
          queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
        }}
      />
    );
  }

  if (me.isLoading) return <FullScreenLoader />;

  if (me.isError) {
    const status = me.error instanceof ApiError ? me.error.status : 0;
    if (status === 503) {
      const data = me.error instanceof ApiError ? (me.error.data as { missing?: string[] } | null) : null;
      return <NotConfiguredScreen missing={data?.missing ?? []} />;
    }
    return (
      <Shell title="サーバーに接続できません" description="少し待ってから再読み込みしてください。">
        <ErrorNote>ログイン状態の確認に失敗しました。</ErrorNote>
      </Shell>
    );
  }

  const state = me.data?.state ?? "unauthenticated";

  if (state === "unauthenticated") {
    return <LoginScreen allowedDomains={config.data?.allowedDomains ?? []} />;
  }
  if (state === "totp_setup") {
    return <EnrollScreen onEnrolled={(codes) => setPendingBackupCodes(codes)} />;
  }
  if (state === "totp_required") {
    return <CodeScreen />;
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
