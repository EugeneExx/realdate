import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { api, Event } from "./api";
import {
  emailHref,
  phoneHref,
  publicConfig,
  publicConfigReady,
  telegramHref,
} from "./public-config";

const money = (value: number) =>
  `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

const eventDate = (value: string) =>
  format(new Date(value), "d MMMM yyyy, HH:mm", { locale: ru });

const developerPhone = "+7 999 080-01-37";
const developerPhoneHref = "tel:+79990800137";
const developerTelegram = "net_eugene";
const developerTelegramHref = `https://t.me/${developerTelegram}`;

function PublicLogo() {
  return (
    <span className="public-logo" aria-label={publicConfig.brand}>
      <b>REALDATE</b>
      <small>quickly</small>
    </span>
  );
}

function PublicHeader() {
  return (
    <header className="public-header">
      <div className="public-container public-header-inner">
        <Link to="/" aria-label="На главную">
          <PublicLogo />
        </Link>
        <nav aria-label="Основная навигация">
          <a href="/#events">Мероприятия</a>
          <Link to="/payment-and-refund">Оплата и возврат</Link>
          <Link to="/contacts">Контакты</Link>
        </nav>
        <Link className="public-login" to="/login">
          Войти
          <ChevronRight />
        </Link>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-grid">
        <div>
          <PublicLogo />
          <p>Живые быстрые знакомства в Хабаровске.</p>
        </div>
        <div>
          <b>Участникам</b>
          <a href="/#events">Ближайшие мероприятия</a>
          <Link to="/payment-and-refund">Оплата и возврат</Link>
          <Link to="/offer">Публичная оферта</Link>
        </div>
        <div>
          <b>Документы</b>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/personal-data-consent">Согласие на обработку данных</Link>
          <Link to="/contacts">Контакты и реквизиты</Link>
        </div>
        <div>
          <b>Связаться</b>
          <a href={phoneHref}>{publicConfig.supportPhone}</a>
          {emailHref ? <a href={emailHref}>{publicConfig.supportEmail}</a> : <span>{publicConfig.supportEmail}</span>}
          <a href={telegramHref} target="_blank" rel="noreferrer">
            Telegram @{publicConfig.supportTelegram}
          </a>
        </div>
      </div>
      <div className="public-container public-footer-bottom">
        <span>© {new Date().getFullYear()} {publicConfig.brand}</span>
        <span className="public-footer-developer">
          Разработка сайта:
          <a href={developerTelegramHref} target="_blank" rel="noreferrer">@{developerTelegram}</a>
          <a href={developerPhoneHref}>{developerPhone}</a>
        </span>
        <span>Информационный сервис для лиц старше 18 лет</span>
      </div>
    </footer>
  );
}

function PublicEventCard({ event }: { event: Event }) {
  const free = Math.max(
    0,
    event.male_capacity +
      event.female_capacity -
      event.male_taken -
      event.female_taken,
  );
  const ageLabel = event.age_min && event.age_max
    ? `${event.age_min}–${event.age_max} лет`
    : event.age_min
      ? `От ${event.age_min} лет`
      : event.age_max
        ? `До ${event.age_max} лет`
        : null;
  return (
    <article className="public-event-card">
      <div className="public-event-date">
        <span>{format(new Date(event.starts_at), "MMM", { locale: ru })}</span>
        <b>{format(new Date(event.starts_at), "dd")}</b>
        <small>{format(new Date(event.starts_at), "yyyy")}</small>
      </div>
      <div className="public-event-content">
        <div className="public-event-topline">
          <span>{event.status === "live" ? "Идёт сейчас" : "Открыта запись"}</span>
          {ageLabel && <small>{ageLabel}</small>}
        </div>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
        <div className="public-event-meta">
          <span><Clock3 />{eventDate(event.starts_at)}</span>
          <span><MapPin />{event.venue}, {event.address}</span>
          <span><Users />Свободно мест: {free}</span>
        </div>
        <div className="public-event-bottom">
          <div>
            <small>Стоимость участия</small>
            <strong>{money(event.price)}</strong>
          </div>
          <Link to="/login" className="public-primary">
            Войти и записаться
            <ChevronRight />
          </Link>
        </div>
      </div>
    </article>
  );
}

