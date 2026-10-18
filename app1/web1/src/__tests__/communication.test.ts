import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UnavailableCommunicationService,
  RealWebRTCCommunicationService,
  NotConfiguredError,
  createCommunicationService,
} from '../services/communication/communication.service.js';

describe('Phase 6 CommunicationService Suite', () => {
  describe('UnavailableCommunicationService (Provider Not Configured)', () => {
    it('declares isConfigured as false and rejects stream requests with NotConfiguredError', async () => {
      const svc = new UnavailableCommunicationService();
      expect(svc.isConfigured).toBe(false);

      await expect(
        svc.initialize({
          appId: 12345,
          token: 'mock-token',
          roomId: 'room-1',
          userId: 'user-1',
          isConfigured: false,
        }),
      ).rejects.toThrow(NotConfiguredError);

      await expect(svc.startLocalStream()).rejects.toThrow(NotConfiguredError);
      expect(svc.getLocalStream()).toBeNull();
      expect(svc.getRemoteStream()).toBeNull();
    });

    it('createCommunicationService factory returns UnavailableCommunicationService when unconfigured', () => {
      const svc = createCommunicationService(false);
      expect(svc.isConfigured).toBe(false);
      expect(svc).toBeInstanceOf(UnavailableCommunicationService);
    });
  });

  describe('RealWebRTCCommunicationService (Configured Media Streams)', () => {
    let mockMediaStream: any;
    let mockAudioTrack: any;
    let mockVideoTrack: any;

    beforeEach(() => {
      mockAudioTrack = { kind: 'audio', enabled: true, stop: vi.fn() };
      mockVideoTrack = { kind: 'video', enabled: true, stop: vi.fn() };

      mockMediaStream = {
        getTracks: vi.fn(() => [mockAudioTrack, mockVideoTrack]),
        getAudioTracks: vi.fn(() => [mockAudioTrack]),
        getVideoTracks: vi.fn(() => [mockVideoTrack]),
      };

      // Mock navigator.mediaDevices.getUserMedia
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn(async () => mockMediaStream),
        },
      });
    });

    it('initializes and starts local media stream with expected constraints', async () => {
      const svc = new RealWebRTCCommunicationService();
      expect(svc.isConfigured).toBe(true);

      await svc.initialize({
        appId: 123456,
        token: 'signed-rtc-token',
        roomId: 'room-101',
        userId: 'patient-1',
        isConfigured: true,
      });

      const stream = await svc.startLocalStream(false);
      expect(stream).toBe(mockMediaStream);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
    });

    it('requests audio-only constraints when bandwidth mode is set to audio', async () => {
      const svc = new RealWebRTCCommunicationService();
      await svc.startLocalStream(true);

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: false,
      });
    });

    it('toggles microphone and camera tracks', async () => {
      const svc = new RealWebRTCCommunicationService();
      await svc.startLocalStream(false);

      // Mute mic
      svc.toggleMic(true);
      expect(mockAudioTrack.enabled).toBe(false);

      // Unmute mic
      svc.toggleMic(false);
      expect(mockAudioTrack.enabled).toBe(true);

      // Disable camera
      svc.toggleCamera(true);
      expect(mockVideoTrack.enabled).toBe(false);

      // Enable camera
      svc.toggleCamera(false);
      expect(mockVideoTrack.enabled).toBe(true);
    });

    it('handles remote stream subscription and stops tracks on leave', async () => {
      const svc = new RealWebRTCCommunicationService();
      await svc.startLocalStream(false);

      const remoteListener = vi.fn();
      svc.onRemoteStream(remoteListener);

      const mockRemoteTrack = { kind: 'video', stop: vi.fn() };
      const remoteStream = {
        getTracks: vi.fn(() => [mockRemoteTrack]),
      } as any;

      svc.setRemoteStream(remoteStream);
      expect(remoteListener).toHaveBeenCalledWith(remoteStream);
      expect(svc.getRemoteStream()).toBe(remoteStream);

      await svc.leaveRoom();
      expect(mockAudioTrack.stop).toHaveBeenCalled();
      expect(mockVideoTrack.stop).toHaveBeenCalled();
      expect(mockRemoteTrack.stop).toHaveBeenCalled();
      expect(svc.getLocalStream()).toBeNull();
      expect(svc.getRemoteStream()).toBeNull();
    });

    it('handles user permission denial with descriptive error message', async () => {
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn(async () => {
            const err = new Error('Permission denied');
            err.name = 'NotAllowedError';
            throw err;
          }),
        },
      });

      const svc = new RealWebRTCCommunicationService();
      await expect(svc.startLocalStream(false)).rejects.toThrow(
        /Camera or Microphone permission was denied/,
      );
    });
  });
});
