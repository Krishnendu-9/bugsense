import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react';

export default function StatsCard({ title, value, icon: Icon, color = 'text-primary', trend, subtitle, to, onClick }) {
  const trendIcon = trend > 0
    ? <TrendingUp size={12} className="text-priority-low" />
    : trend < 0
    ? <TrendingDown size={12} className="text-priority-high" />
    : <Minus size={12} className="text-muted" />;

  const isClickable = Boolean(to || onClick);

  const cardContent = (
    <div
      className={`glass-card glass-card-hover p-5 relative overflow-hidden group transition-all duration-200 ${
        isClickable
          ? 'cursor-pointer hover:border-primary/50 hover:shadow-glow-primary active:scale-[0.98]'
          : ''
      }`}
    >
      {/* Subtle corner light flare */}
      <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none group-hover:bg-primary/25 transition-all duration-300" />

      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-muted tracking-wide uppercase group-hover:text-text-base transition-colors">
            {title}
          </p>
          {isClickable && (
            <ArrowUpRight size={13} className="text-muted/40 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          )}
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] group-hover:border-primary/40 group-hover:scale-105 transition-all duration-200 ${color}`}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <p className="text-3xl font-extrabold text-text-base tracking-tight mb-1 font-sans">
        {value ?? 0}
      </p>

      <div className="flex items-center justify-between gap-1.5 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          {trend !== undefined && trendIcon}
          {subtitle && <span className="text-[11px] text-muted/80">{subtitle}</span>}
        </div>
        {isClickable && (
          <span className="text-[10px] font-mono text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            Filter →
          </span>
        )}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to} className="block no-underline">{cardContent}</Link>;
  }

  if (onClick) {
    return <div onClick={onClick}>{cardContent}</div>;
  }

  return cardContent;
}
