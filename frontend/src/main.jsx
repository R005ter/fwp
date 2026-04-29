import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

try {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(App));
} catch (error) {
  console.error('Failed to render app:', error);
  document.getElementById('root').innerHTML = `
    <div style="padding: 20px; color: red;">
      <h1>Error Loading Application</h1>
      <p>${error.message}</p>
      <pre>${error.stack}</pre>
    </div>
  `;
}
