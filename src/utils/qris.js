/**
 * QRIS Dynamic Generator
 * Mengubah QRIS static menjadi QRIS dengan nominal dinamis
 */

class QRISGenerator {
    /**
     * Convert QRIS static to dynamic with specific amount
     * @param {string} qris - QRIS static code
     * @param {number} nominal - Amount in IDR
     * @param {string} feeOption - Fee type: 'rupiah' or 'percent'
     * @param {number} feeAmount - Fee amount
     * @returns {string} - Dynamic QRIS code
     */
    static convertQRIS(qris, nominal, feeOption = null, feeAmount = null) {
        let tax = '';
        
        // Calculate fee/tax if provided
        if (feeOption === 'rupiah' && feeAmount) {
            const feeStr = String(feeAmount);
            tax = '55020256' + String(feeStr.length).padStart(2, '0') + feeStr;
        } else if (feeOption === 'percent' && feeAmount) {
            const feeStr = String(feeAmount);
            tax = '55020357' + String(feeStr.length).padStart(2, '0') + feeStr;
        }

        // Remove CRC (last 4 characters)
        qris = qris.substring(0, qris.length - 4);
        
        // Change from static (010211) to dynamic (010212)
        const step1 = qris.replace('010211', '010212');
        
        // Split by country code
        const step2 = step1.split('5802ID');
        
        // Format nominal amount
        const nominalStr = String(nominal);
        let uang = '54' + String(nominalStr.length).padStart(2, '0') + nominalStr;
        
        // Add tax if exists
        if (!tax) {
            uang += '5802ID';
        } else {
            uang += tax + '5802ID';
        }
        
        // Combine all parts
        const fix = step2[0] + uang + step2[1];
        
        // Calculate new CRC
        const crc = this.convertCRC16(fix);
        
        return fix + crc;
    }

    /**
     * Calculate CRC16 checksum for QRIS
     * @param {string} str - String to calculate CRC
     * @returns {string} - CRC16 checksum (4 characters)
     */
    static convertCRC16(str) {
        let crc = 0xffff;
        const strlen = str.length;
        
        for (let c = 0; c < strlen; c++) {
            crc ^= str.charCodeAt(c) << 8;
            
            for (let i = 0; i < 8; i++) {
                if (crc & 0x8000) {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc = crc << 1;
                }
            }
        }
        
        let hex = (crc & 0xffff).toString(16).toUpperCase();
        
        // Pad with 0 if length is 3
        if (hex.length === 3) {
            hex = '0' + hex;
        }
        
        return hex;
    }

    /**
     * Generate QRIS for order with optional service fee
     * @param {string} staticQRIS - Base static QRIS
     * @param {number} amount - Order amount
     * @param {object} feeConfig - Fee configuration {enabled, type, amount}
     * @returns {string} - Dynamic QRIS
     */
    static generateOrderQRIS(staticQRIS, amount, feeConfig = {}) {
        if (!feeConfig.enabled) {
            return this.convertQRIS(staticQRIS, amount);
        }

        return this.convertQRIS(
            staticQRIS,
            amount,
            feeConfig.type,
            feeConfig.amount
        );
    }

    /**
     * Calculate total amount with fee
     * @param {number} subtotal - Subtotal amount
     * @param {object} feeConfig - Fee configuration
     * @returns {number} - Total amount
     */
    static calculateTotal(subtotal, feeConfig = {}) {
        if (!feeConfig.enabled) {
            return subtotal;
        }

        if (feeConfig.type === 'rupiah') {
            return subtotal + feeConfig.amount;
        } else if (feeConfig.type === 'percent') {
            const fee = Math.round(subtotal * (feeConfig.amount / 100));
            return subtotal + fee;
        }

        return subtotal;
    }

    /**
     * Validate QRIS format
     * @param {string} qris - QRIS code to validate
     * @returns {boolean} - Is valid QRIS
     */
    static validateQRIS(qris) {
        if (!qris || typeof qris !== 'string') {
            return false;
        }

        // QRIS should start with 00020101 or 00020102
        if (!qris.startsWith('000201')) {
            return false;
        }

        // QRIS should contain Indonesia country code
        if (!qris.includes('5802ID')) {
            return false;
        }

        // QRIS minimum length
        if (qris.length < 100) {
            return false;
        }

        return true;
    }
}

module.exports = QRISGenerator;