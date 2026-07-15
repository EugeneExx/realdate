from __future__ import annotations

from pathlib import Path


def main() -> None:
    target = Path(__file__).resolve().parents[2] / ".env"
    lines = target.read_text(encoding="utf-8").splitlines()
    replacements = {
        "ADMIN_PHONE": "+79990803137",
        "ADMIN_PHONES": "+79990803137",
    }
    updated = []
    for line in lines:
        key = line.split("=", 1)[0]
        updated.append(f"{key}={replacements[key]}" if key in replacements else line)
    target.write_text("\n".join(updated) + "\n", encoding="utf-8")
    target.chmod(0o600)
    print("Демонстрационный администратор отделён от публичного телефона поддержки")


if __name__ == "__main__":
    main()
