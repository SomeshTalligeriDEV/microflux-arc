"""
MICROFLUX-X1 — WorkflowExecutor Smart Contract
================================================
ARC-4 compliant Algorand smart contract for on-chain workflow verification.
Minimal, safe, hackathon-ready.
"""

from algopy import (
    ARC4Contract,
    Global,
    Txn,
    UInt64,
    Bytes,
    log,
    op,
)
from algopy.arc4 import abimethod, String as arc4String
rr

class WorkflowExecutor(ARC4Contract):
    """
    On-chain workflow executor for MICROFLUX-X1.
    Stores workflow hashes, tracks executions, provides verifiability.
    """

    def __init__(self) -> None:
        self.creator = Global.creator_address
        self.workflow_count = UInt64(0)
        self.total_executions = UInt64(0)
        self.last_workflow_hash = Bytes(b"")
        self.last_execution_time = UInt64(0)
        self.public_execution = UInt64(0)

    @abimethod()
    def register_workflow(self, workflow_hash: arc4String) -> arc4String:
        """Register a workflow hash on-chain. Creator only."""
        assert Txn.sender == self.creator, "Only creator can register"
        self.workflow_count += 1
        self.last_workflow_hash = workflow_hash.bytes
        log(b"WORKFLOW_REGISTERED")
        log(workflow_hash.bytes)
        return arc4String("Workflow registered")

    @abimethod()
    def execute(self, workflow_hash: arc4String) -> arc4String:
        """Execute a workflow on-chain. Records hash and increments counter."""
        if self.public_execution == UInt64(0):
            assert Txn.sender == self.creator, "Public execution disabled"
        self.total_executions += 1
        self.last_workflow_hash = workflow_hash.bytes
        self.last_execution_time = Global.latest_timestamp
        log(b"WORKFLOW_EXECUTED")
        log(workflow_hash.bytes)
        log(op.itob(self.total_executions))
        return arc4String("Executed successfully")

    @abimethod()
    def set_public_execution(self, enabled: UInt64) -> arc4String:
        """Toggle public execution. 0 = creator only, 1 = public."""
        assert Txn.sender == self.creator, "Only creator can change settings"
        self.public_execution = enabled
        if enabled == UInt64(1):
            return arc4String("Public execution enabled")
        return arc4String("Public execution disabled")

    @abimethod(readonly=True)
    def get_execution_count(self) -> UInt64:
        """Return total executions."""
        return self.total_executions

    @abimethod(readonly=True)
    def get_workflow_count(self) -> UInt64:
        """Return total registered workflows."""
        return self.workflow_count

    @abimethod(readonly=True)
    def get_last_execution_time(self) -> UInt64:
        """Return timestamp of last execution."""
        return self.last_execution_time

    @abimethod(readonly=True)
    def get_app_info(self) -> arc4String:
        """Return app info string."""
        return arc4String("MICROFLUX-X1 WorkflowExecutor v1.0")

    @abimethod(readonly=True)
    def verify_hash(self, workflow_hash: arc4String) -> UInt64:
        """Check if hash matches last registered. Returns 1 if match, 0 if not."""
        if self.last_workflow_hash == workflow_hash.bytes:
            return UInt64(1)
        return UInt64(0)

    @abimethod()
    def hello(self, name: arc4String) -> arc4String:
        """Backward-compatible hello for testing."""
        return arc4String("Hello from MICROFLUX-X1")