function PublicHome() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.publicEvents()
      .then(setEvents)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить мероприятия"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <section className="public-hero">
        <div className="public-container public-hero-grid">
          <div className="public-hero-copy">
            <span className="public-kicker"><Sparkles /> Знакомства, которые случаются</span>
            <h1>Не свайпай.<br /><em>Встречайся.</em></h1>
            <p>
              Камерные вечера быстрых знакомств: живой разговор,
              понятная программа и контакты только при взаимной симпатии.
            </p>
            <div className="public-hero-actions">
              <a href="#events" className="public-primary">Выбрать мероприятие</a>
              <Link to="/payment-and-refund" className="public-secondary">Как проходит оплата</Link>
            </div>
            <div className="public-trust-row">
              <span><ShieldCheck />Контакты защищены</span>
              <span><UserRoundCheck />Только 18+</span>
              <span><Heart />Взаимные симпатии</span>
            </div>
          </div>
          <div className="public-hero-art" aria-hidden="true">
            <div className="public-art-card public-art-card-one">
              <Heart fill="currentColor" />
              <span>живой разговор</span>
            </div>
            <div className="public-art-ring"><span>♡</span></div>
            <div className="public-art-card public-art-card-two">
              <CheckCircle2 />
              <span>взаимная симпатия</span>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section public-how">
        <div className="public-container">
          <div className="public-section-head">
            <span>Как это работает</span>
            <h2>Один вечер — много настоящих встреч</h2>
          </div>
          <div className="public-steps">
            <article><b>01</b><CalendarDays /><h3>Выберите дату</h3><p>Посмотрите программу, место, возрастной диапазон и стоимость участия.</p></article>
            <article><b>02</b><CreditCard /><h3>Запишитесь</h3><p>Заполните профиль, подайте заявку и внесите полную предоплату после подтверждения.</p></article>
            <article><b>03</b><MessageCircle /><h3>Познакомьтесь</h3><p>Общайтесь вживую и отметьте тех, с кем хотите продолжить знакомство.</p></article>
            <article><b>04</b><Heart /><h3>Получите контакты</h3><p>При взаимной симпатии контакты откроются обоим участникам.</p></article>
          </div>
        </div>
      </section>

      <section className="public-section public-events" id="events">
        <div className="public-container">
          <div className="public-section-head public-section-head-row">
            <div>
              <span>Афиша</span>
              <h2>Ближайшие мероприятия</h2>
            </div>
            <p>Стоимость и условия указаны отдельно для каждой встречи.</p>
          </div>
          {loading && <div className="public-state">Загружаем афишу…</div>}
          {error && <div className="public-state public-state-error">{error}</div>}
          {!loading && !error && events.length === 0 && (
            <div className="public-state">Новые даты скоро появятся. Следите за обновлениями.</div>
          )}
          <div className="public-events-grid">
            {events.map((event) => <PublicEventCard key={event.id} event={event} />)}
          </div>
        </div>
      </section>

      <section className="public-section public-safety">
        <div className="public-container public-safety-grid">
          <div>
            <span className="public-kicker"><ShieldCheck /> Конфиденциальность</span>
            <h2>Ваши контакты не видны другим участникам заранее</h2>
          </div>
          <p>
            Во время мероприятия участники видят только имя, фотографию и описание профиля.
            Контактные данные открываются исключительно при взаимной симпатии после завершения встречи.
          </p>
        </div>
      </section>
    </>
  );
}

type DocumentKind = "offer" | "privacy" | "consent" | "payment" | "contacts";

function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="document-section"><h2>{title}</h2>{children}</section>;
}

function Requisites() {
  return (
    <dl className="requisites">
      <div><dt>Исполнитель и оператор данных</dt><dd>{publicConfig.legalName}</dd></div>
      <div><dt>Статус</dt><dd>Плательщик налога на профессиональный доход (самозанятый)</dd></div>
      <div><dt>ИНН</dt><dd>{publicConfig.legalInn}</dd></div>
      <div><dt>Адрес</dt><dd>{publicConfig.legalAddress}</dd></div>
      <div><dt>Телефон</dt><dd><a href={phoneHref}>{publicConfig.supportPhone}</a></dd></div>
      <div><dt>Электронная почта</dt><dd>{emailHref ? <a href={emailHref}>{publicConfig.supportEmail}</a> : publicConfig.supportEmail}</dd></div>
      <div><dt>Сайт</dt><dd><a href={publicConfig.siteUrl}>{publicConfig.siteUrl}</a></dd></div>
    </dl>
  );
}

