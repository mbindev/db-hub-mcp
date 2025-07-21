import { Connector, ConnectorType, ConnectorRegistry } from "./interface.js";
import { SSHTunnel } from "../utils/ssh-tunnel.js";
import { resolveSSHConfig } from "../config/env.js";
import type { SSHTunnelConfig } from "../types/ssh.js";

// Singleton instance for global access
let managerInstance: ConnectorManager | null = null;

/**
 * Manages database connectors and provides a unified interface to work with them
 */
export class ConnectorManager {
  private activeConnector: Connector | null = null;
  private connected = false;
  private sshTunnel: SSHTunnel | null = null;
  private originalDSN: string | null = null;

  constructor() {
    if (!managerInstance) {
      managerInstance = this;
    }
  }

  /**
   * Initialize and connect to the database using a DSN
   */
  async connectWithDSN(dsn: string, initScript?: string): Promise<void> {
    // Store original DSN for reference
    this.originalDSN = dsn;
    
    // Check if SSH tunnel is needed
    const sshConfig = resolveSSHConfig();
    let actualDSN = dsn;
    
    if (sshConfig) {
      console.error(`SSH tunnel configuration loaded from ${sshConfig.source}`);
      
      // Parse DSN to get database host and port
      const url = new URL(dsn);
      const targetHost = url.hostname;
      const targetPort = parseInt(url.port) || this.getDefaultPort(dsn);
      
      // Create and establish SSH tunnel
      this.sshTunnel = new SSHTunnel();
      const tunnelInfo = await this.sshTunnel.establish(sshConfig.config, {
        targetHost,
        targetPort,
      });
      
      // Update DSN to use local tunnel endpoint
      url.hostname = '127.0.0.1';
      url.port = tunnelInfo.localPort.toString();
      actualDSN = url.toString();
      
      console.error(`Database connection will use SSH tunnel through localhost:${tunnelInfo.localPort}`);
    }

    // First try to find a connector that can handle this DSN
    let connector = ConnectorRegistry.getConnectorForDSN(actualDSN);

    if (!connector) {
      throw new Error(`No connector found that can handle the DSN: ${actualDSN}`);
    }

    this.activeConnector = connector;

    // Connect to the database through tunnel if applicable
    await this.activeConnector.connect(actualDSN, initScript);
    this.connected = true;
  }

  /**
   * Initialize and connect to the database using a specific connector type
   */
  async connectWithType(connectorType: ConnectorType, dsn?: string): Promise<void> {
    // Get the connector from the registry
    const connector = ConnectorRegistry.getConnector(connectorType);

    if (!connector) {
      throw new Error(`Connector "${connectorType}" not found`);
    }

    this.activeConnector = connector;

    // Use provided DSN or get sample DSN
    const connectionString = dsn || connector.dsnParser.getSampleDSN();

    // Connect to the database
    await this.activeConnector.connect(connectionString);
    this.connected = true;
  }

  /**
   * Close the database connection
   */
  async disconnect(): Promise<void> {
    if (this.activeConnector && this.connected) {
      await this.activeConnector.disconnect();
      this.connected = false;
    }
    
    // Close SSH tunnel if it exists
    if (this.sshTunnel) {
      await this.sshTunnel.close();
      this.sshTunnel = null;
    }
    
    this.originalDSN = null;
  }

  /**
   * Get the active connector
   */
  getConnector(): Connector {
    if (!this.activeConnector) {
      throw new Error("No active connector. Call connectWithDSN() or connectWithType() first.");
    }
    return this.activeConnector;
  }

  /**
   * Check if there's an active connection
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get all available connector types
   */
  static getAvailableConnectors(): ConnectorType[] {
    return ConnectorRegistry.getAvailableConnectors();
  }

  /**
   * Get sample DSNs for all available connectors
   */
  static getAllSampleDSNs(): { [key in ConnectorType]?: string } {
    return ConnectorRegistry.getAllSampleDSNs();
  }

  /**
   * Get the current active connector instance
   * This is used by resource and tool handlers
   */
  static getCurrentConnector(): Connector {
    if (!managerInstance) {
      throw new Error("ConnectorManager not initialized");
    }
    return managerInstance.getConnector();
  }
  
  /**
   * Get default port for a database based on DSN protocol
   */
  private getDefaultPort(dsn: string): number {
    if (dsn.startsWith('postgres://') || dsn.startsWith('postgresql://')) {
      return 5432;
    } else if (dsn.startsWith('mysql://')) {
      return 3306;
    } else if (dsn.startsWith('mariadb://')) {
      return 3306;
    } else if (dsn.startsWith('sqlserver://')) {
      return 1433;
    }
    // SQLite doesn't use ports
    return 0;
  }
}
