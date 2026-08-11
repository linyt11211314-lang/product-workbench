/**
 * 侵权 / IP 风险扫描服务 —— 移植自 Codex lib/risk-scanner.ts + risk-scan-provider.ts
 * 演示模式为本地启发式（关键词匹配）；AI 模式调用 DeepSeek 代理做真实识别（复用 /api/ai/generate）。
 */
import { chat } from './aiProvider.js';

const highRiskTerms = ['仿', '同款', '复刻', 'logo', '品牌', '授权', '专利', '迪士尼', '苹果', 'apple', 'nike'];
const designTerms = ['磁吸', '折叠', '旋转', '伸缩', '卡扣', '三折', '结构', '造型'];

function countTerms(text, terms) {
  return terms.filter((term) => text.includes(term)).length;
}

function extractJSON(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export function validateRiskScanInput(productInfo) {
  if (!productInfo.name || !productInfo.name.trim()) return { valid: false, message: '请填写产品名称' };
  if (!productInfo.images || productInfo.images.length === 0) return { valid: false, message: '请至少上传一张产品图片' };
  return { valid: true, message: '' };
}

/** 演示模式：本地启发式分析（无需外部 API） */
export function createBasicRiskScan(productInfo, id, timestamp = new Date().toISOString()) {
  const normalized = {
    name: String(productInfo.name || '').trim().slice(0, 120),
    description: String(productInfo.description || '').trim().slice(0, 2000),
    category: String(productInfo.category || '').trim().slice(0, 120),
    link: String(productInfo.link || '').trim().slice(0, 2000),
    images: Array.isArray(productInfo.images) ? productInfo.images.slice(0, 6) : [],
  };
  const text = `${normalized.name} ${normalized.category} ${normalized.description}`.toLowerCase();
  const keywordHits = countTerms(text, highRiskTerms);
  const designHits = countTerms(text, designTerms);
  const brandHits = countTerms(text, ['logo', '品牌', '授权', '同款', '复刻', 'apple', 'nike', '迪士尼']);
  const score = Math.min(88, 18 + keywordHits * 19 + designHits * 7 + (normalized.images.length > 1 ? 4 : 0));
  const riskLevel = score >= 60 ? 'high' : score >= 34 ? 'medium' : 'low';

  return {
    id,
    productInfo: normalized,
    status: 'completed',
    mode: 'demo',
    riskLevel,
    riskScore: score,
    identification: {
      productType: normalized.category || normalized.name,
      features: designTerms.filter((term) => text.includes(term)).slice(0, 5),
      brandMarks: highRiskTerms.filter((term) => text.includes(term)).slice(0, 5),
    },
    matchedProducts: [],
    countries: [],
    patents: [],
    trademarks: [],
    copyrightRisks: [],
    trademarkRisk: brandHits ? '资料中含有品牌、Logo、授权或仿款相关表达，建议核验商标与授权链路。' : '未从已填写文字中发现明显品牌或 Logo 风险词，仍需人工核验图片标识。',
    designRisk: designHits ? '产品包含较明确的结构或外观特征，建议进行外观专利与设计注册检索。' : '现有资料未呈现强特征结构，但仅凭基础资料无法排除外观权利。',
    patentRisk: designHits >= 2 ? '存在多项功能结构描述，建议针对核心机构开展功能专利检索。' : '未发现足够信息确认功能专利风险，上架前仍建议按目标市场检索。',
    keywordRisk: keywordHits ? `发现 ${keywordHits} 个高关注表达，请删除仿款、品牌借势或未经授权的描述。` : '未发现明显高风险关键词。',
    countryRisk: '演示模式未连接各国专利与商标数据库。请根据计划销售站点，重点核验美国、欧盟、英国、阿联酋及产品来源国的有效权利。',
    suggestions: [
      '核验产品及包装上的品牌、Logo、角色和特殊符号。',
      '针对核心外观与功能结构，在目标销售市场进行人工专利检索。',
      '保留供应商授权、原创设计与图片使用证明。',
      keywordHits ? '修改高风险关键词，避免使用"同款""复刻"等表达。' : '补充更完整的材质、结构与包装信息后再次评估。',
    ],
    evidenceSources: [],
    serviceMessage: '当前使用演示分析模式；结果基于已填写资料，不包含全球专利或商标数据库检索。设置 AI 服务后可启用真实识别。',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** AI 模式：调用 DeepSeek 做真实识别；失败自动回退演示模式 */
export async function scanWithAI(productInfo, id, timestamp = new Date().toISOString()) {
  const base = createBasicRiskScan(productInfo, id, timestamp);
  try {
    const prompt = `你是一名知识产权侵权分析专家，针对亚马逊选品做商标/外观专利/版权/关键词/目标国风险分析。
仅返回 JSON，字段：riskLevel("low"|"medium"|"high")、riskScore(0-100)、identification{productType,features[],brandMarks[]}、
trademarkRisk、designRisk、patentRisk、keywordRisk、countryRisk、suggestions[](string数组)、evidenceSources[]({label,url})。
产品名称：${productInfo.name}
类目：${productInfo.category}
描述：${productInfo.description}`;
    const content = await chat([
      { role: 'system', content: '你是知识产权侵权分析专家，只返回 JSON，不要任何解释。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3 });

    const parsed = extractJSON(content);
    return {
      ...base,
      status: 'completed',
      mode: 'api',
      riskLevel: ['low', 'medium', 'high'].includes(parsed.riskLevel) ? parsed.riskLevel : base.riskLevel,
      riskScore: typeof parsed.riskScore === 'number' ? Math.min(100, Math.max(0, parsed.riskScore)) : base.riskScore,
      identification: parsed.identification || base.identification,
      trademarkRisk: parsed.trademarkRisk || base.trademarkRisk,
      designRisk: parsed.designRisk || base.designRisk,
      patentRisk: parsed.patentRisk || base.patentRisk,
      keywordRisk: parsed.keywordRisk || base.keywordRisk,
      countryRisk: parsed.countryRisk || base.countryRisk,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : base.suggestions,
      evidenceSources: Array.isArray(parsed.evidenceSources) ? parsed.evidenceSources : base.evidenceSources,
      serviceMessage: '已使用 AI 服务进行识别（基于已填写资料与模型判断，仍建议对目标市场做人工专利/商标检索复核）。',
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ...base, serviceMessage: `AI 识别失败（${e.message}），已回退演示模式结果。` };
  }
}
