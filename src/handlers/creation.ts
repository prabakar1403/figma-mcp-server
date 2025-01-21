import { ResourceHandler, ResourceContents } from '../types';
import { z } from 'zod';

// Shape creation parameters schema
const ShapeCreationSchema = z.object({
  type: z.enum(['rectangle', 'ellipse', 'text']),
  properties: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    fill: z.object({
      type: z.literal('SOLID'),
      color: z.object({
        r: z.number(),
        g: z.number(),
        b: z.number()
      })
    }).optional(),
    stroke: z.object({
      type: z.literal('SOLID'),
      color: z.object({
        r: z.number(),
        g: z.number(),
        b: z.number()
      })
    }).optional(),
    text: z.string().optional()
  })
});

export class CreationHandler implements ResourceHandler {
  private figma: any; // Will be initialized with Figma plugin instance

  constructor(figmaInstance: any) {
    this.figma = figmaInstance;
  }

  async list(): Promise<ResourceContents[]> {
    // List available creation templates or recent creations
    return [];
  }

  async create(params: z.infer<typeof ShapeCreationSchema>): Promise<ResourceContents[]> {
    const { type, properties } = params;
    let node;

    switch (type) {
      case 'rectangle':
        node = this.figma.createRectangle();
        break;
      case 'ellipse':
        node = this.figma.createEllipse();
        break;
      case 'text':
        node = this.figma.createText();
        if (properties.text) {
          node.characters = properties.text;
        }
        break;
      default:
        throw new Error(`Unsupported shape type: ${type}`);
    }

    // Set common properties
    if (properties.x !== undefined) node.x = properties.x;
    if (properties.y !== undefined) node.y = properties.y;
    if (properties.width !== undefined) node.width = properties.width;
    if (properties.height !== undefined) node.height = properties.height;

    // Set fill if provided
    if (properties.fill) {
      node.fills = [{
        type: 'SOLID',
        color: properties.fill.color
      }];
    }

    // Set stroke if provided
    if (properties.stroke) {
      node.strokes = [{
        type: 'SOLID',
        color: properties.stroke.color
      }];
    }

    // Return the created node info
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

  async read(uri: string): Promise<ResourceContents[]> {
    // Get information about a specific created element
    return [];
  }

  async modify(uri: string, properties: any): Promise<void> {
    // Modify an existing element
    const node = this.figma.getNodeById(uri);
    if (!node) {
      throw new Error(`Node not found: ${uri}`);
    }

    // Update properties
    if (properties.fill) {
      node.fills = [properties.fill];
    }
    if (properties.stroke) {
      node.strokes = [properties.stroke];
    }
    if (properties.width) {
      node.width = properties.width;
    }
    if (properties.height) {
      node.height = properties.height;
    }
  }
}