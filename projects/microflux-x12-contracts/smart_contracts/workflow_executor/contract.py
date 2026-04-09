from algopy import (
    ARC4Contract,
    String,
    UInt64,
    Bytes,
    Global,
    Txn,
    log,
    op,
)
from algopy.arc4 import abimethod


class WorkflowExecutor(ARC4Contract):
    """
    Microflux-X1 WorkflowExecutor

    A reusable, verifiable workflow execution layer.
    Stores workflow hash, tracks executions, enforces access control.
    """

    def __init__(self) -> None:
        self.workflow_hash = Bytes()
        self.workflow_name = String()
        self.creator = Bytes()
        self.is_public = UInt64(0)
        self.execution_count = UInt64(0)
        self.last_executed = UInt64(0)
        self.is_initialized = UInt64(0)

    @abimethod()
    def register_workflow(
        self,
        workflow_hash: Bytes,
        workflow_name: String,
        is_public: UInt64,
    ) -> String:
        """Register a new workflow. Can only be called once."""
        assert self.is_initialized == 0, "Already initialized"

        self.workflow_hash = workflow_hash
        self.workflow_name = workflow_name
        self.creator = Txn.sender.bytes
        self.is_public = is_public
        self.execution_count = UInt64(0)
        self.last_executed = Global.round
        self.is_initialized = UInt64(1)

        log(b"WORKFLOW_REGISTERED")
        return "Workflow registered: " + workflow_name

    @abimethod()
    def execute(self, execution_hash: Bytes) -> UInt64:
        """
        Record a workflow execution.
        Verifies caller authorization and increments counter.
        """
        assert self.is_initialized == 1, "Not initialized"

        if self.is_public == 0:
            assert Txn.sender.bytes == self.creator, "Unauthorized"

        self.execution_count += 1
        self.last_executed = Global.round

        log(b"WORKFLOW_EXECUTED:")
        log(op.itob(self.execution_count))
        log(execution_hash)

        return self.execution_count

    @abimethod(readonly=True)
    def get_info(self) -> String:
        """Get workflow name."""
        return self.workflow_name

    @abimethod(readonly=True)
    def get_execution_count(self) -> UInt64:
        """Get total execution count."""
        return self.execution_count

    @abimethod(readonly=True)
    def get_workflow_hash(self) -> Bytes:
        """Get the stored workflow hash for verification."""
        return self.workflow_hash

    @abimethod()
    def update_public_mode(self, is_public: UInt64) -> String:
        """Toggle public/private execution mode. Creator only."""
        assert Txn.sender.bytes == self.creator, "Creator only"
        self.is_public = is_public
        log(b"MODE_UPDATED")
        return String("Mode updated")
