import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Form, Card } from 'semantic-ui-react';
import { useNavigate } from 'react-router-dom';
import { API, downloadTextAsFile, showError, showSuccess } from '../../helpers';
import { renderQuotaWithPrompt } from '../../helpers/render';

const EditRedemption = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const originInputs = {
    name: '',
    quota: 100000,
    count: 1,
  };
  const [inputs, setInputs] = useState(originInputs);
  const { name, quota, count } = inputs;

  const handleCancel = () => {
    navigate('/redemption');
  };

  const handleInputChange = (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  const submit = async () => {
    if (inputs.name === '') return;
    const localInputs = { ...inputs };
    localInputs.count = parseInt(localInputs.count);
    localInputs.quota = parseInt(localInputs.quota);
    const res = await API.post(`/api/v1/admin/redemption/`, {
      ...localInputs,
    });
    const { success, message, data } = res.data;
    if (success) {
      showSuccess(t('redemption.messages.create_success'));
      if (data) {
        let text = '';
        for (let i = 0; i < data.length; i++) {
          text += data[i] + '\n';
        }
        downloadTextAsFile(text, `${inputs.name}.txt`);
      }
      setInputs(originInputs);
      navigate('/redemption');
    } else {
      showError(message);
    }
  };

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header router-page-title'>
            {t('redemption.edit.title_create')}
          </Card.Header>
          <div className='router-toolbar router-block-gap-sm'>
            <div className='router-toolbar-start'>
              <Button className='router-page-button' onClick={handleCancel}>
                {t('redemption.edit.buttons.cancel')}
              </Button>
              <Button className='router-page-button' positive onClick={submit}>
                {t('redemption.edit.buttons.submit')}
              </Button>
            </div>
          </div>
          <Form autoComplete='new-password'>
            <Form.Field>
              <Form.Input
                className='router-section-input'
                label={t('redemption.edit.name')}
                name='name'
                placeholder={t('redemption.edit.name_placeholder')}
                onChange={handleInputChange}
                value={name}
                autoComplete='new-password'
                required
              />
            </Form.Field>
            <Form.Field>
              <Form.Input
                className='router-section-input'
                label={`${t('redemption.edit.quota')}${renderQuotaWithPrompt(quota, t)}`}
                name='quota'
                placeholder={t('redemption.edit.quota_placeholder')}
                onChange={handleInputChange}
                value={quota}
                autoComplete='new-password'
                type='number'
              />
            </Form.Field>
            <Form.Field>
              <Form.Input
                className='router-section-input'
                label={t('redemption.edit.count')}
                name='count'
                placeholder={t('redemption.edit.count_placeholder')}
                onChange={handleInputChange}
                value={count}
                autoComplete='new-password'
                type='number'
              />
            </Form.Field>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
};

export default EditRedemption;
