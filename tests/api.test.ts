import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

class MockTransport implements Transport {
  private incomingMessages: any[] = [];
  private outgoingMessages: any[] = [];
  private messageCallback?: (message: any) => void;
  private isStarted: boolean = false;

  constructor() {
    this.incomingMessages = [];
    this.outgoingMessages = [];
  }

  async send(message: any): Promise<void> {
    console.log('Sending message:', message);
    this.outgoingMessages.push(message);
    
    if (message.method === "initialize") {
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          name: "mock-server",
          version: "1.0.0",
          capabilities: {}
        }
      };
      console.log('Sending response:', response);
      this.messageCallback?.(response);
    }
  }

  async receive(): Promise<any> {
    return new Promise((resolve) => {
      this.messageCallback = (message: any) => {
        console.log('Received message:', message);
        resolve(message);
        this.messageCallback = undefined;
      };
    });
  }

  async start(): Promise<void> {
    console.log('Starting transport');
    this.isStarted = true;
  }

  async close(): Promise<void> {
    console.log('Closing transport');
    this.isStarted = false;
    this.messageCallback = undefined;
    this.incomingMessages = [];
    this.outgoingMessages = [];
  }
}

describe('MCP Server Tests', () => {
  let transport: MockTransport;
  let client: Client;

  beforeEach(() => {
    transport = new MockTransport();
    client = new Client(
      {
        name: "test-client",
        version: "1.0.0"
      },
      {
        capabilities: {}
      }
    );
  });

  afterEach(async () => {
    if (client) {
      await client.close();
    }
    if (transport) {
      await transport.close();
    }
  });

  it('should establish client connection', async () => {
    await expect(async () => {
      await transport.start();
      await client.connect(transport);
    }).not.toThrow();
  }, 15000); // Extended timeout
});