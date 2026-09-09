import React from 'react';
import Badge from '../common/Badge';

/** Gray \"Archived\" marker shown on archived listings. */
export default function ArchiveBadge({ style }: { style?: object }) {
  return <Badge label="Archived" variant="neutral" size="sm" style={style} />;
}