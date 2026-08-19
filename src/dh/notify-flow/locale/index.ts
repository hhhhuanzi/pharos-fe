import { NS } from '@/pages/notificationRules/constants';

import en_US from './en_US';
import zh_CN from './zh_CN';
import zh_HK from './zh_HK';
import ja_JP from './ja_JP';
import ru_RU from './ru_RU';

/**
 * Merged into the upstream `notification-rules` namespace by `src/i18n.ts`.
 * Only `flow.*` keys live here so official locale files stay untouched.
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
