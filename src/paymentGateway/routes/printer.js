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
    
    // Get order from orderManager
    const order = orderManager.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const result = await printerService.printReceipt(order);
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
    
    // Get order from orderManager
    const order = orderManager.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const result = await printerService.printAndOpenDrawer(order);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to print and open drawer', 
      message: error.message 
    });
  }
});

module.exports = router;
