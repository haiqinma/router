/* i18n-skip */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppAlert,
  AppButton,
  AppEmpty,
  AppField,
  AppForm,
  AppFormActions,
  AppIcon,
  AppInput,
  AppInputNumber,
  AppModal,
  AppSection,
  AppSelect,
  AppTable,
  AppTabs,
  AppTag,
  AppTextarea,
} from '../../router-ui';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';
import './index.css';

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'ali', label: 'Qwen' },
  { value: 'deepseek', label: 'DeepSeek' },
];
const ENDPOINT_OPTIONS = [
  { value: '/v1/chat/completions', label: '对话' },
  { value: '/v1/responses', label: 'Responses' },
  { value: '/v1/embeddings', label: 'Embeddings' },
];
const STATUS_COLOR = { draft: 'grey', reviewing: 'orange', active: 'green', ready: 'green', published: 'green', accrued: 'blue', held: 'orange', settled: 'green', reversed: 'red', restricted: 'orange', suspended: 'red', rejected: 'red', offline: 'red' };
const STATUS_LABEL = { draft: '草稿', reviewing: '审核中', active: '已通过', ready: '已就绪', published: '已发布', accrued: '待结算', held: '已冻结', settled: '已结算', reversed: '已冲销', restricted: '受限', suspended: '已暂停', rejected: '已驳回', offline: '已下线' };
const emptyService = { name: '', protocol: 'openai', base_url: '', api_key: '', region: '', data_policy: '{\n  "retention": "none",\n  "training_usage": "prohibited"\n}', capacity_policy: '{\n  "max_concurrency": 8\n}', models_text: '', endpoint: '/v1/chat/completions' };
const emptyOffer = { service_id: '', model: '', scope: 'public', currency: 'USD', input_price_micros: 0, output_price_micros: 0 };

const statusTag = (value) => <AppTag color={STATUS_COLOR[value] || 'grey'}>{STATUS_LABEL[value] || value || '-'}</AppTag>;
const parseModels = (value, endpoint) => Array.from(new Set(String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean))).map((model) => ({ model, upstream_model: model, endpoint, metering_unit: 'token' }));

