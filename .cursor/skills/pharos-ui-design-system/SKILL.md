---
name: pharos-ui-design-system
description: >-
  Pharos（Nightingale 二开 fork）前端 UI 设计规范：技术栈红线（React 17 + antd 4.21，禁 antd5 / 禁
  pro-components）、主题 CSS 变量与明暗切换、Tailwind 与 Less 分工、antd 4 现实约束、排版与间距密度档位、指标与
  Dashboard 卡片规范、改动前自检清单。Use when 在 pharos-fe 中新增或修改页面、组件、样式、Tailwind class、Less
  文件、表格列表页、Dashboard/大盘卡片，或当用户提到 UI 优化、界面美化、设计规范、组件库选型、antd 升级、Ant Design Pro 时。
---

# Pharos UI Design System

本仓库 `pharos-fe` 是 Nightingale 前端的长期 fork（产品名 Pharos，产品分支 `feature_link`）。
**核心约束：随时能 `merge upstream/main` 且冲突面尽量小。** 所以 UI 优化只走「提升设计规范」，绝不走「替换技术栈」。

## 0. 技术栈红线（不可违反）

- React 17（实际 `17.0.2`）
- antd **4.21.0**（`package.json` 里是锁死的精确版本，不带 `^`）
- **不升级 antd 5**
- **不引入 `@ant-design/pro-components`**
- **不使用 ProTable / ProForm / ProCard / PageContainer / StatisticCard**
- 不引入新的大型 UI 框架
- 不要再推荐 Ant Design Pro

不推荐 Ant Design Pro 的原因（备查）：

1. Pro Components 主线依赖 antd v5；
2. 兼容 antd4 的老版本已停止维护；
3. 升级 antd5 会造成大范围 diff，破坏 upstream merge 能力；
4. 官方页面是上游高频修改区，用 Pro 组件重写会大幅增加长期维护成本。

**替代做法**：把 Pro 组件带来的观感提升，用「本仓库既有的 Tailwind 映射 + CSS 变量 + 固定间距档位」复刻，落在自有目录/新增文件里（见 `.cursor/rules/dh-second-dev.mdc`）。

## 1. 主题与颜色

### 变量在哪、怎么切

- 全部颜色 token 在 `src/theme/variable.css`，共 **197 个 `--fc-*` 变量**：浅色 196 个定义在 `:root`，深色 181 个在 `.theme-dark` 覆盖同名变量；另有 `.theme-light-gold` / `.theme-light-blue` 只覆盖少量品牌变量。
- 切换方式：`src/App.tsx:327` 直接改 body 类名 —— `document.body.className = darkMode ? 'theme-dark' : 'theme-light'`。
- antd 深色皮肤是预编译产物 `src/theme/antd.dark.less`，整份包在 `.theme-dark { ... }` 里。**不要手改这三个 `antd.*.less`（每个 600KB+）。**

### 三条硬规则

1. **禁止硬编码色值**。不写 `#333`、`rgba(0,0,0,.65)`、`text-[#f5222d]`、`bg-white`、`style={{ color: '#52c41a' }}`。
2. **优先用 Tailwind 语义类**（`text-title` / `bg-fc-100` / `text-success`），Tailwind 没映射时才写 `bg-[var(--fc-violet-3)]`，最后才是 Less 里 `var(--fc-*)`。
3. **不要写 `dark:` 变体**。`tailwind.config.js` 里 `darkMode: 'class'`，但挂到 body 的类名是 `theme-dark` 而不是 `dark`，所以 Tailwind 的 `dark:` 在本仓库**完全不生效**（`src/` 下 0 处使用，可自行 grep 验证）。深色适配靠 CSS 变量自动切换即可。

### 常用语义分组（完整清单见 [reference-tokens.md](reference-tokens.md)）

