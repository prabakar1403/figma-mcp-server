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

export interface ResourceHandler {
  list(): Promise<FigmaResource[]>;
  read(uri: string): Promise<ResourceContents[]>;
  search(query: string): Promise<FigmaResource[]>;
  watch(uri: string): Promise<void>;
}

export interface CreationParams {
  type: string;
  properties: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fill?: any;
    stroke?: any;
    strokeWeight?: number;
  };
}

export type Point = {
  x: number;
  y: number;
};

// Rest of the type definitions...