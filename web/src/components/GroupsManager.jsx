import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, Label, Modal, Table } from 'semantic-ui-react';
import { API, showError, showInfo, showSuccess, timestamp2string } from '../helpers';

const createEmptyForm = () => ({
  id: '',
  name: '',
  description: '',
  billing_ratio: 1,
  sort_order: 0,
});

const sortCatalogRows = (items) =>
  [...items].sort((a, b) => {
    const aOrder = Number(a.sort_order || 0);
    const bOrder = Number(b.sort_order || 0);
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return (a.id || '').localeCompare(b.id || '');
  });

const toChannelOptions = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    key: item.id,
    text: `${item.name || item.id} (${item.id})`,
    value: item.id,
  }));

const toBoundChannelIDs = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => !!item.bound)
    .map((item) => item.id);

const panelStyle = {
  marginBottom: '16px',
  padding: '16px',
  border: '1px solid rgba(34, 36, 38, 0.08)',
  borderRadius: '10px',
  background: '#fff',
};

const panelHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '12px',
};

const panelTitleStyle = { fontSize: '16px', fontWeight: 600 };

const panelActionsStyle = { display: 'flex', alignItems: 'center', gap: '8px' };

const GroupsManager = forwardRef((_, ref) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [createVisible, setCreateVisible] = useState(false);
  const [createForm, setCreateForm] = useState(createEmptyForm());
  const [createChannelOptions, setCreateChannelOptions] = useState([]);
  const [createChannelIDs, setCreateChannelIDs] = useState([]);
  const [createChannelOptionsLoading, setCreateChannelOptionsLoading] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editForm, setEditForm] = useState(createEmptyForm());
  const [editChannelOptions, setEditChannelOptions] = useState([]);
  const [editChannelIDs, setEditChannelIDs] = useState([]);
  const [editChannelOptionsLoading, setEditChannelOptionsLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/v1/admin/group/catalog');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.load_failed'));
        return;
      }
      setRows(sortCatalogRows(Array.isArray(data) ? data : []));
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadCreateChannelOptions = useCallback(async () => {
    setCreateChannelOptionsLoading(true);
    try {
      const res = await API.get('/api/v1/admin/group/channel-options');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.bind_load_failed'));
        return false;
      }
      setCreateChannelOptions(toChannelOptions(data));
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setCreateChannelOptionsLoading(false);
    }
  }, [t]);

  const loadEditChannelBindings = useCallback(async (groupID) => {
    setEditChannelOptionsLoading(true);
    try {
      const encodedID = encodeURIComponent(groupID || '');
      const res = await API.get(`/api/v1/admin/group/${encodedID}/channels`);
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.bind_load_failed'));
        return false;
      }
      setEditChannelOptions(toChannelOptions(data));
      setEditChannelIDs(toBoundChannelIDs(data));
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setEditChannelOptionsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCatalog().then();
  }, [loadCatalog]);

  const resetCreatePanel = () => {
    setCreateVisible(false);
    setCreateForm(createEmptyForm());
    setCreateChannelOptions([]);
    setCreateChannelIDs([]);
    setCreateChannelOptionsLoading(false);
  };

  const resetEditPanel = () => {
    setEditVisible(false);
    setEditForm(createEmptyForm());
    setEditChannelOptions([]);
    setEditChannelIDs([]);
    setEditChannelOptionsLoading(false);
  };

  const openCreatePanel = () => {
    if (submitting) return;
    resetEditPanel();
    setCreateForm(createEmptyForm());
    setCreateChannelOptions([]);
    setCreateChannelIDs([]);
    setCreateVisible(true);
    loadCreateChannelOptions().then();
  };

  const openEditPanel = async (row) => {
    if (!row || submitting) return;
    resetCreatePanel();
    setEditForm({
      id: row.id || '',
      name: row.name || '',
      description: row.description || '',
      billing_ratio: Number(row.billing_ratio ?? 1),
      sort_order: Number(row.sort_order || 0),
    });
    setEditChannelOptions([]);
    setEditChannelIDs([]);
    setEditVisible(true);
    await loadEditChannelBindings(row.id || '');
  };

  useImperativeHandle(ref, () => ({
    openCreatePanel,
  }));

  const closeCreatePanel = () => {
    if (submitting) return;
    resetCreatePanel();
  };

  const closeEditPanel = () => {
    if (submitting) return;
    resetEditPanel();
  };

  const openDeleteModal = (row) => {
    if (!row || submitting) return;
    setDeleteTarget(row);
    setDeleteOpen(true);
  };

  const closeDeleteModal = () => {
    if (submitting) return;
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  const submitCreate = async () => {
    const id = (createForm.id || '').trim();
    if (id === '') {
      showInfo(t('group_manage.messages.id_required'));
      return;
    }
    const billingRatio = Number(createForm.billing_ratio ?? 1);
    if (!Number.isFinite(billingRatio) || billingRatio < 0) {
      showInfo(t('group_manage.messages.billing_ratio_invalid'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await API.post('/api/v1/admin/group/', {
        id,
        name: (createForm.name || '').trim(),
        description: (createForm.description || '').trim(),
        billing_ratio: billingRatio,
        channel_ids: createChannelIDs,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.create_failed'));
        return;
      }
      setRows((prev) => sortCatalogRows([...prev, data]));
      showSuccess(t('group_manage.messages.create_success'));
      resetCreatePanel();
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async () => {
    const id = (editForm.id || '').trim();
    if (id === '') {
      showInfo(t('group_manage.messages.id_required'));
      return;
    }
    const billingRatio = Number(editForm.billing_ratio ?? 1);
    if (!Number.isFinite(billingRatio) || billingRatio < 0) {
      showInfo(t('group_manage.messages.billing_ratio_invalid'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await API.put('/api/v1/admin/group/', {
        id,
        name: (editForm.name || '').trim(),
        description: (editForm.description || '').trim(),
        billing_ratio: billingRatio,
        sort_order: Number(editForm.sort_order || 0),
        channel_ids: editChannelIDs,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.update_failed'));
        return;
      }
      setRows((prev) =>
        sortCatalogRows(prev.map((row) => (row.id === data.id ? data : row)))
      );
      showSuccess(t('group_manage.messages.update_success'));
      resetEditPanel();
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (row) => {
    if (!row || submitting) return;
    setSubmitting(true);
    try {
      const res = await API.put('/api/v1/admin/group/', {
        id: row.id,
        name: row.name || '',
        description: row.description || '',
        billing_ratio: Number(row.billing_ratio ?? 1),
        sort_order: Number(row.sort_order || 0),
        enabled: !row.enabled,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.update_failed'));
        return;
      }
      setRows((prev) =>
        sortCatalogRows(prev.map((item) => (item.id === data.id ? data : item)))
      );
      showSuccess(t('group_manage.messages.update_success'));
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget || submitting) return;
    setSubmitting(true);
    try {
      const encodedID = encodeURIComponent(deleteTarget.id || '');
      const res = await API.delete(`/api/v1/admin/group/${encodedID}`);
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.delete_failed'));
        return;
      }
      setRows((prev) => prev.filter((row) => row.id !== deleteTarget.id));
      showSuccess(t('group_manage.messages.delete_success'));
      setDeleteOpen(false);
      setDeleteTarget(null);
      if (editForm.id === deleteTarget.id) {
        resetEditPanel();
      }
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {createVisible && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={panelTitleStyle}>{t('group_manage.modal.create_title')}</div>
            <div style={panelActionsStyle}>
              <Button onClick={closeCreatePanel} disabled={submitting}>
                {t('group_manage.buttons.cancel')}
              </Button>
              <Button primary onClick={submitCreate} loading={submitting}>
                {t('group_manage.buttons.confirm')}
              </Button>
            </div>
          </div>
          <Form>
            <Form.Group widths='equal'>
              <Form.Input
                required
                label={t('group_manage.form.id')}
                placeholder={t('group_manage.form.id_placeholder')}
                value={createForm.id}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, id: e.target.value }))
                }
              />
              <Form.Input
                label={t('group_manage.form.name')}
                placeholder={t('group_manage.form.name_placeholder')}
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </Form.Group>
            <Form.TextArea
              label={t('group_manage.form.description')}
              placeholder={t('group_manage.form.description_placeholder')}
              value={createForm.description}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
            <Form.Group widths='equal'>
              <Form.Input
                type='number'
                min='0'
                step='0.01'
                label={t('group_manage.form.billing_ratio')}
                placeholder={t('group_manage.form.billing_ratio_placeholder')}
                value={createForm.billing_ratio}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    billing_ratio: e.target.value,
                  }))
                }
              />
              <Form.Dropdown
                fluid
                multiple
                search
                selection
                loading={createChannelOptionsLoading}
                disabled={createChannelOptionsLoading || submitting}
                label={t('group_manage.form.channels')}
                placeholder={t('group_manage.form.channels_placeholder')}
                options={createChannelOptions}
                value={createChannelIDs}
                onChange={(e, { value }) =>
                  setCreateChannelIDs(Array.isArray(value) ? value : [])
                }
              />
            </Form.Group>
          </Form>
        </div>
      )}

      {editVisible && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={panelTitleStyle}>{t('group_manage.modal.edit_title')}</div>
            <div style={panelActionsStyle}>
              <Button onClick={closeEditPanel} disabled={submitting}>
                {t('group_manage.buttons.cancel')}
              </Button>
              <Button primary onClick={submitEdit} loading={submitting}>
                {t('group_manage.buttons.confirm')}
              </Button>
            </div>
          </div>
          <Form>
            <Form.Group widths='equal'>
              <Form.Input
                disabled
                label={t('group_manage.form.id')}
                value={editForm.id}
              />
              <Form.Input
                label={t('group_manage.form.name')}
                placeholder={t('group_manage.form.name_placeholder')}
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
            </Form.Group>
            <Form.TextArea
              label={t('group_manage.form.description')}
              placeholder={t('group_manage.form.description_placeholder')}
              value={editForm.description}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
            <Form.Group widths='equal'>
              <Form.Input
                type='number'
                min='0'
                step='0.01'
                label={t('group_manage.form.billing_ratio')}
                placeholder={t('group_manage.form.billing_ratio_placeholder')}
                value={editForm.billing_ratio}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    billing_ratio: e.target.value,
                  }))
                }
              />
              <Form.Input
                type='number'
                label={t('group_manage.form.sort_order')}
                value={editForm.sort_order}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    sort_order: Number(e.target.value || 0),
                  }))
                }
              />
            </Form.Group>
            <Form.Dropdown
              fluid
              multiple
              search
              selection
              loading={editChannelOptionsLoading}
              disabled={editChannelOptionsLoading || submitting}
              label={t('group_manage.form.channels')}
              placeholder={t('group_manage.form.channels_placeholder')}
              options={editChannelOptions}
              value={editChannelIDs}
              onChange={(e, { value }) =>
                setEditChannelIDs(Array.isArray(value) ? value : [])
              }
            />
          </Form>
        </div>
      )}

      <Table basic='very' compact size='small'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t('group_manage.table.id')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.name')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.description')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.billing_ratio')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.status')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.sort_order')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.updated_at')}</Table.HeaderCell>
            <Table.HeaderCell style={{ width: '260px' }}>
              {t('group_manage.table.actions')}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.id}>
              <Table.Cell>{row.id}</Table.Cell>
              <Table.Cell>{row.name || '-'}</Table.Cell>
              <Table.Cell>{row.description || '-'}</Table.Cell>
              <Table.Cell>{Number(row.billing_ratio ?? 1).toFixed(2)}</Table.Cell>
              <Table.Cell>
                {row.enabled ? (
                  <Label basic color='green'>
                    {t('group_manage.status.enabled')}
                  </Label>
                ) : (
                  <Label basic color='grey'>
                    {t('group_manage.status.disabled')}
                  </Label>
                )}
              </Table.Cell>
              <Table.Cell>{row.sort_order || 0}</Table.Cell>
              <Table.Cell>{row.updated_at ? timestamp2string(row.updated_at) : '-'}</Table.Cell>
              <Table.Cell>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <Button
                    size='tiny'
                    disabled={submitting || loading}
                    onClick={() => {
                      openEditPanel(row).then();
                    }}
                  >
                    {t('group_manage.buttons.edit')}
                  </Button>
                  <Button
                    size='tiny'
                    color={row.enabled ? 'orange' : 'green'}
                    disabled={submitting || loading}
                    onClick={() => toggleEnabled(row)}
                  >
                    {row.enabled
                      ? t('group_manage.buttons.disable')
                      : t('group_manage.buttons.enable')}
                  </Button>
                  <Button
                    size='tiny'
                    negative
                    disabled={submitting || loading}
                    onClick={() => openDeleteModal(row)}
                  >
                    {t('group_manage.buttons.delete')}
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
          {rows.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={8} textAlign='center'>
                {loading
                  ? t('group_manage.messages.loading')
                  : t('group_manage.messages.empty')}
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table>

      <Modal open={deleteOpen} onClose={closeDeleteModal} size='tiny'>
        <Modal.Header>{t('group_manage.modal.delete_title')}</Modal.Header>
        <Modal.Content>
          {t('group_manage.modal.delete_confirm', {
            id: deleteTarget?.id || '',
          })}
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={closeDeleteModal} disabled={submitting}>
            {t('group_manage.buttons.cancel')}
          </Button>
          <Button negative onClick={submitDelete} loading={submitting}>
            {t('group_manage.buttons.confirm')}
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
});

GroupsManager.displayName = 'GroupsManager';

export default GroupsManager;
