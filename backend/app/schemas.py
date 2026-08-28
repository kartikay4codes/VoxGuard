from pydantic import BaseModel
from typing import Optional, List


class EnrollResponse(BaseModel):
    user_id: str
    status: str
    chunks_used: int


class StartCallResponse(BaseModel):
    session_id: str
    user_id: str


class TrustUpdate(BaseModel):
    session_id: str
    trust_score: float
    status: str
    should_hold_transfer: bool
    components: dict
    reasons: List[str]
    timestamp: float


class ChallengeResponse(BaseModel):
    challenge_id: str
    phrase: str
    issued_at: float


class ChallengeResultResponse(BaseModel):
    timing: dict
    replay_check: dict
    content_check: dict
    speaker_similarity: float
    passed: bool


class TransferStatusResponse(BaseModel):
    session_id: str
    transfer_status: str
    held_at: Optional[float] = None
    reason: Optional[str] = None
