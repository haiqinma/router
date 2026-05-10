import React, { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Dropdown,
  Form,
  Message,
  Table,
} from 'semantic-ui-react';

const ChannelDetailEndpointsTab = ({
  t,
  columnWidths,
  endpointSummaryText,
  channelEndpoints,
  channelEndpointsLoading,
  channelEndpointsError,
  buildChannelEndpointKey,
  modelTestResultsByKey,
  endpointCapabilityReadonly,
  endpointMutatingKey,
  updateChannelEndpointCapability,
  channelEndpointPoliciesLoading,
  channelEndpointPolicies,
  channelEndpointPoliciesError,
  endpointPolicyReadonly,
  openEndpointPolicyEditor,
  timestamp2string,
}) => {
  const policyByKey = new Map(
    channelEndpointPolicies.map((row) => [
      buildChannelEndpointKey(row.model, row.endpoint),
      row,
    ]),
  );
  const [testStatusFilter, setTestStatusFilter] = useState('all');
  const [baseURLDrafts, setBaseURLDrafts] = useState({});
  const testStatusOptions = useMemo(
    () => [
      {
        key: 'all',
        value: 'all',
        text: t('channel.edit.endpoint_capabilities.filters.all_test_status'),
      },
      ...[
        'supported',
        'unsupported',
        'untested',
        'stale',
        'pending',
        'running',
        'skipped',
      ].map((status) => ({
        key: status,
        value: status,
        text: t(`channel.edit.model_tester.status.${status}`),
      })),
    ],
    [t],
  );
  const filteredRows = useMemo(() => {
    return channelEndpoints.filter((row) => {
      if (testStatusFilter === 'all') {
        return true;
      }
      const endpointKey = buildChannelEndpointKey(row.model, row.endpoint);
      const latestResult = modelTestResultsByKey.get(endpointKey) || null;
      const latestStatusKey = latestResult
        ? latestResult.supported === true &&
          latestResult.status === 'supported'
          ? 'supported'
          : latestResult.status || 'unsupported'
        : 'untested';
      return latestStatusKey === testStatusFilter;
    });
  }, [
    buildChannelEndpointKey,
    channelEndpoints,
    modelTestResultsByKey,
    testStatusFilter,
  ]);
  const resolveBaseURLDraft = (row, endpointKey) => {
    if (Object.prototype.hasOwnProperty.call(baseURLDrafts, endpointKey)) {
      return baseURLDrafts[endpointKey];
    }
    return row.base_url || '';
  };
  return (
    <section className='router-entity-detail-section'>
      <div className='router-entity-detail-section-header'>
        <div className='router-toolbar-start router-block-gap-sm'>
          <span className='router-entity-detail-section-title'>
            {t('channel.edit.endpoint_capabilities.title')}
          </span>
          <span className='router-toolbar-meta'>({endpointSummaryText})</span>
        </div>
      </div>
      <Form.Field>
        <Message info className='router-section-message'>
          {t('channel.edit.endpoint_capabilities.hint')}
        </Message>
        <div className='router-toolbar router-block-gap-sm'>
          <div className='router-toolbar-start router-block-gap-sm'>
            <Dropdown
              selection
              className='router-section-dropdown router-detail-filter-dropdown router-dropdown-min-170'
              options={testStatusOptions}
              value={testStatusFilter}
              disabled={channelEndpointsLoading || channelEndpoints.length === 0}
              placeholder={t('channel.edit.endpoint_capabilities.filters.test_status')}
              onChange={(e, { value }) =>
                setTestStatusFilter((value || 'all').toString())
              }
            />
          </div>
        </div>
        <Table
          celled
          stackable
          className='router-detail-table router-channel-endpoint-capability-table'
          compact='very'
        >
          <colgroup>
            {columnWidths.map((width, index) => (
              <col
                key={`channel-endpoint-col-${index}`}
                style={{ width }}
              />
            ))}
          </colgroup>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>
                {t('channel.edit.endpoint_capabilities.table.model')}
              </Table.HeaderCell>
              <Table.HeaderCell>
                {t('channel.edit.endpoint_capabilities.table.endpoint')}
              </Table.HeaderCell>
              <Table.HeaderCell>
                {t('channel.edit.endpoint_capabilities.table.base_url')}
              </Table.HeaderCell>
              <Table.HeaderCell textAlign='center'>
                {t('channel.edit.endpoint_capabilities.table.enabled')}
              </Table.HeaderCell>
              <Table.HeaderCell>
                {t('channel.edit.endpoint_capabilities.table.test_status')}
              </Table.HeaderCell>
              <Table.HeaderCell>
                {t('channel.edit.endpoint_policies.table.policy')}
              </Table.HeaderCell>
              <Table.HeaderCell>
                {t('channel.edit.endpoint_policies.table.actions')}
              </Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredRows.length === 0 ? (
              <Table.Row>
                <Table.Cell className='router-empty-cell' colSpan={7}>
                  {channelEndpointsLoading
                    ? t('channel.edit.endpoint_capabilities.loading')
                    : channelEndpoints.length === 0
                      ? t('channel.edit.endpoint_capabilities.empty')
                      : t('channel.edit.endpoint_capabilities.filtered_empty')}
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredRows.map((row) => {
                const endpointKey = buildChannelEndpointKey(
                  row.model,
                  row.endpoint,
                );
                const policyRow = policyByKey.get(endpointKey) || null;
                const latestResult = modelTestResultsByKey.get(endpointKey) || null;
                const latestStatusKey = latestResult
                  ? latestResult.supported === true &&
                    latestResult.status === 'supported'
                    ? 'supported'
                    : latestResult.status || 'unsupported'
                  : 'untested';
                const isMutating = endpointMutatingKey === endpointKey;
                const draftBaseURL = resolveBaseURLDraft(row, endpointKey);
                return (
                  <Table.Row key={endpointKey}>
                    <Table.Cell title={row.model}>
                      <span className='router-cell-truncate'>{row.model}</span>
                    </Table.Cell>
                    <Table.Cell title={row.endpoint}>
                      <span className='router-cell-truncate'>{row.endpoint}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <Form.Input
                        className='router-section-input'
                        placeholder={t(
                          'channel.edit.endpoint_capabilities.table.base_url_placeholder',
                        )}
                        value={draftBaseURL}
                        readOnly={endpointCapabilityReadonly || isMutating}
                        onChange={(e, { value }) => {
                          setBaseURLDrafts((prev) => ({
                            ...prev,
                            [endpointKey]: (value || '').toString(),
                          }));
                        }}
                        onBlur={() => {
                          const normalizedCurrent = (row.base_url || '').toString().trim();
                          const normalizedNext = (draftBaseURL || '').toString().trim();
                          if (normalizedCurrent === normalizedNext) {
                            return;
                          }
                          updateChannelEndpointCapability(
                            {
                              ...row,
                              base_url: normalizedNext,
                            },
                            { base_url: normalizedNext, enabled: row.enabled === true },
                            { skipConfirm: true },
                          );
                        }}
                      />
                    </Table.Cell>
                    <Table.Cell textAlign='center'>
                      <Checkbox
                        checked={row.enabled === true}
                        disabled={endpointCapabilityReadonly || isMutating}
                        onChange={(e, { checked }) =>
                          updateChannelEndpointCapability(row, { enabled: !!checked })
                        }
                      />
                    </Table.Cell>
                    <Table.Cell
                      title={t(
                        `channel.edit.model_tester.status.${latestStatusKey}`,
                      )}
                    >
                      <span className='router-cell-truncate'>
                        {t(`channel.edit.model_tester.status.${latestStatusKey}`)}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      {channelEndpointPoliciesLoading &&
                      channelEndpointPolicies.length === 0 ? (
                        <span className='router-cell-truncate'>
                          {t('channel.edit.endpoint_policies.loading')}
                        </span>
                      ) : policyRow ? (
                        <span className='router-cell-truncate'>
                          {policyRow.template_key || '-'}
                        </span>
                      ) : (
                        <span className='router-cell-truncate'>-</span>
                      )}
                    </Table.Cell>
                    <Table.Cell collapsing>
                      <Button
                        type='button'
                        className='router-inline-button'
                        disabled={endpointPolicyReadonly}
                        onClick={() => openEndpointPolicyEditor(row)}
                        title={
                          policyRow?.updated_at > 0
                            ? timestamp2string(policyRow.updated_at)
                            : row.updated_at > 0
                              ? timestamp2string(row.updated_at)
                              : undefined
                        }
                      >
                        {t('channel.edit.endpoint_policies.action')}
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table>
        {channelEndpointsError && (
          <div className='router-error-text router-error-text-top'>
            {channelEndpointsError}
          </div>
        )}
        {channelEndpointPoliciesError && (
          <div className='router-error-text router-error-text-top'>
            {channelEndpointPoliciesError}
          </div>
        )}
      </Form.Field>
    </section>
  );
};

export default ChannelDetailEndpointsTab;
