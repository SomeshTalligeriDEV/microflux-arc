// components/layout/Sidebar.tsx — Premium categorized node palette
import React, { useState, type DragEvent } from 'react';
import { 
  ArrowUpRight, Coins, Code, StickyNote, 
  Timer, Wallet, Webhook, ShieldCheck, 
  Plus, ArrowLeftRight, Globe, Landmark,
  Scale, Clock, Calculator, Filter, Terminal,
  Send, MessageCircle, Bell, BarChart3, ChevronDown
} from 'lucide-react';
import type { NodeCategory } from '../../types/nodes';

interface PaletteItem {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

interface CategoryGroup {
  id: string;
  label: string;
  items: PaletteItem[];
  color: string;
}

const CATEGORIES: CategoryGroup[] = [
  {
    id: 'triggers',
    label: 'TRIGGERS',
    color: '#a855f7',
    items: [
      { type: 'noteNode', category: 'note', label: 'Timer Loop', description: 'Schedule recurring logic', icon: <Timer size={16} />, color: '#a855f7' },
      { type: 'noteNode', category: 'note', label: 'Wallet Event', description: 'Listen for on-chain events', icon: <Wallet size={16} />, color: '#a855f7' },
      { type: 'noteNode', category: 'note', label: 'Webhook Trigger', description: 'Trigger via external API', icon: <Webhook size={16} />, color: '#a855f7' },
    ]
  },
  {
    id: 'actions',
    label: 'ACTIONS',
    color: '#3b82f6',
    items: [
      { type: 'transactionNode', category: 'transaction', label: 'Send Payment', description: 'Transfer ALGO to address', icon: <ArrowUpRight size={16} />, color: '#3b82f6' },
      { type: 'assetTransferNode', category: 'asset_transfer', label: 'Opt-In ASA', description: 'Opt-in to an asset', icon: <ShieldCheck size={16} />, color: '#3b82f6' },
      { type: 'assetTransferNode', category: 'asset_transfer', label: 'Create ASA', description: 'Issue new Algorand asset', icon: <Plus size={16} />, color: '#3b82f6' },
      { type: 'noteNode', category: 'note', label: 'Swap Token', description: 'Execute AMM swap', icon: <ArrowLeftRight size={16} />, color: '#3b82f6' },
      { type: 'noteNode', category: 'note', label: 'HTTP Request', description: 'Call external webhook', icon: <Globe size={16} />, color: '#3b82f6' },
      { type: 'noteNode', category: 'note', label: 'Fiat On-Ramp', description: 'Convert fiat to crypto', icon: <Landmark size={16} />, color: '#3b82f6' },
    ]
  },
  {
    id: 'logic',
    label: 'LOGIC',
    color: '#eab308',
    items: [
      { type: 'noteNode', category: 'note', label: 'Comparator', description: 'If/Else conditions', icon: <Scale size={16} />, color: '#eab308' },
      { type: 'noteNode', category: 'note', label: 'Delay', description: 'Wait for specific time', icon: <Clock size={16} />, color: '#eab308' },
      { type: 'noteNode', category: 'note', label: 'Math', description: 'Arithmetic operations', icon: <Calculator size={16} />, color: '#eab308' },
      { type: 'noteNode', category: 'note', label: 'Filter', description: 'Pass through matching payloads', icon: <Filter size={16} />, color: '#eab308' },
      { type: 'noteNode', category: 'note', label: 'Debug Log', description: 'Log trace to console', icon: <Terminal size={16} />, color: '#eab308' },
    ]
  },
  {
    id: 'notifications',
    label: 'NOTIFICATIONS',
    color: '#22c55e',
    items: [
      { type: 'noteNode', category: 'note', label: 'Send Telegram', description: 'Notify on Telegram', icon: <Send size={16} />, color: '#22c55e' },
      { type: 'noteNode', category: 'note', label: 'Send Discord', description: 'Notify on Discord', icon: <MessageCircle size={16} />, color: '#22c55e' },
      { type: 'noteNode', category: 'note', label: 'Browser Notify', description: 'Push notifications', icon: <Bell size={16} />, color: '#22c55e' },
    ]
  },
  {
    id: 'defi',
    label: 'DEFI',
    color: '#f97316',
    items: [
      { type: 'appCallNode', category: 'app_call', label: 'Get Quote', description: 'Query DEX price', icon: <BarChart3 size={16} />, color: '#f97316' },
    ]
  }
];

const Sidebar: React.FC = () => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    triggers: true, actions: true, logic: true, notifications: true, defi: true
  });

  const toggleCategory = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>, item: PaletteItem) => {
    event.dataTransfer.setData('application/reactflow-type', item.type);
    event.dataTransfer.setData('application/reactflow-category', item.category);
    event.dataTransfer.setData('application/reactflow-label', item.label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="app-sidebar premium-sidebar">
      <div className="sidebar-scroll">
        {CATEGORIES.map((cat) => (
          <div key={cat.id} className="sidebar-group">
            <button 
              className="sidebar-group-header" 
              onClick={() => toggleCategory(cat.id)}
            >
              <div className="sidebar-group-label" style={{ color: cat.color }}>
                {cat.label}
              </div>
              <div className="sidebar-group-meta">
                <span className="count-badge">{cat.items.length}</span>
                <ChevronDown 
                  size={14} 
                  className={`chevron ${expanded[cat.id] ? 'open' : ''}`} 
                />
              </div>
            </button>
            
            {expanded[cat.id] && (
              <div className="sidebar-items">
                {cat.items.map((item, idx) => (
                  <div
                    key={`${cat.id}-${idx}`}
                    className="sidebar-item-new"
                    draggable
                    onDragStart={(e) => onDragStart(e, item)}
                    title={item.description}
                  >
                    <div 
                      className="sidebar-item-icon" 
                      style={{ background: `${item.color}15`, color: item.color }}
                    >
                      {item.icon}
                    </div>
                    <span className="sidebar-item-label">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Zoom Controls like in the image */}
      <div className="sidebar-zoom-controls">
         <button className="zoom-btn">+</button>
         <button className="zoom-btn">−</button>
         <button className="zoom-btn">⬚</button>
         <button className="zoom-btn">🔒</button>
      </div>
    </aside>
  );
};

export default Sidebar;
