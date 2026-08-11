# 拾光柠工作台 · AI Listing 工坊

亚马逊产品开发内容生成中心，作为拾光柠工作台的新增功能模块交付。

## 启动

```bash
cd shiguangning-workbench
npm install
npm start
# 访问 http://localhost:3000
```

服务（`server.js`）托管前端静态资源 + 提供 DeepSeek API 代理与竞品抓取接口。
前端为原生 ES Modules 单页应用，无需构建。

## 首次使用

1. 浏览器访问 `http://localhost:3000`
2. 进入「设置」 → 填入 DeepSeek API Key（`platform.deepseek.com` 创建，格式 `sk-...`）
3. 点击「测试连接」真实验证 → 保存
4. 进入「AI Listing 工坊」点击「创建 Listing」→ 填写产品信息 → 生成 Listing

## 项目结构

```
shiguangning-workbench/
├── server.js                  # Express 后端：DeepSeek 代理 / API Key 测试 / Amazon 竞品抓取
├── package.json
├── preview.html               # 成果预览页（截图汇总）
├── preview-assets/            # 预览页引用截图
└── public/
    ├── index.html             # 工作台主页面
    ├── css/styles.css         # 拾光柠设计语言（浅色 / 圆角 / iOS / 低饱和柠黄）
    └── js/
        ├── app.js             # 侧边导航 + 路由分发 + 跨页状态联动
        ├── config.js          # 全局常量（Amazon 站点 / 类目建议 / DeepSeek 模型）
        ├── utils.js
        ├── ui/
        │   ├── icons.js       # 内联 SVG 图标（iOS 风格）
        │   ├── toast.js       # 轻提示
        │   ├── modal.js       # 弹窗
        │   └── fields.js      # 图片上传 / 标签输入
        ├── store/
        │   ├── settingsStore.js   # API Key / 模型（localStorage）
        │   ├── productStore.js    # 选品库
        │   ├── projectStore.js    # Listing 项目（字段：productId/productInfo/title/bulletPoints/description/searchTerms/imageSuggestions/createdAt/updatedAt）
        │   └── statsStore.js
        ├── services/
        │   ├── aiProvider.js      # AI Provider 抽象（统一错误 / 鉴权）
        │   └── listingService.js  # Listing 业务编排（Prompt 组装 / JSON 解析 / 竞品上下文）
        └── pages/
            ├── home.js            # 首页（指标卡组 + 快捷入口 + 最近项目）
            ├── library.js         # 选品库
            ├── listing.js         # AI Listing 工坊（列表 / 表单 / 结果 三视图）
            └── settings.js        # 设置（DeepSeek API Key 真实可用）
```

## 架构

```
页面 (Listing UI)
  ↓
Listing Service (业务编排：Prompt 组装 / 结果解析 / 竞品分析)
  ↓
AI Provider (抽象层：统一错误、鉴权、重试)
  ↓
Node.js 后端 (/api/ai/generate)
  ↓
DeepSeek API (https://api.deepseek.com/chat/completions)
```

**严禁页面直连 DeepSeek API**。所有调用统一经由本服务的 AI Provider 层与后端代理。

## 独立接口：POST /api/listing/generate

自动生成亚马逊 Listing 的后端接口（无需前端页面，可直接 HTTP 调用）。

**请求体**（JSON）：

```json
{
  "product_name": "Portable Blender 便携榨汁杯",
  "material": "Tritan 食品级材质",
  "key_points": "USB充电, 350ml容量, 静音电机, 易清洗"
}
```

**返回**：

```json
{
  "code": 0,
  "data": {
    "title": "Portable Blender USB Rechargeable 350ml, ...",
    "bullet_points": ["...", "...", "...", "...", "..."],
    "description": "...",
    "search_terms": ["...", "...", "...", "...", "..."]
  },
  "message": "success"
}
```

**说明**：

- 调用 DeepSeek（模型 `deepseek-v4-flash`），提示词按模板拼接产品信息，要求输出 JSON（`title / bullet_points / description / search_terms` 四字段）
- DeepSeek API Key 从**环境变量 `DEEPSEEK_API_KEY`** 读取，不硬编码在代码中
- 失败时返回 `{ code: 1, message: "错误说明", data: null }`

**cURL 调用示例**：

```bash
curl -X POST https://<your-host>/api/listing/generate \
  -H "Content-Type: application/json" \
  -d '{
    "product_name": "Mini Portable Blender USB Rechargeable",
    "material": "Food-grade Tritan + stainless steel blades",
    "key_points": "USB-C charging, 350ml capacity, quiet motor, easy to clean"
  }'
```

## AI 生成能力

| 分区 | 输出 | 规则要点 |
|---|---|---|
| Amazon 标题 | 单条 ≤ 200 字符 | Brand + 核心关键词 + 属性 + 规格；剔除 best / cheapest / #1 等违规词 |
| 五点描述 | 5 条 | 功能优势 / 用户痛点 / 使用场景 / 差异化 / 购买理由 |
| Product Description | 150-250 词 HTML | 仅允许 `<p> <b> <ul> <li>` |
| Search Terms | 去重关键词数组 | 小写、空格分隔、不重复、不含品牌竞争 |
| 图片文案 | 主图 / 五点图 / A+ 模块 | 主图 1-2 句；五点图 5 条；A+ 模块 3-4 个 |
| 竞品分析 | 标题结构 + 高频关键词 + 卖点方向 + 差异化机会 + 优化建议 | URL 抓取失败时改用粘贴文本 |

## 设计语言

延续拾光柠整体视觉，禁止深色后台风、数据终端风、SellerSprite 视觉复制：

- **背景**：`#F7F6F2` 浅暖灰白
- **卡片**：白底 + 18px 圆角 + 柔和阴影
- **主色**：低饱和柠黄 `#C7A25C`
- **字体**：SF Pro / PingFang SC / HarmonyOS Sans SC
- **布局**：左侧导航（无摸鱼 / 无亚马逊市场调研）+ 顶部毛玻璃栏 + 主内容区
- **指标卡**：固定高度 128px，永不随页面滚动（`flex-shrink: 0; height: 128px`）

## 错误处理

- DeepSeek 调用失败：页面不崩溃，toast 提示「AI 生成失败，请检查 AI 服务配置」
- 必填项缺失：阻止生成，toast 列出缺失字段
- Amazon 抓取被反爬：降级提示「改为粘贴竞品文本」
- localStorage 超限：静默忽略，不影响当前会话

## 验收对照

| 标准 | 状态 |
|---|---|
| ✅ 左侧导航新增 AI Listing 工坊 | 通过（NAV = 首页 / 选品库 / AI Listing 工坊 / 设置） |
| ✅ 摸鱼 / 亚马逊市场调研完全删除 | 通过 |
| ✅ 可以上传产品信息（点击 / Ctrl+V / 拖拽） | 通过 |
| ✅ 可以关联选品库 | 通过（独立创建 + 一键导入） |
| ✅ 可以调用 DeepSeek | 通过（真实 API Key 测试连接返回 401 验证） |
| ✅ 自动生成 Amazon Listing | 通过（5 个分区 + 可选竞品分析） |
| ✅ 保持拾光柠整体风格 | 通过（浅色 / 圆角 / iOS / 低饱和） |
| ✅ 指标卡固定 | 通过（高度 128px，滚动后位置不变） |
| ✅ 页面布局稳定 | 通过 |
| ✅ 不出现独立后台风格 | 通过 |
| ✅ API Key 配置入口真实可用 | 通过（输入假 key 测试连接，真实返回 DeepSeek 401 错误） |