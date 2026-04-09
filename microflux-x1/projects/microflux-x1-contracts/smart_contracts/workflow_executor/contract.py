from algopy import ARC4Contract, arc4, Global, Txn, itxn, gtxn, require, Bytes, op, Account, UInt64

class WorkflowExecutor(ARC4Contract):
    """
    Reusable, verifiable workflow execution layer.
    
    This contract stores workflow definitions and allows authorized execution.
    Not just storage — it's a verifiable execution engine.
    """
    
    def __init__(self) -> None:
        # Workflow hash for integrity verification
        self.workflow_hash = Bytes()
        # Creator/owner of the workflow
        self.creator = Account()
        # Execution counter
        self.execution_count = UInt64(0)
        # Allow public execution (creator-only vs open)
        self.public_execution = bool(False)
    
    @arc4.abimethod(create="require")
    def create(
        self, 
        workflow_json: arc4.DynamicBytes,
        public_execution: arc4.Bool = arc4.Bool(False)
    ) -> None:
        """
        Deploy with workflow definition.
        
        Args:
            workflow_json: JSON-encoded workflow definition
            public_execution: If True, anyone can execute; if False, only creator
        """
        # Store workflow hash for integrity
        self.workflow_hash = op.sha256(workflow_json.bytes)
        # Store creator
        self.creator = Global.creator_address
        # Initialize execution counter
        self.execution_count = UInt64(0)
        # Set public execution flag
        self.public_execution = public_execution.native
    
    @arc4.abimethod
    def execute(self, workflow_json: arc4.DynamicBytes) -> arc4.UInt64:
        """
        Execute workflow.
        
        Verifies hash matches stored definition, increments counter,
        and emits execution log.
        
        Args:
            workflow_json: JSON-encoded workflow definition (must match stored hash)
            
        Returns:
            Current execution count
        """
        # Verify workflow hash matches (integrity check)
        provided_hash = op.sha256(workflow_json.bytes)
        require(
            provided_hash == self.workflow_hash,
            "Invalid workflow hash - definition has been tampered"
        )
        
        # Check authorization
        if not self.public_execution:
            require(
                Txn.sender == self.creator,
                "Only creator can execute this workflow"
            )
        
        # Increment execution counter
        self.execution_count += UInt64(1)
        
        # Emit log for indexing
        # Format: "EXECUTE|{app_id}|{count}|{sender}"
        log_data = Bytes(b"EXECUTE|") + op.itob(Global.current_application_id) + Bytes(b"|") + op.itob(self.execution_count) + Bytes(b"|") + Txn.sender.bytes
        op.log(log_data)
        
        return arc4.UInt64(self.execution_count)
    
    @arc4.abimethod
    def get_execution_count(self) -> arc4.UInt64:
        """Get total number of executions."""
        return arc4.UInt64(self.execution_count)
    
    @arc4.abimethod
    def get_creator(self) -> arc4.Address:
        """Get workflow creator address."""
        return arc4.Address(self.creator)
    
    @arc4.abimethod
    def is_public(self) -> arc4.Bool:
        """Check if workflow allows public execution."""
        return arc4.Bool(self.public_execution)
    
    @arc4.abimethod(allow_actions=["UpdateApplication"])
    def update_workflow(
        self, 
        new_workflow_json: arc4.DynamicBytes,
        new_public_execution: arc4.Bool
    ) -> None:
        """
        Update workflow definition. Only creator can update.
        
        Args:
            new_workflow_json: New JSON-encoded workflow definition
            new_public_execution: New public execution setting
        """
        require(
            Txn.sender == self.creator,
            "Only creator can update workflow"
        )
        
        # Update workflow hash
        self.workflow_hash = op.sha256(new_workflow_json.bytes)
        # Update public execution flag
        self.public_execution = new_public_execution.native
        
        # Emit update log
        log_data = Bytes(b"UPDATE|") + op.itob(Global.current_application_id) + Bytes(b"|") + Txn.sender.bytes
        op.log(log_data)
    
    @arc4.abimethod(allow_actions=["DeleteApplication"])
    def delete(self) -> None:
        """Delete workflow. Only creator can delete."""
        require(
            Txn.sender == self.creator,
            "Only creator can delete workflow"
        )
        
        # Emit delete log
        log_data = Bytes(b"DELETE|") + op.itob(Global.current_application_id) + Bytes(b"|") + Txn.sender.bytes
        op.log(log_data)
