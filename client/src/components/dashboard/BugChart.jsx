import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Filter } from 'lucide-react';
import { CHART_COLORS, STATUS_CHART_COLORS } from '../../utils/constants.js';
import { capitalize } from '../../utils/helpers.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111827]/95 border border-white/10 rounded-xl px-3.5 py-2 shadow-2xl backdrop-blur-md">
      {label && <p className="text-xs font-semibold text-text-base mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i}>
          <p className="text-xs font-bold font-mono" style={{ color: entry.color || entry.fill }}>
            {entry.name}: {entry.value}
          </p>
          <p className="text-[10px] text-primary font-medium mt-1 flex items-center gap-1">
            Click to view incidents →
          </p>
        </div>
      ))}
    </div>
  );
};

export function PriorityBarChart({ data = [] }) {
  const navigate = useNavigate();

  const chartData = data.map((item) => ({
    name: capitalize(item._id),
    priorityKey: (item._id || '').toLowerCase(),
    count: item.count,
  }));

  const handleBarClick = (entry) => {
    const key = entry?.priorityKey || entry?.name?.toLowerCase();
    if (key) {
      navigate(`/bugs?priority=${encodeURIComponent(key)}`);
    }
  };

  return (
    <div className="glass-card glass-card-hover p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-base">Bugs by Priority</h3>
        <span className="text-[10px] font-mono text-muted/60 flex items-center gap-1">
          <Filter size={10} /> Click bar to filter
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={chartData}
          margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }} />
          <Bar
            dataKey="count"
            name="Bugs"
            radius={[6, 6, 0, 0]}
            onClick={handleBarClick}
            className="cursor-pointer"
          >
            {chartData.map((_, index) => (
              <Cell
                key={index}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusPieChart({ data = {} }) {
  const navigate = useNavigate();

  const chartData = Object.entries(STATUS_CHART_COLORS)
    .map(([key, color]) => ({
      key,
      name: key === 'in-progress' ? 'In Progress' : capitalize(key),
      value: data[key] || 0,
      color,
    }))
    .filter((d) => d.value > 0);

  const handlePieClick = (entry) => {
    if (entry && entry.key) {
      navigate(`/bugs?status=${encodeURIComponent(entry.key)}`);
    }
  };

  if (!chartData.length) {
    return (
      <div className="glass-card p-6 flex items-center justify-center h-full">
        <p className="text-muted text-sm">No data yet</p>
      </div>
    );
  }

  return (
    <div className="glass-card glass-card-hover p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-base">Bugs by Status</h3>
        <span className="text-[10px] font-mono text-muted/60 flex items-center gap-1">
          <Filter size={10} /> Click slice to filter
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={4}
            dataKey="value"
            onClick={handlePieClick}
            className="cursor-pointer"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.color}
                className="cursor-pointer hover:opacity-80 transition-opacity stroke-[#0B0F19] stroke-2"
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value, entry) => (
              <span
                onClick={() => handlePieClick(entry.payload)}
                className="text-xs text-muted hover:text-text-base cursor-pointer transition-colors"
              >
                {value}
              </span>
            )}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
