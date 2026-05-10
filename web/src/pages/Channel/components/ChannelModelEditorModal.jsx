import React from 'react';
import { Button, Checkbox, Dropdown, Form, Modal, Table } from 'semantic-ui-react';

const priceUnitOptions = [
  { key: 'per_1k_tokens', value: 'per_1k_tokens', text: 'per_1k_tokens' },
  { key: 'per_1k_chars', value: 'per_1k_chars', text: 'per_1k_chars' },
  { key: 'per_image', value: 'per_image', text: 'per_image' },
  { key: 'per_video', value: 'per_video', text: 'per_video' },
  { key: 'per_minute', value: 'per_minute', text: 'per_minute' },
  { key: 'per_second', value: 'per_second', text: 'per_second' },
  { key: 'per_request', value: 'per_request', text: 'per_request' },
  { key: 'per_task', value: 'per_task', text: 'per_task' },
];

const ChannelModelEditorModal = ({
  t,
  open,
  onClose,
  detailModelMutating,
  detailEditingModelRow,
  normalizeChannelModelType,
  updateModelConfigField,
  providerCatalogLoading,
  getProviderSelectOptionsForModel,
  resolvePreferredProviderForModel,
  openAppendProviderModal,
  canSelectChannelModel,
  toggleModelSelection,
  getComplexPricingDetailsForModel,
  saveDetailModelsConfig,
}) => {
  const providerComponentDefaults =
    (getComplexPricingDetailsForModel(detailEditingModelRow || {})[0]
      ?.price_components || []);
  const effectivePriceComponents =
    (detailEditingModelRow?.price_components || []).length > 0
      ? detailEditingModelRow.price_components
      : providerComponentDefaults;
  const hasComponentPricing = effectivePriceComponents.length > 0;

  const updatePriceComponentField = (index, field, value) => {
    const nextComponents = effectivePriceComponents.map((component, itemIndex) => {
      if (itemIndex !== index) {
        return component;
      }
      if (field === 'input_price' || field === 'output_price') {
        const price = Number(value);
        return {
          ...component,
          [field]: Number.isFinite(price) && price >= 0 ? price : 0,
          source: 'channel_override',
        };
      }
      return {
        ...component,
        [field]: value || '',
        source: 'channel_override',
      };
    });
    updateModelConfigField(
      detailEditingModelRow.upstream_model,
      'price_components',
      nextComponents,
    );
  };

  return (
    <Modal
      size='small'
      open={open}
      onClose={onClose}
      closeOnDimmerClick={!detailModelMutating}
      closeOnEscape={!detailModelMutating}
      className='router-channel-model-editor-modal'
    >
      <Modal.Header>
        {`${t('common.edit')} · ${detailEditingModelRow?.upstream_model || '-'}`}
      </Modal.Header>
      <Modal.Content>
        {detailEditingModelRow ? (
          <Form className='router-channel-model-editor-form'>
            <div className='router-channel-model-editor-card'>
              <div className='router-channel-model-editor-section-title'>
                {t('channel.edit.model_selector.editor.info_title')}
              </div>
              <Form.Group widths='equal'>
                <Form.Input
                  className='router-modal-input'
                  label={t('channel.edit.model_selector.table.name')}
                  value={detailEditingModelRow.upstream_model || '-'}
                  readOnly
                />
                <Form.Input
                  className='router-modal-input'
                  label={t('channel.edit.model_selector.table.type')}
                  value={t(
                    `channel.model_types.${normalizeChannelModelType(detailEditingModelRow.type)}`,
                  )}
                  readOnly
                />
              </Form.Group>
              <Form.Group widths='equal'>
                <Form.Input
                  className='router-modal-input'
                  label={t('channel.edit.model_selector.table.alias')}
                  value={detailEditingModelRow.model || ''}
                  onChange={(e, { value }) =>
                    updateModelConfigField(
                      detailEditingModelRow.upstream_model,
                      'model',
                      value || detailEditingModelRow.upstream_model,
                    )
                  }
                />
              </Form.Group>
              <Form.Field>
                <label>{t('channel.edit.model_selector.table.providers')}</label>
                <div className='router-channel-model-editor-provider-row'>
                  <Dropdown
                    selection
                    fluid
                    className='router-modal-dropdown'
                    placeholder={t(
                      'channel.edit.model_selector.editor.provider_placeholder',
                    )}
                    options={getProviderSelectOptionsForModel(
                      detailEditingModelRow,
                    )}
                    value={resolvePreferredProviderForModel(
                      detailEditingModelRow,
                    )}
                    disabled={
                      providerCatalogLoading ||
                      getProviderSelectOptionsForModel(detailEditingModelRow)
                        .length === 0
                    }
                    onChange={(e, { value }) =>
                      updateModelConfigField(
                        detailEditingModelRow.upstream_model,
                        'provider',
                        value || '',
                      )
                    }
                  />
                  {getProviderSelectOptionsForModel(detailEditingModelRow)
                    .length === 0 ? (
                    <>
                      <span className='router-text-meta'>
                        {t('channel.edit.model_selector.editor.provider_empty')}
                      </span>
                      <Button
                        type='button'
                        className='router-inline-button'
                        basic
                        onClick={() => openAppendProviderModal(detailEditingModelRow)}
                      >
                        {t('channel.edit.model_selector.provider_add')}
                      </Button>
                    </>
                  ) : null}
                </div>
              </Form.Field>
            </div>

            <div className='router-channel-model-editor-card'>
              <div className='router-channel-model-editor-section-title'>
                {t('channel.edit.model_selector.editor.status_title')}
              </div>
              <div className='router-channel-model-editor-toggle-row'>
                <div className='router-channel-model-editor-toggle-copy'>
                  <div className='router-channel-model-editor-toggle-label'>
                    {t('channel.edit.model_selector.table.selected')}
                  </div>
                  <div className='router-channel-model-editor-toggle-hint'>
                    {t('channel.edit.model_selector.editor.status_hint')}
                  </div>
                </div>
                <Checkbox
                  toggle
                  checked={!!detailEditingModelRow.selected}
                  disabled={
                    detailModelMutating ||
                    providerCatalogLoading ||
                    (!canSelectChannelModel(detailEditingModelRow) &&
                      !detailEditingModelRow.selected)
                  }
                  onChange={(e, { checked }) =>
                    toggleModelSelection(
                      detailEditingModelRow.upstream_model,
                      checked,
                    )
                  }
                />
              </div>
            </div>

            <div className='router-channel-model-editor-card'>
              <div className='router-channel-model-editor-section-title'>
                {t('channel.edit.model_selector.editor.pricing_title')}
              </div>
              {hasComponentPricing ? (
                <div className='router-channel-model-editor-table-wrap'>
                  <Table
                    celled
                    compact
                    className='router-detail-subtable router-channel-model-editor-pricing-table'
                  >
                    <colgroup>
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '27%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>
                        {t('channel.edit.model_selector.pricing_detail_table.component')}
                      </Table.HeaderCell>
                      <Table.HeaderCell>
                        {t('channel.edit.model_selector.pricing_detail_table.condition')}
                      </Table.HeaderCell>
                      <Table.HeaderCell>
                        {t('channel.edit.model_selector.table.input_price')}
                      </Table.HeaderCell>
                      <Table.HeaderCell>
                        {t('channel.edit.model_selector.table.output_price')}
                      </Table.HeaderCell>
                      <Table.HeaderCell>
                        {t('channel.edit.model_selector.table.price_unit')}
                      </Table.HeaderCell>
                      <Table.HeaderCell>
                        {t('channel.edit.model_selector.pricing_detail_table.currency')}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {effectivePriceComponents.map((component, index) => (
                      <Table.Row
                        key={`${component.component || 'component'}-${component.condition || 'default'}-${index}`}
                      >
                        <Table.Cell>{component.component || '-'}</Table.Cell>
                        <Table.Cell>{component.condition || '-'}</Table.Cell>
                        <Table.Cell>
                          <Form.Input
                            className='router-modal-input'
                            type='number'
                            min='0'
                            step='0.000001'
                            value={component.input_price ?? 0}
                            onChange={(e, { value }) =>
                              updatePriceComponentField(index, 'input_price', value)
                            }
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Form.Input
                            className='router-modal-input'
                            type='number'
                            min='0'
                            step='0.000001'
                            value={component.output_price ?? 0}
                            onChange={(e, { value }) =>
                              updatePriceComponentField(index, 'output_price', value)
                            }
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Form.Select
                            className='router-modal-dropdown'
                            options={priceUnitOptions}
                            value={component.price_unit || 'per_1k_tokens'}
                            onChange={(e, { value }) =>
                              updatePriceComponentField(
                                index,
                                'price_unit',
                                value || 'per_1k_tokens',
                              )
                            }
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Form.Input
                            className='router-modal-input'
                            value={component.currency || 'USD'}
                            onChange={(e, { value }) =>
                              updatePriceComponentField(index, 'currency', value || 'USD')
                            }
                          />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                  </Table>
                </div>
              ) : (
                <Form.Group widths='equal'>
                  <Form.Select
                    className='router-modal-dropdown'
                    label={t('channel.edit.model_selector.table.price_unit')}
                    options={priceUnitOptions}
                    value={detailEditingModelRow.price_unit || 'per_1k_tokens'}
                    onChange={(e, { value }) =>
                      updateModelConfigField(
                        detailEditingModelRow.upstream_model,
                        'price_unit',
                        value || 'per_1k_tokens',
                      )
                    }
                  />
                  <Form.Input
                    className='router-modal-input'
                    type='number'
                    min='0'
                    step='0.000001'
                    label={t('channel.edit.model_selector.table.input_price')}
                    placeholder='-'
                    value={detailEditingModelRow.input_price ?? ''}
                    onChange={(e, { value }) =>
                      updateModelConfigField(
                        detailEditingModelRow.upstream_model,
                        'input_price',
                        value,
                      )
                    }
                  />
                  <Form.Input
                    className='router-modal-input'
                    type='number'
                    min='0'
                    step='0.000001'
                    label={t('channel.edit.model_selector.table.output_price')}
                    placeholder='-'
                    value={detailEditingModelRow.output_price ?? ''}
                    onChange={(e, { value }) =>
                      updateModelConfigField(
                        detailEditingModelRow.upstream_model,
                        'output_price',
                        value,
                      )
                    }
                  />
                </Form.Group>
              )}
            </div>
          </Form>
        ) : null}
      </Modal.Content>
      <Modal.Actions>
        <Button
          type='button'
          className='router-modal-button'
          onClick={onClose}
          disabled={detailModelMutating}
        >
          {t('channel.edit.buttons.cancel')}
        </Button>
        <Button
          type='button'
          className='router-modal-button'
          color='blue'
          loading={detailModelMutating}
          disabled={detailModelMutating}
          onClick={saveDetailModelsConfig}
        >
          {t('channel.edit.buttons.save')}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default ChannelModelEditorModal;
