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
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = resolve(process.env.APL_FILE ?? join(ROOT, 'content', 'profiles', 'MID2_shadow_archon.simc'));
const PROFILE_SOURCE = relative(ROOT, PROFILE).split(sep).join('/');
const HERO = basename(PROFILE).match(/shadow_([a-z]+)\.simc$/i)?.[1]?.toLowerCase() ?? null;
const OUT_DIR = join(ROOT, 'content', 'guides');
/**
 * 人工「人话条件」：38 行的口语版由人写，机器只负责合并与查缺。
 * 键是 `${section}#${order}`——APL 顺序变了会被下面的 skill 校验抓出来。
 */
const HUMAN_FILE = join(OUT_DIR, 'condition-human.json');
const HUMAN = existsSync(HUMAN_FILE)
  ? JSON.parse(readFileSync(HUMAN_FILE, 'utf8')).rows ?? {}
  : {};

/**
 * 中文条件生成：把 APL 条件翻成能扫读的中文短语。
 *
 * 三条规矩（写正文时也按这三条来）：
 *   1. 逻辑一个字不动——只改写法，不改条件，不补"为什么"。
 *   2. 有出处的名字用中文：技能名取 skills.json，另有两个天赋名有 NGA 出处。
 *   3. 没出处的名字（天赋 / buff / 变量）保留英文标识符，但用「」框住，
 *      让读者一眼看出这是标识符而不是漏译的句子。绝不自造官方译名。
 */

/** 技能键 → 中文名。以 skills.json 为准，避免两处各写一份。 */
const SKILL_ZH = (() => {
  const file = join(ROOT, 'content', 'guides', 'skills.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const out = {};
  for (const [key, v] of Object.entries(raw.skills ?? {})) if (v.zh) out[key] = v.zh;
  return out;
})();

/** 只有出处的中文名才写进来（本地 NGA 搬运稿）。其余天赋一律保留标识符。 */
const NAMED_ZH = {
  invoked_nightmare: '被唤起的梦魇',
  resonant_energy: '共振能量',
};

/** 名字 → 中文；查不到就用「标识符」，绝不猜官方译名。 */
function zhName(key) {
  if (SKILL_ZH[key]) return SKILL_ZH[key];
  if (NAMED_ZH[key]) return NAMED_ZH[key];
  return `「${key}」`;
}

/** 叶子条件 → 中文短语。[正则, 正向说法, 负向说法] */
const BASE_RULES = [
  [/^action\.([\w]+)\.in_flight$/, (n) => `${n}在弹道中`, (n) => `${n}不在弹道中`],
  [/^action\.([\w]+)\.usable_in$/, (n) => `${n}可用倒计时`, (n) => `${n}可用倒计时`],
  [/^action\.([\w]+)\.enabled$/, (n) => `${n}已启用`, (n) => `${n}未启用`],
  [/^dot\.([\w]+)\.ticking$/, (n) => `${n}在跳`, (n) => `${n}没在跳`],
  [/^dot\.([\w]+)\.remains$/, (n) => `${n}剩余时间`, (n) => `${n}剩余时间`],
  [/^dot\.([\w]+)\.refreshable$/, (n) => `${n}可刷新`, (n) => `${n}不可刷新`],
  [/^active_dot\.([\w]+)$/, (n) => `已挂${n}的目标数`, (n) => `已挂${n}的目标数`],
  [/^buff\.([\w]+)\.up$/, (n) => `有${n}增益`, (n) => `没有${n}增益`],
  [/^buff\.([\w]+)\.react$/, (n) => `${n}触发`, (n) => `${n}没触发`],
  [/^buff\.([\w]+)\.stack$/, (n) => `${n}层数`, (n) => `${n}层数`],
  [/^cooldown\.([\w]+)\.remains$/, (n) => `${n}冷却剩余`, (n) => `${n}冷却剩余`],
  [/^cooldown\.([\w]+)\.ready$/, (n) => `${n}冷却就绪`, (n) => `${n}冷却没好`],
  [/^cooldown\.([\w]+)\.up$/, (n) => `${n}冷却好了`, (n) => `${n}冷却没好`],
  [/^cooldown\.([\w]+)\.full_recharge_time$/, (n) => `${n}充满时间`, (n) => `${n}充满时间`],
  [/^talent\.([\w]+)$/, (n) => `${n}天赋`, (n) => `没点${n}天赋`],
  [/^pet\.([\w]+)\.active$/, (n) => `${n}在场`, (n) => `${n}不在场`],
  [/^variable\.([\w]+)$/, (n) => `${n}标记`, (n) => `${n}没置位`],
  [/^raid_event\.adds\.in$/, () => '距下次加怪', () => '距下次加怪'],
  [/^raid_event\.adds\.exists$/, () => '有加怪事件', () => '没有加怪事件'],
  [/^trinket\.(\d)\.has_buff\.([\w]+)$/, (i, k) => `饰品${i}有${zhName(k)}`, (i, k) => `饰品${i}没有${zhName(k)}`],
  [/^potion\.([\w]+)$/, (n) => `药水${n}`, (n) => `药水${n}`],
  [/^set_bonus\.([\w]+)$/, (n) => `${n}套装效果`, (n) => `${n}套装效果`],
  [/^target\.time_to_die$/, () => '目标剩余存活', () => '目标剩余存活'],
  [/^target\.health\.pct$/, () => '目标血量%', () => '目标血量%'],
  [/^target\.has_absorb$/, () => '目标有吸收盾', () => '目标没有吸收盾'],
  [/^health\.pct$/, () => '血量%', () => '血量%'],
  [/^insanity\.deficit$/, () => '疯狂值缺口', () => '疯狂值缺口'],
  [/^fight_remains$/, () => '战斗剩余时间', () => '战斗剩余时间'],
  [/^gcd\.max$/, () => '一个 GCD', () => '一个 GCD'],
  [/^active_enemies$/, () => '目标数', () => '目标数'],
  [/^in_flight$/, () => '技能在弹道中', () => '技能不在弹道中'],
  [/^prev_gcd$/, () => '上一个 GCD', () => '上一个 GCD'],
  [/^refreshable$/, () => '可刷新', () => '不可刷新'],
  [/^enabled$/, () => '该动作已启用', () => '该动作未启用'],
];

/** 括号是否配平 */
function balanced(s) {
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** 顶层按 | 或 & 拆，括号内的运算符不算 */
function splitTop(expr, op) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of expr) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0 && ch === op) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** 标识符 → 中文短语（不拆布尔，只做名字替换） */
function identToChinese(expr) {
  return expr
    .replace(/([a-z_][a-z_0-9]*(?:\.[a-z_][a-z_0-9]*)*)/g, (whole) => {
      const hit = BASE_RULES.find(([re]) => re.test(whole));
      if (hit) {
        const m = whole.match(hit[0]);
        const args = (m ?? []).slice(1).map((a) => (/^[a-z_][\w]*$/.test(a) ? zhName(a) : a));
        return hit[1](...args);
      }
      return zhName(whole);
    })
    .replace(/\s*\*\s*/g, '×')
    .replace(/\s*\+\s*/g, ' + ');
}

