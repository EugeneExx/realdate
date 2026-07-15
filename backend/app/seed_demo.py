from __future__ import annotations

import argparse
import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from html import escape

from sqlalchemy import delete, select

from app.main import (
    Event,
    EventStatus,
    Gender,
    Like,
    Notification,
    QuestionType,
    Quiz,
    QuizAnswer,
    QuizAttempt,
    QuizOption,
    QuizQuestion,
    QuizStatus,
    Registration,
    RegistrationStatus,
    Session,
    UPLOAD_DIR,
    User,
)


DEMO_PREFIX = "[ДЕМО]"

DEMO_USERS = [
    ("+70000000001", "Алексей", Gender.male, date(1991, 3, 14), "Люблю путешествия, джаз и долгие прогулки у моря.", "@demo_alexey", "#8B1E3F", "АЛ"),
    ("+70000000002", "Михаил", Gender.male, date(1983, 11, 2), "Ресторатор, увлекаюсь фотографией и горными лыжами.", "@demo_mikhail", "#553C6B", "МИ"),
    ("+70000000003", "Дмитрий", Gender.male, date(1998, 7, 21), "Разработчик. Ценю юмор, спорт и хороший кофе.", "@demo_dmitry", "#26547C", "ДМ"),
    ("+70000000004", "Сергей", Gender.male, date(1988, 1, 9), "Архитектор, бегаю полумарафоны и учусь готовить пасту.", "@demo_sergey", "#6B705C", "СЕ"),
    ("+70000000005", "Антон", Gender.male, date(2001, 5, 30), "Музыка, кино и небольшие спонтанные поездки — это про меня.", "@demo_anton", "#A44A3F", "АН"),
    ("+70000000011", "Анна", Gender.female, date(1993, 8, 17), "Дизайнер, люблю выставки, книги и уютные завтраки.", "@demo_anna", "#C65B7C", "АН"),
    ("+70000000012", "Мария", Gender.female, date(1986, 4, 6), "Преподаю языки, танцую бачату и обожаю море.", "@demo_maria", "#A2678A", "МА"),
    ("+70000000013", "Ольга", Gender.female, date(2000, 12, 12), "Маркетолог. Ищу человека для приключений и тихих вечеров.", "@demo_olga", "#D17B88", "ОЛ"),
    ("+70000000014", "Ирина", Gender.female, date(1990, 6, 25), "Психолог, люблю театр, йогу и разговоры обо всём.", "@demo_irina", "#9B5DE5", "ИР"),
    ("+70000000015", "Светлана", Gender.female, date(1981, 9, 3), "Предприниматель. В свободное время рисую и путешествую.", "@demo_svetlana", "#B56576", "СВ"),
]


def write_avatar(phone: str, color: str, initials: str) -> str:
    filename = f"demo-avatar-{phone[-2:]}.svg"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{escape(color)}"/><stop offset="1" stop-color="#2B1620"/></linearGradient></defs>
<rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="350" r="170" fill="#F8EDE7" opacity=".92"/>
<path d="M125 940c25-230 135-355 275-355s250 125 275 355" fill="#F8EDE7" opacity=".92"/>
<text x="400" y="910" text-anchor="middle" font-family="Georgia,serif" font-size="92" letter-spacing="10" fill="white">{escape(initials)}</text>
</svg>"""
    (UPLOAD_DIR / filename).write_text(svg, encoding="utf-8")
    return f"/uploads/{filename}"


def write_quiz_image() -> str:
    filename = "demo-quiz-khabarovsk.svg"
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6a0019"/><stop offset="1" stop-color="#d8988f"/></linearGradient></defs>
<rect width="1200" height="700" fill="url(#sky)"/><circle cx="930" cy="145" r="70" fill="#f7e9d4" opacity=".9"/>
<path d="M0 490C230 430 350 520 555 472s352-23 645 40v188H0z" fill="#233b55" opacity=".8"/>
<path d="M90 505h1020M265 505l145-210 145 210M645 505l145-210 145 210" stroke="#f6dfcf" stroke-width="18" fill="none" opacity=".92"/>
<text x="70" y="105" fill="white" font-family="Georgia,serif" font-size="54" letter-spacing="8">ХАБАРОВСК</text>
</svg>"""
    (UPLOAD_DIR / filename).write_text(svg, encoding="utf-8")
    return f"/uploads/{filename}"


