import { DatasourceCateEnum } from '@/utils/constant';

export const helpLinkMap = {
  [DatasourceCateEnum.prometheus]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/prometheus/',
  [DatasourceCateEnum.iotdb]: 'https://iotdb.apache.org/UserGuide/latest-Table/',
  [DatasourceCateEnum.tdengine]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/tdengine/',
  jaeger: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/jaeger/',
  skywalking: 'https://skywalking.apache.org/docs/main/next/en/api/query-protocol/',
  [DatasourceCateEnum.zabbix]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/zabbix/',
  [DatasourceCateEnum.loki]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/loki/',
  [DatasourceCateEnum.tencentCLS]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/tx-cls/',
  [DatasourceCateEnum.elasticsearch]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/es/',
  [DatasourceCateEnum.aliyunSLS]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/aliy-sls/',
  [DatasourceCateEnum.mysql]: 'https://flashcat.cloud/docs/content/flashcat-monitor/nightingale-v9/usage/integrations/datasource/mysql/',
};
