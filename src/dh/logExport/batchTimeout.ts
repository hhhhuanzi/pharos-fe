/**
 * 单批请求的超时保护。
 *
 * 为什么需要自己实现：`src/utils/request.tsx` 基于 umi-request，而 umi-request 的
 * `timeout` 默认值是 `0`，此时它只 `Promise.race([cancel2Throw, fetch])` —— 没有任何
 * 计时器参与。也就是说不显式传 `timeout` 就等于「永不超时」。更关键的是 umi-request 的
 * `timeout` 走 `Promise.race`，只让 promise 提前 reject，**并不会真的中断底层 fetch**，
 * 于是超时后那个巨大的响应仍在后台继续下载，重试时会有两个大请求同时在飞。
 *
 * 所以这里用「派生 AbortController」：既转发上层（用户取消）的 signal，
 * 又在超时时真正 abort 掉底层 fetch，把连接和带宽立刻还回去。
 */

/** 超时导致的失败。与「网络错误 / ES 报错」区分开，供调用方决定是否自动缩小批次重试 */
export class BatchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'BatchTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

interface WithBatchTimeoutOptions {
  /** 上层（整场导出）的取消信号，abort 后本批也立即 abort */
  parentSignal: AbortSignal;
  timeoutMs: number;
  /** 超时错误的展示文案，由调用方用 i18n 生成 */
  timeoutMessage: string;
}

/**
 * 在派生出的、带超时的 signal 下执行 `fn`。
 *
 * - 上层 signal abort → 本批 abort，原始 AbortError 原样抛出（调用方靠
 *   `cancelledByUser` 区分是用户取消）。
 * - 超时 → 本批 abort，并把 AbortError 换成 `BatchTimeoutError`，
 *   否则调用方无法区分「用户点了取消」和「这批太慢」。
 */
export async function withBatchTimeout<T>(options: WithBatchTimeoutOptions, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const { parentSignal, timeoutMs, timeoutMessage } = options;
  const controller = new AbortController();
  let timedOut = false;

  const onParentAbort = () => controller.abort();
  if (parentSignal.aborted) {
    controller.abort();
  } else {
    parentSignal.addEventListener('abort', onParentAbort);
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fn(controller.signal);
  } catch (err) {
    // 上层取消优先：用户主动取消时即使恰好也到了超时点，也不该报成「超时」
    if (timedOut && !parentSignal.aborted) throw new BatchTimeoutError(timeoutMessage, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onParentAbort);
  }
}
