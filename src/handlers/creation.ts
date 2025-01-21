import { ResourceHandler, ResourceContents, ShapeType, CreationParams, Point } from '../types';
import { z } from 'zod';

function calculateRegularPolygonPoints(
  centerX: number,
  centerY: number,
  radius: number,
  sides: number,
  rotation: number = 0
): Point[] {
  const points: Point[] = [];
  const angleStep = (2 * Math.PI) / sides;
  const rotationInRadians = (rotation * Math.PI) / 180;

  for (let i = 0; i < sides; i++) {
    const angle = i * angleStep + rotationInRadians;
    points.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  }

  return points;
}

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
        node = this.figma.createVector();
        const path = {
          windingRule: 'NONZERO',
          data: `M ${start.x} ${start.y} L ${end.x} ${end.y}`
        };
        node.vectorPaths = [path];
        node.x = Math.min(start.x, end.x);
        node.y = Math.min(start.y, end.y);
        node.resize(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
        break;

      case 'polygon':
        if (!properties.polygon) {
          throw new Error('Polygon properties are required for polygon creation');
        }

        let points: Point[];
        const { polygon } = properties;

        // Determine polygon points
        if (polygon.points) {
          // Use custom points for irregular polygon
          points = polygon.points;
        } else if (polygon.sides && polygon.radius) {
          // Calculate points for regular polygon
          const centerX = polygon.centerX || 0;
          const centerY = polygon.centerY || 0;
          points = calculateRegularPolygonPoints(
            centerX,
            centerY,
            polygon.radius,
            polygon.sides,
            polygon.rotation
          );
        } else {
          throw new Error('Either points or sides+radius must be provided for polygon creation');
        }

        // Create vector node for polygon
        node = this.figma.createVector();

        // Create SVG-like path data
        let pathData = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          pathData += ` L ${points[i].x} ${points[i].y}`;
        }
        pathData += ' Z'; // Close the path

        // Set the vector path
        node.vectorPaths = [{
          windingRule: 'NONZERO',
          data: pathData
        }];

        // Calculate bounding box
        const xPoints = points.map(p => p.x);
        const yPoints = points.map(p => p.y);
        const minX = Math.min(...xPoints);
        const maxX = Math.max(...xPoints);
        const minY = Math.min(...yPoints);
        const maxY = Math.max(...yPoints);

        // Set position and size
        node.x = minX;
        node.y = minY;
        node.resize(maxX - minX, maxY - minY);
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