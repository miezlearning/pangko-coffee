# Printer & Cash Drawer Migration Guide

This guide explains how to move this app to a NEW thermal printer and (optional) cash drawer, with a quick checklist, configuration mapping, test steps, and troubleshooting. It assumes Windows + Node.js 20+ (we run on Node 22) and uses the hybrid serial approach that we proved working.

## Quick checklist

- Pair or connect the new printer
  - Bluetooth SPP (recommended for mobile printers): Pair in Windows, create an Outgoing COM port.
  - USB-to-Serial: Install the correct USB-serial driver (FTDI/CH340/etc.).
  - TCP/IP (LAN printer): Get the printer IP and ensure port 9100 is open.
- Cash drawer: Ensure the printer has a DK/RJ11 drawer port and the drawer cable is plugged in. If not, use a DK-capable printer or a USB trigger box.
- Update `src/config/config.js`:
  - `printer.enabled = true`
  - Choose ONE interface: `serialPort` OR `tcpHost` (leave `printerName` empty)
  - Set `baudRate` (start with 9600)
  - Optional: tune `drawer.pin`, `drawer.t1`, `drawer.t2`
- Test serial connectivity
- Test print
- Test drawer
- Verify auto-print on confirmation: QRIS prints only; CASH prints and opens drawer

## Interfaces supported by this app

- Serial (recommended here)
  - Bluetooth SPP: `serialPort: "COMxx"` (Outgoing COM from Bluetooth settings)
  - USB-Serial: `serialPort: "COMxx"` (from Device Manager)
- TCP/IP (network printer): `tcpHost: "192.168.x.y"` (App uses RAW 9100 by default via node-thermal-printer)
- Windows Spooler (printer name): NOT supported in this app build (requires native driver). Prefer Serial/TCP.

## Configure the app

Edit `src/config/config.js`:

```js
printer: {
  enabled: true,
  type: 'EPSON',          // most ESC/POS printers use EPSON

  // Choose ONE of these and leave the others empty:
  serialPort: 'COM10',    // e.g., Outgoing COM from Bluetooth SPP or USB serial
  tcpHost: '',            // e.g., '192.168.1.50' for LAN printers
  printerName: '',        // (unused)

  baudRate: 9600,

  // Auto-print on payment confirmation
  autoPrint: true,

  // Drawer pulse config (ESC p m t1 t2)
  drawer: {
    pin: 0,   // 0 = pin2, 1 = pin5 (swap if drawer doesn’t open)
    t1: 80,   // ON duration (0-255), ~2ms units (80 ≈ 160ms)
    t2: 80    // OFF duration (0-255)
  }
}
```

Notes:
- For Bluetooth SPP: create an Outgoing COM port in Bluetooth settings → More Bluetooth options → COM Ports → Add → Outgoing → select your printer.
- Common baud rates: 9600, 19200, 38400, 57600, 115200. Start with 9600.

## Test the new device

1) Test the raw serial line (most fundamental)

```powershell
node scripts/serialTest.js
```
Expected: Port opens and test data is sent. If this fails, fix the OS/device side first.

2) Test printing with the hybrid path

```powershell
npm run print:test
```
Expected: A small test receipt is printed. If it fails, re-check `serialPort`/`baudRate`.

3) Start the app (dashboard + bot)

```powershell
npm start
```
Open http://localhost:3000 in a browser.

4) Manually open the cash drawer (optional)

```powershell
curl -X POST http://localhost:3000/api/printer/open-drawer
```
If the drawer doesn’t click, set `drawer.pin` to 1 and/or increase `t1/t2` to 120–200, restart, and try again. Ensure the RJ11 cable is plugged into the printer’s DK/drawer port (mobile printers often don’t have this).

## How auto-print works

- When a payment is confirmed and an order transitions to PROCESSING:
  - QRIS orders: the app prints the receipt (no drawer pulse).
  - CASH orders: the app prints the receipt and then opens the drawer.
- This is handled in `src/services/orderManager.js`:
  - Transition from `PENDING_PAYMENT`/`PENDING_CASH` to `PROCESSING` triggers `_autoPrintReceipt()`.
  - That calls `printerService.printReceipt(order)` for QRIS and `printerService.printAndOpenDrawer(order)` for CASH.

## Troubleshooting

- Printing works in tests but not in app
  - Ensure `printer.enabled = true` and the server is running (`npm start`).
  - Check logs with prefixes `[Printer]` and `[OrderManager]` when confirming payments.
  - Confirm the order status is actually transitioning to PROCESSING.

- "Print failed" in tests
  - Re-check `serialPort` name (COM changes after re-pairing), and baud rate.
  - Make sure no other program is using the COM port (close other POS software).
  - Power-cycle the printer and retry.

- Drawer doesn’t open
  - Ensure the printer has a DK/RJ11 drawer port and the drawer cable is connected to it.
  - Swap `drawer.pin` between 0 and 1; increase `t1/t2` to 120–200.
  - If the printer has no DK port (common for mobile printers), use a DK-capable printer or a USB drawer trigger box.

- Bluetooth SPP specifics
  - If the Outgoing COM disappears or changes, re-add it and update `serialPort` in config.
  - Keep only one host connected to the printer (SPP is typically single-client).

## Reference endpoints

- Printer status: `GET /api/printer/status`
- Test print: `POST /api/printer/test`
- Open drawer: `POST /api/printer/open-drawer`
- Print specific order: `POST /api/printer/print/:orderId`
- Print + open drawer for specific order: `POST /api/printer/print-and-open/:orderId`

## Notes for maintainers

- We intentionally do NOT use the native Windows "printer" module; it’s unstable across Node versions. We compose ESC/POS with `node-thermal-printer` and send via `serialport` (hybrid).
- For TCP printers, set `tcpHost` and the app will use `node-thermal-printer`’s network interface.
- If you change the Node version, keep it at 20+ (Baileys requirement). Reinstall node modules if you switch.
