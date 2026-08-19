import en_US from './en_US';
import zh_CN from './zh_CN';
import zh_HK from './zh_HK';
import ja_JP from './ja_JP';
import ru_RU from './ru_RU';

/**
 * Merged into the upstream `trace` namespace by `src/i18n.ts` (which globs every
 * `**\/locale/index.ts` and spreads them per namespace), so the trace pages keep a single
 * namespace while our keys stay in our own tree. Keys live under `list` / `graph` / `span_flame` / `search`
 * to avoid colliding with `src/pages/traceCpt/locale`.
 */
const resources = {
  trace: {
    en_US,
    zh_CN,
    zh_HK,
    ja_JP,
    ru_RU,
  },
};

export default resources;