/** 比较运算符 → 排版友好的符号 */
const OP_ZH = { '>=': '≥', '<=': '≤', '==': '=', '!=': '≠', '>': '>', '<': '<', '=': '=' };

/** 表达式 → 中文。比较式两侧分别翻译。 */
function exprToChinese(expr) {
  let s = expr.trim();
  if (s.startsWith('(') && s.endsWith(')') && balanced(s.slice(1, -1))) s = s.slice(1, -1).trim();
  const cmp = /^(.+?)(>=|<=|==|!=|>|<|=)(.+)$/.exec(s);
  if (cmp) {
    const [, lhs, op, rhs] = cmp;
    return `${exprToChinese(lhs)} ${OP_ZH[op] ?? op} ${exprToChinese(rhs)}`;
  }
  return identToChinese(s);
}

/** 一段布尔子式 → 中文短语。顶层有「或」时加括号，免得和上层的「且」混在一起 */
function boolPhrase(inner) {
  const orParts = splitTop(inner, '|');
  if (orParts.length === 1) {
    return splitTop(inner, '&').map(leafToChinese).filter(Boolean).join(' 且 ');
  }
  const ors = orParts
    .map((o) => splitTop(o, '&').map(leafToChinese).filter(Boolean).join(' 且 '))
    .filter(Boolean);
  return `（${ors.join(' 或 ')}）`;
}

