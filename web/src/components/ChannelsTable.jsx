import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ChannelSectionTabs from './ChannelSectionTabs';
import { buildLogDrilldownPath } from './LogsTable.helpers';
import {
  API,
  showError,
  showInfo,
  showSuccess,
  timestamp2string,
  withCardLabels,
} from '../helpers';

import {
  CHANNEL_LIST_COLUMN_WIDTHS,
  CHANNEL_LIST_TABLE_MIN_WIDTH,
} from '../constants/tableWidthPresets';
import {
  ProviderBrandMark,
  formatProviderDisplayName,
} from './ProvidersManager.helpers.jsx';
import { normalizeProviderIdentifier } from '../pages/Channel/ChannelForm.helpers';
import useBatchRowActions from '../hooks/useBatchRowActions';
import useUrlState from '../hooks/useUrlState';
import {
  AppButton,
  AppEmpty,
  AppErrorState,
  AppFilterHeader,
  AppInput,
  AppInputNumber,
  AppFormActions,
  AppModal,
  AppPopconfirm,
  AppPopover,
  AppSelect,
  AppSpin,
  AppSwitch,
  AppTable,
  AppTableActionButton,
  AppTooltip,
} from '../router-ui';

const compareTextValue = (left, right) =>
  String(left || '').localeCompare(String(right || ''));

const compareNumberValue = (left, right) =>
  Number(left || 0) - Number(right || 0);

const compareArrayValue = (left, right) =>
  compareTextValue(
    Array.isArray(left) ? left.join(',') : left,
    Array.isArray(right) ? right.join(',') : right,
  );

function renderTimestamp(timestamp) {
  return <>{timestamp2string(timestamp)}</>;
}

const MAX_VENDOR_ICONS = 3;

// 渠道有界且量小:后端单页上限 100(maxChannelListPageSize),前端按此上限
// 循环把全部渠道翻完,渲染成单张可滚动表,免去运营频繁翻页;MAX_FETCH_PAGES
// 作为防跑飞的硬顶(最多 5000 条)。
const CHANNEL_LIST_FETCH_PAGE_SIZE = 100;
const CHANNEL_LIST_MAX_FETCH_PAGES = 50;

// Render the distinct model vendors a channel serves as brand icons. Beyond a
// small cap the overflow folds into a "+N" chip that reveals the full list on
// hover. Falls back to the channel's upstream protocol (mapped to a vendor id)
// when no model-level providers are resolved yet.
function renderModelVendors(vendors, protocol, t) {
  let list = Array.isArray(vendors)
    ? vendors.map((item) => (item || '').toString().trim()).filter(Boolean)
    : [];
  if (list.length === 0) {
    const fromProtocol = normalizeProviderIdentifier(
      (protocol || '').toString().trim(),
    );
    if (fromProtocol) {
      list = [fromProtocol];
    }
  }
  const seen = new Set();
  const unique = [];
  list.forEach((vendor) => {
    if (seen.has(vendor)) {
      return;
    }
    seen.add(vendor);
    unique.push(vendor);
  });
  if (unique.length === 0) {
    return <span className='router-text-muted'>-</span>;
  }
  const shouldFold = unique.length > MAX_VENDOR_ICONS;
  const shown = shouldFold ? unique.slice(0, MAX_VENDOR_ICONS - 1) : unique;
  const hidden = shouldFold ? unique.slice(MAX_VENDOR_ICONS - 1) : [];
  return (
    <div className='router-channel-vendor-cell'>
      {shown.map((vendor) => (
        <ProviderBrandMark key={vendor} provider={vendor} />
      ))}
      {hidden.length > 0 ? (
        <AppPopover
          trigger='hover'
          title={t('channel.table.model_vendors')}
          content={
            <div className='router-channel-vendor-popover'>
              {unique.map((vendor) => (
                <div className='router-channel-vendor-popover-row' key={vendor}>
                  <ProviderBrandMark provider={vendor} />
                  <span>{formatProviderDisplayName(vendor)}</span>
                </div>
              ))}
            </div>
          }
        >
          <span className='router-channel-vendor-more'>+{hidden.length}</span>
        </AppPopover>
      ) : null}
    </div>
  );
}

