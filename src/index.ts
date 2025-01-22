// ... previous imports remain the same

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

    // ... other methods remain the same until setupExpressAndHandlers

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
                
                // Connect transport to this Server instance
                await this.connectTransport(transport);
                
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
                    this.disconnectTransport();
                });

                req.on('error', (error: Error) => {
                    clearInterval(keepAlive);
                    console.error('Connection error:', error);
                    this.disconnectTransport();
                });

                console.log('Transport configured successfully');
                
                // Set up request handlers after transport is ready
                this.setupRequestHandlers();

            } catch (error) {
                console.error('Error initializing transport:', error);
                res.end();
            }
        });

        // ... rest of the setupExpressAndHandlers method remains the same
    }

    // ... rest of the class remains the same
}

// ... rest of the file remains the same