import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  Implementation,
  InitializeRequest,
  InitializeRequestSchema,
  InitializeResultSchema,
  LATEST_PROTOCOL_VERSION,
  Resource,
  ResourceSchema,
  ServerCapabilities,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { createServer } from "http";
import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables
dotenv.config();

// Define request schemas
const ListResourcesRequestSchema = z.object({
  method: z.literal('resources/list'),
  params: z.object({}).optional()
});

const ReadResourceRequestSchema = z.object({
  method: z.literal('resources/read'),
  params: z.object({
    uri: z.string()
  })
});

const WatchRequestSchema = z.object({
  method: z.literal('resources/watch'),
  params: z.object({
    resources: z.array(ResourceSchema)
  })
});

const SubscribeRequestSchema = z.object({
  method: z.literal('resources/subscribe'),
  params: z.object({
    uri: z.string()
  })
});

const UnsubscribeRequestSchema = z.object({
  method: z.literal('resources/unsubscribe'),
  params: z.object({
    uri: z.string()
  })
});

// Define response schemas
const ListResourcesResponseSchema = z.object({
  resources: z.array(ResourceSchema)
});

const ReadResourceResponseSchema = z.object({
  contents: z.array(z.object({
    uri: z.string(),
    mimeType: z.string().optional(),
    text: z.string()
  }))
});

const WatchResponseSchema = z.object({
  ok: z.boolean()
});

const SubscribeResponseSchema = z.object({
  ok: z.boolean()
});

const UnsubscribeResponseSchema = z.object({
  ok: z.boolean()
});

type ListResourcesRequest = z.infer<typeof ListResourcesRequestSchema>;
type ReadResourceRequest = z.infer<typeof ReadResourceRequestSchema>;
type WatchRequest = z.infer<typeof WatchRequestSchema>;
type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;
type UnsubscribeRequest = z.infer<typeof UnsubscribeRequestSchema>;

interface ServerState {
  clientCapabilities?: any;
  clientVersion?: Implementation;
  capabilities: ServerCapabilities;
  watchedResources: Map<string, { lastModified: string }>;
}

class FigmaAPIServer {
    private server: Server;
    private figmaToken: string;
    private baseURL: string = 'https://api.figma.com/v1';
    private state: ServerState = {
      capabilities: {
        resources: {
          subscribe: true,
          listChanged: true,
          list: true,
          read: true,
          watch: true
        }
      },
      watchedResources: new Map()
    };
    private expressApp: express.Application;
    private httpServer: ReturnType<typeof createServer>;
    private currentTransport?: Transport;

    constructor(figmaToken: string) {
        if (!figmaToken) {
            throw new Error('FIGMA_ACCESS_TOKEN is required but not provided');
        }
        
        console.log(`Initializing server with token starting with: ${figmaToken.substring(0, 8)}...`);
        
        this.figmaToken = figmaToken;
        this.server = new Server({
            name: "figma-api-server",
            version: "1.0.0",
        }, {
            capabilities: this.state.capabilities
        });

        this.expressApp = express();
        this.httpServer = createServer(this.expressApp);
        this.setupHandlers();
        this.setupExpress();
    }

    private async makeAPIRequest(endpoint: string, method: 'GET' | 'POST' = 'GET') {
        try {
            const response = await axios({
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: {
                    'X-Figma-Token': this.figmaToken,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            if (error instanceof AxiosError) {
                console.error(`Figma API error: ${error.response?.status} - ${error.response?.statusText}`);
                throw new Error(`Figma API error: ${error.response?.status} - ${error.message}`);
            }
            throw error;
        }
    }

    private setupExpress() {
        // Log all incoming requests
        this.expressApp.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            next();
        });

        // CORS configuration
        this.expressApp.use(cors({
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'X-Figma-Token'],
            credentials: true
        }));

        // SSE endpoint
        this.expressApp.get('/events', async (req, res) => {
            console.log('New SSE connection attempt');
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            // Create SSE transport for this connection
            const sseTransport = new SSEServerTransport('/events', res) as Transport;
            
            try {
                // Store transport reference
                this.currentTransport = sseTransport;
                console.log('Transport added successfully');

                // Handle client disconnect
                req.on('close', () => {
                    console.log('Client disconnected');
                    this.currentTransport = undefined;
                });
            } catch (error) {
                console.error('Error setting up SSE transport:', error);
                res.end();
            }
        });

        // Health check endpoint
        this.expressApp.get('/health', (req, res) => {
            res.json({ status: 'healthy' });
        });
    }

