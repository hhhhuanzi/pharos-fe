import { NS } from '@/pages/service/constants';

import en_US from './en_US';
import ja_JP from './ja_JP';
import ru_RU from './ru_RU';
import zh_CN from './zh_CN';
import zh_HK from './zh_HK';

/**
 * Merged into the service namespace by `src/i18n.ts`, which globs every `**\/locale/index.ts` and
 * spreads them per namespace. That spread is shallow, so the whole `monitoring` key lives here and
 * nowhere else — `src/pages/service/locale` must not define it too, or one copy would win silently.
 */
const resources = {
  [NS]: {
    en_US,
    zh_CN,
    zh_HK,
    ja_JP,
    ru_RU,
  },
};

export default resources;
