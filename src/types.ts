import { z } from 'zod';
import type { ResourceContents as MCPResourceContents } from '@modelcontextprotocol/sdk/types';

export type ResourceContents = {
  type: string;
  content: string;
  uri: string;
  mimeType?: string;
};

export type FigmaFile = {
  key: string;
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
};

export type FigmaComponent = {
  key: string;
  name: string;
  description: string;
  fileKey: string;
  nodeId: string;
};

export type FigmaVariable = {
  id: string;
  name: string;
  description: string;
  fileKey: string;
  resolvedType: string;
  valuesByMode: Record<string, any>;
};

export type FigmaResource = {
  uri: string;
  type: 'file' | 'component' | 'variable' | 'creation';
  name: string;
  description?: string;
  metadata?: Record<string, any>;
};

// Rest of the type definitions...