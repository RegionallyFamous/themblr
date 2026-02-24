import { ThemblrApp } from "@/components/themblr-app";
import { loadStarterTemplate } from "@/lib/template/loader";

export default async function HomePage() {
  let initialThemeHtml = "";

  try {
    const bundle = await loadStarterTemplate();
    initialThemeHtml = bundle.templateHtml;
  } catch {
    initialThemeHtml = "";
  }

  return <ThemblrApp initialThemeHtml={initialThemeHtml} />;
}
