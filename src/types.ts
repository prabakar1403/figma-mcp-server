import { z } from 'zod';
import { ResourceContents } from '@modelcontextprotocol/sdk/types';

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
};

export type PolygonProperties = {
  points: Point[];
  sides?: number;  // For regular polygons
};

export type StarProperties = {
  points: number;
  innerRadius: number;
  outerRadius: number;
};

export type VectorProperties = {
  path: string;  // SVG-style path data
};

export type CreationProperties = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: FillStyle;
  stroke?: FillStyle;
  strokeWeight?: number;
  cornerRadius?: number;
  text?: string;
  line?: LineProperties;
  polygon?: PolygonProperties;
  star?: StarProperties;
  vector?: VectorProperties;
};

export type ShapeType = 
  | 'rectangle' 
  | 'ellipse' 
  | 'text'
  | 'line'
  | 'polygon'
  | 'star'
  | 'vector';

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