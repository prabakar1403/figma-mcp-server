import { z } from 'zod';
import { ResourceContents } from '@modelcontextprotocol/sdk/types';

// Existing types remain the same...
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

export type Color = {
  r: number;
  g: number;
  b: number;
};

export type FillStyle = {
  type: 'SOLID';
  color: Color;
};

export type Point = {
  x: number;
  y: number;
};

export type LineProperties = {
  start: Point;
  end: Point;
  strokeWeight?: number;
};

// New Polygon Properties
export type PolygonProperties = {
  points?: Point[];     // Custom points for irregular polygon
  sides?: number;       // Number of sides for regular polygon
  radius?: number;      // Radius for regular polygon
  rotation?: number;    // Rotation angle in degrees
  centerX?: number;     // Center point X
  centerY?: number;     // Center point Y
};

// Updated Creation Properties
export type CreationProperties = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: FillStyle;
  stroke?: FillStyle;
  strokeWeight?: number;
  text?: string;
  line?: LineProperties;
  polygon?: PolygonProperties;
};

// Updated Shape Types
export type ShapeType = 
  | 'rectangle' 
  | 'ellipse' 
  | 'text'
  | 'line'
  | 'polygon';

export type CreationParams = {
  type: ShapeType;
  properties: CreationProperties;
};

export type ResourceHandler = {
  list: () => Promise<FigmaResource[]>;
  read: (uri: string) => Promise<ResourceContents[]>;
  create?: (params: CreationParams) => Promise<ResourceContents[]>;
  modify?: (uri: string, properties: CreationProperties) => Promise<void>;
  watch?: (uri: string) => Promise<void>;
  search?: (query: string) => Promise<FigmaResource[]>;
};