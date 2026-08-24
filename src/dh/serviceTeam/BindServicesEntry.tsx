import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Empty, Input, Modal, Spin, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { CommonStateContext } from '@/App';
import { fetchServiceCatalog } from '@/dh/service';
import { JAEGER_LS, PROM_LS, pickDatasourceId, readStoredId } from '@/pages/service/storage';

import { fetchGroupServices, fetchServiceTeamVisibility, putGroupServices } from './api';
import { localCanManage } from './visibility';

interface Props {
  teamId?: string | number;
}

function uniqueSortedNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  names.forEach((raw) => {
    const name = raw.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  });
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export default function BindServicesEntry(props: Props) {
  const teamId = Number(props.teamId);
  const { t } = useTranslation('user');
  const { groupedDatasourceList, profile, perms } = useContext(CommonStateContext);
  const [canManage, setCanManage] = useState(() => localCanManage(profile, perms));
  const [boundNames, setBoundNames] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogNames, setCatalogNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchServiceTeamVisibility()
      .then((res) => {
        if (!cancelled) setCanManage(res.can_manage === true);
      })
      .catch(() => {
        if (!cancelled) setCanManage(localCanManage(profile, perms));
      });
    return () => {
      cancelled = true;
    };
  }, [profile, perms]);

  useEffect(() => {
    if (!Number.isFinite(teamId) || teamId <= 0) {
      setBoundNames([]);
      return;
    }
    let cancelled = false;
    fetchGroupServices(teamId)
      .then((res) => {
        if (cancelled) return;
        setBoundNames(res.service_names);
        if (res.can_manage) setCanManage(true);
      })
      .catch(() => {
        if (!cancelled) setBoundNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const resetModal = () => {
    setVisible(false);
    setSearch('');
    setSelected([]);
    setCatalogNames([]);
    setLoading(false);
    setSaving(false);
  };

  const openModal = () => {
    if (!Number.isFinite(teamId) || teamId <= 0) return;
    setVisible(true);
    setSearch('');
    setSelected(boundNames.slice());
    setLoading(true);
    const jaegerList = groupedDatasourceList.jaeger || [];
    const prometheusList = groupedDatasourceList.prometheus || [];
    const jaegerId = pickDatasourceId(jaegerList, readStoredId(JAEGER_LS));
    const promId = pickDatasourceId(prometheusList, readStoredId(PROM_LS));
    const end = Math.floor(Date.now() / 1000);
    const start = end - 3600;
    fetchServiceCatalog(promId, jaegerId, start, end)
      .then((res) => {
        const names = uniqueSortedNames(res.rows.map((row) => row.name));
        setCatalogNames(names);
      })
      .catch(() => {
        setCatalogNames([]);
        message.error(t('team.bind_services_catalog_failed'));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const options = useMemo(() => uniqueSortedNames([...catalogNames, ...boundNames, ...selected]), [boundNames, catalogNames, selected]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((name) => name.toLowerCase().includes(q));
  }, [options, search]);

  const onOk = () => {
    if (!Number.isFinite(teamId) || teamId <= 0) return;
    setSaving(true);
    putGroupServices(teamId, selected)
      .then((res) => {
        setBoundNames(res.service_names);
        message.success(t('team.bind_services_save_success'));
        resetModal();
      })
      .catch(() => {
        message.error(t('team.bind_services_save_failed'));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  if (!Number.isFinite(teamId) || teamId <= 0 || !canManage) {
    return null;
  }

  return (
    <>
      <Button onClick={openModal}>{t('team.bind_services')}</Button>
      <Modal
        title={t('team.bind_services_title')}
        visible={visible}
        confirmLoading={saving}
        onOk={onOk}
        onCancel={resetModal}
        destroyOnClose
        width={520}
      >
        <div className='flex flex-col gap-3'>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('team.bind_services_search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className='text-base text-hint'>{t('team.bind_services_selected', { num: selected.length })}</div>
          <div className='max-h-80 overflow-auto rounded-lg bg-fc-50 p-3 fc-border'>
            {loading ? (
              <div className='flex min-h-[160px] items-center justify-center'>
                <Spin />
              </div>
            ) : filtered.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('team.bind_services_empty')} />
            ) : (
              <Checkbox.Group className='flex w-full flex-col gap-2' value={selected} onChange={(vals) => setSelected(vals.map(String))}>
                {filtered.map((name) => (
                  <Checkbox key={name} value={name} className='w-full'>
                    <span className='text-base text-main' title={name}>
                      {name}
                    </span>
                  </Checkbox>
                ))}
              </Checkbox.Group>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
