import { ok } from "@/lib/api";
import { THEMES } from "@/lib/taxonomy";

export const GET = () => ok({ themes: THEMES.map(({ keywords, ...t }) => t) });
