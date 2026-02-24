import fs from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/env";
import { sha256 } from "@/lib/utils";
import type { TemplateBundle } from "@/lib/template/types";

function extractLangKeys(html: string): string[] {
  const keys = new Set<string>();
  const re = /\{lang:[^}]+\}/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    keys.add(match[0]);
  }

  return [...keys].sort();
}

async function readTemplateAt(targetPath: string): Promise<string | null> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch {
    return null;
  }
}

export async function resolveStarterThemePath(): Promise<string> {
  const env = getEnv();
  const candidates = [
    env.starterThemePath,
    path.resolve(process.cwd(), "../defaultera/theme.html"),
    path.resolve(process.cwd(), "../tumblr-starter-theme/theme.html"),
    path.resolve(process.cwd(), "starter/theme.html"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const html = await readTemplateAt(candidate);
    if (html) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to locate starter theme.html. Set STARTER_THEME_PATH or ensure ../defaultera/theme.html exists.",
  );
}

export async function loadStarterTemplate(): Promise<TemplateBundle> {
  const templatePath = await resolveStarterThemePath();
  const templateHtml = await fs.readFile(templatePath, "utf8");

  return {
    templatePath,
    templateHtml,
    templateHash: sha256(templateHtml),
    baseLangKeys: extractLangKeys(templateHtml),
  };
}
