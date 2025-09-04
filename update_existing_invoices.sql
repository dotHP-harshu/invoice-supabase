-- Script to update existing invoice items with proper custom_price values
-- This ensures that existing invoices work correctly with the custom price feature

-- First, let's see what we have in the invoice_items table
SELECT 
    ii.id,
    ii.invoice_id,
    ii.product_id,
    ii.quantity,
    ii.custom_price,
    p.price as product_price
FROM invoice_items ii
JOIN products p ON ii.product_id = p.id
LIMIT 10;

-- Update existing invoice items to have NULL custom_price (meaning use default product price)
-- This ensures that existing invoices use the original product prices
UPDATE invoice_items 
SET custom_price = NULL 
WHERE custom_price IS NULL;

-- Verify the update worked
SELECT 
    COUNT(*) as total_items,
    COUNT(CASE WHEN custom_price IS NULL THEN 1 END) as items_with_null_custom_price,
    COUNT(CASE WHEN custom_price IS NOT NULL THEN 1 END) as items_with_custom_price
FROM invoice_items;

-- Show a sample of updated data
SELECT 
    ii.id,
    ii.invoice_id,
    ii.product_id,
    ii.quantity,
    ii.custom_price,
    p.price as product_price,
    CASE 
        WHEN ii.custom_price IS NULL THEN p.price 
        ELSE ii.custom_price 
    END as final_price
FROM invoice_items ii
JOIN products p ON ii.product_id = p.id
LIMIT 10;
