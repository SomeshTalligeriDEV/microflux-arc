import { useCallback } from 'react';

const nodeTypes = [
  {
    type: 'transaction',
    label: 'Payment',
    icon: '💰',
    description: 'Send ALGO',
    color: '#00d4aa',
  },
  {
    type: 'assetTransfer',
    label: 'ASA Transfer',
    icon: '🎫',
    description: 'Transfer assets',
    color: '#6366f1',
  },
  {
    type: 'appCall',
    label: 'App Call',
    icon: '📱',
    description: 'Call smart contract',
    color: '#f59e0b',
  },
  {
    type: 'note',
    label: 'Note',
    icon: '📝',
    description: 'Add metadata',
    color: '#10b981',
  },
];

const NodePalette = () => {
  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <div className="h-full p-4">
      <h2 className="text-white font-semibold mb-4 text-lg">Node Palette</h2>
      <p className="text-gray-400 text-sm mb-6">
        Drag and drop nodes to build your workflow
      </p>
      
      <div className="space-y-3">
        {nodeTypes.map((node) => (
          <div
            key={node.type}
            className="p-3 rounded-lg border border-gray-700 bg-[#1a1a2e] cursor-grab active:cursor-grabbing hover:border-gray-500 transition-colors"
            onDragStart={(e) => onDragStart(e, node.type)}
            draggable
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{ backgroundColor: `${node.color}20` }}
              >
                <span style={{ color: node.color }}>{node.icon}</span>
              </div>
              <div>
                <div className="text-white font-medium text-sm">{node.label}</div>
                <div className="text-gray-400 text-xs">{node.description}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 rounded-lg bg-[#1a1a2e] border border-gray-700">
        <h3 className="text-white font-medium mb-2 text-sm">Tips</h3>
        <ul className="text-gray-400 text-xs space-y-1">
          <li>• Connect nodes to create flow</li>
          <li>• Click node to edit properties</li>
          <li>• Simulate before deploying</li>
        </ul>
      </div>
    </div>
  );
};

export default NodePalette;
