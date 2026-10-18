export interface CommunicationConfig {
  appId: number;
  token: string;
  roomId: string;
  userId: string;
  isConfigured: boolean;
}

export class NotConfiguredError extends Error {
  constructor(message = 'Video calling is not configured on this server') {
    super(message);
    this.name = 'NotConfiguredError';
  }
}

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'FAILED';

export interface ICommunicationService {
  readonly isConfigured: boolean;
  initialize(config: CommunicationConfig): Promise<void>;
  startLocalStream(audioOnly?: boolean): Promise<MediaStream>;
  stopLocalStream(): void;
  toggleMic(muted: boolean): boolean;
  toggleCamera(muted: boolean): boolean;
  leaveRoom(): Promise<void>;
  onRemoteStream(callback: (stream: MediaStream) => void): () => void;
  onDisconnect(callback: (reason: string) => void): () => void;
  onConnectionState(callback: (state: ConnectionState) => void): () => void;
  getLocalStream(): MediaStream | null;
  getRemoteStream(): MediaStream | null;
  getConnectionState(): ConnectionState;
  isAudioFallbackActive(): boolean;
}

/**
 * UnavailableCommunicationService
 * Used when ZEGOCLOUD or server credentials are not configured.
 * Rejects stream requests loudly and provides honest diagnostics.
 */
export class UnavailableCommunicationService implements ICommunicationService {
  readonly isConfigured = false;
  private readonly reason: string;

  constructor(reason = 'Video calling is not configured on this server') {
    this.reason = reason;
  }

  async initialize(_config: CommunicationConfig): Promise<void> {
    throw new NotConfiguredError(this.reason);
  }

  async startLocalStream(_audioOnly?: boolean): Promise<MediaStream> {
    throw new NotConfiguredError(this.reason);
  }

  stopLocalStream(): void {}

  toggleMic(_muted: boolean): boolean {
    return false;
  }

  toggleCamera(_muted: boolean): boolean {
    return false;
  }

  async leaveRoom(): Promise<void> {}

  onRemoteStream(_callback: (stream: MediaStream) => void): () => void {
    return () => {};
  }

  onDisconnect(_callback: (reason: string) => void): () => void {
    return () => {};
  }

  onConnectionState(_callback: (state: ConnectionState) => void): () => void {
    return () => {};
  }

  getLocalStream(): MediaStream | null {
    return null;
  }

  getRemoteStream(): MediaStream | null {
    return null;
  }

  getConnectionState(): ConnectionState {
    return 'FAILED';
  }

  isAudioFallbackActive(): boolean {
    return false;
  }
}

/**
 * RealWebRTCCommunicationService
 * Production-ready ZEGOCLOUD WebRTC RTC communication implementation.
 * Connects real mic/camera streams, supports camera-hardware contention fallback to audio-only,
 * signals peer tracks over WebSockets, and reliably stops all hardware tracks on unmount.
 */
export class RealWebRTCCommunicationService implements ICommunicationService {
  readonly isConfigured = true;
  private config: CommunicationConfig | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteCallbacks = new Set<(stream: MediaStream) => void>();
  private disconnectCallbacks = new Set<(reason: string) => void>();
  private stateCallbacks = new Set<(state: ConnectionState) => void>();
  private micMuted = false;
  private cameraMuted = false;
  private isAudioOnlyFallback = false;
  private connectionState: ConnectionState = 'CONNECTING';

  // Real-time integration handles
  private zgEngine: any = null;
  private zgStreamId: string | null = null;
  private socket: any = null;
  private peerConnection: RTCPeerConnection | null = null;

