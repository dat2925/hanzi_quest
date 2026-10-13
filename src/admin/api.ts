import { supabase } from "../cloud/client";
import type {
  AdminAccess,
  AdminOverview,
  AdminUserRow,
  AdminUserDetail,
  AdminCourseRow,
  AdminChapterRow,
  AdminLessonRow,
  AdminAuditRow,
  PageResult,
  AdminAction,
  AdminCommandPayloads,
  AdminCommandResult,
} from "./platform-types";

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}
function reportAccessFailure(status: number, code: string, path: string) {
  if ((status === 401 || status === 403) && path !== "/access")
    window.dispatchEvent(
      new CustomEvent("hanzi-admin-access-lost", { detail: { status, code } }),
    );
}
const commandIdentities = new Map<
  string,
  { fingerprint: string; id: string }
>();

async function getAccessToken(): Promise<string> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) {
    reportAccessFailure(401, "AUTH_REQUIRED", "/session");
    throw new AdminApiError(
      401,
      "AUTH_REQUIRED",
      "Hãy đăng nhập tài khoản quản trị.",
    );
  }
  return token;
}

export async function adminFetch<T>(
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const token = await getAccessToken();
  const searchParams = new URLSearchParams();

  if (options.query) {
    for (const [key, val] of Object.entries(options.query)) {
      if (val !== undefined && val !== null && val !== "") {
        searchParams.set(key, String(val));
      }
    }
  }

  const queryString = searchParams.toString();
  const url = `/api/admin${path}${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "omit",
    cache: "no-store",
    signal: options.signal,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorCode =
      typeof body.error === "string" ? body.error : `HTTP_${response.status}`;
    reportAccessFailure(response.status, errorCode, path);
    throw new AdminApiError(response.status, errorCode, errorCode);
  }

  return body as T;
}

export async function adminCommand<A extends AdminAction>(
  action: A,
  payload: AdminCommandPayloads[A],
  signal?: AbortSignal,
): Promise<AdminCommandResult> {
  const token = await getAccessToken();
  const url = `/api/admin/commands/${action}`;
  const { requestId, ...values } = payload;
  const fingerprint = JSON.stringify({ action, values });
  const old = commandIdentities.get(requestId);
  const identity =
    old?.fingerprint === fingerprint
      ? old
      : { fingerprint, id: old ? crypto.randomUUID() : requestId };
  commandIdentities.set(requestId, identity);
  if (commandIdentities.size > 256)
    commandIdentities.delete(commandIdentities.keys().next().value!);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "omit",
    cache: "no-store",
    body: JSON.stringify({ ...payload, requestId: identity.id }),
    signal,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorCode =
      typeof body.error === "string" ? body.error : `HTTP_${response.status}`;
    reportAccessFailure(response.status, errorCode, "/commands");
    throw new AdminApiError(response.status, errorCode, errorCode);
  }

  return body as AdminCommandResult;
}

// Check general admin access or curriculum access
export async function checkAdminAccess(signal?: AbortSignal): Promise<{
  access: AdminAccess | null;
  editorOnly: boolean;
  status: 200 | 401 | 403 | 503 | 0;
  error?: string;
}> {
  try {
    const access = await adminFetch<AdminAccess>("/access", { signal });
    return { access, editorOnly: false, status: 200 };
  } catch (err) {
    if (err instanceof AdminApiError) {
      if (err.status === 403 || err.code === "ADMIN_MIGRATION_REQUIRED") {
        // Test if user has curriculum editor access
        try {
          const token = await getAccessToken();
          const editorRes = await fetch("/api/admin/curriculum/access", {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "omit",
            cache: "no-store",
            signal,
          });
          if (editorRes.ok) {
            return { access: null, editorOnly: true, status: 200 };
          }
          if (editorRes.status !== 403)
            return {
              access: null,
              editorOnly: false,
              status: editorRes.status === 401 ? 401 : 503,
              error: "Không xác minh được quyền biên tập. Hãy thử lại.",
            };
        } catch {
          return {
            access: null,
            editorOnly: false,
            status: 0,
            error: "Không kết nối được máy chủ để xác minh quyền biên tập.",
          };
        }
        return {
          access: null,
          editorOnly: false,
          status: err.status === 503 ? 503 : 403,
          error: err.code,
        };
      }
      return {
        access: null,
        editorOnly: false,
        status: err.status === 401 ? 401 : err.status === 503 ? 503 : 0,
        error: err.code,
      };
    }
    return { access: null, editorOnly: false, status: 0, error: String(err) };
  }
}

// Typed API Helpers
export const AdminApi = {
  getOverview: (signal?: AbortSignal) =>
    adminFetch<AdminOverview>("/overview", { signal }),

  getUsers: (
    params: {
      search?: string;
      status?: "active" | "suspended";
      role?: "learner" | "editor" | "admin";
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) =>
    adminFetch<PageResult<AdminUserRow>>("/users", { query: params, signal }),

  getUserDetail: (
    id: string,
    params?: { limit?: number; offset?: number },
    signal?: AbortSignal,
  ) => adminFetch<AdminUserDetail>(`/users/${id}`, { query: params, signal }),

  getCourses: (
    params?: { search?: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ) =>
    adminFetch<PageResult<AdminCourseRow>>("/courses", {
      query: params,
      signal,
    }),

  getChapters: (
    params: { courseId: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ) =>
    adminFetch<PageResult<AdminChapterRow>>("/chapters", {
      query: params,
      signal,
    }),

  getLessons: (
    params?: {
      courseId?: string;
      chapterId?: string;
      status?: "draft" | "reviewed" | "published" | "hidden";
      search?: string;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal,
  ) =>
    adminFetch<PageResult<AdminLessonRow>>("/lessons", {
      query: params,
      signal,
    }),

  getAudit: (
    params?: { search?: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ) =>
    adminFetch<PageResult<AdminAuditRow>>("/audit", { query: params, signal }),
};
export async function allAdminCourses(signal?: AbortSignal) {
  const items: AdminCourseRow[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await AdminApi.getCourses({ limit: 100, offset }, signal);
    items.push(...page.items);
    if (offset + page.items.length >= page.total || !page.items.length)
      return items;
  }
}
export async function allAdminChapters(courseId: string, signal?: AbortSignal) {
  const items: AdminChapterRow[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await AdminApi.getChapters(
      { courseId, limit: 100, offset },
      signal,
    );
    items.push(...page.items);
    if (offset + page.items.length >= page.total || !page.items.length)
      return items;
  }
}

// Formats dates in Vietnam timezone (Asia/Ho_Chi_Minh)
export function formatVietnamDateTime(
  isoString: string | null | undefined,
): string {
  if (!isoString) return "Chưa có";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Không hợp lệ";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return isoString;
  }
}

// User-friendly error messages in Vietnamese
export function formatAdminErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    switch (error.code) {
      case "AUTH_REQUIRED":
        return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
      case "PLATFORM_ADMIN_REQUIRED":
        return "Tài khoản của bạn không có quyền Quản trị viên nền tảng.";
      case "ACCOUNT_SUSPENDED":
        return "Tài khoản của bạn hiện đang bị tạm khóa sử dụng HanziOne.";
      case "ADMIN_MIGRATION_REQUIRED":
        return "Hệ thống backend chưa được cài đặt migration quản trị (503). Vui lòng liên hệ quản trị hệ thống.";
      case "ADMIN_SERVER_NOT_CONFIGURED":
        return "Máy chủ chưa được cấu hình biến môi trường quản trị.";
      case "REVISION_CONFLICT":
        return "Dữ liệu đã được cập nhật bởi một người khác. Vui lòng tải lại trang để xem bản mới nhất.";
      case "PROFILE_CHANGED":
        return "Hồ sơ người dùng đã có thay đổi mới từ học viên hoặc quản trị viên khác. Vui lòng kiểm tra lại.";
      case "REQUEST_ID_CONFLICT":
        return "Mã yêu cầu đã được dùng cho nội dung khác. Hãy đóng và mở lại form để gửi yêu cầu mới.";
      case "PUBLISHED_DEPENDENTS_EXIST":
        return "Không thể ẩn bài học này vì đang có bài học đã xuất bản khác phụ thuộc vào nó. Hãy ẩn các bài học phụ thuộc trước.";
      case "DRAFT_DEPENDENTS_EXIST":
        return "Không thể xóa bản nháp này vì đang có bản nháp khác phụ thuộc vào nó.";
      case "USE_REVIEW_PUBLISH_WORKFLOW":
        return "Bản nháp này chưa được xuất bản. Vui lòng sử dụng quy trình Duyệt và Xuất bản giáo trình.";
      case "PUBLISHED_CONTENT_IMMUTABLE":
        return "Nội dung bài học đã xuất bản là bất biến để bảo vệ tiến độ học tập. Muốn đổi nội dung, vui lòng tạo bài mới.";
      case "COURSE_VERSION_IMMUTABLE":
        return "Không thể thay đổi phiên bản giáo trình của khóa học đã có. Vui lòng tạo khóa học mới cho phiên bản mới.";
      case "DEMOTE_ADMIN_BEFORE_SUSPENDING":
        return "Không thể khóa tài khoản Quản trị viên. Hãy hạ vai trò của tài khoản này xuống Người học trước khi tạm khóa.";
      case "SELF_ROLE_CHANGE_FORBIDDEN":
        return "Bạn không thể tự thay đổi vai trò quản trị của chính mình.";
      case "SELF_ACCESS_CHANGE_FORBIDDEN":
        return "Bạn không thể tự khóa tài khoản của chính mình.";
      case "EXISTING_LESSON_CANNOT_DELETE":
        return "Không thể xóa bản nháp vì bài học đã tồn tại trong danh mục bài học.";
      case "PREREQUISITE_NOT_PUBLISHED":
        return "Không thể khôi phục bài học này vì bài học tiên quyết của nó đang bị ẩn hoặc chưa xuất bản.";
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "Đã xảy ra lỗi không xác định.";
}
