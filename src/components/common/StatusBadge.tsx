import React from 'react';
import { ViewStyle } from 'react-native';
import Badge from './Badge';
import { PropertyStatus } from '../../types';

interface StatusBadgeProps {
  status: PropertyStatus;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const STATUS_META: Record<
  PropertyStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }
> = {
  active: { label: 'Active', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  sold: { label: 'Sold', variant: 'error' },
  rented: { label: 'Rented', variant: 'error' },
  inactive: { label: 'Inactive', variant: 'neutral' },
};

/** Color-coded availability badge: Active green, Pending yellow, Sold red, Inactive gray. */
export default function StatusBadge({
  status,
  size = 'sm',
  style,
}: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.inactive;
  return <Badge label={meta.label} variant={meta.variant} size={size} style={style} />;
}