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
 * GET /api/printer/sample-preview
 * Return sample preview text based on query params
 */
router.get('/sample-preview', async (req, res) => {
  try {
    // All options are passed via query string for live preview
    const options = {
      receiptTemplate: req.query.template,
      // Presets and custom text
      headerPreset: req.query.headerPreset,
      footerPreset: req.query.footerPreset,
      customHeaderText: req.query.customHeaderText,
      customFooterText: req.query.customFooterText,
      // Formatting
      lineSpacing: req.query.lineSpacing,
      // Section visibility
      showHeaderSeparator: req.query.showHeaderSeparator === 'true',
      showFooterSeparator: req.query.showFooterSeparator === 'true',
      showOrderId: req.query.showOrderId === 'true',
      showTime: req.query.showTime === 'true',
      showCustomer: req.query.showCustomer === 'true',
      showPaymentMethod: req.query.showPaymentMethod === 'true',
      showItemNotes: req.query.showItemNotes === 'true',
      showItemAddons: req.query.showItemAddons === 'true',
      detailedItemBreakdown: req.query.detailedItemBreakdown === 'true',
      // QR settings from live preview
      footerQr: {
        enabled: req.query.footerQrEnabled === 'true',
        type: req.query.footerQrType || 'qr',
        content: req.query.footerQrContent,
        label: req.query.footerQrLabel,
        cellSize: Number(req.query.footerQrSize) || undefined,
        position: req.query.qrPosition || 'after-footer',
      }
    };
    
    const receipt = await printerService.composeSampleReceipt(options);
    res.json({
      success: true,
      template: receipt.template,
      width: receipt.width,
      text: receipt.previewText || receipt.text,
      lines: receipt.lines,
      html: receipt.htmlPreview || '',
      footerQrBase64: receipt.footerQrBase64 || '', // Send base64 image
      footerQrLabel: receipt.footerQr && receipt.footerQr.label ? receipt.footerQr.label : '',
      footerQrEnabled: !!(receipt.footerQr && receipt.footerQr.enabled),
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
    receiptTemplate: printerService.getReceiptTemplate(),
    useCustomTemplate: printerService.getUseCustomTemplate()
  });
});

/**
 * POST /api/printer/settings
 * Update receipt template selection
 */
router.post('/settings', (req, res) => {
  const { receiptTemplate, useCustomTemplate } = req.body || {};
  if (!receiptTemplate) {
    return res.status(400).json({ success: false, message: 'receiptTemplate required' });
  }
  const templates = printerService.getAvailableTemplates();
  const valid = templates.some(t => t.id === receiptTemplate);
  if (!valid) {
    return res.status(400).json({ success: false, message: 'Template tidak dikenal' });
  }
  const updated = printerService.setReceiptTemplate(receiptTemplate);
  if (typeof useCustomTemplate !== 'undefined') {
    printerService.setUseCustomTemplate(!!useCustomTemplate);
  }
  res.json({ success: true, receiptTemplate: updated, useCustomTemplate: printerService.getUseCustomTemplate() });
});

/**
 * GET /api/printer/custom-text
 * Get custom header/footer text used in receipt formatting
 */
router.get('/custom-text', (req, res) => {
  try {
    const payload = printerService.getCustomText();
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/printer/custom-text
 * Update custom header/footer text and formatting
 */
router.post('/custom-text', (req, res) => {
  try {
    const { 
      headerPreset,
      footerPreset,
      customHeaderText,
      customFooterText,
      lineSpacing,
      // Section visibility
      showHeaderSeparator,
      showFooterSeparator,
      showOrderId,
      showTime,
      showCustomer,
      showPaymentMethod,
      showItemNotes,
      showItemAddons,
      detailedItemBreakdown
    } = req.body || {};
    
    const saved = printerService.setCustomText({ 
      headerPreset,
      footerPreset,
      customHeaderText,
      customFooterText,
      lineSpacing,
      // Section visibility
      showHeaderSeparator,
      showFooterSeparator,
      showOrderId,
      showTime,
      showCustomer,
      showPaymentMethod,
      showItemNotes,
      showItemAddons,
      detailedItemBreakdown
    });
    res.json({ success: true, ...saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/footer-qr', (req, res) => {
  try {
    const payload = printerService.getFooterQrSetting();
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/footer-qr', (req, res) => {
  try {
    const { enabled, type, value, link, imageData, cellSize, label, position } = req.body || {};
    const saved = printerService.setFooterQrSetting({ 
      enabled, 
      type, 
      value, 
      link, 
      imageData, 
      cellSize, 
      label,
      position
    });
    res.json({ success: true, ...saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Full Custom Template APIs
 */
router.get('/custom-template', (req, res) => {
  try {
    const templateId = req.query.template || printerService.getReceiptTemplate();
    const text = printerService.getCustomTemplate(templateId);
    res.json({ success: true, templateId, text, useCustomTemplate: printerService.getUseCustomTemplate() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/custom-template', (req, res) => {
  try {
    const { templateId, text } = req.body || {};
    const id = templateId || printerService.getReceiptTemplate();
    const saved = printerService.setCustomTemplate(id, text || '');
    res.json({ success: true, templateId: id, text: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/custom-template/toggle', (req, res) => {
  try {
    const { enabled } = req.body || {};
    const current = printerService.setUseCustomTemplate(!!enabled);
    res.json({ success: true, useCustomTemplate: current });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/printer/preview/:orderId
 * Compose receipt preview text on the server
 */
router.get('/preview/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const templateId = req.query.template;

  const order = orderManager.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  try {
    const receipt = await printerService.composeReceipt(order, templateId);
    const footerQr = receipt.footerQr || {};
    res.json({
      success: true,
      template: receipt.template,
      width: receipt.width,
      text: receipt.previewText || receipt.text,
      lines: receipt.lines,
      html: receipt.htmlPreview || '',
      footerQr,
      footerQrAscii: receipt.previewAscii || [],
      footerQrBase64: receipt.footerQrBase64 || '',
      footerQrLabel: footerQr.label || '',
      footerQrEnabled: !!footerQr.enabled
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
  const templateId = req.body && req.body.template;
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
