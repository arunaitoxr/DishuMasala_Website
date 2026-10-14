import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../index";
import { settings } from "../schema";
import type { StoreAddress } from "@/lib/db/queries/settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Upserts one `settings` row inside the caller's transaction. */
async function upsertSetting(tx: Tx, key: string, value: unknown): Promise<void> {
  await tx.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export interface UpdateSettingsInput {
  freeShippingThresholdPaise: number;
  standardShippingPaise: number;
  /** null turns the free-gift promotion off (the row is removed). */
  freeGiftThresholdPaise: number | null;
  crossPillarBundleDiscountPercent: number;
  supportEmail: string;
  storeAddress: StoreAddress;
  gstin: string;
  announcementBarText: string;
  maintenanceMode: boolean;
  whatsappNumber: string;
}

/** Every setting in one transaction — they used to be written by seven independent upserts, so a
 * failure partway left a mix of old and new values. Validated by app/admin/settings/actions.ts. */
export async function updateAdminSettings(input: UpdateSettingsInput): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertSetting(tx, "free_shipping_threshold_paise", input.freeShippingThresholdPaise);
    await upsertSetting(tx, "standard_shipping_paise", input.standardShippingPaise);
    if (input.freeGiftThresholdPaise == null) await tx.delete(settings).where(eq(settings.key, "free_gift_threshold_paise"));
    else await upsertSetting(tx, "free_gift_threshold_paise", input.freeGiftThresholdPaise);
    await upsertSetting(tx, "cross_pillar_bundle_discount_percent", input.crossPillarBundleDiscountPercent);
    await upsertSetting(tx, "support_email", { email: input.supportEmail });
    await upsertSetting(tx, "store_address", input.storeAddress);
    await upsertSetting(tx, "gstin", input.gstin);
    // Object-wrapped — a bare jsonb string that looks like JSON ("123", "null") gets double-decoded
    // on read (see lib/db/queries/settings.ts's getWhatsAppNumber).
    await upsertSetting(tx, "announcement_bar_text", { text: input.announcementBarText });
    await upsertSetting(tx, "maintenance_mode", input.maintenanceMode);
    await upsertSetting(tx, "whatsapp_number", { number: input.whatsappNumber });
  });
}
