// Figma Plugin Main Code (runs in sandbox)

interface TextLayerData {
  id: string;
  name: string;
  characters: string;
}

interface UIMessage {
  type: string;
  data?: any;
  format?: string;
}

// Show the plugin UI
figma.showUI(__html__, { width: 400, height: 500 });

// Listen for messages from the UI
figma.ui.onmessage = async (event) => {
  console.log('[MuffinSync] Message received from UI:', event);
  
  // Extract the actual message data
  let msg: UIMessage;
  if ((event as any).pluginMessage) {
    msg = (event as any).pluginMessage as UIMessage;
  } else if (event.data && event.data.pluginMessage) {
    msg = event.data.pluginMessage as UIMessage;
  } else {
    msg = event as any as UIMessage;
  }
  
  console.log('[MuffinSync] Message type:', msg.type);
  console.log('[MuffinSync] Full message:', msg);
  
  if (msg.type === 'extract-text') {
    console.log('[MuffinSync] Starting text extraction request processing');
    await extractTextLayers();
  } else if (msg.type === 'import-text' && msg.data && msg.format) {
    console.log('[MuffinSync] Starting text import request processing');
    await importTextLayers(msg.data, msg.format);
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  } else {
    console.log('[MuffinSync] Unknown message type or structure:', event);
  }
};

async function extractTextLayers() {
  try {
    console.log('[MuffinSync] extractTextLayers function started');
    const textLayers: TextLayerData[] = [];
    
    // Get the current selection or current page
    let nodesToSearch: ReadonlyArray<SceneNode>;
    
    if (figma.currentPage.selection.length > 0) {
      // If there's a selection, search within selected nodes
      nodesToSearch = figma.currentPage.selection;
      console.log(`[MuffinSync] Searching text in ${nodesToSearch.length} selected nodes`);
    } else {
      // Otherwise, search the entire page
      nodesToSearch = figma.currentPage.children;
      console.log(`[MuffinSync] Searching text in entire page (${nodesToSearch.length} nodes)`);
    }
    
    // Recursively find all text nodes
    for (const node of nodesToSearch) {
      findTextNodes(node, textLayers);
    }
    
    console.log(`[MuffinSync] Found ${textLayers.length} text nodes`);
    
    if (textLayers.length === 0) {
      console.log('[MuffinSync] No text layers found, sending message to UI');
      figma.ui.postMessage({
        type: 'no-text-found',
        message: 'No text layers found.'
      });
      return;
    }
    
    console.log('[MuffinSync] Extraction complete, sending data to UI');
    // Send extracted data to UI
    figma.ui.postMessage({
      type: 'text-extracted',
      data: textLayers,
      count: textLayers.length
    });
    
  } catch (error) {
    console.error('[MuffinSync] Text extraction error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: `Error occurred during text extraction: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function findTextNodes(node: SceneNode, textLayers: TextLayerData[]) {
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    textLayers.push({
      id: textNode.id,
      name: textNode.name,
      characters: textNode.characters
    });
  }
  
  // Recursively search children
  if ('children' in node) {
    const parentNode = node as SceneNode & ChildrenMixin;
    for (const child of parentNode.children) {
      findTextNodes(child, textLayers);
    }
  }
}

async function importTextLayers(data: TextLayerData[], format: string) {
  try {
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    
    for (const textData of data) {
      try {
        // Find the node by ID (dynamic-page requires async)
        const node = await figma.getNodeByIdAsync(textData.id);
        
        if (!node) {
          errors.push(`Node with ID ${textData.id} not found.`);
          errorCount++;
          continue;
        }
        
        if (node.type !== 'TEXT') {
          errors.push(`Node ${textData.name} (${textData.id}) is not a text node.`);
          errorCount++;
          continue;
        }
        
        // Load font before updating text
        const textNode = node as TextNode;
        await figma.loadFontAsync(textNode.fontName as FontName);
        
        // Update the text
        textNode.characters = textData.characters;
        updatedCount++;
        
      } catch (error) {
        errors.push(`Failed to update node ${textData.name}: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
      }
    }
    
    // Send results to UI
    figma.ui.postMessage({
      type: 'import-complete',
      updatedCount,
      errorCount,
      errors: errors.slice(0, 5) // Show only first 5 errors
    });
    
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      message: `Error occurred during text import: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}
