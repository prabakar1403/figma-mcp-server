# Test Plan for Figma MCP Creation Capabilities

## 1. Unit Tests

### Shape Creation Tests
- Test creation of each basic shape
  - Rectangle
  - Ellipse
  - Text
  - Line
  - Polygon
  - Image

### Property Tests
- Test setting and modifying properties
  - Position (x, y)
  - Size (width, height)
  - Fill colors
  - Stroke colors
  - Stroke weight

### Shape-Specific Tests
#### Line Tests
- Test line creation with start/end points
- Test line stroke properties
- Test line positioning

#### Polygon Tests
- Test regular polygon creation
- Test custom polygon creation
- Test polygon rotation
- Test polygon positioning

#### Image Tests
- Test image loading from URL
- Test image loading from base64
- Test different scale modes
  - FILL mode
  - FIT mode
  - CROP mode
  - TILE mode
- Test image cropping
- Test image rotation
- Test image opacity

## 2. Integration Tests

### Handler Integration
- Test CreationHandler initialization
- Test handler registration with server
- Test handler response format

### Error Handling
- Test invalid shape types
- Test missing required properties
- Test invalid property values
- Test image loading failures
- Test network errors

### Resource Management
- Test resource creation
- Test resource modification
- Test resource listing
- Test resource reading

## 3. End-to-End Tests

### Basic Workflow Tests
- Create each type of shape
- Modify existing shapes
- Delete shapes
- Complex shape combinations

### Image Workflow Tests
- Complete image import workflow
- Image modification workflow
- Image cropping workflow

### Error Recovery Tests
- Network interruption handling
- Invalid input recovery
- Resource cleanup

## Test Implementation Strategy

### 1. Jest Test Setup
```typescript
import { CreationHandler } from '../src/handlers/creation';

describe('CreationHandler', () => {
  let handler: CreationHandler;
  let mockFigma: any;

  beforeEach(() => {
    mockFigma = {
      createRectangle: jest.fn(),
      createEllipse: jest.fn(),
      createText: jest.fn(),
      createVector: jest.fn(),
      createImage: jest.fn()
    };
    handler = new CreationHandler(mockFigma);
  });

  // Test cases will go here
});
```

### 2. Sample Test Cases
```typescript
// Basic shape creation
test('creates rectangle with correct properties', async () => {
  const mockRect = {
    x: 0,
    y: 0,
    resize: jest.fn(),
    fills: []
  };
  mockFigma.createRectangle.mockReturnValue(mockRect);

  await handler.create({
    type: 'rectangle',
    properties: {
      width: 100,
      height: 100
    }
  });

  expect(mockFigma.createRectangle).toHaveBeenCalled();
  expect(mockRect.resize).toHaveBeenCalledWith(100, 100);
});

// Image handling
test('loads and creates image with crop', async () => {
  // Test implementation
});
```

## Validation Methods

### Manual Testing Checklist
- [ ] Test each shape creation via MCP
- [ ] Verify property modifications
- [ ] Test image handling with various sources
- [ ] Verify error handling
- [ ] Test performance with multiple operations

### Automated Testing Coverage
- Use Jest coverage reporting
- Aim for >80% code coverage
- Focus on critical paths:
  - Shape creation
  - Image handling
  - Error scenarios

## Next Steps
1. Implement base test suite
2. Add shape-specific tests
3. Add image handling tests
4. Add integration tests
5. Add end-to-end tests
6. Set up CI/CD pipeline

Would you like me to implement any specific part of this test plan?