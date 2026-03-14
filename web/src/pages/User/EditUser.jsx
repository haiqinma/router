import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Dropdown, Form, Label } from 'semantic-ui-react';
import { useNavigate, useParams } from 'react-router-dom';
import { API, isRoot, showError, showSuccess } from '../../helpers';

const ROLE_OPTIONS = (t) => [
  { key: 1, value: 1, text: t('user.table.role_types.normal') },
  { key: 10, value: 10, text: t('user.table.role_types.admin') },
];

const renderRoleLabel = (role, t) => {
  switch (Number(role)) {
    case 1:
      return <Label className='router-tag'>{t('user.table.role_types.normal')}</Label>;
    case 10:
      return (
        <Label color='yellow' className='router-tag'>
          {t('user.table.role_types.admin')}
        </Label>
      );
    default:
      return (
        <Label color='red' className='router-tag'>
          {t('user.table.role_types.unknown')}
        </Label>
      );
  }
};

const renderStatusLabel = (status, t) => {
  switch (Number(status)) {
    case 1:
      return (
        <Label basic className='router-tag'>
          {t('user.table.status_types.activated')}
        </Label>
      );
    case 2:
      return (
        <Label basic color='red' className='router-tag'>
          {t('user.table.status_types.banned')}
        </Label>
      );
    default:
      return (
        <Label basic color='grey' className='router-tag'>
          {t('user.table.status_types.unknown')}
        </Label>
      );
  }
};

const readOnlyValue = (value) => {
  const normalized = (value || '').toString().trim();
  return normalized || '-';
};

