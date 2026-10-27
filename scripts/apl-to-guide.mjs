/**
 * 把 APL（SimulationCraft 的 action priority list）转成「攻略式优先级表」。
 *
 * 为什么要有这一步：攻略网站写的是「先打 A，如果 B 就改打 C」，而 APL 里就是
 * `actions.main+=/skill,if=condition` 这种机器语法。两者是同一件事的两种写法，
 * 但没人把 APL 直接翻成人话给人看——这里做这件事，且不改写条件、不脑补理由。
 *
 * 输出 content/guides/priority-table.json：
 *   [{ section, order, skill, conditionRaw, conditionZh, enabled }]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = process.env.APL_FILE ?? join(ROOT, 'content', 'profiles', 'MID2_shadow_voidweaver.simc');
const OUT_DIR = join(ROOT, 'content', 'guides');

/** 条件里的 token → 人话。只翻译"看得懂的部分"，翻不了的保留原文。 */
const TERMS = [
  [/\bactive_enemies\b/g, '目标数'],
  [/\bactive_dot\.(\w+)/g, '已挂着 $1 的目标数'],
  [/\bdot\.(\w+)\.ticking\b/g, '$1 正在跳'],
  [/\bdot\.(\w+)\.remains\b/g, '$1 剩余时间'],
  [/\bdot\.(\w+)\.refreshable\b/g, '$1 可刷新'],
  [/\bbuff\.(\w+)\.up\b/g, '有 $1 buff'],
  [/\bbuff\.(\w+)\.react\b/g, '$1 触发'],
  [/\bcooldown\.(\w+)\.remains\b/g, '$1 冷却剩余'],
  [/\bcooldown\.(\w+)\.ready\b/g, '$1 冷却就绪'],
  [/\bcooldown\.(\w+)\.full_recharge_time\b/g, '$1 充满时间'],
  [/\btalent\.(\w+)/g, '天赋 $1'],
  [/\binsanity\.deficit\b/g, '疯狂值缺口'],
  [/\btarget\.time_to_die\b/g, '目标剩余存活'],
  [/\btarget\.health\.pct\b/g, '目标血量%'],
  [/\bfight_remains\b/g, '战斗剩余时间'],
  [/\bgcd\.max\b/g, '一个 GCD'],
  [/\bin_flight\b/g, '技能在弹道中'],
  [/\btrinket\.(\d)\.has_buff\.(\w+)/g, '饰品$1 有 $2'],
  [/\bpotion\.(\w+)/g, '药水 $1'],
  [/\braid_event\.adds\.in\b/g, '距下次加怪'],
  [/\braid_event\.adds\.exists\b/g, '有加怪事件'],
  [/\bprev_gcd/g, '上一个 GCD'],
];

function toChinese(cond) {
  let out = cond;
  for (const [re, rep] of TERMS) out = out.replace(re, rep);
  // 运算符
  out = out
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/&&/g, ' 且 ')
    .replace(/\|\|/g, ' 或 ')
    .replace(/\|/g, ' 或 ')
    .replace(/&/g, ' 且 ')
    .replace(/!=/g, '≠')
    .replace(/(\d+(?:\.\d+)?)\s*\*\s*/g, '$1×');
  return out.replace(/\s+/g, ' ').trim();
}

const SECTION_LABEL = {
  'actions.main': '单体主循环',
  'actions.aoe': 'AoE 循环',
  'actions.cds': '冷却/爆发',
  'actions': '入口（决定走哪套循环）',
  'actions.precombat': '开打前',
};

const src = readFileSync(PROFILE, 'utf8');
const lines = src.split(/\r?\n/);

const rows = [];
let order = {};
for (const line of lines) {
  const m = /^(actions(?:\.[a-z_]+)?)\+?=\/([a-z_0-9]+)(?:,(.*))?$/.exec(line.trim());
  if (!m) continue;
  const [, section, skill, rest] = m;
  if (!SECTION_LABEL[section]) continue;
  if (skill === 'variable' || skill === 'call_action_list' || skill === 'run_action_list') continue;
  order[section] = (order[section] ?? 0) + 1;
  // 条件分成两件事：target_if = 选哪个目标；if = 满不满足施放条件
  const grab = (key) => {
    const re = new RegExp(`(?:^|,)${key}=(.+?)(?=,(?:if|target_if|name|value|op|default)=|$)`);
    const m = re.exec(rest ?? '');
    return m ? m[1] : '';
  };
  const condRaw = grab('if');
  const targetIfRaw = grab('target_if');
  rows.push({
    section,
    sectionLabel: SECTION_LABEL[section],
    order: order[section],
    skill,
    conditionRaw: condRaw,
    conditionZh: condRaw ? toChinese(condRaw) : '无条件（排到就打）',
    targetSelectRaw: targetIfRaw,
    targetSelectZh: targetIfRaw ? toChinese(targetIfRaw) : '',
    enabled: !/,\s*if=0\b/.test(rest ?? ''),
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const out = {
  source: 'content/profiles/MID2_shadow_voidweaver.simc',
  gameVersion: 'MID2',
  generatedAt: new Date().toISOString(),
  note: '直接从 APL 抽取，条件原文与人话并列；人话只做词替换，不改写逻辑，也不补"为什么"',
  sections: Object.entries(SECTION_LABEL)
    .map(([k, v]) => ({ key: k, label: v, rows: rows.filter((r) => r.section === k) }))
    .filter((s) => s.rows.length),
};
writeFileSync(join(OUT_DIR, 'priority-table.json'), JSON.stringify(out, null, 2) + '\n');

console.log(`写出 content/guides/priority-table.json · ${rows.length} 条优先级`);
for (const s of out.sections) {
  console.log(`\n【${s.label}】${s.rows.length} 条`);
  for (const r of s.rows.slice(0, 12)) {
    const sel = r.targetSelectZh ? `  〔选目标：${r.targetSelectZh.slice(0, 34)}〕` : '';
    console.log(`  ${String(r.order).padStart(2)}. ${r.skill.padEnd(22)} ${r.conditionZh.slice(0, 70)}${sel}`);
  }
  if (s.rows.length > 12) console.log(`  … 还有 ${s.rows.length - 12} 条`);
}
