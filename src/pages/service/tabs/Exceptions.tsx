import React from 'react';
import { useTranslation } from 'react-i18next';

import { NS } from '../constants';
import TabEmpty from './TabEmpty';

interface Props {
  service?: string;
}

export default function Exceptions({ service }: Props) {
  const { t } = useTranslation(NS);
  return <TabEmpty description={service ? t('tab.exceptions_empty_named', { service }) : t('tab.exceptions_empty')} />;
}
