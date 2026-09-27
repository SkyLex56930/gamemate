export function createRtcConfig(): RTCConfiguration {
  const environment = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  const turnUrls = environment?.VITE_WEBRTC_TURN_URLS
    ?.split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

  if (turnUrls?.length) {
    iceServers.push({
      urls: turnUrls,
      username: environment?.VITE_WEBRTC_TURN_USERNAME,
      credential: environment?.VITE_WEBRTC_TURN_CREDENTIAL,
    });
  }

  return { iceServers, iceCandidatePoolSize: 4 };
}

export function supportsVoiceCalls() {
  return Boolean(
    typeof RTCPeerConnection === "function"
    && typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function supportsVideoCalls() {
  return supportsVoiceCalls();
}

export function supportsScreenShare() {
  return Boolean(
    supportsVoiceCalls()
    && typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}
