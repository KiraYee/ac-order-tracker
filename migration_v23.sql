alter table acceptance_forms
  add column if not exists signature_x_ratio numeric,
  add column if not exists signature_y_ratio numeric,
  add column if not exists signature_width_ratio numeric default 0.34;