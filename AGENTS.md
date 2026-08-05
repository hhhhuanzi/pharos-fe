# Codex Instructions

- Tech stack redlines (non-negotiable): React 17 + antd `4.21.0` (exact pinned version). Do NOT upgrade to antd 5, do NOT add `@ant-design/pro-components`, do NOT use ProTable / ProForm / ProCard / PageContainer / StatisticCard, do NOT add another large UI framework, and do NOT recommend Ant Design Pro. Reason: Pro Components track antd v5, the antd4-compatible releases are unmaintained, and an antd5 upgrade produces a huge diff that breaks our ability to merge `upstream/main`.
- Avoid antd 5-only APIs (`ConfigProvider theme`, `theme.useToken`, `Modal open`, `Tabs items`, `Dropdown menu`, ...); this repo is antd 4.
- For UI work, read `.cursor/skills/pharos-ui-design-system/SKILL.md` first (theme CSS variables, Tailwind/Less split, typography and spacing scales, dashboard card rules, pre-change checklist).
- After making code changes, do not run `npm run build` or `npx tsc` unless the user explicitly asks for it.
- If verification is useful, prefer lighter checks that are relevant to the changed files, or ask before running expensive project-wide commands.
- Prefer native type-checking APIs over lodash for type narrowing: use `Array.isArray` instead of `_.isArray`, `typeof x === 'number'` instead of `_.isNumber`, `x == null` instead of `_.isNil`, etc. Lodash type guard functions are not recognized by TypeScript when `@types/lodash` is unavailable, leaving `unknown` types un-narrowed.
