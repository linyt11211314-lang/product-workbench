/**
 * Listing Service —— AI Listing 业务编排层
 *
 * 职责：
 *  - 组装产品信息上下文
 *  - 构建各分区 Prompt（标题 / 五点 / 描述 / 关键词 / 图片文案 / 竞品分析）
 *  - 解析 AI 返回 JSON 并规范化
 *  - 竞品信息获取（URL 抓取 / 粘贴文本）
 *
 * 架构：页面 -> Listing Service -> AI Provider -> DeepSeek API
 */
import { chatWithRetry } from './aiProvider.js';
import { fetchCompetitor } from '../utils.js';
import { recordAiCall } from '../store/statsStore.js';

/** 目标站点 -> 输出语言 */
const LANG_BY_SITE = {
  US: 'English', UK: 'English', AE: 'English', CA: 'English', AU: 'English',
  SG: 'English', IN: 'English', IE: 'English',
  DE: 'German', FR: 'French', IT: 'Italian', ES: 'Spanish', MX: 'Spanish',
  JP: 'Japanese', NL: 'Dutch', SE: 'Swedish', PL: 'Polish', BR: 'Portuguese',
  BE: 'Dutch / French', TR: 'Turkish', SA: 'Arabic', EG: 'Arabic',
};

function langFor(site) {
  return LANG_BY_SITE[String(site || '').toUpperCase()] || 'English';
}

/** 标题仍沿用 200 字符旧规的例外站点（Amazon 2026-07-27 新规） */
const TITLE_EXCEPTION_SITES = ['EG', 'SA', 'TR', 'AE'];

const SYSTEM_PROMPT =
  'You are a senior Amazon listing copywriter with 10+ years of experience in Amazon SEO, ' +
  'conversion optimization and marketplace policy compliance. You write native-quality copy ' +
  'that strictly follows Amazon style guides and prohibited-content rules. ' +
  'You ALWAYS respond with valid JSON only — no markdown fences, no commentary, no extra text.\n\n' +
  'CRITICAL AMAZON POLICY UPDATE (Effective July 27, 2026):\n' +
  'Amazon Listing Title is now limited to 75 characters (including spaces) for ALL marketplaces EXCEPT:\n' +
  '- Egypt (EG)\n- Saudi Arabia (SA)\n- Turkey (TR)\n- United Arab Emirates (AE)\n' +
  'For these four exceptions, the old 200-character title limit still applies.\n' +
  'For all other marketplaces (US, CA, MX, UK, DE, FR, IT, ES, NL, SE, PL, BE, JP, AU, IN, SG, BR, etc.):\n' +
  '- Title: MAX 75 characters (including spaces).\n' +
  '- New searchable field "Item Highlights" (max 125 characters) is available beneath the title.\n' +
  '- Together: Title (75) + Item Highlights (125) = 200 characters total.\n' +
  'When generating listings, you MUST check the targetSite and apply the correct rule:\n' +
  '- If targetSite is EG, SA, TR, or AE → use OLD RULE (200-char title, no Item Highlights).\n' +
  '- For ALL other sites → use NEW RULE (75-char title + Item Highlights in bullet #1).\n' +
  'You MUST respect this limit. No exceptions beyond the four markets listed above.';

/** 构建产品信息上下文（供所有 Prompt 复用） */
export function buildProductContext(info) {
  const p = info || {};
  return {
    productName: p.name || '',
    category: p.category || '',
    targetSite: p.site || 'US',
    outputLanguage: langFor(p.site),
    coreSellingPoints: p.sellingPoints || '',
    targetKeywords: p.keywords || '',
    brand: p.brand || '',
    bannedWords: p.bannedWords || '',
    specifications: p.spec || '',
    color: p.color || '',
    size: p.size || '',
    material: p.material || '',
    hasImage: Boolean(p.image),
  };
}

/** 安全解析 AI 返回的 JSON */
export function extractJSON(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (_) {
    try {
      return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
    } catch (_) { /* 继续 */ }
  }
  throw new Error('AI 返回内容解析失败，请点击「重新生成」重试。');
}

/** 把用户输入中的禁止词清单转成英文提示 */
function bannedWordsHint(banned) {
  if (!banned) return '';
  const list = String(banned).split(/[,，;；\n]/).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return '';
  return `STRICTLY AVOID these words/phrases (never use them anywhere): ${list.join(', ')}. `;
}

