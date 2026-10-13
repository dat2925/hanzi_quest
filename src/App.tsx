import { demo } from "./learning/demo";
import { lesson1a } from "./learning/book1";
import { lesson1b } from "./learning/book1b";
import { lesson1c } from "./learning/book1c";
import { CourseJourney } from "./learning/CourseJourney";
import { LearningWorkspace } from "./learning/LearningWorkspace";
import { useLearningNavigation } from "./learning/navigation";
import { AdminCurriculumLink } from "./admin/AdminCurriculum";
import { AdminPlatform } from "./admin/AdminPlatform";
import { RecallCards } from "./learning/RecallCards";
import { useEffect, useRef, useState } from "react";
import {
  Home,
  Map,
  Gamepad2,
  BookOpen,
  BarChart3,
  Settings,
  Flame,
  Zap,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Check,
  Lock,
  Star,
  Clock,
  Target,
  Sun,
  Moon,
  Volume2,
  Leaf,
  Headphones,
  Languages,
  Pencil,
  Layers,
  Shuffle,
  RotateCcw,
  Flag,
  GraduationCap,
  Sparkles,
  X,
  Download,
  Maximize2,
} from "lucide-react";
import { lessons as catalog, allWords as words, type Lesson } from "./data";
import {
  load,
  streak,
  dateKey,
  canStudy,
  STORAGE_KEY,
  initial,
  schedule,
  type Progress,
} from "./progress";
import { speak, WritingPad } from "./Game";
import { ProductCredit } from "./ProductCredit";
import { Panda, Landscape } from "./Art";
import { connectHost } from "./bridge";
import { useAccount, AccountSettings, SyncBanner } from "./cloud/Account";
import { patchOperations, operation } from "./cloud/operations";
const nav = [
  { id: "home", label: "Tổng quan", icon: Home },
  { id: "path", label: "Hành trình", icon: Map },
  { id: "practice", label: "Luyện tập", icon: Gamepad2 },
  { id: "notebook", label: "Sổ tay", icon: BookOpen },
  { id: "stats", label: "Thống kê", icon: BarChart3 },
];
function Meter({ value, max = 100 }: { value: number; max?: number }) {
  return (
    <div className="progress">
      <i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}
function SectionTitle({
  children,
  action,
  onClick,
}: {
  children: React.ReactNode;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action} <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export default function App() {
  const account = useAccount();
  const [, refreshCurriculum] = useState(0);
  const bundled = [lesson1a, lesson1b, lesson1c, demo];
  const lessons = [
    ...bundled.filter((b) => !catalog.some((l) => l.id === b.id)),
    ...catalog,
  ].sort((a, b) => Number(!a.learning) - Number(!b.learning));
  const ids = lessons.map((l) => l.id);
  const manager = account.manager;
  const [p, setP] = useState(() => (manager ? manager.progress : load()));
  useEffect(() => {
    if (manager) setP(manager.progress);
  }, [manager?.progress]);
  useEffect(() => {
    if (manager && !manager.progress.onboarded) setOnboard(true);
  }, [manager]);
  const [page, setPage] = useState(() =>
    new URLSearchParams(window.location.search).has("admin")
      ? "admin"
      : new URLSearchParams(window.location.search).get("page") || "home",
  );
  const learning = useLearningNavigation(setPage);
  const previewOwner = useRef(manager?.userId);
  useEffect(() => {
    if (previewOwner.current !== manager?.userId) {
      learning.invalidatePreviews();
      previewOwner.current = manager?.userId;
    }
  }, [manager?.userId]);
  useEffect(() => {
    const revokePreview = () => learning.invalidatePreviews();
    window.addEventListener("hanzi-admin-access-lost", revokePreview);
    return () =>
      window.removeEventListener("hanzi-admin-access-lost", revokePreview);
  }, []);
  const openPreview = (lesson: Lesson) =>
    learning.open(lesson, "preview", page);
  const [onboard, setOnboard] = useState(false);
  const [message, setMessage] = useState("");
  const [host, setHost] =
    useState<Awaited<ReturnType<typeof connectHost>>>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flashMode, setFlashMode] = useState(false);
  const [writeMode, setWriteMode] = useState(false);
  const [recallLesson, setRecallLesson] = useState<Lesson | null>(null);
  const [now, setNow] = useState(Date.now());
  function patch(next: Partial<Progress>) {
    try {
      if (manager) manager.enqueue(patchOperations(p, next));
      const updated = { ...p, ...next };
      setP(updated);
      manager?.setLocal(updated);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không lưu được thay đổi.",
      );
    }
  }
  useEffect(() => {
    if (!onboard) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const surfaces = [
      ...document.querySelectorAll<HTMLElement>(
        ".app-shell > .sidebar,.main-shell,.bottom-nav",
      ),
    ];
    surfaces.forEach((el) => {
      el.inert = true;
    });
    const focusables = () =>
      [
        ...(dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,summary,[tabindex="0"]',
        ) || []),
      ].filter((el) => el.getClientRects().length);
    focusables()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOnboard(false);
      }
      if (e.key !== "Tab") return;
      const elements = focusables();
      const first = elements[0];
      const last = elements.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !dialog?.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !dialog?.contains(document.activeElement))
      ) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      surfaces.forEach((el) => {
        el.inert = false;
      });
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [onboard]);
  useEffect(() => {
    try {
      if (!manager) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      setMessage(
        "Không lưu được tiến độ trên trình duyệt này. Hãy xuất dữ liệu trong Cài đặt.",
      );
    }
    document.documentElement.dataset.theme = p.dark ? "dark" : "light";
  }, [p]);
  useEffect(() => {
    let active = true;
    let connected: Awaited<ReturnType<typeof connectHost>>;
    void connectHost(
      (id) => {
        const lesson = lessons.find((l) => l.id === id);
        if (lesson) openPreview(lesson);
      },
      (dark) => setP((old) => ({ ...old, dark })),
    ).then((app) => {
      connected = app;
      if (active) setHost(app);
      else void app?.close();
    });
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      active = false;
      clearInterval(t);
      void connected?.close();
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(t);
  }, [message]);
  const nextIndex = lessons.findIndex(
    (l) =>
      !!l.learning && !p.completed.includes(l.id) && canStudy(p, l, lessons),
  );
  const current = lessons[Math.max(0, nextIndex)];
  const today = p.history.filter((h) => h.date === dateKey());
  const minutes = today.reduce((sum, h) => sum + h.minutes, 0);
  const due = Object.entries(p.reviews).filter(([, r]) => r.due <= now);
  const learned = words.filter((w) => p.reviews[w.hanzi]);
  const streakDays = streak(p);
  const accuracy = p.history.length
    ? Math.round(
        (p.history.reduce((s, h) => s + h.accuracy, 0) / p.history.length) *
          100,
      )
    : 0;
  function start(lesson: Lesson, isPractice = false) {
    setOnboard(false);
    learning.open(lesson, isPractice ? "practice" : "study", page);
  }
  function practiceGame(kind: string) {
    setFlashMode(false);
    setWriteMode(false);
    if (!learned.length) {
      setMessage("Hãy học bài nhập môn trước để có từ ôn tập.");
      return;
    }
    if (kind === "Flashcard") {
      setFlashMode(true);
      setPage("practice");
      return;
    }
    if (kind === "Luyện viết") {
      setWriteMode(true);
      setPage("practice");
      return;
    }
    const knownWords = words.filter((w) => p.reviews[w.hanzi]);
    if (!knownWords.length) {
      setMessage("Hãy học bài nhập môn trước để có từ ôn tập.");
      return;
    }
    const practiceLessons = lessons.filter((l) => p.completed.includes(l.id));
    const pool =
      kind === "Ôn lỗi sai"
        ? p.difficult
        : kind === "Ôn tập đến hạn"
          ? due.map(([w]) => w)
          : [];
    const selected =
      kind === "Thanh điệu"
        ? practiceLessons
            .filter((l) => l.questions.some((q) => q.type === "tone"))
            .flatMap((l) => l.words)
        : kind === "Sắp xếp câu"
          ? [
              ...new globalThis.Map(
                practiceLessons
                  .flatMap((l) =>
                    l.questions.some((q) => q.type === "sentence")
                      ? l.words
                      : [],
                  )
                  .map((w) => [w.hanzi, w]),
              ).values(),
            ]
          : pool.length
            ? knownWords.filter((w) => pool.includes(w.hanzi))
            : knownWords.slice(0, 6);
    let qs =
      kind === "Thanh điệu"
        ? practiceLessons.flatMap((l) =>
            l.questions.filter((q) => q.type === "tone"),
          )
        : kind === "Sắp xếp câu"
          ? practiceLessons.flatMap((l) =>
              l.questions.filter((q) => q.type === "sentence"),
            )
          : kind === "Ghép cặp"
            ? practiceLessons
                .flatMap((l) => l.questions.filter((q) => q.type === "match"))
                .slice(0, 1)
            : selected.map((w) => ({
                type: kind === "Nghe" ? ("listen" as const) : ("quiz" as const),
                prompt:
                  kind === "Nghe"
                    ? "Nghe và chọn chữ Hán"
                    : kind === "Pinyin"
                      ? `Pinyin của ${w.hanzi} là gì?`
                      : `“${w.hanzi}” có nghĩa là gì?`,
                audio: w.hanzi,
                options:
                  kind === "Nghe"
                    ? [
                        w.hanzi,
                        ...knownWords
                          .filter((x) => x.hanzi !== w.hanzi)
                          .slice(0, 3)
                          .map((x) => x.hanzi),
                      ]
                    : kind === "Pinyin"
                      ? [
                          w.pinyin,
                          ...knownWords
                            .filter((x) => x.pinyin !== w.pinyin)
                            .slice(0, 3)
                            .map((x) => x.pinyin),
                        ]
                      : [
                          w.meaning,
                          ...knownWords
                            .filter((x) => x.meaning !== w.meaning)
                            .slice(0, 3)
                            .map((x) => x.meaning),
                        ],
                answer:
                  kind === "Nghe"
                    ? w.hanzi
                    : kind === "Pinyin"
                      ? w.pinyin
                      : w.meaning,
                explanation: `${w.hanzi} · ${w.pinyin} → ${w.meaning}`,
              }));
    if (!qs.length) {
      setMessage("Chưa có nội dung đã học phù hợp với chế độ này.");
      return;
    }
    start(
      {
        ...current,
        learning: undefined,
        prerequisites: undefined,
        id: "practice",
        title: kind,
        guide:
          "Thử nhớ lại trước khi xem đáp án. Chưa nhớ cũng không sao: mỗi lần tự nhớ là một lần bạn học sâu hơn.",
        words: selected,
        questions: qs,
        writing:
          "Chọn 3 từ vừa luyện. Viết mỗi từ 3 lần, ghi Pinyin và nghĩa, rồi che mẫu để tự kiểm tra.",
        minutes: 5,
      },
      true,
    );
  }
  function changePage(id: string) {
    const url = new URL(window.location.href);
    if (id === "admin") {
      url.searchParams.set("admin", "overview");
      url.searchParams.delete("page");
    } else {
      url.searchParams.delete("admin");
      url.searchParams.set("page", id);
    }
    window.history.replaceState({}, "", url);
    setPage(id);
    setFlashMode(false);
    setWriteMode(false);
    if (!learned.length) {
      setMessage("Hãy học bài nhập môn trước để có từ ôn tập.");
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const greeting = (
    <>
      <span className="eyebrow">MỖI NGÀY MỘT CHÚT, TIẾN XA HƠN MỖI NGÀY</span>
      <h1>
        Chào {p.name}, cùng học thôi! <span className="wave">👋</span>
      </h1>
      <p className="subtitle">
        Một hành trình mới bắt đầu từ một lời chào. 你准备好了吗？
      </p>
    </>
  );
  return (
    <>
      <div
        className={`app-shell ${page === "admin" ? "admin-mode" : ""}`}
        style={learning.route ? { display: "none" } : undefined}
      >
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => changePage("home")}
            aria-label="HanziOne, về tổng quan"
          >
            <div className="brand-icon">
              汉<span>✦</span>
            </div>
            <div>
              Hanzi<span>One</span>
              <small>HỌC NHỎ. MƠ LỚN.</small>
            </div>
          </button>
          <div className="sidebar-label">KHÁM PHÁ</div>
          <nav aria-label="Điều hướng chính">
            {nav.map((n) => (
              <button
                key={n.id}
                aria-label={n.label}
                className={page === n.id ? "active" : ""}
                onClick={() => changePage(n.id)}
                aria-current={page === n.id ? "page" : undefined}
              >
                <n.icon size={21} />
                <span>{n.label}</span>
                {page === n.id && <i />}
              </button>
            ))}
          </nav>
          <div className="sidebar-tip">
            <div className="tip-leaf">
              <Leaf size={24} />
            </div>
            <b>
              Chậm một chút.
              <br />
              Nhớ lâu hơn.
            </b>
            <p>15 phút hôm nay là một bước gần hơn đến mục tiêu.</p>
            <div>一 步 一 步</div>
          </div>
          <button
            className={`settings-link ${page === "settings" ? "active" : ""}`}
            onClick={() => changePage("settings")}
          >
            <Settings size={20} /> Cài đặt
          </button>
          <div className="sidebar-footer">
            <ProductCredit />
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              Không gian học tập <ChevronRight size={14} />{" "}
              <b>
                {page === "admin"
                  ? "Quản trị giáo trình"
                  : nav.find((n) => n.id === page)?.label || "Cài đặt"}
              </b>
            </div>
            <div className="top-actions">
              <button
                className="course-button"
                onClick={() => setOnboard(true)}
              >
                <span className="china-flag">★</span> Tiếng Trung{" "}
                <ChevronDown size={14} />
              </button>
              <div className="top-stat orange">
                <Flame size={21} />
                <b>{streakDays}</b>
              </div>
              <div className="top-stat gold">
                <Zap size={20} />
                <b>{p.xp}</b>
                <span>XP</span>
              </div>
              {host && (
                <button
                  className="icon-button"
                  aria-label="Mở toàn màn hình"
                  onClick={() =>
                    void host
                      .requestDisplayMode({ mode: "fullscreen" })
                      .catch(() =>
                        setMessage("Host chưa hỗ trợ toàn màn hình."),
                      )
                  }
                >
                  <Maximize2 size={18} />
                </button>
              )}
              <button
                className="avatar"
                aria-label="Thiết lập hồ sơ"
                onClick={() => setOnboard(true)}
              >
                {p.name === "bạn" ? "B" : p.name.charAt(0).toUpperCase()}
              </button>
            </div>
          </header>
          <main>
            <SyncBanner />
            {manager?.stages[0] && (
              <div className="resume-banner card">
                <p>
                  Bạn có màn chơi đang dở: {manager.stages[0].lesson.title}.
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    const state = manager.stages[0];
                    start(state.lesson, state.practice);
                  }}
                >
                  Tiếp tục màn đang học
                </button>
              </div>
            )}
            {page === "home" && (
              <>
                <div className="page-heading">
                  {greeting}
                  <span className="date-pill">
                    <span /> Hôm nay,{" "}
                    {new Intl.DateTimeFormat("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      timeZone: "Asia/Ho_Chi_Minh",
                    }).format(new Date())}
                  </span>
                </div>
                <div className="dashboard-grid">
                  <div className="main-column">
                    <section className="hero">
                      <Landscape />
                      <div className="hero-text">
                        <div className="hero-tag">
                          <span /> HÀNH TRÌNH CỦA BẠN · {p.goal}
                        </div>
                        <h2>
                          Từng chữ nhỏ.
                          <br />
                          Cả thế giới rộng lớn.
                        </h2>
                        <p>
                          Cùng Bao khám phá tiếng Trung,
                          <br />
                          bắt đầu từ những điều thật gần gũi.
                        </p>
                        <button
                          className="primary"
                          onClick={() =>
                            p.onboarded ? start(current) : setOnboard(true)
                          }
                        >
                          {p.onboarded ? "Tiếp tục học" : "Bắt đầu hành trình"}{" "}
                          <ArrowRight size={18} />
                        </button>
                        <small>
                          <Clock size={13} /> Chỉ {p.daily} phút mỗi ngày
                        </small>
                      </div>
                      <div className="hero-panda">
                        <span className="speech-bubble">
                          你好! <small>Nǐ hǎo!</small>
                        </span>
                        <Panda />
                      </div>
                      <div className="hero-leaf">✦</div>
                    </section>
                    <div className="stat-grid">
                      <div className="mini-stat">
                        <div className="stat-icon green">
                          <Clock />
                        </div>
                        <div>
                          <b>
                            {minutes}
                            <small> / {p.daily} phút</small>
                          </b>
                          <span>Học hôm nay</span>
                        </div>
                        <Meter value={minutes} max={p.daily} />
                      </div>
                      <div className="mini-stat">
                        <div className="stat-icon yellow">
                          <Zap />
                        </div>
                        <div>
                          <b>
                            {p.xp}
                            <small> XP</small>
                          </b>
                          <span>Tích lũy mỗi ngày</span>
                        </div>
                      </div>
                      <div className="mini-stat">
                        <div className="stat-icon peach">
                          <Flame />
                        </div>
                        <div>
                          <b>
                            {streakDays}
                            <small> ngày</small>
                          </b>
                          <span>Chuỗi ngày học</span>
                        </div>
                      </div>
                    </div>
                    <SectionTitle
                      action="Xem hành trình"
                      onClick={() => changePage("path")}
                    >
                      Bước tiếp theo của bạn
                    </SectionTitle>
                    <section className="next-lesson">
                      <div className="lesson-illustration">
                        <span>你</span>
                        <span>好</span>
                        <i>✦</i>
                      </div>
                      <div className="next-info">
                        <div className="eyebrow">
                          CHẶNG {Math.max(1, nextIndex + 1)} ·{" "}
                          {nextIndex === -1 ? "ÔN TẬP" : "KHỞI ĐẦU HÀNH TRÌNH"}
                        </div>
                        <h3>{current.title}</h3>
                        <p>{current.description}</p>
                        <div className="lesson-meta">
                          <span>
                            <Clock size={14} /> {current.minutes} phút
                          </span>
                          <span>
                            <Layers size={14} /> {current.questions.length} thử
                            thách
                          </span>
                          <span className="xp-meta">
                            <Zap size={14} /> Đến 40 XP
                          </span>
                        </div>
                      </div>
                      <button
                        className="round-button"
                        aria-label="Bắt đầu bài học tiếp theo"
                        onClick={() => start(current)}
                      >
                        <ArrowRight />
                      </button>
                    </section>
                    <SectionTitle
                      action="Khám phá tất cả"
                      onClick={() => changePage("practice")}
                    >
                      Luyện một chút, nhớ lâu hơn
                    </SectionTitle>
                    <div className="practice-preview">
                      <button
                        className="practice-card blue"
                        onClick={() => practiceGame("Nghe")}
                      >
                        <div className="practice-art" aria-hidden="true">
                          <Headphones size={37} />
                          <span>♪</span>
                        </div>
                        <h3>Nghe & nhận diện</h3>
                        <p>Lắng nghe, làm quen từng âm.</p>
                        <span className="card-bottom">
                          5 phút <ArrowRight size={17} />
                        </span>
                      </button>
                      <button
                        className="practice-card violet"
                        onClick={() => practiceGame("Ghép cặp")}
                      >
                        <div className="practice-art" aria-hidden="true">
                          <span className="hanzi-block">汉</span>
                          <Layers size={30} />
                        </div>
                        <h3>Ghép cặp từ vựng</h3>
                        <p>Kết nối chữ Hán với ý nghĩa.</p>
                        <span className="card-bottom">
                          3 phút <ArrowRight size={17} />
                        </span>
                      </button>
                      <button
                        className="practice-card apricot"
                        onClick={() => {
                          setPage("practice");
                          setWriteMode(true);
                        }}
                      >
                        <div className="practice-art" aria-hidden="true">
                          <Pencil size={37} />
                          <span>一</span>
                        </div>
                        <h3>Nét chữ đầu tiên</h3>
                        <p>Chậm lại để ghi nhớ sâu hơn.</p>
                        <span className="card-bottom">
                          5 phút <ArrowRight size={17} />
                        </span>
                      </button>
                    </div>
                    <section className="notebook-banner">
                      <div className="notebook-icon">
                        <BookOpen size={29} />
                        <Pencil size={16} />
                      </div>
                      <div>
                        <h3>Một cuốn vở, thêm một cách ghi nhớ.</h3>
                        <p>
                          Hôm nay, hãy viết{" "}
                          {current.words
                            .slice(0, 3)
                            .map((w) => w.hanzi)
                            .join(" · ")}{" "}
                          vào vở của bạn.
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => changePage("notebook")}
                      >
                        Mở sổ tay <ArrowRight size={16} />
                      </button>
                    </section>
                    <footer className="page-footer">
                      <Leaf size={14} /> Học từng chút một · Hiểu thật kỹ · Nhớ
                      thật lâu
                    </footer>
                  </div>
                  <aside className="right-column">
                    <section className="daily card">
                      <div className="card-heading">
                        <h3>Mục tiêu hôm nay</h3>
                        <Target size={21} />
                      </div>
                      <div
                        className="daily-ring"
                        style={{
                          background: `conic-gradient(var(--green) ${Math.min(100, (minutes / p.daily) * 100)}%,var(--line) 0)`,
                        }}
                      >
                        <div>
                          <b>
                            {minutes}
                            <small>/{p.daily}</small>
                          </b>
                          <span>PHÚT HỌC</span>
                        </div>
                      </div>
                      <p>
                        {minutes >= p.daily
                          ? "Bạn đã hoàn thành mục tiêu hôm nay!"
                          : "Một chút tập trung, thêm một bước tiến!"}{" "}
                        <span>🌱</span>
                      </p>
                      <div className="daily-task">
                        <span
                          className={
                            today.length ? "task-check done" : "task-check"
                          }
                        >
                          {today.length ? <Check size={13} /> : null}
                        </span>
                        <span>Hoàn thành 1 bài học</span>
                        <small>{Math.min(today.length, 1)}/1</small>
                      </div>
                      <div className="daily-task">
                        <span
                          className={
                            p.written.includes(dateKey())
                              ? "task-check done"
                              : "task-check"
                          }
                        >
                          {p.written.includes(dateKey()) ? (
                            <Check size={13} />
                          ) : null}
                        </span>
                        <span>Luyện viết vào vở</span>
                        <small>{p.written.includes(dateKey()) ? 1 : 0}/1</small>
                      </div>
                    </section>
                    <section className="review-card">
                      <div className="review-icon">
                        <RotateCcw size={21} />
                      </div>
                      <h3>Đến giờ ôn tập rồi?</h3>
                      <p>
                        {due.length
                          ? `${due.length} từ đang chờ bạn gặp lại. Ôn đúng lúc để nhớ lâu hơn.`
                          : "Từ đã học sẽ xuất hiện ở đây khi đến lịch ôn. Cùng gieo những hạt mầm đầu tiên!"}
                      </p>
                      <button
                        onClick={() =>
                          due.length
                            ? practiceGame("Ôn tập đến hạn")
                            : start(current)
                        }
                      >
                        {due.length ? "Ôn tập ngay" : "Học từ đầu tiên"}{" "}
                        <ArrowRight size={16} />
                      </button>
                      <span className="review-decoration">文</span>
                    </section>
                    <section className="journey card">
                      <div className="card-heading">
                        <h3>Hành trình {p.goal}</h3>
                        <Flag size={18} />
                      </div>
                      <div className="row">
                        <b>
                          {p.completed.length}
                          <small> / {lessons.length} bài đã tải</small>
                        </b>
                        <span>
                          {Math.round(
                            (p.completed.length / lessons.length) * 100,
                          )}
                          %
                        </span>
                      </div>
                      <Meter value={p.completed.length} max={lessons.length} />
                      <p>Khởi đầu nhỏ. Thành tựu lớn.</p>
                      <div className="journey-stops">
                        {[Leaf, Languages, GraduationCap, Flag].map(
                          (Icon, i) => (
                            <span
                              key={i}
                              className={
                                p.completed.length > i * 3 ? "lit" : ""
                              }
                            >
                              <Icon size={18} />
                            </span>
                          ),
                        )}
                      </div>
                      <button
                        className="text-button"
                        onClick={() => changePage("path")}
                      >
                        Xem bản đồ học tập <ChevronRight size={15} />
                      </button>
                    </section>
                    <div className="bao-note">
                      <Panda small />
                      <p>
                        “Không cần giỏi mới bắt đầu.
                        <br />
                        Bắt đầu rồi, bạn sẽ giỏi hơn!”
                        <b>— Bao, bạn đồng hành của bạn</b>
                      </p>
                    </div>
                  </aside>
                </div>
              </>
            )}
            {page === "path" && (
              <CourseJourney
                cloud={!!account.manager}
                progress={p}
                allLessons={lessons}
                onStudy={(lesson) => start(lesson)}
                onPreview={openPreview}
                isUnlocked={(lesson) => canStudy(p, lesson, lessons)}
                onRefreshCurriculum={() => refreshCurriculum((n) => n + 1)}
              />
            )}
            {page === "practice" && (
              <>
                <PageHeading
                  eyebrow="THỬ, CHƠI VÀ GHI NHỚ"
                  title="Sân chơi tiếng Trung"
                  text="Chọn một kỹ năng. Dành vài phút. Tốt hơn một chút mỗi ngày."
                />
                <section className="card">
                  <h2>Tự nhớ bài đã học · không cộng XP</h2>
                  <p>
                    Các hướng tự nhớ dùng chung lịch ôn của từng từ. Từ đến hạn
                    sẽ được đánh dấu để bạn ôn trước.
                  </p>
                  {lessons
                    .filter(
                      (l) =>
                        l.learning?.screens.some((s) => s.kind === "recall") &&
                        l.words.some((w) => p.reviews[w.hanzi]),
                    )
                    .map((l) => (
                      <button
                        key={l.id}
                        className="secondary"
                        onClick={() => setRecallLesson(l)}
                      >
                        {l.title}
                        {l.words.some((w) => p.reviews[w.hanzi]?.due <= now)
                          ? " · Đến hạn"
                          : " · Ôn thêm"}
                      </button>
                    ))}
                  {recallLesson && (
                    <>
                      <button
                        className="text-button"
                        onClick={() => setRecallLesson(null)}
                      >
                        Đóng tự nhớ
                      </button>
                      <RecallCards
                        key={recallLesson.id}
                        cards={recallLesson.learning!.screens.flatMap((s) =>
                          s.kind === "recall" ? s.cards : [],
                        )}
                        sound={p.sound}
                        onDone={() =>
                          setMessage(
                            "Đã ôn đủ các hướng tự nhớ, không cộng XP.",
                          )
                        }
                        onRate={(_id, hanzi, correct) =>
                          patch({
                            reviews: {
                              ...p.reviews,
                              [hanzi]: schedule(p.reviews[hanzi], correct),
                            },
                            difficult: correct
                              ? p.difficult
                              : [...new Set([...p.difficult, hanzi])],
                          })
                        }
                      />
                    </>
                  )}
                </section>
                {flashMode && learned.length ? (
                  <section className="card flash-section">
                    <SectionTitle
                      action="Đóng flashcard"
                      onClick={() => setFlashMode(false)}
                    >
                      Lật thẻ, nhớ từ
                    </SectionTitle>
                    <button
                      className={`flashcard ${flipped ? "flipped" : ""}`}
                      onClick={() => setFlipped(!flipped)}
                      aria-label="Lật thẻ"
                    >
                      <b>{learned[flash % learned.length].hanzi}</b>
                      <span>
                        {flipped
                          ? `${learned[flash % learned.length].pinyin} · ${learned[flash % learned.length].meaning}`
                          : "Chạm để xem nghĩa"}
                      </span>
                    </button>
                    <div className="row">
                      <button
                        className="secondary"
                        onClick={() => {
                          patch({
                            difficult: [
                              ...new Set([
                                ...p.difficult,
                                learned[flash % learned.length].hanzi,
                              ]),
                            ],
                            reviews: {
                              ...p.reviews,
                              [learned[flash % learned.length].hanzi]: schedule(
                                p.reviews[
                                  learned[flash % learned.length].hanzi
                                ],
                                false,
                              ),
                            },
                          });
                          setMessage("Đã thêm vào từ khó, ôn lại sau 10 phút.");
                        }}
                      >
                        Cần ôn thêm
                      </button>
                      <button
                        className="primary"
                        onClick={() => {
                          patch({
                            reviews: {
                              ...p.reviews,
                              [learned[flash % learned.length].hanzi]: schedule(
                                p.reviews[
                                  learned[flash % learned.length].hanzi
                                ],
                                true,
                              ),
                            },
                          });
                          setFlash((flash + 1) % learned.length);
                          setFlipped(false);
                        }}
                      >
                        Đã nhớ · Thẻ tiếp <ArrowRight size={16} />
                      </button>
                    </div>
                    <p>
                      {(flash % learned.length) + 1}/{learned.length} thẻ · Tự
                      đánh giá trí nhớ
                    </p>
                  </section>
                ) : writeMode ? (
                  <section className="card writing-section">
                    <SectionTitle
                      action="Đóng luyện viết"
                      onClick={() => setWriteMode(false)}
                    >
                      Nét chữ đầu tiên
                    </SectionTitle>
                    <p>
                      Chọn một từ đã học bên dưới, chép vào vở rồi che mẫu và
                      viết lại. Đối chiếu chữ, Pinyin và nghĩa với mẫu. Ô bên
                      dưới giúp thử nét.
                    </p>
                    <div className="writing-examples">
                      {learned.slice(0, 3).map((w) => (
                        <p key={w.hanzi}>
                          {w.hanzi} · {w.pinyin} · {w.meaning}
                        </p>
                      ))}
                    </div>
                    <WritingPad />
                    <button
                      className="primary"
                      onClick={() => {
                        patch({
                          written: [...new Set([...p.written, dateKey()])],
                        });
                        setMessage("Đã ghi nhận buổi luyện viết hôm nay.");
                      }}
                    >
                      Mình đã luyện viết vào vở <Check size={17} />
                    </button>
                  </section>
                ) : (
                  <>
                    <div className="practice-grid">
                      {[
                        {
                          name: "Nghe",
                          icon: Headphones,
                          text: "Làm quen âm thanh, nghe và chọn chữ.",
                          color: "blue",
                        },
                        {
                          name: "Pinyin",
                          icon: Languages,
                          text: "Kết nối chữ Hán với cách phát âm.",
                          color: "green",
                        },
                        {
                          name: "Thanh điệu",
                          icon: Volume2,
                          text: "Khám phá giai điệu của tiếng Trung.",
                          color: "apricot",
                        },
                        {
                          name: "Nhận diện chữ Hán",
                          icon: Sparkles,
                          text: "Nhìn chữ, nhớ nghĩa, mở rộng vốn từ.",
                          color: "violet",
                        },
                        {
                          name: "Ghép cặp",
                          icon: Layers,
                          text: "Kết nối những cặp từ thật ăn ý.",
                          color: "apricot",
                        },
                        {
                          name: "Flashcard",
                          icon: BookOpen,
                          text: "Lật thẻ và tự kiểm tra trí nhớ.",
                          color: "blue",
                        },
                        {
                          name: "Sắp xếp câu",
                          icon: Shuffle,
                          text: "Ghép từng từ thành câu hoàn chỉnh.",
                          color: "green",
                        },
                        {
                          name: "Luyện viết",
                          icon: Pencil,
                          text: "Một nét, một chữ, một lần nhớ lâu.",
                          color: "violet",
                        },
                        {
                          name: "Ôn lỗi sai",
                          icon: RotateCcw,
                          text: p.difficult.length
                            ? `${p.difficult.length} từ cần chăm chút thêm.`
                            : "Chưa có lỗi sai được ghi nhận.",
                          color: "apricot",
                        },
                      ].map((item) => (
                        <button
                          key={item.name}
                          disabled={
                            item.name === "Ôn lỗi sai" && !p.difficult.length
                          }
                          className={`practice-card ${item.color}`}
                          onClick={() => practiceGame(item.name)}
                        >
                          <item.icon size={34} />
                          <h3>{item.name}</h3>
                          <p>{item.text}</p>
                          <span className="card-bottom">
                            Bắt đầu luyện <ArrowRight size={18} />
                          </span>
                        </button>
                      ))}
                    </div>
                    <section className="notebook-banner">
                      <RotateCcw />
                      <div>
                        <h3>Ôn đúng lúc, ghi nhớ dài lâu</h3>
                        <p>
                          {due.length} từ đến hạn ôn · Thuật toán tăng khoảng
                          cách 1, 2, 4, 8 ngày.
                        </p>
                      </div>
                      <button
                        className="text-button"
                        disabled={!due.length}
                        onClick={() => practiceGame("Ôn tập đến hạn")}
                      >
                        Ôn ngay <ArrowRight size={16} />
                      </button>
                    </section>
                  </>
                )}
              </>
            )}
            {page === "notebook" && (
              <>
                <PageHeading
                  eyebrow="GÓP NHẶT TỪNG CHÚT KIẾN THỨC"
                  title="Sổ tay của bạn"
                  text="Những từ đã gặp, những điều đã hiểu và những nét chữ đang lớn lên."
                />
                <div className="notebook-layout">
                  <section>
                    <div className="notebook-tools">
                      <div className="tabs">
                        {[
                          ["all", "Từ đã học"],
                          ["hard", "Từ khó"],
                          ["grammar", "Ngữ pháp"],
                          ["history", "Lịch sử ôn"],
                        ].map(([id, label]) => (
                          <button
                            className={filter === id ? "active" : ""}
                            key={id}
                            onClick={() => setFilter(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {["all", "hard"].includes(filter) && (
                        <input
                          aria-label="Tìm từ vựng"
                          placeholder="Tìm chữ Hán, Pinyin, nghĩa…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      )}
                    </div>
                    {filter === "grammar" ? (
                      <div className="card grammar">
                        <h3>Mẫu câu trong hành trình</h3>
                        <h4>Chủ ngữ + 是 + danh từ</h4>
                        <p>我是学生。· Wǒ shì xuésheng. · Tôi là học sinh.</p>
                        <h4>Câu trần thuật + 吗？</h4>
                        <p>你是学生吗？· Bạn là học sinh phải không?</p>
                        <h4>因为…所以…</h4>
                        <p>
                          因为下雨，所以我不去。· Vì trời mưa nên tôi không đi.
                        </p>
                      </div>
                    ) : filter === "history" ? (
                      <div className="card">
                        {p.history.length ? (
                          p.history
                            .slice()
                            .reverse()
                            .map((h, i) => (
                              <div className="history-row" key={i}>
                                <Check />
                                <div>
                                  <b>
                                    {lessons.find((l) => l.id === h.lesson)
                                      ?.title || "Luyện tập tự do"}
                                  </b>
                                  <p>
                                    {h.date} · {h.minutes} phút · Đúng{" "}
                                    {Math.round(h.accuracy * 100)}%
                                  </p>
                                </div>
                                <span>+{h.xp} XP</span>
                              </div>
                            ))
                        ) : (
                          <Empty text="Chưa có buổi học nào. Một bài học nhỏ sẽ mở đầu trang sổ này." />
                        )}
                      </div>
                    ) : (
                      <div className="card word-list">
                        {(filter === "hard"
                          ? words.filter((w) => p.difficult.includes(w.hanzi))
                          : learned
                        )
                          .filter((w) =>
                            `${w.hanzi} ${w.pinyin} ${w.meaning}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .map((w) => (
                            <div className="word-row" key={w.hanzi}>
                              <button
                                className="word-sound"
                                aria-label={`Nghe ${w.hanzi}`}
                                onClick={() =>
                                  speak(w.hanzi, p.sound, setMessage)
                                }
                              >
                                <Volume2 size={19} />
                              </button>
                              <b>{w.hanzi}</b>
                              <div>
                                <span>{w.pinyin}</span>
                                <p>{w.meaning}</p>
                              </div>
                              <small>
                                {p.reviews[w.hanzi]
                                  ? `Ôn: ${new Date(p.reviews[w.hanzi].due).toLocaleDateString("vi-VN")}`
                                  : "Cần ôn"}
                              </small>
                              <button
                                className={`icon-button ${p.difficult.includes(w.hanzi) ? "starred" : ""}`}
                                aria-label={
                                  p.difficult.includes(w.hanzi)
                                    ? `Bỏ đánh dấu ${w.hanzi}`
                                    : `Đánh dấu khó ${w.hanzi}`
                                }
                                onClick={() =>
                                  patch({
                                    difficult: p.difficult.includes(w.hanzi)
                                      ? p.difficult.filter((x) => x !== w.hanzi)
                                      : [...p.difficult, w.hanzi],
                                  })
                                }
                              >
                                <Star size={19} />
                              </button>
                            </div>
                          ))}
                        {!(
                          filter === "hard"
                            ? words.filter((w) => p.difficult.includes(w.hanzi))
                            : learned
                        ).filter((w) =>
                          `${w.hanzi} ${w.pinyin} ${w.meaning}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        ).length && (
                          <Empty
                            text={
                              search
                                ? "Chưa tìm thấy từ phù hợp."
                                : "Chưa có từ nào ở đây. Học một bài hoặc thử flashcard để thêm từ."
                            }
                          />
                        )}
                      </div>
                    )}
                    <section className="card personal-notes">
                      <h3>Ghi chú của mình</h3>
                      <p>Viết một ví dụ, một mẹo nhớ hoặc điều bạn muốn hỏi.</p>
                      <textarea
                        aria-label="Ghi chú cá nhân"
                        value={p.notes}
                        onChange={(e) => patch({ notes: e.target.value })}
                        placeholder="Hôm nay mình nhận ra…"
                      />
                      <small>
                        {manager
                          ? "Tự lưu sau khoảng 800 ms; xem trạng thái đồng bộ ở đầu trang."
                          : "Tự động lưu trên thiết bị này."}
                      </small>
                    </section>
                  </section>
                  <aside className="card notebook-checklist">
                    <BookOpen size={32} />
                    <h3>Hôm nay, lấy vở ra nhé!</h3>
                    <p>{current.writing}</p>
                    <div className="writing-examples">
                      {current.words
                        .slice(0, 3)
                        .map((w) => w.hanzi)
                        .join(" ")}
                    </div>
                    <label className="checkline">
                      <input
                        type="checkbox"
                        checked={p.written.includes(dateKey())}
                        onChange={(e) =>
                          patch({
                            written: e.target.checked
                              ? [...new Set([...p.written, dateKey()])]
                              : p.written.filter((d) => d !== dateKey()),
                          })
                        }
                      />{" "}
                      Đã viết và tự kiểm tra hôm nay
                    </label>
                    <div className="note-box">
                      Mẹo của Bao: che mẫu, viết từ trí nhớ, rồi đối chiếu. Sai
                      một nét cũng là một cơ hội học thêm.
                    </div>
                  </aside>
                </div>
              </>
            )}
            {page === "stats" && (
              <>
                <PageHeading
                  eyebrow="MỖI BƯỚC NHỎ ĐỀU ĐƯỢC GHI NHẬN"
                  title="Bạn đang tiến bộ"
                  text="Số liệu được ghi từ những buổi học thực tế trên thiết bị này."
                />
                <div className="stats-overview">
                  {[
                    { label: "Kinh nghiệm", value: `${p.xp} XP`, icon: Zap },
                    {
                      label: "Bài hoàn thành",
                      value: `${p.completed.length}/${lessons.length}`,
                      icon: BookOpen,
                    },
                    {
                      label: "Độ chính xác trung bình",
                      value: `${accuracy}%`,
                      icon: Target,
                    },
                    {
                      label: "Chuỗi ngày học",
                      value: `${streakDays} ngày`,
                      icon: Flame,
                    },
                  ].map((s) => (
                    <section className="card" key={s.label}>
                      <s.icon />
                      <h2>{s.value}</h2>
                      <p>{s.label}</p>
                    </section>
                  ))}
                </div>
                <div className="stats-layout">
                  <section className="card">
                    <SectionTitle>Nhịp học trong tuần</SectionTitle>
                    <div className="chart">
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() - 6 + i);
                        const total = p.history
                          .filter((h) => h.date === dateKey(d))
                          .reduce((sum, h) => sum + h.minutes, 0);
                        return (
                          <div className="chart-column" key={i}>
                            <span>{total}′</span>
                            <div>
                              <i
                                style={{
                                  height: `${total ? Math.max(5, Math.min(100, (total / Math.max(p.daily, 60)) * 100)) : 0}%`,
                                }}
                              />
                            </div>
                            <small>
                              {d.toLocaleDateString("vi-VN", {
                                weekday: "short",
                              })}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                    <p className="muted">
                      Mục tiêu: {p.daily} phút/ngày · Giờ học mong muốn:{" "}
                      {p.time}
                    </p>
                  </section>
                  <section className="card">
                    <SectionTitle>Góc nhìn kỹ năng</SectionTitle>
                    {[
                      "Nhận diện từ vựng",
                      "Pinyin & thanh điệu",
                      "Câu giao tiếp",
                    ].map((s, i) => {
                      const matching = p.history.filter((h) =>
                        i === 0
                          ? ["hello", "first-words", "practice"].includes(
                              h.lesson,
                            )
                          : i === 1
                            ? ["pinyin", "tones"].includes(h.lesson)
                            : ["sentences", "hsk1", "hsk2", "hsk3"].includes(
                                h.lesson,
                              ),
                      );
                      const avg = matching.length
                        ? Math.round(
                            (matching.reduce((sum, h) => sum + h.accuracy, 0) /
                              matching.length) *
                              100,
                          )
                        : 0;
                      return (
                        <div className="skill-meter" key={s}>
                          <div className="row">
                            <span>{s}</span>
                            <small>
                              {matching.length ? `${avg}%` : "Chưa đủ dữ liệu"}
                            </small>
                          </div>
                          <Meter value={avg} />
                        </div>
                      );
                    })}
                    <p className="muted">
                      {p.difficult.length} từ khó · {due.length} từ đến hạn ôn ·{" "}
                      {learned.length} từ đã gặp
                    </p>
                    <button
                      className="text-button"
                      onClick={() => changePage("notebook")}
                    >
                      Xem những từ cần ôn <ArrowRight size={16} />
                    </button>
                  </section>
                </div>
              </>
            )}
            {page === "admin" && (
              <AdminPlatform
                key={manager?.userId || "guest"}
                onPreviewLesson={openPreview}
                onBackToApp={() => changePage("home")}
                dark={p.dark}
                onToggleTheme={() => patch({ dark: !p.dark })}
              />
            )}
            {page === "settings" && (
              <>
                <PageHeading
                  eyebrow="HỌC THEO CÁCH CỦA BẠN"
                  title="Cài đặt không gian học"
                  text="Một không gian thoải mái giúp hành trình bền bỉ hơn."
                />
                <section className="card settings-card">
                  <AccountSettings />
                  <AdminCurriculumLink onOpen={() => changePage("admin")} />
                  <h3>Hồ sơ & mục tiêu</h3>
                  <div className="setting-row">
                    <div>
                      <b>{p.name === "bạn" ? "Người học mới" : p.name}</b>
                      <p>
                        {p.goal} · {p.daily} phút/ngày · {p.time}
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setOnboard(true)}
                    >
                      Điều chỉnh
                    </button>
                  </div>
                  <h3>Trải nghiệm</h3>
                  <div className="setting-row">
                    <div>
                      <b>Giao diện tối</b>
                      <p>Dịu mắt khi học vào buổi tối.</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={p.dark}
                      aria-label="Giao diện tối"
                      className={`toggle ${p.dark ? "on" : ""}`}
                      onClick={() => patch({ dark: !p.dark })}
                    >
                      {p.dark ? <Moon size={16} /> : <Sun size={16} />}
                    </button>
                  </div>
                  <div className="setting-row">
                    <div>
                      <b>Âm thanh phát âm</b>
                      <p>Dùng giọng tiếng Trung có sẵn trên thiết bị.</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={p.sound}
                      aria-label="Âm thanh phát âm"
                      className={`toggle ${p.sound ? "on" : ""}`}
                      onClick={() => patch({ sound: !p.sound })}
                    >
                      <Volume2 size={16} />
                    </button>
                  </div>
                  <h3>Dữ liệu học tập</h3>
                  <p>
                    {manager
                      ? "Supabase lưu tiến độ tài khoản; máy này giữ bộ nhớ đệm và hàng đợi khi mất mạng."
                      : "Tiến độ lưu trên trình duyệt này, chưa đồng bộ tài khoản."}{" "}
                    Giờ học là mục tiêu cá nhân, chưa gửi thông báo tự động.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(p, null, 2)], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `hanzione-${dateKey()}.json`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    <Download size={16} /> Xuất tiến độ JSON
                  </button>
                  <p className="muted">
                    {lessons.length} bài học · Cầu nối MCP Apps{" "}
                    {host ? "đã kết nối host" : "chưa kết nối host"}
                  </p>
                </section>
              </>
            )}
          </main>
          <footer className="mobile-product-footer">
            <ProductCredit />
          </footer>
        </div>
        <nav className="bottom-nav" aria-label="Điều hướng di động">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              className={page === n.id ? "active" : ""}
              onClick={() => changePage(n.id)}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
            </button>
          ))}
          <button
            aria-label="Cài đặt"
            className={page === "settings" ? "active" : ""}
            onClick={() => changePage("settings")}
          >
            <Settings size={21} />
            <span>Cài đặt</span>
          </button>
        </nav>
        {message && (
          <div role="status" className="toast">
            <Leaf size={19} />
            {message}
            <button aria-label="Đóng thông báo" onClick={() => setMessage("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {onboard && (
          <Onboarding
            p={p}
            onClose={() => setOnboard(false)}
            onSave={(profile) => {
              patch({ ...profile, onboarded: true });
              setOnboard(false);
              setMessage(
                "Hành trình của bạn đã sẵn sàng. Cùng Bao bắt đầu nhé!",
              );
            }}
          />
        )}
      </div>
      {learning.route && (
        <LearningWorkspace
          key={`${manager?.userId || "guest"}:${learning.route.key}`}
          route={learning.route}
          intent={learning.intent}
          progress={p}
          allLessons={lessons}
          sound={p.sound}
          onProgress={setP}
          onClose={learning.close}
          onNext={(lesson) => learning.open(lesson, "study", "path")}
          setGuard={learning.setGuard}
          rememberSession={learning.rememberSession}
        />
      )}
    </>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="subtitle">{text}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Leaf size={35} />
      <p>{text}</p>
    </div>
  );
}
function Onboarding({
  p,
  onClose,
  onSave,
}: {
  p: Progress;
  onClose: () => void;
  onSave: (p: Partial<Progress>) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(p.name === "bạn" ? "" : p.name);
  const [goal, setGoal] = useState(p.goal);
  const [daily, setDaily] = useState(p.daily);
  const [time, setTime] = useState(p.time);
  const [experience, setExperience] = useState(p.experience);
  return (
    <div className="modal-backdrop">
      <section
        className="onboarding card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-title"
      >
        <button
          className="modal-close icon-button"
          aria-label="Đóng thiết lập"
          onClick={onClose}
        >
          <X />
        </button>
        <Meter value={step + 1} max={3} />
        <Panda small />
        <span className="eyebrow">CÙNG BAO BẮT ĐẦU · {step + 1}/3</span>
        <h2 id="onboard-title">
          {step === 0
            ? "Chào người bạn mới!"
            : step === 1
              ? "Bạn muốn đi đến đâu?"
              : "Tạo một thói quen nhỏ"}
        </h2>
        {step === 0 ? (
          <>
            <p>
              Một chút khám phá, một chút chơi, một trang vở. Mình sẽ cùng bạn
              học tiếng Trung từ những bước đầu tiên.
            </p>
            <label>
              Tên của bạn
              <input
                autoFocus
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bao nên gọi bạn là gì?"
              />
            </label>
            <label>
              Bạn đã biết tiếng Trung chưa?
              <select
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
              >
                <option>Mới bắt đầu</option>
                <option>Đã biết một chút</option>
                <option>Muốn ôn lại nền tảng</option>
              </select>
            </label>
          </>
        ) : step === 1 ? (
          <>
            <p>
              Chọn điểm đến của bạn. Lộ trình vẫn bắt đầu từ nền tảng để giúp
              bạn hiểu vững.
            </p>
            <div className="goal-options">
              {["Học cơ bản", "HSK 1", "HSK 2", "HSK 3"].map((g) => (
                <button
                  key={g}
                  className={goal === g ? "selected" : ""}
                  onClick={() => setGoal(g)}
                >
                  <GraduationCap />
                  {g}
                  {goal === g && <Check size={16} />}
                </button>
              ))}
            </div>
            <div className="note-box">
              Bản hiện tại có một bài nhập môn demo và kho bài mẫu HSK 1–3
              riêng. Bạn có thể đổi mục tiêu bất cứ lúc nào.
            </div>
          </>
        ) : (
          <>
            <p>Duy trì đều đặn tốt hơn học thật nhiều một lần.</p>
            <div className="goal-options">
              {[15, 30, 60, 120].map((n) => (
                <button
                  key={n}
                  className={daily === n ? "selected" : ""}
                  onClick={() => setDaily(n)}
                >
                  <Clock />
                  {n} phút/ngày
                </button>
              ))}
            </div>
            <label>
              Giờ học mong muốn
              <input
                type="time"
                value={time}
                required
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <div className="note-box">
              <BookOpen size={20} /> Chuẩn bị một cuốn vở. Học → chơi → viết →
              tự kiểm tra → ôn đúng lúc.
            </div>
          </>
        )}
        <div className="onboard-footer">
          {step > 0 && (
            <button className="text-button" onClick={() => setStep(step - 1)}>
              Quay lại
            </button>
          )}
          <button
            className="primary"
            disabled={step === 2 && !time}
            onClick={() =>
              step < 2
                ? setStep(step + 1)
                : onSave({
                    name: name.trim() || "bạn",
                    goal,
                    daily,
                    time,
                    experience,
                  })
            }
          >
            {step === 2 ? "Bắt đầu hành trình" : "Tiếp tục"}
            <ArrowRight size={17} />
          </button>
        </div>
      </section>
    </div>
  );
}