function getChannelDisplayName(channel) {
  const name = (channel?.name || '').toString().trim();
  if (name !== '') {
    return name;
  }
  return '-';
}

function renderChannelName(channel, t) {
  const displayName = getChannelDisplayName(channel);
  return <span>{displayName || t('channel.table.no_name')}</span>;
}

const channelStatusCreating = 4;
const ChannelsTable = ({ embedded = false }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [totalChannels, setTotalChannels] = useState(0);
  const [searching, setSearching] = useState(false);
  const [disableBlockedImpact, setDisableBlockedImpact] = useState(null);
  const [statusMutatingId, setStatusMutatingId] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const batchActions = useBatchRowActions();
  const { isSelecting: isBatchSelecting, selectedCount: batchSelectedCount } = batchActions;
  const [
    { status: statusFilter, keyword: searchKeyword },
    patchQuery,
  ] = useUrlState({
    status: { param: 'status', default: 'all' },
    keyword: { param: 'q', default: '' },
  });
  const currentPagePath = `${location.pathname}${location.search}${location.hash}`;
  // 默认不设客户端排序,交由服务端 ORDER BY(活跃渠道优先,再按创建时间倒序)决定;
  // 全量已加载,点列头即对整表排序(antd 客户端排序覆盖全部行)。
  const [tableSorter, setTableSorter] = useState({
    columnKey: null,
    order: null,
  });

  const processChannelData = useCallback((channel) => {
    const next = { ...channel };
    next.id = (next.id || '').toString().trim();
    next.protocol = (next.protocol || '').toString().trim().toLowerCase();
    next.created_time = Number(next.created_time || 0);
    next.updated_at = Number(next.updated_at || 0);
    if (next.protocol === '') {
      next.protocol = 'openai';
    }
    return next;
  }, []);

  const loadChannels = useCallback(
    async ({ keyword = '', status = 'all' } = {}) => {
      const normalizedKeyword = (keyword || '').toString().trim();
      const normalizedStatus = (status || 'all').toString().trim().toLowerCase();
      const statusParam = normalizedStatus === 'all' ? '' : normalizedStatus;
      try {
        const collected = [];
        let total = 0;
        // 后端单页上限 100,这里按上限逐页翻完,把全部渠道一次性载入前端。
        for (let page = 1; page <= CHANNEL_LIST_MAX_FETCH_PAGES; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const res = await API.get('/api/v1/admin/channels/', {
            params: {
              page,
              page_size: CHANNEL_LIST_FETCH_PAGE_SIZE,
              keyword: normalizedKeyword,
              status: statusParam,
            },
          });
          const { success, message, data } = res.data;
          if (!success) {
            setLoadError(true);
            showError(message);
            return;
          }
          const items = Array.isArray(data?.items) ? data.items : [];
          collected.push(...items);
          const parsedTotal = Number(data?.total || 0);
          total =
            Number.isFinite(parsedTotal) && parsedTotal >= 0
              ? parsedTotal
              : collected.length;
          if (items.length === 0 || collected.length >= total) {
            break;
          }
        }
        setLoadError(false);
        setChannels(collected.map(processChannelData));
        setTotalChannels(total);
      } catch (error) {
        setLoadError(true);
        showError(error?.message || String(error));
      } finally {
        setLoading(false);
      }
    },
    [processChannelData]
  );

  useEffect(() => {
    setLoading(true);
    // Refetch on mount and whenever the status filter changes, honoring the
    // keyword already in the URL (so a refresh / shared link / return-from-detail
    // restores the filtered list). Keyword typing updates the URL but must not
    // retrigger a fetch here — that stays on Enter — so searchKeyword is read but
    // deliberately not a dependency. The full list is loaded in one pass, so
    // there is no page to track.
    loadChannels({ keyword: searchKeyword, status: statusFilter })
      .then()
      .catch((reason) => {
        showError(reason);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, loadChannels]);

  const refresh = async () => {
    setLoading(true);
    await loadChannels({ keyword: searchKeyword, status: statusFilter });
  };

  const manageChannel = async (id, action, value) => {
    const normalizedID = (id || '').toString().trim();
    if (normalizedID === '') {
      showError(t('channel.error.id_invalid'));
      return;
    }
    const isStatusAction = action === 'enable' || action === 'disable';
    if (isStatusAction) {
      setStatusMutatingId(normalizedID);
    }
    let data = { id: normalizedID };
    let res;
    try {
      switch (action) {
        case 'delete':
          res = await API.delete(
            `/api/v1/admin/channel/${encodeURIComponent(normalizedID)}/`
          );
          break;
        case 'enable':
          data.status = 1;
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        case 'disable':
          data.status = 2;
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        case 'priority':
          if (value === '') {
            return;
          }
          data.priority = parseInt(value);
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        case 'weight':
          if (value === '') {
            return;
          }
          data.weight = parseInt(value);
          if (data.weight < 0) {
            data.weight = 0;
          }
          res = await API.put('/api/v1/admin/channel/', data);
          break;
        default:
          return;
      }
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('channel.messages.operation_success'));
        setLoading(true);
        await loadChannels({ keyword: searchKeyword, status: statusFilter });
      } else {
        if (res?.data?.data?.code === 'channel_disable_blocked') {
          setDisableBlockedImpact(res?.data?.data?.impact || null);
        }
        showError(message);
      }
    } finally {
      if (isStatusAction) {
        setStatusMutatingId('');
      }
    }
  };

  // Batch enable/disable by looping the existing per-row PUT. The backend has
  // no batch endpoint for channel status, so we serialize N PUTs and report a
  // single aggregated result toast (success count / failure count) at the end
  // rather than showing the first error and dropping the rest.
  const runBatchToggle = useCallback(
    async (action) => {
      if (batchRunning) {
        return;
      }
      if (action !== 'enable' && action !== 'disable') {
        return;
      }
      const targetStatus = action === 'enable' ? 1 : 2;
      const keys = batchActions.selectedRowKeys;
      if (keys.length === 0) {
        showInfo(t('channel.batch.select_required'));
        return;
      }
      setBatchRunning(true);
      let successCount = 0;
      const failures = [];
      for (const id of keys) {
        try {
          const res = await API.put('/api/v1/admin/channel/', {
            id,
            status: targetStatus,
          });
          if (res?.data?.success) {
            successCount += 1;
          } else {
            failures.push({ id, message: res?.data?.message || '-' });
          }
        } catch (error) {
          failures.push({
            id,
            message: error?.message || String(error),
          });
        }
      }
      setBatchRunning(false);
      const failedCount = failures.length;
      if (failedCount === 0) {
        showSuccess(
          t(
            action === 'enable'
              ? 'channel.batch.enable_all_success'
              : 'channel.batch.disable_all_success',
            { count: successCount },
          ),
        );
      } else if (successCount === 0) {
        showError(
          t(
            action === 'enable'
              ? 'channel.batch.enable_all_failed'
              : 'channel.batch.disable_all_failed',
            { count: failedCount },
          ),
        );
      } else {
        showError(
          t('channel.batch.partial', {
            success: successCount,
            failed: failedCount,
          }),
        );
      }
      batchActions.exit();
      setLoading(true);
      await loadChannels({ keyword: searchKeyword, status: statusFilter });
    },
    [batchActions, batchRunning, loadChannels, searchKeyword, statusFilter, t],
  );

  // Batch delete by looping per-row DELETE. The backend has no batch delete
  // endpoint, so we serialize N DELETEs and report a single aggregated toast.
  const runBatchDelete = useCallback(async () => {
    if (batchRunning) {
      return;
    }
    const keys = batchActions.selectedRowKeys;
    if (keys.length === 0) {
      showInfo(t('channel.batch.select_required'));
      return;
    }
    setBatchRunning(true);
    let successCount = 0;
    const failures = [];
    for (const id of keys) {
      try {
        const res = await API.delete(
          `/api/v1/admin/channel/${encodeURIComponent(id)}/`,
        );
        if (res?.data?.success) {
          successCount += 1;
        } else {
          failures.push({ id, message: res?.data?.message || '-' });
        }
      } catch (error) {
        failures.push({ id, message: error?.message || String(error) });
      }
    }
    setBatchRunning(false);
    const failedCount = failures.length;
    if (failedCount === 0) {
      showSuccess(
        t('channel.batch.delete_all_success', { count: successCount }),
      );
    } else if (successCount === 0) {
      showError(
        t('channel.batch.delete_all_failed', { count: failedCount }),
      );
    } else {
      showError(
        t('channel.batch.partial', {
          success: successCount,
          failed: failedCount,
        }),
      );
    }
    batchActions.exit();
    setLoading(true);
    await loadChannels({ keyword: searchKeyword, status: statusFilter });
  }, [batchActions, batchRunning, loadChannels, searchKeyword, statusFilter, t]);

  const statusTooltipText = (status, t) => {
    switch (status) {
      case 1:
        return t('channel.table.status_enabled');
      case 2:
        return t('channel.table.status_disabled_tip');
      case 3:
        return t('channel.table.status_auto_disabled_tip');
      case 5:
        return t('channel.table.status_half_open_tip');
      case channelStatusCreating:
        return t('channel.table.status_creating');
      default:
        return t('channel.table.status_unknown');
    }
  };

  const renderStatusSwitch = (channel) => {
    const status = Number(channel?.status || 0);
    const checked = status === 1;
    const disabled = status === channelStatusCreating || actionBusy;
    return (
      <div className='router-channel-status-switch' onClick={stopRowClick}>
        <AppTooltip title={statusTooltipText(status, t)}>
          <AppSwitch
            size='small'
            checked={checked}
            disabled={disabled}
            loading={statusMutatingId === channel.id}
            aria-label={t('channel.table.status')}
            onChange={(event, { checked: nextChecked }) => {
              manageChannel(channel.id, nextChecked ? 'enable' : 'disable');
            }}
          />
        </AppTooltip>
      </div>
    );
  };

  const renderCapabilities = (capabilities, t) => {
    const normalized = Array.isArray(capabilities)
      ? capabilities.filter(Boolean).map((item) => item.toString().toLowerCase())
      : [];
    if (normalized.length === 0) {
      return <span className='router-text-muted'>-</span>;
    }
    const order = ['text', 'image', 'audio', 'video'];
    const capabilitySet = new Set(normalized);
    const ordered = order.filter((item) => capabilitySet.has(item));
    return ordered.map((capability, index) => (
      <span key={`${capability}-${index}`}>
        {t(`channel.model_types.${capability}`, capability)}
        {index === ordered.length - 1 ? '' : ' / '}
      </span>
    ));
  };

  const searchChannels = async () => {
    setSearching(true);
    setLoading(true);
    try {
      await loadChannels({ keyword: searchKeyword, status: statusFilter });
    } catch (error) {
      showError(error?.message || String(error));
      setLoading(false);
    } finally {
      setSearching(false);
    }
  };

  const handleKeywordChange = (e, { value }) => {
    patchQuery({ keyword: value });
  };

  const handleTableChange = (_, __, sorter) => {
    if (!sorter || Array.isArray(sorter) || !sorter.columnKey || !sorter.order) {
      setTableSorter({ columnKey: null, order: null });
      return;
    }
    setTableSorter({
      columnKey: sorter.columnKey,
      order: sorter.order,
    });
  };

  const pagedChannels = channels;
  const visibleChannels = pagedChannels.filter((channel) => !channel.deleted);
  const actionBusy = loading;

  const openChannelByStatus = async (channel) => {
    if (!channel || !channel.id) {
      return;
    }
    navigate(`/admin/channel/detail/${channel.id}`, {
      state: {
        from: currentPagePath,
        channelLabel: getChannelDisplayName(channel),
      },
    });
  };

  // Deep-link straight to the channel detail "publish" tab (URL-driven via
  // ?tab=publish). This is the discoverable entry point for publishing a
  // channel's models to customers — the publish UI otherwise only lives inside
  // the detail page with no link pointing at it.
  const openChannelPublish = (channel) => {
    if (!channel || !channel.id) {
      return;
    }
    navigate(`/admin/channel/detail/${channel.id}?tab=publish`, {
      state: {
        from: currentPagePath,
        channelLabel: getChannelDisplayName(channel),
      },
    });
  };

  // Deep-link straight to the channel detail "tests" tab (URL-driven via
  // ?tab=tests). Testing a channel is the single highest-frequency ops action
  // yet otherwise only lives inside the detail page — this surfaces it in the
  // list so operators don't have to open the detail then hunt for the tab.
  const openChannelTest = (channel) => {
    if (!channel || !channel.id) {
      return;
    }
    navigate(`/admin/channel/detail/${channel.id}?tab=tests`, {
      state: {
        from: currentPagePath,
        channelLabel: getChannelDisplayName(channel),
      },
    });
  };

  const stopRowClick = (event) => {
    event.stopPropagation();
  };

  return (
    <>
      <AppFilterHeader
        breadcrumbs={
          embedded
            ? undefined
            : [
                { key: 'admin', label: t('header.admin_workspace') },
                { key: 'channel', label: t('header.channel'), active: true },
              ]
        }
        title={embedded ? undefined : t('header.channel')}
        meta={
          totalChannels > 0
            ? t('channel.table.total', { count: totalChannels })
            : undefined
        }
        actions={
          <div className='router-list-toolbar-actions'>
            <AppButton
              className='router-page-button'
              color='blue'
              disabled={actionBusy || isBatchSelecting}
              onClick={() => navigate('/admin/channel/add')}
            >
              {t('channel.buttons.add')}
            </AppButton>
            {isBatchSelecting ? (
              <>
                <AppPopconfirm
                  title={t('channel.batch.confirm_enable', {
                    count: batchSelectedCount,
                  })}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  disabled={batchSelectedCount === 0 || batchRunning}
                  onConfirm={() => runBatchToggle('enable')}
                >
                  <AppButton
                    className='router-page-button'
                    disabled={batchSelectedCount === 0 || batchRunning}
                    loading={batchRunning}
                  >
                    {t('channel.batch.enable_selected', {
                      count: batchSelectedCount,
                    })}
                  </AppButton>
                </AppPopconfirm>
                <AppPopconfirm
                  title={t('channel.batch.confirm_disable', {
                    count: batchSelectedCount,
                  })}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  disabled={batchSelectedCount === 0 || batchRunning}
                  onConfirm={() => runBatchToggle('disable')}
                >
                  <AppButton
                    className='router-page-button'
                    color='red'
                    disabled={batchSelectedCount === 0 || batchRunning}
                    loading={batchRunning}
                  >
                    {t('channel.batch.disable_selected', {
                      count: batchSelectedCount,
                    })}
                  </AppButton>
                </AppPopconfirm>
                <AppPopconfirm
                  title={t('channel.batch.confirm_delete', {
                    count: batchSelectedCount,
                  })}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  disabled={batchSelectedCount === 0 || batchRunning}
                  onConfirm={runBatchDelete}
                >
                  <AppButton
                    className='router-page-button'
                    color='red'
                    disabled={batchSelectedCount === 0 || batchRunning}
                    loading={batchRunning}
                  >
                    {t('channel.batch.delete_selected', {
                      count: batchSelectedCount,
                    })}
                  </AppButton>
                </AppPopconfirm>
                <AppButton
                  className='router-page-button'
                  disabled={batchRunning}
                  onClick={batchActions.exit}
                >
                  {t('channel.batch.cancel_selection')}
                </AppButton>
              </>
            ) : (
              <AppButton
                className='router-page-button'
                disabled={actionBusy}
                onClick={batchActions.enter}
              >
                {t('channel.batch.enter_selection')}
              </AppButton>
            )}
            <AppButton
              className='router-page-button'
              onClick={refresh}
              loading={loading}
              disabled={actionBusy || batchRunning}
            >
              {t('channel.buttons.refresh')}
            </AppButton>
          </div>
        }
        query={
          <div className='router-list-toolbar-query router-channel-list-query'>
            <AppSelect
              className='router-section-select'
              value={statusFilter}
              onChange={(_, { value }) => patchQuery({ status: value })}
              options={[
                { value: 'all', label: t('channel.filter.status_all') },
                { value: 'enabled', label: t('channel.table.status_enabled') },
                { value: 'disabled', label: t('channel.table.status_disabled_tip') },
                { value: 'creating', label: t('channel.table.status_creating') },
              ]}
            />
            <AppInput
              className='router-section-input router-channel-list-search'
              icon='search'
              iconPosition='left'
              fluid
              placeholder={t('channel.search')}
              value={searchKeyword}
              loading={searching}
              onChange={handleKeywordChange}
              onPressEnter={searchChannels}
            />
            <AppButton
              className='router-section-button'
              disabled={statusFilter === 'all' && searchKeyword === ''}
              onClick={() => patchQuery({ status: 'all', keyword: '' })}
            >
              {t('common.clear_filters')}
            </AppButton>
          </div>
        }
      />
      {embedded ? null : <ChannelSectionTabs active='list' />}
      <div className='router-table-scroll-x'>
        <AppSpin spinning={loading}>
          <AppTable
            className='router-hover-table router-list-table router-table-fit-page router-table-cardify'
          pagination={false}
          sticky
          scroll={{ x: CHANNEL_LIST_TABLE_MIN_WIDTH }}
          rowKey={(channel) => channel.id}
          onChange={handleTableChange}
          rowSelection={
            isBatchSelecting
              ? {
                  ...batchActions.tableSelection,
                  renderCell: (_, __, ___, originNode) => (
                    <span onClick={stopRowClick}>{originNode}</span>
                  ),
                }
              : undefined
          }
          dataSource={visibleChannels}
          locale={{
            emptyText: loading ? (
              t('common.loading')
            ) : loadError ? (
              <AppErrorState
                message={t('common.load_failed')}
                onRetry={refresh}
                retryText={t('common.retry')}
              />
            ) : (
              <AppEmpty
                action={
                  <AppButton
                    color='blue'
                    onClick={() =>
                      navigate('/admin/channel/add', {
                        state: { from: currentPagePath },
                      })
                    }
                  >
                    {t('channel.buttons.add')}
                  </AppButton>
                }
              >
                {t('channel.table.empty_cta')}
              </AppEmpty>
            ),
          }}
          onRow={(channel) => ({
            onClick: isBatchSelecting
              ? undefined
              : () => openChannelByStatus(channel),
            className: isBatchSelecting ? undefined : 'router-row-clickable',
          })}
          columns={withCardLabels([
          {
            title: t('channel.table.id'),
            dataIndex: 'name',
            key: 'name',
            width: CHANNEL_LIST_COLUMN_WIDTHS.name,
            ellipsis: true,
            sorter: (a, b) => compareTextValue(a.name, b.name),
            sortDirections: ['ascend', 'descend'],
            sortOrder: tableSorter.columnKey === 'name' ? tableSorter.order : null,
            render: (_, channel) => renderChannelName(channel, t),
          },
          {
            title: t('channel.table.model_vendors'),
            dataIndex: 'model_vendors',
            key: 'model_vendors',
            className: 'router-table-col-type-narrow',
            width: CHANNEL_LIST_COLUMN_WIDTHS.type,
            sorter: (a, b) =>
              compareNumberValue(
                Array.isArray(a.model_vendors) ? a.model_vendors.length : 0,
                Array.isArray(b.model_vendors) ? b.model_vendors.length : 0,
              ) || compareArrayValue(a.model_vendors, b.model_vendors),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'model_vendors'
                ? tableSorter.order
                : null,
            render: (_, channel) =>
              renderModelVendors(channel.model_vendors, channel.protocol, t),
          },
          {
            title: t('channel.table.status'),
            dataIndex: 'status',
            key: 'status',
            className: 'router-table-col-status-compact',
            width: CHANNEL_LIST_COLUMN_WIDTHS.status,
            sorter: (a, b) => compareNumberValue(a.status, b.status),
            sortDirections: ['ascend', 'descend'],
            sortOrder: tableSorter.columnKey === 'status' ? tableSorter.order : null,
            render: (_, channel) => renderStatusSwitch(channel),
          },
          {
            title: t('channel.table.created_time'),
            dataIndex: 'created_time',
            key: 'created_time',
            className: 'router-table-col-datetime',
            width: CHANNEL_LIST_COLUMN_WIDTHS.createdAt,
            sorter: (a, b) => compareNumberValue(a.created_time, b.created_time),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'created_time' ? tableSorter.order : null,
            render: (value) => (value ? renderTimestamp(value) : '-'),
          },
          {
            title: t('channel.table.capabilities'),
            dataIndex: 'capabilities',
            key: 'capabilities',
            width: CHANNEL_LIST_COLUMN_WIDTHS.capabilities,
            ellipsis: true,
            sorter: (a, b) => compareArrayValue(a.capabilities, b.capabilities),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'capabilities' ? tableSorter.order : null,
            render: (value) => renderCapabilities(value, t),
          },
          {
            title: t('channel.table.priority'),
            dataIndex: 'priority',
            key: 'priority',
            className: 'router-table-col-status-compact',
            width: CHANNEL_LIST_COLUMN_WIDTHS.priority,
            sorter: (a, b) => compareNumberValue(a.priority, b.priority),
            sortDirections: ['ascend', 'descend'],
            sortOrder:
              tableSorter.columnKey === 'priority' ? tableSorter.order : null,
            render: (value, channel) => (
              <div onClick={stopRowClick}>
                <AppTooltip title={t('channel.table.priority_tip')}>
                  <AppInputNumber
                    className='router-inline-number-input router-inline-input-short'
                    defaultValue={value}
                    onBlur={(event) => {
                      manageChannel(channel.id, 'priority', event.target.value);
                    }}
                  />
                </AppTooltip>
              </div>
            ),
          },
          {
            title: t('channel.table.actions'),
            key: 'actions',
            className: 'router-table-col-actions-icon',
            width: 132,
            render: (_, channel) => (
              <div
                className='router-action-group-tight router-table-actions-icon-compact'
                onClick={stopRowClick}
              >
                <AppTableActionButton
                  icon='book'
                  title={t('log.drilldown.view')}
                  onClick={() => {
                    navigate(
                      buildLogDrilldownPath('admin', { channel: channel.id }),
                    );
                  }}
                />
                <AppTableActionButton
                  icon='heartbeat'
                  title={t('channel.edit.detail_tabs.tests')}
                  onClick={() => {
                    openChannelTest(channel);
                  }}
                />
                {(channel.protocol || '').toString().trim().toLowerCase() !==
                'proxy' ? (
                  <AppTableActionButton
                    icon='cloud upload'
                    title={t('channel.edit.detail_tabs.publish')}
                    onClick={() => {
                      openChannelPublish(channel);
                    }}
                  />
                ) : null}
                <AppPopconfirm
                  title={t('channel.buttons.confirm_delete')}
                  onConfirm={() => {
                    manageChannel(channel.id, 'delete');
                  }}
                >
                  <span>
                    <AppTableActionButton
                      icon='trash'
                      title={t('channel.buttons.delete')}
                      color='red'
                    />
                  </span>
                </AppPopconfirm>
              </div>
            ),
          },
          ])}
          />
        </AppSpin>
      </div>
      <AppModal
        size='small'
        open={!!disableBlockedImpact}
        onClose={() => setDisableBlockedImpact(null)}
        title={t('channel.messages.disable_blocked_title')}
        footer={
          <AppFormActions>
            <AppButton type='button' onClick={() => setDisableBlockedImpact(null)}>
              {t('channel.buttons.confirm')}
            </AppButton>
          </AppFormActions>
        }
      >
        <div className='router-block-gap-sm'>
          <div>{t('channel.messages.disable_blocked_description')}</div>
          {disableBlockedImpact?.channel_id ? (
            <div className='router-text-meta'>
              {t('channel.messages.disable_blocked_channel', {
                channel: disableBlockedImpact.channel_id,
              })}
            </div>
          ) : null}
          <div className='router-block-gap-xs'>
            {(Array.isArray(disableBlockedImpact?.groups)
              ? disableBlockedImpact.groups
              : []
            ).map((item, index) => {
              const groupID = (item?.group || '').toString().trim() || '-';
              const models = Array.isArray(item?.models) ? item.models : [];
              return (
                <div key={`${groupID}-${index}`} className='router-text-wrap'>
                  {models.length > 0
                    ? t('channel.messages.disable_blocked_group_with_models', {
                        group: groupID,
                        models: models.join(', '),
                      })
                    : t('channel.messages.disable_blocked_group', {
                        group: groupID,
                      })}
                </div>
              );
            })}
          </div>
        </div>
      </AppModal>
    </>
  );
};

export default ChannelsTable;
