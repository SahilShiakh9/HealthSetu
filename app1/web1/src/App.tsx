import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './app/router.js';
import { queryClient } from './services/queryClient.js';
import './i18n/index.js';

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  );
};

export default App;
