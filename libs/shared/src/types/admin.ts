export type AdminRole = 'super_admin' | 'bot_operator';

export type AdminScope =
  | 'guild:view'
  | 'admin:manage'
  | 'guild:manage'
  | 'billing:manage'
  | 'churn:view'
  | 'usage:view'
  | 'onboarding:view'
  | 'notification:manage'
  | 'feature-flag:manage';
