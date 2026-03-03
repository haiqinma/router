import React from 'react';
import { Card } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import ModelProvidersManager from '../../components/ModelProvidersManager';

const ModelProviders = () => {
  const { t } = useTranslation();

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header'>
            {t('channel.providers.title')}
          </Card.Header>
          <ModelProvidersManager />
        </Card.Content>
      </Card>
    </div>
  );
};

export default ModelProviders;
