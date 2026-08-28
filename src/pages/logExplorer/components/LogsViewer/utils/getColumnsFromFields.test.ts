import { ClampedFieldCell } from '@/dh/logExplorer';

import LogFieldValue from '../components/LogFieldValue';
import getColumnsFromFields from './getColumnsFromFields';

jest.mock('../components/LogFieldValue', () => ({
  __esModule: true,
  default: 'LogFieldValue',
}));

describe('getColumnsFromFields', () => {
  it('keeps field interactions when filtering is unavailable', () => {
    const columns = getColumnsFromFields({
      id_key: 'id',
      fields: ['message'],
      data: [{ id: '1', message: 'hello' }],
    });

    const cell = columns[0].formatter({ row: { id: '1', message: 'hello' } });

    expect(cell.type).toBe(ClampedFieldCell);
    expect(cell.props.children.type).toBe(LogFieldValue);
    expect(cell.props.children.props).toMatchObject({
      name: 'message',
      value: 'hello',
      rawValue: { id: '1', message: 'hello' },
    });
  });

  it('lets the last field fill remaining width', () => {
    const columns = getColumnsFromFields({
      id_key: 'id',
      fields: ['level', 'log'],
      colWidths: { level: 80, log: 600 },
      data: [{ id: '1', level: 'INFO', log: 'hello' }],
    });

    expect(columns[0].width).toBe(120);
    expect(columns[1].width).toBeUndefined();
    expect(columns[1].cellClass).toContain('n9e-log-field-cell');
  });
});
