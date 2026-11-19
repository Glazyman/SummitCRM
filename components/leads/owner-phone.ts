import type { LeadRow } from './types'

const digits = (v?: string | null) => (v ?? '').replace(/\D/g, '').slice(-10)

/**
 * The owner's own number(s): phone / phone_2 / phone_3. A primary phone that
 * is the same digits as the company line doesn't count — mirrors
 * lead_extra_match('owner_phone') in SQL so the filter and the display agree.
 */
export function ownerPhones(lead: Pick<LeadRow, 'phone' | 'custom_fields'>): string[] {
  const company = digits(lead.custom_fields?.company_phone)
  const out: string[] = []
  if (lead.phone && digits(lead.phone) && digits(lead.phone) !== company) out.push(lead.phone)
  for (const k of ['phone_2', 'phone_3'] as const) {
    const v = lead.custom_fields?.[k]
    if (v && digits(v)) out.push(v)
  }
  return out
}

export function companyPhones(lead: Pick<LeadRow, 'custom_fields'>): string[] {
  return [lead.custom_fields?.company_phone, lead.custom_fields?.company_phone_2].filter((v): v is string => !!v && !!digits(v))
}
