import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  Server,
  InitializeRequestSchema,
  InitializeResult,
  InitializeRequest,
  InitializedNotificationSchema,
  ResourceSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  ResourceUpdatedNotificationSchema,
  ServerCapabilities
} from "@modelcontextprotocol/sdk";
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

        const capabilities: ServerCapabilities = {
            resources: {
                subscribe: true,
                listChanged: true,
                list: true,
                read: true,
                watch: true
            },
            logging: {
                // Basic logging support
            }
        };

        this.server = new Server({
            name: "figma-api-server",
            version: "1.0.0",
        }, {
            capabilities,
            instructions: "This server provides access to Figma files and their updates."
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
        this.expressApp.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            next();
        });

        this.expressApp.use(cors({
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'X-Figma-Token'],
            credentials: true
        }));

        this.expressApp.get('/events', async (req, res) => {
            console.log('New SSE connection attempt');
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const sseTransport = new SSEServerTransport('/events', res);
            
            try {
                await this.server.addTransport(sseTransport);
                console.log('Transport added successfully');

                req.on('close', async () => {
                    console.log('Client disconnected');
                    await this.server.removeTransport(sseTransport);
                });
            } catch (error) {
                console.error('Error setting up SSE transport:', error);
                res.end();
            }
        });

        this.expressApp.get('/health', (req, res) => {
            res.json({ status: 'healthy' });
        });
    }

    private setupHandlers() {
        // Initialize handler
        this.server.setRequestHandler(
            InitializeRequestSchema,
            async (request: InitializeRequest): Promise<InitializeResult> => {
                const requestedVersion = request.params.protocolVersion;
                console.log(`Client requested protocol version: ${requestedVersion}`);

                return {
                    protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
                        ? requestedVersion
                        : LATEST_PROTOCOL_VERSION,
                    capabilities: this.server.getCapabilities(),
                    serverInfo: {
                        name: "figma-api-server",
                        version: "1.0.0"
                    }
                };
            }
        );

        // Handle initialized notification
        this.server.setNotificationHandler(
            InitializedNotificationSchema,
            async () => {
                console.log('Client fully initialized');
            }
        );

        // List resources handler
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            try {
                console.log('Listing Figma files...');
                const response = await this.makeAPIRequest('/me/files');
                
                const files = response.files.map((file: any) => ({
                    uri: `figma://${file.key}`,
                    name: file.name,
                    description: `Figma file last modified at ${file.last_modified}`,
                    mimeType: 'application/vnd.figma',
                    attributes: {
                        thumbnailUrl: file.thumbnail_url,
                        version: file.version,
                        lastModified: file.last_modified
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
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            try {
                const fileKey = request.params.uri.replace('figma://', '');
                console.log(`Reading file: ${fileKey}`);
                const response = await this.makeAPIRequest(`/files/${fileKey}`);
                
                return {
                    contents: [{
                        uri: request.params.uri,
                        mimeType: 'application/vnd.figma',
                        text: JSON.stringify(response.document)
                    }]
                };
            } catch (error) {
                console.error(`Error reading file: ${error}`);
                throw error;
            }
        });

        // Subscribe handler
        this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
            const fileKey = request.params.uri.replace('figma://', '');
            console.log(`Subscribe request received for file: ${fileKey}`);
            
            if (!this.watchedResources.has(fileKey)) {
                try {
                    const response = await this.makeAPIRequest(`/files/${fileKey}`);
                    this.watchedResources.set(fileKey, {
                        lastModified: response.lastModified
                    });
                    
                    // Set up periodic checking for this resource
                    setInterval(async () => {
                        try {
                            const currentData = await this.makeAPIRequest(`/files/${fileKey}`);
                            const cachedData = this.watchedResources.get(fileKey);
                            
                            if (cachedData && currentData.lastModified !== cachedData.lastModified) {
                                await this.server.notification({
                                    method: "notifications/resources/updated",
                                    params: {
                                        uri: `figma://${fileKey}`
                                    }
                                });
                                
                                this.watchedResources.set(fileKey, {
                                    lastModified: currentData.lastModified
                                });
                            }
                        } catch (error) {
                            console.error(`Error checking updates for ${fileKey}:`, error);
                        }
                    }, 30000); // Check every 30 seconds
                } catch (error) {
                    console.error(`Error subscribing to ${fileKey}:`, error);
                    throw error;
                }
            }
            
            return { ok: true };
        });

        // Unsubscribe handler
        this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
            const fileKey = request.params.uri.replace('figma://', '');
            console.log(`Unsubscribe request received for file: ${fileKey}`);
            this.watchedResources.delete(fileKey);
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

    public getServer() {
        return this.server;
    }
}

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