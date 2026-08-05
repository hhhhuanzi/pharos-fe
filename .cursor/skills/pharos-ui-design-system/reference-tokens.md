# Pharos 主题 Token 清单

来源：`src/theme/variable.css`（浅色 `:root` 196 个 / 深色 `.theme-dark` 181 个，共 197 个唯一 `--fc-*` 变量）
Tailwind 映射：`tailwind.config.js`

> 只列**该用的**语义变量与映射。写代码时优先查这张表；表里没有的，直接读 `src/theme/variable.css` 确认，不要臆造变量名。

## 1. 文字

| 变量 | 浅色 | 深色 | Tailwind | 用途 |
| --- | --- | --- | --- | --- |
| `--fc-text-1` | `#0c1018` | `rgb(242,242,242)` | `text-title` | 标题、主数值 |
| `--fc-text-2` | `#181c25` | `rgb(201,201,207)` | `text-main` | 正文 |
| `--fc-text-3` | `#3f4856` | `rgb(135,135,146)` | `text-hint` | 标签、辅助说明、表头 |
| `--fc-text-4` | `#657386` | `rgb(109,109,120)` | `text-soft` | 更弱的次要信息 |
| `--fc-text-5` | `#65738666` | `rgb(68,68,75)` | `text-disable` | 禁用态 |
| `--fc-text-link` | `#8162dc` | `#9470ff` | `text-link` | 链接 |
| `--fc-text-link-light` | `#a186f4` | — | — | tooltip 内加亮链接 |
| `--fc-text-placeholder` | `#bfbfbf` | `rgb(89,89,98)` | `text-placeholder` | 输入占位 |

## 2. 填充 / 背景（数字越大越重）

| 变量 | 浅色 | 深色 | Tailwind |
| --- | --- | --- | --- |
| `--fc-fill-1` | `252 252 253` | `12 12 14` | `bg-fc-50` |
| `--fc-fill-2` | `255 255 255` | `22 22 24` | `bg-fc-100` |
| `--fc-fill-2-5` | `249 249 250` | `27 27 29` | `bg-fc-150` |
| `--fc-fill-3` | `244 244 246` | `37 37 40` | `bg-fc-200` |
| `--fc-fill-4` | `234 234 236` | `39 39 42` | `bg-fc-300` |
| `--fc-fill-5` | `228 228 231` | `44 44 48` | `bg-fc-400` |
| `--fc-fill-6` | `220 220 224` | `49 49 53` | `bg-fc-500` |
| `--fc-fill-7` | `212 212 217` | `54 54 58` | `bg-fc-600` |

**卡片层级惯例**：页面底 fill-1 → 一级卡 `bg-fc-100` → 内嵌块 `bg-fc-50`。
每个 `--fc-fill-N` 都配套一个 `--fc-fill-N-rgb`（裸 `R G B`），供 `rgb(var(--x) / 0.4)` 调透明度用（`vite.config.ts` 的 table 变量就是这么写的）。

其它背景：`--fc-background-color-light`、`--fc-primary-bg`、`--fc-variable-fill-1`（灭火图一级卡 header）、`--fc-gradient-1-color`。

## 3. 状态色

| 变量 | 浅色 | 深色 | Tailwind（文字 / 背景） | 语义 |
| --- | --- | --- | --- | --- |
| `--fc-fill-success` | `0 167 0` | `33 196 93` | `text-success` / `bg-success` | 正常、健康、成功 |
| `--fc-fill-warning` | `250 200 0` | `245 194 10` | `text-warning` / `bg-warning` | 需关注、降级 |
| `--fc-fill-alert` | `250 125 0` | `240 110 10` | `text-alert` / `bg-alert` | 次高危 |
| `--fc-fill-error` | `200 0 0` | `239 67 67` | `text-error` / `bg-error` | 故障、失败 |
| `--fc-fill-primary` | `108 83 177` | `148 112 255` | `bg-primary` | 品牌主色 |
| `--fc-fill-gold` | `#ffbc0d` | 同 | — | 特殊标记 |

无数据 / 禁用不用状态色，用 `text-soft` / `text-disable`。

## 4. 边框与阴影

| 变量 | 说明 |
| --- | --- |
| `--fc-border-color` | 默认边框；全局 class `fc-border` 就是它 |
| `--fc-border-color2` | 略重的边框 |
| `--fc-border-base` | 更淡的分隔 |
| `--fc-antd-border-color` | 与 antd Button 连接处的边框（Tailwind `border-antd`） |
| `--fc-card-border` | 卡片边框（Tailwind `border-card-border`） |
| `--fc-border-radius-base` | `8px`，对应 `rounded-lg` |
| `--fc-boxshadow-base-color` / `--fc-boxshadow-hover-color` | 阴影色（深色模式是白色半透明）。仓库整体扁平风格，慎用 |

