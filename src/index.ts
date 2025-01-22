import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { 
    InitializeRequestSchema,
    ServerCapabilities,
    ClientCapabilities,
    LATEST_PROTOCOL_VERSION
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { ServerResponse } from 'http';
import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

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

class FigmaAPIServer extends Server {
    private figmaToken: string;
    private baseURL: string = 'https://api.figma.com/v1';
    private watchedResources: Map<string, { lastModified: string }> = new Map();
    private expressApp: express.Application;
    private httpServer: ReturnType<typeof createServer>;
    private clientCapabilities?: ClientCapabilities;

    constructor(figmaToken: string) {
        // Initialize with server info and capabilities
        const serverCapabilities: ServerCapabilities = {
            resources: {
                subscribe: true,
                listChanged: true,
                list: true,
                read: true,
                watch: true
            },
            commands: {},
            events: {}
        };

        super(
            {
                name: "figma-api-server",
                version: "1.0.0"
            },
            {
                capabilities: serverCapabilities
            }
        );
        
        if (!figmaToken) {
            throw new Error('FIGMA_ACCESS_TOKEN is required but not provided');
        }
        
        this.figmaToken = figmaToken;
        this.expressApp = express();
        this.httpServer = createServer(this.expressApp);
        
        // Set up handlers after initialization
        this.setupExpressAndHandlers();

        // Set up initialize request handler
        this.setRequestHandler(InitializeRequestSchema, async (request) => {
            this.clientCapabilities = request.params.capabilities;
            return {
                protocolVersion: request.params.protocolVersion || LATEST_PROTOCOL_VERSION,
                capabilities: serverCapabilities,
                serverInfo: {
                    name: "figma-api-server",
                    version: "1.0.0"
                }
            };
        });
    }

    private setupExpressAndHandlers() {
        // Express middleware setup
        this.expressApp.use(express.json());
        this.expressApp.use(express.text());
        this.expressApp.use(cors({
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'X-Figma-Token'],
            credentials: true
        }));

        // Logging middleware
        this.expressApp.use((req: Request, res: Response, next: NextFunction) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            if (req.body) {
                console.log('Request body:', req.body);
            }
            next();
        });

        // SSE endpoint
        this.expressApp.get('/events', async (req: Request, res: ServerResponse) => {
            console.log('New SSE connection attempt');
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            try {
                // Create new SSE transport
                const transport = new SSEServerTransport('/events', res);
                
                // Set the transport
                this.setTransport(transport);
                
                // Send initial connection message
                res.write('data: {"type":"connection","status":"connected"}\n\n');
                
                // Set up keepalive
                const keepAlive = setInterval(() => {
                    try {
                        res.write('data: {"type":"ping"}\n\n');
                    } catch (error) {
                        clearInterval(keepAlive);
                        console.error('Error sending keepalive:', error);
                    }
                }, 30000);

                // Handle disconnection
                req.on('close', () => {
                    clearInterval(keepAlive);
                    console.log('Client disconnected');
                    this.setTransport(undefined);
                });

                req.on('error', (error: Error) => {
                    clearInterval(keepAlive);
                    console.error('Connection error:', error);
                    this.setTransport(undefined);
                });

                console.log('Transport configured successfully');
                
                // Set up request handlers after transport is ready
                this.setupRequestHandlers();

            } catch (error) {
                console.error('Error initializing transport:', error);
                res.end();
            }
        });

        // Health check endpoint
        this.expressApp.get('/health', (req: Request, res: Response) => {
            res.json({ status: 'healthy' });
        });

        // Error handling middleware
        this.expressApp.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            console.error('Error processing request:', err);
            res.status(500).json({
                error: 'Internal server error',
                message: err.message
            });
        });
    }

    private setupRequestHandlers() {
        // List resources handler
        this.setRequestHandler(ListRequestSchema, async () => {
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
        this.setRequestHandler(ReadRequestSchema, async (request) => {
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
        this.setRequestHandler(WatchRequestSchema, async (request) => {
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

    private setTransport(transport: Transport | undefined) {
        // Use the protected setTransport method from parent class
        super.transport = transport;
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

export default FigmaAPIServer;

// Start the server
if (require.main === module) {
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
}