/** 标题规则：例外站点（EG/SA/TR/AE）旧规 200 字符，其余站点新规 75 字符 + Item Highlights */
function amazonTitleRules(site, isException) {
  if (isException) {
    return [
      'CRITICAL INSTRUCTION:',
      `This listing is for ${site}, which is EXEMPT from Amazon's new 75-character title rule. ` +
      'The title limit remains 200 characters (including spaces) for this marketplace.',
      'You MUST integrate at least 3 distinct keywords from the "Target keywords" into this title.',
      'The first 3-4 words MUST contain the primary high-volume keyword.',
      'REQUIREMENTS:',
      '- Maximum length: 200 characters (spaces included).',
      '- Formula: [Brand] + [Core Keyword] + [Key Features] + [Attributes] + [Quantity/Model].',
      '- No promotional words (sale, discount, free shipping, best, cheapest, #1, hot, 100% money back).',
      '- No emojis, no ALL-CAPS words, no "for sale", no seller name, no contact info.',
      '- No false claims: no "FDA approved", no "eco-friendly" without certification, no guarantee of results.',
    ].join(' ');
  }
  return [
    'CRITICAL INSTRUCTION:',
    `This listing is for ${site}, which follows Amazon's new title rule (effective July 27, 2026). ` +
    'Title is limited to 75 characters INCLUDING SPACES. This is a HARD LIMIT. ' +
    'Count every character carefully. If your title exceeds 75 characters, it will be rejected.',
    'You MUST integrate at least 2 distinct keywords from the "Target keywords" into this title.',
    'The first 3-4 words MUST contain the primary high-volume keyword.',
    'Do not try to include all features — only the absolute essentials (Brand + Core Keyword + 1-2 critical differentiators).',
    'REQUIREMENTS:',
    '- Maximum length: 75 characters (spaces included).',
    '- Formula: [Brand] + [Core Keyword] + [1-2 Key Attributes/Features].',
    '- No promotional words (sale, discount, free shipping, best, cheapest, #1, hot, 100% money back).',
    '- No emojis, no ALL-CAPS words, no "for sale", no seller name, no contact info.',
    '- No false claims: no "FDA approved", no "eco-friendly" without certification, no guarantee of results.',
  ].join(' ');
}

/** 五点描述规则：例外站点旧规（无 Item Highlights），其余新规（第 1 条作为 Item Highlights ≤125 字符） */
function bulletsRules(site, isException) {
  if (isException) {
    return [
      'REQUIREMENTS:',
      'Write exactly 5 bullet points in ' + langFor(site) + '.',
      'Each bullet: 80–200 characters, benefit-driven, one idea per bullet, avoid repetition.',
      'Each bullet must contain at least 2 keywords from the Search Terms list.',
      'Cover these 5 angles IN ORDER:',
      '  1) Functional advantages & key features (embed a feature-based keyword here).',
      '  2) User pain points it solves.',
      '  3) Real usage scenarios (embed a use-case keyword here).',
      '  4) Differentiation vs common alternatives on Amazon.',
      '  5) Buying reasons / value & guarantee logic (embed a long-tail keyword here).',
      'No promotional claims, no false certification, no emojis.',
      'Each bullet must start with a capitalized benefit keyword followed by a colon, e.g. "DURABLE BUILD: ...".',
    ].join(' ');
  }
  return [
    'CRITICAL INSTRUCTION:',
    `This listing is for ${site}. Amazon's new policy introduces "Item Highlights" — a searchable ` +
    '125-character field displayed under the title. The FIRST bullet point you write will serve as the ' +
    'primary candidate for this Item Highlights field. Therefore, Bullet #1 MUST be:',
    '- Under 125 characters (including spaces).',
    '- Keyword-dense (contain at least 3 keywords from the Search Terms list).',
    '- Focused on material, size, use cases, or compatibility — NOT on promotional claims.',
    'For Bullets #2 to #5, follow the standard requirements below.',
    'REQUIREMENTS FOR ALL BULLETS:',
    'Write exactly 5 bullet points in ' + langFor(site) + '.',
    'Each bullet (except #1) must contain at least 2 keywords from the Search Terms list.',
    '- Bullet #1 (Item Highlights candidate): 80–125 characters, keyword-dense, factual attributes.',
    '- Bullet #2: 80–200 characters, functional advantages & key features.',
    '- Bullet #3: 80–200 characters, user pain points it solves.',
    '- Bullet #4: 80–200 characters, real usage scenarios (embed a use-case keyword).',
    '- Bullet #5: 80–200 characters, differentiation vs alternatives + buying reasons.',
    'No promotional claims, no false certification, no emojis.',
    'Each bullet must start with a capitalized benefit keyword followed by a colon, e.g. "COMPACT SIZE: ...".',
  ].join(' ');
}