function OfferDocument() {
  return (
    <DocumentPage title="Публичная оферта" lead="Условия оказания услуг по организации участия в мероприятиях REALDATE quickly.">
      <DocumentSection title="1. Общие положения">
        <p>Настоящий документ является предложением самозанятого, указанного в разделе «Реквизиты», заключить договор оказания услуг. Акцептом оферты является внесение оплаты за выбранное мероприятие.</p>
        <p>Услуга предназначена только для дееспособных лиц, достигших 18 лет. Пользователь до оплаты знакомится с описанием, датой, местом, стоимостью и возрастными рекомендациями мероприятия.</p>
      </DocumentSection>
      <DocumentSection title="2. Предмет договора">
        <p>Исполнитель организует участие заказчика в очном мероприятии формата быстрых знакомств: предоставляет место, программу встреч и доступ к функциям сайта, связанным с выбранным мероприятием.</p>
        <p>Услуга не гарантирует возникновение симпатии, отношений или обмен контактами. Такие результаты зависят от добровольного выбора участников.</p>
      </DocumentSection>
      <DocumentSection title="3. Запись и подтверждение">
        <ol>
          <li>Пользователь регистрируется по номеру телефона и заполняет обязательные данные профиля.</li>
          <li>Пользователь выбирает мероприятие и направляет заявку.</li>
          <li>Исполнитель проверяет наличие мест и подтверждает либо отклоняет заявку.</li>
          <li>После подтверждения пользователь вносит полную предоплату по цене, указанной на странице мероприятия.</li>
          <li>Запись считается окончательно подтверждённой после успешной оплаты.</li>
        </ol>
        <p>Возрастной диапазон носит информационный характер. Окончательное решение о допуске принимает организатор с учётом формата мероприятия и состава группы.</p>
      </DocumentSection>
      <DocumentSection title="4. Права и обязанности сторон">
        <p>Пользователь обязан указать достоверные данные, соблюдать правила площадки, уважительно относиться к другим гостям и не распространять полученные на мероприятии персональные данные без законного основания.</p>
        <p>Исполнитель вправе отказать в участии при недостоверных данных, нарушении правил безопасности, агрессивном поведении или отсутствии свободных мест. При отказе после оплаты деньги возвращаются за вычетом только тех расходов, удержание которых допускается законом.</p>
      </DocumentSection>
      <DocumentSection title="5. Отмена и возврат">
        <p>Пользователь вправе отказаться от услуги до начала мероприятия. Возврат производится с учётом фактически понесённых исполнителем и документально подтверждаемых расходов в соответствии со статьёй 32 Закона РФ «О защите прав потребителей».</p>
        <p>Если мероприятие отменено исполнителем, стоимость участия возвращается полностью. При переносе пользователь может согласиться на новую дату либо запросить возврат. Подробный порядок приведён на странице <Link to="/payment-and-refund">«Оплата и возврат»</Link>.</p>
      </DocumentSection>
      <DocumentSection title="6. Персональные данные">
        <p>Обработка персональных данных осуществляется в соответствии с <Link to="/privacy">Политикой конфиденциальности</Link> и отдельным <Link to="/personal-data-consent">согласием пользователя</Link>.</p>
      </DocumentSection>
      <DocumentSection title="7. Реквизиты исполнителя"><Requisites /></DocumentSection>
    </DocumentPage>
  );
}

