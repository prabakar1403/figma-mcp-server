import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { ServerResponse } from 'http';
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
    private transport?: Transport;

    constructor(figmaToken: string) {
        if (!figmaToken) {
            throw new Error('FIGMA_ACCESS_TOKEN is required but not provided');
        }
        
        console.log(`Initializing server with token starting with: ${figmaToken.substring(0, 8)}...`);
        
        this.figmaToken = figmaToken;
        this.expressApp = express();
        this.httpServer = createServer(this.expressApp);
        
        // Initialize Server
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

    private setupExpressAndHandlers() {
        // Express middleware
        this.expressApp.use(express.json());
        this.expressApp.use(express.text()); // Add text parsing middleware
        
        this.expressApp.use(cors({
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'X-Figma-Token'],
            credentials: true
        }));

        // Logging middleware with request body logging
        this.expressApp.use((req: Request, res: Response, next: NextFunction) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            if (req.body) {
                console.log('Request body:', req.body);
            }
            next();
        });

        // SSE endpoint with improved error handling
        this.expressApp.get('/events', async (req: Request, res: ServerResponse) => {
            console.log('New SSE connection attempt');
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            // Initialize transport first
            try {
                const transport = new SSEServerTransport('/events', res);
                
                // Create new server instance with this transport
                this.server = new Server(
                    {
                        name: "figma-api-server",
                        version: "1.0.0",
                        transport
                    },
                    {
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
                    }
                );

                // Set up request handlers
                this.setupRequestHandlers();
                
                // Send initial connection success
                res.write('data: {"type":"connection","status":"connected"}\n\n');
                
                // Keep connection alive
                const keepAlive = setInterval(() => {
                    try {
                        res.write('data: {"type":"ping"}\n\n');
                    } catch (error) {
                        console.error('Error sending keepalive:', error);
                        clearInterval(keepAlive);
                    }
                }, 30000);

                // Handle client disconnect
                req.on('close', () => {
                    console.log('Client disconnected');
                    clearInterval(keepAlive);
                    this.transport = undefined;
                });

                req.on('error', (error: Error) => {
                    console.error('Connection error:', error);
                    clearInterval(keepAlive);
                    this.transport = undefined;
                });

                this.transport = transport;
                console.log('Transport and server configured successfully');

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
        // ... (implement your request handlers here)
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