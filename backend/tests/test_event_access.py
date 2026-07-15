import asyncio
import os
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path


TEST_DB = Path(tempfile.gettempdir()) / f"realdate-event-access-{uuid.uuid4().hex}.db"
TEST_DB.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB.as_posix()}"
os.environ["OTP_PROVIDER"] = "console"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["ADMIN_PHONE"] = "+79990000001"

from fastapi.testclient import TestClient

from app.main import (
    Event,
    EventStatus,
    Gender,
    Registration,
    RegistrationStatus,
    Session,
    User,
    app,
    engine,
    token_for,
)


class EventAccessTest(unittest.TestCase):
    def test_confirmed_participant_can_enter_only_while_event_is_live(self):
        with TestClient(app) as client:
            admin_token, participant_phone, event_id = asyncio.run(self._seed())
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            generated = client.post(
                f"/api/admin/events/{event_id}/access-code",
                headers=admin_headers,
            )
            self.assertEqual(generated.status_code, 200, generated.text)
            code = generated.json()["code"]
            self.assertRegex(code, r"^\d{6}$")

            login = client.post(
                "/api/auth/event-code/verify",
                json={"phone": participant_phone, "code": code},
            )
            self.assertEqual(login.status_code, 200, login.text)
            self.assertIn("access_token", login.json())

            finished = client.patch(
                f"/api/admin/events/{event_id}/status?status=finished",
                headers=admin_headers,
            )
            self.assertEqual(finished.status_code, 200, finished.text)

            expired_login = client.post(
                "/api/auth/event-code/verify",
                json={"phone": participant_phone, "code": code},
            )
            self.assertEqual(expired_login.status_code, 400, expired_login.text)
            self.assertFalse(asyncio.run(self._event_has_code(event_id)))

        asyncio.run(engine.dispose())
        TEST_DB.unlink(missing_ok=True)

    async def _seed(self):
        async with Session() as db:
            admin = User(phone="+79990000001", is_admin=True)
            participant = User(
                phone="+79990000002",
                name="Тестовый участник",
                gender=Gender.male,
            )
            event = Event(
                title="Проверка резервного входа",
                starts_at=datetime.now(timezone.utc) + timedelta(minutes=5),
                venue="Тестовая площадка",
                address="Тестовый адрес, 1",
                price=Decimal("1000.00"),
                male_capacity=10,
                female_capacity=10,
                status=EventStatus.live,
            )
            db.add_all([admin, participant, event])
            await db.flush()
            db.add(
                Registration(
                    event_id=event.id,
                    user_id=participant.id,
                    status=RegistrationStatus.confirmed,
                    paid=True,
                    pdata_consent_at=datetime.now(timezone.utc),
                    prepayment_consent_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
            return token_for(admin), participant.phone, event.id

    async def _event_has_code(self, event_id: int) -> bool:
        async with Session() as db:
            event = await db.get(Event, event_id)
            return bool(event and event.access_code_hash)


if __name__ == "__main__":
    unittest.main()