| 用途 | CSS 变量 | Tailwind |
| --- | --- | --- |
| 文字 主/正文/辅助/更弱/禁用 | `--fc-text-1` … `--fc-text-5` | `text-title` `text-main` `text-hint` `text-soft` `text-disable` |
| 链接 / 占位 | `--fc-text-link` / `--fc-text-placeholder` | `text-link` / `text-placeholder` |
| 填充（越大越重） | `--fc-fill-1` … `--fc-fill-7` | `bg-fc-50` `bg-fc-100` `bg-fc-150` `bg-fc-200` … `bg-fc-600` |
| 状态 成功/警告/次高危/危险 | `--fc-fill-success` `--fc-fill-warning` `--fc-fill-alert` `--fc-fill-error` | `text-success` `text-warning` `text-alert` `text-error`（背景同名 `bg-*`） |
| 品牌主色 | `--fc-fill-primary` / `--fc-primary-color` | `bg-primary` |
| 边框 | `--fc-border-color` `--fc-card-border` `--fc-antd-border-color` | `fc-border`（全局 class）/ `border-card-border` |
| 圆角基准 | `--fc-border-radius-base: 8px` | `rounded-lg` |

**注意状态色有 4 档**：`success`(绿) / `warning`(黄) / `alert`(橙) / `error`(红)。别把 `alert` 当成"告警统称"，它是介于警告和危险之间的一档。

### Canvas / 图表例外

Canvas 读不到 CSS 变量。图表颜色统一在 `src/theme/variableConfig.ts` 手工同步（该文件里每个常量都带 `/** 与 variable.css --fc-text-3 同步 */` 这类注释）。新增图表色时照此模式加常量并写明对应变量，不要在组件里散落 hex。
时序图色板用 `src/pages/dashboard/config.tsx` 的 `hexPalette` / `statHexPalette`，不要另起数组。

## 2. Tailwind 与 Less 分工

### tailwind.config.js 的关键设置（会影响写法，必须知道）

- **`important: true`** —— 所有 Tailwind 工具类都自带 `!important`。后果：Tailwind 天然压过普通 Less；Less 想赢必须自己写 `!important`（`src/theme/default.less` 大量这么干）。因此**同一属性被两边同时控制时极难排查，必须避免**。className 里再加 `!` 前缀（`!bg-transparent`）多数是冗余的，不要新增。
- **`corePlugins.preflight: false`** —— 没有浏览器默认样式重置（为了不和 antd 打架）。后果：`h1~h6`、`p`、`ul` 保留浏览器默认 margin / list-style。**不要裸用 `<h3>` 当区块标题**，用 `<div className='text-l2 font-bold text-title'>`。
- **`theme.fontSize` 是整体替换而非 extend** —— Tailwind 默认字号档位**全部失效**：没有 `text-lg` / `text-xl` / `text-2xl`。可用档位只有：
  `text-xs`(10/12) `text-sm`(12/18) `text-base`(12/22) `text-l1`(14/22) `text-l2`(16/24) `text-l3`(18/28) `text-l4`(24/36) `text-l5`(28/42) `text-l6`(32/48) `text-l7`(36/54)。
  注意 **`text-base` 是 12px 不是 16px**（与 antd `font-size-base: 12px` 对齐）。
- `theme.screens` 同样是替换：`xs`320 `sm`640 `md`768 `lg`1024 `xl`1280 `xl2`1440 `2xl`1536 `3xl`1680 `4xl`1920。
- `spacing` extend 了 `3.5`(14px) 和 `4.5`(18px)，仅用于对齐 antd 表单节奏。
- 自定义 variant：`children:`(`& > *`)、`children-icon:`(`& > svg`)、`children-icon2:`(`& > .anticon > svg`)。
- `content` 只扫 `./src/**/*.{html,js,jsx,ts,tsx}`；类名必须是**完整静态字符串**，`text-${level}` 这种拼接不会被生成。

### 优先 Tailwind

容器布局（`flex` / `grid` / `gap` / 间距 / 对齐）、文字层级、状态色、圆角、`hover:` / `focus:` / `disabled:`、仅当前组件用的展示样式。

### 覆盖 antd 深层节点：优先用任意变体，不要新开 Less

仓库真实写法，可直接照抄：

```tsx
// src/pages/alertRules/FormNG/components/RadioCard/index.tsx:24-28
'border border-solid border-[var(--fc-border-color)] rounded-lg bg-[var(--fc-fill-1)]',
'[&_.ant-radio]:top-0.5 [&_.ant-radio]:shrink-0',
'[&.ant-radio-wrapper-checked]:border-[var(--fc-violet-6)] [&.ant-radio-wrapper-checked]:bg-[var(--fc-violet-2)]',
```

```tsx
// src/pages/oauthConsent/index.tsx:126
<Card className='w-[460px] [&>.ant-card-body]:p-7' />
```

