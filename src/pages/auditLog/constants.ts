export const NS = 'auditLog';
export const PATH = '/audit-log';

// 与后端 pkg/dh/audit/routes_map.go 的 ObjectType 保持逐字符一致
export const OBJECT_TYPE_OPTIONS = [
  'alert_rule',
  'alert_mute',
  'alert_subscribe',
  'recording_rule',
  'job_tpl',
  'job_task',
  'board',
  'role',
  'user',
  'user_group',
  'busi_group',
  'busi_group_member',
  'datasource',
  'notify_rule',
  'notify_channel',
  'notify_template',
  'event_pipeline',
  'component',
  'embedded_product',
  'duty',
  'self',
  'other',
] as const;

export type ObjectType = (typeof OBJECT_TYPE_OPTIONS)[number];

// 与后端 pkg/dh/audit RiskHigh/Medium/Low 保持一致
export const RISK_LEVEL_OPTIONS = ['high', 'medium', 'low'] as const;
export type RiskLevel = (typeof RISK_LEVEL_OPTIONS)[number];

export const RISK_LEVEL_COLOR: Record<string, string> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
};

export const ACTION_COLOR: Record<string, string> = {
  create: 'success',
  update: 'warning',
  delete: 'error',
};

/** 后端脱敏占位符，展示时替换为可读「已隐藏」 */
export const REDACTED_PLACEHOLDER = '***REDACTED***';

/**
 * 请求体常见字段名 → 中文标签。未知字段仍按原 key 展示。
 * 与后端 redact 敏感 key 子串对齐（password/token/secret 等）。
 */
export const REQUEST_BODY_FIELD_LABELS: Record<string, string> = {
  nickname: '昵称',
  username: '用户名',
  password: '密码',
  old_password: '旧密码',
  new_password: '新密码',
  confirm_password: '确认密码',
  roles: '角色',
  email: '邮箱',
  phone: '电话',
  contacts: '联系方式',
  name: '名称',
  note: '备注',
  remark: '备注',
  ident: '标识',
  cate: '类别',
  settings: '配置',
  auth: '认证',
  basic_auth_user: 'Basic Auth 用户',
  basic_auth_password: 'Basic Auth 密码',
  token: 'Token',
  access_token: 'Access Token',
  secret: '密钥',
  api_key: 'API Key',
  apikey: 'API Key',
  header: '请求头',
  headers: '请求头',
  url: '地址',
  cluster_name: '集群名',
  timeout: '超时',
  enabled: '启用',
  disabled: '禁用',
  severity: '严重程度',
  prom_ql: 'PromQL',
  prom_for_duration: '持续时长',
  notify_recovered: '恢复通知',
  notify_channels: '通知渠道',
  notify_groups: '通知团队',
  callbacks: '回调',
  annotations: '注解',
  labels: '标签',
  tags: '标签',
  group_id: '业务组 ID',
  user_group_id: '团队 ID',
  datasource_ids: '数据源',
  configs: '配置项',
  content: '内容',
  title: '标题',
  members: '成员',
  member: '成员',
  perm_flag: '权限',
  permissions: '权限',
  ops: '操作权限',
};
