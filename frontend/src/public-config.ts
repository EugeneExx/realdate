const env = import.meta.env;

const normalizeTelegram = (value: string) => value.trim().replace(/^@/, "");

export const publicConfig = {
  brand: "REALDATE quickly",
  siteUrl: env.VITE_PUBLIC_SITE_URL || "https://realdatequickly.ru",
  legalName: env.VITE_LEGAL_NAME || "Укажите ФИО самозанятого",
  legalInn: env.VITE_LEGAL_INN || "Укажите ИНН",
  legalAddress: env.VITE_LEGAL_ADDRESS || "Укажите адрес регистрации",
  supportPhone: env.VITE_SUPPORT_PHONE || "+7 999 080-01-37",
  supportEmail: env.VITE_SUPPORT_EMAIL || "Укажите электронную почту",
  supportTelegram: normalizeTelegram(env.VITE_SUPPORT_TELEGRAM || "katy_sha_00"),
  documentsEffectiveDate: env.VITE_DOCUMENTS_EFFECTIVE_DATE || "15 июля 2026 года",
};

export const publicConfigReady = ![
  publicConfig.legalName,
  publicConfig.legalInn,
  publicConfig.legalAddress,
  publicConfig.supportEmail,
].some((value) => value.startsWith("Укажите"));

export const phoneHref = `tel:+${publicConfig.supportPhone.replace(/\D/g, "")}`;
export const emailHref = publicConfig.supportEmail.includes("@")
  ? `mailto:${publicConfig.supportEmail}`
  : undefined;
export const telegramHref = `https://t.me/${publicConfig.supportTelegram}`;
