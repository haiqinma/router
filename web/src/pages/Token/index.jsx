import React from 'react';
import { Card } from 'semantic-ui-react';
import TokensTable from '../../components/TokensTable';

const Token = () => {
  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <TokensTable />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Token;