function descriptionRules(lang) {
  return [
    'NOTE: Write the description in the primary language of the target marketplace:',
    '- US/CA/UK/AU/IN/SG → English; DE → German; FR → French; IT → Italian; ES/MX → Spanish; JP → Japanese; NL → Dutch; SE → Swedish; PL → Polish; BR → Portuguese; TR → Turkish (title follows old rule); AE/EG/SA → Arabic/English (title follows old rule).',
    'Since the Title and Item Highlights (if applicable) have limited space, use this Description field to expand on features, usage stories, and quality reassurances that could not fit in the bullets.',
    `Write a product description in ${lang}, 150–250 words.`,
    'Use simple HTML tags only: <p>, <b>, <ul>, <li>. No <h1>, no <a>, no images.',
    'Structure: engaging opening hook -> key features & benefits (bulleted) -> usage scenarios -> quality/value reassurance.',
    'Persuasive, scannable, keyword-rich but natural; no promotional claims; no emojis.',
  ].join(' ');
}

function searchTermsRules() {
  return [
    'Generate Amazon backend Search Terms.',
    'Rules: lowercase English keywords only; single words or short phrases WITHOUT commas; separate terms by spaces only.',
    'No duplicates (deduplicate carefully); no brand names of competitors; no generic words like "amazon", "product".',
    'Include synonyms, spelling variants (e.g. color/colour), related use-case terms, and long-tail phrases.',
    'Aim for 40–90 unique terms covering: core product, category, features, materials, use cases, target audience.',
    'Output as a JSON array of strings.',
  ].join(' ');
}

function imageRules() {
  return [
    'Produce image copy suggestions for the Amazon listing. Output JSON with keys:',
    '  "main": 1-2 short punchy main-image selling point phrases (under 12 words),',
    '  "bullets": 5 short image overlay copy lines matching the 5 bullet angles (under 10 words each),',
    '  "aPlus": 3-4 A+ module copy directions: each is { "title": short heading, "body": 1-2 sentence description }.',
    'Write in the same language as the listing. No emojis.',
  ].join(' ');
}