/** 单个叶子 → 中文短语。叶子内部只应剩一个原子（布尔已由上层拆开）。 */
function leafToChinese(leaf) {
  let s = leaf.trim();
  let neg = false;
  if (s.startsWith('!')) {
    neg = true;
    s = s.slice(1).trim();
  }
  // 括号里还带布尔运算符 → 当成一组处理，别把 | 和 & 当普通字符漏出去
  if (s.startsWith('(') && s.endsWith(')') && balanced(s.slice(1, -1))) {
    const inner = s.slice(1, -1).trim();
    if (/[|&]/.test(inner)) {
      const p = boolPhrase(inner);
      return neg ? `不满足（${p}）` : p;
    }
    s = inner;
  }
  const cmp = /^(.+?)(>=|<=|==|!=|>|<|=)(.+)$/.exec(s);
  if (cmp) {
    const [, lhs, op, rhs] = cmp;
    const phrase = `${exprToChinese(lhs)} ${OP_ZH[op] ?? op} ${exprToChinese(rhs)}`;
    return neg ? `不满足（${phrase}）` : phrase;
  }
  const hit = BASE_RULES.find(([re]) => re.test(s));
  if (hit) {
    const m = s.match(hit[0]);
    const args = (m ?? []).slice(1).map((a) => (/^[a-z_][\w]*$/.test(a) ? zhName(a) : a));
    return neg ? hit[2](...args) : hit[1](...args);
  }
  const phrase = identToChinese(s);
  return neg ? `没有「${phrase}」` : phrase;
}

/**
 * 整条条件 → 顶层「或」拆开的每一支。
 * 括号里的嵌套保留成「（A 或 B）」，逻辑结构和 APL 一一对应。
 */
function groupsOf(expr) {
  let s = expr.trim();
  // 整体被一对括号裹住且里面还有布尔运算 → 拆掉外层，避免出现双层括号
  if (s.startsWith('(') && s.endsWith(')') && balanced(s.slice(1, -1)) && /[|&]/.test(s.slice(1, -1))) {
    s = s.slice(1, -1).trim();
  }
  const out = [];
  for (const orPart of splitTop(s, '|')) {
    const ands = splitTop(orPart, '&').map(leafToChinese).filter(Boolean);
    if (ands.length) out.push(ands.join(' 且 '));
  }
  return out;
}

/**
 * 整条条件 → { zh, groups }
 * groups 是顶层「或」拆开的每一支，前端用它把条件渲染成可扫读的一组短语。
 */
function toChinese(cond) {
  const groups = groupsOf(cond);
  return { zh: groups.join(' 或 '), groups };
}

/** target_if 不是施放条件，是"按什么排序挑目标"的打分式：只翻译名字，保留打分结构 */
function toChineseSelect(expr) {
  if (!expr) return '';
  const fn = /^(max|min):/.exec(expr);
  const prefix = fn ? (fn[1] === 'max' ? '取最大：' : '取最小：') : '';
  let body = expr.replace(/^(max|min):/, '').split(',')[0];
  // 括号里的打分项先摘出来单独翻译，避免外层再翻一遍造成双层括号
  const parts = [];
  body = body.replace(/\(([^()]*)\)/g, (_, inner) => {
    const ors = splitTop(inner, '|')
      .map((o) => splitTop(o, '&').map(leafToChinese).filter(Boolean).join(' 且 '))
      .filter(Boolean);
    parts.push(`（${ors.join(' 或 ')}）`);
    return `@@${parts.length - 1}@@`;
  });
  body = identToChinese(body);
  body = body.replace(/@@(\d+)@@/g, (_, i) => parts[Number(i)]);
  body = body.replace(/\s*\*\s*/g, '×').replace(/\s*\+\s*/g, ' + ');
  return prefix + body;
}

const SECTION_LABEL = {
  'actions.main': '单体主循环',
  'actions.aoe': 'AoE 循环',
  'actions.cds': '冷却/爆发',
  'actions': '入口（决定走哪套循环）',
  'actions.precombat': '开打前',
};

/* ------------------------------------------------------------ 死行判定
 *
 * 表里有些行在本构建里永远不会施放：种族不对、装备没带、要队友、条件不到、天赋没点。
 * 这些行照留（表是 APL 原文），但必须带原因，不能和能用的行长得一样。
 *
 * 两条硬规矩，违反就抛：
 *   1. 数据说 0 次施放、却没有原因 → 抛。新出现的死行必须当次解决，不许默默留在表里。
 *   2. 写了原因、数据却有施放 → 抛。规则比数据旧了，不许继续拿来说事。
 */

const RACE_ZH = {
  blood_elf: '血精灵',
  void_elf: '虚空精灵',
  dwarf: '矮人',
  dark_iron_dwarf: '黑铁矮人',
  troll: '巨魔',
  zandalari_troll: '赞达拉巨魔',
  orc: '兽人',
  maghar_orc: '玛格汉兽人',
  tauren: '牛头人',
  highmountain_tauren: '高岭牛头人',
  night_elf: '暗夜精灵',
  human: '人类',
  undead: '亡灵',
  worgen: '狼人',
  goblin: '地精',
  pandaren: '熊猫人',
  draenei: '德莱尼',
  lightforged_draenei: '光铸德莱尼',
  gnome: '侏儒',
  mechagnome: '机械侏儒',
  vulpera: '狐人',
  nightborne: '夜之子',
  kul_tiran: '库尔提拉斯人',
  earthen: '土灵',
};

