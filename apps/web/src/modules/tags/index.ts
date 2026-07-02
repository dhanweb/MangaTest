export interface CanonicalTag {
  id: string;
  namespace: string;
  name: string;
  canonical: string;
  displayNameZh: string | null;
}

export function createCanonicalTag(namespace: string, name: string) {
  return `${namespace.trim().toLowerCase()}:${name.trim().toLowerCase()}`;
}
