import "server-only";

/**
 * WhatsApp order-confirmation messages, via AiSensy's Campaign API (client decision, 2026-09-25 —
 * a new paid service, outside CLAUDE.md §2's original fixed stack, the same kind of amendment §2
 * already records for Supabase). AiSensy sits on top of Meta's WhatsApp Business Platform: the
 * actual message text is a pre-approved template the client creates and Meta approves inside
 * AiSensy's own dashboard — this module only ever fills in that template's variables and fires it,
 * never composes free-form message text (WhatsApp rejects a business-initiated message with no
 * approved template behind it; this project also never invents customer-facing copy on its own,
 * CLAUDE.md §8).
 *
 * Same degrade-honestly contract as lib/email.ts: with no AISENSY_API_KEY or no campaign name
 * configured, every send here logs what it would have sent and resolves successfully — a missing
 * or not-yet-approved template must never block an order.
 *
 * AiSensy's Campaign API v2: https://backend.aisensy.com/campaign/t1/api/v2 — documented here
 * rather than only in AiSensy's own docs because there is no official Node SDK, so this is a plain
 * fetch() against their documented shape; verify the field names against AiSensy's current API
 * reference if this ever starts failing, since it isn't a versioned/type-checked client library.
 */
const CAMPAIGN_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

export interface WhatsAppSendResult {
  ok: boolean;
  /** True when there was no API key/campaign to actually send with — the caller should treat this
   * exactly like success (an order must never be blocked on WhatsApp delivery, same as email). */
  skipped: boolean;
}

/** AiSensy wants the destination as a bare country-code-prefixed number, no "+"/spaces — our own
 * checkout phone field is stored as a plain 10-digit Indian mobile (lib/commerce/address.ts's
 * phoneSchema), so this is the one place that adds the "91". */
function toAiSensyDestination(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

/**
 * Fires one AiSensy campaign send. `templateParams` must be in the exact order the approved
 * template's `{{1}}`, `{{2}}`, … placeholders expect — that order is fixed by whatever the client
 * actually got approved, never guessed here.
 */
async function sendCampaign(input: {
  destinationPhone: string;
  customerName: string;
  templateParams: string[];
  logLabel: string;
}): Promise<WhatsAppSendResult> {
  const apiKey = process.env.AISENSY_API_KEY;
  const campaignName = process.env.AISENSY_ORDER_CONFIRMATION_CAMPAIGN;

  if (!apiKey || !campaignName) {
    console.warn(
      `[whatsapp] AISENSY_API_KEY/AISENSY_ORDER_CONFIRMATION_CAMPAIGN not configured — would send "${input.logLabel}" to ${input.destinationPhone}: ${JSON.stringify(input.templateParams)}`,
    );
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch(CAMPAIGN_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        apiKey,
        campaignName,
        destination: toAiSensyDestination(input.destinationPhone),
        userName: input.customerName,
        templateParams: input.templateParams,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[whatsapp] AiSensy send failed (${res.status}) for ${input.logLabel}: ${body.slice(0, 300)}`);
      return { ok: false, skipped: false };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    // Never throw — a WhatsApp/network outage must never surface as a checkout/payment failure,
    // the same rule lib/shiprocket.ts and lib/email.ts already follow.
    console.error(`[whatsapp] AiSensy send threw for ${input.logLabel}:`, err);
    return { ok: false, skipped: false };
  }
}

/**
 * The order-confirmation WhatsApp message. `templateParams` here is a first guess at a sane order
 * (customer name, order number, total) — CONFIRM THE REAL ORDER against whatever template the
 * client actually gets approved in AiSensy before this is relied on; if it doesn't match, every
 * message sends with its variables in the wrong slots. See this file's own header comment.
 */
export async function sendOrderConfirmationWhatsApp(input: {
  phone: string;
  customerName: string;
  orderNumber: string;
  totalFormatted: string;
}): Promise<WhatsAppSendResult> {
  return sendCampaign({
    destinationPhone: input.phone,
    customerName: input.customerName,
    templateParams: [input.customerName, input.orderNumber, input.totalFormatted],
    logLabel: `order confirmation ${input.orderNumber}`,
  });
}