Less 侧有 mixin：`.boxShadowMixin` / `.boxHoverShadowMixin` / `.borderRadiusMixin`（`src/global.variable.less`，自动注入）。

## 5. 色阶（violet / indigo / red / orange / yellow / green）

每个色相 12 档，命名 `--fc-<hue>-1` … `--fc-<hue>-12`，Tailwind 映射为 `100`…`1200`（例：`bg-[var(--fc-violet-3)]` ≙ `bg-violet-300`）。

| 档位 | 性质 | 典型用途 |
| --- | --- | --- |
| 1–8 | 半透明叠加色（8 位 hex 带 alpha） | 背景底纹、hover 底色、选中态背景 |
| 9 | **主色**，配套 `-9-rgb` | 实心填充、图标、强调 |
| 10 | 主色加深 | hover / active |
| 11 | 文本用（深色模式下自动变亮） | 彩色文字 |
| 12 | 最强对比 | 深色底上的浅色文字 |

真实用法参考 `src/pages/alertRules/FormNG/components/RadioCard/index.tsx:24-28`（`bg-[var(--fc-violet-2)]` / `border-[var(--fc-violet-6)]` / `hover:border-[var(--fc-violet-7)]`）。

**另有一组老命名 `--fc-<hue>-N-color`**（`--fc-red-1-color` … `--fc-geekblue-6-color`，含 red/orange/gold/green/purple/geekblue 各 6 档，是 antd 传统色板的明暗两套）。老代码在用，新代码优先用上面的 1–12 档色阶。

## 6. 侧边栏专用（`SideMenu` 浅色态）

`--fc-sidemenu-bg` / `-border` / `-section-title` / `-item-icon` / `-item-text` / `-subitem-text` / `-item-active-bg` / `-item-active-text` / `-item-hover-bg` / `-item-hover-text` / `-beta-bg` / `-beta-text`，以及深色侧栏的 `--fc-menu-dark-bg` / `--fc-menu-dark-sub-bg`。仅侧边栏组件使用，业务页面不要引用。

## 7. Tailwind 尺度速查

**字号（整体替换了 Tailwind 默认，`text-lg`/`text-xl`/`text-2xl` 不存在）**

| class | font-size / line-height |
| --- | --- |
| `text-xs` | 10 / 12 |
| `text-sm` | 12 / 18 |
| `text-base` | 12 / 22 |
| `text-l1` | 14 / 22 |
| `text-l2` | 16 / 24 |
| `text-l3` | 18 / 28 |
| `text-l4` | 24 / 36 |
| `text-l5` | 28 / 42 |
| `text-l6` | 32 / 48 |
| `text-l7` | 36 / 54 |

**断点**：`xs`320 `sm`640 `md`768 `lg`1024 `xl`1280 `xl2`1440 `2xl`1536 `3xl`1680 `4xl`1920

**额外 spacing**：`3.5` = 14px、`4.5` = 18px

**自定义 variant**：`children:`(`& > *`)、`children-icon:`(`& > svg`)、`children-icon2:`(`& > .anticon > svg`)

**其它 extend**：`shadow-mf`、`bg-gradient-offer`、`animate-dot-pulse`、`ease-smooth`、`transition-width` / `-height` / `-spacing`、`font-default` / `font-bold-family`、`border-last`（`borderWidth` 的 `last` variant）

## 8. 图表色板（Canvas 拿不到 CSS 变量，走常量）

| 用途 | 位置 |
| --- | --- |
| 时序图默认色板 | `src/pages/dashboard/config.tsx` → `hexPalette`（`#7EB26D` `#EAB839` `#6ED0E0` `#EF843C` `#E24D42` …） |
| Stat 面板色板 | 同上 → `statHexPalette`（`PRIMARY_COLOR` `#3FC453` `#FF6A00` `#FF656B`） |
| ECharts 默认 | `src/utils/constant.ts` → `chartColor` |
| 色阶预设（热力/阈值） | `src/pages/dashboard/Components/ColorRangeMenu/config.ts` |
| 链路 span 颜色 | `src/pages/traceCpt/utils/color-generator.tsx` → `COLORS_HEX` |
| 轴标签 / 网格线 / plotLine | `src/theme/variableConfig.ts`（每项都注明与哪个 `--fc-*` 同步） |

新增图表颜色时：加到 `src/theme/variableConfig.ts` 并写明对应的 `--fc-*` 变量，不要在组件里散落 hex。
