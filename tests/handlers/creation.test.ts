import { CreationHandler } from '../../src/handlers/creation';
import { ShapeType, CreationParams } from '../../src/types';

describe('CreationHandler', () => {
  let handler: CreationHandler;
  let mockFigma: any;

  beforeEach(() => {
    // Set up mock Figma instance
    mockFigma = {
      createRectangle: jest.fn(() => ({
        id: 'rect1',
        type: 'RECTANGLE',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        resize: jest.fn(),
        fills: [],
        strokes: []
      })),
      createEllipse: jest.fn(() => ({
        id: 'ellipse1',
        type: 'ELLIPSE',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        resize: jest.fn(),
        fills: [],
        strokes: []
      })),
      createText: jest.fn(() => ({
        id: 'text1',
        type: 'TEXT',
        x: 0,
        y: 0,
        characters: '',
        fills: [],
        strokes: []
      })),
      createVector: jest.fn(() => ({
        id: 'vector1',
        type: 'VECTOR',
        x: 0,
        y: 0,
        vectorPaths: [],
        fills: [],
        strokes: []
      })),
      createImage: jest.fn(() => 'image-hash'),
      getNodeById: jest.fn()
    };

    handler = new CreationHandler(mockFigma);
  });

  describe('Basic Shape Creation', () => {
    test('creates rectangle with correct properties', async () => {
      const params: CreationParams = {
        type: 'rectangle',
        properties: {
          x: 100,
          y: 200,
          width: 300,
          height: 400,
          fill: {
            type: 'SOLID',
            color: { r: 1, g: 0, b: 0 }
          }
        }
      };

      const result = await handler.create(params);
      
      expect(mockFigma.createRectangle).toHaveBeenCalled();
      const createdShape = mockFigma.createRectangle.mock.results[0].value;
      expect(createdShape.x).toBe(100);
      expect(createdShape.y).toBe(200);
      expect(createdShape.resize).toHaveBeenCalledWith(300, 400);
      expect(createdShape.fills[0]).toEqual({
        type: 'SOLID',
        color: { r: 1, g: 0, b: 0 }
      });
    });

    test('creates ellipse with correct properties', async () => {
      const params: CreationParams = {
        type: 'ellipse',
        properties: {
          x: 100,
          y: 200,
          width: 300,
          height: 400
        }
      };

      await handler.create(params);
      
      expect(mockFigma.createEllipse).toHaveBeenCalled();
      const createdShape = mockFigma.createEllipse.mock.results[0].value;
      expect(createdShape.resize).toHaveBeenCalledWith(300, 400);
    });
  });

  describe('Line Creation', () => {
    test('creates line with correct start and end points', async () => {
      const params: CreationParams = {
        type: 'line',
        properties: {
          line: {
            start: { x: 0, y: 0 },
            end: { x: 100, y: 100 },
            strokeWeight: 2
          }
        }
      };

      await handler.create(params);
      
      expect(mockFigma.createVector).toHaveBeenCalled();
      const createdVector = mockFigma.createVector.mock.results[0].value;
      expect(createdVector.vectorPaths[0]).toBeDefined();
      expect(createdVector.strokeWeight).toBe(2);
    });
  });

  describe('Image Handling', () => {
    test('creates image with correct properties', async () => {
      global.fetch = jest.fn(() => 
        Promise.resolve({
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
        })
      ) as any;

      const params: CreationParams = {
        type: 'image',
        properties: {
          image: {
            source: 'https://example.com/image.jpg',
            scaleMode: 'FILL'
          },
          width: 400,
          height: 300
        }
      };

      await handler.create(params);
      
      expect(mockFigma.createRectangle).toHaveBeenCalled();
      expect(mockFigma.createImage).toHaveBeenCalled();
      const createdRect = mockFigma.createRectangle.mock.results[0].value;
      expect(createdRect.fills[0].type).toBe('IMAGE');
    });

    test('handles image loading errors', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as any;

      const params: CreationParams = {
        type: 'image',
        properties: {
          image: {
            source: 'https://example.com/image.jpg',
            scaleMode: 'FILL'
          }
        }
      };

      await expect(handler.create(params)).rejects.toThrow('Failed to load image');
    });
  });

  describe('Error Handling', () => {
    test('throws error for unsupported shape type', async () => {
      const params = {
        type: 'unsupported' as ShapeType,
        properties: {}
      };

      await expect(handler.create(params)).rejects.toThrow('Unsupported shape type');
    });

    test('throws error for missing required properties', async () => {
      const params: CreationParams = {
        type: 'line',
        properties: {}
      };

      await expect(handler.create(params)).rejects.toThrow('Line properties are required');
    });
  });
});
