/* i18n-skip */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppButton,
  AppEmpty,
  AppField,
  AppForm,
  AppFormActions,
  AppIcon,
  AppInput,
  AppModal,
  AppSection,
  AppSelect,
  AppSwitch,
  AppTable,
  AppTabs,
  AppTag,
  AppTextarea,
} from '../../router-ui';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';
import './index.css';

const POLICY_OPTIONS = [
  { value: 'personal_first', label: '个人优先，社区服务回退' },
  { value: 'personal_only', label: '仅个人供应商' },
  { value: 'community_only', label: '仅社区服务' },
  { value: 'community_first', label: '社区服务优先' },
];

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'ali', label: 'Qwen' },
  { value: 'deepseek', label: 'DeepSeek' },
];

const emptyConnection = {
  name: '', protocol: 'openai', base_url: '', api_key: '', models_text: '', priority: 0, status: 1,
};

function parseModels(value) {
  return Array.from(new Set(String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean))).sort();
}

function PersonalRouting() {
  const [connections, setConnections] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routeModelOptions, setRouteModelOptions] = useState([]);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verifyingConnectionID, setVerifyingConnectionID] = useState('');
  const [form] = AppForm.useForm();
  const [routeForm] = AppForm.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connectionResponse, routeResponse, quotaResponse, modelsResponse] = await Promise.all([
        API.get('/api/v1/public/personal-provider/connections'),
        API.get('/api/v1/public/personal-provider/model-routes'),
        API.get('/api/v1/public/personal-provider/routing-quota'),
        API.get('/api/v1/public/user/models/available'),
      ]);
      if (!connectionResponse.data?.success) throw new Error(connectionResponse.data?.message);
      if (!routeResponse.data?.success) throw new Error(routeResponse.data?.message);
      if (!quotaResponse.data?.success) throw new Error(quotaResponse.data?.message);
      if (!modelsResponse.data?.success) throw new Error(modelsResponse.data?.message);
      setConnections(Array.isArray(connectionResponse.data?.data) ? connectionResponse.data.data : []);
      setRoutes(Array.isArray(routeResponse.data?.data) ? routeResponse.data.data : []);
      setQuota(quotaResponse.data?.data || null);
      setRouteModelOptions((Array.isArray(modelsResponse.data?.data) ? modelsResponse.data.data : [])
        .map((model) => String(model || '').trim())
        .filter(Boolean)
        .map((model) => ({ value: model, label: model })));
    } catch (error) {
      showError(error?.message || '加载个人路由失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load().then(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue(emptyConnection);
    setModalOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      api_key: '',
      models_text: Array.isArray(row.models) ? row.models.join('\n') : '',
    });
    setModalOpen(true);
  };

  const saveConnection = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        models: parseModels(values.models_text),
        status: values.status ? 1 : 2,
      };
      delete payload.models_text;
      if (!editing && !payload.api_key.trim()) {
        form.setFields([{ name: 'api_key', errors: ['请输入 API Key'] }]);
        return;
      }
      setSaving(true);
      const response = editing
        ? await API.put(`/api/v1/public/personal-provider/connections/${editing.id}`, payload)
        : await API.post('/api/v1/public/personal-provider/connections', payload);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess(editing ? '个人供应商已更新' : '个人供应商已添加');
      setModalOpen(false);
      load().then();
    } catch (error) {
      if (error?.errorFields) return;
      showError(error?.message || '保存个人供应商失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleConnection = async (row, checked) => {
    try {
      const response = await API.put(`/api/v1/public/personal-provider/connections/${row.id}`, {
        name: row.name, protocol: row.protocol, base_url: row.base_url,
        models: row.models, priority: row.priority, status: checked ? 1 : 2,
      });
      if (!response.data?.success) throw new Error(response.data?.message);
      load().then();
    } catch (error) { showError(error?.message || '更新连接状态失败'); }
  };

  const deleteConnection = async (row) => {
    try {
      const response = await API.delete(`/api/v1/public/personal-provider/connections/${row.id}`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('个人供应商已移除');
      load().then();
    } catch (error) { showError(error?.message || '移除个人供应商失败'); }
  };

  const verifyConnection = async (row) => {
    setVerifyingConnectionID(row.id);
    try {
      const response = await API.post(`/api/v1/public/personal-provider/connections/${row.id}/verify`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('连接和 API Key 验证通过');
      load().then();
    } catch (error) {
      showError(error?.message || '验证个人供应商失败');
      load().then();
    } finally {
      setVerifyingConnectionID('');
    }
  };

  const saveRoute = async () => {
    try {
      const values = await routeForm.validateFields();
      const response = await API.put('/api/v1/public/personal-provider/model-routes', values);
      if (!response.data?.success) throw new Error(response.data?.message);
      routeForm.resetFields();
      showSuccess('模型路由规则已保存');
      load().then();
    } catch (error) {
      if (!error?.errorFields) showError(error?.message || '保存模型路由失败');
    }
  };

  const deleteRoute = async (row) => {
    try {
      const response = await API.delete(`/api/v1/public/personal-provider/model-routes/${encodeURIComponent(row.model)}`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('模型路由规则已移除');
      load().then();
    } catch (error) { showError(error?.message || '移除模型路由失败'); }
  };

  const connectionColumns = useMemo(() => [
    { title: '连接', dataIndex: 'name', width: 210, render: (value, row) => <div className='personal-routing-connection-name'><strong>{value}</strong><span>{row.base_url || '使用官方地址'}</span></div> },
    { title: '协议', dataIndex: 'protocol', width: 150, render: (value) => <AppTag>{PROTOCOL_OPTIONS.find((item) => item.value === value)?.label || value}</AppTag> },
    { title: '模型范围', dataIndex: 'models', render: (models) => <span className='personal-routing-models'>{Array.isArray(models) ? models.join(', ') : '-'}</span> },
    { title: '优先级', dataIndex: 'priority', width: 92, align: 'right' },
    {
      title: '连接验证', dataIndex: 'last_checked_at', width: 176,
      render: (_, row) => {
        if (!row.last_checked_at) return <AppTag color='grey'>未验证</AppTag>;
        if (row.last_check_ok) return <div className='personal-routing-verification'><AppTag color='green'>已验证</AppTag><span>{timestamp2string(row.last_checked_at)}</span></div>;
        return <div className='personal-routing-verification'><AppTag color='red' title={row.last_check_error || '验证失败'}>验证失败</AppTag><span title={row.last_check_error || ''}>{row.last_check_error || timestamp2string(row.last_checked_at)}</span></div>;
      },
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (value, row) => <AppSwitch checked={value === 1} onChange={(_, detail) => toggleConnection(row, detail.checked)} /> },
    { title: '操作', key: 'actions', width: 190, render: (_, row) => <div className='personal-routing-actions'><AppButton type='text' loading={verifyingConnectionID === row.id} onClick={() => verifyConnection(row)}>测试连接</AppButton><AppButton type='text' onClick={() => openEdit(row)}>编辑</AppButton><AppButton type='text' danger onClick={() => deleteConnection(row)}>移除</AppButton></div> },
  ], [verifyingConnectionID]);

  const routeColumns = useMemo(() => [
    { title: '模型', dataIndex: 'model' },
    { title: '路由策略', dataIndex: 'route_policy', render: (value) => POLICY_OPTIONS.find((item) => item.value === value)?.label || value },
    { title: '操作', width: 96, render: (_, row) => <AppButton type='text' danger onClick={() => deleteRoute(row)}>移除</AppButton> },
  ], []);

  const providers = <AppSection className='personal-routing-section' title='我的供应商' extra={<AppButton color='blue' icon={<AppIcon name='plus' />} onClick={openCreate}>添加供应商</AppButton>}>
      <p className='personal-routing-section-hint'>测试连接只验证上游地址和 API Key，不会发起模型推理请求或消耗模型额度。修改协议、地址或 API Key 后需要重新验证。</p>
      <AppTable rowKey='id' columns={connectionColumns} dataSource={connections} loading={loading} scroll={{ x: 1120 }} locale={{ emptyText: <AppEmpty>还没有个人供应商</AppEmpty> }} />
  </AppSection>;

  const modelRoutes = <div className='personal-routing-stack'>
    <AppSection title='个人来源用量'>
      <div className='personal-routing-quota'><div><strong>{quota?.used_requests ?? 0}</strong><span>{quota?.period || '-'} 已使用请求</span></div><p>当前仅展示个人来源调用次数，不是套餐限额或收费项目。</p></div>
    </AppSection>
    <AppSection title='模型路由规则'>
      <p className='personal-routing-section-hint'>模型规则可指定来源优先级或收紧来源范围；API Token 设置为“仅个人供应商”或“仅社区服务”时，模型规则不能放宽该限制。</p>
      <AppForm form={routeForm} layout='vertical' className='personal-routing-rule-form'>
        <AppField label='模型' required><AppForm.Item name='model' rules={[{ required: true, message: '请选择模型' }]} noStyle><AppSelect options={routeModelOptions} search placeholder='选择当前账号可用模型' /></AppForm.Item></AppField>
        <AppField label='策略' required><AppForm.Item name='route_policy' initialValue='personal_first' noStyle><AppSelect options={POLICY_OPTIONS} /></AppForm.Item></AppField>
        <AppFormActions><AppButton color='blue' onClick={saveRoute}>保存规则</AppButton></AppFormActions>
      </AppForm>
      <AppTable rowKey='model' columns={routeColumns} dataSource={routes} loading={loading} pagination={false} locale={{ emptyText: <AppEmpty>未设置模型级规则，将使用 API Token 的默认策略</AppEmpty> }} />
    </AppSection>
  </div>;

  return <div className='dashboard-container personal-routing-page'>
    <AppTabs items={[{ key: 'providers', label: '我的供应商', children: providers }, { key: 'routes', label: '我的模型路由', children: modelRoutes }]} />
    <AppModal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? '编辑个人供应商' : '添加个人供应商'} size='small' footer={<AppFormActions><AppButton onClick={() => setModalOpen(false)}>取消</AppButton><AppButton color='blue' loading={saving} onClick={saveConnection}>保存</AppButton></AppFormActions>}>
      <AppForm form={form} layout='vertical' initialValues={emptyConnection}>
        <AppField label='连接名称' required><AppForm.Item name='name' rules={[{ required: true, message: '请输入连接名称' }]} noStyle><AppInput placeholder='例如 我的 OpenAI' /></AppForm.Item></AppField>
        <AppField label='上游协议' required><AppForm.Item name='protocol' noStyle><AppSelect options={PROTOCOL_OPTIONS} /></AppForm.Item></AppField>
        <AppField label='Base URL' hint='留空时使用该协议的官方地址；自定义地址仅支持 HTTPS 公网地址'><AppForm.Item name='base_url' noStyle><AppInput placeholder='https://api.example.com/v1' /></AppForm.Item></AppField>
        <AppField label={editing ? '轮换 API Key' : 'API Key'} required={!editing} hint={editing ? '留空则保留当前凭据' : '凭据将加密保存，之后不会再显示'}><AppForm.Item name='api_key' rules={editing ? [] : [{ required: true, message: '请输入 API Key' }]} noStyle><AppInput type='password' autoComplete='new-password' /></AppForm.Item></AppField>
        <AppField label='模型范围' required hint='每行一个模型，也支持逗号分隔'><AppForm.Item name='models_text' rules={[{ required: true, message: '至少填写一个模型' }]} noStyle><AppTextarea rows={4} placeholder={'gpt-5.1\ngpt-5.1-mini'} /></AppForm.Item></AppField>
        <AppField label='优先级'><AppForm.Item name='priority' noStyle><AppInput type='number' /></AppForm.Item></AppField>
        <AppField label='启用连接'><AppForm.Item name='status' valuePropName='checked' getValueProps={(value) => ({ checked: value === 1 || value === true })} getValueFromEvent={(_, detail) => detail.checked} noStyle><AppSwitch /></AppForm.Item></AppField>
      </AppForm>
    </AppModal>
  </div>;
}

export default PersonalRouting;