async def add_quiz_question(session, quiz: Quiz, position: int, prompt: str, question_type: QuestionType, points: int, *, options: list[tuple[str, bool]] | None = None, correct_text: str | None = None, image_url: str | None = None) -> QuizQuestion:
    question = QuizQuestion(
        quiz_id=quiz.id,
        position=position,
        prompt=prompt,
        question_type=question_type,
        points=points,
        correct_text=correct_text,
        image_url=image_url,
    )
    session.add(question)
    await session.flush()
    for option_position, (text, is_correct) in enumerate(options or [], 1):
        session.add(QuizOption(question_id=question.id, text=text, is_correct=is_correct, position=option_position))
    await session.flush()
    return question


async def get_or_create_demo_users(session) -> dict[str, User]:
    users: dict[str, User] = {}
    for phone, name, gender, birth_date, bio, telegram, color, initials in DEMO_USERS:
        user = await session.scalar(select(User).where(User.phone == phone))
        photo_url = write_avatar(phone, color, initials)
        if user is None:
            user = User(phone=phone)
            session.add(user)
        user.name = name
        user.gender = gender
        user.birth_date = birth_date
        user.bio = bio
        user.telegram = telegram
        user.whatsapp = phone
        user.photo_url = photo_url
        user.is_admin = False
        users[phone] = user
    await session.flush()
    return users


async def clear_previous_demo(session) -> None:
    event_ids = list(await session.scalars(select(Event.id).where(Event.title.startswith(DEMO_PREFIX))))
    if event_ids:
        await session.execute(delete(Like).where(Like.event_id.in_(event_ids)))
        await session.execute(delete(Registration).where(Registration.event_id.in_(event_ids)))
        await session.execute(delete(Event).where(Event.id.in_(event_ids)))
    await session.execute(delete(Notification).where(Notification.title.startswith(DEMO_PREFIX)))


async def add_registration(
    session,
    event: Event,
    user: User,
    status: RegistrationStatus,
    *,
    paid: bool = False,
    number: int | None = None,
) -> Registration:
    now = datetime.now(timezone.utc)
    registration = Registration(
        event_id=event.id,
        user_id=user.id,
        status=status,
        paid=paid,
        participant_number=number,
        pdata_consent_at=now,
        prepayment_consent_at=now,
    )
    session.add(registration)
    await session.flush()
    return registration


