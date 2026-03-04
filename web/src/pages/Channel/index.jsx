import React from 'react';
import {Link} from 'react-router-dom';
import {Button, Card} from 'semantic-ui-react';
import ChannelsTable from '../../components/ChannelsTable';
import { useTranslation } from 'react-i18next';

const Channel = () => {
  const { t } = useTranslation();

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header
            className='header'
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span>{t('channel.title')}</span>
            <Button size='tiny' as={Link} to='/channel/add'>
              {t('channel.buttons.add')}
            </Button>
          </Card.Header>
          <ChannelsTable />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Channel;
