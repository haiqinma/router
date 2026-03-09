import React from 'react';
import { Card } from 'semantic-ui-react';
import ProvidersManager from '../../components/ProvidersManager';

const Providers = () => {
  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <ProvidersManager />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Providers;
