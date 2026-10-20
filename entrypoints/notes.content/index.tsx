import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'chihiro-page-notes',
      position: 'overlay',
      anchor: 'body',
      append: 'last',
      alignment: 'top-left',
      zIndex: 2_147_483_647,
      isolateEvents: [
        'keydown',
        'keyup',
        'keypress',
        'click',
        'mousedown',
        'mouseup',
        'pointerdown',
        'pointermove',
        'pointerup',
        'input',
        'change',
        'wheel',
      ],
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(
          <React.StrictMode>
            <App />
          </React.StrictMode>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
