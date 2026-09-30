import React from 'react';
import {
  AppAlert,
  AppButton,
  AppField,
  AppFormActions,
  AppFormRow,
  AppInput,
  AppModal,
  AppSelect,
  AppSwitch,
  AppTextarea,
} from '../../../router-ui';

const ChannelEndpointBatchPolicyModal = ({
  t,
  open,
  onClose,
  saving,
  targetCount,
  templateOptions,
  selectedTemplate,
  applyTemplate,
  draft,
  setDraft,
  onApply,
}) => {
  const templateKey = (draft.template_key || '').toString().trim();
  const isAccessBaseURLPolicy = templateKey === 'OVERRIDE_ENDPOINT_BASE_URL';
  const usesRawPolicyJSON =
    templateKey === 'IMAGE_URL_TO_BASE64' ||
    templateKey === 'CUSTOM_REQUEST_POLICY';

  return (
    <AppModal
      size='large'
      open={open}
      onClose={onClose}
      closeOnDimmerClick={!saving}
      title={t('channel.edit.endpoint_capabilities.batch.apply_modal.title')}
      footer={
        <AppFormActions>
          <AppButton
            type='button'
            className='router-modal-button'
            onClick={onClose}
            disabled={saving}
          >
            {t('channel.edit.buttons.cancel')}
          </AppButton>
          <AppButton
            type='button'
            className='router-modal-button'
            color='blue'
            loading={saving}
            disabled={saving || templateKey === '' || targetCount === 0}
            onClick={onApply}
          >
            {t('channel.edit.endpoint_capabilities.batch.apply_modal.apply')}
          </AppButton>
        </AppFormActions>
      }
    >
      <div className='router-modal-scroll-body'>
        <div className='router-block-gap'>
          <AppAlert
            type='info'
            showIcon
            className='router-section-message'
            title={t(
              'channel.edit.endpoint_capabilities.batch.apply_modal.hint',
            )}
          />
          <AppAlert
            type='warning'
            showIcon
            className='router-section-message'
            title={t(
              'channel.edit.endpoint_capabilities.batch.apply_modal.target_summary',
              { count: targetCount },
            )}
          />
          <AppFormRow>
            <AppField label={t('channel.edit.endpoint_policies.editor.template')}>
              <AppSelect
                clearable
                className='router-modal-dropdown'
                fluid
                options={templateOptions}
                value={selectedTemplate}
                placeholder={t(
                  'channel.edit.endpoint_policies.editor.template_placeholder',
                )}
                onChange={(e, { value }) => {
                  const nextValue = (value || '').toString();
                  if (nextValue === '') {
                    applyTemplate('');
                    return;
                  }
                  applyTemplate(nextValue);
                }}
              />
            </AppField>
          </AppFormRow>
          {templateKey === 'IMAGE_URL_TO_BASE64' ? (
            <AppAlert
              type='warning'
              showIcon
              className='router-section-message'
              title={t(
                'channel.edit.endpoint_policies.editor.image_url_to_base64_hint',
              )}
            />
          ) : null}
          {isAccessBaseURLPolicy ? (
            <AppFormRow>
              <AppField
                label={t('channel.edit.endpoint_policies.editor.access_base_url')}
              >
                <AppInput
                  className='router-modal-input'
                  value={draft.access_base_url || ''}
                  placeholder={t(
                    'channel.edit.endpoint_policies.editor.access_base_url_placeholder',
                  )}
                  onChange={(e, { value }) =>
                    setDraft((prev) => ({
                      ...prev,
                      access_base_url: value || '',
                    }))
                  }
                />
              </AppField>
            </AppFormRow>
          ) : null}
          <AppFormRow>
            <AppField label={t('channel.edit.endpoint_policies.editor.status')}>
              <AppSwitch
                checked={draft.enabled === true}
                onChange={(_, { checked }) =>
                  setDraft((prev) => ({
                    ...prev,
                    enabled: checked === true,
                  }))
                }
              />
            </AppField>
          </AppFormRow>
          <AppFormRow>
            <AppField label={t('channel.edit.endpoint_policies.table.reason')}>
              <AppTextarea
                className='router-section-textarea router-code-textarea router-code-textarea-sm'
                value={draft.reason}
                onChange={(e, { value }) =>
                  setDraft((prev) => ({
                    ...prev,
                    reason: value || '',
                  }))
                }
              />
            </AppField>
          </AppFormRow>
          {usesRawPolicyJSON ? (
            <>
              <AppFormRow>
                <AppField
                  label={t('channel.edit.endpoint_policies.editor.capabilities')}
                >
                  <AppTextarea
                    className='router-section-textarea router-code-textarea router-code-textarea-md'
                    placeholder='{"input_image_url": false}'
                    value={draft.capabilities}
                    onChange={(e, { value }) =>
                      setDraft((prev) => ({
                        ...prev,
                        capabilities: value || '',
                      }))
                    }
                  />
                </AppField>
              </AppFormRow>
              <AppFormRow>
                <AppField
                  label={t('channel.edit.endpoint_policies.editor.request_policy')}
                >
                  <AppTextarea
                    className='router-section-textarea router-code-textarea router-code-textarea-md'
                    placeholder='{"actions":[{"type":"image_url_to_base64","input_types":["anthropic.image_url","openai.image_url","openai.input_image"]}]}'
                    value={draft.request_policy}
                    onChange={(e, { value }) =>
                      setDraft((prev) => ({
                        ...prev,
                        request_policy: value || '',
                      }))
                    }
                  />
                </AppField>
              </AppFormRow>
              <AppFormRow>
                <AppField
                  label={t('channel.edit.endpoint_policies.editor.response_policy')}
                >
                  <AppTextarea
                    className='router-section-textarea router-code-textarea router-code-textarea-md'
                    placeholder='{}'
                    value={draft.response_policy}
                    onChange={(e, { value }) =>
                      setDraft((prev) => ({
                        ...prev,
                        response_policy: value || '',
                      }))
                    }
                  />
                </AppField>
              </AppFormRow>
            </>
          ) : null}
        </div>
      </div>
    </AppModal>
  );
};

export default ChannelEndpointBatchPolicyModal;
