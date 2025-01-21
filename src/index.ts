import { Server } from '@modelcontextprotocol/sdk/server';
import { FileHandler } from './handlers/file';
import { ComponentHandler } from './handlers/component';
import { VariableHandler } from './handlers/variable';
import { CreationHandler } from './handlers/creation';

// Initialize handlers
const fileHandler = new FileHandler();
const componentHandler = new ComponentHandler();
const variableHandler = new VariableHandler();
const creationHandler = new CreationHandler(figma);

// Initialize server
const server = new Server({
  name: 'figma-mcp-server',
  version: '1.0.0',
  capabilities: {
    resources: {
      handlers: {
        'figma:///file': fileHandler,
        'figma:///component': componentHandler,
        'figma:///variable': variableHandler,
        'figma:///create': creationHandler
      }
    }
  }
});

export default server;