import { BatchTimeoutError, withBatchTimeout } from './batchTimeout';

const TIMEOUT_MS = 30;

/** 永不 resolve，只在 signal abort 时 reject —— 模拟 fetch 的行为 */
function hangUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeOptions(parentSignal: AbortSignal) {
  return { parentSignal, timeoutMs: TIMEOUT_MS, timeoutMessage: '本批超时' } as const;
}

describe('withBatchTimeout', () => {
  it('在超时前完成时原样返回结果', async () => {
    const parent = new AbortController();
    await expect(withBatchTimeout(makeOptions(parent.signal), async () => 'ok')).resolves.toBe('ok');
  });

  /**
   * 核心回归测试：这正是首次生产验收「停在 10000 条、不报错也不结束」的成因 ——
   * umi-request 的 timeout 默认为 0，请求挂住时 promise 永久 pending。
   */
  it('请求挂住时抛 BatchTimeoutError，而不是永久 pending', async () => {
    const parent = new AbortController();
    await expect(withBatchTimeout(makeOptions(parent.signal), hangUntilAborted)).rejects.toThrow(BatchTimeoutError);
  });

  it('超时时真的 abort 掉底层请求，而不只是让 promise 提前 reject', async () => {
    const parent = new AbortController();
    let innerSignal: AbortSignal | undefined;
    await expect(
      withBatchTimeout(makeOptions(parent.signal), (signal) => {
        innerSignal = signal;
        return hangUntilAborted(signal);
      }),
    ).rejects.toThrow(BatchTimeoutError);
    expect(innerSignal?.aborted).toBe(true);
  });

  it('上层取消时抛原始 AbortError，不伪装成超时（调用方要靠这点区分用户取消）', async () => {
    const parent = new AbortController();
    const promise = withBatchTimeout(makeOptions(parent.signal), hangUntilAborted);
    parent.abort();
    await expect(promise).rejects.not.toBeInstanceOf(BatchTimeoutError);
  });

  it('上层在调用前就已取消时立刻中断，不发起真正的等待', async () => {
    const parent = new AbortController();
    parent.abort();
    let innerAbortedAtEntry: boolean | undefined;
    await expect(
      withBatchTimeout(makeOptions(parent.signal), (signal) => {
        innerAbortedAtEntry = signal.aborted;
        return hangUntilAborted(signal);
      }),
    ).rejects.not.toBeInstanceOf(BatchTimeoutError);
    expect(innerAbortedAtEntry).toBe(true);
  });

  it('成功返回后清掉计时器，不会事后再 abort（否则会误伤复用 signal 的后续逻辑）', async () => {
    const parent = new AbortController();
    let innerSignal: AbortSignal | undefined;
    await withBatchTimeout(makeOptions(parent.signal), async (signal) => {
      innerSignal = signal;
      return 'ok';
    });
    await sleep(TIMEOUT_MS * 2);
    expect(innerSignal?.aborted).toBe(false);
  });
});