  async initialize(config: CommunicationConfig): Promise<void> {
    this.config = config;
    if (!config.isConfigured) {
      throw new NotConfiguredError();
    }

    this.setConnectionState('CONNECTING');

    // 1. In browser environments, initialize ZEGOCLOUD WebRTC Engine if credentials provided
    if (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.userAgent &&
      config.appId &&
      config.token &&
      typeof RTCPeerConnection !== 'undefined'
    ) {
      try {
        const { ZegoExpressEngine } = await import('zego-express-engine-webrtc');
        // Initialize Zego Express SDK
        this.zgEngine = new ZegoExpressEngine(
          config.appId,
          `wss://webliveroom${config.appId}-api.coolzcloud.com/ws`,
        );

        this.zgEngine.on(
          'roomStreamUpdate',
          async (_roomId: string, updateType: 'ADD' | 'DELETE', streamList: any[]) => {
            if (updateType === 'ADD' && streamList?.length > 0) {
              try {
                const streamItem = streamList[0];
                const rStream = await this.zgEngine.startPlayingStream(streamItem.streamID);
                if (rStream) {
                  this.setRemoteStream(rStream);
                  this.setConnectionState('CONNECTED');
                }
              } catch (playErr) {
                console.warn('[Zego] startPlayingStream fallback:', playErr);
              }
            } else if (updateType === 'DELETE') {
              if (this.remoteStream) {
                this.remoteStream.getTracks().forEach((t) => t.stop());
                this.remoteStream = null;
              }
              this.setConnectionState('DISCONNECTED');
            }
          },
        );

        this.zgEngine.on('roomStateChanged', (_roomId: string, _reason: string, errorCode: number) => {
          if (errorCode === 0) {
            this.setConnectionState('CONNECTED');
          } else if (errorCode === 1002035) {
            this.setConnectionState('RECONNECTING');
          } else if (errorCode !== 0) {
            this.setConnectionState('DISCONNECTED');
          }
        });
      } catch (zegoInitErr) {
        console.warn('[Communication] ZegoExpressEngine dynamic notice:', zegoInitErr);
      }
    }

    // 2. Setup Socket.IO peer signaling channel for resilient bidirectional media exchange
    if (typeof window !== 'undefined') {
      try {
        const { io } = await import('socket.io-client');
        const socketUrl =
          (import.meta as any).env?.VITE_SOCKET_URL ||
          (typeof window !== 'undefined' ? window.location.origin : '');
        if (socketUrl) {
          this.socket = io(socketUrl, { transports: ['websocket', 'polling'] });
          this.socket.emit('join:room', {
            roomId: config.roomId,
            userId: config.userId,
          });

          this.socket.on('peer:joined', () => {
            this.initiatePeerOffer();
          });

          this.socket.on('webrtc:signal', (data: any) => {
            this.handlePeerSignal(data);
          });
        }
      } catch (sockErr) {
        console.warn('[Communication] Socket signaling notice:', sockErr);
      }
    }
  }

  getConfig(): CommunicationConfig | null {
    return this.config;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isAudioFallbackActive(): boolean {
    return this.isAudioOnlyFallback;
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.stateCallbacks.forEach((cb) => cb(state));
  }

  async startLocalStream(audioOnly = false): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('WebRTC mediaDevices are not supported in this environment');
    }

    // Attempt video + audio if not audio-only
    if (!audioOnly) {
      try {
        const constraints: MediaStreamConstraints = {
          audio: true,
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
        };

        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.cameraMuted = false;
        this.isAudioOnlyFallback = false;
        await this.publishLocalStreamToEngines();
        return this.localStream;
      } catch (err: any) {
        const errName = err.name || '';
        const errMsg = (err.message || '').toLowerCase();
        const isDeviceBusy =
          errName === 'NotReadableError' ||
          errName === 'TrackStartError' ||
          errMsg.includes('in use') ||
          errMsg.includes('could not start') ||
          errMsg.includes('device');

        // Graceful Hardware Contention Fallback:
        // When two tabs on the same computer open the camera, Windows/Chrome locks the webcam.
        // We gracefully fall back to an audio-only stream so both participants can talk!
        if (isDeviceBusy) {
          console.warn(
            '[RealWebRTC] Camera hardware in use by another tab/app. Gracefully falling back to audio-only stream.',
          );
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
            this.localStream = audioStream;
            this.cameraMuted = true;
            this.isAudioOnlyFallback = true;
            await this.publishLocalStreamToEngines();
            return audioStream;
          } catch (audioErr: any) {
            console.error('[RealWebRTC] Audio fallback failed:', audioErr);
            this.setConnectionState('FAILED');
            throw audioErr;
          }
        }

        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          this.setConnectionState('FAILED');
          throw new Error('Camera or Microphone permission was denied by the user.');
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          this.setConnectionState('FAILED');
          throw new Error('No camera or microphone hardware found on this device.');
        }

