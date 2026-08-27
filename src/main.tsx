import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './design/global.css';
import './components/ui/ui.css';
import { applyCapabilities } from './design/capabilities';

// §6.4: detect backdrop-filter once, before first paint, and stamp it on <html>.
applyCapabilities();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
