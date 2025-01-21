import { ResourceHandler, ResourceContents, ShapeType, CreationParams, Point } from '../types';
import { z } from 'zod';

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
  } catch (error) {
    throw new Error('Failed to load image: ' + (error instanceof Error ? error.message : String(error)));
  }
}

export class CreationHandler implements ResourceHandler {
  private figma: any;

  constructor(figmaInstance: any) {
    this.figma = figmaInstance;
  }

  // Implement required read method
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
      })
    }];
  }

  // Rest of the creation handler implementation...