const zhRace = (race) => RACE_ZH[race] ?? `「${race}」`;

/** 种族技能 → 拥有它的种族。profile 的 race 不在其中，这一行就用不了。 */
const RACIAL_SKILLS = [
  { skills: ['arcane_torrent'], races: ['blood_elf'] },
  { skills: ['fireblood'], races: ['dwarf', 'dark_iron_dwarf'] },
  { skills: ['berserking'], races: ['troll', 'zandalari_troll'] },
  { skills: ['blood_fury'], races: ['orc', 'maghar_orc'] },
  { skills: ['ancestral_call'], races: ['tauren', 'highmountain_tauren'] },
];

/** 不靠种族判断来源的三类：天赋没点、装备没带、要队友、条件不到。 */
const TALENT_ONLY = ['void_blast', 'void_torrent'];

/**
 * 施放证据：ability-share 给多迭代的次数，trace 给真实动作序列。
 * 两者合起来回答「这个技能在本构建里到底会不会出现」。
 */
export function loadExecutionEvidence(hero) {
  const exec = new Map();
  const scenes = new Set();
  const bump = (skill, n) => {
    if (skill && n > 0) exec.set(skill, (exec.get(skill) ?? 0) + n);
  };

  const shareFile = join(ROOT, 'content', 'analysis', `ability-share-${hero}.json`);
  if (existsSync(shareFile)) {
    const share = JSON.parse(readFileSync(shareFile, 'utf8'));
    for (const [id, s] of Object.entries(share.scenarios ?? {})) {
      scenes.add(id);
      for (const r of s.rows ?? []) bump(r.spell, r.executes ?? 0);
    }
  }

  const simsDir = join(ROOT, 'content', 'sims');
  for (const f of readdirSync(simsDir)) {
    if (!/^trace_.*\.json$/.test(f)) continue;
    const j = JSON.parse(readFileSync(join(simsDir, f), 'utf8'));
    if (j.hero !== hero || !j.actions?.series) continue;
    scenes.add(j.scenarioId ?? f);
    for (const a of j.actions.series) bump(a.name, 1);
  }

  return { exec, scenes: [...scenes].sort() };
}

function buildDeadRows(lines, profileText, hero) {
  if (hero !== 'archon') {
    console.log(`  注：死行规则目前只对 archon 成立，${hero} 不判定`);
    return new Map();
  }

  const apl = new Map();
  for (const line of lines) {
    const m = /^(actions(?:\.[a-z_]+)?)\+?=\/([a-z_0-9]+)(?:,(.*))?$/.exec(line.trim());
    if (!m || !SECTION_LABEL[m[1]]) continue;
    if (['variable', 'call_action_list', 'run_action_list'].includes(m[2])) continue;
    apl.set(m[2], m[3] ?? '');
  }

  const race = /^race=(.+)$/m.exec(profileText)?.[1]?.trim() ?? '';
  const dead = new Map();
  const mark = (skill, kind, reason) => dead.set(skill, { kind, reason });

  for (const rule of RACIAL_SKILLS) {
    if (rule.races.includes(race)) continue;
    const owner = rule.races.map(zhRace).join('/');
    for (const skill of rule.skills) {
      if (apl.has(skill)) mark(skill, 'race', `种族技能（${owner}专属），这套配置是${zhRace(race)}`);
    }
  }

  for (const skill of TALENT_ONLY) {
    if (apl.has(skill)) mark(skill, 'talent', '这套配置没点这个天赋');
  }

  if (apl.has('use_item')) {
    const item = /name=([a-z_0-9]+)/.exec(apl.get('use_item'))?.[1];
    if (item && !new RegExp(`^[a-z_0-9]+=${item}[,\\r\\n]`, 'm').test(profileText)) {
      mark('use_item', 'gear', `指定饰品没带（「${item}」）`);
    }
  }

  if (apl.has('invoke_external_buff')) {
    mark('invoke_external_buff', 'external', '要队友施放，单人模拟拿不到');
  }

  if (apl.has('desperate_prayer')) {
    const pct = /health\.pct\s*<=\s*(\d+)/.exec(apl.get('desperate_prayer'))?.[1];
    mark('desperate_prayer', 'condition', pct ? `条件没触发：血量没降到 ${pct}% 以下` : '条件没触发');
  }

  const { exec, scenes } = loadExecutionEvidence(hero);
  for (const [skill, info] of dead) {
    const n = exec.get(skill) ?? 0;
    if (n > 0) throw new Error(`死行规则失效：${skill} 被标成不可用，但 ${scenes.length} 个场景里有 ${n} 次施放`);
    if (!apl.has(skill)) throw new Error(`死行规则失效：${skill} 已不在 APL 里，规则该删了`);
    info.evidence = `${scenes.length} 个场景 0 次施放`;
  }
  for (const skill of apl.keys()) {
    if ((exec.get(skill) ?? 0) === 0 && !dead.has(skill)) {
      throw new Error(`新增死行：${skill} 在 ${scenes.length} 个场景里 0 次施放，但没有写原因（补进 RACIAL_SKILLS / TALENT_ONLY 或单独规则）`);
    }
  }
  return dead;
}

