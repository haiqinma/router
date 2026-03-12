import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Label,
  Menu,
  Pagination,
  Select,
  Table,
} from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';

const PAGE_SIZE = 20;

const normalizeTaskStatus = (value) => {
  const normalized = (value || '').toString().trim().toLowerCase();
  switch (normalized) {
    case 'pending':
    case 'queued':
      return 'pending';
    case 'running':
    case 'processing':
    case 'in_progress':
      return 'running';
    case 'succeeded':
    case 'success':
    case 'completed':
      return 'succeeded';
    case 'failed':
    case 'error':
      return 'failed';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    default:
      return normalized || 'pending';
  }
};

const taskStatusColor = (status) => {
  switch (normalizeTaskStatus(status)) {
    case 'running':
      return 'blue';
    case 'succeeded':
      return 'green';
    case 'failed':
      return 'red';
    case 'canceled':
      return 'grey';
    default:
      return 'orange';
  }
};

const getTaskEndpoint = (isAdminPage, scope) => {
  if (isAdminPage) {
    return scope === 'user'
      ? '/api/v1/admin/user/tasks'
      : '/api/v1/admin/tasks';
  }
  return '/api/v1/public/user/tasks';
};

const getTaskId = (item) => item?.id || item?.task_id || '';

const getTaskTypeOptions = (t, scope) => {
  const common = [{ key: 'all', value: '', text: t('task.filters.type_all') }];
  if (scope === 'user') {
    common.push({
      key: 'video',
      value: 'video',
      text: t('task.types.video'),
    });
    return common;
  }
  common.push(
    {
      key: 'channel_model_test',
      value: 'channel_model_test',
      text: t('task.types.channel_model_test'),
    },
    {
      key: 'channel_refresh_models',
      value: 'channel_refresh_models',
      text: t('task.types.channel_refresh_models'),
    },
    {
      key: 'channel_refresh_balance',
      value: 'channel_refresh_balance',
      text: t('task.types.channel_refresh_balance'),
    },
  );
  return common;
};

const getTaskStatusOptions = (t) => [
  { key: 'all', value: '', text: t('task.filters.status_all') },
  { key: 'pending', value: 'pending', text: t('task.status.pending') },
  { key: 'running', value: 'running', text: t('task.status.running') },
  { key: 'succeeded', value: 'succeeded', text: t('task.status.succeeded') },
  { key: 'failed', value: 'failed', text: t('task.status.failed') },
  { key: 'canceled', value: 'canceled', text: t('task.status.canceled') },
];

