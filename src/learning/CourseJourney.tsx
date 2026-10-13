import { useEffect, useState, useMemo, useRef } from "react";
import {
  GraduationCap,
  Leaf,
  BookOpen,
  Sparkles,
  Star,
  Check,
  Lock,
  ArrowRight,
  RotateCcw,
  Eye,
  RefreshCw,
  Clock,
  Compass,
  Layers,
  ChevronRight,
  Award,
  HelpCircle,
  FolderOpen,
  CheckCircle2,
  FileCode,
} from "lucide-react";
import type { Lesson, Word } from "../data";
import { lessons as catalog } from "../data";
import { beginner } from "./demo";
import { book1, lesson1a } from "./book1";
import { book1b, lesson1b } from "./book1b";
import { book1c, lesson1c } from "./book1c";
import { demo } from "./demo";
import { loadCourseIndex, loadCurriculum } from "../cloud/curriculum";
import { Panda } from "../Art";
import type { Progress } from "../progress";
import { canStudy } from "../progress";
import Game from "../Game";
import { validateBundle, type Bundle } from "./schema";
import { compileBundle } from "./adapter";

export type CourseInfo = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  level: string;
  icon: typeof GraduationCap;
  lessons: Lesson[];
  isCloud?: boolean;
};

export function CourseJourney({
  cloud,
  progress,
  allLessons,
  onStudy,
  onPreview,
  isUnlocked,
  onRefreshCurriculum,
}: {
  cloud: boolean;
  progress: Progress;
  allLessons: Lesson[];
  onStudy: (lesson: Lesson) => void;
  onPreview: (lesson: Lesson) => void;
  isUnlocked: (lesson: Lesson) => boolean;
  onRefreshCurriculum: () => void;
}) {
  // Built-in courses
  const builtInCourses: CourseInfo[] = useMemo(() => [
    {
      id: "hanzione-book1-preview",
      title: "HanziOne · Quyển 1",
      subtitle: "Giáo trình tiêu chuẩn 7 màn học tương tác",
      description:
        "Lộ trình học bài bản từ lời chào đầu tiên, nhận diện Pinyin, khẩu hình thanh mẫu b/p/m/f đến 4 thanh điệu tiếng Trung. Tích hợp viết chữ vào vở, kiểm tra và lặp lại ngắt quãng SRS.",
      badge: "Giáo trình chuẩn mới",
      level: "Sơ cấp A1",
      icon: GraduationCap,
      lessons: [lesson1a, lesson1b, lesson1c],
    },
    {
      id: "beginner-v1",
      title: "Tiếng Trung từ số 0",
      subtitle: "Khởi đầu vỡ lòng & phản xạ tự nhiên",
      description:
        "Dành cho người hoàn toàn mới bắt đầu. Tập trung vào phản xạ nghe - nhận diện chữ Hán cơ bản và câu chào thông dụng trong cuộc sống hàng ngày.",
      badge: "Foundation · Vỡ lòng",
      level: "Cơ bản",
      icon: Leaf,
      lessons: [demo],
    },
    {
      id: "hsk-foundations",
      title: "HSK Căn bản & Giao tiếp",
      subtitle: "Lộ trình 10 bài cốt lõi từ cơ bản đến HSK 3",
      description:
        "10 bài học nền tảng kinh điển kết nối vững chắc từ phát âm, thanh điệu, quy tắc viết nét chữ Hán đến các mẫu câu giao tiếp và ngữ pháp HSK 1, 2, 3.",
      badge: "10 bài cốt lõi",
      level: "HSK 1 – HSK 3",
      icon: BookOpen,
      lessons: catalog.filter((l) => !l.learning),
    },
  ], []);

  const [activeCourseId, setActiveCourseId] = useState<string>("hanzione-book1-preview");
  const [filterMode, setFilterMode] = useState<"all" | "available" | "completed">("all");
  const [cloudCourses, setCloudCourses] = useState<CourseInfo[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const refreshRef = useRef(onRefreshCurriculum);
  refreshRef.current = onRefreshCurriculum;

  // Dev preview tools
  const [previewBundle, setPreviewBundle] = useState<Bundle>();
  const [previewGameLesson, setPreviewGameLesson] = useState<Lesson>();
  const [jsonError, setJsonError] = useState("");

  // Course membership comes from the server relation, not a lesson ID prefix.
  useEffect(() => {
    let active = true;
    if (cloud) {
      setLoadingCloud(true);
      setSyncMessage("Đang tải bài học từ máy chủ…");
      loadCourseIndex()
        .then(async (items) => {
          if (!active) return;
          const remote = await Promise.all(
            items.map(async (c): Promise<CourseInfo> => ({
              id: c.id,
              title: c.title,
              subtitle: `Phiên bản: ${c.syllabus_version}`,
              description: "Khóa học đồng bộ trực tiếp từ máy chủ đám mây Supabase.",
              badge: "Cloud Course",
              level: "Đồng bộ",
              icon: Sparkles,
              lessons: await loadCurriculum(c.id),
              isCloud: true,
            })),
          );
          if (!active) return;
          setCloudCourses(remote);
          setSyncMessage("Đã đồng bộ bài học thành công!");
          refreshRef.current();
        })
        .catch(() => {
          if (active)
            setSyncMessage("Không thể đồng bộ bài học từ máy chủ lúc này. Bấm Đồng bộ Cloud để thử lại.");
        })
        .finally(() => {
          if (active) setLoadingCloud(false);
        });
    } else {
      setCloudCourses([]);
      setLoadingCloud(false);
      setSyncMessage("");
    }
    return () => {
      active = false;
    };
  }, [cloud, reloadKey]);

  // Preserve built-in presentation while replacing its fixed lessons with server data.
  const allCourses = useMemo(() => {
    const list = [...builtInCourses];
    for (const remote of cloudCourses) {
      const index = list.findIndex((c) => c.id === remote.id);
      if (index >= 0) {
        list[index] = { ...list[index], lessons: remote.lessons, isCloud: true };
      } else {
        list.push(remote);
      }
    }
    return list;
  }, [builtInCourses, cloudCourses]);

  const activeCourse = useMemo(() => {
    return (
      allCourses.find((c) => c.id === activeCourseId) ||
      allCourses[0] ||
      builtInCourses[0]
    );
  }, [allCourses, activeCourseId, builtInCourses]);

  const handleReloadCloudCourse = () => {
    if (cloud) setReloadKey((n) => n + 1);
  };

  // Compute stats for each course
  const courseStats = useMemo(() => {
    const map = new Map<
      string,
      { total: number; done: number; mastered: number; percent: number }
    >();
    for (const c of allCourses) {
      const total = c.lessons.length;
      const done = c.lessons.filter((l) => progress.completed.includes(l.id)).length;
      const mastered = c.lessons.filter((l) => {
        const isDone = progress.completed.includes(l.id);
        const highScores = progress.history.filter(
          (h) => h.lesson === l.id && h.accuracy >= 0.9,
        ).length;
        return isDone && highScores >= 2;
      }).length;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;
      map.set(c.id, { total, done, mastered, percent });
    }
    return map;
  }, [allCourses, progress]);

  // Total stats across all courses
  const totalStats = useMemo(() => {
    const totalLessons = allLessons.length;
    const completedLessons = progress.completed.length;
    const overallPercent =
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { totalLessons, completedLessons, overallPercent };
  }, [allLessons, progress]);

  // Filter lessons in active course
  const displayedLessons = useMemo(() => {
    return activeCourse.lessons.filter((l) => {
      const done = progress.completed.includes(l.id);
      const unlocked = isUnlocked(l);
      if (filterMode === "completed") return done;
      if (filterMode === "available") return unlocked && !done;
      return true;
    });
  }, [activeCourse, filterMode, progress, isUnlocked]);

  // Find next recommended lesson across active course
  const nextRecommendedLesson = useMemo(() => {
    return activeCourse.lessons.find(
      (l) => !progress.completed.includes(l.id) && isUnlocked(l),
    );
  }, [activeCourse, progress, isUnlocked]);

  return (
    <div className="course-journey-wrapper">
      {/* 1. Header Overview Banner */}
      <section className="journey-hero-banner card">
        <div className="hero-banner-content">
          <div className="hero-badge">
            <Compass size={14} />
            <span>LỘ TRÌNH HỌC TẬP TOÀN DIỆN</span>
          </div>
          <h2>Hành trình chinh phục Tiếng Trung</h2>
          <p>
            Các khóa học được sắp xếp theo từng cấp độ và bài học rõ ràng.
            Học tuần tự, nắm vững chữ Hán, phát âm và phản xạ tự nhiên.
          </p>

          <div className="journey-summary-pills">
            <div className="summary-pill">
              <b>{progress.completed.length}</b>
              <span>/ {allLessons.length} bài hoàn thành</span>
            </div>
            <div className="summary-pill">
              <b>{allCourses.length}</b>
              <span>Khóa học</span>
            </div>
            <div className="summary-pill highlight">
              <b>{progress.goal}</b>
              <span>Mục tiêu hiện tại</span>
            </div>
            {cloud && (
              <button
                className="cloud-sync-btn"
                onClick={handleReloadCloudCourse}
                disabled={loadingCloud}
                title="Đồng bộ giáo trình từ Supabase"
              >
                <RefreshCw size={14} className={loadingCloud ? "spin" : ""} />
                <span>{loadingCloud ? "Đang đồng bộ…" : "Đồng bộ Cloud"}</span>
              </button>
            )}
          </div>
          {syncMessage && <p role="status" className="sync-status-text">{syncMessage}</p>}
        </div>

        <div className="hero-banner-panda">
          <Panda />
        </div>
      </section>

      {/* 2. Course Switcher Grid (Chia các khóa học) */}
      <section className="course-selector-section" aria-label="Danh sách các khóa học">
        <div className="section-header-compact">
          <div className="header-left">
            <Layers size={18} />
            <h3>Chọn khóa học của bạn</h3>
          </div>
          <span className="course-count-badge">
            {allCourses.length} khóa học có sẵn
          </span>
        </div>

        <div className="course-cards-grid">
          {allCourses.map((c) => {
            const stats = courseStats.get(c.id) || {
              total: c.lessons.length,
              done: 0,
              mastered: 0,
              percent: 0,
            };
            const isSelected = c.id === activeCourse.id;
            const Icon = c.icon;
            const isFinished = stats.done >= stats.total && stats.total > 0;

            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                className={`course-card ${isSelected ? "selected" : ""} ${isFinished ? "finished" : ""}`}
                onClick={() => setActiveCourseId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveCourseId(c.id);
                  }
                }}
              >
                <div className="course-card-top">
                  <div className="course-icon-box">
                    <Icon size={24} />
                  </div>
                  <div className="course-card-meta">
                    <span className="course-badge">{c.badge}</span>
                    <span className="course-level">{c.level}</span>
                  </div>
                </div>

                <div className="course-card-body">
                  <h4 className="course-title">{c.title}</h4>
                  <p className="course-subtitle">{c.subtitle}</p>
                </div>

                <div className="course-card-footer">
                  <div className="progress-info-row">
                    <span>Tiến độ</span>
                    <b>
                      {stats.done}/{stats.total} bài
                      {isFinished && " · Hoàn thành ✓"}
                    </b>
                  </div>
                  <div className="mini-meter">
                    <div
                      className="mini-meter-fill"
                      style={{ width: `${stats.percent}%` }}
                    />
                  </div>
                </div>

                {isSelected && (
                  <div className="selected-indicator">
                    <span>Đang xem</span>
                    <ChevronRight size={14} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Main Detail Section: Active Course & Its Lessons */}
      <div className="course-layout-main">
        {/* Left Column: Course Detail & Lesson List */}
        <main className="course-content-area">
          <section className="active-course-banner card">
            <div className="active-course-header">
              <div className="active-course-title-group">
                <span className="course-eyebrow">
                  {activeCourse.badge} · {activeCourse.level}
                </span>
                <h2>{activeCourse.title}</h2>
                <p>{activeCourse.description}</p>
              </div>

              <div className="active-course-stat-box">
                <div className="stat-circle">
                  <b>{courseStats.get(activeCourse.id)?.percent || 0}%</b>
                  <small>Hoàn thành</small>
                </div>
              </div>
            </div>

            {/* Filter Tabs for Lessons */}
            <div className="lesson-filter-bar">
              <div className="filter-buttons">
                <button
                  className={`filter-btn ${filterMode === "all" ? "active" : ""}`}
                  onClick={() => setFilterMode("all")}
                >
                  Tất cả ({activeCourse.lessons.length})
                </button>
                <button
                  className={`filter-btn ${filterMode === "available" ? "active" : ""}`}
                  onClick={() => setFilterMode("available")}
                >
                  Có thể học (
                  {
                    activeCourse.lessons.filter(
                      (l) => isUnlocked(l) && !progress.completed.includes(l.id),
                    ).length
                  }
                  )
                </button>
                <button
                  className={`filter-btn ${filterMode === "completed" ? "active" : ""}`}
                  onClick={() => setFilterMode("completed")}
                >
                  Đã hoàn thành (
                  {
                    activeCourse.lessons.filter((l) =>
                      progress.completed.includes(l.id),
                    ).length
                  }
                  )
                </button>
              </div>

              {nextRecommendedLesson && (
                <button
                  className="quick-continue-btn primary"
                  onClick={() => onStudy(nextRecommendedLesson)}
                >
                  <span>Học tiếp: {nextRecommendedLesson.title.split("·")[0]}</span>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </section>

          {/* Lessons List in the Course */}
          <section
            className="lessons-container"
            aria-label={`Danh sách bài học của ${activeCourse.title}`}
          >
            {displayedLessons.length === 0 ? (
              <div className="empty-lessons-box card">
                <HelpCircle size={32} />
                <p>Không có bài học nào phù hợp với bộ lọc hiện tại.</p>
                <button className="secondary" onClick={() => setFilterMode("all")}>
                  Xem toàn bộ bài học
                </button>
              </div>
            ) : (
              <div className="lesson-cards-list">
                {displayedLessons.map((lesson, idx) => {
                  const done = progress.completed.includes(lesson.id);
                  const unlocked = isUnlocked(lesson);
                  const mastered =
                    done &&
                    progress.history.filter(
                      (h) => h.lesson === lesson.id && h.accuracy >= 0.9,
                    ).length >= 2;

                  // Find prerequisite title if locked
                  const prereqs = lesson.prerequisites || lesson.learning?.prerequisites;
                  const missingPrereqId = prereqs?.find(
                    (pid) => !progress.completed.includes(pid),
                  );
                  const missingPrereq = missingPrereqId
                    ? allLessons.find((l) => l.id === missingPrereqId)
                    : undefined;

                  return (
                    <article
                      key={lesson.id}
                      className={`course-lesson-card card ${
                        mastered
                          ? "mastered"
                          : done
                            ? "completed"
                            : unlocked
                              ? "unlocked"
                              : "locked"
                      }`}
                    >
                      {/* Left: Status Icon Circle */}
                      <div className="lesson-card-status">
                        <div
                          className={`status-circle ${
                            mastered
                              ? "mastered"
                              : done
                                ? "done"
                                : unlocked
                                  ? "ready"
                                  : "locked"
                          }`}
                        >
                          {mastered ? (
                            <Star size={20} />
                          ) : done ? (
                            <Check size={20} />
                          ) : unlocked ? (
                            <span>{idx + 1}</span>
                          ) : (
                            <Lock size={18} />
                          )}
                        </div>
                      </div>

                      {/* Middle: Lesson Details */}
                      <div className="lesson-card-details">
                        <div className="lesson-meta-row">
                          <span className="step-tag">CHẶNG {idx + 1}</span>
                          <span className="time-tag">
                            <Clock size={12} /> {lesson.minutes || 15} phút
                          </span>
                          <span className="words-tag">
                            {lesson.words.length} từ vựng
                          </span>
                          <span
                            className={`status-tag ${
                              mastered
                                ? "status-mastered"
                                : done
                                  ? "status-done"
                                  : unlocked
                                    ? "status-ready"
                                    : "status-locked"
                            }`}
                          >
                            {mastered
                              ? "Thành thạo ⭐"
                              : done
                                ? "Đã hoàn thành ✓"
                                : unlocked
                                  ? "Sẵn sàng học"
                                  : "Chưa mở khóa"}
                          </span>
                        </div>

                        <h3 className="lesson-title">{lesson.title}</h3>
                        <p className="lesson-desc">{lesson.description}</p>

                        {/* Words preview pills */}
                        {lesson.words.length > 0 && (
                          <div className="lesson-words-preview">
                            <span className="preview-label">Từ mới:</span>
                            {lesson.words.slice(0, 4).map((w: Word) => (
                              <span key={w.hanzi} className="word-pill">
                                <b>{w.hanzi}</b> <small>{w.pinyin}</small>
                              </span>
                            ))}
                            {lesson.words.length > 4 && (
                              <span className="more-words">
                                +{lesson.words.length - 4} từ nữa
                              </span>
                            )}
                          </div>
                        )}

                        {/* Prerequisite warning if locked */}
                        {!unlocked && (
                          <div className="locked-warning">
                            <Lock size={14} />
                            <span>
                              Cần hoàn thành{" "}
                              <b>
                                {missingPrereq?.title || "bài học trước đó"}
                              </b>{" "}
                              để mở khóa chặng này.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: Action Buttons */}
                      <div className="lesson-card-actions">
                        {unlocked ? (
                          <button
                            className={`action-btn ${done ? "secondary" : "primary"}`}
                            onClick={() => onStudy(lesson)}
                          >
                            {done ? (
                              <>
                                <RotateCcw size={15} />
                                <span>Ôn tập lại</span>
                              </>
                            ) : (
                              <>
                                <span>Học ngay</span>
                                <ArrowRight size={15} />
                              </>
                            )}
                          </button>
                        ) : (
                          <button className="action-btn locked-btn" disabled>
                            <Lock size={15} />
                            <span>Đang khóa</span>
                          </button>
                        )}

                        <button
                          className="preview-btn text-button"
                          onClick={() => onPreview(lesson)}
                          title="Xem trước nội dung bài học"
                        >
                          <Eye size={15} />
                          <span>Xem trước</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        {/* Right Sidebar: Companion & Guidelines */}
        <aside className="course-sidebar">
          {/* Panda Companion Note */}
          <section className="card companion-card">
            <div className="companion-header">
              <Panda small />
              <div>
                <b>Bao đồng hành</b>
                <small>Người bạn học tập</small>
              </div>
            </div>
            <p className="companion-quote">
              “Học một ngôn ngữ mới như trồng một cái cây. Từng hạt mầm nhỏ hôm
              nay sẽ thành bóng mát ngày mai!”
            </p>
            <div className="companion-tip">
              <Sparkles size={16} />
              <span>
                Mỗi ngày dành 15 phút, học 1 bài và ôn tập các từ đến hạn để ghi
                nhớ sâu nhất.
              </span>
            </div>
          </section>

          {/* Quick Stats of Current Course */}
          <section className="card course-quick-stats">
            <h4>Tiến độ khóa hiện tại</h4>
            <div className="stat-bars-list">
              <div className="stat-bar-item">
                <div className="stat-bar-label">
                  <span>Bài học đã xong</span>
                  <b>
                    {courseStats.get(activeCourse.id)?.done || 0} /{" "}
                    {activeCourse.lessons.length}
                  </b>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill green"
                    style={{
                      width: `${courseStats.get(activeCourse.id)?.percent || 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="stat-bar-item">
                <div className="stat-bar-label">
                  <span>Bài đạt Thành thạo ⭐</span>
                  <b>{courseStats.get(activeCourse.id)?.mastered || 0} bài</b>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill gold"
                    style={{
                      width: `${
                        activeCourse.lessons.length > 0
                          ? Math.round(
                              ((courseStats.get(activeCourse.id)?.mastered || 0) /
                                activeCourse.lessons.length) *
                                100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mastery-rule-box">
              <Award size={16} />
              <p>
                Đạt từ <b>70%</b> để mở bài tiếp theo. Hoàn thành <b>90%</b> từ
                2 lần trở lên để đạt huy hiệu <b>Thành thạo ⭐</b>.
              </p>
            </div>
          </section>

          {/* Developer / Teacher Preview JSON (Tucked neatly in details) */}
          <details className="card dev-tools-details">
            <summary>
              <FileCode size={15} />
              <span>Dành cho biên soạn giáo trình JSON</span>
            </summary>
            <p className="dev-tools-hint">
              Kiểm tra nhanh file bundle JSON trong trình duyệt trước khi xuất bản.
            </p>
            <input
              aria-label="Tải file giáo trình JSON"
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setPreviewBundle(undefined);
                if (!file) return;
                try {
                  if (file.size > 2000000)
                    throw new Error("File tối đa 2 MB cho bản xem trước.");
                  const b = validateBundle(JSON.parse(await file.text()));
                  setPreviewBundle(b);
                  setJsonError("JSON hợp lệ! Bạn có thể chọn bài để xem trước.");
                } catch (err) {
                  setJsonError(
                    err instanceof Error ? err.message : "JSON không hợp lệ",
                  );
                }
              }}
            />
            {jsonError && <p className="json-status-text">{jsonError}</p>}
            {previewBundle && (
              <div className="preview-bundle-list">
                <b>
                  {previewBundle.title} ({previewBundle.status})
                </b>
                {previewBundle.lessons.map((l) => (
                  <button
                    key={l.id}
                    className="secondary mini-btn"
                    onClick={() => {
                      const compiled = compileBundle(previewBundle).find(
                        (c) => c.id === l.id,
                      );
                      if (compiled) setPreviewGameLesson(compiled);
                    }}
                  >
                    Xem thử: {l.title}
                  </button>
                ))}
              </div>
            )}
          </details>
        </aside>
      </div>

      {/* Preview modal for Dev bundle if triggered */}
      {previewGameLesson && (
        <Game
          lesson={previewGameLesson}
          sound={true}
          onClose={() => setPreviewGameLesson(undefined)}
          onComplete={() => setPreviewGameLesson(undefined)}
          previewMode
        />
      )}
    </div>
  );
}
