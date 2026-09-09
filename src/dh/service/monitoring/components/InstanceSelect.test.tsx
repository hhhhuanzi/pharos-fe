/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import InstanceSelect from './InstanceSelect';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const OPTIONS = [
  { value: 'pre-turms.turms-business-service-8f78ccd54-2mr88.turms-business-service', label: 'turms-business-service-8f78ccd54-2mr88' },
  { value: 'pre-turms.turms-business-service-8f78ccd54-v9dv2.turms-business-service', label: 'turms-business-service-8f78ccd54-v9dv2' },
] as const;

describe('InstanceSelect', () => {
  it('renders the select without a visible 当前 Pod label', () => {
    const { container } = render(<InstanceSelect value={OPTIONS[0].value} options={[...OPTIONS]} onChange={jest.fn()} />);

    expect(container.querySelector('.text-hint')).toBeNull();
    expect(screen.queryByText('monitoring.jvm.pod')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', 'monitoring.jvm.pod');
  });

  it('keeps the full pod name in the selected value and in every option', () => {
    render(<InstanceSelect value={OPTIONS[0].value} options={[...OPTIONS]} onChange={jest.fn()} />);

    expect(screen.getByTitle('turms-business-service-8f78ccd54-2mr88')).toHaveTextContent('turms-business-service-8f78ccd54-2mr88');
    expect(screen.queryByText(/8f7\.\.\./)).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect(screen.getByText('turms-business-service-8f78ccd54-v9dv2')).toBeInTheDocument();
  });
});
