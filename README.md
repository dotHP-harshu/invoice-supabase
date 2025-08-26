## Invoice Manager (Supabase + React + Tailwind)

Full‑stack invoice and product manager using Supabase (Postgres, Realtime) and React.

### 1) Prerequisites
- Node 18+
- A Supabase project

### 2) Environment
Create a `.env.local` at the project root:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3) Install & Run

```
npm install
npm run dev
```

### 4) Supabase Schema
Run this SQL in the Supabase SQL editor:

```sql
-- tables
create table if not exists public.products (
  id serial primary key,
  name text not null,
  price numeric not null,
  stock integer not null
);

create table if not exists public.invoices (
  id serial primary key,
  customer_name text not null,
  created_at timestamp default now()
);

create table if not exists public.invoice_items (
  id serial primary key,
  invoice_id integer references public.invoices(id) on delete cascade,
  product_id integer references public.products(id),
  quantity integer not null
);

-- realtime
alter publication supabase_realtime add table products, invoices, invoice_items;

-- stock helpers
create or replace function public.decrement_stock(p_product_id int, p_qty int)
returns void as $$
begin
  update public.products
  set stock = stock - p_qty
  where id = p_product_id;
end; $$ language plpgsql security definer;

create or replace function public.increment_stock(p_product_id int, p_qty int)
returns void as $$
begin
  update public.products
  set stock = stock + p_qty
  where id = p_product_id;
end; $$ language plpgsql security definer;
```

Optionally add Row Level Security (RLS) and policies if you enable Auth.

### 5) Features
- Product CRUD with realtime updates
- Create invoices with stock validation and automatic stock decrement
- Invoices list, detail view, search
- Export invoice to CSV/PDF
- Delete invoice with stock restoration

### 6) Optional Auth
- Enable Supabase Auth, add RLS policies, and gate routes/components as needed.
