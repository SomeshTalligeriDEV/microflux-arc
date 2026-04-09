//blocks
export type NodeType = 
  | 'TimerNode' 
  | 'PriceMonitorNode' 
  | 'ComparatorNode' 
  | 'SwapTokenNode' 
  | 'SendPaymentNode' 
  | 'PortfolioBalanceNode' 
  | 'SendTelegramNode';

 export interface WorkflowNode {
    id: string;
    type: NodeType;
    position:{
        x: number;
        y: number;
    };
    data: Record<string, any>;
 }

 export interface WorkflowEdge {
  id: string;          
  source: string;      
  target: string;      
}

export interface MicroFluxIntentResponse {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}