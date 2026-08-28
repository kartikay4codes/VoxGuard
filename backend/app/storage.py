"""
storage.py
-----------
In-memory storage for the hackathon prototype. This is intentionally NOT a
database -- swapping this for Postgres/Redis is a documented "v2" step in
the README, not a real gap for a demo build (a live call session doesn't
need to survive a server restart).
"""

from dataclasses import dataclass, field
from typing import Optional
import numpy as np
import time


@dataclass
class EnrolledVoice:
    user_id: str
    embedding: np.ndarray
    enrolled_at: float = field(default_factory=time.time)


@dataclass
class CallSession:
    session_id: str
    user_id: str
    trust_history: list = field(default_factory=list)   # list of fusion results, timestamped
    recent_chunks: list = field(default_factory=list)    # for replay detection
    active_challenge: Optional[dict] = None
    transfer_status: str = "pending"   # pending | held | released
    created_at: float = field(default_factory=time.time)


class Store:
    def __init__(self):
        self.voices: dict[str, EnrolledVoice] = {}
        self.sessions: dict[str, CallSession] = {}

    def enroll(self, user_id: str, embedding: np.ndarray):
        self.voices[user_id] = EnrolledVoice(user_id=user_id, embedding=embedding)

    def get_voice(self, user_id: str) -> Optional[EnrolledVoice]:
        return self.voices.get(user_id)

    def create_session(self, session_id: str, user_id: str) -> CallSession:
        session = CallSession(session_id=session_id, user_id=user_id)
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[CallSession]:
        return self.sessions.get(session_id)


store = Store()
