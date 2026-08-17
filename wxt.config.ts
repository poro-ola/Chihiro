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
    permissions: ['tabs'],
  },
});
