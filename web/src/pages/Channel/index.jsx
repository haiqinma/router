import React from 'react';
import { Card, Tab } from 'semantic-ui-react';
import ChannelsTable from '../../components/ChannelsTable';
import ModelProvidersManager from '../../components/ModelProvidersManager';
import { useTranslation } from 'react-i18next';

const Channel = () => {
  const { t } = useTranslation();
  const panes = [
    {
      menuItem: t('channel.tabs.channels'),
      render: () => (
        <Tab.Pane attached={false}>
          <ChannelsTable />
        </Tab.Pane>
      ),
    },
    {
      menuItem: t('channel.tabs.model_providers'),
      render: () => (
        <Tab.Pane attached={false}>
          <ModelProvidersManager />
        </Tab.Pane>
      ),
    },
  ];

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header'>{t('channel.title')}</Card.Header>
          <Tab
            menu={{
              secondary: true,
              pointing: true,
            }}
            panes={panes}
          />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Channel;
