import { message } from 'antd';

import FormModal from '@/pages/dashboard/List/FormModal';
import ImportGrafanaURLFormModal from '@/pages/dashboard/List/ImportGrafanaURLFormModal';
import { IDashboard, IDashboardConfig } from '@/pages/dashboard/types';
import { JSONParse } from '@/pages/dashboard/utils';
import { getDashboard } from '@/services/dashboardV2';
import i18next from 'i18next';

import { NS } from './constants';

interface OpenDashboardEditOptions {
  record: { id: number } & Partial<IDashboard>;
  busiId?: number;
  onOk?: () => void;
}

function parseConfigs(raw: unknown): IDashboardConfig {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as IDashboardConfig;
  }
  if (typeof raw === 'string') {
    return JSONParse(raw) as IDashboardConfig;
  }
  return {} as IDashboardConfig;
}

export async function openDashboardEdit(options: OpenDashboardEditOptions) {
  const { record, busiId, onOk } = options;
  try {
    const detail = await getDashboard(record.id);
    const configs = parseConfigs(detail?.configs);
    const initialValues = {
      ...record,
      ...detail,
      configs,
    } as IDashboard;

    if (configs.mode === 'iframe') {
      ImportGrafanaURLFormModal({
        initialValues,
        onOk,
      });
      return;
    }

    FormModal({
      action: 'edit',
      initialValues,
      busiId,
      onOk,
    });
  } catch {
    message.error(i18next.t(`${NS}:favorite.edit_load_failed`));
  }
}
