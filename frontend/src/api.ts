const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

function errorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Не удалось выполнить запрос";
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const error = item as { msg: unknown; loc?: unknown[] };
          const field = String(error.loc?.at(-1) || "");
          const labels: Record<string, string> = {
            title: "Название", description: "Описание", starts_at: "Дата и время",
            venue: "Площадка", address: "Адрес", price: "Стоимость",
            male_capacity: "Мест для мужчин", female_capacity: "Мест для девушек",
            age_min: "Возраст от", age_max: "Возраст до", name: "Имя", phone: "Номер телефона",
            birth_date: "Дата рождения", email: "Email", telegram: "Telegram",
          };
          const label = labels[field] || "Поле";
          const raw = String(error.msg).replace(/^Value error,\s*/, "");
          const short = raw.match(/^String should have at least (\d+) characters?$/);
          if (short) return `${label}: минимум ${short[1]} символа(ов)`;
          const long = raw.match(/^String should have at most (\d+) characters?$/);
          if (long) return `${label}: максимум ${long[1]} символа(ов)`;
          if (raw === "Field required") return `Заполните поле «${label}»`;
          if (raw.startsWith("Input should be greater than")) return `${label}: значение должно быть больше нуля`;
          return raw;
        }
        return "";
      })
      .filter(Boolean);
    if (messages.length) return messages.join(". ");
  }
  return "Не удалось выполнить запрос";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("realdate_token");
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Не удалось связаться с сервером. Попробуйте ещё раз");
  }
  if (!response.ok) {
    let message = "Не удалось выполнить запрос";
    try {
      const data = await response.json();
      message = errorMessage(data);
    } catch {
      /* noop */
    }
    throw new ApiError(message, response.status);
  }
  return response.json();
}