async def seed(participant_phone: str) -> None:
    now = datetime.now(timezone.utc)
    async with Session() as session:
        await clear_previous_demo(session)
        users = await get_or_create_demo_users(session)
        participant = await session.scalar(select(User).where(User.phone == participant_phone))
        if participant is None:
            participant = User(phone=participant_phone)
            session.add(participant)
        participant.name = participant.name or "Екатерина"
        participant.gender = participant.gender or Gender.female
        participant.birth_date = participant.birth_date or date(1992, 5, 18)
        participant.bio = participant.bio or "Люблю живые встречи, путешествия и хорошие разговоры."
        participant.telegram = participant.telegram or "@katy_sha_00"
        participant.whatsapp = participant.whatsapp or participant_phone
        participant.email = participant.email or "demo@realdate.local"
        participant.photo_url = participant.photo_url or write_avatar(participant_phone, "#7A1730", "ЕК")
        participant.is_admin = True
        await session.flush()

        open_event = Event(
            title=f"{DEMO_PREFIX} Запись открыта — свободные места",
            description="Сценарий открытой регистрации: есть подтверждённые, ожидающие и отклонённые заявки, а также участники вне рекомендованного возраста.",
            starts_at=now + timedelta(days=7), venue="Ресторан «Маяк»", address="ул. Муравьёва-Амурского, 10",
            price=Decimal("2500"), male_capacity=6, female_capacity=6, age_min=30, age_max=40,
            status=EventStatus.registration,
        )
        upcoming_event = Event(
            title=f"{DEMO_PREFIX} Почти всё готово",
            description="Вы зарегистрированы: часть гостей оплатила участие, часть ещё ожидает решения администратора.",
            starts_at=now + timedelta(days=3), venue="Лофт «Высота»", address="Амурский бульвар, 21",
            price=Decimal("3200"), male_capacity=4, female_capacity=4, age_min=25, age_max=38,
            status=EventStatus.registration,
        )
        live_event = Event(
            title=f"{DEMO_PREFIX} Встреча идёт прямо сейчас",
            description="Действующее мероприятие: у участников назначены номера, можно расставлять симпатии противоположному полу.",
            starts_at=now - timedelta(minutes=30), venue="Бар «Север»", address="ул. Алеутская, 45",
            price=Decimal("2800"), male_capacity=3, female_capacity=3, age_min=20, age_max=45,
            status=EventStatus.live,
        )
        finished_event = Event(
            title=f"{DEMO_PREFIX} Результаты и взаимные симпатии",
            description="Завершённая встреча: одна взаимная симпатия открывает контакты, остальные результаты остаются скрытыми.",
            starts_at=now - timedelta(days=8), venue="Винный зал Blanc", address="ул. Пограничная, 6",
            price=Decimal("3000"), male_capacity=3, female_capacity=3, age_min=25, age_max=45,
            status=EventStatus.finished,
        )
        cancelled_event = Event(
            title=f"{DEMO_PREFIX} Мероприятие отменено",
            description="Сценарий отменённого мероприятия с сохранёнными заявками участников.",
            starts_at=now + timedelta(days=12), venue="Галерея «Порт»", address="ул. Батарейная, 4",
            price=Decimal("2200"), male_capacity=5, female_capacity=5,
            status=EventStatus.cancelled,
        )
        session.add_all([open_event, upcoming_event, live_event, finished_event, cancelled_event])
        await session.flush()

        # Открытая регистрация: все варианты модерации и оплаты.
        await add_registration(session, open_event, users["+70000000001"], RegistrationStatus.awaiting_payment)
        await add_registration(session, open_event, users["+70000000002"], RegistrationStatus.confirmed, paid=True)
        await add_registration(session, open_event, users["+70000000011"], RegistrationStatus.rejected)
        await add_registration(session, open_event, users["+70000000013"], RegistrationStatus.confirmed)

        # Ближайшее мероприятие видно в разделе пользователя «Мои встречи».
        await add_registration(session, upcoming_event, participant, RegistrationStatus.confirmed, paid=True)
        await add_registration(session, upcoming_event, users["+70000000001"], RegistrationStatus.confirmed, paid=True)
        await add_registration(session, upcoming_event, users["+70000000003"], RegistrationStatus.confirmed)
        await add_registration(session, upcoming_event, users["+70000000012"], RegistrationStatus.awaiting_payment)

        # Идущее мероприятие: номера назначаются отдельно внутри каждого пола.
        live_men = [users["+70000000001"], users["+70000000003"], users["+70000000004"]]
        live_women = [participant, users["+70000000011"], users["+70000000014"]]
        for number, user in enumerate(live_men, 1):
            await add_registration(session, live_event, user, RegistrationStatus.confirmed, paid=number != 3, number=number)
        for number, user in enumerate(live_women, 1):
            await add_registration(session, live_event, user, RegistrationStatus.confirmed, paid=True, number=number)
        if participant.gender == Gender.female:
            session.add_all([
                Like(event_id=live_event.id, from_user_id=participant.id, to_user_id=live_men[0].id, liked=True),
                Like(event_id=live_event.id, from_user_id=participant.id, to_user_id=live_men[1].id, liked=False),
            ])

        # Завершённое мероприятие: взаимная и односторонние симпатии.
        finished_men = [users["+70000000002"], users["+70000000004"], users["+70000000005"]]
        finished_women = [participant, users["+70000000012"], users["+70000000015"]]
        for number, user in enumerate(finished_men, 1):
            await add_registration(session, finished_event, user, RegistrationStatus.confirmed, paid=True, number=number)
        for number, user in enumerate(finished_women, 1):
            await add_registration(session, finished_event, user, RegistrationStatus.confirmed, paid=True, number=number)
        if participant.gender == Gender.female:
            session.add_all([
                Like(event_id=finished_event.id, from_user_id=participant.id, to_user_id=finished_men[0].id, liked=True),
                Like(event_id=finished_event.id, from_user_id=finished_men[0].id, to_user_id=participant.id, liked=True),
                Like(event_id=finished_event.id, from_user_id=participant.id, to_user_id=finished_men[1].id, liked=True),
                Like(event_id=finished_event.id, from_user_id=finished_men[1].id, to_user_id=participant.id, liked=False),
                Like(event_id=finished_event.id, from_user_id=participant.id, to_user_id=finished_men[2].id, liked=False),
                Like(event_id=finished_event.id, from_user_id=finished_men[2].id, to_user_id=participant.id, liked=True),
                Like(event_id=finished_event.id, from_user_id=users["+70000000012"].id, to_user_id=finished_men[1].id, liked=True),
                Like(event_id=finished_event.id, from_user_id=finished_men[1].id, to_user_id=users["+70000000012"].id, liked=True),
            ])

        # Активный квиз можно пройти от имени Екатерины во время текущего мероприятия.
        quiz_image = write_quiz_image()
        live_quiz = Quiz(event_id=live_event.id, title=f"{DEMO_PREFIX} Квиз о Хабаровске", status=QuizStatus.active, launched_at=now)
        session.add(live_quiz)
        await session.flush()
        await add_quiz_question(
            session, live_quiz, 1, "Какой город изображён на иллюстрации?", QuestionType.single, 1,
            options=[("Хабаровск", True), ("Владивосток", False), ("Санкт-Петербург", False)], image_url=quiz_image,
        )
        await add_quiz_question(
            session, live_quiz, 2, "Выберите города Хабаровского края", QuestionType.multiple, 2,
            options=[("Комсомольск-на-Амуре", True), ("Амурск", True), ("Иркутск", False), ("Якутск", False)],
        )
        await add_quiz_question(session, live_quiz, 3, "Как называется наш сервис знакомств?", QuestionType.text, 3, correct_text="REALDATE")

        # Опубликованный квиз демонстрирует баллы, ответы и подсветку победителя.
        finished_quiz = Quiz(event_id=finished_event.id, title=f"{DEMO_PREFIX} Итоговый квиз", status=QuizStatus.results, launched_at=now - timedelta(days=8), results_published_at=now - timedelta(days=8, hours=-1))
        session.add(finished_quiz)
        await session.flush()
        finished_q1 = await add_quiz_question(
            session, finished_quiz, 1, "Какой город изображён на иллюстрации?", QuestionType.single, 1,
            options=[("Хабаровск", True), ("Владивосток", False), ("Санкт-Петербург", False)], image_url=quiz_image,
        )
        finished_q2 = await add_quiz_question(
            session, finished_quiz, 2, "Выберите города Хабаровского края", QuestionType.multiple, 2,
            options=[("Комсомольск-на-Амуре", True), ("Амурск", True), ("Иркутск", False), ("Якутск", False)],
        )
        finished_q3 = await add_quiz_question(session, finished_quiz, 3, "Как называется наш сервис знакомств?", QuestionType.text, 3, correct_text="REALDATE")
        q1_options = list(await session.scalars(select(QuizOption).where(QuizOption.question_id == finished_q1.id).order_by(QuizOption.position)))
        q2_options = list(await session.scalars(select(QuizOption).where(QuizOption.question_id == finished_q2.id).order_by(QuizOption.position)))

        async def add_attempt(user: User, score: int, q1_ids: list[int], q2_ids: list[int], text_answer: str, points: tuple[int, int, int]) -> None:
            attempt = QuizAttempt(quiz_id=finished_quiz.id, user_id=user.id, score=score, completed_at=now - timedelta(days=8, minutes=-20))
            session.add(attempt)
            await session.flush()
            session.add_all([
                QuizAnswer(attempt_id=attempt.id, question_id=finished_q1.id, answer_value=json.dumps({"option_ids": q1_ids}), awarded_points=points[0]),
                QuizAnswer(attempt_id=attempt.id, question_id=finished_q2.id, answer_value=json.dumps({"option_ids": q2_ids}), awarded_points=points[1]),
                QuizAnswer(attempt_id=attempt.id, question_id=finished_q3.id, answer_value=json.dumps({"text": text_answer}, ensure_ascii=False), awarded_points=points[2]),
            ])

        await add_attempt(participant, 4, [q1_options[0].id], [q2_options[0].id], "REALDATE", (1, 0, 3))
        await add_attempt(finished_men[0], 6, [q1_options[0].id], [q2_options[0].id, q2_options[1].id], "REALDATE", (1, 2, 3))
        await add_attempt(finished_men[1], 2, [q1_options[1].id], [q2_options[0].id, q2_options[1].id], "Real Date", (0, 2, 0))

        await add_registration(session, cancelled_event, participant, RegistrationStatus.confirmed, paid=True)
        await add_registration(session, cancelled_event, users["+70000000005"], RegistrationStatus.awaiting_payment)

        session.add_all([
            Notification(admin_only=True, title=f"{DEMO_PREFIX} Новая заявка", body=f"Алексей записался на «{open_event.title}» и ожидает решения."),
            Notification(admin_only=True, title=f"{DEMO_PREFIX} Оплата получена", body=f"Михаил внёс предоплату за «{open_event.title}»."),
            Notification(admin_only=True, title=f"{DEMO_PREFIX} Сценарии готовы", body="Добавлены мероприятия во всех статусах, участники, оплаты, номера и симпатии."),
        ])
        await session.commit()
        print("Демоданные созданы:")
        for event in [open_event, upcoming_event, live_event, finished_event, cancelled_event]:
            print(f"- {event.id}: {event.title} ({event.status.value})")
        print(f"Пользователь для просмотра сценариев: {participant.phone} — {participant.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Создать демонстрационные данные REALDATE")
    parser.add_argument(
        "--participant-phone",
        required=True,
        help="Номер пользователя, для которого нужно создать демонстрационные сценарии",
    )
    args = parser.parse_args()
    asyncio.run(seed(args.participant_phone))


if __name__ == "__main__":
    main()
