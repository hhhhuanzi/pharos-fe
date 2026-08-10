import mappingsToFields, { mappingsToFullFields } from './mappingsToFields';

/**
 * 复现导出弹窗「常用字段」与侧边栏不一致（9 vs 2）的真实根因：ES `_mapping` 响应把
 * `properties` 挂在 `_doc` 这一层下（ES 7.x 过渡期单 mapping type 的固定名，8.x 索引
 * 如果沿用旧模板/由旧版本 reindex 而来，仍会带这层），而 `mappingsToFields`（`getFields()`
 * 用，导出弹窗走这条）曾经只认 `doc`/`properties` 两种挂载位置，唯独不认 `_doc`，
 * 导致同一份 mapping 在它这里被解析成「没有任何字段」；`mappingsToFullFields`
 * （`getFullFields()` 用，侧边栏走这条）本身已经兼容 `_doc`，所以侧边栏一切正常，
 * 只有导出弹窗读到空数组，最终只剩下强制预填的 2 个 presetColumns。
 */
const K8S_POD_MAPPING_WITH_DOC_TYPE = {
  'k8s-pod-2026.08.09': {
    mappings: {
      _doc: {
        properties: {
          '@timestamp': { type: 'date' },
          time: { type: 'date' },
          log: { type: 'text' },
          cluster: { type: 'keyword' },
          kubernetes: {
            properties: {
              container_name: { type: 'keyword' },
              host: { type: 'keyword' },
              namespace_name: { type: 'keyword' },
              pod_name: { type: 'keyword' },
              labels: {
                properties: {
                  app: { type: 'keyword' },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('mappingsToFields / mappingsToFullFields：_doc 挂载的 mapping 解析一致性', () => {
  it('回归：mapping 挂在 _doc 下时，mappingsToFields 曾经解析不出任何字段（bug 复现）', () => {
    // 用没有 `_doc` 兼容分支时的旧逻辑复现问题：只认 doc/properties 两种挂载位置
    const legacyLoop = (mappings: typeof K8S_POD_MAPPING_WITH_DOC_TYPE) => {
      const fields: string[] = [];
      Object.values(mappings).forEach((item: any) => {
        function loop(m: any, prefix = '') {
          const properties = m?.doc?.properties || m?.properties;
          Object.entries(properties || {}).forEach(([key, value]: [string, any]) => {
            if (value.type) {
              fields.push(`${prefix}${key}`);
            } else {
              loop(value, `${prefix}${key}.`);
            }
          });
        }
        loop(item.mappings);
      });
      return fields;
    };
    expect(legacyLoop(K8S_POD_MAPPING_WITH_DOC_TYPE)).toEqual([]);
  });

  it('修复后：mappingsToFields 能正确解析 _doc 挂载的 mapping，拿到与 mappingsToFullFields 一致的字段集合', () => {
    const simple = mappingsToFields(K8S_POD_MAPPING_WITH_DOC_TYPE as any);
    const full = mappingsToFullFields(K8S_POD_MAPPING_WITH_DOC_TYPE as any).map((f) => f.field);

    const expected = ['@timestamp', 'cluster', 'kubernetes.container_name', 'kubernetes.host', 'kubernetes.labels.app', 'kubernetes.namespace_name', 'kubernetes.pod_name', 'log', 'time'];

    expect(simple.sort()).toEqual(expected);
    expect(full.sort()).toEqual(expected);
  });

  it('未挂 _doc（标准 ES 7.x+ 形态，properties 直接挂在 mappings 下）时两者一直是一致的，不受本次修复影响', () => {
    const mapping = {
      'k8s-pod-2026.08.09': {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            log: { type: 'text' },
          },
        },
      },
    };
    expect(mappingsToFields(mapping as any).sort()).toEqual(['@timestamp', 'log']);
    expect(
      mappingsToFullFields(mapping as any)
        .map((f) => f.field)
        .sort(),
    ).toEqual(['@timestamp', 'log']);
  });

  it('回归：自定义 type 名（早期 ES 5.x/6.x 允许自定义 mapping type，如 logs）也能解析', () => {
    const mapping = {
      'legacy-index': {
        mappings: {
          logs: {
            properties: {
              message: { type: 'text' },
            },
          },
        },
      },
    };
    expect(mappingsToFields(mapping as any)).toEqual(['message']);
  });

  it('type 过滤仍然生效：mappingsToFields 按 TYPE_MAP 过滤字段类型', () => {
    const mapping = {
      idx: {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            log: { type: 'text' },
          },
        },
      },
    };
    expect(mappingsToFields(mapping as any, 'date')).toEqual(['@timestamp']);
  });
});
