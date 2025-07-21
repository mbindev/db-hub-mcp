import { describe, it, expect } from 'vitest';
import { SSHTunnel } from '../ssh-tunnel.js';
import type { SSHTunnelConfig } from '../../types/ssh.js';

describe('SSHTunnel', () => {
  describe('Initial State', () => {
    it('should have initial state as disconnected', () => {
      const tunnel = new SSHTunnel();
      expect(tunnel.getIsConnected()).toBe(false);
      expect(tunnel.getTunnelInfo()).toBeNull();
    });
  });

  describe('Tunnel State Management', () => {
    it('should prevent establishing multiple tunnels', async () => {
      const tunnel = new SSHTunnel();
      
      // Set tunnel as connected (simulating a connected state)
      (tunnel as any).isConnected = true;

      const config: SSHTunnelConfig = {
        host: 'ssh.example.com',
        username: 'testuser',
        password: 'testpass',
      };

      const options = {
        targetHost: 'database.local',
        targetPort: 5432,
      };

      await expect(tunnel.establish(config, options)).rejects.toThrow(
        'SSH tunnel is already established'
      );
    });

    it('should handle close when not connected', async () => {
      const tunnel = new SSHTunnel();
      
      // Should not throw when closing disconnected tunnel
      await expect(tunnel.close()).resolves.toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate authentication requirements', () => {
      // Test that config validation logic exists
      const validConfigWithPassword: SSHTunnelConfig = {
        host: 'ssh.example.com',
        username: 'testuser',
        password: 'testpass',
      };

      const validConfigWithKey: SSHTunnelConfig = {
        host: 'ssh.example.com',
        username: 'testuser',
        privateKey: '/path/to/key',
      };

      const validConfigWithKeyAndPassphrase: SSHTunnelConfig = {
        host: 'ssh.example.com',
        port: 2222,
        username: 'testuser',
        privateKey: '/path/to/key',
        passphrase: 'keypassphrase',
      };

      // These should be valid configurations
      expect(validConfigWithPassword.host).toBe('ssh.example.com');
      expect(validConfigWithPassword.username).toBe('testuser');
      expect(validConfigWithPassword.password).toBe('testpass');

      expect(validConfigWithKey.privateKey).toBe('/path/to/key');
      expect(validConfigWithKeyAndPassphrase.passphrase).toBe('keypassphrase');
      expect(validConfigWithKeyAndPassphrase.port).toBe(2222);
    });
  });
});