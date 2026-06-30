/**
 * Tag & namespace translation utilities.
 *
 * All display helpers are centralized here so that switching from hardcoded
 * maps to database-backed translations in the future only requires changing
 * the implementation of these functions — consumers stay the same.
 */

/** namespace → Chinese display label */
export const NAMESPACE_LABELS: Record<string, string> = {
  language: "语言",
  female: "女性",
  male: "男性",
  category: "类型",
  other: "其他",
  artist: "作者",
  group: "社团",
  parody: "原作",
};

/** Resolve namespace → Chinese label, fallback to raw key */
export function namespaceLabel(ns: string): string {
  return NAMESPACE_LABELS[ns] ?? ns;
}

/** "中文 (english)" format — used in Select dropdown options */
export function namespaceOptionLabel(ns: string): string {
  const cn = NAMESPACE_LABELS[ns];
  return cn ? `${cn} (${ns})` : ns;
}

/** tag canonical → Chinese display label */
export const TAG_TRANSLATIONS: Record<string, string> = {
  "language:translated": "已翻译",
  "language:chinese": "中文",
  "language:english": "英文",
  "language:korean": "韩文",
  "female:big breasts": "巨乳",
  "female:schoolgirl uniform": "水手服",
  "female:beauty mark": "泪痣",
  "female:drunk": "醉酒",
  "female:ahegao": "阿黑颜",
  "male:sole male": "单男主",
  "male:teacher": "教师",
  "male:virginity": "童贞",
  "category:manga": "漫画",
  "category:doujinshi": "同人志",
  "other:mosaic censorship": "马赛克",
  "other:tankoubon": "单行本",
  "other:uncensored": "无修正",
  "other:rough translation": "机翻",
  "artist:gen": "gen",
  "artist:mashiro shirako": "mashiro shirako",
  "artist:unknown": "未知作者",
  "group:enji": "enji",
  "parody:original": "原创",
};

/** Build canonical tag from namespace + tag name */
export function canonicalTag(namespace: string, name: string): string {
  return `${namespace}:${name}`;
}

/** Resolve a canonical tag → Chinese display, fallback to tag name part */
export function tagLabel(canonical: string): string {
  return TAG_TRANSLATIONS[canonical] ?? tagNameFromCanonical(canonical);
}

/** Strip namespace prefix from a canonical tag.
 *  "female:big breasts" → "big breasts"  */
export function tagNameFromCanonical(canonical: string): string {
  const idx = canonical.indexOf(":");
  return idx === -1 ? canonical : canonical.slice(idx + 1);
}

/** Full Chinese display for a canonical tag.
 *  "language:translated" → "已翻译" (if translation known)
 *  otherwise "语言 / translated"          */
export function tagDisplayLabel(
  canonical: string,
  translation?: string | null,
): string {
  if (translation) return translation;
  const idx = canonical.indexOf(":");
  if (idx === -1) return canonical;
  const ns = canonical.slice(0, idx);
  const name = canonical.slice(idx + 1);
  const nsCn = namespaceLabel(ns);
  return `${nsCn} / ${name}`;
}

/** Check whether a canonical tag matches a search query.
 *  Searches against: Chinese namespace, English name, canonical, and optional translation. */
export function tagMatchesQuery(
  canonical: string,
  query: string,
  translation?: string | null,
): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  if (canonical.toLowerCase().includes(q)) return true;
  if (translation && translation.toLowerCase().includes(q)) return true;
  const idx = canonical.indexOf(":");
  if (idx !== -1) {
    const ns = canonical.slice(0, idx);
    const name = canonical.slice(idx + 1);
    if (name.toLowerCase().includes(q)) return true;
    if (namespaceLabel(ns).includes(q)) return true;
  }
  return false;
}
