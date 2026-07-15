from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import random
import re
import secrets
from contextlib import suppress
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import phonenumbers
import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, and_, delete, func, inspect as sa_inspect, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, selectinload


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./realdate.db"
    jwt_secret: str = "local-development-secret"
    jwt_expire_days: int = 30
    otp_provider: str = "console"
    telegram_gateway_token: str | None = None
    telegram_sender_username: str | None = None
    telegram_gateway_callback_url: str | None = None
    telegram_gateway_low_balance_threshold: Decimal = Decimal("1.00")
    otp_ip_hourly_limit: int = 30
    otp_phone_hourly_limit: int = 5
    otp_resend_seconds: int = 60
    telegram_bot_token: str | None = None
    telegram_bot_username: str | None = None
    telegram_bot_webhook_secret: str | None = None
    smsru_api_id: str | None = None
    smsru_from: str | None = None
    smsaero_email: str | None = None
    smsaero_api_key: str | None = None
    smsaero_sign: str = "SMSAero"
    admin_phone: str = "+79990000000"
    admin_phones: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    event_timezone: str = "Asia/Khabarovsk"


settings = Settings()
reminder_task: asyncio.Task[None] | None = None
logger = logging.getLogger("realdate")


def configured_admin_phones() -> set[str]:
    phones = {settings.admin_phone.strip()} if settings.admin_phone.strip() else set()
    phones.update(phone.strip() for phone in settings.admin_phones.split(",") if phone.strip())
    return phones


UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class Base(DeclarativeBase):
    pass


class Gender(str, Enum):
    male = "male"
    female = "female"


class EventStatus(str, Enum):
    registration = "registration"
    live = "live"
    finished = "finished"
    cancelled = "cancelled"


class RegistrationStatus(str, Enum):
    awaiting_payment = "awaiting_payment"
    confirmed = "confirmed"
    rejected = "rejected"
    waitlisted = "waitlisted"


class QuizStatus(str, Enum):
    draft = "draft"
    active = "active"
    results = "results"


class QuestionType(str, Enum):
    single = "single"
    multiple = "multiple"
    text = "text"


