import { useEffect, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Award,
  CakeSlice,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  Copy,
  Heart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Phone,
  Plus,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  api,
  AdminEvent,
  AdminQuiz,
  AdminSympathyUser,
  Event,
  ParticipantQuiz,
  OtpDeliveryStatus,
  Person,
  QuizEditorQuestion,
  QuizQuestionType,
  QuizSubmissionAnswer,
  User,
} from "./api";
import PublicSite, { PublicDocumentPage } from "./PublicSite";
import { publicConfig } from "./public-config";

type AgeDecision = "adult" | "underage" | null;

const AGE_CONFIRMATION_COOKIE = "realdate_age_confirmation";
const PUBLIC_LEGAL_PATHS = new Set([
  "/offer",
  "/privacy",
  "/personal-data-consent",
  "/payment-and-refund",
  "/contacts",
]);

const readAgeDecision = (): AgeDecision => {
  const value = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${AGE_CONFIRMATION_COOKIE}=`))
    ?.split("=")[1];
  return value === "adult" || value === "underage" ? value : null;
};

const saveAgeDecision = (decision: Exclude<AgeDecision, null>) => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AGE_CONFIRMATION_COOKIE}=${decision}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
};

function AgeGate({ onDecision }: { onDecision: (decision: Exclude<AgeDecision, null>) => void }) {
  return (
    <main className="age-gate-screen">
      <section className="age-gate-card" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
        <div className="age-gate-brand" aria-label="REALDATE quickly">
          <b>REALDATE</b>
          <small>quickly</small>
        </div>
        <div className="age-gate-badge"><ShieldCheck /><span>Только для совершеннолетних</span></div>
        <h1 id="age-gate-title">Подтвердите возраст</h1>
        <p>Сайт предназначен для лиц старше 18 лет. Подтвердите, что вам исполнилось 18 лет.</p>
        <div className="age-gate-actions">
          <button type="button" className="age-gate-accept" onClick={() => onDecision("adult")}>
            Мне исполнилось 18 лет
          </button>
          <button type="button" className="age-gate-decline" onClick={() => onDecision("underage")}>
            Мне нет 18 лет
          </button>
        </div>
        <small className="age-gate-note">Ответ сохраняется в cookie на этом устройстве.</small>
        <nav className="age-gate-links" aria-label="Юридические документы">
          <NavLink to="/privacy">Конфиденциальность</NavLink>
          <NavLink to="/offer">Публичная оферта</NavLink>
          <NavLink to="/contacts">Контакты</NavLink>
        </nav>
      </section>
    </main>
  );
}

function AgeRestricted({ onReset }: { onReset: () => void }) {
  return (
    <main className="age-gate-screen">
      <section className="age-gate-card age-restricted-card">
        <div className="age-gate-brand" aria-label="REALDATE quickly">
          <b>REALDATE</b>
          <small>quickly</small>
        </div>
        <div className="age-gate-badge"><ShieldCheck /><span>Ограничение 18+</span></div>
        <h1>Доступ ограничен</h1>
        <p>Регистрация, просмотр мероприятий и участие в них доступны только пользователям, которым исполнилось 18 лет.</p>
        <NavLink className="age-gate-accept" to="/contacts">Контакты организатора</NavLink>
        <nav className="age-gate-links" aria-label="Юридические документы">
          <NavLink to="/privacy">Конфиденциальность</NavLink>
          <NavLink to="/offer">Публичная оферта</NavLink>
          <NavLink to="/payment-and-refund">Оплата и возврат</NavLink>
        </nav>
        <button type="button" className="age-gate-reset" onClick={onReset}>Изменить ответ</button>
      </section>
    </main>
  );
}

const apiOrigin = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  return apiUrl.startsWith("http") ? new URL(apiUrl).origin : "";
})();
const asset = (url?: string) => url ? (url.startsWith("http") ? url : `${apiOrigin}${url}`) : "";
const money = (n: number) => new Intl.NumberFormat("ru-RU").format(n) + " ₽";
const plural = (n: number, one: string, few: string, many: string) => {
  const value = Math.abs(n) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};
const points = (n: number) => `${n} ${plural(n, "балл", "балла", "баллов")}`;
const dt = (value: string) =>
  format(new Date(value), "d MMMM, HH:mm", { locale: ru });
const ageFromBirthDate = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age;
};
const latestAdultBirthDate = () => {
  const value = new Date();
  value.setFullYear(value.getFullYear() - 18);
  return format(value, "yyyy-MM-dd");
};
const normalizeRussianPhoneDigits = (value: string) => {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && (digits.startsWith("7") || digits.startsWith("8"))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
};
const formatRussianPhoneDigits = (value: string) => {
  const digits = normalizeRussianPhoneDigits(value);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
  ].filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
  return `${parts[0]} ${parts[1]}-${parts[2]}${parts[3] ? `-${parts[3]}` : ""}`;
};
const SUPPORT_PHONE = publicConfig.supportPhone;
const SUPPORT_PHONE_LINK = `tel:+${SUPPORT_PHONE.replace(/\D/g, "")}`;
const SUPPORT_TELEGRAM_LINK =
  `tg://resolve?domain=${publicConfig.supportTelegram}&text=Здравствуйте%21%20Нужна%20помощь%20по%20REALDATE`;
const NOTIFICATIONS_CHANGED_EVENT = "realdate:notifications-changed";
const notificationCountLabel = (count: number) => count > 9 ? "9+" : String(count);
const telegramUsername = (value?: string) => {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(normalized)
    ? normalized
    : null;
};
const participantTelegramLink = (user: User) => {
  const draft = encodeURIComponent(
    `Здравствуйте, ${user.name || "участник"}! Пишет организатор REALDATE.`,
  );
  const username = telegramUsername(user.telegram);
  if (username) return `tg://resolve?domain=${username}&text=${draft}`;
  const phone = user.phone.replace(/\D/g, "");
  return `tg://resolve?phone=${phone}&text=${draft}`;
};

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={`logo ${light ? "logo-light" : ""}`}>
      <span>REALDATE</span>
      <small>quickly</small>
    </div>
  );
}

