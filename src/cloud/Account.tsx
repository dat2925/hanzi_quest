import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { Panda } from "../Art";
import { load, initial, progressSchema, STORAGE_KEY } from "../progress";
import { supabase, cloudConfigured, embedded, appUrl } from "./client";
import { SyncManager } from "./sync";
import { accountTransport } from "./service";
import { operation } from "./operations";
import type { Progress } from "../progress";
import { loadCurriculum } from "./curriculum";
import { installCurriculum } from "../data";
import { gameSnapshotSchema } from "../game-state";
import { openStandalone } from "../bridge";
import {
  CurriculumError,
  safeErrorMessage,
  logCurriculumError,
} from "./curriculum-data";
type Account = {
  manager: SyncManager | null;
  email: string;
  login: () => void;
  logout: () => Promise<void>;
};
const Context = createContext<Account>({
  manager: null,
  email: "",
  login: () => {},
  logout: async () => {},
});
export const useAccount = () => useContext(Context);
export function authMessage(message: string) {
  if (/invalid login/i.test(message)) return "Email hoặc mật khẩu chưa đúng.";
  if (/email not confirmed/i.test(message))
    return "Hãy xác nhận email trước khi đăng nhập.";
  if (/already registered|already been registered/i.test(message))
    return "Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.";
  if (/rate limit|too many/i.test(message))
    return "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.";
  if (/fetch|network/i.test(message))
    return "Không kết nối được. Kiểm tra mạng rồi thử lại.";
  return "Chưa thực hiện được yêu cầu. " + message;
}
function AuthForm({
  recovery = false,
  onDone,
  onGuest,
}: {
  recovery?: boolean;
  onDone: () => void;
  onGuest: () => void;
}) {
  const [mode, setMode] = useState(recovery ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const change = (next: string) => {
    setMode(next);
    setPassword("");
    setConfirm("");
    setMessage("");
  };
  if (embedded)
    return (
      <div className="auth-shell">
        <section className="card auth-card">
          <Panda />
          <h1>Tài khoản HanziOne</h1>
          <p>
            Đăng nhập và đồng bộ trong website độc lập. Phiên Supabase không
            được chuyển qua iframe hoặc tài khoản ChatGPT.
          </p>
          <button
            className="primary"
            onClick={() =>
              void openStandalone(appUrl).catch((error) =>
                logCurriculumError(error, "open-standalone"),
              )
            }
          >
            Mở website để đăng nhập
          </button>
          <button className="secondary" onClick={onGuest}>
            Học local trong khung này
          </button>
        </section>
      </div>
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if ((mode === "signup" || mode === "reset") && password !== confirm) {
      setMessage("Hai mật khẩu chưa khớp.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase!.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onDone();
      }
      if (mode === "signup") {
        const { data, error } = await supabase!.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: appUrl + "/",
          },
        });
        if (error) throw error;
        if (data.session) onDone();
        else
          setMessage(
            "Hãy mở email xác nhận, sau đó quay lại đăng nhập. Nếu email đã có tài khoản, hãy dùng Đăng nhập hoặc Quên mật khẩu.",
          );
      }
      if (mode === "forgot") {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: appUrl + "/?auth=recovery",
        });
        if (error) throw error;
        setMessage(
          "Nếu email có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Mở liên kết trong trình duyệt vừa gửi yêu cầu.",
        );
      }
      if (mode === "reset") {
        const { error } = await supabase!.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState(null, "", window.location.pathname);
        onDone();
      }
    } catch (e) {
      setMessage(authMessage(e instanceof Error ? e.message : "Lỗi xác thực."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <Panda />
        <span className="eyebrow">HANZIONE · CÙNG BAO TIẾN BỘ</span>
        <h1>
          {mode === "signup"
            ? "Tạo tài khoản"
            : mode === "forgot"
              ? "Quên mật khẩu"
              : mode === "reset"
                ? "Đặt mật khẩu mới"
                : "Chào mừng bạn trở lại"}
        </h1>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Tên hiển thị
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Mật khẩu
              <input
                required
                type="password"
                minLength={mode === "login" ? 1 : 8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
          )}
          {(mode === "signup" || mode === "reset") && (
            <label>
              Nhập lại mật khẩu
              <input
                required
                type="password"
                minLength={8}
                maxLength={72}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}
          <p role="status">{message}</p>
          <button disabled={busy} className="primary" type="submit">
            {busy
              ? "Đang xử lý…"
              : mode === "signup"
                ? "Đăng ký"
                : mode === "forgot"
                  ? "Gửi email đặt lại"
                  : mode === "reset"
                    ? "Lưu mật khẩu mới"
                    : "Đăng nhập"}
          </button>
        </form>
        {mode !== "reset" && (
          <div className="auth-links">
            <button
              className="text-button"
              onClick={() => change(mode === "signup" ? "login" : "signup")}
            >
              {mode === "signup"
                ? "Đã có tài khoản? Đăng nhập"
                : "Tạo tài khoản"}
            </button>
            <button
              className="text-button"
              onClick={() => change(mode === "forgot" ? "login" : "forgot")}
            >
              {mode === "forgot" ? "Quay lại đăng nhập" : "Quên mật khẩu"}
            </button>
            <button className="secondary" onClick={onGuest}>
              Học không có tài khoản
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
export function AccountGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(cloudConfigured && !embedded);
  const [guest, setGuest] = useState(!cloudConfigured);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase || embedded) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setSession(data.session);
          setLoading(false);
          if (error) setError(authMessage(error.message));
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setError(
            "Không đọc được phiên đăng nhập. Kiểm tra quyền lưu trữ của trình duyệt.",
          );
        }
      });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_IN") setGuest(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const login = () => setGuest(false);
  async function logout() {
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error) throw error;
    setSession(null);
    setGuest(false);
  }
  if (loading)
    return (
      <div className="auth-shell" role="status">
        Đang khôi phục phiên đăng nhập…
      </div>
    );
  if (error)
    return (
      <div className="auth-shell">
        <section className="card auth-card">
          <p role="alert">{error}</p>
          <button
            className="secondary"
            onClick={() => window.location.reload()}
          >
            Thử lại
          </button>
        </section>
      </div>
    );
  if (recovery || (!session && !guest))
    return (
      <AuthForm
        recovery={recovery}
        onDone={() => setRecovery(false)}
        onGuest={() => setGuest(true)}
      />
    );
  if (session)
    return (
      <SignedAccount
        key={session.user.id}
        email={session.user.email || ""}
        userId={session.user.id}
        login={login}
        logout={logout}
      >
        {children}
      </SignedAccount>
    );
  return (
    <Context.Provider value={{ manager: null, email: "", login, logout }}>
      {children}
    </Context.Provider>
  );
}
function SignedAccount({
  children,
  userId,
  email,
  login,
  logout,
}: {
  children: ReactNode;
  userId: string;
  email: string;
  login: () => void;
  logout: () => Promise<void>;
}) {
  const [, render] = useState(0);
  const [curriculumReady, setCurriculumReady] = useState(false);
  const [curriculumError, setCurriculumError] = useState("");
  const [manager] = useState(
    () =>
      new SyncManager(
        userId,
        accountTransport(userId),
        {
          getItem: (k) => localStorage.getItem(k),
          setItem: (k, v) => localStorage.setItem(k, v),
        },
        () => render((n) => n + 1),
        () => navigator.onLine,
      ),
  );
  useEffect(() => {
    manager.start();
    const retry = () => void manager.flush();
    const unload = (e: BeforeUnloadEvent) => {
      if (manager.queue.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    window.addEventListener("beforeunload", unload);
    return () => {
      manager.stop();
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      window.removeEventListener("beforeunload", unload);
    };
  }, [manager]);
  useEffect(() => {
    let active = true;
    void loadCurriculum()
      .then((lessons) => {
        if (!active) return;
        try {
          localStorage.setItem("hanzi-curriculum-v1", JSON.stringify(lessons));
        } catch {
          /* Curriculum can still be used in memory. */
        }
        if (active) setCurriculumReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        logCurriculumError(error);
        try {
          const cached = JSON.parse(
            localStorage.getItem("hanzi-curriculum-v1") || "null",
          );
          const parsed = gameSnapshotSchema.shape.lesson
            .array()
            .min(1)
            .safeParse(cached);
          if (!parsed.success)
            throw new CurriculumError(
              "cache",
              `Cache không hợp lệ: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
            );
          installCurriculum(parsed.data);
          setCurriculumReady(true);
        } catch (cacheError) {
          logCurriculumError(cacheError, "cache");
          setCurriculumError(
            `Không tải được giáo trình: ${safeErrorMessage(error)} Cache không dùng được: ${safeErrorMessage(cacheError)}`,
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (manager.status !== "loading" && manager.status !== "saving")
      setReady(true);
  }, [manager.status]);
  if (curriculumError)
    return (
      <div className="auth-shell">
        <section className="card auth-card">
          <p role="alert">{curriculumError}</p>
          <button
            className="secondary"
            onClick={() => window.location.reload()}
          >
            Thử lại
          </button>
          <button className="secondary" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </section>
      </div>
    );
  if (!manager.hasLoaded && ["error", "offline"].includes(manager.status))
    return (
      <div className="auth-shell">
        <section className="card auth-card">
          <p role="alert">
            Chưa tải được dữ liệu tài khoản và chưa có cache riêng. Kiểm tra
            migrations hoặc mạng trước khi học.
          </p>
          <button className="secondary" onClick={() => void manager.flush()}>
            Thử đồng bộ lại
          </button>
          <button className="secondary" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </section>
      </div>
    );
  if (!ready || !curriculumReady)
    return (
      <div className="auth-shell" role="status">
        Đang tải tiến độ tài khoản…
      </div>
    );
  return (
    <Context.Provider value={{ manager, email, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export function SyncBanner() {
  const { manager } = useAccount();
  if (!manager) return null;
  const labels = {
    loading: "Đang tải",
    saving: "Đang đồng bộ",
    saved: "Đã đồng bộ",
    offline: "Ngoại tuyến · tiến độ chờ đồng bộ",
    error: "Chưa đồng bộ được",
    conflict: "Ghi chú đã thay đổi trên thiết bị khác",
  };
  return (
    <div className={"sync-banner " + manager.status} role="status">
      {labels[manager.status]}
      {manager.queue.length > 0
        ? ` · ${manager.queue.length} thay đổi đang chờ`
        : ""}
      {manager.status === "error" && <span>{manager.error}</span>}
      {["error", "offline"].includes(manager.status) && (
        <button className="text-button" onClick={() => void manager.flush()}>
          Thử đồng bộ lại
        </button>
      )}
      {manager.status === "conflict" && (
        <>
          <p>
            Ghi chú trên máy được giữ trong bản sao. Xuất bản sao trong Cài đặt
            trước khi chọn.
          </p>
          <button
            className="secondary"
            onClick={() => void manager.resolveNote(false).catch(() => {})}
          >
            Dùng ghi chú trên server
          </button>
          <button
            className="secondary"
            onClick={() => void manager.resolveNote(true).catch(() => {})}
          >
            Giữ ghi chú trên máy
          </button>
        </>
      )}
    </div>
  );
}
function download(value: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AccountSettings() {
  const { manager, email, login, logout } = useAccount();
  const [message, setMessage] = useState("");
  const [legacy, setLegacy] = useState<Progress | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    try {
      const parsed = progressSchema.safeParse(
        JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
      );
      if (
        parsed.success &&
        JSON.stringify(parsed.data) !== JSON.stringify(initial)
      )
        setLegacy(parsed.data);
    } catch {
      /* No valid legacy data. */
    }
  }, []);
  async function migrate() {
    if (!manager || !legacy) return;
    try {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(legacy)),
      );
      const sourceId = [...new Uint8Array(bytes)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      manager.enqueue([operation("legacy", { sourceId, data: legacy })]);
      setPreview(false);
      setMessage(
        "Bản chuyển đang chờ server xác nhận. Dữ liệu local vẫn được giữ nguyên.",
      );
      void manager.flush();
    } catch {
      setMessage("Không tạo được bản chuyển. Hãy xuất backup và thử lại.");
    }
  }
  return (
    <section className="account-settings">
      <h3>Tài khoản & đồng bộ</h3>
      <p>
        {manager
          ? email
          : cloudConfigured
            ? "Bạn đang học local trên thiết bị này."
            : "Chưa cấu hình Supabase. Các tính năng local vẫn hoạt động."}
      </p>
      {manager ? (
        <>
          <button
            className="secondary"
            onClick={() =>
              download(manager.export(), "hanzi-account-backup.json")
            }
          >
            Xuất backup và hàng đợi
          </button>
          <button
            className="secondary"
            onClick={() => {
              if (
                manager.queue.length &&
                !window.confirm(
                  "Có tiến độ chưa đồng bộ. Backup vẫn giữ trên máy cho tài khoản này. Bạn muốn đăng xuất?",
                )
              )
                return;
              void logout().catch((e) => setMessage(authMessage(e.message)));
            }}
          >
            Đăng xuất
          </button>
          {legacy && (
            <button
              className="secondary"
              disabled={
                manager.legacyPending ||
                manager.legacyStatus === "approved" ||
                manager.queue.some((o) => o.kind === "legacy")
              }
              onClick={() => setPreview(true)}
            >
              {manager.legacyStatus === "approved"
                ? "Đã chuyển và duyệt tiến độ cũ"
                : manager.legacyPending
                  ? "Server đã nhận · thành tích cũ chờ duyệt"
                  : "Chuyển tiến độ hiện tại lên tài khoản"}
            </button>
          )}
          {preview && (
            <div className="note-box">
              <p>
                Bản local: {legacy!.name} · {legacy!.xp} XP ·{" "}
                {legacy!.completed.length} bài · {legacy!.history.length} phiên
                · {Object.keys(legacy!.reviews).length} từ ôn.
              </p>
              <p>
                Ghi chú trên server được ưu tiên. XP, lịch sử, bài hoàn thành và
                lịch ôn cũ được lưu nguyên trong hồ sơ chuyển, cần quản trị
                duyệt vì không có bằng chứng đáp án. Chỉ từ khó và ghi chú trống
                được hợp nhất tự động.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  download(
                    JSON.stringify(legacy, null, 2),
                    "hanzi-legacy-backup.json",
                  )
                }
              >
                Xuất backup local
              </button>
              <button className="primary" onClick={() => void migrate()}>
                Xác nhận dữ liệu này là của tôi
              </button>
              <button className="text-button" onClick={() => setPreview(false)}>
                Hủy
              </button>
            </div>
          )}
        </>
      ) : (
        cloudConfigured && (
          <button className="primary" onClick={login}>
            Đăng nhập / Đăng ký
          </button>
        )
      )}
      <p role="status">{message}</p>
    </section>
  );
}
