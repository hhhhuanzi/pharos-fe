/** Jest 环境下 localStorage 不可用时的轻量 mock，供 fieldsSidebar 单测共用 */
export function installLocalStorageMock() {
  const storage: Record<string, string> = {};

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        Object.keys(storage).forEach((key) => delete storage[key]);
      },
    },
    configurable: true,
  });
}

installLocalStorageMock();
