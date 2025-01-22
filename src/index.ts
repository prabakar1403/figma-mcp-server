// ... (previous imports remain the same)

class FigmaAPIServer {
    // ... (previous class properties remain the same)

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
        this.expressApp.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
            if (req.body) {
                console.log('Request body:', req.body);
            }
            next();
        });

        // SSE endpoint with improved error handling
        this.expressApp.get('/events', async (req, res: ServerResponse) => {
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

                req.on('error', (error) => {
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

        // ... (rest of the setup remains the same)
    }

    // ... (rest of the class remains the same)
}
