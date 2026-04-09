import { useCallback, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Connection,
  Edge,
  Node as FlowNode,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes';
import { useWorkflowStore } from '../../stores';
import NodePalette from './panels/NodePalette';
import PropertiesPanel from './panels/PropertiesPanel';
import SimulationPanel from './panels/SimulationPanel';
import WorkflowToolbar from './toolbar/WorkflowToolbar';

let id = 0;
const getId = () => `dndnode_${id++}`;

const WorkflowCanvasInner = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  
  const { 
    addNode: storeAddNode, 
    addEdge: storeAddEdge,
    nodes: storeNodes, 
    edges: storeEdges,
    selectedNodeId,
    selectNode,
  } = useWorkflowStore();
  
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Sync with store
  const onNodesChangeSync = useCallback((changes: any) => {
    onNodesChange(changes);
    // Update store
    const currentNodes = reactFlowInstance?.getNodes() || nodes;
    useWorkflowStore.setState({ nodes: currentNodes });
  }, [onNodesChange, reactFlowInstance, nodes]);

  const onEdgesChangeSync = useCallback((changes: any) => {
    onEdgesChange(changes);
    const currentEdges = reactFlowInstance?.getEdges() || edges;
    useWorkflowStore.setState({ edges: currentEdges });
  }, [onEdgesChange, reactFlowInstance, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: Edge = {
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        animated: true,
        style: { stroke: '#00d4aa', strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(edge, eds));
      storeAddEdge({ source: connection.source!, target: connection.target! });
    },
    [setEdges, storeAddEdge]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      if (!type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      storeAddNode(type as any, position);
    },
    [screenToFlowPosition, storeAddNode]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
    selectNode(node.id);
  }, [selectNode]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="flex h-screen w-full bg-[#0a0a0f]">
      {/* Left Panel - Node Palette */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 bg-[#12121a]">
        <NodePalette />
      </div>

      {/* Main Canvas */}
      <div className="flex-1 flex flex-col relative" ref={reactFlowWrapper}>
        {/* Toolbar */}
        <WorkflowToolbar />

        {/* React Flow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChangeSync}
            onEdgesChange={onEdgesChangeSync}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            snapGrid={[15, 15]}
            snapToGrid
            attributionPosition="bottom-left"
            className="bg-[#0a0a0f]"
          >
            <Background color="#2d2d3a" gap={20} size={1} />
            <Controls className="!bg-[#1a1a2e] !border-gray-700 !text-white" />
            <MiniMap 
              className="!bg-[#1a1a2e] !border-gray-700" 
              nodeColor={(node) => {
                switch (node.type) {
                  case 'transaction': return '#00d4aa';
                  case 'assetTransfer': return '#6366f1';
                  case 'appCall': return '#f59e0b';
                  case 'note': return '#10b981';
                  default: return '#94a3b8';
                }
              }}
              maskColor="rgba(10, 10, 15, 0.7)"
            />
            
            <Panel position="bottom-center" className="m-4">
              <SimulationPanel />
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Right Panel - Properties */}
      <div className="w-80 flex-shrink-0 border-l border-gray-800 bg-[#12121a]">
        <PropertiesPanel selectedNodeId={selectedNodeId} />
      </div>
    </div>
  );
};

const WorkflowCanvas = () => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
};

export default WorkflowCanvas;