    private setupHandlers() {
        // Handle initialization
        this.server.setRequestHandler(InitializeRequestSchema, InitializeResultSchema, async (request: InitializeRequest) => {
          const requestedVersion = request.params.protocolVersion;
          this.state.clientCapabilities = request.params.capabilities;
          this.state.clientVersion = request.params.clientInfo;

          // Protocol version negotiation
          const supportedVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
            ? requestedVersion
            : LATEST_PROTOCOL_VERSION;

          return {
            protocolVersion: supportedVersion,
            capabilities: this.state.capabilities,
            serverInfo: {
              name: "figma-api-server",
              version: "1.0.0"
            }
          };
        });

        // List resources handler
        this.server.setRequestHandler(ListResourcesRequestSchema, ListResourcesResponseSchema, async (_request: ListResourcesRequest) => {
            try {
                console.log('Listing Figma files...');
                const response = await this.makeAPIRequest('/me/files');
                
                const files: Resource[] = response.files.map((file: any) => ({
                    uri: `figma://${file.key}`,
                    name: file.name,
                    description: `Figma file: ${file.name}`,
                    mimeType: 'application/figma',
                }));

                console.log(`Found ${files.length} files`);
                return { resources: files };
            } catch (error) {
                console.error('Error listing files:', error);
                throw error;
            }
        });

        // Read resource handler
        this.server.setRequestHandler(ReadResourceRequestSchema, ReadResourceResponseSchema, async (request: ReadResourceRequest) => {
            try {
                const fileKey = request.params.uri.replace('figma://', '');
                console.log(`Reading file: ${fileKey}`);
                const response = await this.makeAPIRequest(`/files/${fileKey}`);
                
                return {
                    contents: [{
                        uri: request.params.uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(response, null, 2)
                    }]
                };
            } catch (error) {
                console.error(`Error reading file: ${error}`);
                throw error;
            }
        });

        // Watch handler
        this.server.setRequestHandler(WatchRequestSchema, WatchResponseSchema, async (request: WatchRequest) => {
            console.log('Watch request received for resources:', request.params.resources);
            
            for (const resource of request.params.resources) {
                const fileKey = resource.uri.replace('figma://', '');
                if (!this.state.watchedResources.has(fileKey)) {
                    try {
                        const response = await this.makeAPIRequest(`/files/${fileKey}`);
                        this.state.watchedResources.set(fileKey, {
                            lastModified: response.lastModified
                        });
                    } catch (error) {
                        console.error(`Error watching resource ${fileKey}:`, error);
                    }
                }
            }

            // Set up periodic checking for changes
            setInterval(async () => {
                for (const [fileKey, data] of this.state.watchedResources.entries()) {
                    try {
                        const response = await this.makeAPIRequest(`/files/${fileKey}`);
                        if (response.lastModified !== data.lastModified) {
                            await this.server.notification({
                                method: "notifications/resources/updated",
                                params: {
                                    uri: `figma://${fileKey}`
                                }
                            });
                            this.state.watchedResources.set(fileKey, {
                                lastModified: response.lastModified
                            });
                        }
                    } catch (error) {
                        console.error(`Error checking updates for ${fileKey}:`, error);
                    }
                }
            }, 30000); // Check every 30 seconds
            
            return { ok: true };
        });

        // Subscribe handler
        this.server.setRequestHandler(SubscribeRequestSchema, SubscribeResponseSchema, async (request: SubscribeRequest) => {
            const fileKey = request.params.uri.replace('figma://', '');
            console.log('Subscribe request received for resource:', fileKey);
            return { ok: true };
        });

        // Unsubscribe handler
        this.server.setRequestHandler(UnsubscribeRequestSchema, UnsubscribeResponseSchema, async (request: UnsubscribeRequest) => {
            const fileKey = request.params.uri.replace('figma://', '');
            console.log('Unsubscribe request received for resource:', fileKey);
            this.state.watchedResources.delete(fileKey);
            return { ok: true };
        });
    }

    public async start() {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
        const host = process.env.HOST || 'localhost';

        try {
            await new Promise<void>((resolve) => {
                this.httpServer.listen(port, () => {
                    console.log(`Server starting up...`);
                    console.log(`HTTP server listening on http://${host}:${port}`);
                    console.log(`SSE endpoint available at http://${host}:${port}/events`);
                    resolve();
                });
            });

            console.log('Server started successfully');

        } catch (error) {
            console.error('Error starting server:', error);
            throw error;
        }
    }
}

// Start the server
async function main() {
    try {
        console.log('Starting Figma MCP server...');
        console.log('Environment variables loaded:', {
            FIGMA_ACCESS_TOKEN: process.env.FIGMA_ACCESS_TOKEN ? 'Present' : 'Missing',
            PORT: process.env.PORT || 3000,
            HOST: process.env.HOST || 'localhost',
            NODE_ENV: process.env.NODE_ENV
        });

        const figmaToken = process.env.FIGMA_ACCESS_TOKEN;
        if (!figmaToken) {
            throw new Error('FIGMA_ACCESS_TOKEN environment variable is required');
        }

        const server = new FigmaAPIServer(figmaToken);
        await server.start();
    } catch (error) {
        console.error('Fatal error starting server:', error);
        process.exit(1);
    }
}

main().catch(console.error);