"""
webhook.py
-----------
Mock "linked wire-transfer approval" system. In a real deployment this
fires an outbound webhook to whatever payment/approval system the company
uses (banking API, internal ERP, Slack approval bot). For the demo, it's an
in-process state machine so the judge can watch it flip from
pending -> held live on screen with no external service dependency (which
would be a demo-day liability anyway -- never depend on a third-party
service being up during your 90 seconds).
"""

import time
from .storage import store


def maybe_hold_transfer(session_id: str, should_hold: bool, reason: str = None) -> dict:
    session = store.get_session(session_id)
    if session is None:
        return {"error": "unknown session"}

    if should_hold and session.transfer_status == "pending":
        session.transfer_status = "held"
        return {
            "session_id": session_id,
            "transfer_status": "held",
            "held_at": time.time(),
            "reason": reason or "voice trust score crossed risk threshold",
        }

    return {
        "session_id": session_id,
        "transfer_status": session.transfer_status,
        "held_at": None,
        "reason": None,
    }


def release_transfer(session_id: str) -> dict:
    """Manual override -- e.g. a human security analyst reviews and clears
    the hold. Included because a real fraud-control feature that can only
    ever say 'no' with no override path doesn't survive contact with an
    actual finance team."""
    session = store.get_session(session_id)
    if session is None:
        return {"error": "unknown session"}
    session.transfer_status = "released"
    return {"session_id": session_id, "transfer_status": "released"}