const src = readFileSync(PROFILE, 'utf8');
const lines = src.split(/\r?\n/);
const dead = buildDeadRows(lines, src, HERO);

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
  const cond = condRaw ? toChinese(condRaw) : { zh: '无条件（排到就打）', groups: [] };
  const deadInfo = dead.get(skill) ?? null;
  const humanKey = `${section}#${order[section]}`;
  const human = HUMAN[humanKey] ?? null;
  if (human && human.skill !== skill) {
    throw new Error(`${humanKey} 的人话条件挂的是 ${human.skill}，但 APL 这一行是 ${skill}——顺序变了，先核对 condition-human.json`);
  }
  rows.push({
    section,
    sectionLabel: SECTION_LABEL[section],
    order: order[section],
    skill,
    conditionRaw: condRaw,
    conditionZh: cond.zh,
    /** 人工口语版；缺行由 validate:content 报错，不在生成器里静默兜底 */
    conditionHuman: human?.human ?? null,
    /** 顶层「或」拆开的每一支；前端渲染成可扫读的一组短语 */
    conditionGroups: cond.groups,
    targetSelectRaw: targetIfRaw,
    targetSelectZh: targetIfRaw ? toChineseSelect(targetIfRaw) : '',
    enabled: !/,\s*if=0\b/.test(rest ?? '') && !deadInfo,
    /** 本构建用不上的行：kind 给原因分类，evidence 是施放次数来源 */
    ...(deadInfo ? { dead: deadInfo } : {}),
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const out = {
  source: PROFILE_SOURCE,
  hero: HERO,
  gameVersion: 'MID2',
  generatedAt: new Date().toISOString(),
  note:
    '直接从 APL 抽取，条件原文与人话并列；人话只改写法，不改逻辑，也不补"为什么"。' +
    '有出处的名字用中文，没出处的用「」标成标识符。' +
    'dead 非空的行表示这套配置用不上（种族/装备/队友/条件/天赋），原因与施放次数一并给出。',
  sections: Object.entries(SECTION_LABEL)
    .map(([k, v]) => ({ key: k, label: v, rows: rows.filter((r) => r.section === k) }))
    .filter((s) => s.rows.length),
};
writeFileSync(join(OUT_DIR, 'priority-table.json'), JSON.stringify(out, null, 2) + '\n');

const missingHuman = rows.filter((row) => !row.conditionHuman);
console.log(`写出 content/guides/priority-table.json · ${rows.length} 条优先级 · 人话条件 ${rows.length - missingHuman.length}/${rows.length}`);
if (missingHuman.length) {
  console.log('  缺人话条件（请在 condition-human.json 补）：');
  for (const row of missingHuman) console.log(`    ${row.section}#${row.order} ${row.skill}`);
}
if (dead.size) {
  console.log(`  本构建用不上 ${dead.size} 条：`);
  for (const [skill, info] of dead) console.log(`    ${skill.padEnd(22)} ${info.reason}（${info.evidence}）`);
}
for (const s of out.sections) {
  console.log(`\n【${s.label}】${s.rows.length} 条`);
  for (const r of s.rows.slice(0, 12)) {
    const sel = r.targetSelectZh ? `  〔选目标：${r.targetSelectZh.slice(0, 34)}〕` : '';
    console.log(`  ${String(r.order).padStart(2)}. ${r.skill.padEnd(22)} ${r.conditionZh.slice(0, 70)}${sel}`);
  }
  if (s.rows.length > 12) console.log(`  … 还有 ${s.rows.length - 12} 条`);
}
