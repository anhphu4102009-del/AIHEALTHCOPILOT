import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("App initializing...");

window.addEventListener('error', (event) => {
  console.error("Global error caught:", event.error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 20px; color: red;">
      <h2>Something went wrong</h2>
      <pre>${event.error?.message || 'Unknown error'}</pre>
      <p>Please check the console for more details.</p>
    </div>`;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