className 过长时抽成本地常量字符串（见 `src/pages/alertRules/FormNG/components/Sidebar/RuleSummary.tsx:195`），**不要为此退回大段 Less**。

### 什么时候才写 Less

- 全局/跨页复用的 token、keyframes、伪元素、滚动条样式；
- 需要 `:not()` / 兄弟选择器 / 深层结构的复杂覆盖；
- 一次要覆盖 antd 内部多个节点且任意变体已经写不下。

Less 侧要求：选择器收束在模块根类名下、嵌套 ≤3 层。仓库有 189 个 `.less` 且**没有 CSS Modules**（0 个 `*.module.less`），所以类名必须自带前缀（`n9e-` 或页面名）防全局污染。

### 改 antd 全局观感请改这里，别到处 `!important`

antd Less 变量统一在 `vite.config.ts` 的 `css.preprocessorOptions.less.modifyVars`，已定制：
`primary-color: #6C53B1`、`font-size-base: 12px`、`border-radius-base: 8px`、`form-item-margin-bottom: 18px`、`btn-padding-horizontal-base: 12px`，以及整套 `table-*`（`table-padding-vertical: 16px`、`table-header-bg: var(--fc-fill-2-5)`、`table-row-hover-bg` 等）。
Less 全局变量 `src/global.variable.less` 由 vite `additionalData` 自动注入每个 `.less`，无需 import 即可用 `@primary-color`、`@basePadding`。

### 可复用的全局 class（优先复用，别重造）

定义在 `src/theme/index.less` 与 `src/theme/default.less`：
`fc-border`（1px + `--fc-border-color`）、`best-looking-scroll`（hover 才显示的细滚动条）、`n9e-antd-table-height-full`、`n9e-base-shadow`、`n9e-modal-with-tabs`、`n9e-collapse-advanced-settings`、`n9e-table-last-row-no-border`。
`src/theme/deprecated.less` 里的 `n9e-fill-color-*` / `n9e-border-base` 已标注废弃，**新代码不要用**。

## 3. antd 4.21 现实约束

已装版本：`antd 4.21.0`、`@ant-design/icons 4.8.3`、`react 17.0.2`、日期库是 **moment**（不是 dayjs）。

- **没有 CSS-in-JS 与 design token 体系**。主题定制只能走「Less 变量（`modifyVars`）+ CSS 变量（`--fc-*`）」两条路。
- **`ConfigProvider` 不接受 `theme`**。本仓库 `ConfigProvider` 只用来传 `locale`（`src/App.tsx:343`、`src/components/ModalHOC.tsx:35`）。antd4 虽有 `ConfigProvider.config({ theme: { primaryColor } })`，但它依赖 `antd/dist/antd.variable.less`，而 `src/App.tsx:22` 引的是 `antd/dist/antd.less` —— **这条路走不通，不要尝试**。
- antd4 `ConfigProvider` 可用的是：`locale` / `componentSize` / `direction` / `getPopupContainer` / `renderEmpty` / `virtual` / `dropdownMatchSelectWidth` / `form.validateMessages` / `autoInsertSpaceInButton`。

### antd5-only API 黑名单（会报错或静默失效）

| 不能用（antd5） | 本仓库正确写法（antd4） |
| --- | --- |
| `ConfigProvider theme={{ token }}` / `theme.useToken()` | `modifyVars` + `--fc-*` 变量 |
| `<App />` 包裹 / `App.useApp()` | 直接用 `message` / `Modal` 静态方法 |
| `Modal open` | `Modal visible` |
| `Tabs items={[...]}` | `<Tabs><Tabs.TabPane /></Tabs>` |
| `Dropdown menu={{ items }}` | `Dropdown overlay={<Menu />}` |
| `Select popupMatchSelectWidth` | `dropdownMatchSelectWidth` |
| `FloatButton` / `Tour` / `QRCode` / `Watermark` / `Splitter` | 不存在，自己实现或换方案 |
| dayjs 传给 `DatePicker` | moment |

**4.21 已经有的**（放心用）：`Form.useWatch`、`Form.useFormInstance`、`Segmented`、`Table` 的 `expandable` / `rowSelection`。

### Table / Form 落地写法

