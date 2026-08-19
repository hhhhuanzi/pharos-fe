import React from 'react';
import { Input } from 'antd';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function EventKeywordSearch(props: Props) {
  const { value, onChange, placeholder } = props;
  return <Input.Search allowClear value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onSearch={onChange} className='w-60' />;
}