function PrivacyDocument() {
  return (
    <DocumentPage title="Политика конфиденциальности" lead="Правила обработки и защиты персональных данных пользователей сайта.">
      <DocumentSection title="1. Оператор персональных данных">
        <p>Оператором персональных данных является самозанятый, указанный в реквизитах настоящей Политики. Политика применяется к сайту {publicConfig.siteUrl} и личному кабинету пользователя.</p>
      </DocumentSection>
      <DocumentSection title="2. Какие данные обрабатываются">
        <ul>
          <li>номер телефона, электронная почта и контакты в Telegram, WhatsApp или MAX;</li>
          <li>имя, дата рождения, возраст, пол, фотография и описание профиля;</li>
          <li>подтверждение совершеннолетия, дата и время подтверждения перед записью и оплатой;</li>
          <li>заявки, оплаты, статусы участия и номера участников;</li>
          <li>ответы квиза, отметки симпатий и результаты взаимных совпадений;</li>
          <li>технические данные: IP-адрес, время запросов, сведения о сессии и действиях на сайте.</li>
        </ul>
      </DocumentSection>
      <DocumentSection title="3. Цели обработки">
        <ul>
          <li>регистрация и авторизация пользователя;</li>
          <li>создание профиля и запись на мероприятие;</li>
          <li>проверка оплаты, организация мероприятия и уведомления;</li>
          <li>проведение квизов и сопоставление взаимных симпатий;</li>
          <li>обработка обращений, возвратов, претензий и исполнение требований закона;</li>
          <li>обеспечение безопасности и предотвращение злоупотреблений.</li>
        </ul>
      </DocumentSection>
      <DocumentSection title="4. Правовые основания">
        <p>Оператор обрабатывает данные на основании согласия пользователя, заключения и исполнения договора, а также обязанностей, установленных законодательством Российской Федерации.</p>
      </DocumentSection>
      <DocumentSection title="5. Доступ и передача данных">
        <p>Данные могут передаваться платёжному оператору Robokassa, поставщику сообщений авторизации, хостинг-провайдеру и иным обработчикам только в объёме, необходимом для работы сервиса. Контакты одного участника передаются другому только при взаимной симпатии и в соответствии с выбранной пользователем функцией сервиса.</p>
        <p>Реквизиты банковской карты вводятся пользователем непосредственно на защищённой платёжной странице Robokassa. Сайт REALDATE quickly не получает и не хранит номер карты, срок её действия и защитный код.</p>
        <p>Оператор не продаёт персональные данные. Передача государственным органам допускается только на основаниях, предусмотренных законом.</p>
      </DocumentSection>
      <DocumentSection title="6. Хранение и защита">
        <p>Данные хранятся на защищённых информационных системах в течение срока действия аккаунта и периода, необходимого для исполнения договора и требований закона. Используются разграничение доступа, защищённое HTTPS-соединение, резервное копирование и журналирование действий.</p>
        <p>Ответ о достижении возраста 18 лет при первом посещении сохраняется в функциональном cookie на устройстве пользователя сроком до одного года. Cookie содержит только результат подтверждения и не содержит дату рождения или реквизиты документа.</p>
      </DocumentSection>
      <DocumentSection title="7. Права пользователя">
        <p>Пользователь может запросить сведения об обработке, исправление, ограничение или удаление данных, а также отозвать согласие. Запрос направляется по электронной почте оператора. Для защиты аккаунта оператор вправе запросить подтверждение личности.</p>
      </DocumentSection>
      <DocumentSection title="8. Технические данные">
        <p>Сайт использует локальное хранилище браузера для сохранения авторизованной сессии. В текущей версии рекламные и аналитические cookie не применяются.</p>
      </DocumentSection>
      <DocumentSection title="9. Реквизиты оператора"><Requisites /></DocumentSection>
    </DocumentPage>
  );
}

