import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { createServer } from "http";
import { z } from 'zod';
import axios from 'axios';
import 'dotenv/config';

const serverCapabilities: ServerCapabilities = {
    resources: {
        subscribe: true,
        listChanged: true,
        list: true,
        read: true,
        watch: true
    }
};

const ListRequestSchema = z.object({
    method: z.literal('list')
});

const ReadRequestSchema = z.object({
    method: z.literal('read'),
    params: z.object({
        id: z.string()
    })
});

class FigmaAPIServer extends Server {
    private app = express();
    private server = createServer(this.app);
    private figmaToken: string;
    private baseURL = 'https://api.figma.com/v1';

    constructor(figmaToken: string) {
        super(
            { name: "figma-api-server", version: "1.0.0" },
            { capabilities: serverCapabilities }
        );

        if (!figmaToken) {
            throw new Error('FIGMA_ACCESS_TOKEN is required');
        }
        this.figmaToken = figmaToken;

        // Set up basic express configuration
        this.app.use(express.json());
        
        // Set up SSE endpoint
        this.app.get('/events', (req, res) => {
            console.log('New SSE connection');
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const transport = new SSEServerTransport('/events', res);
            this.setupHandlers(transport);

            req.on('close', () => {
                console.log('Client disconnected');
            });
        });
    }

    private setupHandlers(transport: SSEServerTransport) {
        // List files handler
        this.setRequestHandler(ListRequestSchema, async () => {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/me/files`,
                headers: {
                    'X-Figma-Token': this.figmaToken
                }
            });

            return {
                resources: response.data.files.map((file: any) => ({
                    id: file.key,
                    type: 'figma.file',
                    attributes: {
                        name: file.name,
                        lastModified: file.last_modified,
                        thumbnailUrl: file.thumbnail_url,
                        version: file.version
                    }
                }))
            };
        });

        // Read file handler
        this.setRequestHandler(ReadRequestSchema, async (request) => {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/files/${request.params.id}`,
                headers: {
                    'X-Figma-Token': this.figmaToken
                }
            });

            return {
                resource: {
                    id: request.params.id,
                    type: 'figma.file',
                    attributes: {
                        name: response.data.name,
                        lastModified: response.data.lastModified,
                        version: response.data.version,
                        document: response.data.document
                    }
                }
            };
        });
    }

    public async start() {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
        
        await new Promise<void>((resolve) => {
            this.server.listen(port, () => {
                console.log(`Server running on port ${port}`);
                resolve();
            });
        });
    }
}

// Start the server
const token = process.env.FIGMA_ACCESS_TOKEN;
if (!token) {
    console.error('FIGMA_ACCESS_TOKEN environment variable is required');
    process.exit(1);
}

const server = new FigmaAPIServer(token);
server.start().catch(error => {
    console.error('Server failed to start:', error);
    process.exit(1);
});