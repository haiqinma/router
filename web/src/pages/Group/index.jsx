import React, { useRef } from 'react';
import { Button, Card } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import GroupsManager from '../../components/GroupsManager';

const Group = () => {
  const { t } = useTranslation();
  const managerRef = useRef(null);

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header
            className='header'
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>{t('group_manage.title')}</span>
            <Button type='button' onClick={() => managerRef.current?.openCreateModal()}>
              {t('group_manage.buttons.add')}
            </Button>
          </Card.Header>
          <GroupsManager ref={managerRef} />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Group;
