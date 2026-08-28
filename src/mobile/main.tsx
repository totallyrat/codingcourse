import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MobileApp } from './MobileApp';
import { registerServiceWorker } from './sw-register';

import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/mascot.css';
import '@/styles/exercises.css';
import '@/styles/screens.css';
import '@/styles/mobile.css';

// iOS reports the visual viewport, not the layout one, and the difference is
// the browser chrome sliding in and out as you scroll. Everything sized in
// `100dvh` still ends up an inch too tall on some iOS versions, so the real
// height is published as a variable and kept current.
const setViewportUnit = () => {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
};
setViewportUnit();
window.addEventListener('resize', setViewportUnit);
window.addEventListener('orientationchange', setViewportUnit);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
);

registerServiceWorker();
