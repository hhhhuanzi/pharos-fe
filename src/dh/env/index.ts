/**
 * 环境维度（`deployment.environment.name`）的共享展示层。
 *
 * 原先只在服务列表 / 服务详情页用，从「链路查询支持环境维度」起链路列表也要展示同一个标签，
 * 所以下沉到 `src/dh/env`，两处共用同一份色板与大小写归一，不各留一份。
 *
 * 属性名常量与查询侧口径在 `src/dh/trace/env.ts`（对应后端 `pkg/dh/tracefetch/env.go`）。
 */
export { default as EnvTag } from './EnvTag';
export { formatEnv } from './format';