function ConsentDocument() {
  return (
    <DocumentPage title="Согласие на обработку персональных данных" lead="Согласие пользователя сайта REALDATE quickly в соответствии с Федеральным законом №152-ФЗ.">
      <DocumentSection title="1. Содержание согласия">
        <p>Пользователь свободно, своей волей и в своём интересе даёт оператору согласие на обработку данных, перечисленных в настоящем документе, для регистрации, записи и участия в мероприятиях.</p>
      </DocumentSection>
      <DocumentSection title="2. Перечень данных">
        <p>Согласие распространяется на номер телефона, электронную почту, имя, дату рождения, возраст, пол, фотографию, сведения «о себе», контакты в мессенджерах, данные о заявках и оплатах, участии в мероприятиях, ответах квиза, отметках симпатий и взаимных совпадениях.</p>
      </DocumentSection>
      <DocumentSection title="3. Разрешённые действия">
        <p>Оператор вправе собирать, записывать, систематизировать, накапливать, хранить, уточнять, использовать, предоставлять уполномоченным обработчикам, блокировать и уничтожать данные с применением средств автоматизации или без них.</p>
      </DocumentSection>
      <DocumentSection title="4. Показ профиля участникам">
        <p>Во время мероприятия имя, фотография и описание профиля могут быть показаны подтверждённым участникам противоположного пола. Контактные данные открываются конкретному участнику только при взаимной симпатии.</p>
      </DocumentSection>
      <DocumentSection title="5. Срок и отзыв согласия">
        <p>Согласие действует до достижения целей обработки или его отзыва, если дальнейшее хранение не требуется законом. Отзыв направляется на электронную почту оператора. Отзыв может сделать невозможным дальнейшее использование аккаунта и участие в мероприятиях.</p>
      </DocumentSection>
      <DocumentSection title="6. Подтверждение пользователя">
        <p>Устанавливая соответствующий флажок на сайте, пользователь подтверждает, что достиг 18 лет, ознакомился с <Link to="/privacy">Политикой конфиденциальности</Link> и понимает условия настоящего согласия.</p>
      </DocumentSection>
      <DocumentSection title="7. Реквизиты оператора"><Requisites /></DocumentSection>
    </DocumentPage>
  );
}

function PaymentDocument() {
  return (
    <DocumentPage title="Оплата и возврат" lead="Порядок внесения предоплаты, подтверждения участия и возврата денежных средств.">
      <DocumentSection title="Стоимость и момент оплаты">
        <p>Актуальная стоимость указывается на странице конкретного мероприятия. После подачи заявки организатор проверяет наличие мест. Полная предоплата вносится только после подтверждения заявки.</p>
        <p>Перед записью и переходом к оплате пользователь отдельно подтверждает, что ему исполнилось 18 лет и данные профиля достоверны. Дата и время подтверждения сохраняются вместе с заявкой.</p>
        <p>Дополнительных подписок и регулярных автоматических списаний нет. Любое изменение стоимости сообщается до оплаты.</p>
      </DocumentSection>
      <DocumentSection title="Способы оплаты">
        <p>Онлайн-оплата принимается через защищённую платёжную страницу Robokassa. Пользователь может оплатить участие через Систему быстрых платежей (СБП) или банковской картой, если соответствующий способ доступен для магазина в момент оплаты.</p>
        <p>Реквизиты банковской карты пользователь вводит на стороне Robokassa. Сайт REALDATE quickly не получает и не хранит номер карты, срок её действия и защитный код.</p>
        <p>После успешной оплаты статус записи обновляется в личном кабинете. Если статус не изменился, необходимо написать организатору и указать номер телефона аккаунта, мероприятие, сумму и время платежа.</p>
      </DocumentSection>
      <DocumentSection title="Электронный чек">
        <p>Исполнитель применяет налог на профессиональный доход. После успешной оплаты сервис «Робочеки СМЗ», подключённый к кабинету исполнителя в приложении ФНС «Мой налог», автоматически формирует чек, передаёт сведения в налоговый орган и направляет чек покупателю по указанным при оплате контактам.</p>
      </DocumentSection>
      <DocumentSection title="Отказ участника">
        <p>До начала мероприятия пользователь вправе отказаться от участия. Для возврата необходимо направить заявление по электронной почте или в Telegram и указать ФИО, номер телефона аккаунта, название мероприятия, сумму и дату платежа. Передавать организатору реквизиты банковской карты не требуется.</p>
        <p>Возврат оформляется тем же способом, которым была внесена оплата, в течение 10 календарных дней со дня получения требования с учётом фактически понесённых исполнителем и документально подтверждённых расходов. Срок фактического зачисления после оформления возврата зависит от банка плательщика и правил платёжной системы или СБП.</p>
        <p>После начала мероприятия размер возврата определяется с учётом уже оказанной части услуги и фактически понесённых расходов. Это не ограничивает права пользователя при неоказании услуги или наличии недостатков.</p>
      </DocumentSection>
      <DocumentSection title="Отмена или перенос мероприятия">
        <p>При отмене мероприятия исполнителем полная стоимость участия возвращается тем же способом в течение 10 календарных дней. При переносе участнику предлагается новая дата; если она не подходит, участник вправе отказаться и получить полный возврат. Срок фактического зачисления зависит от банка плательщика и правил платёжной системы или СБП.</p>
      </DocumentSection>
      <DocumentSection title="Контакты для обращений">
        <p>Телефон: <a href={phoneHref}>{publicConfig.supportPhone}</a><br />Telegram: <a href={telegramHref}>@{publicConfig.supportTelegram}</a><br />Электронная почта: {emailHref ? <a href={emailHref}>{publicConfig.supportEmail}</a> : publicConfig.supportEmail}</p>
      </DocumentSection>
    </DocumentPage>
  );
}

