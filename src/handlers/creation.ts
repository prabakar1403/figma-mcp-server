import { ResourceHandler, ResourceContents, ShapeType, CreationParams, Point } from '../types';
import { z } from 'zod';

// Helper function to calculate polygon points
function calculatePolygonPoints(centerX: number, centerY: number, radius: number, sides: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    points.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  }
  return points;
}

// Helper function to calculate star points
function calculateStarPoints(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  points: number
): Point[] {
  const starPoints: Point[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    starPoints.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  }
  return starPoints;
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

      case 'line':
        if (!properties.line) {
          throw new Error('Line properties are required for line creation');
        }
        node = this.figma.createLine();
        const { start, end } = properties.line;
        node.x = start.x;
        node.y = start.y;
        node.resize(
          Math.abs(end.x - start.x),
          Math.abs(end.y - start.y)
        );
        break;

      case 'polygon':
        if (!properties.polygon) {
          throw new Error('Polygon properties are required for polygon creation');
        }
        const polygonNode = this.figma.createVector();
        const sides = properties.polygon.sides || properties.polygon.points.length;
        let points: Point[];
        
        if (properties.polygon.points) {
          points = properties.polygon.points;
        } else {
          // Calculate regular polygon points
          const radius = Math.min(properties.width || 100, properties.height || 100) / 2;
          points = calculatePolygonPoints(
            (properties.x || 0) + radius,
            (properties.y || 0) + radius,
            radius,
            sides
          );
        }
        
        // Create polygon path
        const path = this.figma.createVectorPath();
        points.forEach((point, index) => {
          if (index === 0) {
            path.moveTo(point.x, point.y);
          } else {
            path.lineTo(point.x, point.y);
          }
        });
        path.close();
        polygonNode.vectorPaths = [path];
        node = polygonNode;
        break;

      case 'star':
        if (!properties.star) {
          throw new Error('Star properties are required for star creation');
        }
        const starNode = this.figma.createVector();
        const starPoints = calculateStarPoints(
          properties.x || 0,
          properties.y || 0,
          properties.star.innerRadius,
          properties.star.outerRadius,
          properties.star.points
        );
        
        // Create star path
        const starPath = this.figma.createVectorPath();
        starPoints.forEach((point, index) => {
          if (index === 0) {
            starPath.moveTo(point.x, point.y);
          } else {
            starPath.lineTo(point.x, point.y);
          }
        });
        starPath.close();
        starNode.vectorPaths = [starPath];
        node = starNode;
        break;

      case 'vector':
        if (!properties.vector) {
          throw new Error('Vector properties are required for vector creation');
        }
        const vectorNode = this.figma.createVector();
        // Set vector path data
        vectorNode.vectorPaths = [properties.vector.path];
        node = vectorNode;
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

    // Set stroke weight if provided
    if (properties.strokeWeight !== undefined) {
      node.strokeWeight = properties.strokeWeight;
    }

    // Set corner radius if provided (only for rectangles)
    if (type === 'rectangle' && properties.cornerRadius !== undefined) {
      node.cornerRadius = properties.cornerRadius;
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
    if (properties.cornerRadius !== undefined && 'cornerRadius' in node) {
      node.cornerRadius = properties.cornerRadius;
    }
    if (properties.width !== undefined) {
      node.width = properties.width;
    }
    if (properties.height !== undefined) {
      node.height = properties.height;
    }
  }
}