/**
 * Button Helper for WhatsApp Interactive Buttons
 * Quick fix version
 */

class ButtonHelper {
    /**
     * Create button message
     */
    static createButtons(text, buttons, footer = '') {
        return {
            text: text,
            footer: footer,
            buttons: buttons.map((btn, index) => ({
                buttonId: btn.id || `btn_${index}`,
                buttonText: { displayText: btn.text },
                type: 1
            })),
            headerType: 1
        };
    }

    /**
     * Create list message
     */
    static createList(text, buttonText, sections, title = '', footer = '') {
        return {
            text: text,
            footer: footer,
            title: title,
            buttonText: buttonText,
            sections: sections
        };
    }

    /**
     * Get button response from message
     */
    static getButtonResponse(msg) {
        // Button response
        if (msg.message?.buttonsResponseMessage) {
            return msg.message.buttonsResponseMessage.selectedButtonId;
        }
        
        // List response
        if (msg.message?.listResponseMessage) {
            return msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        }

        // Template button response
        if (msg.message?.templateButtonReplyMessage) {
            return msg.message.templateButtonReplyMessage.selectedId;
        }

        return null;
    }

    /**
     * Check if message is button response
     */
    static isButtonResponse(msg) {
        return !!(
            msg.message?.buttonsResponseMessage ||
            msg.message?.listResponseMessage ||
            msg.message?.templateButtonReplyMessage
        );
    }
}

module.exports = ButtonHelper;