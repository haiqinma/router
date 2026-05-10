import React from 'react';
import { Button, Label, Modal, Table } from 'semantic-ui-react';

const ChannelComplexPricingModal = ({
  t,
  open,
  onClose,
  data,
  normalizeChannelModelType,
}) => {
  return (
    <Modal size='large' open={open} onClose={onClose}>
      <Modal.Header>
        {t('channel.edit.model_selector.pricing_detail_title')}
      </Modal.Header>
      <Modal.Content scrolling>
        <div className='router-block-gap-sm'>
          <div className='router-text-meta'>
            {t('channel.edit.model_selector.pricing_detail_model', {
              model: data?.model || data?.alias || '-',
            })}
          </div>
          {data?.alias && data.alias !== data.model ? (
            <div className='router-text-meta'>
              {t('channel.edit.model_selector.pricing_detail_alias', {
                alias: data.alias,
              })}
            </div>
          ) : null}
        </div>
        {(data?.details || []).length === 0 ? (
          <div className='router-empty-cell'>
            {t('channel.edit.model_selector.pricing_detail_empty')}
          </div>
        ) : (
          (data?.details || []).map((detail, index) => (
            <div
              key={`${detail.provider || 'provider'}-${detail.model || 'model'}-${index}`}
              className='router-block-gap-sm'
              style={{ marginBottom: '1rem' }}
            >
              <div className='router-toolbar router-block-gap-sm'>
                <div className='router-toolbar-start'>
                  <Label basic className='router-tag'>
                    {detail.provider || '-'}
                  </Label>
                  <Label basic className='router-tag'>
                    {detail.model || '-'}
                  </Label>
                  <Label basic className='router-tag'>
                    {t(
                      `channel.model_types.${normalizeChannelModelType(detail.type)}`,
                    )}
                  </Label>
                  {(detail.supported_endpoints || []).map((endpoint) => (
                    <Label
                      key={`${detail.provider || 'provider'}-${detail.model || 'model'}-${endpoint}`}
                      basic
                      className='router-tag'
                    >
                      {endpoint}
                    </Label>
                  ))}
                </div>
              </div>
              <Table celled compact className='router-detail-subtable'>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.component')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.condition')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.input_price')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.output_price')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.price_unit')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.currency')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.source')}
                    </Table.HeaderCell>
                    <Table.HeaderCell>
                      {t('channel.edit.model_selector.pricing_detail_table.source_url')}
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {detail.price_components.map((component, componentIndex) => (
                    <Table.Row
                      key={`${detail.provider || 'provider'}-${detail.model || 'model'}-${component.component || 'component'}-${component.condition || 'condition'}-${componentIndex}`}
                    >
                      <Table.Cell>{component.component || '-'}</Table.Cell>
                      <Table.Cell>{component.condition || '-'}</Table.Cell>
                      <Table.Cell>{component.input_price || 0}</Table.Cell>
                      <Table.Cell>{component.output_price || 0}</Table.Cell>
                      <Table.Cell>{component.price_unit || '-'}</Table.Cell>
                      <Table.Cell>{component.currency || 'USD'}</Table.Cell>
                      <Table.Cell>{component.source || 'manual'}</Table.Cell>
                      <Table.Cell>{component.source_url || '-'}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          ))
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button type='button' className='router-modal-button' onClick={onClose}>
          {t('channel.edit.buttons.cancel')}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default ChannelComplexPricingModal;
