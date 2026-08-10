import _ from 'lodash';

import { TYPE_MAP } from '../constants';
import { Field } from '../ExplorerNG/types';

interface Mappings {
  [index: string]: {
    properties: {
      [key: string]:
        | {
            type: string;
          }
        | Mappings;
    };
  };
}

/**
 * 从单个索引的 `mappings` 节点里取出真正的 `properties`。
 *
 * ES 的 `_mapping` 响应在不同版本/不同建索引方式下，`properties` 的挂载位置不同：
 * - `doc`：ES 6.x 多 mapping type 时代的典型 type 名
 * - `_doc`：ES 7.x 过渡期单 mapping type 的固定名（8.x 索引如果是从 7.x reindex/沿用模板
 *   建的，仍可能带这层）
 * - 直接挂在 `properties` 下：ES 7.x+ 移除 mapping type 后的标准形态
 * - 挂在其它自定义 type 名下：早期 ES 5.x/6.x 允许自定义 type 名（如 `logs`），老索引
 *   经年累月保留至今并不罕见
 *
 * 只认 `doc`/`properties` 两种（早期实现的范围）会让第三、四种真实存在的响应形态被
 * 当成「没有字段」——`mappingsToFields`/`mappingsToFullFields` 曾经各自维护一份这个
 * 判断，前者没跟上后者的兼容范围，导致同一份 mapping 在两个函数下解析出的字段集合
 * 不一致（详见 `mappingsToFields` 与 `mappingsToFullFields` 调用处的说明）。收成一个
 * 函数，避免未来再次分裂成两份不同步的逻辑。
 */
function resolveMappingProperties(mappings: any): Record<string, any> | undefined {
  const properties = mappings?.doc?.properties ?? mappings?._doc?.properties ?? mappings?.properties;
  if (properties) return properties;
  const customType = Object.keys(mappings || {}).find((key) => key !== 'doc' && key !== '_doc' && key !== 'properties');
  return customType ? mappings[customType]?.properties : undefined;
}

export default function mappingsToFields(mappings: Mappings, type?: string) {
  const fields: string[] = [];
  _.forEach(mappings, (item: any) => {
    function loop(mappings, prefix = '') {
      _.forEach(resolveMappingProperties(mappings), (item, key) => {
        if (item.type) {
          if (TYPE_MAP[item.type] === type || !type) {
            fields.push(`${prefix}${key}`);
          }
        } else {
          loop(item, `${prefix}${key}.`);
        }
      });
    }
    loop(item.mappings);
  });
  return _.sortBy(_.union(fields));
}

export function mappingsToFullFields(
  mappings: Mappings,
  options: {
    type?: string;
    includeSubFields?: boolean;
  } = {
    includeSubFields: false,
  },
) {
  const fields: Field[] = [];
  _.forEach(mappings, (item: any) => {
    function loop(mappings, prefix = '') {
      _.forEach(resolveMappingProperties(mappings), (item, key) => {
        if (item.type) {
          if (options.includeSubFields && item.type === 'text' && item.fields) {
            fields.push({
              ...item,
              field: `${prefix}${key}`,
            });
            _.forEach(item.fields, (item, subkey) => {
              if (TYPE_MAP[item.type] === options?.type || !options?.type) {
                fields.push({
                  ...item,
                  field: `${prefix}${key}.${subkey}`,
                });
              }
            });
          } else if (TYPE_MAP[item.type] === options?.type || !options?.type) {
            fields.push({
              ...item,
              type: item.type === 'keyword' ? 'string' : item.type,
              field: `${prefix}${key}`,
            });
            if (options.includeSubFields && item.type === 'keyword') {
              fields.push({
                ...item,
                field: `${prefix}${key}.keyword`,
              });
            }
          }
        } else if (item.properties) {
          loop(item, `${prefix}${key}.`);
        }
      });
    }
    loop(item.mappings);
  });
  return _.sortBy(_.unionBy(fields, 'field'), 'field');
}
