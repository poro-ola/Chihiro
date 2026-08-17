import { ArrowUpRight, Database, LayoutDashboard } from 'lucide-react';
import './App.css';

function App() {
  return (
    <main className="popup">
      <header>
        <div className="popup-mark">千</div>
        <div>
          <h1>千寻</h1>
          <p>标签与资料工作台</p>
        </div>
      </header>
      <button className="open-button" onClick={() => void browser.tabs.create({})}>
        <LayoutDashboard size={18} />
        <span>打开工作台</span>
        <ArrowUpRight size={16} />
      </button>
      <footer>
        <Database size={14} />
        <span>全部资料仅存于本机 IndexedDB</span>
      </footer>
    </main>
  );
}

export default App;
