# Custom Price Feature

## Overview
This feature allows users to set custom prices for individual items in invoices while keeping the original product prices unchanged. The custom prices are specific to each invoice and user session.

## Features

### 1. Custom Price Editing During Invoice Creation
- Users can set custom prices while creating new invoices
- Custom price input field next to each product in the create invoice page
- Visual indicators (red color and star icon ⭐) for custom prices
- Reset button (🔄) to restore default prices
- Real-time calculation updates based on custom prices

### 2. Custom Price Editing for Existing Invoices
- Users can edit prices directly in the invoice detail view
- Custom prices are visually distinguished with a red color and star icon (⭐)
- Original product prices remain unchanged in the products table

### 3. Price Reset Functionality
- Users can reset custom prices back to the original product price
- Reset button (🔄) appears next to custom prices in edit mode
- One-click reset functionality

### 4. Visual Indicators
- Custom prices are displayed in red color
- Star icon (⭐) indicates custom pricing
- Original prices remain in normal color

### 5. Offline Support
- Custom prices work offline and sync when connection is restored
- Local cache stores custom price changes immediately
- Sync queue handles price updates when online

## Database Changes

### New Column
- `invoice_items.custom_price` (DECIMAL(10,2), NULL)
  - Stores the custom price for the invoice item
  - NULL means use the original product price
  - Indexed for better performance

### Migration
Run the `database_migration.sql` script to add the required column:

```sql
ALTER TABLE invoice_items 
ADD COLUMN custom_price DECIMAL(10,2) NULL;
```

## Technical Implementation

### Frontend Changes
1. **CreateInvoicePage.jsx**: Enhanced with custom price editing during invoice creation
2. **InvoiceDetailPage.jsx**: Enhanced price editing with custom price indicators
3. **Visual feedback**: Red color and star icon for custom prices
4. **Reset functionality**: Button to restore original prices

### Backend Changes
1. **invoicesService.js**: Enhanced `createInvoice()` and `updateInvoiceItemPrice()` functions
2. **Enhanced data fetching**: Includes custom prices in invoice data
3. **Offline sync**: Support for custom price synchronization

### Cache Updates
1. **cache.js**: Enhanced `putInvoiceItemToCache()` function
2. **sync.js**: Updated sync logic to handle custom prices

## Usage Guide

### Creating an Invoice with Custom Prices
1. Go to the Create Invoice page
2. Select products and set quantities
3. For any product, you can:
   - Leave the price field empty to use the default product price
   - Enter a custom price in the price input field
   - Use the reset button (🔄) to restore the default price
4. Custom prices are highlighted in red with a star icon (⭐)
5. The invoice total is calculated using custom prices where set
6. Create the invoice - custom prices will be saved

### Editing an Existing Invoice
1. Go to the Invoice Detail page
2. Click "Edit" to enter edit mode
3. Modify prices as needed:
   - Custom prices are shown in red
   - Use the reset button to restore original prices
4. Save changes

## Benefits
- **Flexibility**: Set different prices for the same product in different invoices
- **Pricing Strategy**: Support for discounts, bulk pricing, or special rates
- **Data Integrity**: Original product prices remain unchanged
- **User Experience**: Clear visual indicators and easy reset functionality
- **Offline Support**: Works seamlessly in offline mode

## Technical Notes
- Custom prices are stored per invoice item, not per product
- The system maintains backward compatibility with existing invoices
- All calculations (totals, subtotals) use custom prices when available
- The feature works with the existing stock management system

