import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: (environment) => ({
    build: {
      minify: environment.mode === 'debug' ? false : undefined,
      sourcemap: environment.mode === 'debug',
    },
  }),
  manifest: {
    name: '千寻 · 标签与资料工作台',
    description: '把当前标签、书签和记事整理进一个本地优先的资料工作台。',
    permissions: ['tabs', 'storage', 'alarms', 'declarativeNetRequestWithHostAccess'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: '打开千寻主界面',
    },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (manifest.action) {
        delete manifest.action.default_popup;
        manifest.action.default_title = '打开千寻主界面';
      }
      delete manifest.side_panel;
      manifest.permissions = manifest.permissions?.filter((permission) => permission !== 'sidePanel');
    },
  },
});
