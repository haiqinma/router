/* i18n-skip */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppButton, AppEmpty, AppField, AppForm, AppFormActions, AppModal, AppSection, AppTable, AppTabs, AppTag, AppTextarea } from '../../router-ui';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';
import './index.css';

const STATUS_COLOR = { draft: 'grey', reviewing: 'orange', active: 'green', ready: 'green', published: 'green', accrued: 'blue', held: 'orange', settled: 'green', reversed: 'red', restricted: 'orange', suspended: 'red', rejected: 'red', offline: 'red' };
const STATUS_LABEL = { draft: '草稿', reviewing: '待审核', active: '已通过', ready: '已就绪', published: '已发布', accrued: '待结算', held: '已冻结', settled: '已结算', reversed: '已冲销', restricted: '受限', suspended: '已暂停', rejected: '已驳回', offline: '已下线' };
const statusTag = (value) => <AppTag color={STATUS_COLOR[value] || 'grey'}>{STATUS_LABEL[value] || value || '-'}</AppTag>;
const DELIVERY_STATUS = { prepared: ['orange', '待确认'], ready: ['blue', '待投递'], delivered: ['green', '已投递'], cancelled: ['grey', '已取消'], exception: ['red', '异常待处置'], resolved: ['green', '已人工处理'] };
const deliveryStatusTag = (value) => {
  const [color, label] = DELIVERY_STATUS[value] || ['grey', value || '-'];
  return <AppTag color={color}>{label}</AppTag>;
};

