alter table orders
  add column if not exists acceptance_signed_pdf_url text;