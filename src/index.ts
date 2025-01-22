import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express from "express";
import { createServer } from "http";
import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import { ServerResponse } from 'http';

// Load environment variables
dotenv.config();

// Define schemas
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

class FigmaAPIServer {
    private server: Server;
    private figmaToken: string;
    private baseURL: string = 'https://api.figma.com/v1';
    private watchedResources: Map<string, { lastModified: string }> = new Map();
    private expressApp: express.Application;
    private httpServer: ReturnType<typeof createServer>;
    private transport?: Transport;

    constructor(figmaToken: string) {
        if (!figmaToken) {
            throw new Error('FIGMA_ACCESS_TOKEN is required but not provided');
        }
        
        console.log(`Initializing server with token starting with: ${figmaToken.substring(0, 8)}...`);
        
        this.figmaToken = figmaToken;
        this.expressApp = express();
        this.httpServer = createServer(this.expressApp);
        
        // Initialize Server without transport
        this.server = new Server({
            name: "figma-api-server",
            version: "1.0.0",
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
        
        this.setupExpressAndHandlers();
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

    private setupExpressAndHandlers() {
        // Express middleware
        this.expressApp.use(express.json());
        this.expressApp.use(cors({
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'X-Figma-Token'],
            credentials: true
        }));

        // Logging middleware
        this.expressApp.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            next();
        });

        // SSE endpoint
        this.expressApp.get('/events', async (req, res: ServerResponse) => {
            console.log('New SSE connection attempt');
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            res.write('event: connected\ndata: {}\n\n');

            const keepAlive = setInterval(() => {
                res.write(': keepalive\n\n');
            }, 30000);

            try {
                // Create new transport instance for this connection
                this.transport = new SSEServerTransport('/events', res);
                
                // Create new server instance with this transport
                this.server = new Server({
                    name: "figma-api-server",
                    version: "1.0.0",
                    transport: this.transport
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

                // Set up request handlers for the new server instance
                this.setupRequestHandlers();
                
                console.log('Transport and server configured successfully');

                req.on('close', () => {
                    clearInterval(keepAlive);
                    console.log('Client disconnected');
                    this.transport = undefined;
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

    private setupRequestHandlers() {
        // List resources handler
        this.server.setRequestHandler(ListRequestSchema, async () => {
            try {
                console.log('Listing Figma files...');
                const response = await this.makeAPIRequest('/me/files');
                const files = response.files.map((file: any) => ({
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
            HOST: process.env.HOST || 'localhost'
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