class QuizAction(str, Enum):
    launch = "launch"
    publish = "publish"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    name: Mapped[str | None] = mapped_column(String(80))
    gender: Mapped[Gender | None] = mapped_column(SAEnum(Gender))
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    telegram: Mapped[str | None] = mapped_column(String(100))
    whatsapp: Mapped[str | None] = mapped_column(String(24))
    max_phone: Mapped[str | None] = mapped_column(String(24))
    telegram_chat_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    telegram_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    telegram_link_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    telegram_link_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(24), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    request_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    delivery_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    gateway_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    gateway_delivery_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gateway_verification_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gateway_request_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    gateway_remaining_balance: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    gateway_is_refunded: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    gateway_error: Mapped[str | None] = mapped_column(String(160), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    venue: Mapped[str] = mapped_column(String(240))
    address: Mapped[str] = mapped_column(String(300))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    male_capacity: Mapped[int] = mapped_column(Integer)
    female_capacity: Mapped[int] = mapped_column(Integer)
    age_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    age_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[EventStatus] = mapped_column(SAEnum(EventStatus), default=EventStatus.registration)
    status_warning_sent_for: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    registrations: Mapped[list[Registration]] = relationship(back_populates="event", cascade="all, delete-orphan", passive_deletes=True)
    quiz: Mapped[Quiz | None] = relationship(back_populates="event", cascade="all, delete-orphan", passive_deletes=True, uselist=False, lazy="selectin")


class Registration(Base):
    __tablename__ = "registrations"
    __table_args__ = (UniqueConstraint("event_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[RegistrationStatus] = mapped_column(SAEnum(RegistrationStatus), default=RegistrationStatus.awaiting_payment)
    paid: Mapped[bool] = mapped_column(Boolean, default=False)
    pdata_consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    prepayment_consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    adult_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    participant_number: Mapped[int | None] = mapped_column(Integer)
    reminder_24h_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminder_2h_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    event: Mapped[Event] = relationship(back_populates="registrations")
    user: Mapped[User] = relationship()


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("event_id", "from_user_id", "to_user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    liked: Mapped[bool] = mapped_column(Boolean)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    admin_only: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str] = mapped_column(String(180))
    body: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Quiz(Base):
    __tablename__ = "quizzes"
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(180), default="Квиз")
    status: Mapped[QuizStatus] = mapped_column(SAEnum(QuizStatus), default=QuizStatus.draft)
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    results_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    event: Mapped[Event] = relationship(back_populates="quiz")
    questions: Mapped[list[QuizQuestion]] = relationship(back_populates="quiz", cascade="all, delete-orphan", passive_deletes=True, order_by="QuizQuestion.position", lazy="selectin")
    attempts: Mapped[list[QuizAttempt]] = relationship(back_populates="quiz", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    question_type: Mapped[QuestionType] = mapped_column(SAEnum(QuestionType))
    points: Mapped[int] = mapped_column(Integer, default=1)
    position: Mapped[int] = mapped_column(Integer)
    correct_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quiz: Mapped[Quiz] = relationship(back_populates="questions")
    options: Mapped[list[QuizOption]] = relationship(back_populates="question", cascade="all, delete-orphan", passive_deletes=True, order_by="QuizOption.position", lazy="selectin")


class QuizOption(Base):
    __tablename__ = "quiz_options"
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("quiz_questions.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(500))
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer)
    question: Mapped[QuizQuestion] = relationship(back_populates="options")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (UniqueConstraint("quiz_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    quiz: Mapped[Quiz] = relationship(back_populates="attempts")
    user: Mapped[User] = relationship()
    answers: Mapped[list[QuizAnswer]] = relationship(back_populates="attempt", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin")


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("quiz_attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("quiz_questions.id", ondelete="CASCADE"), index=True)
    answer_value: Mapped[str] = mapped_column(Text)
    awarded_points: Mapped[int] = mapped_column(Integer, default=0)
    attempt: Mapped[QuizAttempt] = relationship(back_populates="answers")
    question: Mapped[QuizQuestion] = relationship(lazy="selectin")


engine = create_async_engine(settings.database_url)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with Session() as session:
        yield session


class PhoneIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str) -> str:
        try:
            parsed = phonenumbers.parse(value, "RU")
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except Exception as exc:
            raise ValueError("Введите корректный номер телефона") from exc


class VerifyIn(PhoneIn):
    code: str = Field(min_length=4, max_length=6)


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=80)
    gender: Gender
    birth_date: date
    email: str | None = Field(default=None, max_length=254)
    bio: str = Field(default="", max_length=1200)
    telegram: str = Field(min_length=1, max_length=100)
    whatsapp: str | None = None
    max_phone: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Имя должно содержать не менее 2 символов")
        return value

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Введите корректный email")
        return value

    @field_validator("telegram")
    @classmethod
    def clean_telegram(cls, value: str) -> str:
        username = re.sub(
            r"^https?://(?:www\.)?(?:t\.me|telegram\.me)/",
            "",
            value.strip(),
            flags=re.IGNORECASE,
        ).lstrip("@").split("/", 1)[0].split("?", 1)[0]
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{4,31}", username):
            raise ValueError("Введите корректное имя Telegram, например @username")
        return f"@{username}"

    @field_validator("bio", "whatsapp", "max_phone")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("birth_date")
    @classmethod
    def valid_birth_date(cls, value: date) -> date:
        age = calculate_age(value)
        if age < 18:
            raise ValueError("Пользователь должен быть старше 18 лет")
        if age > 100:
            raise ValueError("Проверьте правильность даты рождения")
        return value


class EventIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=3000)
    starts_at: datetime
    venue: str = Field(min_length=2, max_length=240)
    address: str = Field(min_length=4, max_length=300)
    price: Decimal = Field(gt=0)
    male_capacity: int = Field(ge=1, le=100)
    female_capacity: int = Field(ge=1, le=100)
    age_min: int | None = Field(default=None, ge=18, le=100)
    age_max: int | None = Field(default=None, ge=18, le=100)

    @model_validator(mode="after")
    def valid_age_range(self):
        if (self.age_min is None) != (self.age_max is None):
            raise ValueError("Укажите обе границы возраста")
        if self.age_min is not None and self.age_max is not None and self.age_min > self.age_max:
            raise ValueError("Минимальный возраст не может быть больше максимального")
        return self


class RegistrationIn(BaseModel):
    personal_data_consent: bool
    prepayment_consent: bool
    adult_confirmation: bool


class LikeIn(BaseModel):
    target_user_id: int
    liked: bool


class QuizOptionIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    is_correct: bool = False


class QuizQuestionIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    question_type: QuestionType
    points: int = Field(ge=1, le=10000)
    options: list[QuizOptionIn] = Field(default_factory=list, max_length=30)
    correct_text: str | None = Field(default=None, max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def valid_answer(self):
        if self.question_type == QuestionType.text:
            if not self.correct_text or not self.correct_text.strip():
                raise ValueError("Укажите правильный текстовый ответ")
            self.options = []
            return self
        if len(self.options) < 2:
            raise ValueError("Для вопроса с выбором добавьте минимум два варианта ответа")
        correct_count = sum(option.is_correct for option in self.options)
        if self.question_type == QuestionType.single and correct_count != 1:
            raise ValueError("Для одиночного выбора отметьте один правильный ответ")
        if self.question_type == QuestionType.multiple and correct_count < 1:
            raise ValueError("Для множественного выбора отметьте хотя бы один правильный ответ")
        return self


class QuizSaveIn(BaseModel):
    title: str = Field(default="Квиз", min_length=1, max_length=180)
    questions: list[QuizQuestionIn] = Field(min_length=1, max_length=100)


class QuizAnswerIn(BaseModel):
    question_id: int
    selected_option_ids: list[int] = Field(default_factory=list, max_length=30)
    text_answer: str | None = Field(default=None, max_length=4000)


class QuizSubmitIn(BaseModel):
    answers: list[QuizAnswerIn] = Field(min_length=1, max_length=100)


def normalize_dt(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def calculate_age(birth_date: date) -> int:
    today = datetime.now(event_timezone()).date()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def token_for(user: User) -> str:
    payload = {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def current_user(authorization: Annotated[str | None, Header()] = None, db: AsyncSession = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Требуется авторизация")
    try:
        user_id = int(jwt.decode(authorization[7:], settings.jwt_secret, algorithms=["HS256"])["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Сессия недействительна")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "Доступ только для администратора")
    return user


def user_json(user: User, contacts: bool = True, private: bool = False) -> dict:
    data = {"id": user.id, "phone": user.phone if contacts else None, "name": user.name, "gender": user.gender, "birth_date": user.birth_date, "age": calculate_age(user.birth_date) if user.birth_date else None, "bio": user.bio, "photo_url": user.photo_url, "is_admin": user.is_admin}
    if contacts:
        data.update(telegram=user.telegram, whatsapp=user.whatsapp, max_phone=user.max_phone)
    if private:
        data["email"] = user.email
    return data


ACTIVE_REGISTRATION_STATUSES = {
    RegistrationStatus.awaiting_payment,
    RegistrationStatus.confirmed,
}


def event_json(event: Event, user_id: int | None = None, user_gender: Gender | None = None) -> dict:
    men = [r for r in event.registrations if r.user.gender == Gender.male and r.status in ACTIVE_REGISTRATION_STATUSES]
    women = [r for r in event.registrations if r.user.gender == Gender.female and r.status in ACTIVE_REGISTRATION_STATUSES]
    mine = next((r for r in event.registrations if r.user_id == user_id), None)
    waitlist = sorted(
        (r for r in event.registrations if r.status == RegistrationStatus.waitlisted),
        key=lambda registration: (registration.created_at, registration.id),
    )
    waitlist_position = (
        next((index for index, registration in enumerate(waitlist, 1) if registration.user_id == user_id), None)
        if mine and mine.status == RegistrationStatus.waitlisted
        else None
    )
    place_available = None
    if user_gender == Gender.male:
        place_available = len(men) < event.male_capacity
    elif user_gender == Gender.female:
        place_available = len(women) < event.female_capacity
    quiz_data = None
    if event.quiz and mine and mine.status == RegistrationStatus.confirmed:
        attempt = next((attempt for attempt in event.quiz.attempts if attempt.user_id == user_id), None)
        if event.quiz.status == QuizStatus.active and event.status == EventStatus.live:
            quiz_data = {"status": event.quiz.status, "completed": attempt is not None, "results_published": False}
        elif event.quiz.status == QuizStatus.results:
            quiz_data = {
                "status": event.quiz.status,
                "completed": attempt is not None,
                "results_published": True,
                "score": attempt.score if attempt else None,
            }
    return {
        "id": event.id, "title": event.title, "description": event.description, "starts_at": event.starts_at,
        "venue": event.venue, "address": event.address, "price": float(event.price), "status": event.status,
        "male_capacity": event.male_capacity, "female_capacity": event.female_capacity,
        "age_min": event.age_min, "age_max": event.age_max,
        "male_taken": len(men), "female_taken": len(women),
        "registration": ({"id": mine.id, "status": mine.status, "paid": mine.paid, "participant_number": mine.participant_number, "waitlist_position": waitlist_position} if mine else None),
        "place_available": place_available,
        "waitlist_count": len(waitlist),
        "quiz": quiz_data,
    }


app = FastAPI(title="REALDATE API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


FIELD_NAMES = {
    "phone": "Номер телефона", "code": "Код", "name": "Имя", "gender": "Пол", "birth_date": "Дата рождения",
    "email": "Email", "telegram": "Telegram",
    "bio": "Описание профиля", "title": "Название", "description": "Описание",
    "starts_at": "Дата и время", "venue": "Площадка", "address": "Адрес",
    "price": "Стоимость", "male_capacity": "Мест для мужчин",
    "female_capacity": "Мест для девушек", "age_min": "Возраст от", "age_max": "Возраст до",
    "adult_confirmation": "Подтверждение возраста 18+",
}


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_, exc: RequestValidationError):
    error = exc.errors()[0]
    field = str(error.get("loc", [""])[-1])
    label = FIELD_NAMES.get(field, "Поле")
    error_type = error.get("type", "")
    context = error.get("ctx") or {}
    messages = {
        "missing": f"Заполните поле «{label}»",
        "string_too_short": f"Поле «{label}»: минимум {context.get('min_length')} символа(ов)",
        "string_too_long": f"Поле «{label}»: максимум {context.get('max_length')} символа(ов)",
        "greater_than": f"Поле «{label}» должно быть больше {context.get('gt')}",
        "greater_than_equal": f"Поле «{label}» должно быть не меньше {context.get('ge')}",
        "less_than_equal": f"Поле «{label}» должно быть не больше {context.get('le')}",
        "int_parsing": f"Введите целое число в поле «{label}»",
        "decimal_parsing": f"Введите число в поле «{label}»",
        "datetime_from_date_parsing": f"Укажите корректные дату и время в поле «{label}»",
        "enum": f"Выберите допустимое значение в поле «{label}»",
        "extra_forbidden": f"Поле «{label}» нельзя изменять",
    }
    if error_type == "value_error":
        message = str(error.get("msg", "Некорректное значение")).replace("Value error, ", "")
    else:
        message = messages.get(error_type, f"Проверьте значение поля «{label}»")
    return JSONResponse(status_code=422, content={"detail": message})


def migrate_schema(sync_conn):
    if sync_conn.dialect.name == "postgresql":
        sync_conn.execute(text("ALTER TYPE registrationstatus ADD VALUE IF NOT EXISTS 'waitlisted'"))
    inspector = sa_inspect(sync_conn)
    event_columns = {column["name"] for column in inspector.get_columns("events")}
    if "age_min" not in event_columns:
        sync_conn.execute(text("ALTER TABLE events ADD COLUMN age_min INTEGER"))
    if "age_max" not in event_columns:
        sync_conn.execute(text("ALTER TABLE events ADD COLUMN age_max INTEGER"))
    if "status_warning_sent_for" not in event_columns:
        sync_conn.execute(text("ALTER TABLE events ADD COLUMN status_warning_sent_for VARCHAR(64)"))
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "birth_date" not in user_columns:
        sync_conn.execute(text("ALTER TABLE users ADD COLUMN birth_date DATE"))
    if "email" not in user_columns:
        sync_conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(254)"))
    if "telegram_chat_id" not in user_columns:
        sync_conn.execute(text("ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(32)"))
    if "telegram_notifications_enabled" not in user_columns:
        sync_conn.execute(text("ALTER TABLE users ADD COLUMN telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE"))
    if "telegram_link_token" not in user_columns:
        sync_conn.execute(text("ALTER TABLE users ADD COLUMN telegram_link_token VARCHAR(64)"))
    if "telegram_link_expires_at" not in user_columns:
        sync_conn.execute(text("ALTER TABLE users ADD COLUMN telegram_link_expires_at TIMESTAMP"))
    otp_columns = {column["name"] for column in inspector.get_columns("otp_codes")}
    if "created_at" not in otp_columns:
        sync_conn.execute(text("ALTER TABLE otp_codes ADD COLUMN created_at TIMESTAMP"))
        sync_conn.execute(text("UPDATE otp_codes SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    if "request_ip" not in otp_columns:
        sync_conn.execute(text("ALTER TABLE otp_codes ADD COLUMN request_ip VARCHAR(64)"))
    otp_additions = {
        "delivery_token": "VARCHAR(64)",
        "gateway_request_id": "VARCHAR(128)",
        "gateway_delivery_status": "VARCHAR(32)",
        "gateway_verification_status": "VARCHAR(64)",
        "gateway_request_cost": "NUMERIC(12, 6)",
        "gateway_remaining_balance": "NUMERIC(12, 6)",
        "gateway_is_refunded": "BOOLEAN",
        "gateway_error": "VARCHAR(160)",
        "verified_at": "TIMESTAMP WITH TIME ZONE" if sync_conn.dialect.name == "postgresql" else "TIMESTAMP",
    }
    for column_name, column_type in otp_additions.items():
        if column_name not in otp_columns:
            sync_conn.execute(text(f"ALTER TABLE otp_codes ADD COLUMN {column_name} {column_type}"))
    sync_conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_otp_codes_delivery_token ON otp_codes (delivery_token)"))
    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_otp_codes_gateway_request_id ON otp_codes (gateway_request_id)"))
    registration_columns = {column["name"] for column in inspector.get_columns("registrations")}
    if "adult_consent_at" not in registration_columns:
        timestamp_type = "TIMESTAMP WITH TIME ZONE" if sync_conn.dialect.name == "postgresql" else "TIMESTAMP"
        sync_conn.execute(text(f"ALTER TABLE registrations ADD COLUMN adult_consent_at {timestamp_type}"))
    if "reminder_24h_sent_at" not in registration_columns:
        sync_conn.execute(text("ALTER TABLE registrations ADD COLUMN reminder_24h_sent_at TIMESTAMP WITH TIME ZONE"))
    if "reminder_2h_sent_at" not in registration_columns:
        sync_conn.execute(text("ALTER TABLE registrations ADD COLUMN reminder_2h_sent_at TIMESTAMP WITH TIME ZONE"))


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(migrate_schema)
    async with Session() as db:
        admin_phones = configured_admin_phones()
        if admin_phones:
            await db.execute(update(User).where(User.phone.in_(admin_phones)).values(is_admin=True))
            await db.commit()
        if not (await db.scalar(select(Event.id).limit(1))):
            db.add_all([
                Event(title="Вечер быстрых знакомств", description="Камерный вечер в центре Хабаровска: 8 коротких встреч, лёгкая музыка и welcome drink.", starts_at=datetime.now(timezone.utc) + timedelta(days=6, hours=3), venue="Бар «Север»", address="ул. Муравьёва-Амурского, 33", price=2500, male_capacity=8, female_capacity=8, age_min=25, age_max=40),
                Event(title="Знакомства & вино", description="Неспешный формат для тех, кто ценит живой разговор и хорошую атмосферу.", starts_at=datetime.now(timezone.utc) + timedelta(days=14, hours=1), venue="Винный зал Blanc", address="Амурский бульвар, 17", price=3200, male_capacity=10, female_capacity=10, age_min=30, age_max=45),
            ])
            await db.commit()
    start_reminder_scheduler()
    await configure_telegram_bot()


@app.on_event("shutdown")
async def shutdown():
    global reminder_task
    if reminder_task and not reminder_task.done():
        reminder_task.cancel()
        with suppress(asyncio.CancelledError):
            await reminder_task
    reminder_task = None


@app.get("/health")
async def health():
    return {"status": "ok"}


def telegram_bot_username() -> str | None:
    value = (settings.telegram_bot_username or "").strip().lstrip("@")
    return value or None


def telegram_bot_configured() -> bool:
    return bool(settings.telegram_bot_token and telegram_bot_username() and settings.telegram_bot_webhook_secret)


async def telegram_bot_request(method: str, payload: dict) -> bool:
    if not settings.telegram_bot_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}",
                json=payload,
            )
        data = response.json()
        return response.status_code < 400 and bool(data.get("ok"))
    except (httpx.HTTPError, ValueError):
        return False


def telegram_reply_keyboard() -> dict:
    return {
        "keyboard": [
            [{"text": "▶️ Запустить уведомления"}],
            [{"text": "✅ Проверить статус"}],
        ],
        "resize_keyboard": True,
        "is_persistent": True,
    }


async def configure_telegram_bot() -> None:
    if not settings.telegram_bot_token:
        return
    await asyncio.gather(
        telegram_bot_request(
            "setMyCommands",
            {
                "commands": [
                    {"command": "start", "description": "Запустить уведомления"},
                    {"command": "status", "description": "Проверить подключение"},
                    {"command": "stop", "description": "Остановить уведомления"},
                ]
            },
        ),
        telegram_bot_request(
            "setChatMenuButton",
            {"menu_button": {"type": "commands"}},
        ),
        return_exceptions=True,
    )


async def send_telegram_message(chat_id: str, message: str, reply_markup: dict | None = None) -> bool:
    return await telegram_bot_request(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": message,
            "disable_web_page_preview": True,
            "reply_markup": reply_markup or telegram_reply_keyboard(),
        },
    )


async def send_user_telegram_notification(user: User, title: str, body: str) -> bool:
    if not user.telegram_notifications_enabled or not user.telegram_chat_id:
        return False
    return await send_telegram_message(
        user.telegram_chat_id,
        f"🔔 {title}\n\n{body}\n\nREALDATE",
    )


async def send_user_telegram_notifications(messages: list[tuple[User, str, str]]) -> None:
    if not messages:
        return
    await asyncio.gather(
        *(send_user_telegram_notification(user, title, body) for user, title, body in messages),
        return_exceptions=True,
    )


def event_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.event_timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def reminder_event_time(event: Event) -> str:
    local_start = normalize_dt(event.starts_at).astimezone(event_timezone())
    return local_start.strftime("%d.%m.%Y в %H:%M")


def event_status_warning(event: Event, now: datetime | None = None) -> dict | None:
    current_time = normalize_dt(now or datetime.now(timezone.utc))
    starts_at = normalize_dt(event.starts_at)
    scheduled_time = reminder_event_time(event)
    if event.status == EventStatus.registration and starts_at <= current_time:
        return {
            "code": "registration_after_start",
            "title": "Проверьте статус мероприятия",
            "body": f"По расписанию мероприятие началось {scheduled_time}, но его статус — «Регистрация». Запустите мероприятие или измените дату.",
        }
    if event.status == EventStatus.live and starts_at > current_time:
        return {
            "code": "live_before_start",
            "title": "Проверьте статус мероприятия",
            "body": f"Мероприятие отмечено как начавшееся, хотя по расписанию оно начнётся {scheduled_time}. Верните регистрацию или измените дату.",
        }
    if event.status == EventStatus.finished and starts_at > current_time:
        return {
            "code": "finished_before_start",
            "title": "Проверьте статус мероприятия",
            "body": f"Мероприятие завершено раньше даты начала — {scheduled_time}. Проверьте статус или измените дату.",
        }
    return None


async def process_event_reminders(now: datetime | None = None) -> int:
    current_time = normalize_dt(now or datetime.now(timezone.utc))
    telegram_messages: list[tuple[User, str, str]] = []
    sent_count = 0
    async with Session() as db:
        registrations = (
            await db.scalars(
                select(Registration)
                .join(Event)
                .where(
                    Registration.status == RegistrationStatus.confirmed,
                    Event.status.in_([EventStatus.registration, EventStatus.live]),
                    Event.starts_at > current_time,
                    Event.starts_at <= current_time + timedelta(hours=24),
                    or_(
                        Registration.reminder_24h_sent_at.is_(None),
                        Registration.reminder_2h_sent_at.is_(None),
                    ),
                )
                .with_for_update(skip_locked=True)
                .options(selectinload(Registration.event), selectinload(Registration.user))
            )
        ).all()
        for registration in registrations:
            time_until_start = normalize_dt(registration.event.starts_at) - current_time
            if time_until_start <= timedelta(hours=2):
                if registration.reminder_2h_sent_at is not None:
                    continue
                title = "Встреча начнётся через 2 часа"
                body = (
                    f"«{registration.event.title}» начнётся {reminder_event_time(registration.event)}. "
                    f"Место: {registration.event.venue}, {registration.event.address}."
                )
                registration.reminder_2h_sent_at = current_time
            else:
                if registration.reminder_24h_sent_at is not None:
                    continue
                title = "Напоминание о встрече завтра"
                body = (
                    f"«{registration.event.title}» начнётся {reminder_event_time(registration.event)}. "
                    f"Место: {registration.event.venue}, {registration.event.address}."
                )
                registration.reminder_24h_sent_at = current_time
            db.add(Notification(user_id=registration.user_id, title=title, body=body))
            telegram_messages.append((registration.user, title, body))
            sent_count += 1
        await db.commit()
    await send_user_telegram_notifications(telegram_messages)
    return sent_count


async def process_event_status_warnings(now: datetime | None = None) -> int:
    current_time = normalize_dt(now or datetime.now(timezone.utc))
    telegram_messages: list[tuple[User, str, str]] = []
    sent_count = 0
    async with Session() as db:
        events = (
            await db.scalars(
                select(Event)
                .where(Event.status != EventStatus.cancelled)
                .with_for_update(skip_locked=True)
            )
        ).all()
        admins = (await db.scalars(select(User).where(User.is_admin == True))).all()
        for event in events:
            warning = event_status_warning(event, current_time)
            warning_code = warning["code"] if warning else None
            if not warning:
                if event.status_warning_sent_for is not None:
                    event.status_warning_sent_for = None
                continue
            if event.status_warning_sent_for == warning_code:
                continue
            event.status_warning_sent_for = warning_code
            body = f"«{event.title}»: {warning['body']}"
            db.add(Notification(admin_only=True, title=warning["title"], body=body))
            telegram_messages.extend((admin, warning["title"], body) for admin in admins)
            sent_count += 1
        await db.commit()
    await send_user_telegram_notifications(telegram_messages)
    return sent_count


async def reminder_scheduler() -> None:
    while True:
        try:
            await process_event_reminders()
            await process_event_status_warnings()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            print(f"REALDATE reminder scheduler error: {error}")
        await asyncio.sleep(60)


def start_reminder_scheduler() -> None:
    global reminder_task
    if reminder_task is None or reminder_task.done():
        reminder_task = asyncio.create_task(reminder_scheduler())


class GatewayDeliveryError(Exception):
    def __init__(self, code: str, public_message: str, status_code: int = 502):
        super().__init__(public_message)
        self.code = code[:160]
        self.public_message = public_message
        self.status_code = status_code


def gateway_error_details(data: object, status_code: int) -> tuple[str, str]:
    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        error_code = str(error.get("code") or error.get("type") or status_code)
        error_text = str(error.get("message") or error.get("description") or error_code)
    else:
        error_code = str(status_code)
        error_text = str(error or "Telegram Gateway rejected the request")
    searchable = f"{error_code} {error_text}".lower()
    if any(word in searchable for word in ("balance", "credit", "fund", "payment")):
        public = "На балансе Telegram Gateway недостаточно средств. Сообщите администратору"
    elif any(word in searchable for word in ("phone", "number", "recipient", "registered")):
        public = "Этот номер сейчас недоступен для получения кода через Telegram. Проверьте номер и аккаунт Telegram"
    elif any(word in searchable for word in ("token", "unauthorized", "forbidden", "access")):
        public = "Сервис Telegram Gateway временно не настроен. Сообщите администратору"
    elif any(word in searchable for word in ("sender", "channel")):
        public = "Отправитель Telegram Gateway настроен неверно. Сообщите администратору"
    else:
        public = "Telegram не смог отправить код. Попробуйте позже"
    return error_code[:160], public


async def telegram_gateway_call(method: str, payload: dict) -> dict:
    if not settings.telegram_gateway_token:
        raise GatewayDeliveryError("not_configured", "Telegram Gateway не настроен", 500)
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                f"https://gatewayapi.telegram.org/{method}",
                headers={"Authorization": f"Bearer {settings.telegram_gateway_token}"},
                json=payload,
            )
        data = response.json()
    except (httpx.HTTPError, ValueError) as error:
        logger.warning("Telegram Gateway %s unavailable: %s", method, type(error).__name__)
        raise GatewayDeliveryError(
            "gateway_unavailable",
            "Telegram Gateway временно недоступен. Попробуйте ещё раз",
            503,
        ) from error
    if response.status_code >= 400 or not isinstance(data, dict) or not data.get("ok"):
        internal_error, public_error = gateway_error_details(data, response.status_code)
        logger.warning("Telegram Gateway %s rejected request: HTTP %s, code %s", method, response.status_code, internal_error)
        raise GatewayDeliveryError(internal_error, public_error)
    result = data.get("result")
    if not isinstance(result, dict):
        raise GatewayDeliveryError("invalid_response", "Telegram Gateway вернул некорректный ответ. Попробуйте позже")
    return result


def nested_status(result: dict, field: str) -> str | None:
    value = result.get(field)
    if isinstance(value, dict):
        status = value.get("status")
        return str(status) if status else None
    return str(value) if value else None


def optional_decimal(value: object) -> Decimal | None:
    try:
        return Decimal(str(value)) if value is not None else None
    except (ValueError, TypeError):
        return None


def apply_gateway_status(otp: OtpCode, result: dict) -> None:
    request_id = result.get("request_id")
    if request_id:
        otp.gateway_request_id = str(request_id)[:128]
    new_delivery_status = nested_status(result, "delivery_status")
    status_rank = {"pending": 0, "sent": 1, "delivered": 2, "read": 3, "expired": 4, "revoked": 4, "failed": 4}
    if new_delivery_status and status_rank.get(new_delivery_status, 0) >= status_rank.get(otp.gateway_delivery_status or "pending", 0):
        otp.gateway_delivery_status = new_delivery_status[:32]
    verification_status = nested_status(result, "verification_status")
    if verification_status:
        otp.gateway_verification_status = verification_status[:64]
    request_cost = optional_decimal(result.get("request_cost"))
    remaining_balance = optional_decimal(result.get("remaining_balance"))
    if request_cost is not None:
        otp.gateway_request_cost = request_cost
    if remaining_balance is not None:
        otp.gateway_remaining_balance = remaining_balance
    if result.get("is_refunded") is not None:
        otp.gateway_is_refunded = bool(result.get("is_refunded"))


async def deliver_otp(
    phone: str,
    code: str,
    request_ip: str | None = None,
    delivery_token: str | None = None,
) -> dict:
    provider = settings.otp_provider.lower()
    if provider == "console":
        print(f"REALDATE OTP for {phone}: {code}")
        return {"delivery_status": {"status": "sent"}}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            if provider == "telegram":
                if not settings.telegram_gateway_callback_url:
                    raise GatewayDeliveryError(
                        "callback_not_configured",
                        "Callback Telegram Gateway не настроен. Сообщите администратору",
                        500,
                    )
                ability = await telegram_gateway_call("checkSendAbility", {"phone_number": phone})
                request_id = ability.get("request_id")
                if not request_id:
                    raise GatewayDeliveryError("missing_request_id", "Telegram Gateway вернул некорректный ответ. Попробуйте позже")
                payload = {
                    "phone_number": phone,
                    "code": code,
                    "ttl": 300,
                    "request_id": request_id,
                    "callback_url": settings.telegram_gateway_callback_url,
                    "payload": delivery_token,
                }
                if settings.telegram_sender_username:
                    payload["sender_username"] = settings.telegram_sender_username
                return await telegram_gateway_call("sendVerificationMessage", payload)
            if provider == "smsru":
                if not settings.smsru_api_id:
                    raise HTTPException(500, "SMS.ru не настроен")
                payload = {
                    "api_id": settings.smsru_api_id,
                    "to": phone.lstrip("+"),
                    "msg": f"Код REALDATE: {code}. Никому его не сообщайте.",
                    "json": 1,
                }
                if settings.smsru_from:
                    payload["from"] = settings.smsru_from
                if request_ip:
                    payload["ip"] = request_ip
                response = await client.post("https://sms.ru/sms/send", data=payload)
                data = response.json()
                sms_status = (data.get("sms") or {}).get(phone.lstrip("+"), {})
                if response.status_code >= 400 or data.get("status") != "OK" or sms_status.get("status") != "OK":
                    raise HTTPException(502, "Не удалось отправить SMS-код. Проверьте баланс и настройки SMS.ru")
                return {"delivery_status": {"status": "sent"}}
            if provider == "smsaero":
                if not settings.smsaero_email or not settings.smsaero_api_key:
                    raise HTTPException(500, "SMS Aero не настроен")
                response = await client.post(
                    "https://gate.smsaero.ru/v2/sms/send",
                    auth=httpx.BasicAuth(settings.smsaero_email, settings.smsaero_api_key),
                    data={
                        "number": phone.lstrip("+"),
                        "text": f"Код REALDATE: {code}. Никому его не сообщайте.",
                        "sign": settings.smsaero_sign,
                    },
                )
                data = response.json()
                if response.status_code >= 400 or not data.get("success"):
                    raise HTTPException(502, "Не удалось отправить SMS-код через SMS Aero. Проверьте баланс и имя отправителя")
                return {"delivery_status": {"status": "sent"}}
    except GatewayDeliveryError:
        raise
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Сервис отправки кодов временно недоступен")
    raise HTTPException(500, "Неизвестный OTP-провайдер")


async def add_low_gateway_balance_notification(db: AsyncSession, balance: Decimal | None) -> None:
    if balance is None or balance >= settings.telegram_gateway_low_balance_threshold:
        return
    recent = await db.scalar(
        select(Notification.id).where(
            Notification.admin_only == True,
            Notification.title == "Низкий баланс Telegram Gateway",
            Notification.created_at >= datetime.now(timezone.utc) - timedelta(hours=6),
        ).limit(1)
    )
    if not recent:
        db.add(Notification(
            admin_only=True,
            title="Низкий баланс Telegram Gateway",
            body=f"Остаток баланса: {balance}. Пополните его, чтобы авторизация продолжала работать.",
        ))


@app.post("/api/auth/request-code")
async def request_code(payload: PhoneIn, request: Request, db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    request_ip = forwarded or (request.client.host if request.client else None)
    if request_ip:
        hourly_requests = await db.scalar(
            select(func.count(OtpCode.id)).where(
                OtpCode.request_ip == request_ip,
                OtpCode.created_at >= now - timedelta(hours=1),
            )
        )
        if (hourly_requests or 0) >= settings.otp_ip_hourly_limit:
            raise HTTPException(429, "Превышен лимит запросов кодов. Попробуйте через час")
    phone_requests = await db.scalar(
        select(func.count(OtpCode.id)).where(
            OtpCode.phone == payload.phone,
            OtpCode.created_at >= now - timedelta(hours=1),
            or_(OtpCode.gateway_delivery_status.is_(None), OtpCode.gateway_delivery_status != "failed"),
        )
    )
    if (phone_requests or 0) >= settings.otp_phone_hourly_limit:
        raise HTTPException(429, "Для этого номера превышен лимит кодов. Попробуйте через час")
    latest = await db.scalar(
        select(OtpCode).where(
            OtpCode.phone == payload.phone,
            or_(OtpCode.gateway_delivery_status.is_(None), OtpCode.gateway_delivery_status != "failed"),
        ).order_by(OtpCode.id.desc()).limit(1)
    )
    if latest and latest.created_at and now - normalize_dt(latest.created_at) < timedelta(seconds=settings.otp_resend_seconds):
        raise HTTPException(429, f"Новый код можно запросить через {settings.otp_resend_seconds} секунд")
    code = "1111" if settings.otp_provider == "console" else f"{secrets.randbelow(10000):04d}"
    await db.execute(update(OtpCode).where(OtpCode.phone == payload.phone, OtpCode.used == False).values(used=True))
    delivery_token = secrets.token_urlsafe(24)
    otp = OtpCode(
        phone=payload.phone,
        code_hash=hashlib.sha256((code + settings.jwt_secret).encode()).hexdigest(),
        expires_at=now + timedelta(minutes=5),
        request_ip=request_ip,
        delivery_token=delivery_token,
        gateway_delivery_status="pending",
    )
    db.add(otp)
    await db.commit()
    try:
        delivery_result = await deliver_otp(payload.phone, code, request_ip, delivery_token)
    except GatewayDeliveryError as error:
        await db.refresh(otp)
        otp.gateway_delivery_status = "failed"
        otp.gateway_error = error.code
        otp.used = True
        await db.commit()
        raise HTTPException(error.status_code, error.public_message) from error
    except HTTPException:
        await db.refresh(otp)
        otp.gateway_delivery_status = "failed"
        otp.used = True
        await db.commit()
        raise
    except Exception as error:
        await db.refresh(otp)
        otp.gateway_delivery_status = "failed"
        otp.gateway_error = "unexpected_delivery_error"
        otp.used = True
        await db.commit()
        logger.exception("Unexpected OTP delivery error: %s", type(error).__name__)
        raise HTTPException(503, "Сервис отправки кодов временно недоступен. Попробуйте ещё раз") from error
    await db.refresh(otp)
    apply_gateway_status(otp, delivery_result)
    await add_low_gateway_balance_notification(db, otp.gateway_remaining_balance)
    await db.commit()
    return {
        "sent": True,
        "channel": settings.otp_provider,
        "status_token": delivery_token,
        "delivery_status": otp.gateway_delivery_status or "sent",
        "dev_code": code if settings.otp_provider == "console" else None,
    }


def verify_gateway_callback_signature(timestamp: str, signature: str, body: bytes) -> bool:
    if not settings.telegram_gateway_token:
        return False
    try:
        timestamp_value = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(datetime.now(timezone.utc).timestamp()) - timestamp_value) > 300:
        return False
    secret_key = hashlib.sha256(settings.telegram_gateway_token.encode()).digest()
    expected = hmac.new(secret_key, timestamp.encode() + b"\n" + body, hashlib.sha256).hexdigest()
    return secrets.compare_digest(expected, signature.lower())


@app.post("/api/auth/telegram-gateway/callback")
async def telegram_gateway_callback(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    timestamp = request.headers.get("x-request-timestamp", "")
    signature = request.headers.get("x-request-signature", "")
    if not verify_gateway_callback_signature(timestamp, signature, body):
        raise HTTPException(403, "Некорректная подпись callback")
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "Некорректный callback")
    result = data.get("result", data) if isinstance(data, dict) else None
    if not isinstance(result, dict):
        raise HTTPException(400, "Некорректный callback")
    payload_token = result.get("payload")
    request_id = result.get("request_id")
    otp = None
    if payload_token:
        otp = await db.scalar(select(OtpCode).where(OtpCode.delivery_token == str(payload_token)))
    if not otp and request_id:
        otp = await db.scalar(select(OtpCode).where(OtpCode.gateway_request_id == str(request_id)).order_by(OtpCode.id.desc()))
    if otp:
        apply_gateway_status(otp, result)
        if otp.gateway_delivery_status in {"expired", "revoked", "failed"}:
            otp.used = True
        await add_low_gateway_balance_notification(db, otp.gateway_remaining_balance)
        await db.commit()
    return {"ok": True}


@app.get("/api/auth/code-status/{status_token}")
async def code_status(status_token: str, db: AsyncSession = Depends(get_db)):
    if len(status_token) < 20 or len(status_token) > 64:
        raise HTTPException(404, "Запрос кода не найден")
    otp = await db.scalar(select(OtpCode).where(OtpCode.delivery_token == status_token))
    if not otp:
        raise HTTPException(404, "Запрос кода не найден")
    status = otp.gateway_delivery_status or "pending"
    if normalize_dt(otp.expires_at) < datetime.now(timezone.utc) and status in {"pending", "sent"}:
        status = "expired"
        otp.gateway_delivery_status = status
        otp.used = True
        await db.commit()
    return {"status": status, "expires_at": normalize_dt(otp.expires_at).isoformat()}


@app.post("/api/auth/verify")
async def verify(payload: VerifyIn, db: AsyncSession = Depends(get_db)):
    otp = await db.scalar(select(OtpCode).where(OtpCode.phone == payload.phone, OtpCode.used == False).order_by(OtpCode.id.desc()))
    if not otp or normalize_dt(otp.expires_at) < datetime.now(timezone.utc) or otp.attempts >= 5:
        raise HTTPException(400, "Код истёк. Запросите новый")
    otp.attempts += 1
    expected = hashlib.sha256((payload.code + settings.jwt_secret).encode()).hexdigest()
    if not secrets.compare_digest(otp.code_hash, expected):
        await db.commit()
        raise HTTPException(400, "Неверный код")
    otp.used = True
    otp.verified_at = datetime.now(timezone.utc)
    if settings.otp_provider.lower() == "telegram" and otp.gateway_request_id:
        try:
            gateway_result = await telegram_gateway_call(
                "checkVerificationStatus",
                {"request_id": otp.gateway_request_id, "code": payload.code},
            )
            apply_gateway_status(otp, gateway_result)
            await add_low_gateway_balance_notification(db, otp.gateway_remaining_balance)
        except GatewayDeliveryError as error:
            otp.gateway_error = error.code
            logger.warning("Telegram Gateway verification status was not recorded: %s", error.code)
    user = await db.scalar(select(User).where(User.phone == payload.phone))
    if not user:
        user = User(phone=payload.phone, is_admin=payload.phone in configured_admin_phones())
        db.add(user)
    elif payload.phone in configured_admin_phones() and not user.is_admin:
        user.is_admin = True
    await db.commit()
    await db.refresh(user)
    return {"access_token": token_for(user), "user": user_json(user, private=True)}


@app.get("/api/me")
async def me(user: User = Depends(current_user)):
    return user_json(user, private=True)


@app.put("/api/me")
async def update_me(payload: ProfileIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not user.photo_url:
        raise HTTPException(400, "Загрузите фотографию профиля")
    for key, value in payload.model_dump().items():
        setattr(user, key, value)
    await db.commit()
    return user_json(user, private=True)


@app.post("/api/me/photo")
async def upload_photo(file: UploadFile = File(...), user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Поддерживаются JPG, PNG и WebP")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Размер фотографии не должен превышать 5 МБ")
    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[file.content_type]
    name = f"{user.id}-{secrets.token_hex(8)}{suffix}"
    (UPLOAD_DIR / name).write_bytes(content)
    user.photo_url = f"/uploads/{name}"
    await db.commit()
    return {"photo_url": user.photo_url}


@app.get("/api/public/events")
async def public_events(db: AsyncSession = Depends(get_db)):
    """Return only event-level information for the public storefront."""
    rows = (
        await db.scalars(
            select(Event)
            .where(
                or_(
                    Event.status == EventStatus.live,
                    and_(
                        Event.status == EventStatus.registration,
                        Event.starts_at >= datetime.now(timezone.utc),
                    ),
                )
            )
            .options(selectinload(Event.registrations).selectinload(Registration.user))
            .order_by(Event.starts_at)
        )
    ).all()
    return [event_json(event) for event in rows]


@app.get("/api/events")
async def events(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(Event).options(selectinload(Event.registrations).selectinload(Registration.user)).order_by(Event.starts_at))).all()
    return [event_json(x, user.id, user.gender) for x in rows]


@app.get("/api/events/{event_id}")
async def event_detail(event_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    event = await db.scalar(select(Event).where(Event.id == event_id).options(selectinload(Event.registrations).selectinload(Registration.user)))
    if not event:
        raise HTTPException(404, "Мероприятие не найдено")
    data = event_json(event, user.id, user.gender)
    my_reg = next((r for r in event.registrations if r.user_id == user.id and r.status == RegistrationStatus.confirmed), None)
    if event.status in {EventStatus.live, EventStatus.finished} and my_reg:
        likes = {x.to_user_id: x.liked for x in (await db.scalars(select(Like).where(Like.event_id == event.id, Like.from_user_id == user.id))).all()}
        people = []
        for reg in event.registrations:
            if reg.status != RegistrationStatus.confirmed or reg.user.gender == user.gender:
                continue
            mutual = False
            if event.status == EventStatus.finished and likes.get(reg.user_id):
                mutual = bool(await db.scalar(select(Like.id).where(Like.event_id == event.id, Like.from_user_id == reg.user_id, Like.to_user_id == user.id, Like.liked == True)))
            person = user_json(reg.user, contacts=mutual)
            person.update(number=reg.participant_number, choice=likes.get(reg.user_id), mutual=mutual)
            people.append(person)
        data["participants"] = people
    return data


@app.post("/api/events/{event_id}/register")
async def register(event_id: int, payload: RegistrationIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    required_fields = {
        "фотографию": user.photo_url,
        "номер телефона": user.phone,
        "дату рождения": user.birth_date,
        "имя": user.name,
        "пол": user.gender,
        "Telegram": user.telegram,
    }
    missing_fields = [label for label, value in required_fields.items() if not value]
    if missing_fields:
        raise HTTPException(400, f"Для записи заполните обязательные поля: {', '.join(missing_fields)}")
    if not payload.personal_data_consent or not payload.prepayment_consent or not payload.adult_confirmation:
        raise HTTPException(400, "Для записи подтвердите обработку данных, предоплату и возраст 18+")
    event = await db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
        .options(selectinload(Event.registrations).selectinload(Registration.user))
    )
    if not event or event.status != EventStatus.registration:
        raise HTTPException(400, "Регистрация закрыта")
    user_age = calculate_age(user.birth_date)
    if user_age < 18:
        raise HTTPException(403, "Регистрация доступна только пользователям старше 18 лет")
    existing = next((r for r in event.registrations if r.user_id == user.id), None)
    capacity = event.male_capacity if user.gender == Gender.male else event.female_capacity
    taken = sum(
        1
        for registration in event.registrations
        if registration.user.gender == user.gender
        and registration.status in ACTIVE_REGISTRATION_STATUSES
    )
    now = datetime.now(timezone.utc)
    if existing:
        if existing.status != RegistrationStatus.waitlisted:
            raise HTTPException(409, "Вы уже записаны")
        if taken >= capacity:
            raise HTTPException(409, "Свободных мест пока нет. Вы уже в листе ожидания")
        existing.status = RegistrationStatus.awaiting_payment
        existing.pdata_consent_at = now
        existing.prepayment_consent_at = now
        existing.adult_consent_at = now
        notification_title = "Заявка на освободившееся место отправлена"
        notification_body = (
            f"Вы откликнулись на освободившееся место на «{event.title}». "
            "Организаторы скоро свяжутся с вами по контактам, указанным в профиле."
        )
        db.add(Notification(admin_only=True, title="Заявка из листа ожидания", body=f"{user.name}, {user_age} лет, подал(-а) заявку на «{event.title}»"))
        waitlisted = False
        waitlist_position = None
    elif taken >= capacity:
        waitlisted = True
        waitlist_position = 1 + sum(
            registration.status == RegistrationStatus.waitlisted
            for registration in event.registrations
        )
        notification_title = "Вы в листе ожидания"
        notification_body = (
            f"На «{event.title}» пока нет свободных мест. "
            "Мы уведомим вас, если место освободится."
        )
        db.add(
            Registration(
                event_id=event.id,
                user_id=user.id,
                status=RegistrationStatus.waitlisted,
                pdata_consent_at=now,
                prepayment_consent_at=now,
                adult_consent_at=now,
            )
        )
        db.add(Notification(admin_only=True, title="Новый участник в листе ожидания", body=f"{user.name}, {user_age} лет, встал(-а) в очередь на «{event.title}»"))
    else:
        waitlisted = False
        waitlist_position = None
        notification_title = "Заявка успешно отправлена"
        notification_body = (
            f"Вы успешно записались на «{event.title}». "
            "Организаторы скоро свяжутся с вами по контактам, указанным в профиле."
        )
        db.add(Registration(event_id=event.id, user_id=user.id, pdata_consent_at=now, prepayment_consent_at=now, adult_consent_at=now))
        db.add(Notification(admin_only=True, title="Новая запись", body=f"{user.name}, {user_age} лет, записался(-ась) на «{event.title}»"))
    db.add(Notification(user_id=user.id, title=notification_title, body=notification_body))
    await db.commit()
    await send_user_telegram_notification(user, notification_title, notification_body)
    return {
        "registered": not waitlisted,
        "waitlisted": waitlisted,
        "waitlist_position": waitlist_position,
        "notification": {"title": notification_title, "body": notification_body},
    }


@app.put("/api/events/{event_id}/like")
async def set_like(event_id: int, payload: LikeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    if not event or event.status != EventStatus.live:
        raise HTTPException(400, "Выбор доступен только во время мероприятия")
    valid = await db.scalar(select(Registration.id).join(User).where(Registration.event_id == event_id, Registration.user_id == payload.target_user_id, Registration.status == RegistrationStatus.confirmed, User.gender != user.gender))
    mine = await db.scalar(select(Registration.id).where(Registration.event_id == event_id, Registration.user_id == user.id, Registration.status == RegistrationStatus.confirmed))
    if not valid or not mine:
        raise HTTPException(403, "Недоступный участник")
    like = await db.scalar(select(Like).where(Like.event_id == event_id, Like.from_user_id == user.id, Like.to_user_id == payload.target_user_id))
    if like:
        like.liked, like.updated_at = payload.liked, datetime.now(timezone.utc)
    else:
        db.add(Like(event_id=event_id, from_user_id=user.id, to_user_id=payload.target_user_id, liked=payload.liked))
    await db.commit()
    return {"saved": True}


async def load_quiz(db: AsyncSession, event_id: int) -> Quiz | None:
    return await db.scalar(
        select(Quiz)
        .where(Quiz.event_id == event_id)
        .options(
            selectinload(Quiz.questions).selectinload(QuizQuestion.options),
            selectinload(Quiz.attempts).selectinload(QuizAttempt.answers).selectinload(QuizAnswer.question),
        )
    )


async def confirmed_registration(db: AsyncSession, event_id: int, user_id: int) -> Registration | None:
    return await db.scalar(
        select(Registration).where(
            Registration.event_id == event_id,
            Registration.user_id == user_id,
            Registration.status == RegistrationStatus.confirmed,
        )
    )


def normalized_quiz_text(value: str) -> str:
    return " ".join(value.strip().casefold().split())


@app.get("/api/events/{event_id}/quiz")
async def participant_quiz(event_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    quiz = await load_quiz(db, event_id)
    if not event or not quiz or not await confirmed_registration(db, event_id, user.id):
        raise HTTPException(404, "Квиз недоступен")
    attempt = next((attempt for attempt in quiz.attempts if attempt.user_id == user.id), None)
    if quiz.status == QuizStatus.results:
        return {
            "id": quiz.id,
            "title": quiz.title,
            "status": quiz.status,
            "completed": attempt is not None,
            "score": attempt.score if attempt else None,
            "max_score": sum(question.points for question in quiz.questions),
            "questions": [],
        }
    if quiz.status != QuizStatus.active or event.status != EventStatus.live:
        raise HTTPException(404, "Квиз ещё не запущен")
    return {
        "id": quiz.id,
        "title": quiz.title,
        "status": quiz.status,
        "completed": attempt is not None,
        "score": None,
        "max_score": None,
        "questions": [] if attempt else [
            {
                "id": question.id,
                "prompt": question.prompt,
                "question_type": question.question_type,
                "points": question.points,
                "image_url": question.image_url,
                "options": [{"id": option.id, "text": option.text} for option in question.options],
            }
            for question in quiz.questions
        ],
    }


@app.post("/api/events/{event_id}/quiz/submit")
async def submit_quiz(event_id: int, payload: QuizSubmitIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    quiz = await load_quiz(db, event_id)
    if not event or not quiz or not await confirmed_registration(db, event_id, user.id):
        raise HTTPException(404, "Квиз недоступен")
    if quiz.status != QuizStatus.active or event.status != EventStatus.live:
        raise HTTPException(400, "Приём ответов на квиз закрыт")
    if any(attempt.user_id == user.id for attempt in quiz.attempts):
        raise HTTPException(409, "Вы уже прошли этот квиз")

    questions = {question.id: question for question in quiz.questions}
    answers = {answer.question_id: answer for answer in payload.answers}
    if len(answers) != len(payload.answers) or set(answers) != set(questions):
        raise HTTPException(400, "Ответьте на все вопросы квиза")

    checked_answers: list[tuple[QuizQuestion, str, int]] = []
    total_score = 0
    for question_id, question in questions.items():
        answer = answers[question_id]
        awarded_points = 0
        if question.question_type == QuestionType.text:
            if not answer.text_answer or not answer.text_answer.strip():
                raise HTTPException(400, f"Введите ответ на вопрос «{question.prompt}»")
            answer_value = json.dumps({"text": answer.text_answer.strip()}, ensure_ascii=False)
            if normalized_quiz_text(answer.text_answer) == normalized_quiz_text(question.correct_text or ""):
                awarded_points = question.points
        else:
            selected_ids = set(answer.selected_option_ids)
            valid_ids = {option.id for option in question.options}
            if not selected_ids or not selected_ids.issubset(valid_ids):
                raise HTTPException(400, f"Выберите ответ на вопрос «{question.prompt}»")
            if question.question_type == QuestionType.single and len(selected_ids) != 1:
                raise HTTPException(400, f"В вопросе «{question.prompt}» можно выбрать только один ответ")
            correct_ids = {option.id for option in question.options if option.is_correct}
            answer_value = json.dumps({"option_ids": sorted(selected_ids)})
            if selected_ids == correct_ids:
                awarded_points = question.points
        total_score += awarded_points
        checked_answers.append((question, answer_value, awarded_points))

    attempt = QuizAttempt(quiz_id=quiz.id, user_id=user.id, score=total_score)
    db.add(attempt)
    await db.flush()
    db.add_all([
        QuizAnswer(attempt_id=attempt.id, question_id=question.id, answer_value=answer_value, awarded_points=awarded_points)
        for question, answer_value, awarded_points in checked_answers
    ])
    await db.commit()
    return {"completed": True}


@app.get("/api/telegram/status")
async def telegram_status(user: User = Depends(current_user)):
    return {
        "configured": telegram_bot_configured(),
        "connected": bool(user.telegram_chat_id and user.telegram_notifications_enabled),
        "bot_username": telegram_bot_username(),
    }


@app.post("/api/telegram/link")
async def create_telegram_link(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    username = telegram_bot_username()
    if not telegram_bot_configured() or not username:
        raise HTTPException(503, "Telegram-бот временно не настроен")
    link_token = secrets.token_urlsafe(24)
    user.telegram_link_token = link_token
    user.telegram_link_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    await db.commit()
    return {
        "url": f"https://t.me/{username}?start={link_token}",
        "expires_in": 900,
    }


@app.delete("/api/telegram/link")
async def disconnect_telegram(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    chat_id = user.telegram_chat_id
    user.telegram_chat_id = None
    user.telegram_notifications_enabled = False
    user.telegram_link_token = None
    user.telegram_link_expires_at = None
    await db.commit()
    if chat_id:
        await send_telegram_message(
            chat_id,
            "Уведомления REALDATE отключены. Подключить их снова можно на странице уведомлений сайта.",
        )
    return {"disconnected": True}


@app.post("/api/telegram/webhook")
async def telegram_webhook(
    request: Request,
    secret_header: Annotated[str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = None,
    db: AsyncSession = Depends(get_db),
):
    expected_secret = settings.telegram_bot_webhook_secret or ""
    if not expected_secret or not secret_header or not secrets.compare_digest(secret_header, expected_secret):
        raise HTTPException(403, "Недействительная подпись webhook")
    try:
        update_data = await request.json()
    except ValueError:
        return {"ok": True}
    message = update_data.get("message") or update_data.get("edited_message") or {}
    chat = message.get("chat") or {}
    if chat.get("type") != "private" or not chat.get("id"):
        return {"ok": True}
    chat_id = str(chat["id"])
    message_text = str(message.get("text") or "").strip()
    command, _, argument = message_text.partition(" ")
    command = command.split("@", 1)[0].lower()
    argument = argument.strip()
    launch_requested = command == "/start" or message_text == "▶️ Запустить уведомления"
    status_requested = command == "/status" or message_text == "✅ Проверить статус"

    if command == "/start" and argument:
        user = await db.scalar(select(User).where(User.telegram_link_token == argument))
        if not user or not user.telegram_link_expires_at or normalize_dt(user.telegram_link_expires_at) < datetime.now(timezone.utc):
            if user:
                user.telegram_link_token = None
                user.telegram_link_expires_at = None
                await db.commit()
            await send_telegram_message(
                chat_id,
                "Ссылка подключения недействительна или устарела. Получите новую ссылку на странице уведомлений REALDATE.",
            )
            return {"ok": True}
        previously_linked = (await db.scalars(
            select(User).where(User.telegram_chat_id == chat_id, User.id != user.id)
        )).all()
        for linked_user in previously_linked:
            linked_user.telegram_chat_id = None
            linked_user.telegram_notifications_enabled = False
        user.telegram_chat_id = chat_id
        user.telegram_notifications_enabled = True
        user.telegram_link_token = None
        user.telegram_link_expires_at = None
        db.add(Notification(
            user_id=user.id,
            title="Telegram подключён",
            body="Теперь важные уведомления REALDATE будут приходить в Telegram.",
        ))
        await db.commit()
        await send_telegram_message(
            chat_id,
            "✅ Telegram-уведомления REALDATE подключены.\n\nМы сообщим о записи, подтверждении участия, старте квиза и результатах мероприятия.\n\nОтключить уведомления можно на сайте или командой /stop.",
        )
        return {"ok": True}

    linked_user = await db.scalar(select(User).where(User.telegram_chat_id == chat_id))
    if launch_requested:
        if linked_user:
            linked_user.telegram_notifications_enabled = True
            await db.commit()
            await send_telegram_message(
                chat_id,
                "✅ Уведомления REALDATE запущены.\n\nТеперь мы будем присылать сюда важные сообщения о ваших мероприятиях.",
            )
        else:
            await send_telegram_message(
                chat_id,
                "Сначала привяжите Telegram к аккаунту REALDATE. Откройте профиль или раздел уведомлений на сайте и нажмите «Подключить Telegram».",
            )
    elif command == "/stop":
        if linked_user:
            linked_user.telegram_notifications_enabled = False
            await db.commit()
        await send_telegram_message(
            chat_id,
            "Уведомления REALDATE остановлены. Чтобы включить их снова, нажмите постоянную кнопку «Запустить уведомления» внизу чата.",
        )
    elif status_requested:
        await send_telegram_message(
            chat_id,
            "✅ Уведомления подключены." if linked_user and linked_user.telegram_notifications_enabled
            else "Уведомления сейчас не активны. Нажмите «Запустить уведомления» или подключите Telegram в профиле на сайте REALDATE.",
        )
    else:
        await send_telegram_message(
            chat_id,
            "Это бот уведомлений REALDATE. Используйте постоянные кнопки внизу чата. Для первой привязки откройте профиль на сайте и нажмите «Подключить Telegram».\n\n/start — запустить уведомления\n/status — проверить подключение\n/stop — остановить уведомления",
        )
    return {"ok": True}


def visible_notifications(user: User):
    if user.is_admin:
        return or_(Notification.admin_only == True, Notification.user_id == user.id)
    return Notification.user_id == user.id


@app.get("/api/notifications")
async def notifications(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    condition = visible_notifications(user)
    rows = (await db.scalars(select(Notification).where(condition).order_by(Notification.created_at.desc()).limit(30))).all()
    return [{"id": x.id, "title": x.title, "body": x.body, "read": x.read, "created_at": x.created_at} for x in rows]


@app.get("/api/notifications/unread-count")
async def unread_notifications_count(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    count = await db.scalar(
        select(func.count(Notification.id)).where(
            visible_notifications(user),
            Notification.read == False,
        )
    )
    return {"unread": count or 0}


@app.post("/api/notifications/read-all")
async def read_all_notifications(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification)
        .where(visible_notifications(user), Notification.read == False)
        .values(read=True)
    )
    await db.commit()
    return {"read": True}


@app.post("/api/admin/events")
async def create_event(payload: EventIn, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    event = Event(**payload.model_dump())
    db.add(event)
    await db.commit(); await db.refresh(event)
    return {"id": event.id}


@app.get("/api/admin/events/{event_id}")
async def admin_event(event_id: int, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    event = await db.scalar(select(Event).where(Event.id == event_id).options(selectinload(Event.registrations).selectinload(Registration.user)))
    if not event: raise HTTPException(404, "Мероприятие не найдено")
    like_rows = (await db.scalars(select(Like).where(Like.event_id == event.id))).all()
    positive_likes = {(like.from_user_id, like.to_user_id) for like in like_rows if like.liked}
    registrations_by_user = {registration.user_id: registration for registration in event.registrations}

    def sympathy_user(user_id: int) -> dict | None:
        registration = registrations_by_user.get(user_id)
        if not registration:
            return None
        data = user_json(registration.user)
        data["number"] = registration.participant_number
        return data

    matches = []
    one_sided = []
    matched_pairs: set[tuple[int, int]] = set()
    for from_user_id, to_user_id in sorted(positive_likes):
        from_user = sympathy_user(from_user_id)
        to_user = sympathy_user(to_user_id)
        if not from_user or not to_user:
            continue
        if (to_user_id, from_user_id) in positive_likes:
            pair_key = tuple(sorted((from_user_id, to_user_id)))
            if pair_key not in matched_pairs:
                matched_pairs.add(pair_key)
                matches.append({"first": from_user, "second": to_user})
        else:
            one_sided.append({"from": from_user, "to": to_user})

    confirmed = [r for r in event.registrations if r.status == RegistrationStatus.confirmed]
    waitlisted = [r for r in event.registrations if r.status == RegistrationStatus.waitlisted]
    data = event_json(event)
    data.update(
        status_warning=event_status_warning(event),
        registrations=[{"id": r.id, "status": r.status, "paid": r.paid, "number": r.participant_number, "user": user_json(r.user)} for r in event.registrations],
        stats={
            "registrations": len(event.registrations),
            "confirmed": len(confirmed),
            "waitlisted": len(waitlisted),
            "revenue": float(event.price) * sum(r.paid for r in event.registrations),
            "likes": len(positive_likes),
            "matches": len(matches),
        },
        sympathies={"matches": matches, "one_sided": one_sided},
    )
    return data


@app.get("/api/admin/events/{event_id}/quiz")
async def admin_quiz(event_id: int, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    event = await db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.registrations).selectinload(Registration.user))
    )
    if not event:
        raise HTTPException(404, "Мероприятие не найдено")
    quiz = await load_quiz(db, event_id)
    confirmed = sorted(
        (registration for registration in event.registrations if registration.status == RegistrationStatus.confirmed),
        key=lambda registration: (registration.participant_number is None, registration.participant_number or 0, registration.user.name or ""),
    )
    if not quiz:
        return {
            "id": None,
            "title": "Квиз",
            "status": "none",
            "questions": [],
            "max_score": 0,
            "completed_count": 0,
            "participant_count": len(confirmed),
            "all_completed": False,
            "participants": [],
        }

    questions_payload = [
        {
            "id": question.id,
            "prompt": question.prompt,
            "question_type": question.question_type,
            "points": question.points,
            "correct_text": question.correct_text,
            "image_url": question.image_url,
            "options": [
                {"id": option.id, "text": option.text, "is_correct": option.is_correct}
                for option in question.options
            ],
        }
        for question in quiz.questions
    ]
    confirmed_user_ids = {registration.user_id for registration in confirmed}
    attempts = {attempt.user_id: attempt for attempt in quiz.attempts if attempt.user_id in confirmed_user_ids}
    highest_score = max((attempt.score for attempt in attempts.values()), default=None)
    participants = []
    for registration in confirmed:
        attempt = attempts.get(registration.user_id)
        answer_payload = []
        if attempt:
            stored_answers = {answer.question_id: answer for answer in attempt.answers}
            for question in quiz.questions:
                stored = stored_answers.get(question.id)
                if not stored:
                    continue
                try:
                    value = json.loads(stored.answer_value)
                except (TypeError, ValueError):
                    value = {}
                if question.question_type == QuestionType.text:
                    display_answer = value.get("text", "")
                else:
                    selected_ids = set(value.get("option_ids", []))
                    display_answer = [option.text for option in question.options if option.id in selected_ids]
                answer_payload.append({
                    "question_id": question.id,
                    "prompt": question.prompt,
                    "answer": display_answer,
                    "awarded_points": stored.awarded_points,
                    "max_points": question.points,
                    "correct": stored.awarded_points == question.points,
                })
        participants.append({
            "user": user_json(registration.user),
            "number": registration.participant_number,
            "completed": attempt is not None,
            "score": attempt.score if attempt else None,
            "is_winner": attempt is not None and highest_score is not None and attempt.score == highest_score,
            "completed_at": attempt.completed_at if attempt else None,
            "answers": answer_payload,
        })
    completed_count = len(attempts)
    return {
        "id": quiz.id,
        "title": quiz.title,
        "status": quiz.status,
        "questions": questions_payload,
        "max_score": sum(question.points for question in quiz.questions),
        "completed_count": completed_count,
        "participant_count": len(confirmed),
        "all_completed": bool(confirmed) and completed_count >= len(confirmed),
        "participants": participants,
    }


@app.post("/api/admin/events/{event_id}/quiz/image")
async def upload_quiz_image(event_id: int, file: UploadFile = File(...), _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    if not await db.get(Event, event_id):
        raise HTTPException(404, "Мероприятие не найдено")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Для вопроса можно загрузить JPG, PNG или WebP")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Размер изображения не должен превышать 5 МБ")
    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[file.content_type]
    filename = f"quiz-{event_id}-{secrets.token_hex(10)}{suffix}"
    (UPLOAD_DIR / filename).write_bytes(content)
    return {"image_url": f"/uploads/{filename}"}


@app.put("/api/admin/events/{event_id}/quiz")
async def save_admin_quiz(event_id: int, payload: QuizSaveIn, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    if not await db.get(Event, event_id):
        raise HTTPException(404, "Мероприятие не найдено")
    quiz = await load_quiz(db, event_id)
    if quiz and quiz.status != QuizStatus.draft:
        raise HTTPException(400, "После запуска квиз нельзя редактировать")
    if quiz and quiz.attempts:
        raise HTTPException(400, "Квиз с ответами участников нельзя редактировать")
    if not quiz:
        quiz = Quiz(event_id=event_id, title=payload.title.strip())
        db.add(quiz)
        await db.flush()
    else:
        quiz.title = payload.title.strip()
        quiz.questions.clear()
        await db.flush()

    for question_position, question_data in enumerate(payload.questions, 1):
        question = QuizQuestion(
            quiz_id=quiz.id,
            prompt=question_data.prompt.strip(),
            question_type=question_data.question_type,
            points=question_data.points,
            position=question_position,
            correct_text=question_data.correct_text.strip() if question_data.question_type == QuestionType.text and question_data.correct_text else None,
            image_url=question_data.image_url,
        )
        db.add(question)
        await db.flush()
        db.add_all([
            QuizOption(
                question_id=question.id,
                text=option.text.strip(),
                is_correct=option.is_correct,
                position=option_position,
            )
            for option_position, option in enumerate(question_data.options, 1)
        ])
    await db.commit()
    return {"saved": True, "id": quiz.id}


@app.patch("/api/admin/events/{event_id}/quiz/status")
async def change_quiz_status(event_id: int, action: QuizAction, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    event = await db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.registrations).selectinload(Registration.user))
    )
    quiz = await load_quiz(db, event_id)
    if not event or not quiz:
        raise HTTPException(404, "Сначала создайте квиз")
    now = datetime.now(timezone.utc)
    confirmed = [registration for registration in event.registrations if registration.status == RegistrationStatus.confirmed]
    telegram_messages: list[tuple[User, str, str]] = []
    if action == QuizAction.launch:
        if event.status != EventStatus.live:
            raise HTTPException(400, "Запустить квиз можно только во время мероприятия")
        if quiz.status != QuizStatus.draft:
            raise HTTPException(400, "Квиз уже был запущен")
        if not quiz.questions:
            raise HTTPException(400, "Добавьте хотя бы один вопрос")
        quiz.status = QuizStatus.active
        quiz.launched_at = now
        for registration in confirmed:
            title = "Квиз начался"
            body = f"Квиз мероприятия «{event.title}» уже доступен."
            db.add(Notification(user_id=registration.user_id, title=title, body=body))
            telegram_messages.append((registration.user, title, body))
    elif action == QuizAction.publish:
        if quiz.status != QuizStatus.active:
            raise HTTPException(400, "Сначала запустите квиз")
        quiz.status = QuizStatus.results
        quiz.results_published_at = now
        for registration in confirmed:
            title = "Результаты квиза"
            body = f"Организатор опубликовал результаты квиза «{quiz.title}»."
            db.add(Notification(user_id=registration.user_id, title=title, body=body))
            telegram_messages.append((registration.user, title, body))
    await db.commit()
    await send_user_telegram_notifications(telegram_messages)
    return {"status": quiz.status}


@app.delete("/api/admin/events/{event_id}")
async def delete_event(event_id: int, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Мероприятие не найдено")
    await db.execute(delete(Like).where(Like.event_id == event_id))
    await db.execute(delete(Registration).where(Registration.event_id == event_id))
    await db.delete(event)
    await db.commit()
    return {"deleted": True}


@app.patch("/api/admin/registrations/{registration_id}")
async def moderate_registration(registration_id: int, paid: bool | None = None, confirmed: bool | None = None, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    reg = await db.scalar(
        select(Registration)
        .where(Registration.id == registration_id)
        .with_for_update()
        .options(
            selectinload(Registration.user),
            selectinload(Registration.event)
            .selectinload(Event.registrations)
            .selectinload(Registration.user),
        )
    )
    if not reg: raise HTTPException(404, "Регистрация не найдена")
    telegram_messages: list[tuple[User, str, str]] = []
    waitlist_notified = 0
    previous_paid = reg.paid
    if paid is not None:
        reg.paid = paid
        if paid and not previous_paid:
            title = "Оплата получена"
            body = f"Мы получили оплату за участие в мероприятии «{reg.event.title}»."
            db.add(Notification(user_id=reg.user_id, title=title, body=body))
            telegram_messages.append((reg.user, title, body))
    if confirmed is not None:
        previous_status = reg.status
        if confirmed and previous_status not in ACTIVE_REGISTRATION_STATUSES:
            capacity = reg.event.male_capacity if reg.user.gender == Gender.male else reg.event.female_capacity
            occupied = sum(
                registration.id != reg.id
                and registration.user.gender == reg.user.gender
                and registration.status in ACTIVE_REGISTRATION_STATUSES
                for registration in reg.event.registrations
            )
            if occupied >= capacity:
                raise HTTPException(409, "Свободных мест для этого участника нет")
        reg.status = RegistrationStatus.confirmed if confirmed else RegistrationStatus.rejected
        if previous_status == RegistrationStatus.waitlisted and not confirmed:
            title = "Вы удалены из листа ожидания"
            body = f"Ваша очередь на «{reg.event.title}» отменена администратором."
        else:
            title = "Запись подтверждена" if confirmed else "Запись отклонена"
            body = f"Статус вашей записи на «{reg.event.title}» изменён."
        db.add(Notification(user_id=reg.user_id, title=title, body=body))
        telegram_messages.append((reg.user, title, body))
        place_freed = not confirmed and previous_status in ACTIVE_REGISTRATION_STATUSES
        if place_freed and reg.event.status == EventStatus.registration:
            waitlisted = (
                await db.scalars(
                    select(Registration)
                    .where(
                        Registration.event_id == reg.event_id,
                        Registration.status == RegistrationStatus.waitlisted,
                    )
                    .order_by(Registration.created_at, Registration.id)
                    .options(selectinload(Registration.user))
                )
            ).all()
            waitlist_title = "На встрече освободилось место"
            waitlist_body = (
                f"На «{reg.event.title}» появилось свободное место. "
                "Откройте мероприятие и отправьте заявку — место получит тот, кто сделает это первым."
            )
            for waiting_registration in waitlisted:
                db.add(
                    Notification(
                        user_id=waiting_registration.user_id,
                        title=waitlist_title,
                        body=waitlist_body,
                    )
                )
                telegram_messages.append((waiting_registration.user, waitlist_title, waitlist_body))
                waitlist_notified += 1
    await db.commit()
    await send_user_telegram_notifications(telegram_messages)
    return {"updated": True, "waitlist_notified": waitlist_notified}


@app.patch("/api/admin/events/{event_id}/status")
async def change_status(event_id: int, status: EventStatus, _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)):
    event = await db.scalar(select(Event).where(Event.id == event_id).options(selectinload(Event.registrations).selectinload(Registration.user)))
    if not event: raise HTTPException(404, "Мероприятие не найдено")
    allowed = {
        EventStatus.registration: {EventStatus.live, EventStatus.cancelled},
        EventStatus.live: {EventStatus.registration, EventStatus.finished},
        EventStatus.finished: {EventStatus.live},
        EventStatus.cancelled: {EventStatus.registration},
    }
    if status not in allowed[event.status]: raise HTTPException(400, "Недопустимый переход статуса")
    telegram_messages: list[tuple[User, str, str]] = []
    previous_status = event.status
    if status == EventStatus.live:
        for gender in Gender:
            regs = [r for r in event.registrations if r.status == RegistrationStatus.confirmed and r.user.gender == gender]
            expected_numbers = list(range(1, len(regs) + 1))
            current_numbers = sorted(r.participant_number for r in regs if r.participant_number is not None)
            if current_numbers != expected_numbers:
                numbers = expected_numbers.copy()
                random.SystemRandom().shuffle(numbers)
                for reg, number in zip(regs, numbers):
                    reg.participant_number = number
    event.status = status
    event.status_warning_sent_for = None
    if status == EventStatus.live and previous_status == EventStatus.registration:
        for reg in event.registrations:
            if reg.status == RegistrationStatus.confirmed:
                title = "Мероприятие началось"
                number_text = f" Ваш номер — № {reg.participant_number}." if reg.participant_number else ""
                body = f"«{event.title}» началось.{number_text} Откройте мероприятие на сайте, чтобы увидеть участников и отметить симпатии."
                db.add(Notification(user_id=reg.user_id, title=title, body=body))
                telegram_messages.append((reg.user, title, body))
    if status == EventStatus.finished:
        like_rows = (await db.scalars(select(Like).where(Like.event_id == event.id, Like.liked == True))).all()
        positive_likes = {(like.from_user_id, like.to_user_id) for like in like_rows}
        for reg in event.registrations:
            if reg.status == RegistrationStatus.confirmed:
                match_count = sum(
                    other.status == RegistrationStatus.confirmed
                    and other.user.gender != reg.user.gender
                    and (reg.user_id, other.user_id) in positive_likes
                    and (other.user_id, reg.user_id) in positive_likes
                    for other in event.registrations
                )
                title = "Результаты и взаимные симпатии"
                if match_count:
                    ending = "совпадение" if match_count == 1 else "совпадения" if 2 <= match_count <= 4 else "совпадений"
                    body = f"После «{event.title}» у вас {match_count} взаимных {ending}. Контакты уже доступны в результатах мероприятия."
                else:
                    body = f"Результаты «{event.title}» опубликованы. Взаимных симпатий на этот раз нет."
                db.add(Notification(user_id=reg.user_id, title=title, body=body))
                telegram_messages.append((reg.user, title, body))
    await db.commit()
    await send_user_telegram_notifications(telegram_messages)
    return {"status": event.status}
