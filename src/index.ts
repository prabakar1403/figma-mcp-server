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

// ... (keep all the schema definitions the same)

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
        this.server = new Server({
            name: "figma-api-server",
            version: "1.0.0"
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
        this.expressApp.get('/events', async (req, res: ServerResponse) => {
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
                // Create SSE transport with both endpoint and response object
                const transport = new SSEServerTransport('/events', res);
                
                // Update server transport
                this.server.transport = transport;
                
                // Store transport reference
                this.currentTransport = transport;
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

    // ... (keep all other methods the same)
}

// ... (keep the rest of the file the same)

export default FigmaAPIServer;