-- Migration to add custom_price column to invoice_items table
-- This allows users to set custom prices for specific invoice items
-- while keeping the original product price unchanged

-- Add custom_price column to invoice_items table
ALTER TABLE invoice_items 
ADD COLUMN custom_price DECIMAL(10,2) NULL;

-- Add comment to explain the column purpose
COMMENT ON COLUMN invoice_items.custom_price IS 'Custom price set by user for this specific invoice item. If NULL, uses the product''s original price.';

-- Create index for better performance when querying by custom_price
CREATE INDEX idx_invoice_items_custom_price ON invoice_items(custom_price) WHERE custom_price IS NOT NULL;

