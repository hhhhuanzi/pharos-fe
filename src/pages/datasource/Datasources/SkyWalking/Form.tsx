import React from 'react';
import { Form, Card } from 'antd';
import { useTranslation } from 'react-i18next';
import { scrollToFirstError } from '@/utils';
import Name from '../../components/items/Name';
import HTTP from '../../components/items/HTTP';
import BasicAuth from '../../components/items/BasicAuth';
import SkipTLSVerify from '../../components/items/SkipTLSVerify';
import Headers from '../../components/items/Headers';
import Description from '../../components/items/Description';
import Footer from '../../components/items/Footer';

export default function FormCpt({ action, data, onFinish, submitLoading }: any) {
  const { t } = useTranslation('datasourceManage');
  const [form] = Form.useForm();

  return (
    <Form
      form={form}
      layout='vertical'
      onFinish={onFinish}
      onFinishFailed={() => {
        scrollToFirstError();
      }}
      initialValues={data}
      className='settings-source-form'
    >
      <Card title={t(`${action}_title`)}>
        <Name />
        <HTTP placeholder='http://localhost:12800' />
        <BasicAuth />
        <SkipTLSVerify />
        <Headers />
        <Description />
      </Card>
      <Footer id={data?.id} submitLoading={submitLoading} />
    </Form>
  );
}
