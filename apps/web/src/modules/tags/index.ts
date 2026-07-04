export interface CanonicalTag {
  id: string;
  namespace: string;
  name: string;
  canonical: string;
  displayNameZh: string | null;
  comicCount?: number;
}

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

export function createCanonicalTag(namespace: string, name: string) {
  return `${namespace.trim().toLowerCase()}:${name.trim().toLowerCase()}`;
}

export function namespaceLabel(namespace: string) {
  return NAMESPACE_LABELS[namespace] ?? namespace;
}

export function namespaceOptionLabel(namespace: string) {
  const label = NAMESPACE_LABELS[namespace];
  return label ? `${label} (${namespace})` : namespace;
}

export function tagDisplayLabel(tag: Pick<CanonicalTag, "canonical" | "displayNameZh" | "name">) {
  return tag.displayNameZh || tag.name || tag.canonical;
}
