import React from 'react';

export default function Slider({ label, value, onChange, min = 0, max = 100, step = 1, unit = '%' }) {
  return (
    <label className="carbon-slider">
      <span className="carbon-slider-label">
        <span>{label}</span>
        <strong>{value}{unit}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </label>
  );
}