function PublisherOperations() {
  const [publishers, setPublishers] = useState([]);
  const [services, setServices] = useState([]);
  const [offers, setOffers] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [retryingDeliveryID, setRetryingDeliveryID] = useState('');
  const [cancellingDelivery, setCancellingDelivery] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [resolvingDelivery, setResolvingDelivery] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [form] = AppForm.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [publisherResponse, serviceResponse, offerResponse, settlementResponse, deliveryResponse] = await Promise.all([
        API.get('/api/v1/admin/publishers/'),
        API.get('/api/v1/admin/publisher-services/'),
        API.get('/api/v1/admin/offers/review'),
        API.get('/api/v1/admin/publisher-settlements/'),
        API.get('/api/v1/admin/publisher-settlements/deliveries'),
      ]);
      for (const response of [publisherResponse, serviceResponse, offerResponse, settlementResponse, deliveryResponse]) if (!response.data?.success) throw new Error(response.data?.message);
      setPublishers(Array.isArray(publisherResponse.data?.data) ? publisherResponse.data.data : []);
      setServices(Array.isArray(serviceResponse.data?.data) ? serviceResponse.data.data : []);
      setOffers(Array.isArray(offerResponse.data?.data) ? offerResponse.data.data : []);
      setSettlements(Array.isArray(settlementResponse.data?.data) ? settlementResponse.data.data : []);
      setDeliveries(Array.isArray(deliveryResponse.data?.data) ? deliveryResponse.data.data : []);
    } catch (error) { showError(error?.message || '加载发布审核失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load().then(); }, [load]);
  const openReview = (kind, row, approve) => { setReviewing({ kind, row, approve }); form.resetFields(); };
  const submitReview = async () => {
    try {
      const values = await form.validateFields();
      const { kind, row, approve } = reviewing;
      let url = '';
      if (kind === 'publisher') url = `/api/v1/admin/publishers/${row.id}/${approve ? 'approve' : 'restrict'}`;
      if (kind === 'offer') url = `/api/v1/admin/offers/${row.id}/${approve ? 'approve' : 'reject'}`;
      if (kind === 'service') url = `/api/v1/admin/publisher-services/${row.id}/suspend`;
      setSaving(true);
      const response = await API.post(url, values);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('审核操作已保存'); setReviewing(null); load().then();
    } catch (error) { if (!error?.errorFields) showError(error?.message || '审核操作失败'); }
    finally { setSaving(false); }
  };
  const retryDelivery = async (row) => {
    setRetryingDeliveryID(row.request_log_id);
    try {
      const response = await API.post(`/api/v1/admin/publisher-settlements/deliveries/${row.request_log_id}/retry`);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('结算投递已完成');
      load().then();
    } catch (error) { showError(error?.message || '结算投递尚未满足完成条件'); }
    finally { setRetryingDeliveryID(''); }
  };
  const openDeliveryCancellation = (row) => { setCancellingDelivery(row); form.resetFields(); };
  const submitDeliveryCancellation = async () => {
    try {
      const values = await form.validateFields();
      setCancelling(true);
      const response = await API.post(`/api/v1/admin/publisher-settlements/deliveries/${cancellingDelivery.request_log_id}/cancel`, values);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('结算投递已取消并退款'); setCancellingDelivery(null); load().then();
    } catch (error) { if (!error?.errorFields) showError(error?.message || '取消结算投递失败'); }
    finally { setCancelling(false); }
  };
  const openDeliveryResolution = (row) => { setResolvingDelivery(row); form.resetFields(); };
  const submitDeliveryResolution = async () => {
    try {
      const values = await form.validateFields();
      setResolving(true);
      const response = await API.post(`/api/v1/admin/publisher-settlements/deliveries/${resolvingDelivery.request_log_id}/resolve`, values);
      if (!response.data?.success) throw new Error(response.data?.message);
      showSuccess('异常处置已记录'); setResolvingDelivery(null); load().then();
    } catch (error) { if (!error?.errorFields) showError(error?.message || '确认异常处置失败'); }
    finally { setResolving(false); }
  };
  const publisherColumns = useMemo(() => [
    { title: '发布者', dataIndex: 'display_name', render: (value, row) => <div className='publisher-operations-name'><strong>{value}</strong><span>{row.wallet_identity_did}</span></div> },
    { title: '联系邮箱', dataIndex: 'contact_email' },
    { title: '状态', dataIndex: 'status', width: 96, render: statusTag },
    { title: '提交时间', dataIndex: 'submitted_at', width: 170, render: (value) => value ? timestamp2string(value) : '-' },
    { title: '操作', width: 150, render: (_, row) => <div className='publisher-operations-actions'>{row.status === 'reviewing' && <AppButton type='text' onClick={() => openReview('publisher', row, true)}>通过</AppButton>}{(row.status === 'reviewing' || row.status === 'active') && <AppButton type='text' danger onClick={() => openReview('publisher', row, false)}>限制</AppButton>}</div> },
  ], []);
  const serviceColumns = useMemo(() => [
    { title: '模型服务', dataIndex: 'name', render: (value, row) => <div className='publisher-operations-name'><strong>{value}</strong><span>{row.base_url}</span></div> },
    { title: '发布者 ID', dataIndex: 'publisher_id' },
    { title: '验证状态', render: (_, row) => statusTag(row.last_check_ok ? 'ready' : row.status) },
    { title: '最近验证', dataIndex: 'last_checked_at', render: (value) => value ? timestamp2string(value) : '-' },
    { title: '操作', width: 110, render: (_, row) => row.status !== 'suspended' && <AppButton type='text' danger onClick={() => openReview('service', row, false)}>暂停</AppButton> },
  ], []);
  const offerColumns = useMemo(() => [
    { title: '模型', dataIndex: 'model' },
    { title: '发布者 ID', dataIndex: 'publisher_id' },
    { title: '模型服务 ID', dataIndex: 'service_id' },
    { title: '价格', render: (_, row) => `${row.input_price_micros} / ${row.output_price_micros} 微美元 / 百万 Token` },
    { title: '状态', dataIndex: 'status', width: 96, render: statusTag },
    { title: '操作', width: 150, render: (_, row) => row.status === 'reviewing' && <div className='publisher-operations-actions'><AppButton type='text' onClick={() => openReview('offer', row, true)}>发布</AppButton><AppButton type='text' danger onClick={() => openReview('offer', row, false)}>驳回</AppButton></div> },
  ], []);
  const settlementColumns = useMemo(() => [
    { title: '请求', dataIndex: 'request_log_id', render: (value) => <span className='publisher-operations-monospace'>{value}</span> },
    { title: '发布者', dataIndex: 'publisher_display_name' },
    { title: '模型', dataIndex: 'model' },
    { title: '消费者成交额', dataIndex: 'consumer_amount_micros', render: (value) => `${value} 微美元` },
    { title: '平台服务费', dataIndex: 'platform_fee_amount_micros', render: (value) => `${value} 微美元` },
    { title: '发布者应收', dataIndex: 'publisher_payable_micros', render: (value) => `${value} 微美元` },
    { title: '状态', dataIndex: 'status', width: 96, render: statusTag },
  ], []);
  const deliveryColumns = useMemo(() => [
    { title: '请求', dataIndex: 'request_log_id', render: (value) => <span className='publisher-operations-monospace'>{value}</span> },
    { title: '报价', dataIndex: 'offer_id', render: (value) => <span className='publisher-operations-monospace'>{value}</span> },
    { title: '消费者', dataIndex: 'consumer_user_id', render: (value) => <span className='publisher-operations-monospace'>{value}</span> },
    { title: '用量', render: (_, row) => `${row.input_tokens} / ${row.output_tokens} Token` },
    { title: '扣费 / 退款', render: (_, row) => row.charge_recorded ? `${row.charged_quota} / ${row.refunded_quota} 额度` : `待确认 (${row.planned_quota || 0} 额度)` },
    { title: '状态', dataIndex: 'status', width: 96, render: deliveryStatusTag },
    { title: '尝试', dataIndex: 'attempts', width: 72, align: 'right' },
    { title: '最后错误', dataIndex: 'last_error', render: (value) => <span title={value || ''}>{value || '-'}</span> },
    { title: '异常 / 结论', render: (_, row) => <span title={row.resolution || row.exception_reason || ''}>{row.resolution || row.exception_reason || '-'}</span> },
    { title: '操作', width: 180, render: (_, row) => <div className='publisher-operations-actions'>{row.status !== 'delivered' && row.status !== 'cancelled' && row.status !== 'exception' && row.status !== 'resolved' && <AppButton type='text' color='blue' loading={retryingDeliveryID === row.request_log_id} onClick={() => retryDelivery(row)}>重试投递</AppButton>}{row.status === 'prepared' && row.charge_recorded && <AppButton type='text' danger onClick={() => openDeliveryCancellation(row)}>取消并退款</AppButton>}{row.status === 'exception' && <AppButton type='text' danger onClick={() => openDeliveryResolution(row)}>确认处置</AppButton>}</div> },
  ], [retryingDeliveryID]);
  const needsNote = reviewing && (!reviewing.approve || reviewing.kind === 'service');
  const actionLabel = reviewing?.kind === 'service' ? '暂停服务' : reviewing?.approve ? (reviewing.kind === 'offer' ? '发布报价' : '通过发布者') : (reviewing?.kind === 'offer' ? '驳回报价' : '限制发布者');
  return <div className='dashboard-container publisher-operations-page'><AppTabs items={[
    { key: 'publishers', label: `发布者${publishers.filter((item) => item.status === 'reviewing').length ? ` (${publishers.filter((item) => item.status === 'reviewing').length})` : ''}`, children: <AppSection title='发布者审核'><AppTable rowKey='id' columns={publisherColumns} dataSource={publishers} loading={loading} pagination={false} scroll={{ x: 960 }} locale={{ emptyText: <AppEmpty>没有发布者申请</AppEmpty> }} /></AppSection> },
    { key: 'services', label: '模型服务', children: <AppSection title='模型服务治理'><AppTable rowKey='id' columns={serviceColumns} dataSource={services} loading={loading} pagination={false} scroll={{ x: 960 }} locale={{ emptyText: <AppEmpty>没有发布者模型服务</AppEmpty> }} /></AppSection> },
    { key: 'offers', label: `报价审核${offers.filter((item) => item.status === 'reviewing').length ? ` (${offers.filter((item) => item.status === 'reviewing').length})` : ''}`, children: <AppSection title='可售报价审核'><AppTable rowKey='id' columns={offerColumns} dataSource={offers} loading={loading} pagination={false} scroll={{ x: 1080 }} locale={{ emptyText: <AppEmpty>没有待审核报价</AppEmpty> }} /></AppSection> },
    { key: 'settlements', label: '结算账本', children: <AppSection title='社区服务结算账本'><AppTable rowKey='request_log_id' columns={settlementColumns} dataSource={settlements} loading={loading} pagination={false} scroll={{ x: 1200 }} locale={{ emptyText: <AppEmpty>还没有社区服务结算记录</AppEmpty> }} /></AppSection> },
    { key: 'deliveries', label: `结算投递${deliveries.filter((item) => !['delivered', 'cancelled', 'resolved'].includes(item.status)).length ? ` (${deliveries.filter((item) => !['delivered', 'cancelled', 'resolved'].includes(item.status)).length})` : ''}`, children: <AppSection title='跨库结算投递'><AppTable rowKey='request_log_id' columns={deliveryColumns} dataSource={deliveries} loading={loading} pagination={false} scroll={{ x: 1740 }} locale={{ emptyText: <AppEmpty>没有待处理的结算投递</AppEmpty> }} /></AppSection> },
  ]} /><AppModal open={Boolean(reviewing)} onClose={() => setReviewing(null)} title={actionLabel} size='small' footer={<AppFormActions><AppButton onClick={() => setReviewing(null)}>取消</AppButton><AppButton color={reviewing?.approve ? 'blue' : undefined} danger={!reviewing?.approve} loading={saving} onClick={submitReview}>确认</AppButton></AppFormActions>}><AppForm form={form} layout='vertical'><AppField label='审核说明' required={needsNote} hint={needsNote ? '该操作必须记录原因' : '可选，说明本次审核决定'}><AppForm.Item name='note' rules={needsNote ? [{ required: true, message: '请填写审核说明' }] : []} noStyle><AppTextarea rows={4} /></AppForm.Item></AppField></AppForm></AppModal><AppModal open={Boolean(cancellingDelivery)} onClose={() => setCancellingDelivery(null)} title='取消并退款' size='small' footer={<AppFormActions><AppButton onClick={() => setCancellingDelivery(null)}>返回</AppButton><AppButton danger loading={cancelling} onClick={submitDeliveryCancellation}>确认退款</AppButton></AppFormActions>}><AppForm form={form} layout='vertical'><AppField label='取消原因' required><AppForm.Item name='reason' rules={[{ required: true, message: '请填写取消原因' }]} noStyle><AppTextarea rows={4} /></AppForm.Item></AppField></AppForm></AppModal><AppModal open={Boolean(resolvingDelivery)} onClose={() => setResolvingDelivery(null)} title='确认异常处置' size='small' footer={<AppFormActions><AppButton onClick={() => setResolvingDelivery(null)}>返回</AppButton><AppButton danger loading={resolving} onClick={submitDeliveryResolution}>确认处置</AppButton></AppFormActions>}><AppForm form={form} layout='vertical'><AppField label='处理结论' required><AppForm.Item name='resolution' rules={[{ required: true, message: '请填写处理结论' }]} noStyle><AppTextarea rows={4} /></AppForm.Item></AppField></AppForm></AppModal></div>;
}

export default PublisherOperations;