function PublisherWorkspace() {
  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [offers, setOffers] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceModal, setServiceModal] = useState(false);
  const [offerModal, setOfferModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [editingOffer, setEditingOffer] = useState(null);
  const [verifyingID, setVerifyingID] = useState('');
  const [profileForm] = AppForm.useForm();
  const [serviceForm] = AppForm.useForm();
  const [offerForm] = AppForm.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResponse, serviceResponse, offerResponse, settlementResponse] = await Promise.all([
        API.get('/api/v1/public/publisher/profile'),
        API.get('/api/v1/public/publisher/services'),
        API.get('/api/v1/public/publisher/offers'),
        API.get('/api/v1/public/publisher/settlements'),
      ]);
      for (const response of [profileResponse, serviceResponse, offerResponse, settlementResponse]) {
        if (!response.data?.success) throw new Error(response.data?.message || '加载发布者工作区失败');
      }
      setProfile(profileResponse.data?.data || null);
      setServices(Array.isArray(serviceResponse.data?.data) ? serviceResponse.data.data : []);
      setOffers(Array.isArray(offerResponse.data?.data) ? offerResponse.data.data : []);
      setSettlements(Array.isArray(settlementResponse.data?.data) ? settlementResponse.data.data : []);
      profileForm.setFieldsValue(profileResponse.data?.data || { display_name: '', contact_email: '' });
    } catch (error) { showError(error?.message || '加载发布者工作区失败'); }
    finally { setLoading(false); }
  }, [profileForm]);

  useEffect(() => { load().then(); }, [load]);

  const saveProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      setSaving(true);
      const response = await API.put('/api/v1/public/publisher/profile', values);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('发布者资料已保存');
      load().then();
    } catch (error) { if (!error?.errorFields) showError(error?.message || '保存发布者资料失败'); }
    finally { setSaving(false); }
  };

  const submitApplication = async () => {
    try {
      const response = await API.post('/api/v1/public/publisher/applications');
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('发布者申请已提交');
      load().then();
    } catch (error) { showError(error?.message || '提交申请失败'); }
  };

  const openService = (row = null) => {
    setEditingService(row);
    serviceForm.setFieldsValue(row ? {
      ...row,
      api_key: '',
      models_text: (row.models || []).map((model) => model.model).join('\n'),
      endpoint: row.models?.[0]?.endpoint || '/v1/chat/completions',
      data_policy: row.data_policy || '{}',
      capacity_policy: row.capacity_policy || '{}',
    } : emptyService);
    setServiceModal(true);
  };

  const saveService = async () => {
    try {
      const values = await serviceForm.validateFields();
      const payload = {
        ...values,
        data_policy: JSON.parse(values.data_policy || '{}'),
        capacity_policy: JSON.parse(values.capacity_policy || '{}'),
        models: parseModels(values.models_text, values.endpoint),
      };
      delete payload.models_text;
      delete payload.endpoint;
      if (!editingService && !payload.api_key.trim()) {
        serviceForm.setFields([{ name: 'api_key', errors: ['请输入 API Key'] }]);
        return;
      }
      setSaving(true);
      const response = editingService
        ? await API.put(`/api/v1/public/publisher/services/${editingService.id}`, payload)
        : await API.post('/api/v1/public/publisher/services', payload);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess(editingService ? '模型服务已更新，需要重新验证' : '模型服务已创建');
      setServiceModal(false);
      load().then();
    } catch (error) {
      if (error?.errorFields) return;
      showError(error instanceof SyntaxError ? '数据规则必须是有效 JSON' : error?.message || '保存模型服务失败');
    } finally { setSaving(false); }
  };

  const verifyService = async (row) => {
    setVerifyingID(row.id);
    try {
      const response = await API.post(`/api/v1/public/publisher/services/${row.id}/verify`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('模型服务验证通过');
    } catch (error) { showError(error?.message || '模型服务验证失败'); }
    finally { setVerifyingID(''); load().then(); }
  };

  const deleteService = async (row) => {
    try {
      const response = await API.delete(`/api/v1/public/publisher/services/${row.id}`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('模型服务已删除'); load().then();
    } catch (error) { showError(error?.message || '删除模型服务失败'); }
  };

  const serviceModelOptions = useMemo(() => services.flatMap((service) => (service.models || []).map((item) => ({ value: `${service.id}::${item.model}`, label: `${service.name} / ${item.model}` }))), [services]);
  const openOffer = (row = null) => {
    setEditingOffer(row);
    offerForm.setFieldsValue(row || emptyOffer);
    setOfferModal(true);
  };
  const saveOffer = async () => {
    try {
      const values = await offerForm.validateFields();
      const [serviceID, model] = String(values.service_model || `${values.service_id}::${values.model}`).split('::');
      const payload = { ...values, service_id: serviceID, model };
      delete payload.service_model;
      setSaving(true);
      const response = editingOffer
        ? await API.put(`/api/v1/public/publisher/offers/${editingOffer.id}`, payload)
        : await API.post('/api/v1/public/publisher/offers', payload);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess(editingOffer ? '报价已更新' : '报价草稿已创建');
      setOfferModal(false); load().then();
    } catch (error) { if (!error?.errorFields) showError(error?.message || '保存报价失败'); }
    finally { setSaving(false); }
  };
  const submitOffer = async (row) => {
    try {
      const response = await API.post(`/api/v1/public/publisher/offers/${row.id}/submit`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('报价已提交审核'); load().then();
    } catch (error) { showError(error?.message || '提交报价失败'); }
  };
  const deleteOffer = async (row) => {
    try {
      const response = await API.delete(`/api/v1/public/publisher/offers/${row.id}`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('报价已删除'); load().then();
    } catch (error) { showError(error?.message || '删除报价失败'); }
  };

  const serviceColumns = [
    { title: '模型服务', dataIndex: 'name', render: (value, row) => <div className='publisher-service-name'><strong>{value}</strong><span>{row.base_url}</span></div> },
    { title: '模型', dataIndex: 'models', render: (models) => (models || []).map((item) => item.model).join(', ') || '-' },
    { title: '区域', dataIndex: 'region', width: 100, render: (value) => value || '-' },
    { title: '验证', width: 160, render: (_, row) => row.last_checked_at ? <div className='publisher-verify-state'>{statusTag(row.last_check_ok ? 'ready' : 'offline')}<span title={row.last_check_error || ''}>{row.last_check_ok ? timestamp2string(row.last_checked_at) : row.last_check_error || timestamp2string(row.last_checked_at)}</span></div> : statusTag('draft') },
    { title: '状态', dataIndex: 'status', width: 94, render: statusTag },
    { title: '操作', width: 210, render: (_, row) => <div className='publisher-actions'><AppButton type='text' loading={verifyingID === row.id} onClick={() => verifyService(row)}>测试连接</AppButton><AppButton type='text' onClick={() => openService(row)}>编辑</AppButton><AppButton type='text' danger onClick={() => deleteService(row)}>删除</AppButton></div> },
  ];
  const offerColumns = [
    { title: '模型', dataIndex: 'model' },
    { title: '模型服务', dataIndex: 'service_id', render: (value) => services.find((item) => item.id === value)?.name || value },
    { title: '输入 / 输出价格', render: (_, row) => `${row.input_price_micros} / ${row.output_price_micros} 微美元 / 百万 Token` },
    { title: '状态', dataIndex: 'status', width: 96, render: statusTag },
    { title: '操作', width: 206, render: (_, row) => <div className='publisher-actions'>{(row.status === 'draft' || row.status === 'rejected') && <AppButton type='text' onClick={() => submitOffer(row)}>提交审核</AppButton>}{(row.status === 'draft' || row.status === 'rejected') && <AppButton type='text' onClick={() => openOffer(row)}>编辑</AppButton>}{(row.status === 'draft' || row.status === 'rejected') && <AppButton type='text' danger onClick={() => deleteOffer(row)}>删除</AppButton>}</div> },
  ];
  const settlementColumns = [
    { title: '请求', dataIndex: 'request_log_id', render: (value) => <span className='publisher-monospace'>{value}</span> },
    { title: '模型', dataIndex: 'model' },
    { title: '消费者成交额', dataIndex: 'consumer_amount_micros', render: (value) => `${value} 微美元` },
    { title: '平台服务费', dataIndex: 'platform_fee_amount_micros', render: (value) => `${value} 微美元` },
    { title: '发布者应收', dataIndex: 'publisher_payable_micros', render: (value) => `${value} 微美元` },
    { title: '状态', dataIndex: 'status', width: 96, render: statusTag },
    { title: '产生时间', dataIndex: 'created_at', width: 168, render: (value) => value ? timestamp2string(value) : '-' },
  ];

  return <div className='dashboard-container publisher-workspace-page'>
    <AppAlert type='info' message='可信发布试点' description='个人供应商连接始终仅供本人使用。这里创建的是独立模型服务；发布者、服务和公开报价均审核通过后，用户可为对应模型显式选择该报价。调用不会自动切换到其他发布者，成功调用将记录待结算应收。' />
    <AppTabs items={[
      { key: 'profile', label: '发布者资料', children: <AppSection title='发布者资料' extra={profile ? statusTag(profile.status) : null}><AppForm form={profileForm} layout='vertical' className='publisher-profile-form'><AppField label='发布者名称' required><AppForm.Item name='display_name' rules={[{ required: true, message: '请输入发布者名称' }]} noStyle><AppInput /></AppForm.Item></AppField><AppField label='联系邮箱' required><AppForm.Item name='contact_email' rules={[{ required: true, type: 'email', message: '请输入有效联系邮箱' }]} noStyle><AppInput /></AppForm.Item></AppField><AppField label='钱包身份'><AppInput value={profile?.wallet_identity_did || '完成钱包身份验证后可创建发布者资料'} disabled /></AppField><AppFormActions><AppButton color='blue' loading={saving} onClick={saveProfile}>保存资料</AppButton>{profile?.status === 'draft' || profile?.status === 'restricted' ? <AppButton onClick={submitApplication}>提交审核</AppButton> : null}</AppFormActions></AppForm>{profile?.review_note ? <p className='publisher-review-note'>审核说明：{profile.review_note}</p> : null}</AppSection> },
      { key: 'services', label: '模型服务', children: <AppSection title='模型服务' extra={<AppButton color='blue' icon={<AppIcon name='plus' />} onClick={() => openService()}>创建模型服务</AppButton>}><p className='publisher-hint'>服务地址必须是 HTTPS 公网地址。测试连接仅校验上游地址和凭据，不会发起模型推理请求。</p><AppTable rowKey='id' columns={serviceColumns} dataSource={services} loading={loading} scroll={{ x: 1100 }} pagination={false} locale={{ emptyText: <AppEmpty>还没有模型服务</AppEmpty> }} /></AppSection> },
      { key: 'offers', label: '报价', children: <AppSection title='报价' extra={<AppButton color='blue' icon={<AppIcon name='plus' />} disabled={!services.length} onClick={() => openOffer()}>创建报价</AppButton>}><p className='publisher-hint'>报价是公开服务的商业声明。提交前，发布者必须已通过审核，关联模型服务必须完成验证。价格使用微美元 / 百万 Token，避免浮点金额误差。</p><AppTable rowKey='id' columns={offerColumns} dataSource={offers} loading={loading} scroll={{ x: 1080 }} pagination={false} locale={{ emptyText: <AppEmpty>还没有报价草稿</AppEmpty> }} /></AppSection> },
      { key: 'settlements', label: '结算', children: <AppSection title='发布者结算'><p className='publisher-hint'>每条记录对应一次未来的社区服务成功调用，保留成交价、平台服务费和发布者应收的不可变快照。当前公开目录尚未接入 Relay，因此没有调用前不会产生结算记录。</p><AppTable rowKey='request_log_id' columns={settlementColumns} dataSource={settlements} loading={loading} scroll={{ x: 1120 }} pagination={false} locale={{ emptyText: <AppEmpty>还没有发布者结算记录</AppEmpty> }} /></AppSection> },
    ]} />
    <AppModal open={serviceModal} onClose={() => setServiceModal(false)} title={editingService ? '编辑模型服务' : '创建模型服务'} size='small' footer={<AppFormActions><AppButton onClick={() => setServiceModal(false)}>取消</AppButton><AppButton color='blue' loading={saving} onClick={saveService}>保存</AppButton></AppFormActions>}><AppForm form={serviceForm} layout='vertical' initialValues={emptyService}><AppField label='服务名称' required><AppForm.Item name='name' rules={[{ required: true, message: '请输入服务名称' }]} noStyle><AppInput /></AppForm.Item></AppField><AppField label='上游协议'><AppForm.Item name='protocol' noStyle><AppSelect options={PROTOCOL_OPTIONS} /></AppForm.Item></AppField><AppField label='Base URL' required hint='仅支持 HTTPS 公网地址'><AppForm.Item name='base_url' rules={[{ required: true, message: '请输入 Base URL' }]} noStyle><AppInput placeholder='https://api.example.com/v1' /></AppForm.Item></AppField><AppField label={editingService ? '轮换 API Key' : 'API Key'} required={!editingService} hint={editingService ? '留空则保留当前凭据' : '凭据会加密保存，之后不会再显示'}><AppForm.Item name='api_key' rules={editingService ? [] : [{ required: true, message: '请输入 API Key' }]} noStyle><AppInput type='password' autoComplete='new-password' /></AppForm.Item></AppField><AppField label='实际处理区域'><AppForm.Item name='region' noStyle><AppInput placeholder='例如 CN-SH' /></AppForm.Item></AppField><AppField label='模型范围' required hint='可信发布试点仅支持当前标准模型目录；每行一个模型'><AppForm.Item name='models_text' rules={[{ required: true, message: '至少填写一个模型' }]} noStyle><AppTextarea rows={4} placeholder='gpt-5.4' /></AppForm.Item></AppField><AppField label='调用端点'><AppForm.Item name='endpoint' noStyle><AppSelect options={ENDPOINT_OPTIONS} /></AppForm.Item></AppField><AppField label='数据规则' required><AppForm.Item name='data_policy' rules={[{ required: true, message: '请输入数据规则 JSON' }]} noStyle><AppTextarea rows={4} /></AppForm.Item></AppField><AppField label='容量规则' required><AppForm.Item name='capacity_policy' rules={[{ required: true, message: '请输入容量规则 JSON' }]} noStyle><AppTextarea rows={3} /></AppForm.Item></AppField></AppForm></AppModal>
    <AppModal open={offerModal} onClose={() => setOfferModal(false)} title={editingOffer ? '编辑报价草稿' : '创建报价草稿'} size='small' footer={<AppFormActions><AppButton onClick={() => setOfferModal(false)}>取消</AppButton><AppButton color='blue' loading={saving} onClick={saveOffer}>保存</AppButton></AppFormActions>}><AppForm form={offerForm} layout='vertical' initialValues={emptyOffer}><AppField label='模型服务和模型' required><AppForm.Item name='service_model' initialValue={editingOffer ? `${editingOffer.service_id}::${editingOffer.model}` : undefined} rules={[{ required: !editingOffer, message: '请选择模型服务和模型' }]} noStyle><AppSelect options={serviceModelOptions} search placeholder='选择已声明的模型' /></AppForm.Item></AppField>{editingOffer ? <><AppForm.Item name='service_id' hidden><AppInput /></AppForm.Item><AppForm.Item name='model' hidden><AppInput /></AppForm.Item></> : null}<AppField label='报价范围'><AppForm.Item name='scope' noStyle><AppSelect options={[{ value: 'public', label: '公开目录' }, { value: 'invite', label: '邀请范围' }]} /></AppForm.Item></AppField><AppField label='输入价格' required hint='微美元 / 百万 Token'><AppForm.Item name='input_price_micros' rules={[{ required: true, message: '请输入输入价格' }]} noStyle><AppInputNumber min={0} /></AppForm.Item></AppField><AppField label='输出价格' required hint='微美元 / 百万 Token'><AppForm.Item name='output_price_micros' rules={[{ required: true, message: '请输入输出价格' }]} noStyle><AppInputNumber min={0} /></AppForm.Item></AppField></AppForm></AppModal>
  </div>;
}

export default PublisherWorkspace;
