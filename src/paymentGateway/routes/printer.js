/**
 * Printer Routes
 * API endpoints for printer control
 */
const express = require('express');
const router = express.Router();
const printerService = require('../../services/printerService');
const orderManager = require('../../services/orderManager');

/**
 * GET /api/printer/status
 * Get printer status
 */
router.get('/status', (req, res) => {
  try {
    const status = printerService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get printer status', 
      message: error.message 
    });
  }
});

/**
 * GET /api/printer/templates
 * List available receipt templates and current selection
 */
router.get('/templates', (req, res) => {
  try {
    const templates = printerService.getAvailableTemplates();
    res.json({
      success: true,
      templates,
      active: printerService.getReceiptTemplate()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load templates',
      message: error.message
    });
  }
});

/**
 * GET /api/printer/templates/:templateId/sample
 * Return sample preview text for the given template
 */
router.get('/templates/:templateId/sample', (req, res) => {
  try {
    const { templateId } = req.params;
    const receipt = printerService.composeSampleReceipt(templateId);
    res.json({
      success: true,
      template: receipt.template,
      width: receipt.width,
      text: receipt.text,
      lines: receipt.lines
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/printer/settings
 * Get persisted printer settings (currently: receipt template)
 */
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    receiptTemplate: printerService.getReceiptTemplate()
  });
});

/**
 * POST /api/printer/settings
 * Update receipt template selection
 */
router.post('/settings', (req, res) => {
  const { receiptTemplate } = req.body || {};
  if (!receiptTemplate) {
    return res.status(400).json({ success: false, message: 'receiptTemplate required' });
  }
  const templates = printerService.getAvailableTemplates();
  const valid = templates.some(t => t.id === receiptTemplate);
  if (!valid) {
    return res.status(400).json({ success: false, message: 'Template tidak dikenal' });
  }
  const updated = printerService.setReceiptTemplate(receiptTemplate);
  res.json({ success: true, receiptTemplate: updated });
});

/**
 * GET /api/printer/preview/:orderId
 * Compose receipt preview text on the server
 */
router.get('/preview/:orderId', (req, res) => {
  const { orderId } = req.params;
  const templateId = req.query.template;

  const order = orderManager.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  try {
    const receipt = printerService.composeReceipt(order, templateId);
    res.json({
      success: true,
      template: receipt.template,
      width: receipt.width,
      text: receipt.text,
      lines: receipt.lines
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/printer/test
 * Test printer connection
 */
router.post('/test', async (req, res) => {
  try {
    const result = await printerService.test();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Test print failed', 
      message: error.message 
    });
  }
});

/**
 * POST /api/printer/print-sample
 * Print sample receipt using selected template
 */
router.post('/print-sample', async (req, res) => {
  try {
    const templateId = req.body?.template;
    const result = await printerService.printSampleReceipt(templateId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/printer/open-drawer
 * Open cash drawer manually
 */
router.post('/open-drawer', async (req, res) => {
  try {
    const result = await printerService.openCashDrawer();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to open drawer', 
      message: error.message 
    });
  }
});

/**
 * POST /api/printer/print/:orderId
 * Print receipt for specific order
 */
router.post('/print/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const templateId = req.query.template;
    
    // Get order from orderManager
    const order = orderManager.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const result = await printerService.printReceipt(order, templateId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to print receipt', 
      message: error.message 
    });
  }
});

/**
 * POST /api/printer/print-and-open/:orderId
 * Print receipt and open drawer for specific order
 */
router.post('/print-and-open/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const templateId = req.query.template;
    
    // Get order from orderManager
    const order = orderManager.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const result = await printerService.printAndOpenDrawer(order, templateId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to print and open drawer', 
      message: error.message 
    });
  }
});

module.exports = router;