function ContactsDocument() {
  return (
    <DocumentPage title="Контакты и реквизиты" lead="Информация об организаторе мероприятий REALDATE quickly.">
      {!publicConfigReady && (
        <div className="document-warning">
          До отправки магазина на активацию в Robokassa организатору необходимо заполнить ФИО, ИНН, адрес и электронную почту.
        </div>
      )}
      <DocumentSection title="Реквизиты"><Requisites /></DocumentSection>
      <DocumentSection title="Поддержка участников">
        <div className="contact-cards">
          <a href={phoneHref}><Phone /><span><small>Телефон</small><b>{publicConfig.supportPhone}</b></span></a>
          <a href={telegramHref} target="_blank" rel="noreferrer"><MessageCircle /><span><small>Telegram</small><b>@{publicConfig.supportTelegram}</b></span></a>
          {emailHref && <a href={emailHref}><Mail /><span><small>Электронная почта</small><b>{publicConfig.supportEmail}</b></span></a>}
        </div>
        <p>Обращения по записи, оплате и возвратам обрабатываются ежедневно. В сообщении укажите номер телефона аккаунта и название мероприятия.</p>
      </DocumentSection>
      <DocumentSection title="Разработка сайта">
        <div className="contact-cards developer-contact-cards">
          <a href={developerTelegramHref} target="_blank" rel="noreferrer"><MessageCircle /><span><small>Telegram разработчика</small><b>@{developerTelegram}</b></span></a>
          <a href={developerPhoneHref}><Phone /><span><small>Телефон разработчика</small><b>{developerPhone}</b></span></a>
        </div>
        <p>По техническим вопросам работы сайта можно обратиться к разработчику. Вопросы по мероприятиям, оплате и возвратам направляйте в поддержку организатора выше.</p>
      </DocumentSection>
    </DocumentPage>
  );
}

function DocumentPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="public-document">
      <div className="public-container document-container">
        <Link className="document-back" to="/"><ChevronRight />На главную</Link>
        <span className="public-kicker">Правовая информация</span>
        <h1>{title}</h1>
        <p className="document-lead">{lead}</p>
        <p className="document-date">Редакция от {publicConfig.documentsEffectiveDate}</p>
        <div className="document-body">{children}</div>
      </div>
    </main>
  );
}

export function PublicDocumentPage({ kind }: { kind: DocumentKind }) {
  if (kind === "offer") return <OfferDocument />;
  if (kind === "privacy") return <PrivacyDocument />;
  if (kind === "consent") return <ConsentDocument />;
  if (kind === "payment") return <PaymentDocument />;
  return <ContactsDocument />;
}

export default function PublicSite() {
  return (
    <div className="public-site">
      <PublicHeader />
      <Routes>
        <Route path="/" element={<PublicHome />} />
        <Route path="/offer" element={<PublicDocumentPage kind="offer" />} />
        <Route path="/privacy" element={<PublicDocumentPage kind="privacy" />} />
        <Route path="/personal-data-consent" element={<PublicDocumentPage kind="consent" />} />
        <Route path="/payment-and-refund" element={<PublicDocumentPage kind="payment" />} />
        <Route path="/contacts" element={<PublicDocumentPage kind="contacts" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PublicFooter />
    </div>
  );
}
