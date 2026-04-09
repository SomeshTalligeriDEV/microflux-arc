// components/panels/RightPanel.tsx — Tabbed panel container
import React from 'react';
import { useUIStore, type PanelTab } from '../../stores/uiStore';
import PropertiesPanel from './PropertiesPanel';
import SimulationPanel from './SimulationPanel';
import DeploymentPanel from './DeploymentPanel';

const tabs: { key: PanelTab; label: string }[] = [
  { key: 'properties', label: 'Properties' },
  { key: 'simulation', label: 'Simulation' },
  { key: 'deployment', label: 'Deployment' },
];

const RightPanel: React.FC = () => {
  const activePanel = useUIStore((s) => s.activePanel);
  const setActivePanel = useUIStore((s) => s.setActivePanel);

  return (
    <div className="app-panel">
      <div className="panel-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`panel-tab ${activePanel === tab.key ? 'active' : ''}`}
            onClick={() => setActivePanel(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activePanel === 'properties' && <PropertiesPanel />}
      {activePanel === 'simulation' && <SimulationPanel />}
      {activePanel === 'deployment' && <DeploymentPanel />}
    </div>
  );
};

export default RightPanel;
