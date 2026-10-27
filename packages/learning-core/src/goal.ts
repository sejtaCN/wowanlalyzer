/**
 * 学习目标：暗影牧师。常量，不随导入的数据变化。
 */
export const SHADOW_PRIEST_GOAL = {
  goalId: 'shadow-priest',
  specKey: 'shadow-priest',
  specName: '暗影牧师',
  alias: '暗牧',
  className: '牧师',
} as const;

/** 产品名与副标题，顶栏与首页共用 */
export const PRODUCT = {
  /** 产品名保持中性：界面支持多专精，当前专精由顶栏选择器显示 */
  name: '专精学习系统',
  tagline: '看图学输出：这一波怎么打，爆发给哪一波',
} as const;
