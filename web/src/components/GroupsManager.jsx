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
  name: '',
  display_name: '',
  description: '',
  billing_ratio: 1,
  sort_order: 0,
});

const GroupsManager = forwardRef((_, ref) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(createEmptyForm());

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(createEmptyForm());

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bindingOpen, setBindingOpen] = useState(false);
  const [bindingTarget, setBindingTarget] = useState(null);
  const [bindingOptions, setBindingOptions] = useState([]);
  const [bindingChannelIDs, setBindingChannelIDs] = useState([]);
  const [bindingLoading, setBindingLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/v1/admin/group/catalog');
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.load_failed'));
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCatalog().then();
  }, [loadCatalog]);

  const openCreateModal = () => {
    if (submitting) return;
    setCreateForm(createEmptyForm());
    setCreateOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openCreateModal,
  }));

  const closeCreateModal = () => {
    if (submitting) return;
    setCreateOpen(false);
    setCreateForm(createEmptyForm());
  };

  const openEditModal = (row) => {
    if (!row || submitting) return;
    setEditForm({
      name: row.name || '',
      display_name: row.display_name || '',
      description: row.description || '',
      billing_ratio: Number(row.billing_ratio ?? 1),
      sort_order: row.sort_order || 0,
    });
    setEditOpen(true);
  };

  const closeEditModal = () => {
    if (submitting) return;
    setEditOpen(false);
    setEditForm(createEmptyForm());
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

  const openBindingModal = async (row) => {
    if (!row || submitting) return;
    setBindingTarget(row);
    setBindingOpen(true);
    setBindingLoading(true);
    try {
      const encodedName = encodeURIComponent(row.name || '');
      const res = await API.get(`/api/v1/admin/group/${encodedName}/channels`);
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.bind_load_failed'));
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      setBindingOptions(
        rows.map((item) => ({
          key: item.id,
          text: `${item.name || item.id} (${item.id})`,
          value: item.id,
        }))
      );
      setBindingChannelIDs(
        rows.filter((item) => !!item.bound).map((item) => item.id)
      );
    } catch (error) {
      showError(error);
    } finally {
      setBindingLoading(false);
    }
  };

  const closeBindingModal = () => {
    if (submitting) return;
    setBindingOpen(false);
    setBindingTarget(null);
    setBindingOptions([]);
    setBindingChannelIDs([]);
    setBindingLoading(false);
  };

  const submitCreate = async () => {
    const name = (createForm.name || '').trim();
    if (name === '') {
      showInfo(t('group_manage.messages.name_required'));
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
        name,
        display_name: (createForm.display_name || '').trim(),
        description: (createForm.description || '').trim(),
        billing_ratio: billingRatio,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.create_failed'));
        return;
      }
      setRows((prev) => [...prev, data].sort((a, b) => {
        const aOrder = Number(a.sort_order || 0);
        const bOrder = Number(b.sort_order || 0);
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return (a.name || '').localeCompare(b.name || '');
      }));
      showSuccess(t('group_manage.messages.create_success'));
      setCreateOpen(false);
      setCreateForm(createEmptyForm());
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async () => {
    const name = (editForm.name || '').trim();
    if (name === '') {
      showInfo(t('group_manage.messages.name_required'));
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
        name,
        display_name: (editForm.display_name || '').trim(),
        description: (editForm.description || '').trim(),
        billing_ratio: billingRatio,
        sort_order: Number(editForm.sort_order || 0),
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.update_failed'));
        return;
      }
      setRows((prev) =>
        prev
          .map((row) => (row.name === data.name ? data : row))
          .sort((a, b) => {
            const aOrder = Number(a.sort_order || 0);
            const bOrder = Number(b.sort_order || 0);
            if (aOrder !== bOrder) {
              return aOrder - bOrder;
            }
            return (a.name || '').localeCompare(b.name || '');
          })
      );
      showSuccess(t('group_manage.messages.update_success'));
      setEditOpen(false);
      setEditForm(createEmptyForm());
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
        name: row.name,
        display_name: row.display_name || '',
        description: row.description || '',
        sort_order: Number(row.sort_order || 0),
        enabled: !row.enabled,
      });
      const { success, message, data } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.update_failed'));
        return;
      }
      setRows((prev) =>
        prev.map((item) => (item.name === data.name ? data : item))
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
      const encodedName = encodeURIComponent(deleteTarget.name || '');
      const res = await API.delete(`/api/v1/admin/group/${encodedName}`);
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.delete_failed'));
        return;
      }
      setRows((prev) => prev.filter((row) => row.name !== deleteTarget.name));
      showSuccess(t('group_manage.messages.delete_success'));
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const submitBinding = async () => {
    if (!bindingTarget || submitting) return;
    setSubmitting(true);
    try {
      const encodedName = encodeURIComponent(bindingTarget.name || '');
      const res = await API.put(`/api/v1/admin/group/${encodedName}/channels`, {
        channel_ids: bindingChannelIDs,
      });
      const { success, message } = res.data || {};
      if (!success) {
        showError(message || t('group_manage.messages.bind_update_failed'));
        return;
      }
      showSuccess(t('group_manage.messages.bind_update_success'));
      closeBindingModal();
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Table basic='very' compact size='small'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t('group_manage.table.name')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.display_name')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.description')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.billing_ratio')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.status')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.sort_order')}</Table.HeaderCell>
            <Table.HeaderCell>{t('group_manage.table.updated_at')}</Table.HeaderCell>
            <Table.HeaderCell style={{ width: '320px' }}>
              {t('group_manage.table.actions')}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.name}>
              <Table.Cell>{row.name}</Table.Cell>
              <Table.Cell>{row.display_name || '-'}</Table.Cell>
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
                    onClick={() => openEditModal(row)}
                  >
                    {t('group_manage.buttons.edit')}
                  </Button>
                  <Button
                    size='tiny'
                    disabled={submitting || loading}
                    onClick={() => {
                      openBindingModal(row).then();
                    }}
                  >
                    {t('group_manage.buttons.bind_channels')}
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

      <Modal open={createOpen} onClose={closeCreateModal} size='small'>
        <Modal.Header>{t('group_manage.modal.create_title')}</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Input
              required
              label={t('group_manage.form.name')}
              placeholder={t('group_manage.form.name_placeholder')}
              value={createForm.name}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <Form.Input
              label={t('group_manage.form.display_name')}
              placeholder={t('group_manage.form.display_name_placeholder')}
              value={createForm.display_name}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  display_name: e.target.value,
                }))
              }
            />
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
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={closeCreateModal} disabled={submitting}>
            {t('group_manage.buttons.cancel')}
          </Button>
          <Button primary onClick={submitCreate} loading={submitting}>
            {t('group_manage.buttons.confirm')}
          </Button>
        </Modal.Actions>
      </Modal>

      <Modal open={editOpen} onClose={closeEditModal} size='small'>
        <Modal.Header>{t('group_manage.modal.edit_title')}</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Input
              disabled
              label={t('group_manage.form.name')}
              value={editForm.name}
            />
            <Form.Input
              label={t('group_manage.form.display_name')}
              placeholder={t('group_manage.form.display_name_placeholder')}
              value={editForm.display_name}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  display_name: e.target.value,
                }))
              }
            />
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
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={closeEditModal} disabled={submitting}>
            {t('group_manage.buttons.cancel')}
          </Button>
          <Button primary onClick={submitEdit} loading={submitting}>
            {t('group_manage.buttons.confirm')}
          </Button>
        </Modal.Actions>
      </Modal>

      <Modal open={deleteOpen} onClose={closeDeleteModal} size='tiny'>
        <Modal.Header>{t('group_manage.modal.delete_title')}</Modal.Header>
        <Modal.Content>
          {t('group_manage.modal.delete_confirm', {
            name: deleteTarget?.name || '',
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

      <Modal open={bindingOpen} onClose={closeBindingModal} size='small'>
        <Modal.Header>
          {t('group_manage.modal.bind_channels_title', {
            name: bindingTarget?.name || '',
          })}
        </Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Dropdown
              fluid
              multiple
              search
              selection
              loading={bindingLoading}
              disabled={bindingLoading || submitting}
              label={t('group_manage.form.channels')}
              placeholder={t('group_manage.form.channels_placeholder')}
              options={bindingOptions}
              value={bindingChannelIDs}
              onChange={(e, { value }) =>
                setBindingChannelIDs(Array.isArray(value) ? value : [])
              }
            />
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={closeBindingModal} disabled={submitting || bindingLoading}>
            {t('group_manage.buttons.cancel')}
          </Button>
          <Button primary onClick={submitBinding} loading={submitting}>
            {t('group_manage.buttons.confirm')}
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
});

GroupsManager.displayName = 'GroupsManager';

export default GroupsManager;
