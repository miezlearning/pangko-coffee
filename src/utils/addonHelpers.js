const DEFAULT_SKIP_KEYWORDS = ['skip', 'tidak', 'ga', 'nggak', 'gak', 'no', '-'];

function formatNumber(num) {
    const value = Number.isFinite(Number(num)) ? Number(num) : 0;
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getAddonUnitPrice(addon) {
    if (!addon) return 0;
    if (addon.unitPrice !== undefined && addon.unitPrice !== null) {
        return Number(addon.unitPrice) || 0;
    }
    if (addon.priceOverride !== undefined && addon.priceOverride !== null) {
        return Number(addon.priceOverride) || 0;
    }
    if (addon.price !== undefined && addon.price !== null) {
        return Number(addon.price) || 0;
    }
    if (addon.basePrice !== undefined && addon.basePrice !== null) {
        return Number(addon.basePrice) || 0;
    }
    return 0;
}

function computeMenuUnitPrice(item) {
    // No discount system - just return the base price
    return Number(item.price || 0);
}

function normalizeAddons(addons = [], { includeIndex = false } = {}) {
    let runningIndex = 1;
    return addons
        .filter(addon => addon && addon.isActive !== false)
        .map(addon => {
            const normalized = {
                id: String(addon.id),
                name: addon.name,
                unitPrice: getAddonUnitPrice(addon),
                minQuantity: Number.isFinite(Number(addon.minQuantity)) ? Number(addon.minQuantity) : 0,
                maxQuantity: Number.isFinite(Number(addon.maxQuantity)) ? Number(addon.maxQuantity) : null,
                defaultQuantity: Number.isFinite(Number(addon.defaultQuantity)) ? Number(addon.defaultQuantity) : null,
                isRequired: !!addon.isRequired
            };
            if (includeIndex) {
                normalized.index = runningIndex++;
            }
            return normalized;
        });
}

function cloneAddonSelections(addonSelections = []) {
    return addonSelections.map(addon => ({
        id: addon.id,
        name: addon.name,
        quantity: Number(addon.quantity || 0),
        unitPrice: Number(addon.unitPrice || 0)
    }));
}

function buildCartItem(item, addonSelections = [], { baseUnitPrice } = {}) {
    const basePrice = baseUnitPrice !== undefined ? baseUnitPrice : computeMenuUnitPrice(item);
    const safeSelections = cloneAddonSelections(addonSelections).filter(addon => addon.quantity > 0);
    const addonsTotal = safeSelections.reduce((sum, addon) => sum + addon.unitPrice * addon.quantity, 0);
    const keyPart = safeSelections
        .map(addon => `${addon.id}:${addon.quantity}`)
        .sort()
        .join('|');

    return {
        id: String(item.id),
        name: item.name,
        price: basePrice + addonsTotal,
        basePrice,
        addons: safeSelections,
        cartKey: keyPart ? `${item.id}::${keyPart}` : String(item.id)
    };
}

function describeAddonOption(addon) {
    const pricePart = `Rp ${formatNumber(addon.unitPrice)}`;
    const min = addon.minQuantity || 0;
    const max = addon.maxQuantity;
    const requirements = [];
    if (addon.isRequired && min > 0) requirements.push(`wajib min ${min}`);
    else if (min > 0) requirements.push(`min ${min}`);
    if (max !== null && max !== undefined) requirements.push(`maks ${max}`);
    const reqText = requirements.length ? ` (${requirements.join(', ')})` : '';
    return `${addon.index ? addon.index + '. ' : ''}${addon.name} – ${pricePart}${reqText}`;
}

function formatAddonLines(addons = []) {
    if (!Array.isArray(addons) || addons.length === 0) return '';
    return addons
        .map(addon => {
            const total = (addon.unitPrice || addon.price || 0) * addon.quantity;
            return `   ➕ ${addon.name} x${addon.quantity} (Rp ${formatNumber(total)})`;
        })
        .join('\n');
}

function parseAddonSelectionInput(text, availableAddons, { skipKeywords = DEFAULT_SKIP_KEYWORDS } = {}) {
    if (!availableAddons || availableAddons.length === 0) {
        return { selections: [], errors: [], skipped: true };
    }

    const input = (text || '').trim();
    const lowerText = input.toLowerCase();
    const isSkip = skipKeywords.includes(lowerText);

    const tokens = isSkip ? [] : input.split(/[\,\n]/).map(t => t.trim()).filter(Boolean);
    const addonById = new Map();
    const addonByIndex = new Map();
    availableAddons.forEach(addon => {
        addonById.set(addon.id.toLowerCase(), addon);
        if (addon.index !== undefined) {
            addonByIndex.set(addon.index, addon);
        }
    });

    const quantities = new Map();
    const errors = [];

    tokens.forEach(token => {
        if (!token) return;
        let keyPart = token;
        let qtyPart = null;
        const operatorMatch = token.match(/[:=x]/i);
        if (operatorMatch) {
            const [k, q] = token.split(operatorMatch[0]);
            keyPart = k.trim();
            qtyPart = q.trim();
        }

        let addon = null;
        if (/^\d+$/.test(keyPart)) {
            addon = addonByIndex.get(Number(keyPart));
        } else {
            addon = addonById.get(keyPart.toLowerCase());
        }

        if (!addon) {
            errors.push(`Add-on '${token}' tidak dikenali`);
            return;
        }

        let qty = qtyPart !== null && qtyPart !== undefined && qtyPart !== '' ? Number(qtyPart) : null;
        if (qty === null || Number.isNaN(qty)) {
            qty = addon.minQuantity > 0 ? addon.minQuantity : 1;
        }
        if (qty < 0) {
            errors.push(`Jumlah untuk ${addon.name} tidak boleh negatif`);
            return;
        }
        quantities.set(addon.id, qty);
    });

    const selections = [];
    availableAddons.forEach(addon => {
        let qty;
        if (quantities.has(addon.id)) {
            qty = quantities.get(addon.id);
        } else if (addon.defaultQuantity !== null && addon.defaultQuantity !== undefined) {
            qty = addon.defaultQuantity;
        } else {
            qty = addon.minQuantity;
        }

        if (addon.isRequired && qty < addon.minQuantity) {
            errors.push(`${addon.name} minimal ${addon.minQuantity}`);
            return;
        }
        if (addon.maxQuantity !== null && addon.maxQuantity !== undefined && qty > addon.maxQuantity) {
            errors.push(`${addon.name} maksimal ${addon.maxQuantity}`);
            return;
        }

        if (qty > 0) {
            selections.push({
                id: addon.id,
                name: addon.name,
                quantity: qty,
                unitPrice: addon.unitPrice
            });
        }
    });

    return { selections, errors, skipped: isSkip };
}

function resolveRequestedAddonPayload(requestedAddons = [], availableAddons = []) {
    if (!availableAddons.length) return { selections: [], errors: [] };

    const availableMap = new Map(availableAddons.map(addon => [addon.id.toLowerCase(), addon]));
    const requestedQuantities = new Map();
    const errors = [];

    requestedAddons.forEach(req => {
        if (!req || !req.id) return;
        const key = String(req.id).toLowerCase();
        const addon = availableMap.get(key);
        if (!addon) {
            errors.push(`Add-on ${req.id} tidak tersedia untuk menu ini`);
            return;
        }
        const qty = Math.max(0, Number(req.quantity ?? req.qty ?? 0));
        requestedQuantities.set(addon.id, qty);
    });

    const selections = [];
    availableAddons.forEach(addon => {
        let qty;
        if (requestedQuantities.has(addon.id)) {
            qty = requestedQuantities.get(addon.id);
        } else if (addon.defaultQuantity !== null && addon.defaultQuantity !== undefined) {
            qty = addon.defaultQuantity;
        } else {
            qty = addon.minQuantity;
        }

        qty = Number.isFinite(Number(qty)) ? Number(qty) : 0;

        if (addon.isRequired && qty < addon.minQuantity) {
            errors.push(`${addon.name} minimal ${addon.minQuantity}`);
            return;
        }
        if (addon.maxQuantity !== null && addon.maxQuantity !== undefined && qty > addon.maxQuantity) {
            errors.push(`${addon.name} maksimal ${addon.maxQuantity}`);
            return;
        }
        if (qty > 0) {
            selections.push({
                id: addon.id,
                name: addon.name,
                quantity: qty,
                unitPrice: addon.unitPrice
            });
        }
    });

    return { selections, errors };
}

module.exports = {
    formatNumber,
    computeMenuUnitPrice,
    normalizeAddons,
    buildCartItem,
    describeAddonOption,
    formatAddonLines,
    parseAddonSelectionInput,
    resolveRequestedAddonPayload,
    cloneAddonSelections
};
