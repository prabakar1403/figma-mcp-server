import { z } from 'zod';
import { ResourceContents } from '@modelcontextprotocol/sdk/types';

// Previous types remain...

// New Image specific types
export type ImageScaleMode = 'FILL' | 'FIT' | 'CROP' | 'TILE';

export type ImageProperties = {
  source: string;        // URL or base64 data
  scaleMode: ImageScaleMode;
  rotation?: number;     // Rotation in degrees
  opacity?: number;      // 0-1
  cropSettings?: {
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
  };
};

// Update CreationProperties
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
  image?: ImageProperties;  // Add image properties
};

// Update ShapeType
export type ShapeType = 
  | 'rectangle' 
  | 'ellipse' 
  | 'text'
  | 'line'
  | 'polygon'
  | 'image';  // Add image type

// Rest of the types remain the same...

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