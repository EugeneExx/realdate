from __future__ import annotations

import secrets
from pathlib import Path


DEMO_DOMAIN = "realdate-demo-201-51-31-172.nip.io"


def main() -> None:
    postgres_password = secrets.token_hex(24)
    jwt_secret = secrets.token_hex(48)
    content = f"""DEMO_DOMAIN={DEMO_DOMAIN}
POSTGRES_DB=realdate_demo
POSTGRES_USER=realdate_demo
POSTGRES_PASSWORD={postgres_password}
DATABASE_URL=postgresql+asyncpg://realdate_demo:{postgres_password}@db:5432/realdate_demo
JWT_SECRET={jwt_secret}
ADMIN_PHONE=+79990803137
ADMIN_PHONES=+79990803137
LEGAL_NAME=Демонстрационная версия — реквизиты клиента будут добавлены
LEGAL_INN=Не публикуется в демонстрационном режиме
LEGAL_ADDRESS=г. Владивосток
SUPPORT_PHONE=+79990800137
SUPPORT_EMAIL=Будет указан перед запуском платежей
SUPPORT_TELEGRAM=katy_sha_00
DOCUMENTS_EFFECTIVE_DATE=15 июля 2026 года
"""
    target = Path(__file__).resolve().parents[2] / ".env"
    target.write_text(content, encoding="utf-8")
    target.chmod(0o600)
    print(f"Создан файл окружения: {target}")


if __name__ == "__main__":
    main()
