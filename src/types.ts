import { z } from 'zod';
import { ResourceContents as MCPResourceContents } from '@modelcontextprotocol/sdk/types';

// Re-export ResourceContents
export type ResourceContents = MCPResourceContents;

// Rest of the types remain the same...
export type FigmaFile = {
  key: string;
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
};

// ... (rest of the type definitions)