- Table 一律 `size='small'`。
- 固定表头不用 `sticky`（仓库无此用法），统一：外层 `n9e-antd-table-height-full` + `scroll={{ y: 'calc(100% - 38px)' }}`（真实例：`src/pages/hosts/pages/List/List.tsx:421`）。
- 表格外框已由 `src/theme/default.less:59-62` 强制 `border + border-radius: 8px`，**不要再包一层 `fc-border`**。
- 单元格 padding 已由 `modifyVars` 统一，不要手写。
- Form.Item 间距由 `form-item-margin-bottom: 18px` 统一，**不要给 Form.Item 加 `mb-*`**。
- 联动校验用 `dependencies` + `validator`（`src/pages/warning/shield/components/operateForm.tsx:404-420`）；动态项用 `Form.List` + `Form.Item shouldUpdate noStyle`（`src/plugins/victorialogs/AlertRule/Queries/index.tsx:33-56`）。
- 图标：`import { SearchOutlined } from '@ant-design/icons'`（v4 包，不要装 v5）。

## 4. 排版与密度

### Typography 层级

| 角色 | class | 说明 |
| --- | --- | --- |
| 页面标题 | 由 `PageLayout` 的 `title` 提供 | 不要自己造页头（`src/components/pageLayout`） |
| 区块 / 卡片标题 | `text-l2 font-bold text-title` | 16px |
| 次级区块标题 | `text-l1 font-bold text-title` | 14px |
| 正文 | `text-base text-main` | 12px，与 antd 全局一致 |
| 辅助说明 / 标签 | `text-base text-hint`（更弱用 `text-soft`） | |
| 主数值 | `text-l4 font-bold text-title leading-none` | 24px；超大用 `text-l5` / `text-l6` |
| 数值单位、后缀 | `text-base text-hint ml-1` | 不与数值同权重 |

字重只用三档：`font-normal` / `font-medium` / `font-bold`。不要混用 `font-semibold` 和 `font-bold` 表达同一层级。

### Spacing 固定档位

**只允许 4 / 8 / 12 / 16 / 24 px**（Tailwind `1` `2` `3` `4` `6`）；`3.5`(14px) 和 `4.5`(18px) 仅用于对齐 antd 表单。禁止 `p-[13px]`、`mt-[7px]` 这类任意值。

| 场景 | 档位 |
| --- | --- |
| 页面内容区 padding | `PageLayout` 已给 `16px 6px 16px 16px`，页面里**不要再加外层 padding** |
| 区块之间 | `mb-4` 或父容器 `flex flex-col gap-4` |
| 工具栏 → 表格 | `mt-4` |
| 卡片内 padding | `p-4`；内嵌子块 `p-3` |
| 卡片内标题 → 内容 | `mb-3` |
| 栅格 gutter | `8` 或 `16` |
| 图标 → 文字 | `gap-2` |
| 表单行距 | 由 `form-item-margin-bottom` 统一，不要手加 |

### 列表页 / 表格页密度

骨架照抄（合成自 `src/pages/hosts/pages/List/List.tsx:252-256,421`）：

```tsx
<PageLayout title={t('title')} icon={<DatabaseOutlined />}>
  <div className='flex flex-wrap justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
    <Space wrap>{/* 左：筛选与搜索 */}</Space>
    <Space wrap>{/* 右：主操作 */}</Space>
  </div>
  <div className='mt-4 n9e-antd-table-height-full'>
    <Table size='small' scroll={{ y: 'calc(100% - 38px)' }} {...rest} />
  </div>
</PageLayout>
```

- 状态列、操作列固定宽度，正文列自适应；
- 操作列用 `type='link'` 文字按钮 + `Space`，不要一排实体 `Button`；
- 空态用 antd `Empty`；加载态用 Table 自带 `loading`，不要外面再套 `Spin`；
- 长文本 `truncate` + `title` 属性，不要换行撑高行。

## 5. 指标与 Dashboard 卡片规范

这是目前最需要提升的部分（现状「丑和简陋」）。以下六条为硬规范。

**正面示范**（`src/pages/hosts/pages/List/StatsCards.tsx:52-68`，可直接照抄结构）：

