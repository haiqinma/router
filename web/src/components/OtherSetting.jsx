import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Divider, Form, Grid, Header, Message } from 'semantic-ui-react';
import { API, showError } from '../helpers';

const optionKeys = [
  'Notice',
  'About',
  'HomePageContent'
];

const OtherSetting = () => {
  const { t } = useTranslation();
  let [inputs, setInputs] = useState({
    Notice: '',
    About: '',
    HomePageContent: '',
  });
  let [loading, setLoading] = useState(false);

  const getOptions = useCallback(async () => {
    const res = await API.get('/api/v1/admin/option/');
    const { success, message, data } = res.data;
    if (success) {
      let newInputs = {};
      data.forEach((item) => {
        if (optionKeys.includes(item.key)) {
          newInputs[item.key] = item.value;
        }
      });
      setInputs(newInputs);
    } else {
      showError(message);
    }
  }, []);

  useEffect(() => {
    getOptions().then();
  }, [getOptions]);

  const updateOption = async (key, value) => {
    setLoading(true);
    const res = await API.put('/api/v1/admin/option/', {
      key,
      value,
    });
    const { success, message } = res.data;
    if (success) {
      setInputs((inputs) => ({ ...inputs, [key]: value }));
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const handleInputChange = async (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  const submitAbout = async () => {
    await updateOption('About', inputs.About);
  };

  const submitNotice = async () => {
    await updateOption('Notice', inputs.Notice);
  };

  const submitOption = async (key) => {
    await updateOption(key, inputs[key]);
  };

  return (
    <Grid columns={1}>
      <Grid.Column>
        <Form loading={loading}>
          <Header as='h3' className='router-section-title'>
            {t('setting.system.notice', '站点公告')}
          </Header>
          <Form.Group widths='equal'>
            <Form.TextArea
              className='router-section-textarea router-code-textarea router-code-textarea-sm'
              name='Notice'
              value={inputs.Notice}
              onChange={handleInputChange}
              placeholder={t('setting.system.notice_placeholder', '支持 Markdown')}
            />
          </Form.Group>
          <Form.Button className='router-section-button' onClick={submitNotice}>
            {t('setting.system.buttons.save')}
          </Form.Button>

          <Message className='router-section-message'>
            {t('setting.other.copyright.notice')}
          </Message>

          <Divider />
          <Header as='h3' className='router-section-title'>{t('setting.other.content.title')}</Header>
          <Form.Group widths='equal'>
            <Form.TextArea
              className='router-section-textarea router-code-textarea router-code-textarea-md'
              label={t('setting.other.content.homepage.title')}
              placeholder={t('setting.other.content.homepage.placeholder')}
              value={inputs.HomePageContent}
              name='HomePageContent'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button className='router-section-button' onClick={() => submitOption('HomePageContent')}>
            {t('setting.other.content.buttons.save_homepage')}
          </Form.Button>
          <Form.Group widths='equal'>
            <Form.TextArea
              className='router-section-textarea router-code-textarea router-code-textarea-md'
              label={t('setting.other.content.about.title')}
              placeholder={t('setting.other.content.about.placeholder')}
              value={inputs.About}
              name='About'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button className='router-section-button' onClick={submitAbout}>
            {t('setting.other.content.buttons.save_about')}
          </Form.Button>
        </Form>
      </Grid.Column>
    </Grid>
  );
};

export default OtherSetting;