        this.setConnectionState('FAILED');
        throw err;
      }
    }

    // Explicit audio-only mode requested
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this.localStream = stream;
      this.cameraMuted = true;
      this.isAudioOnlyFallback = true;
      await this.publishLocalStreamToEngines();
      return stream;
    } catch (err: any) {
      this.setConnectionState('FAILED');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission was denied by the user.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No microphone hardware found on this device.');
      }
      throw err;
    }
  }

  private async publishLocalStreamToEngines(): Promise<void> {
    if (!this.localStream) return;

    // 1. ZEGOCLOUD Room Publish
    if (this.zgEngine && this.config) {
      try {
        await this.zgEngine.loginRoom(
          this.config.roomId,
          this.config.token,
          { userID: this.config.userId, userName: this.config.userId },
          { userUpdate: true },
        );

        this.zgStreamId = `stream_${this.config.userId}_${Date.now()}`;
        const zegoStream = await this.zgEngine.createZegoStream({
          camera: {
            video: !this.cameraMuted && !this.isAudioOnlyFallback,
            audio: !this.micMuted,
          },
        });
        await this.zgEngine.startPublishingStream(this.zgStreamId, zegoStream);
        this.setConnectionState('CONNECTED');
      } catch (zgPubErr) {
        console.warn('[Zego] publish stream notice:', zgPubErr);
      }
    }

    // 2. Setup RTCPeerConnection for WebRTC mesh relay
    this.initiatePeerOffer();
  }

  private async getOrCreatePeerConnection(): Promise<RTCPeerConnection | null> {
    if (typeof RTCPeerConnection === 'undefined') return null;
    if (this.peerConnection) return this.peerConnection;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.setRemoteStream(event.streams[0]);
        this.setConnectionState('CONNECTED');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.config) {
        this.socket.emit('webrtc:signal', {
          roomId: this.config.roomId,
          signal: { candidate: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.setConnectionState('CONNECTED');
      } else if (pc.connectionState === 'disconnected') {
        this.setConnectionState('DISCONNECTED');
      } else if (pc.connectionState === 'failed') {
        this.setConnectionState('FAILED');
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  private async initiatePeerOffer(): Promise<void> {
    if (!this.socket || !this.config || !this.localStream) return;
    try {
      const pc = await this.getOrCreatePeerConnection();
      if (!pc) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc:signal', {
        roomId: this.config.roomId,
        signal: { offer: pc.localDescription },
      });
    } catch (offerErr) {
      console.warn('[WebRTC] Error initiating peer offer:', offerErr);
    }
  }

  private async handlePeerSignal(data: any): Promise<void> {
    if (!data?.signal) return;
    try {
      const pc = await this.getOrCreatePeerConnection();
      if (!pc) return;
      if (data.signal.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.socket?.emit('webrtc:signal', {
          roomId: this.config?.roomId,
          signal: { answer: pc.localDescription },
        });
      } else if (data.signal.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal.answer));
      } else if (data.signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
      }
    } catch (sigErr) {
      console.warn('[WebRTC] Signal handling error:', sigErr);
    }
  }

  stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  toggleMic(muted: boolean): boolean {
    this.micMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    return !this.micMuted;
  }

  toggleCamera(muted: boolean): boolean {
    this.cameraMuted = muted;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    return !this.cameraMuted;
  }

  setRemoteStream(stream: MediaStream): void {
    this.remoteStream = stream;
    this.remoteCallbacks.forEach((cb) => cb(stream));
  }

  async leaveRoom(): Promise<void> {
    // 1. Stop local hardware tracks
    this.stopLocalStream();

    // 2. Stop remote tracks
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((t) => t.stop());
      this.remoteStream = null;
    }

    // 3. Stop Zego SDK stream & logout
    if (this.zgEngine && this.config) {
      try {
        if (this.zgStreamId) {
          this.zgEngine.stopPublishingStream(this.zgStreamId);
          this.zgStreamId = null;
        }
        await this.zgEngine.logoutRoom(this.config.roomId);
      } catch (zgErr) {
        console.warn('[Zego] Logout notice:', zgErr);
      }
    }

    // 4. Close PeerConnection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // 5. Disconnect Socket
    if (this.socket) {
      this.socket.emit('leave:room', {
        roomId: this.config?.roomId,
        userId: this.config?.userId,
      });
      this.socket.disconnect();
      this.socket = null;
    }

    this.setConnectionState('DISCONNECTED');
    this.disconnectCallbacks.forEach((cb) => cb('USER_LEAVE'));
  }

  onRemoteStream(callback: (stream: MediaStream) => void): () => void {
    this.remoteCallbacks.add(callback);
    if (this.remoteStream) {
      callback(this.remoteStream);
    }
    return () => this.remoteCallbacks.delete(callback);
  }

  onDisconnect(callback: (reason: string) => void): () => void {
    this.disconnectCallbacks.add(callback);
    return () => this.disconnectCallbacks.delete(callback);
  }

  onConnectionState(callback: (state: ConnectionState) => void): () => void {
    this.stateCallbacks.add(callback);
    callback(this.connectionState);
    return () => this.stateCallbacks.delete(callback);
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
}

/**
 * Factory for creating appropriate CommunicationService based on server configuration.
 */
export function createCommunicationService(isConfigured: boolean): ICommunicationService {
  if (!isConfigured) {
    return new UnavailableCommunicationService();
  }
  return new RealWebRTCCommunicationService();
}
