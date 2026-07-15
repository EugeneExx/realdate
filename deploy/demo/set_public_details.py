from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Обновить публичные реквизиты демо-сайта")
    parser.add_argument("--payload-base64", required=True)
    args = parser.parse_args()

    payload = json.loads(base64.b64decode(args.payload_base64).decode("utf-8"))

    replacements = {
        "LEGAL_NAME": str(payload["legal_name"]).strip(),
        "LEGAL_INN": str(payload["legal_inn"]).strip(),
        "LEGAL_ADDRESS": str(payload["legal_address"]).strip(),
        "SUPPORT_EMAIL": str(payload["support_email"]).strip(),
        "SUPPORT_PHONE": str(payload["support_phone"]).strip(),
        "SUPPORT_TELEGRAM": str(payload["support_telegram"]).strip().removeprefix("@"),
    }
    if any("\n" in value or "\r" in value for value in replacements.values()):
        raise ValueError("Реквизиты не должны содержать переносы строк")

    target = Path(__file__).resolve().parents[2] / ".env"
    lines = target.read_text(encoding="utf-8").splitlines()
    updated_keys: set[str] = set()
    updated: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0]
        if key in replacements:
            updated.append(f"{key}={replacements[key]}")
            updated_keys.add(key)
        else:
            updated.append(line)
    for key, value in replacements.items():
        if key not in updated_keys:
            updated.append(f"{key}={value}")
    target.write_text("\n".join(updated) + "\n", encoding="utf-8")
    target.chmod(0o600)
    print("Публичные реквизиты обновлены")


if __name__ == "__main__":
    main()