const UserDetail = () => {
  const { t } = useTranslation();
  const { id: userId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [persistedUsername, setPersistedUsername] = useState('');
  const [groupMap, setGroupMap] = useState({});
  const [inputs, setInputs] = useState({
    username: '',
    email: '',
    quota: 0,
    group: '',
    role: 1,
    status: 1,
    wallet_address: '',
    used_quota: 0,
    request_count: 0,
    can_manage_users: false,
  });

  const loadGroups = useCallback(async () => {
    try {
      const rows = [];
      let page = 1;
      while (page <= 50) {
        const res = await API.get('/api/v1/admin/groups', {
          params: {
            page,
            page_size: 100,
          },
        });
        const { success, message, data } = res.data || {};
        if (!success) {
          showError(message || t('user.messages.operation_failed'));
          return;
        }
        const pageItems = Array.isArray(data?.items) ? data.items : [];
        rows.push(...pageItems);
        const total = Number(data?.total || pageItems.length || 0);
        if (
          pageItems.length === 0 ||
          rows.length >= total ||
          pageItems.length < 100
        ) {
          break;
        }
        page += 1;
      }
      const nextMap = {};
      rows.forEach((group) => {
        const id = (group?.id || '').toString().trim();
        if (id === '') {
          return;
        }
        nextMap[id] = (group?.name || '').toString().trim() || id;
      });
      setGroupMap(nextMap);
    } catch (error) {
      showError(error?.message || error);
    }
  }, [t]);

  const loadUser = useCallback(async () => {
    if (!userId) {
      navigate('/user', { replace: true });
      return;
    }
    setLoading(true);
    try {
      const res = await API.get(`/api/v1/admin/user/${userId}`);
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message);
        return;
      }
      const walletAddress =
        typeof data?.wallet_address === 'string'
          ? data.wallet_address
          : data?.wallet_address || '';
      setInputs({
        username: data?.username || '',
        email: data?.email || '',
        quota: data?.quota ?? 0,
        group: data?.group || '',
        role: Number(data?.role || 1),
        status: Number(data?.status || 1),
        wallet_address: walletAddress,
        used_quota: data?.used_quota ?? 0,
        request_count: data?.request_count ?? 0,
        can_manage_users: data?.can_manage_users === true,
      });
      setPersistedUsername((data?.username || '').toString().trim());
    } catch (error) {
      showError(error?.message || error);
    } finally {
      setLoading(false);
    }
  }, [navigate, userId]);

  useEffect(() => {
    loadUser().then();
    loadGroups().then();
  }, [loadGroups, loadUser]);

  const groupDisplayValue = useMemo(() => {
    const raw = (inputs.group || '').toString().trim();
    if (raw === '') {
      return '-';
    }
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '')
      .map((item) => groupMap[item] || item)
      .join(', ') || '-';
  }, [groupMap, inputs.group]);

  const isProtectedUser = inputs.can_manage_users === true;
  const canManageRole = isRoot() && !isProtectedUser;

  const roleControl = useMemo(() => {
    if (!canManageRole) {
      return renderRoleLabel(inputs.role, t);
    }
    return (
      <Dropdown
        className='router-inline-dropdown router-role-dropdown'
        selection
        compact
        options={ROLE_OPTIONS(t)}
        value={Number(inputs.role || 1)}
        disabled={loading || actionLoading !== ''}
        onChange={(e, { value }) => {
          const nextRole = Number(value);
          if (!Number.isFinite(nextRole) || nextRole === Number(inputs.role)) {
            return;
          }
          const action = nextRole === 10 ? 'promote' : 'demote';
          if (!persistedUsername || actionLoading !== '') {
            return;
          }
          setActionLoading(action);
          API.post('/api/v1/admin/user/manage', {
            username: persistedUsername,
            action,
          })
            .then((res) => {
              const { success, message } = res.data || {};
              if (!success) {
                showError(message);
                return;
              }
              showSuccess(t('user.messages.operation_success'));
              return loadUser();
            })
            .catch((error) => {
              showError(error?.message || error);
            })
            .finally(() => {
              setActionLoading('');
            });
        }}
      />
    );
  }, [
    actionLoading,
    canManageRole,
    inputs.role,
    loadUser,
    loading,
    persistedUsername,
    t,
  ]);

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header router-page-title'>
            {t('user.detail.title')}
          </Card.Header>
          <Form loading={loading} autoComplete='new-password'>
            <div className='router-toolbar router-block-gap-sm'>
              <div className='router-toolbar-start'>
                <Button
                  type='button'
                  className='router-page-button'
                  onClick={() => navigate('/user')}
                >
                  {t('user.detail.buttons.back')}
                </Button>
              </div>
              <div className='router-toolbar-end'>
                {renderStatusLabel(inputs.status, t)}
              </div>
            </div>

            <Form.Group widths='equal'>
              <Form.Input
                className='router-section-input'
                label={t('user.edit.username')}
                value={readOnlyValue(inputs.username)}
                readOnly
              />
              <Form.Field className='router-section-input'>
                <label>{t('user.table.role_text')}</label>
                <div>{roleControl}</div>
              </Form.Field>
            </Form.Group>

            <Form.Group widths='equal'>
              <Form.Input
                className='router-section-input'
                label={t('user.edit.group')}
                value={groupDisplayValue}
                readOnly
              />
              <Form.Input
                className='router-section-input'
                label={t('user.edit.quota')}
                value={inputs.quota}
                readOnly
              />
            </Form.Group>

            <Form.Group widths='equal'>
              <Form.Input
                className='router-section-input'
                label={t('user.table.wallet')}
                value={readOnlyValue(inputs.wallet_address)}
                readOnly
              />
              <Form.Input
                className='router-section-input'
                label={t('user.table.used_quota')}
                value={inputs.used_quota}
                readOnly
              />
              <Form.Input
                className='router-section-input'
                label={t('user.table.request_count')}
                value={inputs.request_count}
                readOnly
              />
            </Form.Group>
            <Form.Input
              className='router-section-input'
              label={t('user.edit.email')}
              name='email'
              value={readOnlyValue(inputs.email)}
              autoComplete='new-password'
              readOnly
            />
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
};

export default UserDetail;
