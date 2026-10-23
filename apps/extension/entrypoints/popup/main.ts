import { APP_URL } from '../../lib/config';
import type { BackgroundRequest, ScreenshotMode, StatusResponse } from '../../lib/messages';
import { isX } from '../../lib/adapters/x';
import { isYouTube } from '../../lib/adapters/youtube';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ask = <T>(message: BackgroundRequest) => browser.runtime.sendMessage(message) as Promise<T>;

async function init() {
  $<HTMLAnchorElement>('library').href = `${APP_URL}/library`;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const status = await ask<StatusResponse>({ kind: 'status' });

  $('disconnected').hidden = status.connected;
  $('connected').hidden = !status.connected;
  $('email').textContent = status.email ?? '';
  renderQueue(status.queued);

  if (status.connected) void loadBoards(status.boardId);

  const url = tab?.url ?? '';
  $('page-kind').textContent = isYouTube(url)
    ? 'YouTube video detected: saves title, channel, thumbnail and current timestamp.'
    : isX(url)
      ? 'X post detected: saves the post text, author, media and a screenshot.'
      : 'Saves the URL, title, preview image and a full-page screenshot.';

  $('connect').addEventListener('click', () => {
    void browser.tabs.create({ url: `${APP_URL}/connect` });
    window.close();
  });

  $('disconnect').addEventListener('click', async () => {
    await ask({ kind: 'disconnect' });
    await init();
  });

  $('retry').addEventListener('click', async () => {
    await ask({ kind: 'retryQueue' });
    renderQueue((await ask<StatusResponse>({ kind: 'status' })).queued);
  });

  const note = () => $<HTMLTextAreaElement>('note').value.trim();

  $('save-page').addEventListener('click', async () => {
    if (!tab?.id) return;
    await ask({ kind: 'savePage', tabId: tab.id, note: note() });
    window.close(); // the page shows a toast when it's saved
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-shot]')) {
    button.addEventListener('click', async () => {
      if (!tab?.id) return;
      await ask({ kind: 'screenshot', mode: button.dataset.shot as ScreenshotMode, tabId: tab.id, note: note() });
      window.close();
    });
  }
}

async function loadBoards(current?: string) {
  const select = $<HTMLSelectElement>('board');
  const { boards } = await ask<{ boards: { id: string; name: string }[] }>({ kind: 'boards' });
  for (const b of boards) select.add(new Option(b.name, b.id));
  select.value = boards.some((b) => b.id === current) ? current! : '';
  select.addEventListener('change', () => void ask({ kind: 'setBoard', boardId: select.value || null }));
}

function renderQueue(count: number) {
  $('queue').hidden = count === 0;
  $('queue-count').textContent = `${count} capture${count === 1 ? '' : 's'} waiting to upload.`;
}

void init();