/** 构建单分区 prompt */
export function buildSectionPrompt(section, ctx, competitorContext = '') {
  const c = ctx;
  const infoLines = [
    `- Product name: ${c.productName || '(not provided)'}`,
    `- Category: ${c.category || '(not provided)'}`,
    `- Target Amazon site: ${c.targetSite || 'US'} (write copy in ${c.outputLanguage})`,
    `- Core selling points: ${c.coreSellingPoints || '(not provided)'}`,
    `- Target keywords: ${c.targetKeywords || '(not provided)'}`,
    `- Brand: ${c.brand || '(not provided)'}`,
    `- Banned words: ${c.bannedWords || '(none)'}`,
    `- Specifications: ${c.specifications || '(not provided)'}`,
    `- Color: ${c.color || '(not provided)'}`,
    `- Size: ${c.size || '(not provided)'}`,
    `- Material: ${c.material || '(not provided)'}`,
    c.hasImage ? '- Note: a product image is available; use it to infer visual details, but never describe the image itself.' : '',
  ].filter(Boolean).join('\n');

  let rules = '';
  let outputHint = '';
  // 站点判断：EG/SA/TR/AE 为旧规例外，其余新规（75 字符标题 + Item Highlights）
  const isTitleException = TITLE_EXCEPTION_SITES.includes(String(c.targetSite || 'US').toUpperCase());

  switch (section) {
    case 'title':
      rules = amazonTitleRules(c.targetSite, isTitleException);
      outputHint = isTitleException
        ? 'Output JSON: {"title": "<the title, max 200 chars>", "charCount": <actual character count>, "ruleApplied": "old (200 chars)", "notes": "<briefly list which keywords from search terms were used>"}'
        : 'Output JSON: {"title": "<the title, max 75 chars>", "charCount": <actual character count>, "ruleApplied": "new (75 chars)", "notes": "<briefly list which keywords from search terms were used>"}';
      break;
    case 'bullets':
      rules = bulletsRules(c.targetSite, isTitleException);
      outputHint = isTitleException
        ? 'Output JSON: {"bullets": ["...", "...", "...", "...", "..."], "ruleApplied": "old (no item highlights)"}'
        : 'Output JSON: {"bullets": ["<Bullet #1: max 125 chars>", "<Bullet #2>", "<Bullet #3>", "<Bullet #4>", "<Bullet #5>"], "ruleApplied": "new (item highlights in bullet #1)"}';
      break;
    case 'description':
      rules = descriptionRules(c.outputLanguage);
      outputHint = 'Output JSON: {"description": "<html string>"}';
      break;
    case 'searchTerms':
      rules = searchTermsRules();
      outputHint = 'Output JSON: {"terms": ["term1", "term2", ...]}';
      break;
    case 'imageSuggestions':
      rules = imageRules();
      outputHint = 'Output JSON: {"main": "...", "bullets": ["...x5"], "aPlus": [{"title":"...","body":"..."} x3-4]}';
      break;
    case 'competitor':
      rules = [
        'Analyze the provided competitor listing(s) and produce an Amazon listing optimization report. Output JSON with keys:',
        '  "titleStructure": 2-4 sentence analysis of the competitor title structure and patterns,',
        '  "highFrequencyKeywords": array of the most repeated/high-value keywords found,',
        '  "sellingAngles": 3-5 key selling angles the competitor emphasizes,',
        '  "differentiationOpportunities": 3-5 gaps or angles the competitor misses that our product can exploit,',
        '  "optimizationSuggestions": 3-5 concrete, actionable suggestions for OUR listing (title/bullets/description/keywords).',
        'Write analysis in Chinese (analysis language), keep each field concise and practical.',
      ].join(' ');
      outputHint = 'Output JSON: {"titleStructure":"...","highFrequencyKeywords":["..."],"sellingAngles":["..."],"differentiationOpportunities":["..."],"optimizationSuggestions":["..."]}';
      break;
    default:
      throw new Error(`未知生成分区：${section}`);
  }

  const competitorPart = competitorContext
    ? `\n\n=== COMPETITOR LISTING INFORMATION ===\n${competitorContext}`
    : (section === 'competitor' ? '\n\n(No competitor text available — produce the report based on general category best practices.)' : '');

  const prompt =
    `PRODUCT INFORMATION:\n${infoLines}\n\n` +
    `TASK — Generate the "${section}" part of an Amazon listing.\n\n` +
    `REQUIREMENTS:\n${rules}\n\n${bannedWordsHint(c.bannedWords)}` +
    `OUTPUT FORMAT:\n${outputHint}\n\n` +
    `Respond with ONLY the JSON object.${competitorPart}`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];
}

/** 获取竞品上下文文本（URL 抓取优先于已粘贴文本） */
let competitorCache = new Map();

export async function resolveCompetitorContext(productInfo) {
  const url = (productInfo.competitorUrl || '').trim();
  const pasted = (productInfo.competitorText || '').trim();
  if (pasted) return { ok: true, text: pasted, from: 'pasted' };
  if (!url) return { ok: false, text: '', error: '未提供竞品信息' };
  if (competitorCache.has(url)) return competitorCache.get(url);
  try {
    const r = await fetchCompetitor(url);
    const result = r.ok
      ? { ok: true, text: `Title: ${r.title}\n\n${r.snippet}`, from: 'url' }
      : { ok: false, text: '', error: r.error || '抓取失败' };
    competitorCache.set(url, result);
    return result;
  } catch (e) {
    return { ok: false, text: '', error: e.message };
  }
}