export const api = {
  publicEvents: () => request<Event[]>("/public/events"),
  requestCode: (phone: string) =>
    request<{
      sent: boolean;
      channel: string;
      status_token?: string;
      delivery_status?: OtpDeliveryStatus;
      dev_code?: string;
    }>("/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  codeStatus: (statusToken: string) =>
    request<{ status: OtpDeliveryStatus; expires_at: string }>(
      `/auth/code-status/${encodeURIComponent(statusToken)}`,
    ),
  verify: (phone: string, code: string) =>
    request<{ access_token: string; user: User }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),
  me: () => request<User>("/me"),
  updateMe: (data: ProfileUpdate) =>
    request<User>("/me", { method: "PUT", body: JSON.stringify(data) }),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ photo_url: string }>("/me/photo", {
      method: "POST",
      body: form,
    });
  },
  events: () => request<Event[]>("/events"),
  event: (id: number) => request<Event>(`/events/${id}`),
  register: (
    id: number,
    consents: {
      personal_data_consent: boolean;
      prepayment_consent: boolean;
      adult_confirmation: boolean;
    },
  ) =>
    request<{
      registered: boolean;
      waitlisted: boolean;
      waitlist_position?: number;
      notification: { title: string; body: string };
    }>(`/events/${id}/register`, {
      method: "POST",
      body: JSON.stringify(consents),
    }),
  like: (id: number, target_user_id: number, liked: boolean) =>
    request(`/events/${id}/like`, {
      method: "PUT",
      body: JSON.stringify({ target_user_id, liked }),
    }),
  quiz: (eventId: number) => request<ParticipantQuiz>(`/events/${eventId}/quiz`),
  submitQuiz: (eventId: number, answers: QuizSubmissionAnswer[]) =>
    request<{ completed: boolean }>(`/events/${eventId}/quiz/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  notifications: () => request<Notice[]>("/notifications"),
  unreadNotifications: () =>
    request<{ unread: number }>("/notifications/unread-count"),
  readAllNotifications: () =>
    request<{ read: boolean }>("/notifications/read-all", { method: "POST" }),
  telegramStatus: () => request<TelegramNotificationStatus>("/telegram/status"),
  createTelegramLink: () =>
    request<{ url: string; expires_in: number }>("/telegram/link", { method: "POST" }),
  disconnectTelegram: () =>
    request<{ disconnected: boolean }>("/telegram/link", { method: "DELETE" }),
  createEvent: (data: unknown) =>
    request<{ id: number }>("/admin/events", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  adminEvent: (id: number) => request<AdminEvent>(`/admin/events/${id}`),
  adminQuiz: (id: number) => request<AdminQuiz>(`/admin/events/${id}/quiz`),
  uploadQuizImage: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ image_url: string }>(`/admin/events/${id}/quiz/image`, { method: "POST", body: form });
  },
  saveAdminQuiz: (id: number, data: QuizEditorPayload) =>
    request<{ saved: boolean; id: number }>(`/admin/events/${id}/quiz`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  changeQuizStatus: (id: number, action: "launch" | "publish") =>
    request<{ status: QuizStatus }>(`/admin/events/${id}/quiz/status?action=${action}`, { method: "PATCH" }),
  deleteEvent: (id: number) =>
    request<{ deleted: boolean }>(`/admin/events/${id}`, { method: "DELETE" }),
  moderate: (id: number, paid?: boolean, confirmed?: boolean) =>
    request(
      `/admin/registrations/${id}?${new URLSearchParams({ ...(paid !== undefined ? { paid: String(paid) } : {}), ...(confirmed !== undefined ? { confirmed: String(confirmed) } : {}) })}`,
      { method: "PATCH" },
    ),
  changeStatus: (id: number, status: string) =>
    request(`/admin/events/${id}/status?status=${status}`, { method: "PATCH" }),
};

export type Gender = "male" | "female";
export type OtpDeliveryStatus = "pending" | "sent" | "delivered" | "read" | "expired" | "revoked" | "failed";
export type User = {
  id: number;
  phone: string;
  email?: string;
  name?: string;
  gender?: Gender;
  birth_date?: string;
  age?: number;
  bio?: string;
  photo_url?: string;
  telegram?: string;
  whatsapp?: string;
  max_phone?: string;
  is_admin: boolean;
};
export type ProfileUpdate = {
  name: string;
  gender: Gender;
  birth_date: string;
  email?: string;
  bio?: string;
  telegram: string;
  whatsapp?: string;
  max_phone?: string;
};
export type Registration = {
  id: number;
  status: "awaiting_payment" | "confirmed" | "rejected" | "waitlisted";
  paid: boolean;
  participant_number?: number;
  waitlist_position?: number;
};
export type QuizStatus = "draft" | "active" | "results";
export type QuizQuestionType = "single" | "multiple" | "text";
export type QuizSummary = {
  status: QuizStatus;
  completed: boolean;
  results_published: boolean;
  score?: number;
};
export type Person = User & {
  number: number;
  choice?: boolean;
  mutual?: boolean;
};
export type Event = {
  id: number;
  title: string;
  description: string;
  starts_at: string;
  venue: string;
  address: string;
  price: number;
  status: "registration" | "live" | "finished" | "cancelled";
  male_capacity: number;
  female_capacity: number;
  age_min?: number;
  age_max?: number;
  male_taken: number;
  female_taken: number;
  place_available?: boolean;
  waitlist_count: number;
  registration?: Registration;
  participants?: Person[];
  quiz?: QuizSummary;
};
export type Notice = {
  id: number;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};
export type TelegramNotificationStatus = {
  configured: boolean;
  connected: boolean;
  bot_username?: string;
};
export type AdminRegistration = {
  id: number;
  status: string;
  paid: boolean;
  number?: number;
  user: User;
};
export type AdminSympathyUser = User & { number?: number };
export type QuizPublicQuestion = {
  id: number;
  prompt: string;
  question_type: QuizQuestionType;
  points: number;
  image_url?: string;
  options: { id: number; text: string }[];
};
export type ParticipantQuiz = {
  id: number;
  title: string;
  status: "active" | "results";
  completed: boolean;
  score?: number;
  max_score?: number;
  questions: QuizPublicQuestion[];
};
export type QuizSubmissionAnswer = {
  question_id: number;
  selected_option_ids?: number[];
  text_answer?: string;
};
export type QuizEditorOption = {
  id?: number;
  text: string;
  is_correct: boolean;
};
export type QuizEditorQuestion = {
  id?: number;
  prompt: string;
  question_type: QuizQuestionType;
  points: number;
  image_url?: string;
  options: QuizEditorOption[];
  correct_text?: string;
};
export type QuizEditorPayload = {
  title: string;
  questions: QuizEditorQuestion[];
};
export type AdminQuizParticipant = {
  user: User;
  number?: number;
  completed: boolean;
  score?: number;
  is_winner: boolean;
  completed_at?: string;
  answers: {
    question_id: number;
    prompt: string;
    answer: string | string[];
    awarded_points: number;
    max_points: number;
    correct: boolean;
  }[];
};
export type AdminQuiz = QuizEditorPayload & {
  id?: number | null;
  status: "none" | QuizStatus;
  max_score: number;
  completed_count: number;
  participant_count: number;
  all_completed: boolean;
  participants: AdminQuizParticipant[];
};
export type AdminEvent = Event & {
  status_warning?: {
    code: string;
    title: string;
    body: string;
  } | null;
  registrations: AdminRegistration[];
  stats: {
    registrations: number;
    confirmed: number;
    waitlisted: number;
    revenue: number;
    likes: number;
    matches: number;
  };
  sympathies: {
    matches: { first: AdminSympathyUser; second: AdminSympathyUser }[];
    one_sided: { from: AdminSympathyUser; to: AdminSympathyUser }[];
  };
};
