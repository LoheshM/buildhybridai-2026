// The network guard must be installed before Firebase is evaluated: ES imports run in order.
import './ai/installGuard';
import './app/theme';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { boot } from './app/boot';

const root = createRoot(document.getElementById('root')!);
boot()
  .catch((e) => console.error('Tickmark start-up', e))
  .finally(() => root.render(<StrictMode><App /></StrictMode>));
