import React from 'react';
import { Empty } from 'antd';

interface Props {
  description: string;
}

export default function TabEmpty({ description }: Props) {
  return (
    <div className='flex min-h-[240px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
    </div>
  );
}
