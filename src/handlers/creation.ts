import { ResourceHandler, ResourceContents, ShapeType, CreationParams, Point, FigmaResource } from '../types';

async function loadImage(source: string): Promise<Uint8Array> {
  try {
    if (source.startsWith('data:image')) {
      const base64Data = source.split(',')[1];
      const binaryString = atob(base64Data);
      return Uint8Array.from(binaryString, c => c.charCodeAt(0));
    } else {
      const response = await fetch(source);
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load image: ${errorMessage}`);
  }
}

// Helper function to create resource URI
function createResourceUri(id: string): string {
  return `figma:///resource/${id}`;
}

export class CreationHandler implements ResourceHandler {
  private figma: any;

  constructor(figmaInstance: any) {
    this.figma = figmaInstance;
  }

  async list(): Promise<FigmaResource[]> {
    return [];
  }

  async read(uri: string): Promise<ResourceContents[]> {
    const node = this.figma.getNodeById(uri);
    if (!node) {
      throw new Error(`Node not found: ${uri}`);
    }
    
    return [{
      type: 'application/json',
      content: JSON.stringify({
        id: node.id,
        type: node.type,
        properties: {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height
        }
      }),
      uri: createResourceUri(node.id),
      mimeType: 'application/json'
    }];
  }

  async create(params: CreationParams): Promise<ResourceContents[]> {
    const { type, properties } = params;
    let node;

    // Rest of the implementation remains the same until the return statement

    return [{
      type: 'application/json',
      content: JSON.stringify({
        id: node.id,
        type: node.type,
        properties: {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height
        }
      }),
      uri: createResourceUri(node.id),
      mimeType: 'application/json'
    }];
  }

  async modify(uri: string, properties: CreationParams['properties']): Promise<void> {
    const node = this.figma.getNodeById(uri);
    if (!node) {
      throw new Error(`Node not found: ${uri}`);
    }

    // Update properties
    if (properties.x !== undefined) node.x = properties.x;
    if (properties.y !== undefined) node.y = properties.y;
    if (properties.width !== undefined) node.width = properties.width;
    if (properties.height !== undefined) node.height = properties.height;
    if (properties.fill) node.fills = [properties.fill];
    if (properties.stroke) node.strokes = [properties.stroke];
    if (properties.strokeWeight !== undefined) node.strokeWeight = properties.strokeWeight;
  }
}