export const INDEX_PATTERN_SCOPE_PERM_PREFIX = '/log/index-patterns/view/';

const WILDCARD_CUT = /[*?%{]/;

export interface NamedIndexPattern {
  name?: string;
}

/** 截断第一个 `* ? % {` → 小写 → 非 [a-z0-9] 连续段换成 `-` → 去首尾 `-` */
export function toScopeSlug(name: string): string {
  if (typeof name !== 'string' || name === '') {
    return '';
  }
  const cut = name.search(WILDCARD_CUT);
  const truncated = cut === -1 ? name : name.slice(0, cut);
  return truncated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractGrantedScopes(perms: string[] | undefined): string[] {
  if (!Array.isArray(perms)) {
    return [];
  }
  const scopes: string[] = [];
  for (const perm of perms) {
    if (typeof perm === 'string' && perm.startsWith(INDEX_PATTERN_SCOPE_PERM_PREFIX)) {
      const slug = perm.slice(INDEX_PATTERN_SCOPE_PERM_PREFIX.length);
      if (slug) {
        scopes.push(slug);
      }
    }
  }
  return scopes;
}

/** 授权 `turms` 覆盖 `turms`、`turms-test`、`turms-prod` */
export function isScopeCovered(slug: string, grantedScopes: string[]): boolean {
  if (!slug || !Array.isArray(grantedScopes)) {
    return false;
  }
  return grantedScopes.some((granted) => granted !== '' && (granted === slug || slug.startsWith(`${granted}-`)));
}

export function filterIndexPatternsByScopes<T extends NamedIndexPattern>(list: T[], grantedScopes: string[]): T[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((item) => isScopeCovered(toScopeSlug(item?.name ?? ''), grantedScopes));
}
