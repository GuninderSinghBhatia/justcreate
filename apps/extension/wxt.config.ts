import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'JUSTCREATE',
    description: 'Save images, screenshots, videos, posts and pages to your JUSTCREATE library.',
    // Minimal set: <all_urls> host access already covers tab URLs, screenshots and script injection.
    permissions: ['contextMenus', 'storage', 'scripting', 'alarms'],
    // Needed to read images across sites, take screenshots without a click, and reach the API.
    host_permissions: ['<all_urls>'],
    action: { default_title: 'JUSTCREATE' },
    commands: {
      'save-page': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Save the current page (detects YouTube videos and X posts)',
      },
      'screenshot-region': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Screenshot a region of the page',
      },
    },
  },
});
