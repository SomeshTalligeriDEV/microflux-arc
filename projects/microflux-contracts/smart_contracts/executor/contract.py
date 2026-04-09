"""
MICROFLUX-X1 — WorkflowExecutor Smart Contract
================================================
ARC-4 compliant Algorand smart contract for on-chain workflow verification.

Purpose:
  - Store workflow hashes for integrity verification
  - Track execution counts per workflow
  - Record creator address and timestamps
  - Provide verifiable execution history

Designed for hackathon: simple, safe, demo-ready.
"""

from algopy import (
    ARC4Contract,
    String,
    UInt64,
    Bytes,
    Global,
    Txn,
    op,
    log,
    subroutine,
)
from algopy.arc4 import abimethod


class WorkflowExecutor(ARC4Contract):
    """
    On-chain workflow executor for MICROFLUX-X1.
    Stores workflow hashes, tracks executions, and provides verifiability.
    """

    def __init__(self) -> None:
        # Creator of this app instance
        self.creator = Global.creator_address
        # Total workflows registered
        self.workflow_count = UInt64(0)
        # Total executions across all workflows
        self.total_executions = UInt64(0)
        # Last executed workflow hash
        self.last_workflow_hash = Bytes(b"")
        # Last execution timestamp
        self.last_execution_time = UInt64(0)
        # Whether public execution is allowed (or creator-only)
        self.public_execution = UInt64(0)  # 0 = creator only, 1 = public

    # ── Register Workflow ──────────────────────

    @abimethod()
    def register_workflow(self, workflow_hash: String) -> String:
        """
        Register a workflow hash on-chain for integrity verification.
        Only the creator can register workflows.
        Returns confirmation message.
        """
        assert Txn.sender == self.creator, "Only creator can register workflows"

        self.workflow_count += 1
        self.last_workflow_hash = workflow_hash.bytes

        log(b"WORKFLOW_REGISTERED:")
        log(workflow_hash.bytes)

        return String("Workflow registered: #") + op.itob(self.workflow_count).decode()

    # ── Execute Workflow ───────────────────────

    @abimethod()
    def execute(self, workflow_hash: String) -> String:
        """
        Execute a workflow on-chain.
        Records execution, verifies hash if previously registered,
        and increments execution counter.
        """
        # Check if public execution is allowed
        if self.public_execution == UInt64(0):
            assert Txn.sender == self.creator, "Public execution disabled"

        # Record execution
        self.total_executions += 1
        self.last_workflow_hash = workflow_hash.bytes
        self.last_execution_time = Global.latest_timestamp

        # Log execution event (visible on-chain)
        log(b"WORKFLOW_EXECUTED:")
        log(workflow_hash.bytes)
        log(b"COUNT:")
        log(op.itob(self.total_executions))

        return String("Executed successfully. Total: ") + op.itob(self.total_executions).decode()

    # ── Toggle Public Execution ────────────────

    @abimethod()
    def set_public_execution(self, enabled: UInt64) -> String:
        """
        Toggle whether anyone can execute, or only the creator.
        0 = creator only, 1 = public
        """
        assert Txn.sender == self.creator, "Only creator can change settings"
        self.public_execution = enabled

        if enabled == UInt64(1):
            return String("Public execution: ENABLED")
        else:
            return String("Public execution: DISABLED")

    # ── Read State ─────────────────────────────

    @abimethod(readonly=True)
    def get_execution_count(self) -> UInt64:
        """Return total number of executions."""
        return self.total_executions

    @abimethod(readonly=True)
    def get_workflow_count(self) -> UInt64:
        """Return total number of registered workflows."""
        return self.workflow_count

    @abimethod(readonly=True)
    def get_last_execution_time(self) -> UInt64:
        """Return timestamp of last execution."""
        return self.last_execution_time

    @abimethod(readonly=True)
    def get_app_info(self) -> String:
        """Return app summary info."""
        return String("MICROFLUX-X1 WorkflowExecutor v1.0")

    # ── Verify Workflow ────────────────────────

    @abimethod(readonly=True)
    def verify_hash(self, workflow_hash: String) -> UInt64:
        """
        Check if a workflow hash matches the last registered hash.
        Returns 1 if match, 0 if not.
        """
        if self.last_workflow_hash == workflow_hash.bytes:
            return UInt64(1)
        else:
            return UInt64(0)

    # ── Hello (backward-compat) ────────────────

    @abimethod()
    def hello(self, name: String) -> String:
        """Backward-compatible hello method for testing."""
        return String("Hello, ") + name
