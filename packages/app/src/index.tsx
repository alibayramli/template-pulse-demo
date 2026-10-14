import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@backstage/ui/css/styles.css';

// Backstage's sign-in header can repeat the app name in the tab title.
new MutationObserver(() => {
  const title = [...new Set(document.title.split(' | '))].join(' | ');
  if (document.title !== title) document.title = title;
}).observe(document.querySelector('title')!, {
  childList: true,
  characterData: true,
  subtree: true,
});

ReactDOM.createRoot(document.getElementById('root')!).render(App.createRoot());
