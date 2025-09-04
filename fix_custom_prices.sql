-- Comprehensive script to fix custom price functionality
-- Run this in your Supabase SQL Editor

-- Step 1: Check current state of invoice_items table
SELECT 
    'Current state of invoice_items table' as info,
    COUNT(*) as total_items,
    COUNT(CASE WHEN custom_price IS NULL THEN 1 END) as items_with_null_custom_price,
    COUNT(CASE WHEN custom_price IS NOT NULL THEN 1 END) as items_with_custom_price
FROM invoice_items;

-- Step 2: Show sample data before fix
SELECT 
    'Sample data before fix' as info,
    ii.id,
    ii.invoice_id,
    ii.product_id,
    ii.quantity,
    ii.custom_price,
    p.price as product_price,
    CASE 
        WHEN ii.custom_price IS NULL THEN p.price 
        ELSE ii.custom_price 
    END as effective_price
FROM invoice_items ii
JOIN products p ON ii.product_id = p.id
LIMIT 5;

-- Step 3: Ensure all existing items have NULL custom_price (meaning use default product price)
-- This is the correct state for items that should use the original product price
UPDATE invoice_items 
SET custom_price = NULL 
WHERE custom_price IS NULL;

-- Step 4: Verify the fix worked
SELECT 
    'After fix - invoice_items summary' as info,
    COUNT(*) as total_items,
    COUNT(CASE WHEN custom_price IS NULL THEN 1 END) as items_with_null_custom_price,
    COUNT(CASE WHEN custom_price IS NOT NULL THEN 1 END) as items_with_custom_price
FROM invoice_items;

-- Step 5: Show sample data after fix
SELECT 
    'Sample data after fix' as info,
    ii.id,
    ii.invoice_id,
    ii.product_id,
    ii.quantity,
    ii.custom_price,
    p.price as product_price,
    CASE 
        WHEN ii.custom_price IS NULL THEN p.price 
        ELSE ii.custom_price 
    END as effective_price
FROM invoice_items ii
JOIN products p ON ii.product_id = p.id
LIMIT 5;

-- Step 6: Test query that matches the application logic
SELECT 
    'Test query matching application logic' as info,
    ii.id,
    ii.product_id,
    ii.quantity,
    p.name as product_name,
    p.price as original_price,
    ii.custom_price,
    CASE 
        WHEN ii.custom_price IS NULL THEN p.price 
        ELSE ii.custom_price 
    END as final_price,
    CASE 
        WHEN ii.custom_price IS NULL THEN 'Default'
        ELSE 'Custom'
    END as price_type
FROM invoice_items ii
JOIN products p ON ii.product_id = p.id
LIMIT 10;

-- Step 7: Verify the custom_price column exists and has correct structure
SELECT 
    'Column structure verification' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'invoice_items' AND column_name = 'custom_price';