const Task = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin/');
  const initialQuery = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const [scope, setScope] = useState(() => {
    if (!isAdminPage) {
      return 'user';
    }
    return initialQuery.get('scope') === 'user' ? 'user' : 'admin';
  });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const parsed = Number(initialQuery.get('page') || 1);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(() => ({
    type: (initialQuery.get('type') || '').trim(),
    status: (initialQuery.get('status') || '').trim(),
    channel_id: (initialQuery.get('channel_id') || '').trim(),
    model: (initialQuery.get('model') || '').trim(),
    user_keyword: (initialQuery.get('user_keyword') || '').trim(),
  }));

  useEffect(() => {
    if (!isAdminPage) {
      setScope('user');
    }
  }, [isAdminPage]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  const taskTypeOptions = useMemo(
    () => getTaskTypeOptions(t, scope),
    [scope, t],
  );
  const taskStatusOptions = useMemo(() => getTaskStatusOptions(t), [t]);
  const isUserScope = scope === 'user';
  const endpoint = useMemo(
    () => getTaskEndpoint(isAdminPage, scope),
    [isAdminPage, scope],
  );

  const loadTasks = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      try {
        const res = await API.get(endpoint, {
          params: {
            page: targetPage,
            page_size: PAGE_SIZE,
            type: filters.type,
            status: filters.status,
            channel_id: filters.channel_id.trim(),
            model: filters.model.trim(),
            user_keyword:
              isAdminPage && isUserScope ? filters.user_keyword.trim() : '',
          },
        });
        const { success, message, data } = res.data || {};
        if (!success) {
          showError(message || t('task.messages.load_failed'));
          return;
        }
        setItems(Array.isArray(data?.items) ? data.items : []);
        setTotal(Number(data?.total || 0));
        setPage(Number(data?.page || targetPage || 1));
      } catch (error) {
        showError(error?.message || t('task.messages.load_failed'));
      } finally {
        setLoading(false);
      }
    },
    [
      endpoint,
      filters.channel_id,
      filters.model,
      filters.status,
      filters.type,
      filters.user_keyword,
      page,
      t,
    ],
  );

  useEffect(() => {
    loadTasks(1).then();
  }, [loadTasks]);

  useEffect(() => {
    const query = new URLSearchParams();
    if (isAdminPage && scope !== 'admin') {
      query.set('scope', scope);
    }
    if (page > 1) {
      query.set('page', String(page));
    }
    if (filters.type) {
      query.set('type', filters.type);
    }
    if (filters.status) {
      query.set('status', filters.status);
    }
    if (filters.model.trim()) {
      query.set('model', filters.model.trim());
    }
    if (isAdminPage && isUserScope && filters.user_keyword.trim()) {
      query.set('user_keyword', filters.user_keyword.trim());
    }
    if (isAdminPage && filters.channel_id.trim()) {
      query.set('channel_id', filters.channel_id.trim());
    }
    const nextSearch = query.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    );
  }, [
    filters.channel_id,
    filters.model,
    filters.status,
    filters.type,
    filters.user_keyword,
    isAdminPage,
    isUserScope,
    location.pathname,
    navigate,
    page,
    scope,
  ]);

  useEffect(() => {
    const hasActive = items.some((item) => {
      const status = normalizeTaskStatus(item?.status);
      return status === 'pending' || status === 'running';
    });
    if (!hasActive) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      loadTasks(page).then();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [items, loadTasks, page]);

  const handleRetryTask = async (taskId) => {
    try {
      const res = await API.post(`/api/v1/admin/tasks/${taskId}/retry`);
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('task.messages.retry_failed'));
        return;
      }
      showSuccess(t('task.messages.retry_success'));
      loadTasks(page).then();
    } catch (error) {
      showError(error?.message || t('task.messages.retry_failed'));
    }
  };

  const handleCancelTask = async (taskId) => {
    try {
      const res = await API.post(`/api/v1/admin/tasks/${taskId}/cancel`);
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('task.messages.cancel_failed'));
        return;
      }
      showSuccess(t('task.messages.cancel_success'));
      loadTasks(page).then();
    } catch (error) {
      showError(error?.message || t('task.messages.cancel_failed'));
    }
  };

  const detailBasePath = isAdminPage ? '/admin/task' : '/workspace/task';

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          {isAdminPage ? (
            <Menu secondary pointing className='router-subnav-menu'>
              <Menu.Item
                name={t('task.scopes.admin')}
                active={scope === 'admin'}
                onClick={() => {
                  setScope('admin');
                  setFilters((prev) => ({ ...prev, type: '' }));
                  setPage(1);
                }}
              />
              <Menu.Item
                name={t('task.scopes.user')}
                active={scope === 'user'}
                onClick={() => {
                  setScope('user');
                  setFilters((prev) => ({ ...prev, type: '' }));
                  setPage(1);
                }}
              />
            </Menu>
          ) : null}

          <div className='router-toolbar router-block-gap-sm'>
            <div className='router-toolbar-start'>
              <Button
                className='router-page-button'
                onClick={() => loadTasks(page)}
                loading={loading}
              >
                {t('task.buttons.refresh')}
              </Button>
            </div>
            <div className='router-toolbar-end'>
              <Form>
                <Form.Group widths='equal'>
                  {isAdminPage ? (
                    <Form.Input
                      className='router-section-input'
                      placeholder={t('task.filters.channel_id')}
                      value={filters.channel_id}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          channel_id: e.target.value,
                        }))
                      }
                    />
                  ) : null}
                  {isAdminPage && isUserScope ? (
                    <Form.Input
                      className='router-section-input'
                      placeholder={t('task.filters.user_keyword')}
                      value={filters.user_keyword}
                      onChange={(e) =>
                        setFilters((prev) => ({
                          ...prev,
                          user_keyword: e.target.value,
                        }))
                      }
                    />
                  ) : null}
                  <Form.Input
                    className='router-section-input'
                    placeholder={t('task.filters.model')}
                    value={filters.model}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        model: e.target.value,
                      }))
                    }
                  />
                  <Select
                    className='router-section-dropdown'
                    options={taskTypeOptions}
                    value={filters.type}
                    onChange={(e, { value }) =>
                      setFilters((prev) => ({ ...prev, type: value || '' }))
                    }
                  />
                  <Select
                    className='router-section-dropdown'
                    options={taskStatusOptions}
                    value={filters.status}
                    onChange={(e, { value }) =>
                      setFilters((prev) => ({ ...prev, status: value || '' }))
                    }
                  />
                </Form.Group>
              </Form>
            </div>
          </div>

          <Table basic='very' compact className='router-list-table'>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t('task.table.type')}</Table.HeaderCell>
                {isAdminPage && isUserScope ? (
                  <Table.HeaderCell>{t('task.table.user')}</Table.HeaderCell>
                ) : null}
                <Table.HeaderCell>{t('task.table.channel')}</Table.HeaderCell>
                <Table.HeaderCell>{t('task.table.model')}</Table.HeaderCell>
                <Table.HeaderCell>{t('task.table.status')}</Table.HeaderCell>
                <Table.HeaderCell>
                  {t('task.table.created_at')}
                </Table.HeaderCell>
                <Table.HeaderCell>
                  {isUserScope
                    ? t('task.table.updated_at')
                    : t('task.table.finished_at')}
                </Table.HeaderCell>
                <Table.HeaderCell>{t('task.table.message')}</Table.HeaderCell>
                <Table.HeaderCell>{t('task.table.actions')}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {items.length === 0 ? (
                <Table.Row>
                  <Table.Cell
                    colSpan={isAdminPage && isUserScope ? '9' : '8'}
                    className='router-empty-cell'
                  >
                    {loading ? t('common.loading') : t('task.empty')}
                  </Table.Cell>
                </Table.Row>
              ) : (
                items.map((item) => {
                  const taskId = getTaskId(item);
                  const rawStatus = (item?.status || '')
                    .toString()
                    .trim()
                    .toLowerCase();
                  const status = normalizeTaskStatus(rawStatus);
                  const canCancel =
                    !isUserScope &&
                    (status === 'pending' || status === 'running');
                  const canRetry =
                    !isUserScope &&
                    (status === 'failed' || status === 'canceled');
                  const message = isUserScope
                    ? item?.result_url ||
                      item?.request_id ||
                      item?.source ||
                      '-'
                    : item?.error_message ||
                      item?.result ||
                      item?.payload ||
                      '-';
                  const detailSearch =
                    isAdminPage && isUserScope ? '?scope=user' : '';
                  return (
                    <Table.Row
                      key={taskId}
                      className='router-row-clickable'
                      onClick={() =>
                        navigate(`${detailBasePath}/${taskId}${detailSearch}`)
                      }
                    >
                      <Table.Cell>
                        {t(`task.types.${item.type || 'video'}`)}
                      </Table.Cell>
                      {isAdminPage && isUserScope ? (
                        <Table.Cell>
                          {item.user_name || item.user_id || '-'}
                        </Table.Cell>
                      ) : null}
                      <Table.Cell>
                        {item.channel_name || item.channel_id || '-'}
                      </Table.Cell>
                      <Table.Cell>{item.model || '-'}</Table.Cell>
                      <Table.Cell>
                        <Label
                          basic
                          color={taskStatusColor(rawStatus)}
                          className='router-tag'
                        >
                          {t(`task.status.${status}`)}
                        </Label>
                      </Table.Cell>
                      <Table.Cell>
                        {item.created_at
                          ? timestamp2string(item.created_at)
                          : '-'}
                      </Table.Cell>
                      <Table.Cell>
                        {isUserScope
                          ? item.updated_at
                            ? timestamp2string(item.updated_at)
                            : '-'
                          : item.finished_at
                            ? timestamp2string(item.finished_at)
                            : '-'}
                      </Table.Cell>
                      <Table.Cell
                        style={{ maxWidth: 420, wordBreak: 'break-word' }}
                      >
                        {message}
                      </Table.Cell>
                      <Table.Cell collapsing>
                        {isUserScope ? (
                          <Button
                            type='button'
                            className='router-inline-button'
                            basic
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(
                                `${detailBasePath}/${taskId}${detailSearch}`,
                              );
                            }}
                          >
                            {t('task.buttons.view')}
                          </Button>
                        ) : (
                          <div className='router-inline-actions'>
                            <Button
                              type='button'
                              className='router-inline-button'
                              basic
                              disabled={!canRetry}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryTask(taskId);
                              }}
                            >
                              {t('task.buttons.retry')}
                            </Button>
                            <Button
                              type='button'
                              className='router-inline-button'
                              basic
                              disabled={!canCancel}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelTask(taskId);
                              }}
                            >
                              {t('task.buttons.cancel')}
                            </Button>
                          </div>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                })
              )}
            </Table.Body>
            <Table.Footer>
              <Table.Row>
                <Table.HeaderCell
                  colSpan={isAdminPage && isUserScope ? '9' : '8'}
                >
                  <div className='router-toolbar router-task-footer-toolbar'>
                    <div className='router-toolbar-start'>
                      <span className='router-toolbar-meta'>
                        {t('task.summary', { total })}
                      </span>
                    </div>
                    <div className='router-toolbar-end'>
                      <Pagination
                        className='router-page-pagination'
                        activePage={page}
                        totalPages={totalPages}
                        siblingRange={1}
                        boundaryRange={0}
                        onPageChange={(e, { activePage }) => {
                          const nextPage = Number(activePage || 1);
                          setPage(nextPage);
                          loadTasks(nextPage).then();
                        }}
                      />
                    </div>
                  </div>
                </Table.HeaderCell>
              </Table.Row>
            </Table.Footer>
          </Table>
        </Card.Content>
      </Card>
    </div>
  );
};

export default Task;