/** 规范化生成结果 */
export function normalizeSection(section, raw) {
  const data = extractJSON(raw);
  switch (section) {
    case 'title':
      return { title: String(data.title || '').trim() };
    case 'bullets': {
      const arr = Array.isArray(data.bullets) ? data.bullets : [];
      const bullets = arr.map((b) => String(b || '').trim()).filter(Boolean).slice(0, 5);
      // 补齐 5 条
      while (bullets.length < 5) bullets.push('');
      return { bullets };
    }
    case 'description':
      return { description: String(data.description || data.content || '').trim() };
    case 'searchTerms': {
      let terms = [];
      if (Array.isArray(data.terms)) terms = data.terms.map((t) => String(t).trim().toLowerCase());
      else if (typeof data.terms === 'string') terms = data.terms.split(/[\s,]+/).map((t) => t.trim().toLowerCase());
      else if (typeof data.searchTerms === 'string') terms = data.searchTerms.split(/[\s,]+/).map((t) => t.trim().toLowerCase());
      // 去重
      terms = [...new Set(terms.filter(Boolean))];
      return { terms };
    }
    case 'imageSuggestions': {
      const bullets = Array.isArray(data.bullets) ? data.bullets.map((b) => String(b || '').trim()).filter(Boolean) : [];
      const aPlus = Array.isArray(data.aPlus) ? data.aPlus.map((a) => ({
        title: String(a.title || a.heading || '').trim(),
        body: String(a.body || a.text || '').trim(),
      })).filter((a) => a.title || a.body) : [];
      return {
        imageSuggestions: {
          main: String(data.main || data.mainImage || '').trim(),
          bullets,
          aPlus,
        },
      };
    }
    case 'competitor':
      return {
        competitorAnalysis: {
          titleStructure: String(data.titleStructure || '').trim(),
          highFrequencyKeywords: Array.isArray(data.highFrequencyKeywords) ? data.highFrequencyKeywords.map((k) => String(k).trim()).filter(Boolean) : [],
          sellingAngles: Array.isArray(data.sellingAngles) ? data.sellingAngles.map((a) => String(a).trim()).filter(Boolean) : [],
          differentiationOpportunities: Array.isArray(data.differentiationOpportunities) ? data.differentiationOpportunities.map((a) => String(a).trim()).filter(Boolean) : [],
          optimizationSuggestions: Array.isArray(data.optimizationSuggestions) ? data.optimizationSuggestions.map((a) => String(a).trim()).filter(Boolean) : [],
        },
      };
    default:
      throw new Error(`未知分区：${section}`);
  }
}

/** 生成单个分区 */
export async function generateSection(productInfo, section, competitorContext = '') {
  const ctx = buildProductContext(productInfo);
  const messages = buildSectionPrompt(section, ctx, competitorContext);
  const temperature = section === 'title' ? 0.75 : 0.9;
  const raw = await chatWithRetry(messages, { temperature });
  recordAiCall();
  return normalizeSection(section, raw);
}

/** 完整生成 Listing（标题/五点/描述/关键词/图片文案 + 可选竞品分析） */
export async function generateFullListing(productInfo, { onStage } = {}) {
  const sections = ['title', 'bullets', 'description', 'searchTerms', 'imageSuggestions'];
  const hasCompetitor = Boolean((productInfo.competitorUrl || '').trim() || (productInfo.competitorText || '').trim());
  if (hasCompetitor) sections.push('competitor');

  // 若需要竞品分析，先生成竞品上下文
  let competitorContext = '';
  let competitorWarn = '';
  if (hasCompetitor) {
    onStage?.({ key: 'competitor', label: '获取竞品信息' });
    const r = await resolveCompetitorContext(productInfo);
    competitorContext = r.text;
    if (!r.ok) competitorWarn = r.error || '';
  }

  const results = {};
  for (const key of sections) {
    onStage?.({ key, label: sectionLabel(key) });
    const part = await generateSection(productInfo, key, competitorContext);
    Object.assign(results, part);
  }
  results.competitorWarn = competitorWarn;
  return results;
}

function sectionLabel(key) {
  const map = {
    title: '生成 Amazon 标题',
    bullets: '生成五点描述',
    description: '生成产品描述',
    searchTerms: '生成后台关键词',
    imageSuggestions: '生成图片文案建议',
    competitor: '竞品分析',
  };
  return map[key] || key;
}

export { langFor };
