// ... (previous imports remain the same)

class FigmaAPIServer extends Server {
    private figmaToken: string;
    private baseURL: string = 'https://api.figma.com/v1';
    private watchedResources: Map<string, { lastModified: string }> = new Map();
    private expressApp: express.Application;
    private httpServer: ReturnType<typeof createServer>;
    // Remove the private transport property since it's already managed by the parent Server class
    private clientCapabilities?: ClientCapabilities;

    // ... (rest of the class implementation)
}
