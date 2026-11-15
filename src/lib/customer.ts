import { TUNISIAN_GOVERNORATES, type Governorate } from "./governorates";

/** Règles client partagées : formulaire du site (commander.tsx) et agent WhatsApp. */
export const CUSTOMER_NAME_MIN = 2;
export const ADDRESS_MIN = 4;

/** Numéro tunisien : 8 chiffres, avec ou sans +216 / 00216, enregistré au format « +216 XXXXXXXX ». */
export function normalizeTunisianPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("216")) digits = digits.slice(3);
  if (digits.length === 13 && digits.startsWith("00216")) digits = digits.slice(5);
  return /^\d{8}$/.test(digits) ? `+216 ${digits}` : null;
}

export function isGovernorate(value: string): value is Governorate {
  return (TUNISIAN_GOVERNORATES as readonly string[]).includes(value);
}

export type CustomerInput = { name: string; phone: string; governorate: string; address: string };
export type Customer = { name: string; phone: string; governorate: Governorate; address: string };
export type CustomerField = keyof CustomerInput;

/** Premier champ invalide, ou le client nettoyé (nom/adresse trimés, téléphone normalisé). */
export function validateCustomer(
  input: CustomerInput,
): { ok: true; customer: Customer } | { ok: false; field: CustomerField } {
  const name = input.name.trim();
  const address = input.address.trim();
  const phone = normalizeTunisianPhone(input.phone);
  if (name.length < CUSTOMER_NAME_MIN) return { ok: false, field: "name" };
  if (!phone) return { ok: false, field: "phone" };
  if (!isGovernorate(input.governorate)) return { ok: false, field: "governorate" };
  if (address.length < ADDRESS_MIN) return { ok: false, field: "address" };
  return { ok: true, customer: { name, phone, governorate: input.governorate, address } };
}
