import { unwrapUiMessage, type MainToUi } from '../shared/messages';
import { createHandler } from './handler';

figma.showUI(__html__, { width: 400, height: 500 });

const handler = createHandler((message: MainToUi) => figma.ui.postMessage(message));

figma.on('selectionchange', handler.reportSelection);

figma.ui.onmessage = (event: unknown) => {
  const message = unwrapUiMessage(event);
  if (message) void handler.handle(message);
};
