import { ResourceHandler, ResourceContents, ShapeType, CreationParams, ImageScaleMode } from '../types';
import { z } from 'zod';

async function loadImage(source: string): Promise<Uint8Array> {
  if (source.startsWith('data:image')) {
    // Handle base64 data
    const base64Data = source.split(',')[1];
    const binaryString = atob(base64Data);
    return Uint8Array.from(binaryString, c => c.charCodeAt(0));
  } else {
    // Handle URL
    const response = await fetch(source);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}

export class CreationHandler implements ResourceHandler {
  private figma: any;

  constructor(figmaInstance: any) {
    this.figma = figmaInstance;
  }

  // Previous methods remain...

  async create(params: CreationParams): Promise<ResourceContents[]> {
    const { type, properties } = params;
    let node;

    switch (type) {
      // Previous cases remain...

      case 'image':
        if (!properties.image) {
          throw new Error('Image properties are required for image creation');
        }

        const { image } = properties;
        
        // Create a rectangle to hold the image
        node = this.figma.createRectangle();
        
        try {
          // Load image data
          const imageData = await loadImage(image.source);
          
          // Create paint with image
          const imagePaint = {
            type: 'IMAGE',
            scaleMode: image.scaleMode || 'FILL',
            imageHash: await this.figma.createImage(imageData)
          };
          
          // Apply image as fill
          node.fills = [imagePaint];

          // Apply opacity if specified
          if (image.opacity !== undefined) {
            node.opacity = image.opacity;
          }

          // Apply rotation if specified
          if (image.rotation !== undefined) {
            node.rotation = image.rotation;
          }

          // Handle crop settings if specified and mode is CROP
          if (image.scaleMode === 'CROP' && image.cropSettings) {
            const { top, left, bottom, right } = image.cropSettings;
            node.constraints = {
              vertical: 'SCALE',
              horizontal: 'SCALE'
            };
            
            // Apply crop using constraints
            if (top !== undefined) node.constraintsTop = top;
            if (left !== undefined) node.constraintsLeft = left;
            if (bottom !== undefined) node.constraintsBottom = bottom;
            if (right !== undefined) node.constraintsRight = right;
          }
          
        } catch (error) {
          throw new Error(`Failed to load image: ${error.message}`);
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

    // Only set fill for non-image types
    if (type !== 'image' && properties.fill) {
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
          height: node.height,
          scaleMode: type === 'image' ? properties.image?.scaleMode : undefined
        }
      })
    }];
  }

  async modify(uri: string, properties: any): Promise<void> {
    const node = this.figma.getNodeById(uri);
    if (!node) {
      throw new Error(`Node not found: ${uri}`);
    }

    if (properties.image) {
      // Handle image updates
      try {
        const imageData = await loadImage(properties.image.source);
        const imagePaint = {
          type: 'IMAGE',
          scaleMode: properties.image.scaleMode || node.fills[0]?.scaleMode || 'FILL',
          imageHash: await this.figma.createImage(imageData)
        };
        node.fills = [imagePaint];

        // Update other image properties
        if (properties.image.opacity !== undefined) {
          node.opacity = properties.image.opacity;
        }
        if (properties.image.rotation !== undefined) {
          node.rotation = properties.image.rotation;
        }
        if (properties.image.cropSettings && properties.image.scaleMode === 'CROP') {
          const { top, left, bottom, right } = properties.image.cropSettings;
          if (top !== undefined) node.constraintsTop = top;
          if (left !== undefined) node.constraintsLeft = left;
          if (bottom !== undefined) node.constraintsBottom = bottom;
          if (right !== undefined) node.constraintsRight = right;
        }
      } catch (error) {
        throw new Error(`Failed to update image: ${error.message}`);
      }
    }

    // Handle other property updates
    if (properties.width !== undefined) {
      node.width = properties.width;
    }
    if (properties.height !== undefined) {
      node.height = properties.height;
    }
    if (properties.x !== undefined) {
      node.x = properties.x;
    }
    if (properties.y !== undefined) {
      node.y = properties.y;
    }
  }
}