function SupportContacts({ auth = false }: { auth?: boolean }) {
  return (
    <div className={`support-card ${auth ? "support-auth" : ""}`}>
      <span>Поддержка</span>
      <a href={SUPPORT_PHONE_LINK} aria-label={`Позвонить в поддержку ${SUPPORT_PHONE}`}>
        <Phone />
        <div>
          <b>Позвонить</b>
          <small>{SUPPORT_PHONE}</small>
        </div>
      </a>
      <a
        href={SUPPORT_TELEGRAM_LINK}
        aria-label="Написать в поддержку в Telegram"
      >
        <Send />
        <div>
          <b>Telegram</b>
          <small>@{publicConfig.supportTelegram}</small>
        </div>
      </a>
      {!auth && (
        <div className="developer-promo">
          <span>Разработка сайта</span>
          <a href="https://t.me/net_eugene" target="_blank" rel="noreferrer" aria-label="Заказать разработку сайта в Telegram">
            <Send />
            <div>
              <b>Заказать сайт</b>
              <small>@net_eugene</small>
            </div>
          </a>
          <a href="tel:+79990800137" aria-label="Позвонить разработчику сайта +7 999 080-01-37">
            <Phone />
            <div>
              <b>Разработчик</b>
              <small>+7 999 080-01-37</small>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}

function Auth({ onDone }: { onDone: (user: User) => void }) {
  const [authMode, setAuthMode] = useState<"telegram" | "event">("telegram");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [deliveryToken, setDeliveryToken] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<OtpDeliveryStatus | null>(null);

  useEffect(() => {
    if (step !== 2 || deliveryChannel !== "telegram" || !deliveryToken || !deliveryStatus || ["delivered", "read", "expired", "revoked", "failed"].includes(deliveryStatus))
      return;
    let stopped = false;
    const checkStatus = async () => {
      try {
        const result = await api.codeStatus(deliveryToken);
        if (!stopped) setDeliveryStatus(result.status);
      } catch {
        // Кратковременная ошибка проверки не мешает ввести уже полученный код.
      }
    };
    const timer = window.setInterval(checkStatus, 2500);
    void checkStatus();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [step, deliveryChannel, deliveryToken, deliveryStatus]);

  const resetCodeStep = () => {
    setStep(1);
    setCode("");
    setHint("");
    setError("");
    setDeliveryToken("");
    setDeliveryChannel("");
    setDeliveryStatus(null);
  };

  const changeAuthMode = (mode: "telegram" | "event") => {
    setAuthMode(mode);
    resetCodeStep();
  };

  const deliveryFailed = deliveryStatus === "expired" || deliveryStatus === "revoked" || deliveryStatus === "failed";
  const deliveryReady = deliveryStatus === "delivered" || deliveryStatus === "read";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (phone.length !== 10) {
      setError("Введите 10 цифр номера после +7");
      return;
    }
    if (authMode === "event" && code.length !== 6) {
      setError("Введите шестизначный код мероприятия");
      return;
    }
    if (authMode === "telegram" && step === 2 && code.length !== 4) {
      setError("Введите четырёхзначный код из сообщения");
      return;
    }
    setLoading(true);
    try {
      const fullPhone = `+7${phone}`;
      if (authMode === "event") {
        const data = await api.verifyEventCode(fullPhone, code);
        localStorage.setItem("realdate_token", data.access_token);
        onDone(data.user);
      } else if (step === 1) {
        const data = await api.requestCode(fullPhone);
        setStep(2);
        setDeliveryToken(data.status_token || "");
        setDeliveryChannel(data.channel);
        setDeliveryStatus(data.delivery_status || "sent");
        if (import.meta.env.DEV && data.dev_code)
          setHint(`Код для локального запуска: ${data.dev_code}`);
      } else {
        const data = await api.verify(fullPhone, code);
        localStorage.setItem("realdate_token", data.access_token);
        onDone(data.user);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-brand">
        <Logo light />
        <div className="auth-copy">
          <span className="eyebrow light">Знакомства, которые случаются</span>
          <h1>
            Не свайпай.
            <br />
            <em>Встречайся.</em>
          </h1>
          <p>
            Живые знакомства с теми, кто тоже готов отложить телефон и начать
            разговор.
          </p>
        </div>
        <div className="brand-orbit">
          <Heart fill="currentColor" />
        </div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-card" onSubmit={submit}>
          <div className="mobile-logo">
            <Logo />
          </div>
          <span className="eyebrow">Добро пожаловать</span>
          <h2>{authMode === "event" ? "Вход на мероприятие" : step === 1 ? "Начнём знакомство" : "Подтвердите номер"}</h2>
          <p>
            {authMode === "event"
              ? "Введите номер аккаунта и резервный код, который сообщил организатор."
              : step === 1
              ? "Введите номер — пришлём короткий код в Telegram."
              : deliveryFailed
                ? "Telegram не доставил сообщение. Запросите новый код."
                : deliveryReady
                  ? "Код доставлен в Telegram. Введите его ниже."
                  : "Telegram принял сообщение. Проверяем доставку — обычно это занимает несколько секунд."}
          </p>
          <div className="auth-mode-tabs" role="tablist" aria-label="Способ входа">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "telegram"}
              className={authMode === "telegram" ? "active" : ""}
              onClick={() => changeAuthMode("telegram")}
            >
              Код в Telegram
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "event"}
              className={authMode === "event" ? "active" : ""}
              onClick={() => changeAuthMode("event")}
            >
              Код мероприятия
            </button>
          </div>
          {authMode === "event" && (
            <div className="event-code-note">
              <ShieldCheck />
              <span>Доступен только подтверждённым участникам, пока мероприятие идёт.</span>
            </div>
          )}
          {authMode === "telegram" && step === 2 && (
            <div className={`otp-phone ${deliveryFailed ? "otp-phone-failed" : deliveryReady ? "otp-phone-ready" : ""}`}>
              <span>{deliveryFailed ? "Не доставлен на" : deliveryReady ? "Доставлен на" : "Отправляем на"}</span>
              <strong>+7 {formatRussianPhoneDigits(phone)}</strong>
            </div>
          )}
          {authMode === "telegram" && step === 2 && deliveryChannel === "telegram" && (
            <div className={`otp-delivery-status ${deliveryFailed ? "failed" : deliveryReady ? "ready" : "pending"}`} role="status">
              {deliveryFailed ? <X /> : deliveryReady ? <Check /> : <Clock3 />}
              <span>
                {deliveryFailed
                  ? "Код не доставлен. Деньги за недоставленное сообщение возвращаются на баланс Gateway автоматически."
                  : deliveryReady
                    ? "Сообщение доставлено"
                    : "Ожидаем подтверждение доставки от Telegram"}
              </span>
            </div>
          )}
          {(authMode === "event" || step === 1) && (
            <label>
              Номер телефона
              <div className="phone-field">
                <span>+7</span>
                <input
                  autoFocus
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="999 123-45-67"
                  value={formatRussianPhoneDigits(phone)}
                  onChange={(e) => setPhone(normalizeRussianPhoneDigits(e.target.value))}
                />
              </div>
            </label>
          )}
          {(authMode === "event" || step === 2) && (
            <label>
              {authMode === "event" ? "Код мероприятия" : "Код из сообщения"}
              <input
                className="code-field"
                autoFocus={authMode === "telegram"}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={authMode === "event" ? 6 : 4}
                placeholder={authMode === "event" ? "••••••" : "••••"}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          )}
          {hint && <div className="dev-hint">{hint}</div>}
          {error && <div className="error">{error}</div>}
          <button className="primary wide" disabled={loading || (step === 2 && deliveryFailed)}>
            {loading
              ? "Подождите…"
              : authMode === "event"
                ? "Войти на мероприятие"
                : step === 1
                ? "Получить код"
                : "Продолжить"}
          </button>
          {authMode === "telegram" && step === 2 && (
            <button
              type="button"
              className="text-button"
              onClick={resetCodeStep}
            >
              {deliveryFailed ? "Запросить новый код" : "Изменить номер"}
            </button>
          )}
          <small className="legal">
            Продолжая, вы принимаете <NavLink to="/offer">условия сервиса</NavLink> и{" "}
            <NavLink to="/privacy">политику конфиденциальности</NavLink>.
          </small>
          <SupportContacts auth />
        </form>
      </section>
    </div>
  );
}

function Shell({
  user,
  setUser,
}: {
  user: User;
  setUser: (u: User | null) => void;
}) {
  const location = useLocation();
  const [mobile, setMobile] = useState(false);
  const [unreadNotices, setUnreadNotices] = useState(0);
  const refreshUnreadNotices = () => {
    api.unreadNotifications()
      .then(({ unread }) => setUnreadNotices(unread))
      .catch(() => undefined);
  };
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    void refreshUnreadNotices();
    const handleNotificationsChanged = () => void refreshUnreadNotices();
    const interval = window.setInterval(refreshUnreadNotices, 30_000);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    };
  }, [user.id, user.is_admin]);
  const items = [
    { to: "/", icon: CalendarDays, label: "События" },
    { to: "/my-events", icon: CalendarCheck2, label: "Мои встречи" },
    { to: "/history", icon: Clock3, label: "История" },
    { to: "/notices", icon: Bell, label: "Уведомления" },
    { to: "/profile", icon: UserRound, label: "Профиль" },
  ];
  if (user.is_admin)
    items.splice(1, 0, {
      to: "/admin",
      icon: LayoutDashboard,
      label: "Управление",
    });
  return (
    <div className={`app-shell ${mobile ? "menu-open" : ""}`}>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="side-top">
          <Logo />
          <button
            className="icon-button close-menu"
            aria-label="Закрыть меню"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>
        {user.is_admin && (
          <div className="admin-badge">
            <ShieldCheck />
            Администратор
          </div>
        )}
        <nav>
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === "/"}
              onClick={() => setMobile(false)}
            >
              <i.icon />
              <span>{i.label}</span>
              {i.to === "/notices" && unreadNotices > 0 && (
                <b className="notification-count" aria-label={`${unreadNotices} непрочитанных уведомлений`}>
                  {notificationCountLabel(unreadNotices)}
                </b>
              )}
            </NavLink>
          ))}
        </nav>
        <SupportContacts />
        <button
          className="logout"
          onClick={() => {
            localStorage.removeItem("realdate_token");
            setUser(null);
          }}
        >
          <LogOut />
          Выйти
        </button>
      </aside>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
      <main>
        <header className="topbar">
          <button
            className="icon-button menu-button"
            aria-label="Открыть меню"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="top-mobile-logo">
            <Logo />
          </div>
          <div className="top-actions">
            {user.is_admin && (
              <div className="top-admin">
                <ShieldCheck />
                <span>Администратор</span>
              </div>
            )}
            <NavLink
              to="/notices"
              className="icon-button notice-button"
              aria-label={unreadNotices > 0 ? `Уведомления: ${unreadNotices} новых` : "Уведомления"}
            >
              <Bell />
              {unreadNotices > 0 && (
                <b className="notification-count" aria-hidden="true">
                  {notificationCountLabel(unreadNotices)}
                </b>
              )}
            </NavLink>
          </div>
        </header>
        <Routes>
          <Route path="/" element={<EventsPage user={user} />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="/events/:id/quiz" element={<QuizPage />} />
          <Route path="/my-events" element={<MyEvents />} />
          <Route
            path="/profile"
            element={<Profile user={user} setUser={setUser} />}
          />
          <Route path="/history" element={<History />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/offer" element={<PublicDocumentPage kind="offer" />} />
          <Route path="/privacy" element={<PublicDocumentPage kind="privacy" />} />
          <Route path="/personal-data-consent" element={<PublicDocumentPage kind="consent" />} />
          <Route path="/payment-and-refund" element={<PublicDocumentPage kind="payment" />} />
          <Route path="/contacts" element={<PublicDocumentPage kind="contacts" />} />
          {user.is_admin && (
            <>
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/events/:id" element={<AdminEventPage />} />
              <Route path="/admin/events/:id/quiz/test" element={<AdminQuizTestPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/"}>
            <i.icon />
            <span>{i.label}</span>
            {i.to === "/notices" && unreadNotices > 0 && (
              <b className="notification-count" aria-label={`${unreadNotices} непрочитанных уведомлений`}>
                {notificationCountLabel(unreadNotices)}
              </b>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function PageHead({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {copy && <p>{copy}</p>}
      </div>
      {action}
    </div>
  );
}

function EventsPage({ user }: { user: User }) {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    api.events().then(setEvents);
  }, []);
  const active = events.filter(
    (e) => e.status !== "finished" && e.status !== "cancelled",
  );
  return (
    <div className="page">
      <PageHead
        eyebrow={`Привет, ${user.name || "давайте знакомиться"}`}
        title="Ближайшие встречи"
        copy="Выберите вечер, который может изменить всё."
      />
      <div className="event-grid">
        {active.map((e, i) => (
          <EventCard event={e} featured={i === 0} key={e.id} />
        ))}
      </div>
    </div>
  );
}
function EventCard({
  event,
  featured = false,
  showRegistrationStatus = false,
}: {
  event: Event;
  featured?: boolean;
  showRegistrationStatus?: boolean;
}) {
  const leftM = Math.max(0, event.male_capacity - event.male_taken),
    leftF = Math.max(0, event.female_capacity - event.female_taken);
  return (
    <article className={`event-card ${featured ? "featured" : ""}`}>
      <div className="card-art">
        <span className="event-date">
          <b>{format(new Date(event.starts_at), "dd")}</b>
          {format(new Date(event.starts_at), "MMM", { locale: ru })}
        </span>
        {(featured || event.status === "live") && (
          <span className={`tag ${event.status === "live" ? "live-tag" : ""}`}>
            <Sparkles />
            {event.status === "live" ? "Идёт сейчас" : "Ближайшая встреча"}
          </span>
        )}
        <div className="art-hearts">♡</div>
      </div>
      <div className="card-body">
        <div className="card-kicker">
          <span className="event-kind">Быстрые знакомства</span>
          {event.registration?.participant_number && (
            <span className="number-chip">Ваш № {event.registration.participant_number}</span>
          )}
        </div>
        <h2>{event.title}</h2>
        <div className="event-meta">
          <span>
            <Clock3 />
            {dt(event.starts_at)}
          </span>
          <span>
            <MapPin />
            {event.venue}
          </span>
          {event.age_min && event.age_max && (
            <span>
              <CakeSlice />
              {event.age_min}–{event.age_max} лет
            </span>
          )}
        </div>
        <div className="availability">
          <strong>Осталось:</strong>
          <span>
            Девушки <b>{leftF} {plural(leftF, "место", "места", "мест")}</b>
          </span>
          <i />
          <span>
            Мужчины <b>{leftM} {plural(leftM, "место", "места", "мест")}</b>
          </span>
        </div>
        {showRegistrationStatus && event.registration && (
          <div className="my-event-statuses">
            <div
              className={`my-event-status ${
                event.registration.status === "waitlisted"
                  ? "status-waitlisted"
                  : event.registration.paid
                    ? "status-confirmed"
                    : "status-pending"
              }`}
            >
              <WalletCards />
              <span>
                <small>Оплата</small>
                <b>
                  {event.registration.status === "waitlisted"
                    ? "После выхода из очереди"
                    : event.registration.paid
                      ? "Оплачено"
                      : "Не оплачено"}
                </b>
              </span>
            </div>
            <div
              className={`my-event-status status-${event.registration.status}`}
            >
              {event.registration.status === "confirmed" ? (
                <Check />
              ) : event.registration.status === "rejected" ? (
                <X />
              ) : event.registration.status === "waitlisted" ? (
                <Users />
              ) : (
                <Clock3 />
              )}
              <span>
                <small>Запись на встречу</small>
                <b>
                  {event.registration.status === "confirmed"
                    ? "Подтверждена"
                    : event.registration.status === "rejected"
                      ? "Отклонена"
                      : event.registration.status === "waitlisted"
                        ? `В листе ожидания${event.registration.waitlist_position ? ` · № ${event.registration.waitlist_position}` : ""}`
                      : "На проверке"}
                </b>
              </span>
            </div>
          </div>
        )}
        <div className="card-foot">
          <strong>{money(event.price)}</strong>
          <div className="card-actions">
            <NavLink to={`/events/${event.id}`} className="card-detail-link">
              {event.registration?.status === "waitlisted"
                ? "Вы в очереди →"
                : event.registration
                  ? "Вы записаны →"
                  : "Подробнее →"}
            </NavLink>
            {event.quiz && (
              <NavLink to={`/events/${event.id}/quiz`} className="quiz-card-button">
                <ClipboardList />
                {event.quiz.results_published
                  ? "Результаты"
                  : event.quiz.completed
                    ? "Квиз пройден"
                    : "Пройти квиз"}
              </NavLink>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function EventPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<Event>();
  const [modal, setModal] = useState(false);
  const [successNotice, setSuccessNotice] = useState<{ title: string; body: string } | null>(null);
  const [agree, setAgree] = useState({ personal: false, prepayment: false, adult: false });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const load = () => api.event(Number(id)).then(setEvent);
  useEffect(() => {
    void load();
  }, [id]);
  if (!event) return <Loader />;
  const leftM = Math.max(0, event.male_capacity - event.male_taken);
  const leftF = Math.max(0, event.female_capacity - event.female_taken);
  const joiningWaitlist = !event.registration && event.place_available === false;
  async function register() {
    try {
      setError("");
      setSubmitting(true);
      const result = await api.register(event!.id, {
        personal_data_consent: agree.personal,
        prepayment_consent: agree.prepayment,
        adult_confirmation: agree.adult,
      });
      setModal(false);
      setAgree({ personal: false, prepayment: false, adult: false });
      setSuccessNotice(result.notification);
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="page narrow">
      <NavLink to="/" className="back">
        <ChevronLeft />
        Все события
      </NavLink>
      <div className="detail-hero">
        <span className="eyebrow">
          {event.status === "live"
            ? "Событие уже идёт"
            : event.status === "finished"
              ? "Встреча завершена"
              : "Открыта регистрация"}
        </span>
        <h1>{event.title}</h1>
        <p>{event.description}</p>
      </div>
      <div className="detail-grid">
        <section className="detail-main">
          <div className="info-row">
            <CalendarDays />
            <div>
              <small>Дата и время</small>
              <b>{dt(event.starts_at)}</b>
            </div>
          </div>
          <div className="info-row">
            <MapPin />
            <div>
              <small>Место</small>
              <b>{event.venue}</b>
              <span>{event.address}</span>
            </div>
          </div>
          <div className="info-row">
            <Users />
            <div>
              <small>Участники</small>
              <b>
                {event.male_capacity + event.female_capacity}{" "}
                {plural(event.male_capacity + event.female_capacity, "гость", "гостя", "гостей")}
              </b>
              <span>равное количество мужчин и женщин</span>
            </div>
          </div>
          {event.age_min && event.age_max && (
            <div className="info-row">
              <CakeSlice />
              <div>
                <small>Возраст участников</small>
                <b>
                  От {event.age_min} до {event.age_max} лет
                </b>
              </div>
            </div>
          )}
        </section>
        <aside className="booking">
          <span>Участие</span>
          <strong>{money(event.price)}</strong>
          <p>В стоимость входит организация вечера и welcome drink.</p>
          <div className="detail-availability">
            <span>Осталось мест</span>
            <div>
              <p>
                <b>{leftF}</b>
                <small>для девушек</small>
              </p>
              <p>
                <b>{leftM}</b>
                <small>для мужчин</small>
              </p>
            </div>
          </div>
          {event.registration?.participant_number && (
            <div className="my-number-panel">
              <span>Ваш номер на мероприятии</span>
              <b>№ {event.registration.participant_number}</b>
              <small>Назовите его организатору при встрече</small>
            </div>
          )}
          {event.registration ? (
            <div className={`status-box ${event.registration.status}`}>
              {event.registration.status === "confirmed" ? (
                <Check />
              ) : event.registration.status === "rejected" ? (
                <X />
              ) : event.registration.status === "waitlisted" ? (
                <Users />
              ) : (
                <Clock3 />
              )}
              <div>
                <b>
                  {event.registration.status === "confirmed"
                    ? "Запись подтверждена"
                    : event.registration.status === "rejected"
                      ? "Запись отклонена"
                      : event.registration.status === "waitlisted"
                        ? "Вы в листе ожидания"
                      : "Запись на проверке"}
                </b>
                <small>
                  {event.registration.paid
                    ? "Оплата отмечена"
                    : event.registration.status === "rejected"
                      ? "Свяжитесь с поддержкой, если остались вопросы"
                      : event.registration.status === "waitlisted"
                        ? `Мы уведомим об освободившемся месте${event.registration.waitlist_position ? ` · ваша позиция № ${event.registration.waitlist_position}` : ""}`
                      : "Администратор свяжется с вами"}
                </small>
              </div>
            </div>
          ) : (
            <button className="primary wide" onClick={() => setModal(true)}>
              {joiningWaitlist ? "Встать в лист ожидания" : "Записаться на встречу"}
            </button>
          )}
          {event.registration?.status === "waitlisted" && event.place_available && (
            <button className="primary wide waitlist-claim-button" disabled={submitting} onClick={register}>
              {submitting ? "Отправляем…" : "Подать заявку на свободное место"}
            </button>
          )}
          {event.quiz && (
            <NavLink to={`/events/${event.id}/quiz`} className="quiz-entry-button">
              <ClipboardList />
              <span>
                <b>
                  {event.quiz.results_published
                    ? "Посмотреть результат квиза"
                    : event.quiz.completed
                      ? "Квиз уже пройден"
                      : "Пройти квиз"}
                </b>
                <small>
                  {event.quiz.results_published
                    ? "Итоговый счёт опубликован"
                    : "Доступен только во время мероприятия"}
                </small>
              </span>
            </NavLink>
          )}
        </aside>
      </div>
      {event.participants && <Participants event={event} reload={load} />}{" "}
      {modal && (
        <div className="modal-wrap" onMouseDown={() => setModal(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" aria-label="Закрыть окно" onClick={() => setModal(false)}>
              <X />
            </button>
            <span className="eyebrow">Последний шаг</span>
            <h2>{joiningWaitlist ? "Встать в лист ожидания" : "Подтвердите запись"}</h2>
            <p>
              {joiningWaitlist
                ? "Сейчас мест для вашей категории нет. Мы уведомим вас, когда место освободится."
                : "После заявки администратор свяжется с вами для предоплаты."}
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={agree.personal}
                onChange={(e) => setAgree((current) => ({ ...current, personal: e.target.checked }))}
              />
              <span>
                Я принимаю{" "}
                <NavLink to="/personal-data-consent" target="_blank">
                  согласие на обработку персональных данных
                </NavLink>{" "}
                согласно{" "}
                <a
                  href="https://www.consultant.ru/document/cons_doc_LAW_61801/"
                  target="_blank"
                  rel="noreferrer"
                >
                  ФЗ №152-ФЗ
                </a>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={agree.prepayment}
                onChange={(e) => setAgree((current) => ({ ...current, prepayment: e.target.checked }))}
              />
              <span>
                Я согласен(на) внести полную предоплату {money(event.price)}
                {joiningWaitlist ? ", если место освободится" : ""}
                {" "}и принимаю{" "}
                <NavLink to="/payment-and-refund" target="_blank">
                  правила оплаты и возврата
                </NavLink>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={agree.adult}
                onChange={(e) => setAgree((current) => ({ ...current, adult: e.target.checked }))}
              />
              <span>Подтверждаю, что мне исполнилось 18 лет, и указанные в профиле данные достоверны.</span>
            </label>
            {error && <div className="error">{error}</div>}
            <button
              className="primary wide"
              disabled={!Object.values(agree).every(Boolean) || submitting}
              onClick={register}
            >
              {submitting
                ? "Отправляем…"
                : joiningWaitlist
                  ? "Встать в очередь"
                  : "Отправить заявку"}
            </button>
          </div>
        </div>
      )}
      {successNotice && (
        <div className="modal-wrap" onMouseDown={() => setSuccessNotice(null)}>
          <div className="modal registration-success-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              aria-label="Закрыть окно"
              onClick={() => setSuccessNotice(null)}
            >
              <X />
            </button>
            <div className="registration-success-icon">
              <CircleCheckBig />
            </div>
            <span className="eyebrow">Готово</span>
            <h2>{successNotice.title}</h2>
            <p>{successNotice.body}</p>
            <div className="registration-notice-hint">
              <Bell />
              <div>
                <b>Сообщение добавлено в уведомления</b>
                <small>Новый статус отмечен рядом со значком колокольчика.</small>
              </div>
            </div>
            <button className="primary wide" onClick={() => setSuccessNotice(null)}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuizPage() {
  const { id } = useParams();
  const eventId = Number(id);
  const [quiz, setQuiz] = useState<ParticipantQuiz>();
  const [answers, setAnswers] = useState<Record<number, number[] | string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api.quiz(eventId)
      .then(setQuiz)
      .catch((e) => setError(e instanceof Error ? e.message : "Квиз недоступен"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, [eventId]);

  if (loading) return <Loader />;
  if (!quiz) {
    return (
      <div className="page narrow">
        <NavLink to={`/events/${eventId}`} className="back"><ChevronLeft />Вернуться к мероприятию</NavLink>
        <div className="quiz-unavailable">
          <ClipboardList />
          <h1>Квиз недоступен</h1>
          <p>{error || "Организатор ещё не запустил квиз."}</p>
        </div>
      </div>
    );
  }

  const answeredCount = quiz.questions.filter((question) => {
    const answer = answers[question.id];
    return typeof answer === "string" ? Boolean(answer.trim()) : Array.isArray(answer) && answer.length > 0;
  }).length;
  const allAnswered = quiz.questions.length > 0 && answeredCount === quiz.questions.length;

  function toggleOption(questionId: number, optionId: number, multiple: boolean) {
    const current = Array.isArray(answers[questionId]) ? answers[questionId] as number[] : [];
    const next = multiple
      ? current.includes(optionId) ? current.filter((value) => value !== optionId) : [...current, optionId]
      : [optionId];
    setAnswers({ ...answers, [questionId]: next });
  }

  async function submit() {
    if (!allAnswered) {
      setError("Ответьте на все вопросы квиза");
      return;
    }
    const payload: QuizSubmissionAnswer[] = quiz!.questions.map((question) => ({
      question_id: question.id,
      ...(question.question_type === "text"
        ? { text_answer: String(answers[question.id] || "") }
        : { selected_option_ids: answers[question.id] as number[] }),
    }));
    setSaving(true);
    setError("");
    try {
      await api.submitQuiz(eventId, payload);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить ответы");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page quiz-page">
      <NavLink to={`/events/${eventId}`} className="back"><ChevronLeft />Вернуться к мероприятию</NavLink>
      <PageHead
        eyebrow={quiz.status === "results" ? "Результаты опубликованы" : "Квиз мероприятия"}
        title={quiz.title}
        copy={quiz.status === "active" && !quiz.completed
          ? "Ответьте на все вопросы. После отправки изменить ответы будет нельзя."
          : undefined}
      />

      {quiz.status === "results" ? (
        <div className="quiz-result-card">
          <Award />
          {quiz.completed ? (
            <>
              <span>Ваш итоговый результат</span>
              <strong>{quiz.score} <small>из {quiz.max_score}</small></strong>
              <p>Спасибо за участие! Организатор открыл итоговый счёт.</p>
            </>
          ) : (
            <>
              <span>Квиз завершён</span>
              <h2>Вы не успели пройти квиз</h2>
              <p>Результат не начислен, поскольку ответы не были отправлены.</p>
            </>
          )}
        </div>
      ) : quiz.completed ? (
        <div className="quiz-waiting-card">
          <Check />
          <div>
            <h2>Ответы приняты</h2>
            <p>Ваш результат скрыт. Он появится здесь, когда организатор опубликует итоги.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="quiz-progress">
            <span>Заполнено {answeredCount} из {quiz.questions.length}</span>
            <i><b style={{ width: `${quiz.questions.length ? answeredCount / quiz.questions.length * 100 : 0}%` }} /></i>
          </div>
          <div className="quiz-question-list">
            {quiz.questions.map((question, index) => (
              <article className="quiz-question" key={question.id}>
                <div className="quiz-question-head">
                  <span>Вопрос {index + 1}</span>
                  <b>{question.points} {question.points === 1 ? "балл" : "баллов"}</b>
                </div>
                <h2>{question.prompt}</h2>
                {question.image_url && <img className="quiz-question-image" src={asset(question.image_url)} alt="Иллюстрация к вопросу" />}
                {question.question_type === "text" ? (
                  <textarea
                    rows={3}
                    placeholder="Введите ваш ответ"
                    value={typeof answers[question.id] === "string" ? answers[question.id] as string : ""}
                    onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                  />
                ) : (
                  <div className="quiz-options">
                    {question.options.map((option) => {
                      const selected = Array.isArray(answers[question.id]) && (answers[question.id] as number[]).includes(option.id);
                      return (
                        <label className={selected ? "selected" : ""} key={option.id}>
                          <input
                            type={question.question_type === "single" ? "radio" : "checkbox"}
                            name={`question-${question.id}`}
                            checked={selected}
                            onChange={() => toggleOption(question.id, option.id, question.question_type === "multiple")}
                          />
                          <i />
                          <span>{option.text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>
          {error && <div className="error quiz-error">{error}</div>}
          <div className="quiz-submit-bar">
            <span>{allAnswered ? "Все вопросы заполнены" : "Необходимо ответить на каждый вопрос"}</span>
            <button className="primary" disabled={!allAnswered || saving} onClick={submit}>
              {saving ? "Отправляем…" : "Завершить квиз"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Participants({ event, reload }: { event: Event; reload: () => void }) {
  async function choose(p: Person, v: boolean) {
    await api.like(event.id, p.id, v);
    reload();
  }
  return (
    <section className="participants">
      <PageHead
        eyebrow={event.status === "live" ? "Ваш выбор" : "Результаты"}
        title={
          event.status === "live" ? "Кто вам понравился?" : "Ваши совпадения"
        }
        copy={
          event.status === "live"
            ? "Ваш ответ останется в тайне. Контакты откроются только при взаимной симпатии."
            : "Контакты доступны только у взаимных симпатий."
        }
      />
      <div className="people-grid">
        {event.participants?.map((p) => (
          <article className="person-card" key={p.id}>
            <div
              className="person-photo"
              style={
                p.photo_url
                  ? { backgroundImage: `url(${asset(p.photo_url)})` }
                  : {}
              }
            >
              {!p.photo_url && <UserRound />}
              <span>№ {p.number}</span>
            </div>
            <div className="person-info">
              <h3>{p.name}</h3>
              <p>{p.bio || "Немного расскажу о себе при встрече."}</p>
              {event.status === "live" ? (
                <div className="choice">
                  <button
                    className={p.choice === false ? "selected no" : ""}
                    onClick={() => choose(p, false)}
                  >
                    <X />
                    Нет
                  </button>
                  <button
                    className={p.choice === true ? "selected yes" : ""}
                    onClick={() => choose(p, true)}
                  >
                    <Heart fill={p.choice === true ? "currentColor" : "none"} />
                    Нравится
                  </button>
                </div>
              ) : p.mutual ? (
                <div className="match">
                  <Heart fill="currentColor" />
                  <div>
                    <b>Это взаимно!</b>
                    <span>
                      {[
                        p.telegram && `Telegram: ${p.telegram}`,
                        p.whatsapp && `WhatsApp: ${p.whatsapp}`,
                        p.max_phone && `MAX: ${p.max_phone}`,
                        p.phone && `Телефон: ${p.phone}`,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="no-match">Взаимной симпатии нет</div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TelegramNotificationCard() {
  const [telegramStatus, setTelegramStatus] = useState<
    Awaited<ReturnType<typeof api.telegramStatus>> | null
  >(null);
  const [telegramPending, setTelegramPending] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState("");
  const refreshTelegramStatus = () =>
    api.telegramStatus().then((status) => {
      setTelegramStatus(status);
      if (status.connected) setTelegramPending(false);
    });

  useEffect(() => {
    void refreshTelegramStatus();
    const refresh = () => void refreshTelegramStatus();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    if (!telegramPending) return;
    const interval = window.setInterval(() => void refreshTelegramStatus(), 2500);
    return () => window.clearInterval(interval);
  }, [telegramPending]);

  async function connectTelegram() {
    setTelegramError("");
    setTelegramBusy(true);
    const popup = window.open("", "_blank");
    try {
      const result = await api.createTelegramLink();
      if (popup) {
        popup.opener = null;
        popup.location.href = result.url;
      } else {
        window.location.href = result.url;
      }
      setTelegramPending(true);
    } catch (e) {
      popup?.close();
      setTelegramError(e instanceof Error ? e.message : "Не удалось открыть Telegram");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function disconnectTelegram() {
    setTelegramError("");
    setTelegramBusy(true);
    try {
      await api.disconnectTelegram();
      await refreshTelegramStatus();
    } catch (e) {
      setTelegramError(e instanceof Error ? e.message : "Не удалось отключить Telegram");
    } finally {
      setTelegramBusy(false);
    }
  }

  return (
    <section className={`telegram-notification-card ${telegramStatus?.connected ? "connected" : ""}`}>
      <div className="telegram-notification-icon">
        {telegramStatus?.connected ? <Check /> : <Send />}
      </div>
      <div className="telegram-notification-copy">
        <h3>{telegramStatus?.connected ? "Telegram подключён" : "Уведомления в Telegram"}</h3>
        <p>
          {telegramStatus?.connected
            ? `Бот @${telegramStatus.bot_username} будет присылать важные сообщения о мероприятиях.`
            : telegramPending
              ? "Откройте Telegram и нажмите Start. Статус обновится автоматически."
              : "Получайте подтверждения записи, напоминания и результаты прямо в Telegram."}
        </p>
        {telegramError && <small className="telegram-notification-error">{telegramError}</small>}
      </div>
      {telegramStatus?.connected ? (
        <button type="button" className="secondary" disabled={telegramBusy} onClick={disconnectTelegram}>
          Отключить
        </button>
      ) : (
        <button
          type="button"
          className="primary"
          disabled={telegramBusy || telegramPending || telegramStatus?.configured === false}
          onClick={connectTelegram}
        >
          {telegramPending ? "Ждём Start…" : telegramBusy ? "Открываем…" : "Подключить Telegram"}
        </button>
      )}
    </section>
  );
}

function Profile({
  user,
  setUser,
}: {
  user: User;
  setUser: (u: User) => void;
}) {
  const [form, setForm] = useState({
    ...user,
    name: user.name || "",
    gender: user.gender || "female",
    birth_date: user.birth_date || "",
    email: user.email || "",
    bio: user.bio || "",
    telegram: user.telegram || "",
    whatsapp: user.whatsapp || "",
    max_phone: user.max_phone || "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.name.trim().length < 2) {
      setError("Имя должно содержать не менее 2 символов");
      return;
    }
    if (!form.photo_url) {
      setError("Загрузите фотографию профиля");
      return;
    }
    const telegram = telegramUsername(form.telegram);
    if (!telegram) {
      setError("Введите корректное имя Telegram, например @username");
      return;
    }
    const age = ageFromBirthDate(form.birth_date);
    if (age === null) {
      setError("Укажите дату рождения");
      return;
    }
    if (age < 18) {
      setError("Пользователь должен быть старше 18 лет");
      return;
    }
    try {
      const u = await api.updateMe({
        name: form.name.trim(),
        gender: form.gender,
        birth_date: form.birth_date,
        email: form.email.trim(),
        bio: form.bio.trim(),
        telegram: `@${telegram}`,
        whatsapp: form.whatsapp.trim(),
        max_phone: form.max_phone.trim(),
      });
      setUser(u);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль");
    }
  }
  async function photo(f?: File) {
    if (!f) return;
    setError("");
    try {
      const r = await api.uploadPhoto(f);
      setForm({ ...form, photo_url: r.photo_url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить фотографию");
    }
  }
  return (
    <div className="page narrow">
      <PageHead
        eyebrow="Личный кабинет"
        title="Ваш профиль"
      />
      <TelegramNotificationCard />
      <form className="profile-layout" onSubmit={submit} noValidate>
        <div className="photo-editor">
          <div
            className="avatar"
            style={
              form.photo_url
                ? { backgroundImage: `url(${asset(form.photo_url)})` }
                : {}
            }
          >
            {!form.photo_url && <UserRound />}
          </div>
          <label className="secondary">
            Загрузить фото
            <input
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => photo(e.target.files?.[0])}
            />
          </label>
          <small>JPG, PNG или WebP до 5 МБ</small>
          <small className="profile-required-note">Обязательно для записи на мероприятие</small>
        </div>
        <div className="form-card">
          <div className="two">
            <label>
              <span className="field-label">
                Ваше имя <span className="required-mark">*</span>
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              <span className="field-label">
                Пол <span className="required-mark">*</span>
              </span>
              <select
                value={form.gender}
                onChange={(e) =>
                  setForm({
                    ...form,
                    gender: e.target.value as "male" | "female",
                  })
                }
              >
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
              </select>
            </label>
          </div>
          <div className="two">
            <label>
              <span className="field-label">
                Номер телефона <span className="required-mark">*</span>
              </span>
              <input value={form.phone} readOnly aria-readonly="true" className="readonly-field" />
              <small className="input-help">Заполняется автоматически по номеру авторизации</small>
            </label>
            <label>
              Email
              <input
                type="email"
                maxLength={254}
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
          </div>
          <div className="birth-row">
            <label>
              <span className="field-label">
                Дата рождения <span className="required-mark">*</span>
              </span>
              <input
                type="date"
                required
                max={latestAdultBirthDate()}
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              />
            </label>
            <div className="age-field">
              <span className="field-label">Ваш возраст</span>
              <div className="age-readout">
                <b>
                  {ageFromBirthDate(form.birth_date) === null
                    ? "—"
                    : `${ageFromBirthDate(form.birth_date)} лет`}
                </b>
                <span>Рассчитывается автоматически</span>
              </div>
            </div>
          </div>
          <label>
            О себе
            <textarea
              rows={5}
              maxLength={1200}
              placeholder="Что вас вдохновляет, как любите проводить вечера…"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </label>
          <div className="section-label">Контакты для взаимных симпатий</div>
          <p className="form-help">Они откроются только после совпадения.</p>
          <div className="two">
            <label>
              <span className="field-label">
                Telegram <span className="required-mark">*</span>
              </span>
              <input
                required
                placeholder="@username"
                value={form.telegram}
                onChange={(e) => setForm({ ...form, telegram: e.target.value })}
              />
            </label>
            <label>
              WhatsApp
              <input
                placeholder="+7 999 000-00-00"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </label>
          </div>
          <label>
            MAX
            <input
              placeholder="Номер телефона"
              value={form.max_phone}
              onChange={(e) => setForm({ ...form, max_phone: e.target.value })}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary">
            {saved ? "Сохранено ✓" : "Сохранить профиль"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MyEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    api.events().then((all) =>
      setEvents(
        all
          .filter(
            (event) =>
              event.registration &&
              event.status !== "finished" &&
              event.status !== "cancelled",
          )
          .sort((a, b) => {
            if (a.status === "live" && b.status !== "live") return -1;
            if (b.status === "live" && a.status !== "live") return 1;
            return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
          }),
      ),
    );
  }, []);
  return (
    <div className="page">
      <PageHead
        eyebrow="Ваши планы"
        title="Мои встречи"
        copy="Предстоящие и уже идущие мероприятия, на которые вы записаны."
      />
      <div className="event-grid">
        {events.length ? (
          events.map((event, index) => (
            <EventCard
              event={event}
              featured={index === 0}
              showRegistrationStatus
              key={event.id}
            />
          ))
        ) : (
          <Empty text="Активных записей пока нет" />
        )}
      </div>
    </div>
  );
}

function History() {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    api.events().then((all) =>
      setEvents(
        all
          .filter(
            (event) =>
              event.status === "finished" &&
              event.registration?.status === "confirmed",
          )
          .sort(
            (a, b) =>
              new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
          ),
      ),
    );
  }, []);
  return (
    <div className="page">
      <PageHead
        eyebrow="Мои встречи"
        title="История событий"
        copy="Только завершённые мероприятия, в которых вы участвовали."
      />
      <div className="event-list">
        {events.length ? (
          events.map((e) => (
            <NavLink to={`/events/${e.id}`} key={e.id}>
              <div className="list-date">
                <b>{format(new Date(e.starts_at), "dd")}</b>
                <span>
                  {format(new Date(e.starts_at), "MMM", { locale: ru })}
                </span>
              </div>
              <div>
                <h3>{e.title}</h3>
                <p>
                  {e.venue} · {dt(e.starts_at)}
                  {e.registration?.participant_number &&
                    ` · Ваш номер № ${e.registration.participant_number}`}
                </p>
              </div>
              <span className="pill finished">Завершено</span>
            </NavLink>
          ))
        ) : (
          <Empty text="Завершённых встреч пока нет" />
        )}
      </div>
    </div>
  );
}
function Notices() {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.notifications>>
  >([]);
  useEffect(() => {
    let active = true;
    api.notifications().then((notices) => {
      if (!active) return;
      setItems(notices);
      if (notices.some((notice) => !notice.read)) {
        void api.readAllNotifications().then(() => {
          window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="page narrow">
      <PageHead eyebrow="Будьте в курсе" title="Уведомления" />
      <TelegramNotificationCard />
      <div className="notice-list">
        {items.length ? (
          items.map((n) => (
            <article key={n.id} className={n.read ? "" : "unread"}>
              <div className="notice-icon">
                <Bell />
              </div>
              <div>
                <h3>{n.title}</h3>
                <p>{n.body}</p>
                <small>{dt(n.created_at)}</small>
              </div>
              {!n.read && <span className="notice-new">Новое</span>}
            </article>
          ))
        ) : (
          <Empty text="Новых уведомлений пока нет" />
        )}
      </div>
    </div>
  );
}

function Admin() {
  const [events, setEvents] = useState<Event[]>([]);
  const [show, setShow] = useState(false);
  useEffect(() => {
    api.events().then(setEvents);
  }, []);
  return (
    <div className="page">
      <PageHead
        eyebrow="Панель организатора"
        title="Мероприятия"
        copy="Управляйте записями, оплатами и ходом вечера."
        action={
          <button className="primary" onClick={() => setShow(true)}>
            <Plus />
            Создать
          </button>
        }
      />
      <div className="admin-table">
        <div className="table-head">
          <span>Мероприятие</span>
          <span>Участники</span>
          <span>Выручка</span>
          <span>Статус</span>
        </div>
        {events.map((e) => (
          <NavLink to={`/admin/events/${e.id}`} key={e.id}>
            <div>
              <b>{e.title}</b>
              <small>
                {dt(e.starts_at)} · {e.venue}
              </small>
            </div>
            <span>
              {e.male_taken + e.female_taken} /{" "}
              {e.male_capacity + e.female_capacity}
            </span>
            <span>{money((e.male_taken + e.female_taken) * e.price)}</span>
            <span className={`pill ${e.status}`}>
              {e.status === "registration"
                ? "Регистрация"
                : e.status === "live"
                  ? "Идёт"
                  : e.status === "finished"
                    ? "Завершено"
                    : "Отменено"}
            </span>
          </NavLink>
        ))}
      </div>
      {show && (
        <CreateEvent
          close={() => setShow(false)}
          done={() => {
            setShow(false);
            api.events().then(setEvents);
          }}
        />
      )}
    </div>
  );
}
function CreateEvent({ close, done }: { close: () => void; done: () => void }) {
  const [data, setData] = useState({
    title: "",
    description: "",
    starts_at: "",
    venue: "",
    address: "",
    price: 2500,
    male_capacity: 8,
    female_capacity: 8,
    age_min: "",
    age_max: "",
  });
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (data.title.trim().length < 3) {
      setError("Название должно содержать не менее 3 символов");
      return;
    }
    if (!data.starts_at) {
      setError("Укажите дату и время мероприятия");
      return;
    }
    if (data.venue.trim().length < 2) {
      setError("Название площадки должно содержать не менее 2 символов");
      return;
    }
    if (data.address.trim().length < 4) {
      setError("Адрес должен содержать не менее 4 символов");
      return;
    }
    if (data.price <= 0 || data.male_capacity < 1 || data.female_capacity < 1) {
      setError("Стоимость и количество мест должны быть больше нуля");
      return;
    }
    if (Boolean(data.age_min) !== Boolean(data.age_max)) {
      setError("Укажите обе границы возраста");
      return;
    }
    if (data.age_min && data.age_max && Number(data.age_min) > Number(data.age_max)) {
      setError("Минимальный возраст не может быть больше максимального");
      return;
    }
    try {
      await api.createEvent({
        ...data,
        starts_at: new Date(data.starts_at).toISOString(),
        age_min: data.age_min ? Number(data.age_min) : null,
        age_max: data.age_max ? Number(data.age_max) : null,
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }
  return (
    <div className="modal-wrap">
      <form className="modal large" onSubmit={submit} noValidate>
        <button type="button" className="modal-close" aria-label="Закрыть окно" onClick={close}>
          <X />
        </button>
        <span className="eyebrow">Новое событие</span>
        <h2>Создать встречу</h2>
        <label>
          Название
          <input
            required
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </label>
        <label>
          Описание
          <textarea
            rows={3}
            value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
        </label>
        <div className="two">
          <label>
            Дата и время
            <input
              required
              type="datetime-local"
              value={data.starts_at}
              onChange={(e) => setData({ ...data, starts_at: e.target.value })}
            />
          </label>
          <label>
            Стоимость, ₽
            <input
              required
              type="number"
              min="1"
              value={data.price}
              onChange={(e) => setData({ ...data, price: +e.target.value })}
            />
          </label>
        </div>
        <div className="two">
          <label>
            Площадка
            <input
              required
              value={data.venue}
              onChange={(e) => setData({ ...data, venue: e.target.value })}
            />
          </label>
          <label>
            Адрес
            <input
              required
              value={data.address}
              onChange={(e) => setData({ ...data, address: e.target.value })}
            />
          </label>
        </div>
        <div className="two">
          <label>
            Мест для девушек
            <input
              type="number"
              min="1"
              value={data.female_capacity}
              onChange={(e) =>
                setData({ ...data, female_capacity: +e.target.value })
              }
            />
          </label>
          <label>
            Мест для мужчин
            <input
              type="number"
              min="1"
              value={data.male_capacity}
              onChange={(e) =>
                setData({ ...data, male_capacity: +e.target.value })
              }
            />
          </label>
        </div>
        <div className="section-label">Возрастные ограничения</div>
        <p className="form-help">Необязательно. Если указываете, заполните обе границы.</p>
        <div className="two">
          <label>
            Возраст от
            <input
              type="number"
              min="18"
              max="100"
              placeholder="Например, 25"
              value={data.age_min}
              onChange={(e) => setData({ ...data, age_min: e.target.value })}
            />
          </label>
          <label>
            Возраст до
            <input
              type="number"
              min="18"
              max="100"
              placeholder="Например, 40"
              value={data.age_max}
              onChange={(e) => setData({ ...data, age_max: e.target.value })}
            />
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="primary wide">Создать мероприятие</button>
      </form>
    </div>
  );
}

const emptyQuizQuestion = (): QuizEditorQuestion => ({
  prompt: "",
  question_type: "single",
  points: 1,
  image_url: "",
  options: [
    { text: "", is_correct: true },
    { text: "", is_correct: false },
  ],
  correct_text: "",
});

function AdminQuizPanel({ event }: { event: AdminEvent }) {
  const [quiz, setQuiz] = useState<AdminQuiz>();
  const [title, setTitle] = useState("Квиз");
  const [questions, setQuestions] = useState<QuizEditorQuestion[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = () => api.adminQuiz(event.id).then((data) => {
    setQuiz(data);
    if (data.status === "none") {
      setTitle("Квиз");
      setQuestions([emptyQuizQuestion()]);
    } else if (data.status === "draft") {
      setTitle(data.title);
      setQuestions(data.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => ({ ...option })),
      })));
    }
  });
  useEffect(() => {
    void load();
  }, [event.id]);
  useEffect(() => {
    if (quiz?.status !== "active") return;
    const timer = window.setInterval(() => {
      void api.adminQuiz(event.id).then(setQuiz);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [event.id, quiz?.status]);

  function updateQuestion(index: number, value: Partial<QuizEditorQuestion>) {
    setQuestions(questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...value } : question));
  }
  function changeQuestionType(index: number, questionType: QuizQuestionType) {
    updateQuestion(index, questionType === "text"
      ? { question_type: questionType, options: [], correct_text: "" }
      : {
          question_type: questionType,
          options: [
            { text: "", is_correct: true },
            { text: "", is_correct: false },
          ],
          correct_text: "",
        });
  }
  function updateOption(questionIndex: number, optionIndex: number, value: Partial<{ text: string; is_correct: boolean }>) {
    const question = questions[questionIndex];
    const options = question.options.map((option, index) => index === optionIndex ? { ...option, ...value } : option);
    updateQuestion(questionIndex, { options });
  }
  function markCorrect(questionIndex: number, optionIndex: number) {
    const question = questions[questionIndex];
    const options = question.options.map((option, index) => ({
      ...option,
      is_correct: question.question_type === "single" ? index === optionIndex : index === optionIndex ? !option.is_correct : option.is_correct,
    }));
    updateQuestion(questionIndex, { options });
  }
  async function uploadQuestionImage(questionIndex: number, file?: File) {
    if (!file) return;
    setError("");
    try {
      const result = await api.uploadQuizImage(event.id, file);
      setQuestions((current) => current.map((question, index) =>
        index === questionIndex ? { ...question, image_url: result.image_url } : question,
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить изображение");
    }
  }

  function validateEditor(): string {
    if (!title.trim()) return "Введите название квиза";
    if (!questions.length) return "Добавьте хотя бы один вопрос";
    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];
      if (!question.prompt.trim()) return `Введите текст вопроса ${index + 1}`;
      if (!question.points || question.points < 1) return `Укажите количество баллов за вопрос ${index + 1}`;
      if (question.question_type === "text") {
        if (!question.correct_text?.trim()) return `Укажите правильный ответ на вопрос ${index + 1}`;
      } else {
        if (question.options.length < 2 || question.options.some((option) => !option.text.trim()))
          return `Заполните минимум два варианта ответа для вопроса ${index + 1}`;
        const correctCount = question.options.filter((option) => option.is_correct).length;
        if (question.question_type === "single" && correctCount !== 1)
          return `Отметьте один правильный ответ для вопроса ${index + 1}`;
        if (question.question_type === "multiple" && correctCount < 1)
          return `Отметьте правильные ответы для вопроса ${index + 1}`;
      }
    }
    return "";
  }

  async function save() {
    const validationError = validateEditor();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.saveAdminQuiz(event.id, { title: title.trim(), questions });
      setNotice("Квиз сохранён");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить квиз");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(action: "launch" | "publish") {
    setError("");
    setNotice("");
    try {
      await api.changeQuizStatus(event.id, action);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить статус квиза");
    }
  }

  if (!quiz) return <div className="quiz-admin-loading">Загружаем квиз…</div>;
  const editable = quiz.status === "none" || quiz.status === "draft";
  const sortedParticipants = [...quiz.participants].sort((a, b) =>
    Number(b.is_winner) - Number(a.is_winner) || Number(b.completed) - Number(a.completed) || (b.score || 0) - (a.score || 0),
  );

  return (
    <section className="admin-quiz-section">
      <div className="section-head quiz-admin-head">
        <div>
          <h2>Квиз мероприятия</h2>
          <p>Создайте вопросы, запустите квиз во время встречи и опубликуйте итоговый счёт.</p>
        </div>
        <div className="quiz-head-actions">
          {quiz.id && (
            <NavLink to={`/admin/events/${event.id}/quiz/test`} className="quiz-test-link">
              <Play />Тестовый режим
            </NavLink>
          )}
          <span className={`quiz-status ${quiz.status}`}>
            {quiz.status === "none" ? "Не создан" : quiz.status === "draft" ? "Черновик" : quiz.status === "active" ? "Квиз идёт" : "Результаты открыты"}
          </span>
        </div>
      </div>

      {editable ? (
        <div className="quiz-editor">
          <label className="quiz-title-field">
            Название квиза
            <input value={title} maxLength={180} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="quiz-editor-list">
            {questions.map((question, questionIndex) => (
              <article className="quiz-editor-question" key={questionIndex}>
                <div className="quiz-editor-number">{questionIndex + 1}</div>
                <button
                  type="button"
                  className="quiz-remove-question"
                  title="Удалить вопрос"
                  onClick={() => setQuestions(questions.filter((_, index) => index !== questionIndex))}
                  aria-label={`Удалить вопрос ${questionIndex + 1}`}
                ><Trash2 /></button>
                <label className="quiz-prompt-field">
                  Вопрос
                  <textarea rows={2} value={question.prompt} onChange={(e) => updateQuestion(questionIndex, { prompt: e.target.value })} />
                </label>
                <div className="quiz-question-settings">
                  <label>
                    Тип ответа
                    <select value={question.question_type} onChange={(e) => changeQuestionType(questionIndex, e.target.value as QuizQuestionType)}>
                      <option value="single">Один вариант</option>
                      <option value="multiple">Несколько вариантов</option>
                      <option value="text">Текстовый ответ</option>
                    </select>
                  </label>
                  <label>
                    Баллы
                    <input type="number" min={1} max={10000} value={question.points} onChange={(e) => updateQuestion(questionIndex, { points: Number(e.target.value) })} />
                  </label>
                </div>
                <div className="quiz-image-editor">
                  {question.image_url && (
                    <div className="quiz-image-preview" style={{ backgroundImage: `url(${asset(question.image_url)})` }}>
                      <button type="button" aria-label="Удалить изображение" onClick={() => updateQuestion(questionIndex, { image_url: "" })}><X /></button>
                    </div>
                  )}
                  <label className="quiz-image-upload">
                    <span>{question.image_url ? "Заменить изображение" : "Добавить изображение"}</span>
                    <small>Необязательно · JPG, PNG или WebP до 5 МБ</small>
                    <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadQuestionImage(questionIndex, e.target.files?.[0])} />
                  </label>
                </div>
                {question.question_type === "text" ? (
                  <label className="quiz-correct-text">
                    Правильный ответ
                    <input
                      placeholder="Регистр букв не учитывается"
                      value={question.correct_text || ""}
                      onChange={(e) => updateQuestion(questionIndex, { correct_text: e.target.value })}
                    />
                  </label>
                ) : (
                  <div className="quiz-option-editor">
                    <span>Варианты ответа <small>Отметьте правильный</small></span>
                    {question.options.map((option, optionIndex) => (
                      <div className="quiz-option-row" key={optionIndex}>
                        <button
                          type="button"
                          className={`correct-option-toggle ${option.is_correct ? "selected" : ""} ${question.question_type}`}
                          onClick={() => markCorrect(questionIndex, optionIndex)}
                          title="Правильный ответ"
                        ><Check /></button>
                        <input
                          placeholder={`Вариант ${optionIndex + 1}`}
                          value={option.text}
                          onChange={(e) => updateOption(questionIndex, optionIndex, { text: e.target.value })}
                        />
                        <button
                          type="button"
                          className="remove-option"
                          aria-label={`Удалить вариант ${optionIndex + 1}`}
                          onClick={() => updateQuestion(questionIndex, { options: question.options.filter((_, index) => index !== optionIndex) })}
                        ><X /></button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="add-option-button"
                      onClick={() => updateQuestion(questionIndex, { options: [...question.options, { text: "", is_correct: false }] })}
                    ><Plus />Добавить вариант</button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <button type="button" className="secondary add-question-button" onClick={() => setQuestions([...questions, emptyQuizQuestion()])}>
            <Plus />Добавить вопрос
          </button>
          {error && <div className="error">{error}</div>}
          {notice && <div className="quiz-success"><Check />{notice}</div>}
          <div className="quiz-editor-actions">
            <button className="primary" disabled={saving} onClick={save}>{saving ? "Сохраняем…" : "Сохранить квиз"}</button>
            {quiz.status === "draft" && (
              <button className="quiz-launch-button" disabled={event.status !== "live"} onClick={() => changeStatus("launch")}>
                <Play />Запустить квиз
              </button>
            )}
          </div>
          {quiz.status === "draft" && event.status !== "live" && (
            <p className="quiz-launch-hint">Запуск станет доступен, когда мероприятие получит статус «Идёт».</p>
          )}
        </div>
      ) : (
        <>
          <div className="quiz-live-summary">
            <div><ClipboardList /><span>Вопросов<b>{quiz.questions.length}</b></span></div>
            <div><Check /><span>Завершили<b>{quiz.completed_count} из {quiz.participant_count}</b></span></div>
            <div><Award /><span>Максимум<b>{points(quiz.max_score)}</b></span></div>
          </div>
          {quiz.status === "active" && (
            <div className={`quiz-publish-panel ${quiz.all_completed ? "all-completed" : ""}`}>
              <div>
                <b>{quiz.all_completed ? "Все участники завершили квиз" : "Квиз принимает ответы"}</b>
                <span>Опубликовать результаты можно в любой момент. После этого ответы больше не принимаются.</span>
              </div>
              <button className="primary" onClick={() => changeStatus("publish")}>Открыть итоговый счёт</button>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <details className="quiz-answer-key">
            <summary>Вопросы и правильные ответы</summary>
            {quiz.questions.map((question, index) => (
              <div key={question.id || index}>
                <b>{index + 1}. {question.prompt}</b>
                <span>
                  {question.question_type === "text"
                    ? question.correct_text
                    : question.options.filter((option) => option.is_correct).map((option) => option.text).join(", ")}
                  {` · ${points(question.points)}`}
                </span>
              </div>
            ))}
          </details>
          <div className="quiz-participant-results">
            <div className="section-head">
              <h3>Результаты участников</h3>
              <span>{quiz.completed_count} из {quiz.participant_count} завершили</span>
            </div>
            {sortedParticipants.length ? sortedParticipants.map((participant) => (
              <details className={`quiz-participant-result ${participant.is_winner ? "winner" : ""}`} key={participant.user.id}>
                <summary>
                  <span className="quiz-result-avatar">{participant.user.name?.[0] || "?"}</span>
                  <span className="quiz-result-name">
                    <b>{participant.user.name || "Профиль не заполнен"}</b>
                    <small>{participant.number ? `№ ${participant.number} · ` : ""}{participant.user.phone}</small>
                  </span>
                  {participant.is_winner && participant.completed && (
                    <span className="winner-label"><Award />{quiz.status === "results" ? "Победитель" : "Лидер"}</span>
                  )}
                  <span className={`quiz-person-score ${participant.completed ? "completed" : ""}`}>
                    {participant.completed ? <><b>{participant.score}</b><small>из {quiz.max_score}</small></> : "Не завершил"}
                  </span>
                </summary>
                {participant.completed && (
                  <div className="quiz-answer-details">
                    {participant.answers.map((answer, index) => (
                      <div className={answer.correct ? "correct" : "incorrect"} key={answer.question_id}>
                        <span>{index + 1}</span>
                        <div>
                          <b>{answer.prompt}</b>
                          <p>{Array.isArray(answer.answer) ? answer.answer.join(", ") : answer.answer || "Ответ не указан"}</p>
                        </div>
                        <strong>{answer.awarded_points} / {answer.max_points}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            )) : <div className="sympathy-empty"><Users /><div><b>Нет подтверждённых участников</b><span>Результаты появятся после прохождения квиза.</span></div></div>}
          </div>
        </>
      )}
    </section>
  );
}

function AdminQuizTestPage() {
  const { id } = useParams();
  const eventId = Number(id);
  const [quiz, setQuiz] = useState<AdminQuiz>();
  const [answers, setAnswers] = useState<Record<number, number[] | string>>({});
  const [result, setResult] = useState<{ score: number; correct: Record<number, boolean> }>();
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminQuiz(eventId)
      .then((data) => {
        if (!data.id) setError("Сначала сохраните квиз");
        else setQuiz(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось открыть квиз"));
  }, [eventId]);

  if (!quiz) {
    return (
      <div className="page narrow">
        <NavLink to={`/admin/events/${eventId}`} className="back"><ChevronLeft />Вернуться к управлению</NavLink>
        {error ? <div className="quiz-unavailable"><ClipboardList /><h1>Тестовый режим недоступен</h1><p>{error}</p></div> : <Loader />}
      </div>
    );
  }

  const answered = quiz.questions.filter((question) => {
    const answer = answers[question.id!];
    return typeof answer === "string" ? Boolean(answer.trim()) : Array.isArray(answer) && answer.length > 0;
  }).length;
  const allAnswered = answered === quiz.questions.length;

  function choose(questionId: number, optionId: number, multiple: boolean) {
    if (result) return;
    const current = Array.isArray(answers[questionId]) ? answers[questionId] as number[] : [];
    setAnswers({
      ...answers,
      [questionId]: multiple
        ? current.includes(optionId) ? current.filter((value) => value !== optionId) : [...current, optionId]
        : [optionId],
    });
  }
  function finishTest() {
    if (!allAnswered) return;
    let score = 0;
    const correct: Record<number, boolean> = {};
    quiz!.questions.forEach((question) => {
      const questionId = question.id!;
      if (question.question_type === "text") {
        const normalize = (value: string) => value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
        correct[questionId] = normalize(String(answers[questionId] || "")) === normalize(question.correct_text || "");
      } else {
        const selected = [...(answers[questionId] as number[])].sort((a, b) => a - b);
        const expected = question.options.filter((option) => option.is_correct).map((option) => option.id!).sort((a, b) => a - b);
        correct[questionId] = selected.length === expected.length && selected.every((value, index) => value === expected[index]);
      }
      if (correct[questionId]) score += question.points;
    });
    setResult({ score, correct });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function restart() {
    setAnswers({});
    setResult(undefined);
  }

  return (
    <div className="page quiz-page admin-quiz-test-page">
      <NavLink to={`/admin/events/${eventId}`} className="back"><ChevronLeft />Вернуться к управлению</NavLink>
      <PageHead
        eyebrow="Тестовый режим администратора"
        title={quiz.title}
        copy="Ответы в этом режиме не сохраняются и не попадают в результаты участников."
        action={result && <button className="secondary" onClick={restart}><RotateCcw />Пройти заново</button>}
      />
      {result && (
        <div className="quiz-test-score">
          <Award />
          <span>Тест завершён</span>
          <strong>{result.score} <small>из {quiz.max_score}</small></strong>
          <p>{result.score === quiz.max_score ? "Все ответы верны — квиз настроен корректно." : "Проверьте вопросы, отмеченные ниже."}</p>
        </div>
      )}
      {!result && (
        <div className="quiz-progress">
          <span>Заполнено {answered} из {quiz.questions.length}</span>
          <i><b style={{ width: `${quiz.questions.length ? answered / quiz.questions.length * 100 : 0}%` }} /></i>
        </div>
      )}
      <div className="quiz-question-list">
        {quiz.questions.map((question, index) => {
          const questionId = question.id!;
          const isCorrect = result?.correct[questionId];
          return (
            <article className={`quiz-question ${result ? isCorrect ? "test-correct" : "test-incorrect" : ""}`} key={questionId}>
              <div className="quiz-question-head">
                <span>Вопрос {index + 1}</span>
                <b>{points(question.points)}</b>
              </div>
              <h2>{question.prompt}</h2>
              {question.image_url && <img className="quiz-question-image" src={asset(question.image_url)} alt="Иллюстрация к вопросу" />}
              {question.question_type === "text" ? (
                <input
                  className="quiz-test-text"
                  placeholder="Введите ответ"
                  disabled={Boolean(result)}
                  value={typeof answers[questionId] === "string" ? answers[questionId] as string : ""}
                  onChange={(e) => setAnswers({ ...answers, [questionId]: e.target.value })}
                />
              ) : (
                <div className="quiz-options">
                  {question.options.map((option) => {
                    const optionId = option.id!;
                    const selected = Array.isArray(answers[questionId]) && (answers[questionId] as number[]).includes(optionId);
                    return (
                      <label className={`${selected ? "selected" : ""} ${result && option.is_correct ? "correct-answer" : ""}`} key={optionId}>
                        <input
                          type={question.question_type === "single" ? "radio" : "checkbox"}
                          name={`test-question-${questionId}`}
                          checked={selected}
                          disabled={Boolean(result)}
                          onChange={() => choose(questionId, optionId, question.question_type === "multiple")}
                        />
                        <i />
                        <span>{option.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {result && (
                <div className={`quiz-test-feedback ${isCorrect ? "correct" : "incorrect"}`}>
                  {isCorrect ? <Check /> : <X />}
                  <span>
                    <b>{isCorrect ? "Правильный ответ" : "Ответ неверный"}</b>
                    {!isCorrect && (
                      <small>Правильно: {question.question_type === "text"
                        ? question.correct_text
                        : question.options.filter((option) => option.is_correct).map((option) => option.text).join(", ")}</small>
                    )}
                  </span>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!result && (
        <div className="quiz-submit-bar">
          <span>{allAnswered ? "Все вопросы заполнены" : "Заполните все вопросы для проверки"}</span>
          <button className="primary" disabled={!allAnswered} onClick={finishTest}>Проверить квиз</button>
        </div>
      )}
    </div>
  );
}

function SympathyPerson({ person }: { person: AdminSympathyUser }) {
  return (
    <div className="sympathy-person">
      <span
        className="sympathy-avatar"
        style={person.photo_url ? { backgroundImage: `url(${asset(person.photo_url)})` } : {}}
      >
        {!person.photo_url && (person.name?.[0] || "?")}
      </span>
      <span>
        <b>{person.name || "Профиль не заполнен"}</b>
        <small>
          {person.number ? `№ ${person.number} · ` : ""}
          {person.age !== undefined && person.age !== null ? `${person.age} лет` : "Возраст не указан"}
        </small>
      </span>
    </div>
  );
}

function AdminEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<AdminEvent>();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [eventAccessCode, setEventAccessCode] = useState("");
  const [eventAccessError, setEventAccessError] = useState("");
  const [eventAccessBusy, setEventAccessBusy] = useState(false);
  const [eventAccessCopied, setEventAccessCopied] = useState(false);
  const load = () => api.adminEvent(Number(id)).then(setEvent);
  useEffect(() => {
    void load();
  }, [id]);
  if (!event) return <Loader />;
  async function moderate(
    reg: number,
    key: "paid" | "confirmed",
    value: boolean,
  ) {
    await api.moderate(
      reg,
      key === "paid" ? value : undefined,
      key === "confirmed" ? value : undefined,
    );
    load();
  }
  async function status(value: string) {
    setStatusError("");
    try {
      await api.changeStatus(event!.id, value);
      if (value !== "live") {
        setEventAccessCode("");
        setEventAccessCopied(false);
      }
      load();
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Не удалось изменить статус");
    }
  }
  async function generateEventAccessCode() {
    setEventAccessError("");
    setEventAccessBusy(true);
    setEventAccessCopied(false);
    try {
      const result = await api.generateEventAccessCode(event!.id);
      setEventAccessCode(result.code);
      await load();
    } catch (e) {
      setEventAccessError(e instanceof Error ? e.message : "Не удалось создать резервный код");
    } finally {
      setEventAccessBusy(false);
    }
  }
  async function disableEventAccessCode() {
    setEventAccessError("");
    setEventAccessBusy(true);
    try {
      await api.disableEventAccessCode(event!.id);
      setEventAccessCode("");
      setEventAccessCopied(false);
      await load();
    } catch (e) {
      setEventAccessError(e instanceof Error ? e.message : "Не удалось отключить резервный код");
    } finally {
      setEventAccessBusy(false);
    }
  }
  async function copyEventAccessCode() {
    try {
      await navigator.clipboard.writeText(eventAccessCode);
      setEventAccessCopied(true);
    } catch {
      setEventAccessError("Не удалось скопировать код. Выделите его вручную");
    }
  }
  async function removeEvent() {
    try {
      await api.deleteEvent(event!.id);
      navigate("/admin");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Не удалось удалить мероприятие");
    }
  }
  return (
    <div className="page">
      <NavLink to="/admin" className="back">
        <ChevronLeft />
        Все мероприятия
      </NavLink>
      <PageHead
        eyebrow="Управление событием"
        title={event.title}
        action={
          <div className="admin-actions">
            {event.status === "registration" ? (
              <button className="primary" onClick={() => status("live")}>
                Начать мероприятие
              </button>
            ) : event.status === "live" ? (
              <>
                <button className="secondary" onClick={() => status("registration")}>
                  <RotateCcw />
                  Вернуть в регистрацию
                </button>
                <button className="primary" onClick={() => status("finished")}>
                  Завершить
                </button>
              </>
            ) : event.status === "finished" ? (
              <button className="secondary" onClick={() => status("live")}>
                <RotateCcw />
                Вернуть статус «Идёт»
              </button>
            ) : event.status === "cancelled" ? (
              <button className="secondary" onClick={() => status("registration")}>
                <RotateCcw />
                Возобновить регистрацию
              </button>
            ) : null}
            <button className="danger-button" onClick={() => setDeleteConfirm(true)}>
              <Trash2 />
              Удалить
            </button>
          </div>
        }
      />
      {statusError && <div className="error status-error">{statusError}</div>}
      {event.status_warning && (
        <div className="event-status-warning" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <b>{event.status_warning.title}</b>
            <p>{event.status_warning.body}</p>
          </div>
        </div>
      )}
      <section className={`event-access-panel ${event.event_access.active ? "active" : ""}`}>
        <div className="event-access-heading">
          <span className="event-access-icon"><KeyRound /></span>
          <div>
            <h2>Резервный вход на мероприятие</h2>
            <p>Если код из Telegram не приходит, сообщите участнику этот код. Номер телефона должен совпадать с подтверждённой заявкой.</p>
          </div>
          <span className={`event-access-status ${event.event_access.active ? "active" : ""}`}>
            {event.event_access.active ? "Активен" : "Неактивен"}
          </span>
        </div>
        {event.status === "live" ? (
          <div className="event-access-body">
            <div className="event-access-code-wrap">
              {eventAccessCode ? (
                <>
                  <span>Код для участников</span>
                  <strong>{eventAccessCode}</strong>
                  <small>Код показан полностью только сейчас. После обновления страницы создайте новый.</small>
                </>
              ) : event.event_access.active ? (
                <>
                  <span>Код уже создан</span>
                  <b>Полное значение скрыто в целях безопасности</b>
                  <small>{event.event_access.created_at ? `Создан ${dt(event.event_access.created_at)}` : "Можно заменить новым кодом"}</small>
                </>
              ) : (
                <>
                  <span>Резервный код ещё не создан</span>
                  <b>Создайте его при необходимости</b>
                  <small>Код будет работать только до выхода из статуса «Идёт».</small>
                </>
              )}
            </div>
            <div className="event-access-actions">
              {eventAccessCode && (
                <button type="button" className="secondary" onClick={copyEventAccessCode}>
                  <Copy />
                  {eventAccessCopied ? "Скопировано" : "Скопировать"}
                </button>
              )}
              <button type="button" className="primary" disabled={eventAccessBusy} onClick={generateEventAccessCode}>
                {event.event_access.active ? <RotateCcw /> : <KeyRound />}
                {eventAccessBusy ? "Подождите…" : event.event_access.active ? "Создать новый" : "Создать код"}
              </button>
              {event.event_access.active && (
                <button type="button" className="danger-button" disabled={eventAccessBusy} onClick={disableEventAccessCode}>
                  <X />
                  Отключить
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="event-access-unavailable">
            <Clock3 />
            <span>Генерация доступна только в статусе «Идёт». После завершения или отмены мероприятия код отключается автоматически.</span>
          </div>
        )}
        {eventAccessError && <div className="error event-access-error">{eventAccessError}</div>}
      </section>
      <div className="stats">
        <div>
          <Users />
          <span>
            Заявок<b>{event.stats.registrations}</b>
          </span>
        </div>
        <div>
          <Check />
          <span>
            Подтверждено<b>{event.stats.confirmed}</b>
          </span>
        </div>
        <div>
          <Clock3 />
          <span>
            В листе ожидания<b>{event.stats.waitlisted}</b>
          </span>
        </div>
        <div>
          <WalletCards />
          <span>
            Выручка<b>{money(event.stats.revenue)}</b>
          </span>
        </div>
        <div>
          <Heart />
          <span>
            Симпатий<b>{event.stats.likes}</b>
          </span>
        </div>
      </div>
      <AdminQuizPanel event={event} />
      <section>
        <div className="section-head">
          <h2>Участники</h2>
          <span>
            {event.registrations.length}{" "}
            {plural(event.registrations.length, "заявка", "заявки", "заявок")}
          </span>
        </div>
        <div className="participants-table">
          <div className="table-head">
            <span>Участник</span>
            <span>№</span>
            <span>Пол / возраст</span>
            <span>Предоплата</span>
            <span>Подтверждение</span>
          </div>
          {event.registrations.map((r) => (
            <div className="participant-row" key={r.id}>
              <div className="mini-user">
                <span>{r.user.name?.[0] || "?"}</span>
                <div>
                  <div className="mini-user-title">
                    <b>{r.user.name || "Профиль не заполнен"}</b>
                    <span className={`number-badge ${r.number ? "assigned" : ""}`}>
                      {r.number ? `№ ${r.number}` : "Без номера"}
                    </span>
                  </div>
                  <small>
                    {r.user.age !== undefined && r.user.age !== null
                      ? `${r.user.age} лет`
                      : "Возраст не указан"}
                  </small>
                  <a
                    className="participant-phone"
                    href={`tel:${r.user.phone.replace(/[^\d+]/g, "")}`}
                    aria-label={`Позвонить ${r.user.name || "участнику"} по номеру ${r.user.phone}`}
                    title={`Позвонить по номеру ${r.user.phone}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Phone aria-hidden="true" />
                    <span>Позвонить: {r.user.phone}</span>
                  </a>
                  <a
                    className="participant-telegram"
                    href={participantTelegramLink(r.user)}
                    aria-label={`Написать ${r.user.name || "участнику"} в Telegram`}
                  >
                    <Send />
                    {telegramUsername(r.user.telegram)
                      ? `@${telegramUsername(r.user.telegram)}`
                      : "Написать в Telegram по номеру"}
                  </a>
                </div>
              </div>
              <span className={`participant-number ${r.number ? "assigned" : ""}`}>
                {r.number ? `№ ${r.number}` : "Не назначен"}
              </span>
              <span>
                {r.user.gender === "female" ? "Женский" : "Мужской"}
                <small className="participant-age">
                  {r.user.age !== undefined && r.user.age !== null
                    ? `${r.user.age} лет`
                    : "Возраст не указан"}
                </small>
              </span>
              {r.status === "waitlisted" ? (
                <span className="waitlist-payment">После освобождения места</span>
              ) : (
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={r.paid}
                    onChange={(e) => moderate(r.id, "paid", e.target.checked)}
                  />
                  <i />
                  {r.paid ? "Внесена" : "Ожидается"}
                </label>
              )}
              {r.status === "waitlisted" ? (
                <div className="row-actions waitlist-admin-actions">
                  <span className="waitlist-admin-status">
                    <Clock3 />
                    В очереди
                  </span>
                  <button
                    aria-label={`Удалить ${r.user.name || "участника"} из листа ожидания`}
                    onClick={() => moderate(r.id, "confirmed", false)}
                  >
                    <X />
                  </button>
                </div>
              ) : (
                <div className="row-actions">
                  <button
                    className={r.status === "confirmed" ? "active" : ""}
                    onClick={() => moderate(r.id, "confirmed", true)}
                  >
                    <Check />
                    Подтвердить
                  </button>
                  <button
                    className={r.status === "rejected" ? "danger" : ""}
                    aria-label={`Отклонить заявку ${r.user.name || "участника"}`}
                    onClick={() => moderate(r.id, "confirmed", false)}
                  >
                    <X />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="sympathy-section">
        <div className="section-head">
          <h2>Симпатии и совпадения</h2>
          <span>
            {event.stats.likes} {plural(event.stats.likes, "отметка", "отметки", "отметок")} ·{" "}
            {event.stats.matches} {plural(event.stats.matches, "совпадение", "совпадения", "совпадений")}
          </span>
        </div>
        {event.sympathies.matches.length > 0 && (
          <>
            <h3 className="sympathy-subtitle">Взаимные симпатии</h3>
            <div className="match-grid">
              {event.sympathies.matches.map((match) => (
                <article className="match-admin-card" key={`${match.first.id}-${match.second.id}`}>
                  <div className="match-admin-people">
                    <SympathyPerson person={match.first} />
                    <span className="match-admin-heart"><Heart fill="currentColor" /></span>
                    <SympathyPerson person={match.second} />
                  </div>
                  <span className="match-admin-label"><Check /> Совпадение</span>
                </article>
              ))}
            </div>
          </>
        )}
        {event.sympathies.one_sided.length > 0 && (
          <>
            <h3 className="sympathy-subtitle one-sided-title">Симпатии без совпадения</h3>
            <div className="one-sided-likes">
              {event.sympathies.one_sided.map((like) => (
                <article key={`${like.from.id}-${like.to.id}`}>
                  <SympathyPerson person={like.from} />
                  <span className="like-direction">→</span>
                  <SympathyPerson person={like.to} />
                  <span className="one-sided-label">Без взаимности</span>
                </article>
              ))}
            </div>
          </>
        )}
        {event.stats.likes === 0 && (
          <div className="sympathy-empty">
            <Heart />
            <div>
              <b>Симпатий пока нет</b>
              <span>Выбор участников появится здесь во время мероприятия.</span>
            </div>
          </div>
        )}
      </section>
      {deleteConfirm && (
        <div className="modal-wrap" onMouseDown={() => setDeleteConfirm(false)}>
          <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" aria-label="Закрыть окно" onClick={() => setDeleteConfirm(false)}>
              <X />
            </button>
            <div className="danger-icon"><Trash2 /></div>
            <h2>Удалить мероприятие?</h2>
            <p>
              «{event.title}» и все связанные регистрации и симпатии будут удалены без возможности восстановления.
            </p>
            {deleteError && <div className="error">{deleteError}</div>}
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setDeleteConfirm(false)}>Отмена</button>
              <button className="danger-button solid" onClick={removeEvent}>Удалить мероприятие</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Heart />
      <h3>{text}</h3>
      <p>Всё самое интересное ещё впереди.</p>
    </div>
  );
}
function Loader() {
  return (
    <div className="loader">
      <Heart fill="currentColor" />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const [ageDecision, setAgeDecision] = useState<AgeDecision>(readAgeDecision);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (localStorage.getItem("realdate_token"))
      api
        .me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem("realdate_token");
          setUser(null);
        });
    else setUser(null);
  }, []);
  if (ageDecision !== "adult" && PUBLIC_LEGAL_PATHS.has(location.pathname)) return <PublicSite />;
  if (ageDecision === null) {
    return (
      <AgeGate
        onDecision={(decision) => {
          saveAgeDecision(decision);
          setAgeDecision(decision);
        }}
      />
    );
  }
  if (ageDecision === "underage") {
    return (
      <AgeRestricted
        onReset={() => {
          document.cookie = `${AGE_CONFIRMATION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
          setAgeDecision(null);
        }}
      />
    );
  }
  if (user === undefined) return <Loader />;
  if (!user && location.pathname === "/login") {
    return <Auth onDone={setUser} />;
  }
  return user ? (
    <Shell user={user} setUser={setUser} />
  ) : (
    <PublicSite />
  );
}