```tsx
<Row gutter={16}>
  <Col span={6}>
    <div className='fc-border flex h-[164px] flex-col rounded-lg bg-fc-100 p-4'>
      <div className='mb-3 shrink-0 text-base font-normal leading-none text-hint'>{t('count')}</div>
      <div className='min-h-0 flex-1'>
        <div className='mb-3 text-l4 font-bold leading-none text-title'>{numberToLocaleString(stats?.count)}</div>
        <Row gutter={8}>
          <Col span={12}>
            <div className='flex h-[66px] items-center rounded-lg bg-fc-50 p-3'>
              <div className='min-w-0 flex-1'>
                <div className='truncate text-hint' title={t('alive_count')}>{t('alive_count')}</div>
                <div className='font-bold text-title'>{numberToLocaleString(stats?.alive_count)}</div>
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </div>
  </Col>
</Row>
```

1. **数值大、标签小而弱**。主数值 `text-l4 font-bold text-title leading-none`；标签 `text-base font-normal text-hint`。标签在上、数值在下（先说是什么再给数字），同一屏保持一致方向。
2. **相关指标归进同一张卡，不要平铺成一堆小方块**。一张一级卡 = 1 个主数值 + 2~4 个从属分解指标（内嵌 `rounded-lg bg-fc-50 p-3`）。一屏顶多 3~4 张一级卡（`Col span={6}` 或 `span={8}`），不要 6 个各自独立的 `Col span={4}`。
3. **层级用填充色，不用阴影**。页面底 fill-1 → 一级卡 `bg-fc-100`(fill-2) → 内嵌块 `bg-fc-50`(fill-1)，配 `fc-border rounded-lg`。这套明暗主题下都自动成立。仓库整体是扁平边框风格，不要加 `box-shadow` 做浮起。
4. **状态用语义色 + 文字，颜色不单独承载信息**。必须同时有文字或图标；色值只能取 `text-success` / `text-warning` / `text-alert` / `text-error`。
   正常健康 → success；需关注/降级 → warning；次高危 → alert；故障失败 → error；无数据/禁用 → `text-soft` 或 `text-disable`。
   **不要用灰色表示"正常"**（灰色只表示"无数据"）。
5. **数值格式统一**。千分位用 `numberToLocaleString`；单位与百分号用 `text-hint` 小字紧跟；空值渲染 `-`，不要渲染 `0` 或留白。
6. **对齐与留白**。同一行卡片等高（显式 `h-[...]` 或 flex 拉伸）；数值与标签左边缘对齐；卡内竖向节奏固定 `p-4` + `mb-3`。

**反面案例，不要复制**：

- `src/pages/explorer/components/FieldsList/FieldsItem.tsx:84-97` —— 裸 `<Statistic />` 不带定制 class，字号颜色全跟 antd 默认，和页面其它数值对不齐。对照新实现 `src/pages/logExplorer/components/FieldsList/FieldsItem.tsx:141-146` 加了 `n9e-logexplorer-field-statistic`。
- `src/pages/notificationRules/pages/Detail/index.tsx:145` —— `style={{ color: x < 0 ? 'var(--fc-fill-success)' : 'var(--fc-fill-error)' }}`。能用 Tailwind 语义类就不要写 inline style。

## 6. 改动前自检清单

每次动 UI 前逐条过：

```
- [ ] 是否可以通过 extension 实现？（新增文件 / 自有目录，而不是改官方文件）
- [ ] 是否会增加 upstream merge 冲突？
- [ ] 是否必须修改官方代码？若必须，是否只留了「薄入口」（一行注册 / 一行 import）？
- [ ] 是否符合 antd4 + React17 约束？（对照第 3 节 antd5-only 黑名单）
- [ ] Tailwind 与 Less 是否在争抢同一属性？（`important: true`，冲突极难排查）
- [ ] 明暗主题是否都验证过？（切 body `theme-dark`；没写 `dark:` 变体）
- [ ] 是否硬编码了色值？（只允许 `--fc-*` 变量与其 Tailwind 映射）
- [ ] 字号是否只用了 xs/sm/base/l1~l7？间距是否只用了 4/8/12/16/24？
```

## 参考

- 完整 CSS 变量清单与 Tailwind 映射：[reference-tokens.md](reference-tokens.md)
- 二开隔离规范（remotes / 分支 / 落点）：`.cursor/rules/dh-second-dev.mdc`
- Tailwind 与 Less 分工基础版：`.cursor/rules/tailwind-usage.mdc`
