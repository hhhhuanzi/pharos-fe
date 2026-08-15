import React from 'react';
import { useTranslation } from 'react-i18next';
import PageLayout from '@/components/pageLayout';
import ServiceGraph from '@/dh/trace/dependencies';

/** Thin mount for Track B (R-30 / P-49). Implementation lives in `src/dh/trace/dependencies`. */
export default function index() {
  const { t } = useTranslation('trace');
  return (
    <PageLayout title={t('dependencies')}>
      <ServiceGraph />
    </PageLayout>
  );
}
