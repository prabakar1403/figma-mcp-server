import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express from "express";
import { createServer } from "http";
import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables
dotenv.config();

// Define request schemas
const ListRequestSchema = z.object({
  method: z.literal('list')
});

const ReadRequestSchema = z.object({
  method: z.literal('read'),
  params: z.object({
    id: z.string()
  })
});

const WatchRequestSchema = z.object({
  method: z.literal('watch'),
  params: z.object({
    resources: z.array(z.object({
      id: z.string(),
      type: z.string(),
      attributes: z.record(z.unknown())
    }))
  })
});

const SubscribeRequestSchema = z.object({
  method: z.literal('subscribe'),
  params: z.object({
    resources: z.array(z.object({
      id: z.string(),
      type: z.string(),
      attributes: z.record(z.unknown())
    }))
  })
});

const UnsubscribeRequestSchema = z.object({
  method: z.literal('unsubscribe'),
  params: z.object({
    resources: z.array(z.object({
      id: z.string(),
      type: z.string(),
      attributes: z.record(z.unknown())
    }))
  })
});

// Define response schemas
const ListResponseSchema = z.object({
  resources: z.array(z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.unknown())
  }))
});

const ReadResponseSchema = z.object({
  resource: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.unknown())
  })
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

// Define resource schemas
const FigmaFileSchema = z.object({
  key: z.string(),
  name: z.string(),
  lastModified: z.string(),
  thumbnailUrl: z.string().optional(),
  version: z.string()
});

type FigmaFile = z.infer<typeof FigmaFileSchema>;
interface MCPResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

class FigmaAPIServer {
    private server: Server;
    private figmaToken: string;
    private baseURL: string = 'https://api.figma.com/v1';
    private watchedResources: Map<string, { lastModified: string }> = new Map();
    private expressApp: express.Application;
    private httpServer: ReturnType<typeof createServer>;
    private currentTransport?: Transport;

    constructor(figmaToken: string) {
        if (!figmaToken) {
            throw new Error('FIGMA_ACCESS_TOKEN is required but not provided');
        }
        
        console.log(`Initializing server with token starting with: ${figmaToken.substring(0, 8)}...`);
        
        this.figmaToken = figmaToken;

        // Create transport first
        const transport = new SSEServerTransport('/events');

        this.server = new Server({
            name: "figma-api-server",
            version: "1.0.0",
            transport: transport  // Initialize with transport
        }, {
            capabilities: {
                resources: {
                    subscribe: true,
                    listChanged: true,
                    list: true,
                    read: true,
                    watch: true
                },
                commands: {},
                events: {}
            }
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

        // Add JSON parsing middleware
        this.expressApp.use(express.json());

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
            
            // Set headers
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            // Send initial connection established message
            res.write('event: connected\ndata: {}\n\n');

            // Keep connection alive
            const keepAlive = setInterval(() => {
                res.write(': keepalive\n\n');
            }, 30000);

            try {
                // Create SSE transport for this connection
                const sseTransport = new SSEServerTransport('/events', res) as Transport;
                
                // Store transport reference
                this.currentTransport = sseTransport;
                console.log('Transport added successfully');

                // Handle client disconnect
                req.on('close', () => {
                    clearInterval(keepAlive);
                    console.log('Client disconnected');
                    this.currentTransport = undefined;
                });
            } catch (error) {
                console.error('Error setting up SSE transport:', error);
                clearInterval(keepAlive);
                res.end();
            }
        });

        // Health check endpoint
        this.expressApp.get('/health', (req, res) => {
            res.json({ status: 'healthy' });
        });

        // Error handling middleware
        this.expressApp.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            console.error('Error processing request:', err);
            res.status(500).json({
                error: 'Internal server error',
                message: err.message
            });
        });
    }

    private setupHandlers() {
        // List resources handler
        this.server.setRequestHandler(ListRequestSchema, async () => {
            try {
                console.log('Listing Figma files...');
                const response = await this.makeAPIRequest('/me/files');
                const files: MCPResource[] = response.files.map((file: any) => ({
                    id: file.key,
                    type: 'figma.file',
                    attributes: {
                        name: file.name,
                        lastModified: file.last_modified,
                        thumbnailUrl: file.thumbnail_url,
                        version: file.version
                    }
                }));
                console.log(`Found ${files.length} files`);
                return { resources: files };
            } catch (error) {
                console.error('Error listing files:', error);
                throw error;
            }
        });

        // Read resource handler
        this.server.setRequestHandler(ReadRequestSchema, async (request) => {
            try {
                console.log(`Reading file: ${request.params.id}`);
                const response = await this.makeAPIRequest(`/files/${request.params.id}`);
                
                return {
                    resource: {
                        id: request.params.id,
                        type: 'figma.file',
                        attributes: {
                            name: response.name,
                            lastModified: response.lastModified,
                            version: response.version,
                            document: response.document
                        }
                    }
                };
            } catch (error) {
                console.error(`Error reading file ${request.params.id}:`, error);
                throw error;
            }
        });

        // Watch handler
        this.server.setRequestHandler(WatchRequestSchema, async (request) => {
            console.log('Watch request received for resources:', request.params.resources);
            
            for (const resource of request.params.resources) {
                if (!this.watchedResources.has(resource.id)) {
                    try {
                        const response = await this.makeAPIRequest(`/files/${resource.id}`);
                        this.watchedResources.set(resource.id, {
                            lastModified: response.lastModified
                        });
                    } catch (error) {
                        console.error(`Error watching resource ${resource.id}:`, error);
                    }
                }
            }

            // Set up periodic checking for changes
            setInterval(async () => {
                for (const [id, data] of this.watchedResources.entries()) {
                    try {
                        const response = await this.makeAPIRequest(`/files/${id}`);
                        if (response.lastModified !== data.lastModified) {
                            await this.server.notification({
                                method: "resourceChanged",
                                params: {
                                    resource: {
                                        id,
                                        type: 'figma.file',
                                        attributes: {
                                            name: response.name,
                                            lastModified: response.lastModified,
                                            version: response.version
                                        }
                                    }
                                }
                            });
                            this.watchedResources.set(id, {
                                lastModified: response.lastModified
                            });
                        }
                    } catch (error) {
                        console.error(`Error checking updates for ${id}:`, error);
                    }
                }
            }, 30000); // Check every 30 seconds
            
            return { ok: true };
        });

        // Subscribe handler
        this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
            console.log('Subscribe request received for resources:', request.params.resources);
            return { ok: true };
        });

        // Unsubscribe handler
        this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
            console.log('Unsubscribe request received for resources:', request.params.resources);
            request.params.resources.forEach(resource => {
                this.watchedResources.delete(resource.id);
            });
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

            // Add signal handlers
            process.on('SIGTERM', () => {
                console.log('Received SIGTERM. Performing graceful shutdown...');
                this.httpServer.close(() => {
                    console.log('Server shut down successfully');
                    process.exit(0);
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
        
        // Add more detailed environment validation
        const requiredEnvVars = ['FIGMA_ACCESS_TOKEN'];
        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingEnvVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
        }

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