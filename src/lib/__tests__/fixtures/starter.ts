import fs from "node:fs/promises";
import path from "node:path";

const CANDIDATES = [
  process.env.STARTER_THEME_PATH,
  path.resolve(process.cwd(), "../defaultera/theme.html"),
  path.resolve(process.cwd(), "../tumblr-starter-theme/theme.html"),
  path.resolve(process.cwd(), "starter/theme.html"),
].filter(Boolean) as string[];

async function resolveStarterFixturePath(): Promise<string> {
  for (const candidate of CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Unable to locate starter fixture theme.html for tests.");
}

export async function loadStarterThemeFixture() {
  const fixturePath = await resolveStarterFixturePath();
  return fs.readFile(fixturePath, "utf8");
}

export function starterThemePath() {
  const first = CANDIDATES[0];
  if (!first) {
    throw new Error("No starter fixture path candidates configured.");
  }
  return first;
}
