import { ResourceHandler, ResourceContents, ShapeType, CreationParams, Point } from '../types';

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
    throw new Error(\`Failed to load image: \${errorMessage}\`);
  }
}

function calculatePolygonPoints(
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

  async read(uri: string): Promise<ResourceContents[]> {
    const node = this.figma.getNodeById(uri);
    if (!node) {
      throw new Error(\`Node not found: \${uri}\`);
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
          data: \`M \${start.x} \${start.y} L \${end.x} \${end.y}\`
        };
        node.vectorPaths = [path];
        node.x = Math.min(start.x, end.x);
        node.y = Math.min(start.y, end.y);
        node.resize(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
        if (properties.line.strokeWeight !== undefined) {
          node.strokeWeight = properties.line.strokeWeight;
        }
        break;

      case 'polygon':
        if (!properties.polygon) {
          throw new Error('Polygon properties are required for polygon creation');
        }
        const points = properties.polygon.points ?? 
          (properties.polygon.sides && properties.polygon.radius
            ? calculatePolygonPoints(
                properties.polygon.centerX ?? 0,
                properties.polygon.centerY ?? 0,
                properties.polygon.radius,
                properties.polygon.sides,
                properties.polygon.rotation
              )
            : null);
        
        if (!points) {
          throw new Error('Either points or sides+radius must be provided for polygon creation');
        }

        node = this.figma.createVector();
        const pathData = points.reduce((acc, point, i) => 
          i === 0 ? \`M \${point.x} \${point.y}\` : \`\${acc} L \${point.x} \${point.y}\`,
          ''
        ) + ' Z';

        node.vectorPaths = [{
          windingRule: 'NONZERO',
          data: pathData
        }];

        const xPoints = points.map(p => p.x);
        const yPoints = points.map(p => p.y);
        const minX = Math.min(...xPoints);
        const maxX = Math.max(...xPoints);
        const minY = Math.min(...yPoints);
        const maxY = Math.max(...yPoints);

        node.x = minX;
        node.y = minY;
        node.resize(maxX - minX, maxY - minY);
        break;

      case 'image':
        if (!properties.image) {
          throw new Error('Image properties are required for image creation');
        }

        node = this.figma.createRectangle();
        
        try {
          const imageData = await loadImage(properties.image.source);
          const imagePaint = {
            type: 'IMAGE',
            scaleMode: properties.image.scaleMode || 'FILL',
            imageHash: await this.figma.createImage(imageData)
          };
          
          node.fills = [imagePaint];

          if (properties.image.opacity !== undefined) {
            node.opacity = properties.image.opacity;
          }
          if (properties.image.rotation !== undefined) {
            node.rotation = properties.image.rotation;
          }
          if (properties.image.scaleMode === 'CROP' && properties.image.cropSettings) {
            const { top, left, bottom, right } = properties.image.cropSettings;
            node.constraints = {
              vertical: 'SCALE',
              horizontal: 'SCALE'
            };
            if (top !== undefined) node.constraintsTop = top;
            if (left !== undefined) node.constraintsLeft = left;
            if (bottom !== undefined) node.constraintsBottom = bottom;
            if (right !== undefined) node.constraintsRight = right;
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(\`Failed to update image: \${errorMessage}\`);
        }
        break;

      default:
        throw new Error(\`Unsupported shape type: \${type}\`);
    }

    // Set common properties
    if (properties.x !== undefined) node.x = properties.x;
    if (properties.y !== undefined) node.y = properties.y;
    if (properties.width !== undefined) node.width = properties.width;
    if (properties.height !== undefined) node.height = properties.height;

    if (type !== 'image' && properties.fill) {
      node.fills = [{
        type: 'SOLID',
        color: properties.fill.color
      }];
    }

    if (properties.stroke) {
      node.strokes = [{
        type: 'SOLID',
        color: properties.stroke.color
      }];
    }

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

  async modify(uri: string, properties: CreationParams['properties']): Promise<void> {
    const node = this.figma.getNodeById(uri);
    if (!node) {
      throw new Error(\`Node not found: \${uri}\`);
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