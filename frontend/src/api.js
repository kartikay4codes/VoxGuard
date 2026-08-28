const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL = BASE_URL.replace(/^http/, "ws");

export async function enroll(userId, wavBlobs) {
  const form = new FormData();
  wavBlobs.forEach((blob, i) => form.append("files", blob, `enroll_${i}.wav`));
  const res = await fetch(`${BASE_URL}/enroll?user_id=${encodeURIComponent(userId)}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startCall(userId) {
  const res = await fetch(`${BASE_URL}/call/start?user_id=${encodeURIComponent(userId)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function openCallSocket(sessionId, { onMessage, onError, onClose }) {
  const ws = new WebSocket(`${WS_URL}/ws/call/${sessionId}`);
  ws.binaryType = "arraybuffer";
  ws.onmessage = (evt) => onMessage(JSON.parse(evt.data));
  ws.onerror = onError;
  ws.onclose = onClose;
  return ws;
}

export async function submitChunkREST(sessionId, wavBlob) {
  const form = new FormData();
  form.append("file", wavBlob, "chunk.wav");
  const res = await fetch(`${BASE_URL}/call/${sessionId}/chunk`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startChallenge(sessionId) {
  const res = await fetch(`${BASE_URL}/challenge/start/${sessionId}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function respondChallenge(sessionId, wavBlob) {
  const form = new FormData();
  form.append("file", wavBlob, "response.wav");
  const res = await fetch(`${BASE_URL}/challenge/respond/${sessionId}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTransferStatus(sessionId) {
  const res = await fetch(`${BASE_URL}/transfer/${sessionId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function releaseTransfer(sessionId) {
  const res = await fetch(`${BASE_URL}/transfer/${sessionId}/release`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
