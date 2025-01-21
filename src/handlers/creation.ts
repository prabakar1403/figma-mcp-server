import { ResourceHandler, ResourceContents, ShapeType, CreationParams } from '../types';
import { z } from 'zod';

export class CreationHandler implements ResourceHandler {
  private figma: any;

  constructor(figmaInstance: any) {
    this.figma = figmaInstance;
  }

  async list(): Promise<ResourceContents[]> {
    return [];
  }

  async create(params: CreationParams): Promise<ResourceContents[]> {
    const { type, properties } = params;
    let node;

    switch (type) {
      case 'rectangle':
        node = this.figma.createRectangle();
        if (properties.width) node.resize(properties.width, node.height);
        if (properties.height) node.resize(node.width, properties.height);
        break;

      case 'ellipse':
        node = this.figma.createEllipse();
        if (properties.width) node.resize(properties.width, node.height);
        if (properties.height) node.resize(node.width, properties.height);
        break;

      case 'text':
        node = this.figma.createText();
        if (properties.text) {
          node.characters = properties.text;
        }
        break;

      case 'line':
        if (!properties.line) {
          throw new Error('Line properties are required for line creation');
        }
        const { start, end } = properties.line;
        
        // Create a line using vector
        node = this.figma.createVector();
        
        // Calculate line properties
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        
        // Create path for the line
        const path = {
          windingRule: 'NONZERO',
          data: `M ${start.x} ${start.y} L ${end.x} ${end.y}`
        };
        
        node.vectorPaths = [path];
        node.x = Math.min(start.x, end.x);
        node.y = Math.min(start.y, end.y);
        node.resize(width, height);
        
        // Set stroke weight if provided
        if (properties.line.strokeWeight) {
          node.strokeWeight = properties.line.strokeWeight;
        }
        break;

      default:
        throw new Error(`Unsupported shape type: ${type}`);
    }

    // Set common properties
    if (properties.x !== undefined) node.x = properties.x;
    if (properties.y !== undefined) node.y = properties.y;

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

    // Set stroke weight if provided
    if (properties.strokeWeight !== undefined) {
      node.strokeWeight = properties.strokeWeight;
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

  async read(uri: string): Promise<ResourceContents[]> {
    return [];
  }

  async modify(uri: string, properties: any): Promise<void> {
    const node = this.figma.getNodeById(uri);
    if (!node) {
      throw new Error(`Node not found: ${uri}`);
    }

    if (properties.fill) {
      node.fills = [properties.fill];
    }
    if (properties.stroke) {
      node.strokes = [properties.stroke];
    }
    if (properties.strokeWeight !== undefined) {
      node.strokeWeight = properties.strokeWeight;
    }
    if (properties.width !== undefined) {
      node.width = properties.width;
    }
    if (properties.height !== undefined) {
      node.height = properties.height;
    }
  }
}