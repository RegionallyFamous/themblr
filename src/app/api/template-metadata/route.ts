import {
  EDITABLE_ZONE_KEYS,
  LOCKED_ZONE_KEYS,
  REQUIRED_VALIDATION_CHECK_IDS,
  THEMBLR_SCHEMA_VERSION,
} from "@/lib/contracts";
import { jsonResponse } from "@/lib/http";
import { loadStarterTemplate } from "@/lib/template/loader";
import { getTemplateMetadata } from "@/lib/template/zones";

export async function GET() {
  const bundle = await loadStarterTemplate();
  const metadata = getTemplateMetadata(bundle);

  return jsonResponse({
    version: THEMBLR_SCHEMA_VERSION,
    ...metadata,
    editableZones: EDITABLE_ZONE_KEYS,
    lockedZones: LOCKED_ZONE_KEYS,
    requiredChecks: REQUIRED_VALIDATION_CHECK_IDS,
  });
}
