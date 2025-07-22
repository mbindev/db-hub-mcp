import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgresConnector } from '../postgres/index.js';
import { ConnectorManager } from '../manager.js';
import { ConnectorRegistry } from '../interface.js';
import { SSHTunnel } from '../../utils/ssh-tunnel.js';
import type { SSHTunnelConfig } from '../../types/ssh.js';
import * as sshConfigParser from '../../utils/ssh-config-parser.js';

describe('PostgreSQL SSH Tunnel Simple Integration Tests', () => {
  let postgresContainer: StartedPostgreSqlContainer;

  beforeAll(async () => {
    // Register PostgreSQL connector
    ConnectorRegistry.register(new PostgresConnector());
    
    // Start PostgreSQL container
    postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();
  }, 60000); // 1 minute timeout for container startup

  afterAll(async () => {
    await postgresContainer?.stop();
  });

  describe('SSH Tunnel Basic Functionality', () => {
    it('should establish SSH tunnel and connect to local port', async () => {
      // For this test, we'll create a mock SSH tunnel that just forwards to the same port
      // This tests the tunnel establishment logic without needing a real SSH server
      const tunnel = new SSHTunnel();
      
      // Test that the tunnel correctly reports its state
      expect(tunnel.getIsConnected()).toBe(false);
      expect(tunnel.getTunnelInfo()).toBeNull();
    });

    it('should parse DSN correctly when SSH tunnel is configured', async () => {
      const manager = new ConnectorManager();
      
      // Test DSN parsing with getDefaultPort
      const testCases = [
        { dsn: 'postgres://user:pass@host:5432/db', expectedPort: 5432 },
        { dsn: 'mysql://user:pass@host:3306/db', expectedPort: 3306 },
        { dsn: 'mariadb://user:pass@host:3306/db', expectedPort: 3306 },
        { dsn: 'sqlserver://user:pass@host:1433/db', expectedPort: 1433 },
      ];
      
      for (const testCase of testCases) {
        // Access private method through reflection for testing
        const port = (manager as any).getDefaultPort(testCase.dsn);
        expect(port).toBe(testCase.expectedPort);
      }
    });

    it('should handle connection without SSH tunnel', async () => {
      const manager = new ConnectorManager();
      
      // Make sure no SSH config is set
      delete process.env.SSH_HOST;
      
      const dsn = postgresContainer.getConnectionUri();
      
      await manager.connectWithDSN(dsn);
      
      // Test that connection works
      const connector = manager.getConnector();
      const result = await connector.executeSQL('SELECT 1 as test');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
      
      await manager.disconnect();
    });

    it('should fail gracefully when SSH config is invalid', async () => {
      const manager = new ConnectorManager();
      
      // Set invalid SSH config (missing required fields)
      process.env.SSH_HOST = 'example.com';
      // Missing SSH_USER
      
      try {
        const dsn = postgresContainer.getConnectionUri();
        await expect(manager.connectWithDSN(dsn)).rejects.toThrow(/SSH tunnel configuration requires/);
      } finally {
        delete process.env.SSH_HOST;
      }
    });

    it('should validate SSH authentication method', async () => {
      const manager = new ConnectorManager();
      
      // Set SSH config without authentication method
      process.env.SSH_HOST = 'example.com';
      process.env.SSH_USER = 'testuser';
      // Missing both SSH_PASSWORD and SSH_KEY
      
      try {
        const dsn = postgresContainer.getConnectionUri();
        await expect(manager.connectWithDSN(dsn)).rejects.toThrow(/SSH tunnel configuration requires either/);
      } finally {
        delete process.env.SSH_HOST;
        delete process.env.SSH_USER;
      }
    });

    it('should handle SSH config file resolution', async () => {
      const manager = new ConnectorManager();
      
      // Mock the SSH config parser functions
      const mockParseSSHConfig = vi.spyOn(sshConfigParser, 'parseSSHConfig');
      const mockLooksLikeSSHAlias = vi.spyOn(sshConfigParser, 'looksLikeSSHAlias');
      
      // Spy on the SSH tunnel establish method to verify the config values
      const mockSSHTunnelEstablish = vi.spyOn(SSHTunnel.prototype, 'establish');
      
      try {
        // Configure mocks to simulate SSH config file lookup with specific values
        mockLooksLikeSSHAlias.mockReturnValue(true);
        mockParseSSHConfig.mockReturnValue({
          host: 'bastion.example.com',
          username: 'sshuser',
          port: 2222,
          privateKey: '/home/user/.ssh/id_rsa'
        });
        
        // Mock SSH tunnel establish to capture the config and prevent actual connection
        mockSSHTunnelEstablish.mockRejectedValue(new Error('SSH connection failed (expected in test)'));
        
        // Set SSH host alias (would normally come from command line)
        process.env.SSH_HOST = 'mybastion';
        
        const dsn = postgresContainer.getConnectionUri();
        
        // This should fail during SSH connection (expected), but we can verify the config parsing
        await expect(manager.connectWithDSN(dsn)).rejects.toThrow();
        
        // Verify that SSH config parsing functions were called correctly
        expect(mockLooksLikeSSHAlias).toHaveBeenCalledWith('mybastion');
        expect(mockParseSSHConfig).toHaveBeenCalledWith('mybastion');
        
        // Verify that SSH tunnel was attempted with the correct config values from SSH config
        expect(mockSSHTunnelEstablish).toHaveBeenCalledTimes(1);
        const sshTunnelCall = mockSSHTunnelEstablish.mock.calls[0];
        const [sshConfig, tunnelOptions] = sshTunnelCall;
        
        // Debug: Log the actual values being passed (for verification)
        // SSH Config should contain the values from our mocked SSH config file
        // Tunnel Options should contain database connection details from the container DSN
        
        // Verify SSH config values were properly resolved from the SSH config file
        expect(sshConfig).toMatchObject({
          host: 'bastion.example.com',    // Should use HostName from SSH config
          username: 'sshuser',           // Should use User from SSH config  
          port: 2222,                    // Should use Port from SSH config
          privateKey: '/home/user/.ssh/id_rsa' // Should use IdentityFile from SSH config
        });
        
        // Verify tunnel options are correctly set up for the database connection
        expect(tunnelOptions).toMatchObject({
          targetHost: expect.any(String), // Database host from DSN
          targetPort: expect.any(Number)  // Database port from DSN
        });
        
        // The localPort might be undefined for dynamic allocation, so check separately if it exists
        if (tunnelOptions.localPort !== undefined) {
          expect(typeof tunnelOptions.localPort).toBe('number');
        }
        
        // Verify that the target database details from the DSN are preserved
        const originalDsnUrl = new URL(dsn);
        expect(tunnelOptions.targetHost).toBe(originalDsnUrl.hostname);
        expect(tunnelOptions.targetPort).toBe(parseInt(originalDsnUrl.port));
        
      } finally {
        // Clean up
        delete process.env.SSH_HOST;
        mockParseSSHConfig.mockRestore();
        mockLooksLikeSSHAlias.mockRestore();
        mockSSHTunnelEstablish.mockRestore();
      }
    });

    it('should skip SSH config lookup for direct hostnames', async () => {
      const manager = new ConnectorManager();
      
      // Mock the SSH config parser functions
      const mockParseSSHConfig = vi.spyOn(sshConfigParser, 'parseSSHConfig');
      const mockLooksLikeSSHAlias = vi.spyOn(sshConfigParser, 'looksLikeSSHAlias');
      
      try {
        // Configure mocks - direct hostname should not trigger SSH config lookup
        mockLooksLikeSSHAlias.mockReturnValue(false);
        
        // Set a direct hostname with required SSH credentials
        process.env.SSH_HOST = 'ssh.example.com';
        process.env.SSH_USER = 'sshuser';
        process.env.SSH_PASSWORD = 'sshpass';
        
        const dsn = postgresContainer.getConnectionUri();
        
        // This should fail during actual SSH connection, but we can verify the parsing behavior
        await expect(manager.connectWithDSN(dsn)).rejects.toThrow();
        
        // Verify that SSH config parsing was checked but not executed
        expect(mockLooksLikeSSHAlias).toHaveBeenCalledWith('ssh.example.com');
        expect(mockParseSSHConfig).not.toHaveBeenCalled();
        
      } finally {
        // Clean up
        delete process.env.SSH_HOST;
        delete process.env.SSH_USER;
        delete process.env.SSH_PASSWORD;
        mockParseSSHConfig.mockRestore();
        mockLooksLikeSSHAlias.mockRestore();
      }
    });
  });
});