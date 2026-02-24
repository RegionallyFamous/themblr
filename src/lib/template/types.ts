import type { EditableZoneKey, LockedZoneKey } from "@/lib/contracts";

export interface TemplateBundle {
  templatePath: string;
  templateHtml: string;
  templateHash: string;
  baseLangKeys: string[];
}

export interface EditableZones {
  cssCore: string;
  headerSection: string;
  sidebarSection: string;
  contextSection: string;
}

export interface EditableZoneSnapshot {
  key: EditableZoneKey;
  value: string;
}

export interface LockedZoneSnapshot {
  key: LockedZoneKey;
  value: string;
}

export interface ZoneExtraction {
  editableZones: EditableZones;
  editableZoneSnapshots: EditableZoneSnapshot[];
  lockedZoneSnapshots: LockedZoneSnapshot[];
}

export interface ChangedZoneSummary {
  zone: EditableZoneKey;
  changed: boolean;
  oldChars: number;
  newChars: number;
}
