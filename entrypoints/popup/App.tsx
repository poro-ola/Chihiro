import { ArrowUpRight, Database, LayoutDashboard, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { CONTENT_NOTES_MESSAGE } from '../../lib/content-notes';
import './App.css';

function App() {
  const [pageNotesError, setPageNotesError] = useState('');

  const openPageNotes = async () => {
    setPageNotesError('');
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (typeof tab?.id !== 'number' || !/^https?:/i.test(tab.url || '')) {
        setPageNotesError('网页备注仅支持 http 和 https 页面。');
        return;
      }
      await browser.tabs.sendMessage(tab.id, { type: CONTENT_NOTES_MESSAGE.toggle });
      window.close();
    } catch {
      setPageNotesError('请刷新当前网页，让千寻加载悬浮备注按钮。');
    }
  };

  return (
    <main className="popup">
      <header>
        <div className="popup-mark">千</div>
        <div>
          <h1>千寻</h1>
          <p>标签与资料工作台</p>
        </div>
      </header>
      <div className="popup-actions">
        <button className="open-button" onClick={() => void openPageNotes()}>
          <MessageSquareText size={18} />
          <span>打开网页备注</span>
          <ArrowUpRight size={16} />
        </button>
        {pageNotesError && <p className="popup-error" role="alert">{pageNotesError}</p>}
        <button className="open-button open-button--secondary" onClick={() => void browser.tabs.create({})}>
          <LayoutDashboard size={18} />
          <span>打开工作台</span>
          <ArrowUpRight size={16} />
        </button>
      </div>
      <footer>
        <Database size={14} />
        <span>全部资料仅存于本机 IndexedDB</span>
      </footer>
    </main>
  );
}

export default App;
