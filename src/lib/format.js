export const t = (v, d = 1) =>
  v == null || Number.isNaN(+v) ? '–' : (+v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 });

export function inr(v) {
  if (v == null || Number.isNaN(+v)) return '–';
  const n = +v;
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export const SCOPE_COLOR = { 1: 'var(--s1)', 2: 'var(--s2)', 3: 'var(--s3)' };
export const SCOPE_HEX = { 1: '#F08A4B', 2: '#F2CF5B', 3: '#6FB7D9' };
export const SCOPE_NAME = { 1: 'Scope 1, burned on site', 2: 'Scope 2, electricity bought', 3: 'Scope 3, value chain' };

export const FIELDS = [
  { key: 'electricity', label: 'Electricity', unit: 'kWh', scope: 2, hint: 'Add up "units consumed" from your electricity bills.' },
  { key: 'natural_gas', label: 'Natural gas / PNG', unit: 'm³', scope: 1, hint: 'SCM on your gas bill.' },
  { key: 'petrol', label: 'Petrol', unit: 'litres', scope: 1, hint: 'Company cars and two-wheelers.' },
  { key: 'diesel', label: 'Diesel', unit: 'litres', scope: 1, hint: 'Trucks, vans and DG sets.' },
  { key: 'air_travel', label: 'Business flights', unit: 'passenger-km', scope: 3, hint: 'Delhi–Mumbai is about 1,150 km one way.' },
  { key: 'hotels', label: 'Hotel stays', unit: 'room-nights', scope: 3, hint: 'Nights booked for work trips.' },
  { key: 'commuting', label: 'Employee commuting', unit: 'passenger-km', scope: 3, hint: 'Employees × km per day × 2 × working days.' },
  { key: 'waste', label: 'Waste to landfill', unit: 'kg', scope: 3, hint: 'From your waste contractor\'s manifests.' },
];

export const INDUSTRIES = ['technology', 'manufacturing', 'retail', 'logistics', 'healthcare', 'education', 'hospitality', 'construction', 'finance', 'agriculture', 'general'];
